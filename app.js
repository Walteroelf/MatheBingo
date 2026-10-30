'use strict';

// Würfel im Stil des ABC-Bingos; Grundlagen (Topf, Aufgaben, Speicher) stehen in core.js

// Abstände der Würfel-Bilder in ms: erst schnell, dann langsamer
const ROLL_MS = [28, 54, 82, 112, 144, 178, 214, 252, 292, 334, 378, 424];
const CONFETTI_COLORS = ['#f0c020', '#ffffff', '#4dabf7', '#ff6b6b', '#7bd389'];

const stored = loadStore();
let S = stored.settings;
const state = {
  history: stored.history,   // gewürfelte Aufgaben dieser Runde { a, op, b, r, ts, by }
  current: null,
  rolling: false,
  drawnSort: 'order',
};
const net = stored.net;      // mehrere iPads: Spielcode, Server, Runde (sync.js)
if (!net.gen) { net.gen = randomId(10); net.genTs = Date.now(); }
let pool = buildPool(S);

function save() {
  saveStore({ settings: S, history: state.history, net });
}

// ---------- Auslosen: jedes Ergebnis im Topf einmal pro Runde ----------

const leftInTopf = () => { const used = usedResults(); return pool.topf.filter((r) => !used.has(r)); };
const doneInTopf = () => { const seen = new Set(visibleHistory().map((t) => t.r)); return pool.topf.filter((r) => seen.has(r)).length; };
const countText = () => `Bereits gewürfelt: ${doneInTopf()} von ${pool.topf.length}`;

function draw() {
  if (!pool.topf.length) return null;
  const left = leftInTopf();
  if (!left.length) return { done: true };
  return { t: pick(pool.byResult.get(pick(left))) };
}

// ---------- Ton: Thorsten-Stimme, Ersatzstimme, Trommel ----------

// Thorsten (Piper-Stimme von Thorsten Müller, CC0): vorab erzeugte Tondateien in audio/.
// Erster Teil mit Rechenzeichen in einem Zug („7_plus“), zweite Zahl nahtlos dahinter („3“).
const OP_FILE = { '+': 'plus', '-': 'minus', '*': 'mal', '/': 'durch' };
const JOIN_GAP_S = 0.04;   // kurze Pause zwischen „sieben plus“ und „drei“, wie im gesprochenen Satz
const SILENCE = 0.002;   // niedrig, damit leise Anfangslaute (f, s) erhalten bleiben
const clipCache = new Map();

// Hörbaren Teil bestimmen. Schneidet auch die Stille ab, die das m4a-Format am Anfang
// einfügt – sonst entsteht an der Nahtstelle ein kleines Stocken.
function audible(buf) {
  const d = buf.getChannelData(0);
  let a = 0;
  let b = d.length - 1;
  while (a < b && Math.abs(d[a]) < SILENCE) a++;
  while (b > a && Math.abs(d[b]) < SILENCE) b--;
  const start = Math.max(0, a / buf.sampleRate - 0.03);
  const end = Math.min(buf.duration, b / buf.sampleRate + 0.03);
  return { buf, start, dur: Math.max(0.01, end - start) };
}
let voiceSources = [];
let speechRun = 0;
let voiceEndsAt = 0;   // performance.now(), wann die laufende Ansage endet (für die Sperrzeit)

function loadClip(name) {
  if (!clipCache.has(name)) {
    const p = fetch(`audio/${name}.m4a`)
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((data) => new Promise((res, rej) => audioCtx.decodeAudioData(data, res, rej)))
      .then(audible);
    p.catch(() => clipCache.delete(name));
    clipCache.set(name, p);
  }
  return clipCache.get(name);
}

const clipsFor = (t) => [`${t.a}_${OP_FILE[t.op]}`, `${t.b}`];

// Schon beim Würfeln laden, damit die Ansage nach dem Rollen sofort kommt
function preloadVoice(t) {
  if (audioCtx) for (const n of clipsFor(t)) loadClip(n).catch(() => {});
}

async function playThorsten(t, run, delay = 0) {
  if (!audioCtx) return false;
  let clips;
  try { clips = await Promise.all(clipsFor(t).map(loadClip)); } catch { return false; }
  if (run !== speechRun) return true; // inzwischen abgebrochen
  const gain = audioCtx.createGain();
  gain.gain.value = S.volume;
  gain.connect(audioCtx.destination);
  let at = audioCtx.currentTime + 0.05 + delay;
  voiceSources = clips.map((c) => {
    const src = audioCtx.createBufferSource();
    src.buffer = c.buf;
    src.connect(gain);
    src.start(at, c.start, c.dur);
    at += c.dur + JOIN_GAP_S;
    return src;
  });
  voiceEndsAt = performance.now() + (at - audioCtx.currentTime) * 1000;
  return true;
}

// Ersatz, falls die Tondateien nicht laden: Stimme des Browsers
const hasSpeech = 'speechSynthesis' in window;

function speakFallback(text) {
  if (!hasSpeech) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.9;
  u.volume = S.volume;
  speechSynthesis.speak(u);
}

function stopSpeech() {
  speechRun++;
  for (const src of voiceSources) { try { src.stop(); } catch { /* schon zu Ende */ } }
  voiceSources = [];
  voiceEndsAt = 0;
  if (hasSpeech) speechSynthesis.cancel();
}

// delay: Sekunden Wartezeit, damit der Abschluss-Klang nicht überdeckt wird
async function announce(t, delay = 0) {
  if (!S.speech) return;
  stopSpeech();
  const run = speechRun;
  if (await playThorsten(t, run, delay)) return;
  if (delay) await sleep(delay * 1000);
  if (run !== speechRun) return;
  voiceEndsAt = performance.now() + 2500;   // geschätzt
  speakFallback(`${t.a} ${OPS[t.op].word} ${t.b}`);
}

let audioCtx = null;

// Muss in einem Tipp-Ereignis aufgerufen werden, sonst bleibt der Ton auf iPads stumm
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* egal */ }
    audioCtx = new AC();
  }
  if (audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
}

// Würfel-Klang (Klänge in sounds.js): eigene Lautstärke-Stufe und ein Begrenzer gegen Übersteuern
function soundOut() {
  if (!audioCtx || audioCtx.state !== 'running') return null;
  const g = audioCtx.createGain();
  g.gain.value = 0.9 * S.volume;
  const limit = audioCtx.createDynamicsCompressor();
  limit.threshold.value = -8; limit.knee.value = 6; limit.ratio.value = 12;
  limit.attack.value = 0.002; limit.release.value = 0.15;
  g.connect(limit);
  limit.connect(audioCtx.destination);
  return g;
}

const currentSound = () => SOUNDS[S.sound] || SOUNDS.trommel;
const rollTicks = () => ROLL_MS.map((ms) => ms / 1000);

// Klang einmal vorspielen: Rollen und Abschluss, wie beim Würfeln
function previewSound(key) {
  initAudio();
  const out = soundOut();
  const snd = SOUNDS[key];
  if (!out || !snd) return;
  const t0 = audioCtx.currentTime + 0.05;
  const ticks = rollTicks();
  snd.roll(audioCtx, out, t0, ticks);
  snd.finale(audioCtx, out, t0 + ticks[ticks.length - 1] + 0.12);
}

// ---------- Konfetti ----------

let confettiRun = 0;

function stopConfetti() {
  confettiRun++;
  $('#confetti').hidden = true;
}

function confetti() {
  if (!S.fxConfetti) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti');
  const w = cv.width = innerWidth;
  const h = cv.height = innerHeight;
  const g = cv.getContext('2d');
  const parts = Array.from({ length: 90 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: pick(CONFETTI_COLORS),
  }));
  const id = ++confettiRun;
  const t0 = performance.now();
  cv.hidden = false;
  (function step(now) {
    if (id !== confettiRun) return;
    g.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.45; p.vx *= 0.99;
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      g.restore();
    }
    if (now - t0 < 2200) requestAnimationFrame(step);
    else stopConfetti();
  })(t0);
}

// ---------- Punktebilder ----------

// Zehnerfelder (2 × 5); "gone" markiert weggenommene Punkte bei Minus
function framesHtml(n, cls = '', gone = 0) {
  const frames = Math.max(1, Math.ceil(n / 10));
  let html = `<div class="frames ${cls}">`;
  for (let f = 0; f < frames; f++) {
    html += '<div class="frame">';
    for (let i = 0; i < 10; i++) {
      const idx = f * 10 + i;
      const kind = idx >= n ? '' : idx >= n - gone ? 'gone' : 'on';
      html += `<span class="dot ${kind}"></span>`;
    }
    html += '</div>';
  }
  return html + '</div>';
}

function arrayHtml(rows, cols) {
  let html = `<div class="array" style="grid-template-columns: repeat(${cols}, auto)">`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cls = [(c === 4 && cols > 5) ? 'col5' : '', (r === 4 && rows > 5) ? 'row5' : ''].join(' ');
      html += `<span class="dot on ${cls}"></span>`;
    }
  }
  return html + '</div>';
}

function dotsHtml(t) {
  if (t.op === '+') {
    if (t.a > 20 || t.b > 20) return '';
    return framesHtml(t.a) + '<span class="sign">+</span>' + framesHtml(t.b, 'b');
  }
  if (t.op === '-') {
    if (t.a > 20) return '';
    return framesHtml(t.a, '', t.b);
  }
  if (t.op === '*') return arrayHtml(t.a, t.b);
  return ''; // Geteilt: kein Bild, das würde das Ergebnis verraten
}

// ---------- Bildschirme und Ablauf ----------

function taskHtml(t) {
  const opCls = t.op === '*' ? 'op mul' : 'op';
  return `<span class="n">${t.a}</span><span class="${opCls}">${OPS[t.op].sym}</span><span class="n">${t.b}</span>`;
}

function showScreen(name) {
  $('#screenTouch').hidden = name !== 'touch';
  $('#screenTask').hidden = name !== 'task';
  $('#screenDone').hidden = name !== 'done';
  $('#screenBoard').hidden = name !== 'board';
}

function renderTouchCount() {
  const el = $('#touchCount');
  el.textContent = countText();
  el.hidden = doneInTopf() === 0;
}

// Rollt mindestens ROLL_MS lang, mit mehreren iPads weiter, bis der Server die Aufgabe bestätigt
function rollAnimation(el) {
  return new Promise((resolve) => {
    let idx = 0;
    let nextAt = ROLL_MS[0];
    const t0 = performance.now();
    (function frame(now) {
      const elapsed = now - t0;
      if (elapsed >= nextAt) {
        el.innerHTML = taskHtml(pick(pool.tasks));
        idx++;
        nextAt = idx < ROLL_MS.length ? ROLL_MS[idx] : elapsed + 120;
      }
      if (idx < ROLL_MS.length || !claimSettled(now)) requestAnimationFrame(frame);
      else setTimeout(resolve, 120);
    })(t0);
  });
}

function showDone(title, hint) {
  $('#doneTitle').textContent = title;
  $('#doneHint').textContent = hint;
  showScreen('done');
  $('#btnWeiter').hidden = false;
}

let triedFullscreen = false;

const showAllDone = () => showDone('Alle Aufgaben wurden gewürfelt! 🎉', net.code
  ? 'Neues Spiel über ⚙️ → Spiel → Neues Spiel.'
  : 'Drücke „Weiter“, um neu zu starten.');

async function roll() {
  if (state.rolling || net.boardMode) return;
  initAudio();
  // Beim ersten Tippen ins Vollbild (geht nur als Reaktion auf einen Tipp)
  if (!triedFullscreen) { triedFullscreen = true; requestFullscreen(); }
  if (!pool.topf.length) {
    showDone('Keine Zahlen im Topf.', 'Über ⚙️ unten links Zahlen in den Topf legen.');
    return;
  }
  if (!leftInTopf().length) { showAllDone(); return; }

  stopLock();
  state.rolling = true;
  makeClaim();   // Ergebnis gleich reservieren (sync.js), aufgedeckt wird nach dem Rollen
  stopSpeech();
  stopConfetti();
  showScreen('task');
  showExtras(null);
  $('#btnWeiter').hidden = true;
  const el = $('#task');
  $('#dots').innerHTML = '';
  el.classList.add('rolling');
  const out = soundOut();
  if (out) currentSound().roll(audioCtx, out, audioCtx.currentTime + 0.02, rollTicks());
  await rollAnimation(el);
  el.classList.remove('rolling');
  const t = releaseClaim();
  if (!t) {
    // Andere iPads haben inzwischen die letzten Ergebnisse gewürfelt
    state.rolling = false;
    showAllDone();
    renderTouchCount();
    return;
  }
  if (out) currentSound().finale(audioCtx, out, audioCtx.currentTime + 0.01);
  state.current = t;
  save();

  el.innerHTML = taskHtml(t);
  showExtras(t);
  state.rolling = false;
  renderTouchCount();
  confetti();
  if (S.weiter) {
    $('#btnWeiter').hidden = false;
    announce(t, currentSound().speechDelay);
  } else {
    lockUntil = Infinity;   // bis klar ist, wann die Ansage endet
    announce(t, currentSound().speechDelay).then(() => { if (state.current === t) startLock(); });
  }
}

// Punktebild und Ergebnis unter der Aufgabe: aus, auf Antippen (Knopf) oder immer
function showExtras(t) {
  const dots = t ? dotsHtml(t) : '';
  $('#dots').innerHTML = S.dotsShow === 'always' ? dots : '';
  $('#btnDots').hidden = !(dots && S.dotsShow === 'tap');
  $('#result').textContent = t ? `= ${t.r}` : '';
  $('#result').hidden = !(t && S.resultShow === 'always');
  $('#btnResult').hidden = !(t && S.resultShow === 'tap');
}

function repeatCurrent() {
  if (state.rolling || !state.current) return;
  announce(state.current);
  const h = $('#repeatHint');
  h.classList.add('show');
  clearTimeout(repeatCurrent.tm);
  repeatCurrent.tm = setTimeout(() => h.classList.remove('show'), 800);
}

function weiter() {
  if (state.rolling) return;
  stopSpeech();
  stopConfetti();
  $('#btnWeiter').hidden = true;
  // Alle gewürfelt: allein startet „Weiter“ neu. Mit mehreren iPads setzt nur die Lehrkraft
  // über ⚙️ zurück, damit kein Kind das Spiel aller beendet.
  if (!$('#screenDone').hidden && pool.topf.length && !net.code) newRound();
  renderTouchCount();
  showScreen('touch');
}

function backToTouch() {
  stopSpeech();
  stopConfetti();
  stopLock();
  state.current = null;
  $('#btnWeiter').hidden = true;
  showScreen(net.boardMode ? 'board' : 'touch');
  renderTouchCount();
  renderBoard();
}

// Neue Runde: neue Rundenkennung, damit alle verbundenen iPads den Stand übernehmen
function newRound(history = []) {
  state.history = history;
  state.current = null;
  net.gen = randomId(10);
  net.genTs = Date.now();
  save();
  publish();
}

// Letzte Aufgabe zurücknehmen. Wie beim ABC-Bingo beginnt dafür eine neue Runde ohne diese
// Aufgabe, sonst käme sie beim Abgleich von den anderen iPads wieder zurück.
function undoLast() {
  const last = visibleHistory().pop();
  if (!last || state.rolling) return;
  newRound(state.history.filter((t) => t !== last));
  backToTouch();
  renderDrawer();
}

// Stand von einem anderen iPad übernommen (sync.js)
function onRemote(roundChanged) {
  save();
  if (roundChanged && !state.rolling) backToTouch();
  renderTouchCount();
  renderBoard();
  if (!$('#drawer').hidden) renderDrawer();
}

// ---------- Tafel-Ansicht ----------

let boardShownLast = null;

function renderBoard() {
  const list = visibleHistory();
  const last = list[list.length - 1] || null;
  $('#boardCount').textContent = net.code ? countText() : 'Nicht verbunden: ⚙️ → Verbinden';
  const lastEl = $('#boardLast');
  lastEl.innerHTML = last ? `<span>${taskHtml(last)}</span>` : '';
  if (last && last !== boardShownLast && !$('#screenBoard').hidden) {
    lastEl.classList.remove('pop');
    void lastEl.offsetWidth;   // Animation neu starten
    lastEl.classList.add('pop');
  }
  boardShownLast = last;
  $('#boardList').innerHTML = list.map((t) =>
    `<div class="${t === last ? 'last' : ''}">${fmt(t)}</div>`).join('');
}

// ---------- Sperrzeit ohne „Weiter“ ----------

let lockUntil = 0;   // Date.now(), ab wann wieder gewürfelt werden darf

// Beginnt erst nach der Ansage, damit die Kinder die ganze Aufgabe hören
function startLock() {
  const wait = Math.max(0, voiceEndsAt - performance.now());
  lockUntil = Date.now() + wait + S.lockSec * 1000;
  const bar = $('#lockBar');
  bar.classList.remove('run');
  if (!S.lockSec) return;
  void bar.offsetWidth;   // Animation neu starten
  bar.style.animationDuration = `${S.lockSec}s`;
  bar.style.animationDelay = `${Math.round(wait)}ms`;
  bar.classList.add('run');
}

function stopLock() {
  lockUntil = 0;
  $('#lockBar').classList.remove('run');
}

// ---------- Taster ----------
// Ein Taster am iPad meldet sich als Tastatur (Leertaste, Enter, …) oder als Maus.
// Er würfelt nur, wenn gerade gewürfelt werden darf: auf „Bitte berühren“ oder, ohne „Weiter“,
// nach Ablauf der Sperrzeit. Ergebnis und Punktebild deckt er nie auf.

let learning = false;   // „Anlernen“: nächster Tastendruck wird gemerkt
let keyHeld = false;    // gedrückt gehalten → nur einmal würfeln
let lastPointer = '';
let swallowClick = false;

const tapOK = () => S.trigger !== 'switch';
const switchOK = () => S.trigger !== 'tap';
const isDone = () => !$('#screenDone').hidden;

// Klick, der vom Maus-Taster kommt (nicht vom Finger)
const switchClick = () => S.switchKey === 'mouse' && switchOK() && lastPointer === 'mouse';

function switchPress() {
  if (state.rolling || net.boardMode || !$('#drawer').hidden || $('#confirmDlg').open || isDone()) return;
  if (state.current && (S.weiter || Date.now() < lockUntil)) return;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  roll();
}

function keyName(e) {
  if (e.code === 'Space' || e.key === ' ') return 'Space';
  if (e.key === 'Enter') return 'Enter';
  return e.code || e.key || '';
}

function keyLabel(k) {
  if (k === 'Space') return 'Leertaste';
  if (k === 'Enter') return 'Enter';
  if (k === 'mouse') return 'Mausklick';
  return k.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, 'Pfeil ');
}

function learnDone(k) {
  learning = false;
  S.switchKey = k;
  save();
  renderDrawer();
}

// Antippen der Aufgabe: ohne „Weiter“ nach der Sperrzeit neu würfeln, sonst nochmal vorlesen
function taskTap() {
  if (switchClick() || state.rolling || !state.current) return;
  if (!S.weiter && tapOK() && Date.now() >= lockUntil) { roll(); return; }
  repeatCurrent();
}

function renderStartText() {
  $('#startTitle').textContent = S.trigger === 'switch' ? 'Bitte Taster drücken' : 'Bitte berühren';
  $('#startHint').textContent = S.trigger === 'switch' ? 'Drücke den Taster, um eine Aufgabe zu würfeln'
    : S.trigger === 'both' ? 'Tippe oder drücke den Taster, um eine Aufgabe zu würfeln'
      : 'Tippe, um eine Aufgabe zu würfeln';
}

function renderSwitch() {
  for (const b of $$('#trigSeg [data-trig]')) b.classList.toggle('on', b.dataset.trig === S.trigger);
  const fixed = ['Space', 'Enter', 'mouse'];
  for (const b of $$('#keySeg [data-key]')) b.classList.toggle('on', !learning && b.dataset.key === S.switchKey);
  const learnBtn = $('#btnLearn');
  learnBtn.classList.toggle('learning', learning);
  learnBtn.classList.toggle('on', !learning && !fixed.includes(S.switchKey));
  learnBtn.textContent = learning ? 'Drücken …' : 'Anlernen';
  $('#keyInfo').textContent = learning ? 'Jetzt den Taster einmal drücken.'
    : S.switchKey === 'mouse' ? 'Ein Klick irgendwo auf dem Bildschirm würfelt. „Weiter“ und ⚙️ reagieren nicht auf den Taster.'
      : fixed.includes(S.switchKey) ? '' : `Angelernt: ${keyLabel(S.switchKey)}`;
  $('#keyRow').hidden = S.trigger === 'tap';
  $('#optWeiter').checked = S.weiter;
  $('#lockRow').hidden = S.weiter;
  for (const b of $$('#lockSeg [data-lock]')) b.classList.toggle('on', +b.dataset.lock === S.lockSec);
  renderStartText();
}

function bindSwitch() {
  document.addEventListener('keydown', (e) => {
    if (learning) {
      e.preventDefault();
      keyHeld = true;
      learnDone(keyName(e));
      return;
    }
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (!switchOK() || S.switchKey === 'mouse' || keyName(e) !== S.switchKey) return;
    e.preventDefault();   // keine Knöpfe auslösen, nicht scrollen
    if (e.repeat || keyHeld) return;
    keyHeld = true;
    initAudio();
    switchPress();
  });
  document.addEventListener('keyup', (e) => {
    keyHeld = false;
    if (switchOK() && keyName(e) === S.switchKey && !(e.target.closest && e.target.closest('input, textarea'))) {
      e.preventDefault();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    lastPointer = e.pointerType;
    if (e.pointerType !== 'mouse') return;
    if (learning) {
      if (e.target.closest('#btnLearn')) return;
      swallowClick = true;
      learnDone('mouse');
      return;
    }
    if (!switchOK() || S.switchKey !== 'mouse') return;
    if (e.target.closest('#drawer, #btnGear, #btnWeiter, #confirmDlg')) return;
    initAudio();
    switchPress();
  }, true);
  document.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  $('#trigSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-trig]');
    if (!b) return;
    learning = false;
    setOption('trigger', b.dataset.trig);
  });
  $('#keySeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    learning = false;
    setOption('switchKey', b.dataset.key);
  });
  $('#btnLearn').addEventListener('click', () => {
    learning = !learning;
    renderSwitch();
  });
  $('#optWeiter').addEventListener('change', (e) => {
    setOption('weiter', e.target.checked);
    if (state.current && !state.rolling && !isDone() && !$('#screenTask').hidden) {
      $('#btnWeiter').hidden = !S.weiter;
      stopLock();
    }
  });
  $('#lockSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-lock]');
    if (b) setOption('lockSec', +b.dataset.lock);
  });
}

// ---------- Einstellungen ändern ----------

// Eigene Rückfrage statt confirm(): manche Browser (Kiosk-Modus, eingebettete Ansichten)
// unterdrücken confirm() und liefern sofort "Abbrechen".
function askConfirm(text) {
  const dlg = $('#confirmDlg');
  if (typeof dlg.showModal !== 'function') return Promise.resolve(true);
  $('#confirmText').textContent = text;
  return new Promise((resolve) => {
    const done = (ok) => {
      $('#confirmYes').onclick = $('#confirmNo').onclick = dlg.oncancel = null;
      dlg.close();
      resolve(ok);
    };
    $('#confirmYes').onclick = () => done(true);
    $('#confirmNo').onclick = () => done(false);
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };
    dlg.showModal();
    $('#confirmYes').focus();
  });
}

// Andere Rechenart, anderer Zahlenraum oder andere Reihen ergeben andere Aufgaben:
// dann beginnt eine neue Runde. Aus dem Topf genommen bleibt nur die 0.
async function changeGame(patch) {
  const next = { ...S, ...patch };
  if (JSON.stringify(next) === JSON.stringify(S)) return;
  if (state.history.length
      && !(await askConfirm(net.code
        ? 'Damit beginnt ein neues Spiel für alle verbundenen iPads. Die bisher gewürfelten Aufgaben werden gelöscht.'
        : 'Damit beginnt ein neues Spiel. Die bisher gewürfelten Aufgaben werden gelöscht.'))) {
    renderDrawer();
    return;
  }
  S = { ...next, excluded: S.excluded.filter((r) => r === 0) };
  pool = buildPool(S);
  net.gameTs = Date.now();
  newRound();
  backToTouch();
  renderDrawer();
}

// Zahlen im Topf ändern: die Runde läuft weiter, wie beim ABC-Bingo
function setExcluded(list) {
  S.excluded = [...new Set(list)].sort((a, b) => a - b);
  pool = buildPool(S);
  net.gameTs = Date.now();
  save();
  publish();
  renderTouchCount();
  renderDrawer();
}

function setOption(key, value) {
  S[key] = value;
  save();
  const taskShown = state.current && !$('#screenTask').hidden && !state.rolling;
  if ((key === 'dotsShow' || key === 'resultShow') && taskShown) showExtras(state.current);
  renderDrawer();
}

// ---------- Schublade ----------

function toggleGridHtml(items, isOn, label = (x) => x) {
  return items.map((x) =>
    `<button data-val="${x}" class="${isOn(x) ? '' : 'off'}" aria-pressed="${isOn(x)}">${label(x)}</button>`).join('');
}

function renderDrawer() {
  for (const b of $$('#drawerTabs [data-tab]')) {
    b.classList.toggle('on', b.dataset.tab === S.settingsTab);
    b.setAttribute('aria-selected', String(b.dataset.tab === S.settingsTab));
  }
  for (const sec of $$('#drawerBody section')) sec.hidden = sec.dataset.tab !== S.settingsTab;

  // Spiel: gewürfelte Aufgaben
  $('#drawnCount').textContent = `${doneInTopf()} von ${pool.topf.length}`;
  $('#drawnHint').textContent = state.drawnSort === 'size'
    ? 'Nach Ergebnis sortiert, zum Prüfen bei „Bingo!“. Die neueste ist gelb umrandet.'
    : 'In der Reihenfolge, in der sie gewürfelt wurden. Die neueste ist gelb umrandet.';
  $('#btnSort').textContent = state.drawnSort === 'size' ? 'In Reihenfolge zeigen' : 'Nach Größe sortieren';
  const box = $('#drawnTasks');
  const drawn = visibleHistory();
  if (!drawn.length) {
    box.innerHTML = '<span class="drawn-empty">Noch nichts gewürfelt.</span>';
  } else {
    const last = drawn[drawn.length - 1];
    const list = state.drawnSort === 'size'
      ? [...drawn].sort((a, b) => a.r - b.r)
      : drawn;
    box.innerHTML = list.map((t) => (state.drawnSort === 'size'
      ? `<span class="chip ${t === last ? 'last' : ''}">${t.r}<small>${fmt(t)}</small></span>`
      : `<span class="chip ${t === last ? 'last' : ''}">${fmt(t)}<small>= ${t.r}</small></span>`)).join('');
  }
  $('#btnUndo').disabled = !drawn.length;
  $('#btnReset').disabled = !state.history.length;
  $('#btnSort').hidden = drawn.length < 2;

  // Spiel: Topf
  const ex = new Set(S.excluded);
  $('#topfGrid').innerHTML = toggleGridHtml(pool.results, (r) => !ex.has(r) && pool.byResult.has(r));
  $('#topfCount').textContent = `${pool.topf.length} von ${pool.results.length}`;
  $('#btnTopfNoZero').hidden = !pool.results.includes(0);
  $('#btnTopfNoZero').classList.toggle('light', !ex.has(0));

  // Aufgaben: Schnellwahl, Rechenart, Zahlenraum, Reihen
  $('#presets').innerHTML = PRESETS.map((p, i) => {
    const on = Object.keys(p.s).every((k) => JSON.stringify(p.s[k]) === JSON.stringify(S[k]));
    return `<button class="sbtn ${on ? '' : 'light'}" data-preset="${i}">${p.name}</button>`;
  }).join('');
  for (const b of $$('#modeSeg [data-mode]')) b.classList.toggle('on', b.dataset.mode === S.mode);
  $('#rowMax').hidden = $('#rowCrossing').hidden = !hasAddSub(S);
  $('#rowRows').hidden = $('#rowSquares').hidden = !hasMulDiv(S);
  for (const b of $$('#maxSeg [data-max]')) b.classList.toggle('on', +b.dataset.max === S.max);
  $('#chkCrossing').checked = S.crossing;
  $('#rowGrid').innerHTML = toggleGridHtml(ALL_ROWS, (r) => S.rows.includes(r), (r) => `${r}er`);
  $('#chkSquares').checked = S.squares;

  // Dieses iPad
  for (const el of $$('[data-opt]')) {
    const v = S[el.dataset.opt];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  for (const b of $$('#dotsSeg [data-show]')) b.classList.toggle('on', b.dataset.show === S.dotsShow);
  for (const b of $$('#resultSeg [data-show]')) b.classList.toggle('on', b.dataset.show === S.resultShow);
  $('#volVal').textContent = `${Math.round(S.volume * 100)} %`;
  $('#soundList').innerHTML = SOUND_LIST.map((s) =>
    `<button data-sound="${s.key}" class="${s.key === S.sound ? 'on' : ''}" aria-pressed="${s.key === S.sound}">${s.name}</button>`).join('');
  $('#rowFullscreen').hidden = !canFullscreen || isFullscreen();

  renderSwitch();
  renderSync();
}

function openDrawer() { learning = false; renderDrawer(); $('#drawer').hidden = false; }
function closeDrawer() { $('#drawer').hidden = true; }

// ---------- Vollbild ----------

const fsTarget = document.documentElement;
const canFullscreen = !!(fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

function requestFullscreen() {
  if (!canFullscreen || isFullscreen()) return;
  try {
    const req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen;
    const p = req.call(fsTarget);
    if (p && p.catch) p.catch(() => {});
  } catch { /* Vollbild nicht erlaubt – dann eben im Fenster */ }
}

// ---------- Ereignisse ----------

function bind() {
  // Spiel: Berühren würfelt, Tippen auf die Aufgabe wiederholt die Ansage
  $('#btnTouch').addEventListener('click', () => { if (!switchClick() && tapOK()) roll(); });
  $('#screenTask').addEventListener('click', taskTap);
  $('#btnResult').addEventListener('click', (e) => {
    e.stopPropagation(); // nicht zusätzlich die Ansage wiederholen
    if (switchClick()) return; // der Taster würfelt nur
    $('#btnResult').hidden = true;
    $('#result').hidden = false;
  });
  $('#btnDots').addEventListener('click', (e) => {
    e.stopPropagation();
    if (switchClick()) return;
    $('#btnDots').hidden = true;
    if (state.current) $('#dots').innerHTML = dotsHtml(state.current);
  });
  $('#btnWeiter').addEventListener('click', () => { if (!switchClick()) weiter(); });
  $('#btnGear').addEventListener('click', openDrawer);
  $('#btnCloseDrawer').addEventListener('click', closeDrawer);
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') closeDrawer(); });


  // Schublade
  $('#btnUndo').addEventListener('click', async () => {
    const last = visibleHistory().pop();
    if (!last || state.rolling) return;
    if (net.code && !(await askConfirm(`„${fmt(last)}“ für alle verbundenen iPads zurücknehmen?`))) return;
    undoLast();
  });
  $('#btnReset').addEventListener('click', async () => {
    if (!(await askConfirm(net.code
      ? 'Neues Spiel für alle verbundenen iPads starten? Die bisher gewürfelten Aufgaben werden gelöscht.'
      : 'Neues Spiel starten? Die bisher gewürfelten Aufgaben werden gelöscht.'))) return;
    newRound();
    backToTouch();
    renderDrawer();
  });
  $('#drawerTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.settingsTab = b.dataset.tab;
    save();
    renderDrawer();
    $('#drawerBody').scrollTop = 0;
  });
  $('#btnSort').addEventListener('click', () => {
    state.drawnSort = state.drawnSort === 'size' ? 'order' : 'size';
    renderDrawer();
  });
  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (b) changeGame(PRESETS[+b.dataset.preset].s);
  });
  $('#modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) changeGame({ mode: b.dataset.mode });
  });
  $('#maxSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-max]');
    if (b) changeGame({ max: +b.dataset.max });
  });
  $('#chkCrossing').addEventListener('change', (e) => changeGame({ crossing: e.target.checked }));
  $('#chkSquares').addEventListener('change', (e) => changeGame({ squares: e.target.checked }));
  $('#rowGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-val]');
    if (!b) return;
    const r = +b.dataset.val;
    const rows = S.rows.includes(r) ? S.rows.filter((x) => x !== r) : [...S.rows, r].sort((a, c) => a - c);
    changeGame({ rows });
  });
  $('#btnRowsCore').addEventListener('click', () => changeGame({ rows: CORE_ROWS }));
  $('#btnRowsAll').addEventListener('click', () => changeGame({ rows: ALL_ROWS }));

  $('#topfGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-val]');
    if (!b) return;
    const r = +b.dataset.val;
    setExcluded(S.excluded.includes(r) ? S.excluded.filter((x) => x !== r) : [...S.excluded, r]);
  });
  $('#btnTopfAll').addEventListener('click', () => setExcluded([]));
  $('#btnTopfNone').addEventListener('click', () => setExcluded(pool.results));
  $('#btnTopfNoZero').addEventListener('click', () =>
    setExcluded(S.excluded.includes(0) ? S.excluded.filter((x) => x !== 0) : [...S.excluded, 0]));

  for (const el of $$('[data-opt]')) {
    const key = el.dataset.opt;
    const read = () => (el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value);
    el.addEventListener(el.type === 'range' ? 'input' : 'change', () => setOption(key, read()));
  }
  $('#dotsSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]');
    if (b) setOption('dotsShow', b.dataset.show);
  });
  $('#resultSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-show]');
    if (b) setOption('resultShow', b.dataset.show);
  });
  $('#soundList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sound]');
    if (!b) return;
    S.sound = b.dataset.sound;
    save();
    renderDrawer();
    previewSound(S.sound);
  });
  $('#btnTestVoice').addEventListener('click', () => { initAudio(); announce({ a: 7, op: '+', b: 3 }); });
  $('#btnFullscreen').addEventListener('click', () => { requestFullscreen(); closeDrawer(); });
  document.addEventListener('fullscreenchange', renderDrawer);
  document.addEventListener('webkitfullscreenchange', renderDrawer);
}

// ---------- Start ----------

joinFromUrl();
bind();
bindSwitch();
bindSync();
renderStartText();
backToTouch();
connect();
