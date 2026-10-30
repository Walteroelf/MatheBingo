'use strict';

// Mehrere iPads verbinden, wie beim ABC-Bingo.
// Alle iPads eines Spiels tauschen über einen öffentlichen MQTT-Server den Stand aus:
// Runde (gen), gewürfelte Aufgaben, Aufgaben-Einstellungen mit Topf. Der Server hebt die
// letzte Nachricht auf (retain), so bekommt ein neu beitretendes iPad sofort den Stand.
//
// Jedes Ergebnis kommt pro Runde einmal. Beim Würfeln reserviert ein iPad sein Ergebnis sofort
// (pending) und zeigt es erst, wenn der Server die Reservierung bestätigt hat. Würfeln zwei iPads
// gleichzeitig dasselbe Ergebnis, behält es das iPad mit der kleineren Gerätekennung, das andere
// würfelt unbemerkt neu. Damit der Verlierer die Nachricht des Gewinners sicher noch vor der
// Anzeige sieht, wartet jedes iPad nach dem eigenen Echo noch GRACE_MS.
// Neue Runde (Neues Spiel, Zurücknehmen, andere Aufgaben): die jüngere Runde gewinnt.
// Topf und Aufgaben-Einstellungen: die jüngste Änderung gewinnt (gameTs).
// Der Server wird beim Erstellen festgelegt und steht im QR-Code, damit alle iPads eines Spiels
// denselben Server nutzen.

const BROKERS = [
  { name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
  { name: 'EMQX', url: 'wss://broker.emqx.io:8084/mqtt' },
];
const TOPIC_PREFIX = 'mathebingo-walteroelf/v1/';
const DEVICE = randomId(8);
const CODE_RE = /^[a-z0-9]{6,20}$/;
const CONFIRM_MS = 2500;      // so lange wartet das Würfeln höchstens auf den Server
const GRACE_MS = 600;         // Wartezeit nach dem eigenen Echo (siehe oben)
const FAILOVER_MS = 10000;    // beim Erstellen: danach wird der andere Server probiert
const PENDING_MAX_MS = 5000;  // noch verdeckte Aufgaben anderer iPads danach trotzdem zeigen

let client = null;
let connected = false;
let creating = false;   // neues Spiel, noch nie verbunden: Serverwechsel erlaubt
let failTm = null;
let sawMsg = false;
let claim = null;       // { t, confirmed, ts, echoTs } während des Würfelns
let qrVisible = false;
let qrBoardVisible = false;
const pendingBy = {};   // Gerät → { keys, ts }: noch verdeckte Würfe anderer iPads

const isOnline = () => !!(client && connected);

// Was pro Runde nur einmal kommen darf: das Ergebnis (Bingo) oder die Aufgabe selbst.
// Daran hängen Auslosen, Abgleich und gleichzeitiges Würfeln.
const entryKey = (t) => (S.unique === 'task' ? taskKey(t) : String(t.r));
const usedKeys = () => new Set(state.history.map(entryKey));

// Würfe, die andere iPads gerade noch rollen
function hiddenKeys() {
  const now = performance.now();
  const out = new Set();
  for (const p of Object.values(pendingBy)) {
    if (now - p.ts < PENDING_MAX_MS) p.keys.forEach((k) => out.add(k));
  }
  return out;
}

// Gewürfelte Aufgaben ohne die, die andere iPads noch nicht aufgedeckt haben
function visibleHistory() {
  const hidden = hiddenKeys();
  return state.history.filter((t) => t.by === DEVICE || !hidden.has(entryKey(t)));
}

// ---------- Verbindung ----------

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

let libsPromise = null;
function loadLibs() {
  if (!libsPromise) {
    libsPromise = Promise.all([loadScript('lib/mqtt.min.js'), loadScript('lib/qrcode.js')])
      .catch((e) => { libsPromise = null; throw e; });
  }
  return libsPromise;
}

function disconnect() {
  clearTimeout(failTm);
  if (client) { const c = client; client = null; c.end(true); }
  connected = false;
}

function armFailover() {
  clearTimeout(failTm);
  if (!creating) return;
  failTm = setTimeout(() => {
    if (isOnline() || !net.code || !creating) return;
    net.server = (net.server + 1) % BROKERS.length;
    connect();
  }, FAILOVER_MS);
}

function connect() {
  disconnect();
  renderSync();
  if (!net.code) return;
  loadLibs().then(() => {
    if (!net.code || client) return;
    const c = mqtt.connect(BROKERS[net.server].url, {
      clientId: `mb_${DEVICE}_${randomId(4)}`,
      clean: true, keepalive: 30,
      connectTimeout: 8000, reconnectPeriod: 4000,
    });
    client = c;
    renderSync();
    c.on('connect', () => {
      if (c !== client) return;
      connected = true;
      creating = false;
      clearTimeout(failTm);
      save();
      sawMsg = false;
      c.subscribe(TOPIC_PREFIX + net.code, { qos: 1 }, () => {
        // Kein gespeicherter Stand auf dem Server? Dann ist unserer der erste.
        setTimeout(() => { if (c === client && !sawMsg) publish(); }, 1500);
      });
      renderSync();
    });
    c.on('message', (topic, msg) => { if (c === client) receive(msg.toString()); });
    c.on('close', () => {
      if (c !== client) return;
      connected = false;
      renderSync();
      armFailover();
    });
    c.on('error', () => {});
    armFailover();
  }).catch(() => renderSync());
}

function publish() {
  if (!isOnline() || !net.code) return;
  const msg = {
    gen: net.gen, genTs: net.genTs,
    game: gameOf(S), gameTs: net.gameTs,
    drawn: state.history,
    // andere zeigen es erst nach dem Aufdecken; Ergebnis als Zahl wie bisher, Aufgabe als Text
    pending: claim && claim.t ? [S.unique === 'task' ? taskKey(claim.t) : claim.t.r] : [],
    by: DEVICE,
  };
  client.publish(TOPIC_PREFIX + net.code, JSON.stringify(msg), { qos: 1, retain: true });
}

// ---------- Nachrichten anderer iPads ----------

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function cleanTask(t) {
  if (!t || !OPS[t.op] || ![t.a, t.b, t.r, t.ts].every(isNum)) return null;
  return {
    a: t.a, op: t.op, b: t.b, r: t.r, ts: t.ts, by: typeof t.by === 'string' ? t.by : '',
    c: COLORS[t.c] ? t.c : 'blau',
  };
}

function cleanGame(g) {
  if (!g || !MODES[g.mode] || !isNum(g.max) || !Array.isArray(g.rows) || !Array.isArray(g.excluded)) return null;
  return {
    mode: g.mode, max: g.max, crossing: !!g.crossing, squares: !!g.squares,
    rows: g.rows.filter(isNum), excluded: g.excluded.filter(isNum),
    unique: g.unique === 'task' ? 'task' : 'result',
  };
}

function adoptGame(game, ts) {
  Object.assign(S, game);
  net.gameTs = ts;
  pool = buildPool(S);
}

// Eigene Aufgabe zu diesem Ergebnis durch die des anderen iPads ersetzen
function replaceEntry(t) {
  state.history = state.history.filter((h) => entryKey(h) !== entryKey(t));
  state.history.push(t);
}

function receive(raw) {
  let m;
  try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m.gen !== 'string' || !isNum(m.genTs) || !Array.isArray(m.drawn)) return;
  sawMsg = true;
  if (typeof m.by === 'string' && m.by !== DEVICE) {
    const p = Array.isArray(m.pending)
      ? m.pending.filter((x) => isNum(x) || typeof x === 'string').map(String) : [];
    pendingBy[m.by] = { keys: p, ts: performance.now() };
    if (p.length) setTimeout(() => onRemote(false), PENDING_MAX_MS + 100);
  }
  const remote = m.drawn.map(cleanTask).filter(Boolean);
  const game = isNum(m.gameTs) ? cleanGame(m.game) : null;
  let newRoundFromRemote = false;
  let differs = false;

  if (m.gen !== net.gen) {
    const newer = m.genTs > net.genTs || (m.genTs === net.genTs && m.gen > net.gen);
    if (!newer) { publish(); return; }
    // Neue Runde (Neues Spiel, zurückgenommen, andere Aufgaben) oder erstes Verbinden
    net.gen = m.gen; net.genTs = m.genTs;
    state.history = remote;
    newRoundFromRemote = true;
    if (game && m.gameTs > net.gameTs) adoptGame(game, m.gameTs);
    else if (game && m.gameTs < net.gameTs) differs = true;
    if (claim && claim.t) {
      if (usedKeys().has(entryKey(claim.t)) || !pool.topf.includes(claim.t.r)) repick();
      else {
        state.history.push(claim.t);
        claim.confirmed = false; claim.ts = performance.now(); claim.echoTs = 0;
        differs = true;
      }
    }
  } else {
    if (claim && claim.t && !claim.confirmed) {
      const theirs = remote.find((t) => entryKey(t) === entryKey(claim.t));
      if (theirs && m.by === DEVICE) {
        if (!claim.echoTs) claim.echoTs = performance.now();   // Server hat unsere Wahl
      } else if (theirs && theirs.by !== DEVICE && theirs.by < DEVICE) {
        // Gleichzeitig gewürfelt, das andere iPad gewinnt: neu würfeln
        replaceEntry(theirs);
        repick();
      }
    }
    // Zusammenführen: bei Uneinigkeit gilt die Aufgabe des iPads mit der kleineren Kennung
    const mine = new Map(state.history.map((t) => [entryKey(t), t]));
    for (const t of remote) {
      const own = mine.get(entryKey(t));
      if (!own) state.history.push(t);
      else if (own.by !== t.by) {
        if (t.by < own.by) replaceEntry(t);
        else differs = true;
      }
    }
    const remoteKeys = new Set(remote.map(entryKey));
    if (state.history.some((t) => !remoteKeys.has(entryKey(t)))) differs = true;
    if (game && m.gameTs > net.gameTs) adoptGame(game, m.gameTs);
    else if (game && m.gameTs < net.gameTs) differs = true;
  }
  // Jedes Ergebnis (bzw. jede Aufgabe) nur einmal, sortiert nach Würfelzeit
  const best = new Map();
  for (const t of state.history) {
    const k = entryKey(t);
    const o = best.get(k);
    if (!o || t.by < o.by) best.set(k, t);
  }
  state.history = [...best.values()].sort((a, b) => a.ts - b.ts || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0));
  if (differs) publish();
  onRemote(newRoundFromRemote);
}

// ---------- Würfeln mit Reservierung ----------

const entryOf = (t) => ({ a: t.a, op: t.op, b: t.b, r: t.r, ts: Date.now(), by: DEVICE, c: S.color });

function claimNext() {
  const d = draw();
  claim.t = d && d.t ? entryOf(d.t) : null;
  if (claim.t) {
    state.history.push(claim.t);
    preloadVoice(claim.t);
  }
  claim.confirmed = !claim.t || !net.code;
  claim.ts = performance.now();
  claim.echoTs = 0;
  save();
  publish();
}

function makeClaim() {
  claim = {};
  claimNext();
}

const repick = claimNext;

// Darf die reservierte Aufgabe angezeigt werden?
function claimSettled(now) {
  if (!claim.t || claim.confirmed) return true;
  if (claim.echoTs && now - claim.echoTs >= GRACE_MS) return true;
  return now - claim.ts >= CONFIRM_MS;
}

// Aufgedeckt: ab jetzt zeigen auch die Tafel und die anderen iPads die Aufgabe
function releaseClaim() {
  const t = claim.t;
  claim = null;
  publish();
  return t;
}

// ---------- Spielcode, QR-Code, Beitreten ----------

function shareUrl() {
  return `${location.origin}${location.pathname}?spiel=${net.code}&server=${net.server}`;
}
const boardUrl = () => `${shareUrl()}&tafel=1`;

// Spielcode zum Abtippen: in Vierergruppen, Server 2 mit „-2“ am Ende
function displayCode() {
  return net.code.replace(/(.{4})(?=.)/g, '$1 ') + (net.server ? `-${net.server + 1}` : '');
}

// Liest einen abgetippten Code oder einen eingefügten Link → { code, server, board }
function parseJoin(text) {
  const t = text.trim();
  if (t.includes('spiel=')) {
    try {
      const p = new URL(t, location.href).searchParams;
      const c = p.get('spiel');
      if (c && CODE_RE.test(c)) {
        return { code: c, server: BROKERS[p.get('server')] ? Number(p.get('server')) : 0, board: p.get('tafel') === '1' };
      }
    } catch { /* kein gültiger Link */ }
    return null;
  }
  const m = t.toLowerCase().replace(/\s+/g, '').match(/^([a-z0-9]{6,20})(?:-([1-9]))?$/);
  if (!m) return null;
  const server = m[2] ? Number(m[2]) - 1 : 0;
  return BROKERS[server] ? { code: m[1], server, board: false } : null;
}

// Beitreten: Der eigene Stand wird verworfen, die erste Nachricht vom Server übernommen
function joinGame(j) {
  if (j.code !== net.code) {
    disconnect();
    net.code = j.code;
    net.server = j.server;
    net.gen = ''; net.genTs = 0; net.gameTs = 0;
    state.history = [];
    state.current = null;
  }
  if (j.board) net.boardMode = true;
  save();
}

function startShared() {
  net.code = randomId(10);
  net.server = 0;
  creating = true;
  if (!net.gameTs) net.gameTs = Date.now();
  if (!net.gen) { net.gen = randomId(10); net.genTs = Date.now(); }
  save();
  qrVisible = true;
  connect();
}

function leaveShared() {
  disconnect();
  net.code = '';
  qrVisible = qrBoardVisible = false;
  save();
  renderSync();
}

// ---------- Anzeige im Reiter „Verbinden“ ----------

function renderQr(el, url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  el.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

function renderSync() {
  const code = net.code;
  for (const dot of [$('#syncDot'), $('#tabDot')]) {
    dot.hidden = !code;
    dot.classList.toggle('on', isOnline());
  }
  $('#syncStatus').textContent = !code ? 'Nicht verbunden. Dieses iPad spielt allein.'
    : isOnline() ? `🟢 Verbunden über ${BROKERS[net.server].name}. Spielcode:`
      : '🟠 Gerade keine Verbindung. Dieses iPad würfelt vorerst allein weiter. Spielcode:';
  $('#codeBig').hidden = !code;
  $('#codeBig').textContent = code ? displayCode() : '';

  $('#shareTitle').textContent = code ? 'Weitere iPads dazuholen' : 'Gemeinsames Spiel starten';
  $('#shareDesc').textContent = code
    ? 'Auf dem anderen iPad den QR-Code scannen, oder dort unter ⚙️ → Verbinden → „Einem Spiel beitreten“ den Spielcode von oben eintippen.'
    : 'Mehrere iPads würfeln dann aus einem Topf, kein Ergebnis kommt doppelt.';
  $('#btnShare').textContent = !code ? 'Gemeinsames Spiel starten'
    : qrVisible ? 'QR-Code ausblenden' : 'QR-Code für weitere iPads zeigen';
  $('#qrBox').hidden = !(code && qrVisible);
  if (code && qrVisible && window.qrcode) renderQr($('#qr'), shareUrl());
  $('#joinBox').hidden = !!code;
  $('#btnLeave').hidden = !code;

  $('#boardInfo').hidden = !!code || net.boardMode;
  $('#boardLinkBox').hidden = !code;
  $('#boardLink').textContent = code ? boardUrl() : '';
  $('#btnBoardQr').hidden = !code;
  $('#btnBoardQr').textContent = qrBoardVisible ? 'QR-Code ausblenden' : 'QR-Code für die Tafel';
  $('#btnCopyBoard').hidden = !code;
  $('#btnBoardMode').hidden = !code && !net.boardMode;
  $('#btnBoardMode').textContent = net.boardMode ? 'Tafel-Ansicht beenden' : 'Dieses Gerät als Tafel';
  $('#qrBoardBox').hidden = !(code && qrBoardVisible);
  if (code && qrBoardVisible && window.qrcode) renderQr($('#qrBoard'), boardUrl());
  renderBoard();
}

function bindSync() {
  $('#btnShare').addEventListener('click', () => {
    if (!net.code) { startShared(); return; }
    qrVisible = !qrVisible;
    loadLibs().then(renderSync, renderSync);
  });
  $('#btnLeave').addEventListener('click', async () => {
    if (await askConfirm('Verbindung zu den anderen iPads trennen?')) leaveShared();
  });
  $('#btnJoin').addEventListener('click', () => {
    const input = $('#joinInput');
    const j = parseJoin(input.value);
    $('#joinError').hidden = !!j;
    if (!j) return;
    input.value = '';
    joinGame(j);
    backToTouch();
    renderDrawer();
    connect();
  });
  $('#joinInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnJoin').click(); });
  $('#btnBoardQr').addEventListener('click', () => {
    qrBoardVisible = !qrBoardVisible;
    loadLibs().then(renderSync, renderSync);
  });
  $('#btnCopyBoard').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const done = (ok) => {
      btn.textContent = ok ? 'Kopiert ✓' : 'Bitte Link markieren';
      setTimeout(() => { btn.textContent = 'Link kopieren'; }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(boardUrl()).then(() => done(true), () => done(false));
    else done(false);
  });
  $('#btnBoardMode').addEventListener('click', () => {
    if (state.rolling) return;
    net.boardMode = !net.boardMode;
    save();
    backToTouch();
    renderSync();
    closeDrawer();
  });
  // iPad aus dem Ruhezustand: sofort neu verbinden statt auf den Zeitgeber zu warten
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && net.code && client && !connected) client.reconnect();
  });
}

// Per QR-Code oder Link geöffnet? Dann diesem Spiel beitreten und den Stand übernehmen.
function joinFromUrl() {
  if (!location.search.includes('spiel=')) return;
  const j = parseJoin(location.href);
  if (j) joinGame(j);
  history.replaceState(null, '', location.pathname);
}
