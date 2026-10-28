'use strict';

// Gemeinsame Grundlage für den Würfel (index.html) und die Ausdrucke (druck.html)

const STORE = 'mathebingo-v2';
const ALL_ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CORE_ROWS = [1, 2, 5, 10];

const DEFAULTS = {
  mode: 'plusminus',
  max: 20, crossing: true,
  rows: CORE_ROWS, squares: true,
  excluded: [],          // aus dem Topf genommene Ergebnisse
  speech: true, voice: '', rate: 0.85, volume: 1,
  dots: true, fxDrum: true, fxConfetti: true,
  settingsTab: 'spiel',   // zuletzt geöffneter Reiter in ⚙️
};

const PRESETS = [
  { name: 'Plus bis 10', s: { mode: 'plus', max: 10, crossing: true } },
  { name: 'Minus bis 10', s: { mode: 'minus', max: 10, crossing: true } },
  { name: 'Plus & Minus bis 10', s: { mode: 'plusminus', max: 10, crossing: true } },
  { name: 'Plus & Minus bis 20 ohne Zehnerübergang', s: { mode: 'plusminus', max: 20, crossing: false } },
  { name: 'Plus & Minus bis 20', s: { mode: 'plusminus', max: 20, crossing: true } },
  { name: 'Plus & Minus bis 30', s: { mode: 'plusminus', max: 30, crossing: true } },
  { name: '1×1 Kernaufgaben', s: { mode: 'mal', rows: CORE_ROWS, squares: true } },
  { name: 'Ganzes 1×1', s: { mode: 'mal', rows: ALL_ROWS, squares: false } },
  { name: 'Geteilt Kernaufgaben', s: { mode: 'geteilt', rows: CORE_ROWS, squares: true } },
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

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (t) => `${t.a} ${OPS[t.op].sym} ${t.b}`;
const hasAddSub = (s) => MODES[s.mode].some((op) => op === '+' || op === '-');
const hasMulDiv = (s) => MODES[s.mode].some((op) => op === '*' || op === '/');

// ---------- Speicher ----------

function loadStore() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { /* leer */ }
  return {
    settings: { ...DEFAULTS, ...(data.settings || {}) },
    history: data.history || [],
    used: data.used || [],
  };
}

function saveStore(data) {
  try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* privates Fenster o. Ä. */ }
}

// ---------- Aufgaben und Topf ----------

// Zehnerübergang: der Zehner ändert sich, ohne genau auf einem Zehner zu landen bzw. zu starten
function crosses(a, b, op) {
  const r = op === '+' ? a + b : a - b;
  if (Math.floor(a / 10) === Math.floor(r / 10)) return false;
  return op === '+' ? r % 10 !== 0 : a % 10 !== 0;
}

// Alle Aufgaben zur Einstellung. Plus und Minus beginnen bei 0, das Einmaleins bei 1.
// results: alle möglichen Ergebnisse; topf: die davon, die gerade im Topf liegen.
// Ist die 0 aus dem Topf genommen, fallen auch Aufgaben wie 3 + 0 weg.
function buildPool(s) {
  const all = new Map();
  const add = (a, op, b, r) => all.set(`${a}${op}${b}`, { a, op, b, r, key: `${a}${op}${b}` });
  const ops = MODES[s.mode];

  if (ops.includes('+')) {
    for (let a = 0; a <= s.max; a++)
      for (let b = 0; a + b <= s.max; b++)
        if (s.crossing || !crosses(a, b, '+')) add(a, '+', b, a + b);
  }
  if (ops.includes('-')) {
    for (let a = 0; a <= s.max; a++)
      for (let b = 0; b <= a; b++)
        if (s.crossing || !crosses(a, b, '-')) add(a, '-', b, a - b);
  }

  const pairs = [];
  for (const r of s.rows) for (let k = 1; k <= 10; k++) pairs.push([r, k], [k, r]);
  if (s.squares) for (let n = 1; n <= 10; n++) pairs.push([n, n]);
  if (ops.includes('*')) for (const [x, y] of pairs) add(x, '*', y, x * y);
  if (ops.includes('/')) for (const [x, y] of pairs) add(x * y, '/', x, y);

  const list = [...all.values()];
  const results = [...new Set(list.map((t) => t.r))].sort((a, b) => a - b);

  const ex = new Set(s.excluded);
  const noZero = ex.has(0);
  const byResult = new Map();
  for (const t of list) {
    if (ex.has(t.r) || (noZero && (t.a === 0 || t.b === 0))) continue;
    if (!byResult.has(t.r)) byResult.set(t.r, []);
    byResult.get(t.r).push(t);
  }
  const topf = results.filter((r) => byResult.has(r));
  return { results, topf, byResult, tasks: [...byResult.values()].flat() };
}

function describe(s) {
  const parts = [MODE_NAMES[s.mode]];
  if (hasAddSub(s)) {
    parts[0] += ` bis ${s.max}`;
    if (!s.crossing) parts.push('ohne Zehnerübergang');
  }
  if (hasMulDiv(s)) {
    const rows = s.rows.length === 10 ? 'alle Reihen'
      : s.rows.length ? `Reihen ${s.rows.join(', ')}` : 'keine Reihe';
    parts.push(rows + (s.squares ? ' + Quadrataufgaben' : ''));
  }
  return parts.join(' · ');
}
