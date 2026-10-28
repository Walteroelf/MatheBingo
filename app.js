'use strict';

// ---------- Grunddaten ----------

const STORE = 'rechenbingo-v1';
const ALL_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CORE_ROWS = [1, 2, 5, 10];
// Abstände der Würfel-Bilder in ms: erst schnell, dann langsamer (wie beim ABC-Bingo)
const ROLL_MS = [28, 54, 82, 112, 144, 178, 214, 252, 292, 334, 378, 424];

const DEFAULTS = {
  mode: 'plus', zero: false,
  max: 10, crossing: true,
  rows: CORE_ROWS, squares: true, swap: true, factorMax: 10,
  fair: 'ergebnis', noRepeat: true, autoMark: true,
  speech: true, voice: '', rate: 0.85, gap: 0.5, volume: 1,
  dots: true, animation: true, fxDrum: true, fxConfetti: true,
};

// Änderungen an diesen Einstellungen ergeben andere Aufgaben -> neue Runde
const POOL_KEYS = ['mode', 'zero', 'max', 'crossing', 'rows', 'squares', 'swap', 'factorMax', 'fair'];

const PRESETS = [
  { name: 'Plus bis 5', s: { mode: 'plus', max: 5, zero: false, crossing: true } },
  { name: 'Plus bis 10', s: { mode: 'plus', max: 10, zero: false, crossing: true } },
  { name: 'Minus bis 10', s: { mode: 'minus', max: 10, zero: false, crossing: true } },
  { name: 'Plus & Minus bis 10', s: { mode: 'plusminus', max: 10, zero: false, crossing: true } },
  { name: 'Plus & Minus bis 20 ohne Zehnerübergang', s: { mode: 'plusminus', max: 20, zero: false, crossing: false } },
  { name: 'Plus & Minus bis 20', s: { mode: 'plusminus', max: 20, zero: false, crossing: true } },
  { name: 'Plus & Minus bis 30', s: { mode: 'plusminus', max: 30, zero: true, crossing: true } },
  { name: '1×1 Kernaufgaben', s: { mode: 'mal', rows: CORE_ROWS, squares: true, swap: true, factorMax: 10, zero: false } },
  { name: 'Ganzes 1×1', s: { mode: 'mal', rows: ALL_ROWS, squares: false, swap: true, factorMax: 10, zero: false } },
  { name: 'Geteilt Kernaufgaben', s: { mode: 'geteilt', rows: CORE_ROWS, squares: true, swap: false, factorMax: 10, zero: false } },
];

const OPS = {
  '+': { sym: '+', word: 'plus' },
  '-': { sym: '−', word: 'minus' },
  '*': { sym: '·', word: 'mal' },
  '/': { sym: ':', word: 'geteilt durch' },
};
const MODES = {
  plus: ['+'], minus: ['-'], plusminus: ['+', '-'],
  mal: ['*'], geteilt: ['/'], malgeteilt: ['*', '/'],
};
const MODE_NAMES = {
  plus: 'Plus', minus: 'Minus', plusminus: 'Plus und Minus',
  mal: 'Mal', geteilt: 'Geteilt', malgeteilt: 'Mal und Geteilt',
};
const CONFETTI_COLORS = ['#f0c020', '#ffffff', '#4dabf7', '#ff6b6b', '#7bd389'];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (t) => `${t.a} ${OPS[t.op].sym} ${t.b}`;

// ---------- Speicher ----------

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      settings: S, history: state.history, marked: [...state.marked], used: [...state.used],
    }));
  } catch { /* privates Fenster o. Ä. – dann eben ohne Speichern */ }
}

const saved = load();
let S = { ...DEFAULTS, ...(saved.settings || {}) };
const state = {
  history: saved.history || [],
  marked: new Set(saved.marked || []),
  used: new Set(saved.used || []),
  current: null,
  rolling: false,
};
state.current = state.history[state.history.length - 1] || null;
let pool = buildPool(S);

// ---------- Aufgaben erzeugen ----------

// Zehnerübergang: der Zehner ändert sich, ohne genau auf einem Zehner zu landen bzw. zu starten
function crosses(a, b, op) {
  const r = op === '+' ? a + b : a - b;
  if (Math.floor(a / 10) === Math.floor(r / 10)) return false;
  return op === '+' ? r % 10 !== 0 : a % 10 !== 0;
}

function buildPool(s) {
  const tasks = new Map();
  const lo = s.zero ? 0 : 1;
  const ops = MODES[s.mode];
  const add = (a, op, b, r) => {
    if (!s.zero && (a === 0 || b === 0 || r === 0)) return;
    const key = `${a}${op}${b}`;
    tasks.set(key, { a, op, b, r, key });
  };

  if (ops.includes('+')) {
    for (let a = lo; a <= s.max; a++)
      for (let b = lo; a + b <= s.max; b++)
        if (s.crossing || !crosses(a, b, '+')) add(a, '+', b, a + b);
  }
  if (ops.includes('-')) {
    for (let a = lo; a <= s.max; a++)
      for (let b = lo; b <= a; b++)
        if (s.crossing || !crosses(a, b, '-')) add(a, '-', b, a - b);
  }

  const pairs = [];
  for (const r of s.rows) {
    for (let k = lo; k <= s.factorMax; k++) {
      pairs.push([r, k]);
      if (s.swap) pairs.push([k, r]);
    }
  }
  if (s.squares) for (let n = 1; n <= s.factorMax; n++) pairs.push([n, n]);

  if (ops.includes('*')) for (const [x, y] of pairs) add(x, '*', y, x * y);
  if (ops.includes('/')) for (const [x, y] of pairs) if (x !== 0) add(x * y, '/', x, y);

  const list = [...tasks.values()];
  const byResult = new Map();
  for (const t of list) {
    if (!byResult.has(t.r)) byResult.set(t.r, []);
    byResult.get(t.r).push(t);
  }
  const results = [...byResult.keys()].sort((a, b) => a - b);
  return { tasks: list, results, byResult };
}

function describe(s) {
  const ops = MODES[s.mode];
  const parts = [MODE_NAMES[s.mode]];
  if (ops.includes('+') || ops.includes('-')) {
    parts[0] += ` bis ${s.max}`;
    if (!s.crossing) parts.push('ohne Zehnerübergang');
  }
  if (ops.includes('*') || ops.includes('/')) {
    const rows = s.rows.length === 10 ? 'alle Reihen'
      : s.rows.length ? `Reihen ${s.rows.join(', ')}` : 'keine Reihe';
    parts.push(rows + (s.squares ? ' + Quadrataufgaben' : ''));
  }
  if (s.zero) parts.push('mit Null');
  return parts.join(' · ');
}

// ---------- Auslosen ----------

const usedKey = (t) => (S.fair === 'ergebnis' ? 'r' + t.r : t.key);

// Liefert { t } oder { done: true }, wenn bei "nichts doppelt" alles dran war, oder null ohne Aufgaben
function draw() {
  const { tasks, results, byResult } = pool;
  if (!tasks.length) return null;
  const notLast = (cand, same) => (cand.length > 1 && state.current ? cand.filter((x) => !same(x)) : cand);

  if (S.fair === 'ergebnis') {
    let cand = results;
    if (S.noRepeat) {
      cand = results.filter((r) => !state.used.has('r' + r));
      if (!cand.length) return { done: true };
    }
    cand = notLast(cand, (r) => r === state.current.r);
    return { t: pick(byResult.get(pick(cand))) };
  }

  let cand = tasks;
  if (S.noRepeat) {
    cand = tasks.filter((t) => !state.used.has(t.key));
    if (!cand.length) return { done: true };
  }
  cand = notLast(cand, (t) => t.key === state.current.key);
  return { t: pick(cand) };
}

function countText() {
  if (!S.noRepeat) return `Bereits gewürfelt: ${state.history.length}`;
  const total = S.fair === 'ergebnis' ? pool.results.length : pool.tasks.length;
  return `Bereits gewürfelt: ${state.used.size} von ${total}`;
}

// ---------- Ton: Sprachausgabe, Trommel ----------

const hasSpeech = 'speechSynthesis' in window;

function germanVoices() {
  if (!hasSpeech) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
}

let speechRun = 0;

function speakOne(text) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const voice = germanVoices().find((v) => v.name === S.voice);
    if (voice) u.voice = voice;
    u.rate = S.rate;
    u.volume = S.volume;
    let done = false;
    // Manche Browser melden das Ende nicht zuverlässig – dann nach geschätzter Zeit weiter
    const timer = setTimeout(() => finish(), 1500 + (text.length * 160) / S.rate);
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    }
    u.onend = finish;
    u.onerror = finish;
    speechSynthesis.speak(u);
  });
}

function stopSpeech() {
  speechRun++;
  if (hasSpeech) speechSynthesis.cancel();
}

async function speak(words) {
  if (!S.speech || !hasSpeech) return;
  stopSpeech();
  const run = speechRun;
  if (S.gap <= 0) { await speakOne(words.join(' ')); return; }
  for (let i = 0; i < words.length; i++) {
    if (run !== speechRun) return; // abgebrochen, z. B. durch „Weiter“
    await speakOne(words[i]);
    if (i < words.length - 1) await sleep(S.gap * 1000);
  }
}

const announce = (t) => speak([String(t.a), OPS[t.op].word, String(t.b)]);

let audioCtx = null;
let noiseBuf = null;

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

// Trommelschlag aus Rauschen und tiefem Ton, im Browser erzeugt
function drumTick(strength) {
  if (!S.fxDrum || !audioCtx || audioCtx.state !== 'running') return;
  const ctx = audioCtx;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.15), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime;
  const vol = S.volume * strength;

  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.5 * vol), t + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  src.connect(bp); bp.connect(env); env.connect(ctx.destination);
  src.start(t); src.stop(t + 0.15);

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
  const og = ctx.createGain();
  og.gain.setValueAtTime(Math.max(0.0002, 0.4 * vol), t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(og); og.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.13);
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
  const palette = CONFETTI_COLORS;
  const parts = Array.from({ length: 90 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.45,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
    s: 6 + Math.random() * 8, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    c: pick(palette),
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

// ---------- Spielansicht ----------

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
  el.hidden = state.history.length === 0;
}

function rollAnimation(el) {
  return new Promise((resolve) => {
    let idx = 0;
    const t0 = performance.now();
    (function frame(now) {
      if (now - t0 >= ROLL_MS[idx]) {
        el.innerHTML = taskHtml(pick(pool.tasks));
        drumTick(0.5 + (0.5 * idx) / ROLL_MS.length);
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

async function roll() {
  if (state.rolling) return;
  initAudio();
  const d = draw();
  if (!d) {
    showDone('Mit diesen Einstellungen gibt es keine Aufgaben.', 'Über ⚙️ → Hauptmenü eine andere Spielart wählen.');
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
  $('#btnWeiter').hidden = true;
  const el = $('#task');
  $('#dots').innerHTML = '';
  if (S.animation) {
    el.classList.add('rolling');
    await rollAnimation(el);
    el.classList.remove('rolling');
  }

  const t = d.t;
  state.current = t;
  state.history.push(t);
  if (S.noRepeat) state.used.add(usedKey(t));
  if (S.autoMark) state.marked.add(t.r);
  save();

  el.innerHTML = taskHtml(t);
  $('#dots').innerHTML = dotsHtml(t);
  state.rolling = false;
  $('#btnWeiter').hidden = false;
  renderTouchCount();
  confetti();
  announce(t);
}

function repeatCurrent() {
  if (state.rolling || !state.current) return;
  announce(state.current);
  const h = $('#repeatHint');
  h.classList.add('show');
  clearTimeout(repeatCurrent.tm);
  repeatCurrent.tm = setTimeout(() => h.classList.remove('show'), 800);
}

async function weiter() {
  if (state.rolling) return;
  stopSpeech();
  stopConfetti();
  $('#btnWeiter').hidden = true;
  if (!$('#screenDone').hidden && pool.tasks.length) newRound();
  renderTouchCount();
  showScreen('touch');
}

function newRound() {
  state.history = [];
  state.marked.clear();
  state.used.clear();
  state.current = null;
  stopSpeech();
  save();
  renderTouchCount();
  renderDrawer();
  renderNotar();
}

// Letzte Aufgabe zurücknehmen: aus Verlauf, "schon dran" und Notar entfernen
function undoLast() {
  const t = state.history.pop();
  if (!t) return;
  state.used.delete(usedKey(t));
  if (!state.history.some((h) => h.r === t.r)) state.marked.delete(t.r);
  state.current = state.history[state.history.length - 1] || null;
  save();
  stopSpeech();
  stopConfetti();
  $('#btnWeiter').hidden = true;
  showScreen('touch');
  renderTouchCount();
  renderDrawer();
}

// ---------- Schublade im Spiel ----------

function renderDrawer() {
  $('#drawerMode').textContent = `${describe(S)} · ${countText()}`;
  const box = $('#drawnTasks');
  if (!state.history.length) {
    box.innerHTML = '<span class="drawn-empty">Noch nichts gewürfelt.</span>';
  } else {
    const last = state.history.length - 1;
    box.innerHTML = state.history
      .map((t, i) => `<span class="chip ${i === last ? 'last' : ''}">${fmt(t)} <small>(${t.r})</small></span>`)
      .join('');
  }
  $('#btnUndo').disabled = !state.history.length;
  for (const el of $$('[data-fx]')) {
    const v = S[el.dataset.fx];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  $('#btnFullscreen').hidden = !canFullscreen || isFullscreen();
}

function openDrawer() { renderDrawer(); $('#drawer').hidden = false; }
function closeDrawer() { $('#drawer').hidden = true; }

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
  if (t.op === '*') {
    if (!t.a || !t.b) return '';
    return arrayHtml(t.a, t.b);
  }
  return ''; // Geteilt: kein Bild, das würde das Ergebnis verraten
}

// ---------- Notar ----------

function renderNotar() {
  const source = new Map();
  for (const t of state.history) source.set(t.r, t);
  $('#notarGrid').innerHTML = pool.results.map((r) => {
    const on = state.marked.has(r);
    const src = source.has(r) ? fmt(source.get(r)) : '';
    return `<button class="cell ${on ? 'on' : ''}" data-r="${r}" aria-pressed="${on}">
      <span class="num">${r}</span><span class="src">${src}</span></button>`;
  }).join('');
  const marked = pool.results.filter((r) => state.marked.has(r)).length;
  $('#notarCount').textContent = `${marked} von ${pool.results.length} Zahlen markiert`;
}

// ---------- Bingokarten ----------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeCards() {
  const n = +$('#cardSize').value;
  const count = Math.min(40, Math.max(1, +$('#cardCount').value || 1));
  const cells = n * n;
  const results = pool.results;
  if (results.length < cells) {
    $('#cardStatus').textContent = `Für ${n} × ${n} braucht man ${cells} verschiedene Zahlen, es gibt aber nur ${results.length}. `
      + 'Bitte kleinere Karten wählen oder den Zahlenraum vergrößern.';
    $('#cards').innerHTML = '';
    $('#cardPrint').disabled = true;
    return;
  }
  const sorted = $('#cardSorted').checked;
  let html = '';
  for (let c = 0; c < count; c++) {
    const nums = shuffle(results).slice(0, cells);
    if (sorted) nums.sort((a, b) => a - b);
    html += `<div class="bingo-card">
      <div class="title">Mathe-Bingo</div>
      <div class="sub">${describe(S)}</div>
      <div class="card-grid schrift" style="--n:${n}">${nums.map((x) => `<div>${x}</div>`).join('')}</div>
    </div>`;
  }
  $('#cards').innerHTML = html;
  $('#cardStatus').textContent = `${count} Karten mit je ${cells} Zahlen erstellt. Bei jedem Klick auf „Karten erstellen“ werden sie neu gemischt.`;
  $('#cardPrint').disabled = false;
}

// ---------- Einstellungen ----------

function buildSettingsUi() {
  $('#rowBoxes').innerHTML = ALL_ROWS.map((r) =>
    `<label class="check"><input type="checkbox" class="row-cb" value="${r}"> ${r}er</label>`).join('');
  $('#presets').innerHTML = PRESETS.map((p, i) =>
    `<button type="button" data-preset="${i}">${p.name}</button>`).join('');
  fillVoices();
  if (hasSpeech) speechSynthesis.onvoiceschanged = fillVoices;
}

function fillVoices() {
  const sel = $('#voiceSelect');
  const voices = germanVoices();
  sel.innerHTML = '<option value="">Standard</option>'
    + voices.map((v) => `<option value="${v.name.replace(/"/g, '&quot;')}">${v.name}</option>`).join('');
  sel.value = voices.some((v) => v.name === S.voice) ? S.voice : '';
}

function writeForm() {
  for (const el of $$('[data-key]')) {
    const v = S[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  }
  for (const el of $$('.row-cb')) el.checked = S.rows.includes(+el.value);
  refreshSettingsView();
}

function readForm() {
  const s = { ...S };
  for (const el of $$('[data-key]')) {
    const k = el.dataset.key;
    if (el.type === 'checkbox') s[k] = el.checked;
    else if (typeof DEFAULTS[k] === 'number') s[k] = Number(el.value);
    else s[k] = el.value;
  }
  s.max = Math.min(100, Math.max(2, Math.round(s.max) || DEFAULTS.max));
  s.rows = $$('.row-cb:checked').map((el) => +el.value);
  return s;
}

function sameValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

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

async function applySettings(next) {
  const poolChanged = POOL_KEYS.some((k) => !sameValue(next[k], S[k]));
  if (poolChanged && state.history.length
      && !(await askConfirm('Mit den neuen Einstellungen beginnt eine neue Runde. Bisher gestellte Aufgaben und Markierungen werden gelöscht.'))) {
    writeForm();
    return false;
  }
  S = next;
  if (poolChanged) {
    pool = buildPool(S);
    newRound();
  }
  save();
  writeForm();
  return true;
}

function refreshSettingsView() {
  const ops = MODES[S.mode];
  $('#fsAdd').hidden = !(ops.includes('+') || ops.includes('-'));
  $('#fsMul').hidden = !(ops.includes('*') || ops.includes('/'));
  $('#rateOut').textContent = S.rate.toFixed(2).replace('.', ',');
  $('#gapOut').textContent = `${S.gap.toFixed(1).replace('.', ',')} s`;
  $('#volOut').textContent = `${Math.round(S.volume * 100)} %`;
  for (const b of $$('[data-preset]')) {
    const p = PRESETS[+b.dataset.preset].s;
    b.classList.toggle('active', Object.keys(p).every((k) => sameValue(p[k], S[k])));
  }
  for (const b of $$('[data-max]')) b.classList.toggle('primary', +b.dataset.max === S.max);
  const sum = $('#summary');
  if (!pool.tasks.length) {
    sum.textContent = 'Mit diesen Einstellungen gibt es keine Aufgaben.';
    sum.classList.add('warn');
  } else {
    sum.textContent = `${pool.tasks.length} verschiedene Aufgaben · ${pool.results.length} verschiedene Ergebnisse`;
    sum.classList.remove('warn');
  }
}

// ---------- Start und Vollbild ----------

function renderStart() {
  $('#startGrid').innerHTML = PRESETS.map((p, i) => {
    const pp = buildPool({ ...S, ...p.s });
    const example = pp.tasks[Math.floor(pp.tasks.length * 0.6)];
    return `<button class="start-tile" data-start="${i}">
      <span class="tile-name">${p.name}</span>
      <span class="tile-sub">z. B. ${fmt(example)}<br>${pp.results.length} Zahlen im Bingo</span>
    </button>`;
  }).join('')
    + `<button class="start-tile custom" data-start="custom">
      <span class="tile-name">⚙️ Eigene Einstellung</span>
      <span class="tile-sub">Zahlenraum, Reihen, Schwierigkeit selbst festlegen</span>
    </button>`;
  const running = state.history.length > 0;
  $('#continueBox').hidden = !running;
  if (running) $('#continueInfo').textContent = `${describe(S)} · ${countText()}`;
}

async function startWith(next) {
  if (!(await applySettings(next))) return;
  enterGame();
}

const fsTarget = document.documentElement;
const canFullscreen = !!(fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen);
const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

function requestFullscreen() {
  try {
    const req = fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen;
    const p = req && req.call(fsTarget);
    if (p && p.catch) p.catch(() => {});
  } catch { /* Vollbild nicht erlaubt – dann eben im Fenster */ }
}

function exitFullscreen() {
  if (!isFullscreen()) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    const p = exit && exit.call(document);
    if (p && p.catch) p.catch(() => {});
  } catch { /* egal */ }
}

function enterGame() {
  initAudio();
  closeDrawer();
  $('#btnWeiter').hidden = true;
  renderTouchCount();
  showScreen('touch');
  $('#game').hidden = false;
  document.body.classList.add('in-game');
  requestFullscreen();
}

function exitGame() {
  stopSpeech();
  stopConfetti();
  closeDrawer();
  $('#game').hidden = true;
  document.body.classList.remove('in-game');
  exitFullscreen();
  showView('start');
}

const inGame = () => !$('#game').hidden;

// ---------- Navigation und Ereignisse ----------

function showView(name) {
  for (const t of $$('.tab')) t.setAttribute('aria-selected', String(t.dataset.view === name));
  for (const v of $$('.view')) v.classList.toggle('active', v.id === `view-${name}`);
  if (name === 'notar') renderNotar();
  if (name === 'start') renderStart();
}

function bind() {
  for (const t of $$('.tab')) t.addEventListener('click', () => showView(t.dataset.view));

  // Spiel: Berühren würfelt, Tippen auf die Aufgabe wiederholt die Ansage
  $('#btnTouch').addEventListener('click', roll);
  $('#screenTask').addEventListener('click', repeatCurrent);
  $('#btnWeiter').addEventListener('click', weiter);
  $('#btnGear').addEventListener('click', openDrawer);
  $('#btnCloseDrawer').addEventListener('click', closeDrawer);
  $('#drawer').addEventListener('click', (e) => { if (e.target.id === 'drawer') closeDrawer(); });
  $('#btnMenu').addEventListener('click', exitGame);
  $('#btnFullscreen').addEventListener('click', () => { requestFullscreen(); closeDrawer(); });
  $('#btnUndo').addEventListener('click', undoLast);
  $('#btnReset').addEventListener('click', async () => {
    if (!(await askConfirm('Neue Runde starten? Bisher gewürfelte Aufgaben und Markierungen im Notar werden gelöscht.'))) return;
    newRound();
    stopConfetti();
    $('#btnWeiter').hidden = true;
    showScreen('touch');
    closeDrawer();
  });
  $('#drawer').addEventListener('change', (e) => {
    const k = e.target.dataset.fx;
    if (!k) return;
    S[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    if (k === 'dots' && state.current && !$('#screenTask').hidden) $('#dots').innerHTML = dotsHtml(state.current);
    save();
    writeForm();
  });

  // Tastatur im Spiel: Leertaste/Enter würfelt bzw. drückt „Weiter“
  document.addEventListener('keydown', (e) => {
    if (!inGame() || !$('#drawer').hidden || $('#confirmDlg').open) return;
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    if (!$('#btnWeiter').hidden) weiter();
    else if (!$('#screenTouch').hidden) roll();
  });

  $('#notarGrid').addEventListener('click', (e) => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const r = +cell.dataset.r;
    if (state.marked.has(r)) state.marked.delete(r); else state.marked.add(r);
    save();
    renderNotar();
  });
  $('#notarReset').addEventListener('click', async () => {
    if (!(await askConfirm('Alle Markierungen im Notar löschen?'))) return;
    state.marked.clear();
    save();
    renderNotar();
  });

  $('#cardGen').addEventListener('click', makeCards);
  $('#cardPrint').addEventListener('click', () => window.print());

  $('#settings').addEventListener('change', () => applySettings(readForm()));
  $('#settings').addEventListener('input', (e) => {
    if (e.target.type === 'range') { S = readForm(); save(); refreshSettingsView(); }
  });
  $('#presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (b) applySettings({ ...S, ...PRESETS[+b.dataset.preset].s });
  });
  $('#maxQuick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-max]');
    if (b) applySettings({ ...S, max: +b.dataset.max });
  });
  $('#rowsCore').addEventListener('click', () => applySettings({ ...S, rows: CORE_ROWS }));
  $('#rowsAll').addEventListener('click', () => applySettings({ ...S, rows: ALL_ROWS }));
  $('#rowsNone').addEventListener('click', () => applySettings({ ...S, rows: [] }));
  $('#testSpeech').addEventListener('click', () => speak(['3', 'plus', '4']));

  $('#startGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-start]');
    if (!b) return;
    if (b.dataset.start === 'custom') showView('einstellungen');
    else startWith({ ...S, ...PRESETS[+b.dataset.start].s });
  });
  $('#continueBtn').addEventListener('click', enterGame);
  $('#startCustom').addEventListener('click', enterGame);
}

// ---------- Start ----------

buildSettingsUi();
writeForm();
bind();
renderNotar();
showView('start');
