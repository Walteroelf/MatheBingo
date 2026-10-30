# Mathe-Bingo

Ein Rechen-Würfel mit Sprachausgabe für Mathe-Bingo und Mathe-Lotto im Unterricht.
Aufgebaut wie das ABC-Bingo, in Mathe-Blau. Läuft im Browser auf iPad, Smartboard oder Laptop,
ohne Installation und ohne Anmeldung: https://walteroelf.github.io/MatheBingo/

## Würfeln

- **„Bitte berühren“**: Ein Tipp irgendwo auf den Bildschirm würfelt, auf Wunsch auch ein Taster (siehe [Taster](#taster)).
  Vollbild gibt es über ⚙️ → Dieses iPad → **Vollbild** und auf der Tafel über den Knopf unten rechts.
  Läuft die App vom Home-Bildschirm, ist sie schon ohne Safari-Leiste, dann fehlen diese Knöpfe.
- Die Aufgabe rollt mit dem gewählten Würfel-Klang aus, erscheint groß mit Konfetti und wird vorgelesen.
  Darunter auf Wunsch Punktebild (Zehnerfelder bei Plus/Minus, Punktefeld bei Mal) und Ergebnis,
  jeweils aus, auf Antippen (Knopf) oder immer. Unter der Aufgabe ist dafür fester Platz, so bleibt die Aufgabe
  beim Aufdecken stehen.
- **Tipp auf die Aufgabe**: Sie wird nochmal vorgelesen.
- **„Weiter“** unten rechts: zurück zu „Bitte berühren“. Der Knopf lässt sich abschalten, siehe [Taster](#taster).
- Jedes Ergebnis im Topf kommt einmal pro Runde. Sind alle dran, erscheint „Alle Aufgaben wurden gewürfelt! 🎉“.
  Wahlweise kommt stattdessen nur jede **Aufgabe** einmal und ein Ergebnis darf mehrmals kommen,
  siehe [Was kommt nur einmal?](#was-kommt-nur-einmal).

## Einstellungen (⚙️ unten links)

Aufgebaut wie beim ABC-Bingo, mit fünf Reitern. Der zuletzt geöffnete Reiter wird gemerkt.

- **🎲 Spiel**
  - *Gewürfelte Aufgaben* (x von y): neueste gelb umrandet, „Letzte zurücknehmen“, „Neues Spiel“,
    „Nach Größe sortieren“ zum Prüfen bei „Bingo!“.
  - *Zahlen im Topf*: wie die Buchstaben beim ABC-Bingo. Antippen nimmt eine Zahl heraus oder legt sie zurück;
    „Alle“, „Keine“, „Ohne 0“. Bei Plus und Minus liegt die 0 im Topf; ohne 0 fallen auch Aufgaben wie 3 + 0 weg.
- **🧮 Aufgaben**: Schnellwahl (Plus bis 10 … 1×1 Kernaufgaben, Ganzes 1×1, Geteilt Kernaufgaben),
  **Was kommt nur einmal?** (siehe unten), Rechenart, Zahlenraum bis 5 … 100, Zehnerübergang, Einmaleins-Reihen, Quadrataufgaben.
  Eine Änderung hier startet ein neues Spiel.
- **📱 Dieses iPad**: aufgebaut wie beim ABC-Bingo. Gilt nur für dieses Gerät: **Farbe** (gewürfelte Aufgaben
  erscheinen in dieser Farbe, auch in der Liste und auf der Tafel; so sieht man, welches iPad gewürfelt hat),
  Punktebild und Ergebnis (je „Aus“, „Auf Antippen“, „Immer“; bei „Auf Antippen“ deckt ein Knopf unter der
  Aufgabe es auf), Vorlesen, Lautstärke, Stimmprobe, Würfel-Klang, Konfetti, Vollbild.
  Unter **Würfeln**: Antippen, Taster oder beides, „Weiter“-Knopf an/aus und Sperrzeit (siehe [Taster](#taster)).
  Würfel-Klänge (Antippen zum Anhören und Auswählen): 🥁 Trommelwirbel, 🎺 Tusch, 🎡 Glücksrad, 🎵 Xylophon,
  ✨ Zauberstab, 🔇 Kein Klang. Alle Klänge werden im Browser erzeugt (`sounds.js`).
- **📡 Verbinden**: Mehrere iPads und die Tafel, siehe unten. Ein Punkt am Reiter zeigt den Verbindungsstatus.
- **➕ Mehr**: Bingokarten und Lottoscheine, diese Anleitung (öffnet sich in der App).

## Was kommt nur einmal?

Unter ⚙️ → Aufgaben, gilt für alle verbundenen iPads:

| Einstellung | Was passiert | Wofür |
|---|---|---|
| **Jedes Ergebnis** (Standard) | Jede Zahl im Topf kommt genau einmal, z. B. nach 3 + 4 kommt keine 7 mehr. Der Zähler zählt Ergebnisse. | Bingo und Lotto: Jede gewürfelte Aufgabe bringt eine neue Zahl. |
| **Jede Aufgabe** | Keine Aufgabe kommt doppelt, ein Ergebnis aber mehrmals (3 + 4, später 5 + 2). Der Zähler zählt Aufgaben. | Rechenübung, bei der eine Zahl öfter abgehakt oder angemalt werden darf. |

Auch bei „Jede Aufgabe“ wird zuerst ein Ergebnis gelost und dann eine Aufgabe dazu. So kommt die 10 nicht viel
öfter als die 1, nur weil es mehr Aufgaben mit dem Ergebnis 10 gibt. Fürs Bingo dauert es mit „Jede Aufgabe“
länger, bis alle Zahlen einmal dran waren. Eine Änderung startet ein neues Spiel; der Topf bleibt, wie er ist.

## Taster

Ein einzelner Taster (per Adapter am iPad) kann statt des Bildschirms würfeln, wie beim ABC-Bingo.
Einstellung unter ⚙️ → **Dieses iPad** → **Würfeln**:

- **Würfeln mit:** Antippen, Taster oder Beides. Bei „Taster“ löst eine Berührung des Bildschirms kein Würfeln aus.
- **Der Taster sendet:** Leertaste, Enter oder Mausklick. Bei einer anderen Taste auf **Anlernen** tippen und den
  Taster einmal drücken. Beim Mausklick würfelt ein Klick irgendwo auf dem Bildschirm; „Weiter“ und ⚙️ reagieren
  nicht auf den Taster.
- Der Taster würfelt nur. Punktebild und Ergebnis deckt er nie auf, das geht nur mit dem Finger.
- Gedrückt halten würfelt nur einmal.
- Die **Schaltersteuerung** in den iPad-Bedienungshilfen muss für diesen Taster aus sein, sonst kommt der Druck
  nicht in der App an.

**Mit „Weiter“-Knopf:** Nach der Aufgabe reagiert der Taster nicht, bis die Lehrkraft „Weiter“ antippt.

**Ohne „Weiter“-Knopf:** Die Aufgabe bleibt stehen. Ist sie fertig vorgelesen, läuft die **Sperrzeit**
(0–20 Sekunden, ein Balken am unteren Rand läuft ab). Danach würfelt der nächste Druck sofort neu.
Antippen während der Sperrzeit liest die Aufgabe nochmal vor.

## Mehrere iPads

1. Auf einem iPad: ⚙️ → Verbinden → **Gemeinsames Spiel starten**. Es erscheinen groß der Spielcode
   (z. B. `r9j6 3qz7 h2`) und ein QR-Code.
2. Auf jedem weiteren iPad den QR-Code mit der Kamera scannen, **oder** dort unter ⚙️ → Verbinden →
   **Einem Spiel beitreten** den Spielcode eintippen.
3. Ein grüner Punkt oben rechts heißt „verbunden“, ein oranger „gerade keine Verbindung“.

Für alle verbundenen Geräte gemeinsam: gewürfelte Aufgaben (jedes Ergebnis bzw. jede Aufgabe kommt nur einmal, egal auf welchem
iPad, und erscheint in der Farbe des iPads, das es gewürfelt hat), Aufgaben-Einstellungen und Topf, „Letzte zurücknehmen“ und „Neues Spiel“. Würfeln zwei iPads im selben
Moment dasselbe Ergebnis, würfelt eines davon unbemerkt neu. Die Einstellungen unter „Dieses iPad“
(Farbe, Vorlesen, Klang, Punktebild, Ergebnis …) bleiben auf jedem Gerät für sich.

Gut zu wissen:

- Der Abgleich braucht Internet. Vor dem ersten Einsatz einmal im Schul-WLAN testen: Wird der Punkt grün, klappt es.
- Mit mehreren iPads setzt „Weiter“ nach der letzten Aufgabe das Spiel **nicht** zurück, damit kein Kind das
  Spiel aller beendet. Neues Spiel über ⚙️ → Spiel → **Neues Spiel**.
- Ohne Verbindung würfelt ein iPad allein weiter. Nur in diesem Fall kann ein Ergebnis doppelt kommen.
- Die Geräte tauschen über einen öffentlichen Test-Server (HiveMQ, als Ersatz EMQX) nur Aufgaben, Farben,
  Aufgaben-Einstellungen und einen zufälligen Spielcode aus. Keine Namen, keine Gerätedaten.
  Mathe-Bingo und ABC-Bingo haben getrennte Spielcodes.

### Tafel-Ansicht (Beamer, Smartboard)

Verbinden → Tafel-Ansicht: **QR-Code für die Tafel** scannen, **Link kopieren** und auf dem Beamer-Rechner
öffnen, oder **Dieses Gerät als Tafel**. Die Tafel zeigt die neueste Aufgabe groß und darunter alle bisher
gewürfelten Aufgaben, ohne Ergebnisse, jede in der Farbe des iPads, das sie gewürfelt hat.
Unter der neuesten Aufgabe stehen immer die Knöpfe **„Punktebild zeigen“** und **„Ergebnis zeigen“**
(bei Geteilt nur das Ergebnis), z. B. zum gemeinsamen Nachrechnen am Smartboard. Aufgedeckt wird nur auf der
Tafel; nochmal Antippen versteckt es wieder, bei der nächsten Aufgabe ist beides wieder zugedeckt. Die Aufgabe
bleibt dabei an ihrem Platz. Unten rechts schaltet **⛶ Vollbild** die Tafel ins Vollbild.

## Als App auf den Home-Bildschirm

In Safari auf dem iPad: Teilen-Symbol → **Zum Home-Bildschirm**. Dann:

- startet Mathe-Bingo mit eigenem Symbol im Vollbild, ohne Safari-Leiste,
- funktioniert es mit **einem** iPad auch ganz ohne Internet (nachdem es einmal mit Internet geöffnet wurde;
  dabei werden auch alle Ansagen gespeichert, zusammen etwa 6 MB),
- holt es sich Updates automatisch, sobald Internet da ist.

Wichtig: Die Home-Bildschirm-App hat einen eigenen Speicher, getrennt von Safari. Ein QR-Code öffnet sich immer
in Safari, nicht in der App. Darum in der App zum Verbinden den **Spielcode eintippen**.

Tipp für Kinder mit Beeinträchtigung: Mit **Geführter Zugriff** (Einstellungen → Bedienungshilfen) lässt sich
das iPad auf die App festsetzen.

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
  „sieben plus, fünf“ – das Komma erzeugt eine echte Pause, in der sauber geschnitten wird
- `n`: die zweite Zahl („drei“), herausgeschnitten aus „eins plus, drei“ (Melodie eines Satzendes,
  sauberer Wortanfang ohne Zischlaut von „plus“)
- Beim Abspielen wird die Stille an Anfang und Ende abgeschnitten; dazwischen bleibt eine kurze natürliche Pause.

Laden die Dateien einmal nicht, liest ersatzweise die Stimme des Browsers vor.
Neu erzeugen: `tools/thorsten_audio.py` (Anleitung im Skript), danach die WAV-Dateien mit
`afconvert -f m4af -d aac -b 40000` nach `audio/*.m4a` umwandeln. Danach `audio/liste.json` neu erzeugen
(Liste aller Ansagen für den Offline-Speicher) und in `sw.js` die `VERSION` erhöhen:

```bash
python3 -c "import json,os;json.dump(sorted(f for f in os.listdir('audio') if f.endswith('.m4a')),open('audio/liste.json','w'))"
```

## Datenschutz

- Ohne „Mehrere iPads“ bleibt alles auf dem Gerät.
- Beim Verbinden tauschen die Geräte über einen öffentlichen Test-Server (HiveMQ, als Ersatz EMQX) nur Aufgaben,
  Farben, Aufgaben-Einstellungen und einen zufälligen Spielcode aus. Keine Namen, keine Gerätedaten.
- Schrift, Ansagen und Bibliotheken liegen im Repo, es werden keine fremden Schrift- oder Bibliotheks-Server
  (CDN) abgefragt.

## Dateien

- `index.html`, `app.js`: der Würfel
- `druck.html`, `druck.js`: Bingokarten und Lottoscheine
- `sounds.js`: Würfel-Klänge
- `sync.js`: mehrere iPads verbinden, Tafel-Ansicht
- `guide.js`: zeigt diese Anleitung (`README.md`) in der App an
- `lib/`: MQTT.js 5.10.1 und qrcode-generator 1.4.4 (beide MIT, siehe `lib/README.md`),
  werden erst beim Verbinden geladen
- `core.js`: gemeinsame Grundlage (Aufgaben, Zahlen-Topf, Speichern)
- `style.css`: Gestaltung
- `audio/`: Ansagen mit der Stimme Thorsten (415 kleine m4a-Dateien)
- `tools/thorsten_audio.py`: erzeugt die Ansagen mit Piper
- `sw.js`, `manifest.webmanifest`, `icons/`: Home-Bildschirm-App und Offline-Speicher.
  Kommen Dateien hinzu, die offline da sein sollen: in `sw.js` die Liste `FILES` anpassen und `VERSION` erhöhen.
- `fonts/`: Leselern-Schrift **Andika** von SIL International (SIL Open Font License, siehe `fonts/OFL.txt`)

Einstellungen und Spielstand werden im Browser des jeweiligen Geräts gespeichert.

## Lokal ausprobieren

Im Ordner einen kleinen Webserver starten:

```bash
python3 -m http.server 8765
```

und dann `http://localhost:8765` aufrufen.
