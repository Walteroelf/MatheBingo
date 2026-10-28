"""Erzeugt die Thorsten-Tondateien für Mathe-Bingo als WAV (Stille an Anfang/Ende entfernt).

Vorbereitung: python3 -m venv venv && venv/bin/pip install piper-tts==1.8.0
Stimme: de_DE-thorsten-high.onnx (+ .onnx.json) von huggingface.co/rhasspy/piper-voices
Aufruf: venv/bin/python thorsten_audio.py <modell.onnx> <ausgabeordner> [nur diese Namen …]
Dateien: n.wav (0–100), n_plus.wav, n_minus.wav (0–100), n_mal.wav (0–10), n_durch.wav (0–100)
"""
import os
import sys
import wave
from pathlib import Path

import numpy as np
import piper
from piper import PiperVoice, SynthesisConfig

model = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)

# espeak-ng schneidet lange Pfade ab, daher relativ aus dem Paketordner laden
os.chdir(Path(piper.__file__).parent)
voice = PiperVoice.load(model, espeak_data_dir="espeak-ng-data")
cfg = SynthesisConfig(length_scale=1.1)

LEAD_S, TAIL_S, THRESH = 0.02, 0.06, 0.02


def render(text, name):
    chunks = [c.audio_float_array for c in voice.synthesize(text, syn_config=cfg)]
    audio = np.concatenate(chunks)
    rate = voice.config.sample_rate
    loud = np.where(np.abs(audio) > THRESH)[0]
    if len(loud):
        a = max(0, loud[0] - int(LEAD_S * rate))
        b = min(len(audio), loud[-1] + int(TAIL_S * rate))
        audio = audio[a:b]
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(out / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


jobs = []
for n in range(101):
    jobs += [(f"{n}", f"{n}"), (f"{n} plus", f"{n}_plus"), (f"{n} minus", f"{n}_minus"),
             (f"{n} geteilt durch", f"{n}_durch")]
for n in range(11):
    jobs.append((f"{n} mal", f"{n}_mal"))

only = set(sys.argv[3:])
for text, name in jobs:
    if only and name not in only:
        continue
    render(text, name)
print(f"{len(jobs) if not only else len(only)} Dateien erzeugt")
