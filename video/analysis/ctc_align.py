"""Afina los tiempos de la letra con alineación forzada CTC (torchaudio MMS_FA) sobre la voz aislada.

Uso: uv run python ctc_align.py <voz.wav> <lyrics.json> [--plots dir]

Whisper (align.py) acierta qué frase se canta y dónde está más o menos, pero sus tiempos por
palabra pueden desviarse varias décimas al cantar. Aquí, para cada frase, el modelo CTC recibe
el audio de la voz (separate.py) en una ventana alrededor de la estimación de Whisper y el texto
exacto, y localiza cada palabra con resolución de 20 ms. Un token comodín (*) en los bordes
absorbe lo que se cante fuera de la frase. Reescribe start/end de cada palabra y guarda los
tiempos de Whisper en whisper_start para comparar.
"""
import argparse
import json
import re
from pathlib import Path

import librosa
import numpy as np
import torch
import torchaudio

SR = 16000


def words_of(text: str) -> list[str]:
    return [re.sub(r"[^a-z']", "", w.lower().replace("’", "'")) for w in text.split()]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("vocals")
    ap.add_argument("lyrics")
    ap.add_argument("--plots")
    ap.add_argument("--pad", type=float, default=1.2, help="margen (s) alrededor de la ventana de Whisper")
    args = ap.parse_args()

    lines = json.loads(Path(args.lyrics).read_text())
    y, _ = librosa.load(args.vocals, sr=SR, mono=True)
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True).eval()
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()

    timed = [l for l in lines if not l.get("estimated")]
    report = []
    for i, line in enumerate(timed):
        ws = line.get("whisper_start", line["start"])
        we = line.get("whisper_end", line["end"])
        prev_end = timed[i - 1].get("whisper_end", timed[i - 1]["end"]) if i else 0.0
        nxt = timed[i + 1].get("whisper_start", timed[i + 1]["start"]) if i + 1 < len(timed) else len(y) / SR
        w0 = max(0.0, max(prev_end - 0.3, ws - args.pad))
        w1 = min(len(y) / SR, min(nxt + 0.3, we + args.pad))
        seg = torch.from_numpy(y[int(w0 * SR) : int(w1 * SR)]).float()[None]
        words = [w for w in words_of(line["text"]) if w]
        with torch.inference_mode():
            emission, _ = model(seg)
        tokens = tokenizer(["*"] + words + ["*"])
        spans = aligner(emission[0], tokens)[1:-1]
        ratio = seg.shape[1] / emission.shape[1] / SR
        new = []
        for w, sp in zip(line["words"], spans):
            s = w0 + sp[0].start * ratio
            e = w0 + sp[-1].end * ratio
            score = float(np.mean([t.score for t in sp]))
            new.append({**w, "whisper_start": w.get("whisper_start", w.get("start")), "start": round(s, 3), "end": round(e, 3), "score": round(score, 3)})
        if "whisper_start" not in line:
            line["whisper_start"], line["whisper_end"] = line["start"], line["end"]
        line["words"] = new
        line["start"], line["end"] = new[0]["start"], new[-1]["end"]
        shift = np.mean([w["start"] - w["whisper_start"] for w in new if w.get("whisper_start") is not None])
        conf = np.mean([w["score"] for w in new])
        report.append((line["start"], line["text"], shift, conf))

    Path(args.lyrics).write_text(json.dumps(lines, indent=1, ensure_ascii=False))
    for start, text, shift, conf in report:
        flag = "  ← revisar" if conf < 0.35 else ""
        print(f"{start:7.2f}  Δ{shift:+.2f}s  conf {conf:.2f}  {text}{flag}")
    shifts = [r[2] for r in report]
    print(f"desfase medio Whisper→CTC: {np.mean(shifts):+.3f} s (mediana {np.median(shifts):+.3f}, máx |{np.max(np.abs(shifts)):.2f}| s)")

    if args.plots:
        plots(Path(args.plots), y, timed)


def plots(d: Path, y: np.ndarray, lines: list[dict]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    d.mkdir(parents=True, exist_ok=True)
    S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=1024, hop_length=160)), ref=np.max)
    for k, line in enumerate(lines):
        t0, t1 = line["start"] - 0.6, line["end"] + 0.6
        a, b = int(t0 * SR / 160), int(t1 * SR / 160)
        fig, ax = plt.subplots(figsize=(14, 3))
        ax.imshow(S[:200, a:b], origin="lower", aspect="auto", cmap="magma", vmin=-70, vmax=0, extent=[t0, t1, 0, 200 * SR / 1024])
        for w in line["words"]:
            ax.axvline(w["start"], color="cyan", lw=1)
            ax.text(w["start"], 2900, w["w"], color="cyan", fontsize=8)
            if w.get("whisper_start") is not None:
                ax.axvline(w["whisper_start"], color="red", lw=0.8, ls="--")
        ax.set_title(f"{k:02d}  {line['text']}  (cian: CTC · rojo: Whisper)", fontsize=9)
        fig.tight_layout()
        fig.savefig(d / f"line_{k:02d}.png", dpi=60)
        plt.close(fig)


if __name__ == "__main__":
    main()
