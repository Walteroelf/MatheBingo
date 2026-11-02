"""Ansagen für Mathe-Bingo aus den Aufnahmen von Jeuwre (Wikimedia Commons, CC BY-SA 4.0).

Braucht nur Python 3 und macOS (afconvert). Aufruf im Projektordner:

    python3 tools/jeuwre_audio.py laden   <arbeitsordner>   # lädt die mp3-Fassungen von Commons
    python3 tools/jeuwre_audio.py bauen   <arbeitsordner>   # schreibt audio/*.m4a und audio/liste.json

„laden“ ist absichtlich langsam (Commons bremst schnelle Abrufe), etwa 20 Minuten.
„bauen“ schneidet Stille ab, bringt alle Wörter auf gleiche Lautheit, schneidet „durch“
aus „Durchzug“ und meldet Ausreißer (Rauschen, Länge, Lautstärke).
Danach in sw.js die VERSION erhöhen.
"""
import array, json, math, os, struct, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

SR = 44100
UA = {'User-Agent': 'MatheBingo/1.0 (Lehrer-Werkzeug; Aussprachedateien)'}
ONES = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf',
        'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn']
TENS = {20: 'zwanzig', 30: 'dreißig', 40: 'vierzig', 50: 'fünfzig', 60: 'sechzig', 70: 'siebzig', 80: 'achtzig',
        90: 'neunzig'}


def word(n):
    if n < 20: return ONES[n]
    if n == 100: return 'hundert'
    t, o = divmod(n, 10)
    return TENS[n] if o == 0 else ('ein' if o == 1 else ONES[o]) + 'und' + TENS[t * 10]


def commons_names():
    """Dateiname in audio/ → Datei auf Commons. Jeuwre schreibt 1–30, die Zehner und Hundert groß."""
    cap = lambda w: w[0].upper() + w[1:]
    out = {}
    for n in range(101):
        w = word(n)
        out[str(n)] = f'De-{cap(w)}.ogg' if n and (n <= 30 or n % 10 == 0) else f'De-{w}.ogg'
    out.update({'plus': 'De-plus.ogg', 'minus': 'De-minus.ogg', 'mal': 'De-mal.ogg', 'durchzug': 'De-Durchzug.ogg'})
    return out


def fetch(url):
    for attempt in range(6):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
            time.sleep(30 * (attempt + 1))
    raise RuntimeError('Commons antwortet nicht: ' + url)


def laden(work):
    os.makedirs(f'{work}/mp3', exist_ok=True)
    names = list(commons_names().items())
    for i in range(0, len(names), 40):
        q = urllib.parse.urlencode({'action': 'query', 'format': 'json', 'prop': 'videoinfo',
                                    'viprop': 'user|derivatives',
                                    'titles': '|'.join('File:' + f for _, f in names[i:i + 40])})
        pages = json.loads(fetch('https://commons.wikimedia.org/w/api.php?' + q))['query']['pages'].values()
        src = {p['title'][5:]: p['videoinfo'][0] for p in pages if 'videoinfo' in p}
        for key, f in names[i:i + 40]:
            dst = f'{work}/mp3/{key}.mp3'
            if os.path.exists(dst): continue
            vi = src.get(f)
            if not vi or vi['user'] != 'Jeuwre':
                print('FEHLT oder anderer Sprecher:', f, vi and vi['user']); continue
            mp3 = next(d['src'] for d in vi['derivatives'] if d.get('type', '').startswith('audio/mpeg'))
            open(dst, 'wb').write(fetch(mp3))
            print(key, flush=True)
            time.sleep(8)


# ---------- Bearbeiten ----------

def read_wav(path):
    raw = open(path, 'rb').read()
    i, data = 12, b''
    while i + 8 <= len(raw):
        cid, n = raw[i:i + 4], struct.unpack('<I', raw[i + 4:i + 8])[0]
        if cid == b'data': data = raw[i + 8:i + 8 + n]
        i += 8 + n + (n & 1)
    return [s / 32768 for s in array.array('h', data[:len(data) // 2 * 2])]


def write_wav(path, x):
    a = array.array('h', (max(-32767, min(32767, int(s * 32767))) for s in x)).tobytes()
    head = struct.pack('<4sI4s4sIHHIIHH4sI', b'RIFF', 36 + len(a), b'WAVE', b'fmt ', 16, 1, 1, SR, SR * 2, 2, 16,
                       b'data', len(a))
    open(path, 'wb').write(head + a)


def frames(x, ms=10):
    n = SR * ms // 1000
    return [math.sqrt(sum(s * s for s in x[i:i + n]) / n) for i in range(0, len(x) - n, n)]


def trim(x, rel=0.008, pad=0.04):
    """Stille vorn und hinten weg. Niedrige Schwelle, damit leise Enden (das s in „plus“) bleiben."""
    e = frames(x)
    on = [i for i, v in enumerate(e) if v > max(e) * rel]
    a = max(0, on[0] * SR // 100 - int(pad * SR))
    b = min(len(x), (on[-1] + 1) * SR // 100 + int(pad * SR))
    y = x[a:b]
    f = int(0.008 * SR)
    for i in range(min(f, len(y) // 2)):
        y[i] *= i / f
        y[-1 - i] *= i / f
    return y


def loud(x, target_db=-20.0):
    """Gleiche Lautheit: RMS der stimmhaften Teile auf den Zielwert, Spitzen unter 0,95."""
    e = frames(x)
    voiced = [v for v in e if v > max(e) * 0.1]
    rms = math.sqrt(sum(v * v for v in voiced) / len(voiced))
    g = min(10 ** (target_db / 20) / rms, 0.95 / max(abs(s) for s in x))
    return [s * g for s in x], 20 * math.log10(rms), g * rms < 10 ** (target_db / 20) * 0.8


def cut_durch(x):
    """„durch“ aus „Durchzug“: vor dem „z“ (gesprochen „ts“) ist es kurz still. Schnitt in der Mitte
    der längsten leisen Stelle in der Wortmitte, so klingt das „ch“ natürlich aus."""
    x = trim(x, pad=0.0)
    e = frames(x)
    best, run, start = (0, 0), 0, 0
    for i in range(int(len(e) * 0.25), int(len(e) * 0.8)):
        if e[i] < max(e) * 0.08:
            start = i if run == 0 else start
            run += 1
            if run > best[0]: best = (run, start)
        else:
            run = 0
    n, s = best
    return x[:(s + n // 2) * SR // 100 if n else len(x) // 2]


def bauen(work, project):
    os.makedirs(f'{work}/wav', exist_ok=True)
    keys = list(commons_names())
    rows = []
    for key in keys:
        src = f'{work}/mp3/{key}.mp3'
        tmp = f'{work}/wav/{key}.wav'
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@44100', '-c', '1', src, tmp], check=True)
        x = read_wav(tmp)
        noise = max(frames(x)[:10]) / max(frames(x))
        if key == 'durchzug':
            key, x = 'durch', cut_durch(x)
        y, level, capped = loud(trim(x))
        out = f'{work}/wav/out_{key}.wav'
        write_wav(out, y)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000', out, f'{project}/audio/{key}.m4a'],
                       check=True)
        rows.append((key, len(y) / SR, level, noise, capped))
    # Ausreißer melden
    durs = [r[1] for r in rows if r[0].isdigit()]
    mean = sum(durs) / len(durs)
    sd = math.sqrt(sum((d - mean) ** 2 for d in durs) / len(durs))
    print(f'{len(rows)} Ansagen, Länge der Zahlen {mean:.2f} ± {sd:.2f} s')
    for key, dur, level, noise, capped in rows:
        why = []
        if noise > 0.02: why.append(f'Rauschen {noise:.3f}')
        if key.isdigit() and abs(dur - mean) > 2.5 * sd: why.append(f'Länge {dur:.2f} s')
        if capped: why.append('Spitzen begrenzt (etwas leiser)')
        if level < -35 or level > -8: why.append(f'Pegel vorher {level:.1f} dB')
        if why: print('  auffällig:', key, ', '.join(why))
    names = sorted(f for f in os.listdir(f'{project}/audio') if f.endswith('.m4a'))
    json.dump(names, open(f'{project}/audio/liste.json', 'w'))


if __name__ == '__main__':
    cmd, work = sys.argv[1], sys.argv[2]
    if cmd == 'laden': laden(work)
    elif cmd == 'bauen': bauen(work, os.getcwd())
    else: sys.exit(__doc__)
