"""Erzeugt die Thorsten-Tondateien für Mathe-Bingo als WAV.

Vorbereitung: python3 -m venv venv && venv/bin/pip install "piper-tts[alignment]==1.8.0"
Stimme: de_DE-thorsten-high.onnx (+ .onnx.json) von huggingface.co/rhasspy/piper-voices
Aufruf: venv/bin/python thorsten_audio.py <modell.onnx> <ausgabeordner> [nur diese Namen …]
Danach: afconvert -f m4af -d aac -b 40000 x.wav audio/x.m4a

Damit die Ansage natürlich klingt, spricht Thorsten immer ganze Sätze. Mit den Zeitmarken
der Laute wird in der Pause vor dem letzten Wort geschnitten:
  n_plus  aus „n plus 5“            -> Teil vor dem letzten Wort (weiterführende Satzmelodie)
  n       aus „1 plus n“            -> letztes Wort (Melodie eines Satzendes)
Dateien: n (0–100), n_plus, n_minus, n_durch (0–100), n_mal (0–10)
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
voice = PiperVoice.load(model, espeak_data_dir="espeak-ng-data", include_alignments=True)
cfg = SynthesisConfig(length_scale=1.1)
RATE = voice.config.sample_rate

LEAD_S, TAIL_S, THRESH = 0.01, 0.04, 0.004
CARRIER_END = "5"     # Wort hinter dem Rechenzeichen, wird abgeschnitten
CARRIER_START = "1 plus"  # Satzanfang vor der zweiten Zahl, wird abgeschnitten


def synth(text):
    """Audio und Schnittstelle (Mitte der Pause vor dem letzten Wort) in Samples."""
    audio, cut, pos = [], None, 0
    for chunk in voice.synthesize(text, syn_config=cfg, include_alignments=True):
        audio.append(chunk.audio_float_array)
        for a in chunk.phoneme_alignments or []:
            if a.phoneme == " ":
                cut = pos + a.num_samples // 2
            pos += a.num_samples
    if cut is None:
        raise RuntimeError(f"keine Wortgrenze in {text!r}")
    return np.concatenate(audio), cut


def trim(audio):
    loud = np.where(np.abs(audio) > THRESH)[0]
    if not len(loud):
        return audio
    a = max(0, loud[0] - int(LEAD_S * RATE))
    b = min(len(audio), loud[-1] + int(TAIL_S * RATE))
    return audio[a:b]


def write(audio, name):
    pcm = (np.clip(trim(audio), -1, 1) * 32767).astype(np.int16)
    with wave.open(str(out / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def prefix(text, name):
    audio, cut = synth(f"{text} {CARRIER_END}")
    write(audio[:cut], name)


def number(n):
    audio, cut = synth(f"{CARRIER_START} {n}")
    write(audio[cut:], f"{n}")


jobs = []
for n in range(101):
    jobs += [(number, (n,), f"{n}"),
             (prefix, (f"{n} plus", f"{n}_plus"), f"{n}_plus"),
             (prefix, (f"{n} minus", f"{n}_minus"), f"{n}_minus"),
             (prefix, (f"{n} geteilt durch", f"{n}_durch"), f"{n}_durch")]
for n in range(11):
    jobs.append((prefix, (f"{n} mal", f"{n}_mal"), f"{n}_mal"))

only = set(sys.argv[3:])
done = 0
for fn, args, name in jobs:
    if only and name not in only:
        continue
    fn(*args)
    done += 1
print(f"{done} Dateien erzeugt")
