"""Análisis de audio para el motor de video.

Uso: uv run python analyze.py <audio> <salida.json> [--plots dir]

Calcula:
- tempo constante y rejilla de tiempos/compases (la música electrónica no varía de tempo),
- golpes por banda: bombo (graves), caja/palmas (medios), charles (agudos),
- envolventes 0..1 a 60 Hz: rms, low, mid, high y voz,
- energía por compás (para marcar intro, build-up, drop y break),
- voz aislada con REPET-SIM (filtro de vecinos más cercanos) y sus ataques.
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 512
ENV_RATE = 60


def norm(x: np.ndarray, pct: float = 99.0) -> np.ndarray:
    hi = np.percentile(x, pct)
    return np.clip(x / (hi + 1e-9), 0, 1)


def band_rms(S: np.ndarray) -> np.ndarray:
    """RMS por fotograma de un trozo del espectrograma."""
    return np.sqrt(np.mean(S**2, axis=0))


def band_flux(S: np.ndarray, freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
    band = S[(freqs >= lo) & (freqs < hi)]
    flux = np.maximum(0, np.diff(np.log1p(band * 100), axis=1)).sum(axis=0)
    return np.concatenate([[0], flux])


def resample_env(env: np.ndarray, duration: float) -> list[float]:
    t_src = librosa.frames_to_time(np.arange(len(env)), sr=SR, hop_length=HOP)
    t_dst = np.arange(0, duration, 1 / ENV_RATE)
    return [round(float(v), 3) for v in np.interp(t_dst, t_src, env)]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--plots")
    args = ap.parse_args()

    y, _ = librosa.load(args.audio, sr=SR, mono=True)
    duration = len(y) / SR
    print(f"duración {duration:.2f} s")

    # Tempo: seguimiento de golpes y ajuste a una rejilla constante por mínimos cuadrados.
    onset_env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=SR, hop_length=HOP, tightness=400)
    beat_times = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)
    idx = np.arange(len(beat_times))
    period, offset = np.polyfit(idx, beat_times, 1)
    for _ in range(3):  # descarta golpes atípicos y reajusta
        resid = beat_times - (offset + period * idx)
        keep = np.abs(resid) < 0.06
        period, offset = np.polyfit(idx[keep], beat_times[keep], 1)
    bpm = 60 / period
    first = offset - period * np.floor(offset / period)
    beats = np.arange(first, duration, period)
    print(f"tempo {bpm:.3f} BPM, primer golpe {first:.3f} s")

    # Espectro y golpes por banda.
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    times = librosa.frames_to_time(np.arange(S.shape[1]), sr=SR, hop_length=HOP)

    def events(flux: np.ndarray, delta: float) -> list[float]:
        f = norm(flux)
        peaks = librosa.util.peak_pick(f, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=delta, wait=6)
        return [round(float(times[p]), 4) for p in peaks]

    kick = events(band_flux(S, freqs, 30, 150), 0.12)
    snare = events(band_flux(S, freqs, 1500, 5000), 0.12)
    hat = events(band_flux(S, freqs, 7000, 11000), 0.1)

    # Compases: la fase del 1 es la que concentra más bombos fuertes en los cambios de sección.
    low_rms = band_rms(S[freqs < 150])
    rms = band_rms(S)
    phase_score = []
    for ph in range(4):
        bar_starts = beats[ph::4]
        e = np.interp(bar_starts, times, onset_env)
        phase_score.append(float(np.mean(e)))
    phase = int(np.argmax(phase_score))
    downbeats = beats[phase::4]

    # Voz: REPET-SIM. Lo repetitivo (base) se estima con la mediana de fotogramas parecidos;
    # lo que sobra (primer plano) es sobre todo voz.
    S_full, phase_stft = librosa.magphase(librosa.stft(y, n_fft=2048, hop_length=HOP))
    S_filter = librosa.decompose.nn_filter(
        S_full, aggregate=np.median, metric="cosine", width=int(librosa.time_to_frames(2, sr=SR, hop_length=HOP))
    )
    S_filter = np.minimum(S_full, S_filter)
    mask_v = librosa.util.softmask(S_full - S_filter, 10 * S_filter, power=2)
    S_vocal = mask_v * S_full
    voice_band = (freqs >= 250) & (freqs < 4000)
    vocal_env = band_rms(S_vocal[voice_band])
    vocal_onsets = events(band_flux(S_vocal, freqs, 250, 4000), 0.08)

    # Energía por compás (para etiquetar secciones a mano).
    bars = []
    for i, b0 in enumerate(downbeats):
        b1 = b0 + 4 * period
        sel = (times >= b0) & (times < b1)
        if not sel.any():
            continue
        bars.append(
            {
                "i": i,
                "t": round(float(b0), 3),
                "rms": round(float(np.mean(rms[sel])), 4),
                "low": round(float(np.mean(low_rms[sel])), 4),
                "vocal": round(float(np.mean(vocal_env[sel])), 4),
            }
        )

    out = {
        "duration": round(duration, 3),
        "bpm": round(float(bpm), 4),
        "beatPeriod": round(float(period), 6),
        "firstBeat": round(float(first), 4),
        "downbeatPhase": phase,
        "beats": [round(float(b), 4) for b in beats],
        "downbeats": [round(float(b), 4) for b in downbeats],
        "events": {"kick": kick, "snare": snare, "hat": hat, "vocal": vocal_onsets},
        "envRate": ENV_RATE,
        "env": {
            "rms": resample_env(norm(rms), duration),
            "low": resample_env(norm(low_rms), duration),
            "mid": resample_env(norm(band_rms(S[(freqs >= 300) & (freqs < 3000)])), duration),
            "high": resample_env(norm(band_rms(S[freqs >= 6000])), duration),
            "vocal": resample_env(norm(vocal_env), duration),
        },
        "bars": bars,
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(out, separators=(",", ":")))
    print(f"{len(beats)} tiempos, {len(downbeats)} compases, {len(kick)} bombos, {len(vocal_onsets)} ataques de voz → {args.out}")

    if args.plots:
        plots(Path(args.plots), duration, times, rms, low_rms, vocal_env, downbeats, S_vocal, freqs)


def plots(d: Path, duration, times, rms, low_rms, vocal_env, downbeats, S_vocal, freqs) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    d.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(24, 6))
    ax.plot(times, norm(rms), lw=0.6, label="rms")
    ax.plot(times, norm(low_rms), lw=0.6, label="graves")
    ax.plot(times, norm(vocal_env) * 0.9 - 1.1, lw=0.6, label="voz (aislada)", color="C3")
    for i, b in enumerate(downbeats):
        ax.axvline(b, color="k", alpha=0.25 if i % 8 else 0.7, lw=0.5)
        if i % 8 == 0:
            ax.text(b, 1.05, f"c{i}\n{b:.1f}s", fontsize=7)
    ax.set_xlim(0, duration)
    ax.legend(loc="lower right")
    fig.tight_layout()
    fig.savefig(d / "overview.png", dpi=80)
    plt.close(fig)

    # Espectrograma de la voz aislada en tramos de 30 s, con segundos marcados.
    db = librosa.amplitude_to_db(S_vocal, ref=np.max)
    band = (freqs >= 100) & (freqs < 4000)
    for k in range(int(np.ceil(duration / 30))):
        t0, t1 = k * 30, min(duration, (k + 1) * 30)
        sel = (times >= t0) & (times < t1)
        fig, ax = plt.subplots(figsize=(24, 5))
        ax.imshow(db[band][:, sel], origin="lower", aspect="auto", cmap="magma", vmin=-60, vmax=0,
                  extent=[t0, t1, freqs[band][0], freqs[band][-1]])
        ax.plot(times[sel], norm(vocal_env)[sel] * 3500 + 200, color="cyan", lw=0.8)
        for b in downbeats:
            if t0 <= b < t1:
                ax.axvline(b, color="white", alpha=0.5, lw=0.6)
        ax.set_xticks(np.arange(t0, t1, 1))
        ax.tick_params(axis="x", labelsize=7)
        fig.tight_layout()
        fig.savefig(d / f"vocal_{k:02d}.png", dpi=70)
        plt.close(fig)


if __name__ == "__main__":
    main()
