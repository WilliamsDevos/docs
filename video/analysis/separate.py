"""Aísla la voz de una canción con Demucs (htdemucs_ft, modelo especializado en voz).

Uso: uv run python separate.py <audio> <voz.wav> [--model models/htdemucs_ft/04573f0d-f3cf25b2.th]

Los pesos vienen de una copia en Hugging Face (dokodesuka/htdemucs_ft) porque el servidor
original de Demucs no es accesible desde aquí. Por seguridad:
- se comprueba que el SHA-256 empiece por el sufijo del nombre del archivo (Demucs firma así sus pesos),
- se cargan con torch.load(weights_only=True), que solo admite tensores y las clases permitidas,
  así que un pickle manipulado no puede ejecutar código.
"""
import argparse
import fractions
import hashlib
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from demucs.apply import apply_model
from demucs.htdemucs import HTDemucs
from demucs.states import set_state


def load_verified(path: Path) -> HTDemucs:
    expected = path.stem.split("-")[-1]
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if not digest.startswith(expected):
        raise SystemExit(f"hash inesperado para {path.name}: {digest[:16]} (se esperaba {expected}…)")
    # Solo clases de datos: el modelo, Fraction (duración de segmento) y escalares/dtypes de NumPy.
    allowed = [HTDemucs, fractions.Fraction, (np._core.multiarray.scalar, "numpy.core.multiarray.scalar"), np.dtype]
    allowed += [type(np.dtype(t)) for t in ("float64", "float32", "int64", "int32", "bool")]
    with torch.serialization.safe_globals(allowed):
        pkg = torch.load(path, map_location="cpu", weights_only=True)
    model = pkg["klass"](*pkg["args"], **pkg["kwargs"])
    set_state(model, pkg["state"])
    model.eval()
    return model


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--model", default=str(Path(__file__).parent / "models/htdemucs_ft/04573f0d-f3cf25b2.th"))
    args = ap.parse_args()

    model = load_verified(Path(args.model))
    y, _ = librosa.load(args.audio, sr=model.samplerate, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    wav = torch.from_numpy(y).float()
    ref = wav.mean(0)
    wav = (wav - ref.mean()) / ref.std()
    torch.set_num_threads(max(1, torch.get_num_threads()))
    with torch.no_grad():
        sources = apply_model(model, wav[None], device="cpu", shifts=1, split=True, overlap=0.25, progress=True)[0]
    sources = sources * ref.std() + ref.mean()
    vocals = sources[model.sources.index("vocals")].numpy().T
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.out, vocals, model.samplerate)
    print(f"voz → {args.out} ({vocals.shape[0] / model.samplerate:.1f} s)")


if __name__ == "__main__":
    main()
