"""Alinea una letra conocida con el audio usando Whisper.

Uso: uv run python align.py <audio> <letra.txt> <salida.json> [--model large-v3-turbo] [--rescan 138:190]

1. Whisper (faster-whisper) transcribe la voz con tiempo por palabra. La transcripción
   se guarda en caché junto a la salida (<salida>.whisper.json) para no repetirla.
2. Se emparejan las palabras reconocidas con las de la letra (orden global, SequenceMatcher):
   la letra manda sobre el texto, Whisper solo aporta los tiempos.
3. Las palabras sin pareja se interpolan entre sus vecinas; las frases sin ninguna pareja
   se marcan como `estimated` para que el video use su posición en la rejilla de compases.
"""
import argparse
import difflib
import json
import re
from pathlib import Path


def norm(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("’", "'"))


def similarity(x: str, y: str) -> float:
    if not x or not y:
        return 0.0
    return 1.0 if x == y else difflib.SequenceMatcher(a=x, b=y).ratio()


def dp_align(a: list[str], b: list[str], heard: list[dict]) -> list[tuple[float, float] | None]:
    """Alineamiento global monótono (Needleman-Wunsch) entre letra (a) y lo oído (b).

    Emparejar suma la similitud de las palabras (solo si se parecen lo bastante);
    saltarse una palabra de la letra o de lo oído cuesta un poco. Así un error de Whisper
    ("Simon" por "Taiwan") no rompe el resto del alineamiento.
    """
    GAP_A, GAP_B, MIN_SIM = -0.4, -0.15, 0.6
    n, m = len(a), len(b)
    score = [[0.0] * (m + 1) for _ in range(n + 1)]
    move = [[0] * (m + 1) for _ in range(n + 1)]  # 1 diagonal, 2 salta letra, 3 salta oído
    for i in range(1, n + 1):
        score[i][0], move[i][0] = score[i - 1][0] + GAP_A, 2
    for j in range(1, m + 1):
        score[0][j], move[0][j] = score[0][j - 1] + GAP_B, 3
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sim = similarity(a[i - 1], b[j - 1])
            best, mv = score[i - 1][j] + GAP_A, 2
            if score[i][j - 1] + GAP_B > best:
                best, mv = score[i][j - 1] + GAP_B, 3
            if sim >= MIN_SIM and score[i - 1][j - 1] + sim > best:
                best, mv = score[i - 1][j - 1] + sim, 1
            score[i][j], move[i][j] = best, mv
    times: list[tuple[float, float] | None] = [None] * n
    i, j = n, m
    while i > 0 or j > 0:
        mv = move[i][j]
        if mv == 1:
            times[i - 1] = (heard[j - 1]["start"], heard[j - 1]["end"])
            i, j = i - 1, j - 1
        elif mv == 2:
            i -= 1
        else:
            j -= 1
    return times


def transcribe(audio: str, model_name: str, prompt: str, window: tuple[float, float] | None = None) -> list[dict]:
    import librosa
    from faster_whisper import WhisperModel

    # Decodificamos con librosa: el lector de faster-whisper depende de una versión concreta de PyAV.
    samples, _ = librosa.load(audio, sr=16000, mono=True)
    t0 = 0.0
    if window:
        t0 = window[0]
        samples = samples[int(window[0] * 16000) : int(window[1] * 16000)]
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        samples,
        language="en",
        word_timestamps=True,
        beam_size=5,
        condition_on_previous_text=False,
        initial_prompt=prompt,
        vad_filter=False,
        no_speech_threshold=0.9 if window else 0.6,
    )
    words = []
    for seg in segments:
        print(f"[{seg.start + t0:7.2f} → {seg.end + t0:7.2f}] {seg.text.strip()}")
        for w in seg.words or []:
            words.append({"w": w.word.strip(), "start": round(w.start + t0, 3), "end": round(w.end + t0, 3), "p": round(w.probability, 3)})
    return words


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("lyrics")
    ap.add_argument("out")
    ap.add_argument("--model", default="large-v3-turbo")
    ap.add_argument(
        "--rescan",
        action="append",
        default=[],
        metavar="INICIO:FIN",
        help="vuelve a transcribir solo esa ventana (en segundos) y la fusiona en la caché; útil donde la voz queda tapada",
    )
    args = ap.parse_args()

    lines = [l.strip() for l in Path(args.lyrics).read_text().splitlines() if l.strip()]
    cache = Path(args.out).with_suffix(".whisper.json")
    if cache.exists():
        heard = json.loads(cache.read_text())
    else:
        # El prompt con la letra (sin repeticiones) orienta el vocabulario de Whisper.
        uniq = list(dict.fromkeys(lines))
        heard = transcribe(args.audio, args.model, " ".join(uniq)[:800])
        cache.write_text(json.dumps(heard, indent=1))
    for spec in args.rescan:
        w0, w1 = (float(x) for x in spec.split(":"))
        uniq = list(dict.fromkeys(lines))
        fresh = transcribe(args.audio, args.model, " ".join(uniq)[:800], (w0, w1))
        heard = [h for h in heard if not (w0 <= h["start"] < w1)] + fresh
        heard.sort(key=lambda h: h["start"])
        cache.write_text(json.dumps(heard, indent=1))

    lyric = [(li, wi, w) for li, line in enumerate(lines) for wi, w in enumerate(line.split())]
    a = [norm(w) for _, _, w in lyric]
    b = [norm(h["w"]) for h in heard]
    times = dp_align(a, b, heard)

    out = []
    for li, line in enumerate(lines):
        idx = [i for i, (l, _, _) in enumerate(lyric) if l == li]
        known = [i for i in idx if times[i] is not None]
        if not known:
            out.append({"text": line, "estimated": True, "words": [{"w": lyric[i][2]} for i in idx]})
            continue
        # Interpola las palabras sin pareja entre las conocidas (o extrapola con 0.3 s por palabra).
        words = []
        for i in idx:
            if times[i] is not None:
                s, e = times[i]
            else:
                prev = max((k for k in known if k < i), default=None)
                nxt = min((k for k in known if k > i), default=None)
                if prev is not None and nxt is not None:
                    f = (i - prev) / (nxt - prev)
                    s = times[prev][1] + f * (times[nxt][0] - times[prev][1])
                elif prev is not None:
                    s = times[prev][1] + 0.3 * (i - prev - 1)
                else:
                    s = times[nxt][0] - 0.3 * (nxt - i)
                e = s + 0.25
            words.append({"w": lyric[i][2], "start": round(s, 3), "end": round(e, 3), "matched": times[i] is not None})
        out.append({"text": line, "estimated": False, "start": words[0]["start"], "end": words[-1]["end"], "words": words})

    matched = sum(t is not None for t in times)
    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"{matched}/{len(lyric)} palabras emparejadas, {sum(o['estimated'] for o in out)} frases sin tiempos → {args.out}")


if __name__ == "__main__":
    main()
