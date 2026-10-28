# Mathe-Bingo

Ein Würfel mit Sprachausgabe für Mathe-Bingo im Unterricht. Es läuft im Browser auf Smartboard, Tablet oder Laptop, ohne Installation und ohne Anmeldung.

## Was es kann

- **Start**: Zu Beginn wählt man per Kachel aus, was gerechnet wird (oder legt eine eigene Einstellung fest).
  Danach erscheint nur noch der Würfel im Vollbild, aufgebaut wie das ABC-Bingo, aber in Mathe-Blau.
- **Würfeln**: „Bitte berühren“ – ein Tipp irgendwo auf den Bildschirm (oder die Leertaste) würfelt.
  Die Aufgabe rollt mit Trommelwirbel aus, erscheint groß mit Konfetti und wird vorgelesen.
  Ein Tipp auf die Aufgabe liest sie nochmal vor. Mit „Weiter“ geht es zur nächsten Aufgabe.
  Auf Wunsch gibt es ein Punktebild (Zehnerfelder bei Plus/Minus, Punktefeld bei Mal).
  Über ⚙️ unten links: bisher Gewürfeltes, letzte Aufgabe zurücknehmen, neue Runde, Ton und Effekte,
  zurück ins Hauptmenü.
- **Notar**: Die Tafel enthält genau die Ergebnisse, die mit den aktuellen Einstellungen möglich sind.
  Gewürfelte Ergebnisse werden automatisch blau markiert, unter jeder Zahl steht die gestellte Aufgabe.
  Damit lässt sich ein „Bingo!“ schnell überprüfen.
- **Bingokarten**: Druckbare Karten (2 × 2 bis 5 × 5) passend zu den Einstellungen, auf Wunsch der Größe nach sortiert.
- **Einstellungen**:
  - Rechenart: Plus, Minus, Mal, Geteilt oder gemischt
  - Zahlenraum frei von 2 bis 100, Zehnerübergang an oder aus, Null erlaubt oder nicht
  - Einmaleins-Reihen einzeln wählbar, dazu Quadrataufgaben und Tauschaufgaben
  - „Jedes Ergebnis gleich oft“ (fair für Bingo) oder „jede Aufgabe gleich oft“
  - Nichts doppelt, bis alles einmal dran war
  - Stimme, Sprechtempo und Pause zwischen den Wörtern
  - Schnellstart-Vorlagen von „Plus bis 5“ bis „Ganzes 1×1“

Einstellungen, Verlauf und Markierungen bleiben im Browser gespeichert. Sie sind also nach dem Neuladen noch da,
aber nur auf diesem Gerät.

## Vorlesen

Die App nutzt die eingebaute Sprachausgabe des Browsers. Wie die Stimme klingt, hängt vom Gerät ab.
Unter Einstellungen → Anzeige und Ton kann eine andere deutsche Stimme gewählt werden.
Am besten funktioniert es in aktuellen Versionen von Chrome, Edge und Safari.

## Auf GitHub Pages veröffentlichen

1. Auf GitHub ein neues, öffentliches Repository anlegen (hier: `MatheBingo`).
2. Die Dateien `index.html`, `style.css`, `app.js`, `README.md` und den Ordner `fonts` hochladen.
3. Unter **Settings → Pages** als Quelle „Deploy from a branch“, Branch `main` und Ordner `/ (root)` wählen.
4. Nach etwa einer Minute ist die App unter `https://walteroelf.github.io/MatheBingo/` erreichbar.

## Lokal ausprobieren

Einfach `index.html` im Browser öffnen, oder im Ordner einen kleinen Webserver starten:

```bash
python3 -m http.server 8765
```

und dann `http://localhost:8765` aufrufen.

## Schrift

Die Zahlen nutzen die Leselern-Schrift **Andika** von SIL International (SIL Open Font License, siehe `fonts/OFL.txt`).
Beim Hochladen auf GitHub den Ordner `fonts` mit hochladen.
