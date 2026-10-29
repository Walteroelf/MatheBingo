'use strict';

// Würfel im Stil des ABC-Bingos; Grundlagen (Topf, Aufgaben, Speicher) stehen in core.js

// Abstände der Würfel-Bilder in ms: erst schnell, dann langsamer
const ROLL_MS = [28, 54, 82, 112, 144, 178, 214, 252, 292, 334, 378, 424];
const CONFETTI_COLORS = ['#f0c020', '#ffffff', '#4dabf7', '#ff6b6b', '#7bd389'];

const stored = loadStore();
let S = stored.settings;
const state = {
  history: stored.history,
  used: new Set(stored.used),   // Ergebnisse, die in dieser Runde schon dran waren
  current: stored.history[stored.history.length - 1] || null,
  rolling: false,
  drawnSort: 'order',
};
let pool = buildPool(S);

function save() {
  saveStore({ settings: S, history: state.history, used: [...state.used] });
}

// ---------- Auslosen: jedes Ergebnis im Topf einmal pro Runde ----------

const leftInTopf = () => pool.topf.filter((r) => !state.used.has(r));
const doneInTopf = () => pool.topf.filter((r) => state.used.has(r)).length;
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
const JOIN_GAP_S = 0.05;   // kurze Pause zwischen „sieben plus“ und „drei“, wie im gesprochenen Satz
const SILENCE = 0.004;
const clipCache = new Map();

// Hörbaren Teil bestimmen. Schneidet auch die Stille ab, die das m4a-Format am Anfang
// einfügt – sonst entsteht an der Nahtstelle ein kleines Stocken.
function audible(buf) {
  const d = buf.getChannelData(0);
  let a = 0;
  let b = d.length - 1;
  while (a < b && Math.abs(d[a]) < SILENCE) a++;
  while (b > a && Math.abs(d[b]) < SILENCE) b--;
  const start = Math.max(0, a / buf.sampleRate - 0.01);
  const end = Math.min(buf.duration, b / buf.sampleRate + 0.03);
  return { buf, start, dur: Math.max(0.01, end - start) };
}
let voiceSources = [];
let speechRun = 0;

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
  if (hasSpeech) speechSynthesis.cancel();
}

// delay: Sekunden Wartezeit, damit der Abschluss-Klang nicht überdeckt wird
async function announce(t, delay = 0) {
  if (!S.speech) return;
  stopSpeech();
  const run = speechRun;
  if (await playThorsten(t, run, delay)) return;
  if (delay) await sleep(delay * 1000);
  if (run === speechRun) speakFallback(`${t.a} ${OPS[t.op].word} ${t.b}`);
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
  if (!S.dots) return '';
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
}

function renderTouchCount() {
  const el = $('#touchCount');
  el.textContent = countText();
  el.hidden = doneInTopf() === 0;
}

function rollAnimation(el) {
  return new Promise((resolve) => {
    let idx = 0;
    const t0 = performance.now();
    (function frame(now) {
      if (now - t0 >= ROLL_MS[idx]) {
        el.innerHTML = taskHtml(pick(pool.tasks));
        idx++;
      }
      if (idx < ROLL_MS.length) requestAnimationFrame(frame);
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

async function roll() {
  if (state.rolling) return;
  initAudio();
  // Beim ersten Tippen ins Vollbild (geht nur als Reaktion auf einen Tipp)
  if (!triedFullscreen) { triedFullscreen = true; requestFullscreen(); }
  const d = draw();
  if (d && d.t) preloadVoice(d.t);
  if (!d) {
    showDone('Keine Zahlen im Topf.', 'Über ⚙️ unten links Zahlen in den Topf legen.');
    return;
  }
  if (d.done) {
    showDone('Alle Aufgaben wurden gewürfelt! 🎉', 'Drücke „Weiter“, um neu zu starten.');
    return;
  }

  state.rolling = true;
  stopSpeech();
  stopConfetti();
  showScreen('task');
  showResultControls(null);
  $('#btnWeiter').hidden = true;
  const el = $('#task');
  $('#dots').innerHTML = '';
  el.classList.add('rolling');
  const out = soundOut();
  if (out) currentSound().roll(audioCtx, out, audioCtx.currentTime + 0.02, rollTicks());
  await rollAnimation(el);
  el.classList.remove('rolling');
  if (out) currentSound().finale(audioCtx, out, audioCtx.currentTime + 0.01);

  const t = d.t;
  state.current = t;
  state.history.push(t);
  state.used.add(t.r);
  save();

  el.innerHTML = taskHtml(t);
  $('#dots').innerHTML = dotsHtml(t);
  showResultControls(t);
  state.rolling = false;
  $('#btnWeiter').hidden = false;
  renderTouchCount();
  confetti();
  announce(t, currentSound().speechDelay);
}

// Ergebnis-Knopf (optional): erst der Knopf, nach dem Antippen das Ergebnis an seiner Stelle
function showResultControls(t) {
  $('#result').textContent = t ? `= ${t.r}` : '';
  $('#result').hidden = true;
  $('#btnResult').hidden = !(t && S.resultBtn);
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
  if (!$('#screenDone').hidden && pool.topf.length) newRound();
  renderTouchCount();
  showScreen('touch');
}

function backToTouch() {
  stopSpeech();
  stopConfetti();
  $('#btnWeiter').hidden = true;
  showScreen('touch');
  renderTouchCount();
}

function newRound() {
  state.history = [];
  state.used.clear();
  state.current = null;
  save();
}

// Letzte Aufgabe zurücknehmen: aus Verlauf und "schon dran" entfernen
function undoLast() {
  const t = state.history.pop();
  if (!t) return;
  if (!state.history.some((h) => h.r === t.r)) state.used.delete(t.r);
  state.current = state.history[state.history.length - 1] || null;
  save();
  backToTouch();
  renderDrawer();
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
      && !(await askConfirm('Damit beginnt ein neues Spiel. Die bisher gewürfelten Aufgaben werden gelöscht.'))) {
    renderDrawer();
    return;
  }
  S = { ...next, excluded: S.excluded.filter((r) => r === 0) };
  pool = buildPool(S);
  newRound();
  backToTouch();
  renderDrawer();
}

// Zahlen im Topf ändern: die Runde läuft weiter, wie beim ABC-Bingo
function setExcluded(list) {
  S.excluded = [...new Set(list)].sort((a, b) => a - b);
  pool = buildPool(S);
  save();
  renderTouchCount();
  renderDrawer();
}

function setOption(key, value) {
  S[key] = value;
  save();
  const taskShown = state.current && !$('#screenTask').hidden && !state.rolling;
  if (key === 'dots' && taskShown) $('#dots').innerHTML = dotsHtml(state.current);
  if (key === 'resultBtn' && taskShown) showResultControls(state.current);
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
  if (!state.history.length) {
    box.innerHTML = '<span class="drawn-empty">Noch nichts gewürfelt.</span>';
  } else {
    const last = state.history[state.history.length - 1];
    const list = state.drawnSort === 'size'
      ? [...state.history].sort((a, b) => a.r - b.r)
      : state.history;
    box.innerHTML = list.map((t) => (state.drawnSort === 'size'
      ? `<span class="chip ${t === last ? 'last' : ''}">${t.r}<small>${fmt(t)}</small></span>`
      : `<span class="chip ${t === last ? 'last' : ''}">${fmt(t)}<small>= ${t.r}</small></span>`)).join('');
  }
  $('#btnUndo').disabled = !state.history.length;
  $('#btnReset').disabled = !state.history.length;
  $('#btnSort').hidden = state.history.length < 2;

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
  $('#volVal').textContent = `${Math.round(S.volume * 100)} %`;
  $('#soundList').innerHTML = SOUND_LIST.map((s) =>
    `<button data-sound="${s.key}" class="${s.key === S.sound ? 'on' : ''}" aria-pressed="${s.key === S.sound}">${s.name}</button>`).join('');
  $('#rowFullscreen').hidden = !canFullscreen || isFullscreen();
}

function openDrawer() { renderDrawer(); $('#drawer').hidden = false; }
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
  $('#btnTouch').addEventListener('click', roll);
  $('#screenTask').addEventListener('click', repeatCurrent);
  $('#btnResult').addEventListener('click', (e) => {
    e.stopPropagation(); // nicht zusätzlich die Ansage wiederholen
    $('#btnResult').hidden = true;
    $('#result').hidden = false;
  });
  $('#btnWeiter').addEventListener('click', weiter);
  $('#btnGear').addEventListener('click', openDrawer);
  $('#btnCloseDrawer').addEventListener('click', closeDrawer);
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') closeDrawer(); });

  // Tastatur: Leertaste/Enter würfelt bzw. drückt „Weiter“
  document.addEventListener('keydown', (e) => {
    if (!$('#drawer').hidden || $('#confirmDlg').open) return;
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    if (!$('#btnWeiter').hidden) weiter();
    else if (!$('#screenTouch').hidden) roll();
  });

  // Schublade
  $('#btnUndo').addEventListener('click', undoLast);
  $('#btnReset').addEventListener('click', async () => {
    if (!(await askConfirm('Neues Spiel starten? Die bisher gewürfelten Aufgaben werden gelöscht.'))) return;
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

bind();
renderTouchCount();
showScreen('touch');
