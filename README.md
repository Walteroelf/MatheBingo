# Mathe-Bingo

Ein Rechen-Würfel mit Sprachausgabe für Mathe-Bingo und Mathe-Lotto im Unterricht.
Aufgebaut wie das ABC-Bingo, in Mathe-Blau. Läuft im Browser auf iPad, Smartboard oder Laptop,
ohne Installation und ohne Anmeldung: https://walteroelf.github.io/MatheBingo/

## Würfeln

- **„Bitte berühren“**: Ein Tipp irgendwo auf den Bildschirm (oder die Leertaste) würfelt.
  Beim ersten Tipp geht die App ins Vollbild.
- Die Aufgabe rollt mit dem gewählten Würfel-Klang aus, erscheint groß mit Konfetti und wird vorgelesen.
  Auf Wunsch gibt es ein Punktebild (Zehnerfelder bei Plus/Minus, Punktefeld bei Mal).
- **Tipp auf die Aufgabe**: Sie wird nochmal vorgelesen.
- **„Weiter“** unten rechts: zurück zu „Bitte berühren“.
- Jedes Ergebnis im Topf kommt einmal pro Runde. Sind alle dran, erscheint „Alle Aufgaben wurden gewürfelt! 🎉“.

## Einstellungen (⚙️ unten links)

Aufgebaut wie beim ABC-Bingo, mit vier Reitern. Der zuletzt geöffnete Reiter wird gemerkt.

- **🎲 Spiel**
  - *Gewürfelte Aufgaben* (x von y): neueste gelb umrandet, „Letzte zurücknehmen“, „Neues Spiel“,
    „Nach Größe sortieren“ zum Prüfen bei „Bingo!“.
  - *Zahlen im Topf*: wie die Buchstaben beim ABC-Bingo. Antippen nimmt eine Zahl heraus oder legt sie zurück;
    „Alle“, „Keine“, „Ohne 0“. Bei Plus und Minus liegt die 0 im Topf; ohne 0 fallen auch Aufgaben wie 3 + 0 weg.
- **🧮 Aufgaben**: Schnellwahl (Plus bis 10 … 1×1 Kernaufgaben, Ganzes 1×1, Geteilt Kernaufgaben),
  Rechenart, Zahlenraum bis 5 … 100, Zehnerübergang, Einmaleins-Reihen, Quadrataufgaben.
  Eine Änderung hier startet ein neues Spiel.
- **📱 Dieses iPad**: Vorlesen, Lautstärke, Stimmprobe, Punktebild, Ergebnis-Knopf (zeigt auf Tipp das Ergebnis
  mittig unter der Aufgabe), Würfel-Klang, Konfetti, Vollbild.
  Würfel-Klänge (Antippen zum Anhören und Auswählen): 🥁 Trommelwirbel, 🎺 Tusch, 🎡 Glücksrad, 🎵 Xylophon,
  ✨ Zauberstab, 🔇 Kein Klang. Alle Klänge werden im Browser erzeugt (`sounds.js`).
- **➕ Mehr**: Bingokarten und Lottoscheine, Anleitung.

## Bingokarten und Lottoscheine

Über ⚙️ → ➕ Mehr → „Ausdrucke öffnen“ (Seite `druck.html`). Beide nehmen immer die **Zahlen im Topf**,
also genau die Zahlen, die auch gewürfelt werden.

- **Bingokarten** 2 × 2 bis 5 × 5, auf Wunsch der Größe nach sortiert.
- **Lottoscheine** „Lotto-Schein von ____“ mit allen Zahlen aus dem Topf der Reihe nach,
  drei Scheine pro A4-Seite (0–20 als 7 × 3, große Zahlenräume 10 pro Reihe).

## Vorlesen: Stimme „Thorsten“

Die Aufgaben spricht **Thorsten**, die freie deutsche Stimme von Thorsten Müller
([Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice), Daten CC0), erzeugt mit
[Piper](https://github.com/OHF-Voice/piper1-gpl) (Stimme `de_DE-thorsten-high`).
Die Ansagen liegen als fertige Tondateien im Ordner `audio/` – wie beim ABC-Bingo. Sie klingen deshalb
auf jedem Gerät gleich und brauchen keine Internet-Stimme.

- `n_plus`, `n_minus`, `n_mal`, `n_durch`: erste Zahl mit Rechenzeichen („sieben plus“), herausgeschnitten aus
  einem ganzen Satz („sieben plus fünf“), damit die Satzmelodie weiterführt
- `n`: die zweite Zahl („drei“), herausgeschnitten aus „eins plus drei“ (Melodie eines Satzendes)
- Beim Abspielen wird die Stille an Anfang und Ende abgeschnitten; dazwischen bleibt eine kurze natürliche Pause.

Laden die Dateien einmal nicht, liest ersatzweise die Stimme des Browsers vor.
Neu erzeugen: `tools/thorsten_audio.py` (Anleitung im Skript), danach die WAV-Dateien mit
`afconvert -f m4af -d aac -b 40000` nach `audio/*.m4a` umwandeln.

## Dateien

- `index.html`, `app.js`: der Würfel
- `druck.html`, `druck.js`: Bingokarten und Lottoscheine
- `sounds.js`: Würfel-Klänge
- `core.js`: gemeinsame Grundlage (Aufgaben, Zahlen-Topf, Speichern)
- `style.css`: Gestaltung
- `audio/`: Ansagen mit der Stimme Thorsten (415 kleine m4a-Dateien)
- `tools/thorsten_audio.py`: erzeugt die Ansagen mit Piper
- `fonts/`: Leselern-Schrift **Andika** von SIL International (SIL Open Font License, siehe `fonts/OFL.txt`)

Einstellungen und Spielstand werden im Browser des jeweiligen Geräts gespeichert.

## Lokal ausprobieren

Im Ordner einen kleinen Webserver starten:

```bash
python3 -m http.server 8765
```

und dann `http://localhost:8765` aufrufen.
