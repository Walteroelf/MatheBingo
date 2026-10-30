'use strict';

// Offline-Speicher für Mathe-Bingo, wie beim ABC-Bingo.
// Seiten (HTML) und die Anleitung kommen zuerst aus dem Netz, damit Updates sofort ankommen,
// und nur ohne Netz (oder bei sehr langsamem Netz) aus dem Speicher.
// Alles andere kommt sofort aus dem Speicher und wird im Hintergrund aufgefrischt.
// Skripte und CSS haben ?v=N: Eine neue Nummer ist eine neue Adresse und wird frisch geladen.
// Bei Änderungen an der Dateiliste oder den Ansagen VERSION erhöhen.
const VERSION = 'mathebingo-v2';

const FILES = [
  './',
  'index.html',
  'druck.html',
  'README.md',
  'manifest.webmanifest',
  'style.css',
  'core.js',
  'sounds.js',
  'sync.js',
  'guide.js',
  'app.js',
  'druck.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'fonts/andika-latin-400.woff2',
  'fonts/andika-latin-700.woff2',
  'lib/mqtt.min.js',
  'lib/qrcode.js',
  'audio/liste.json',
];

// Die Ansagen (gut 400 kleine Dateien) werden nach dem Grundgerüst geladen.
// Fehlt eine, ist das kein Beinbruch: dann liest die Stimme des Browsers vor.
async function cacheAudio(cache) {
  let names = [];
  try { names = await (await fetch('audio/liste.json')).json(); } catch { return; }
  for (let i = 0; i < names.length; i += 20) {
    await Promise.all(names.slice(i, i + 20).map((n) =>
      cache.add(`audio/${n}`).catch(() => {})));
  }
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES).then(() => cacheAudio(c)))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const NET_TIMEOUT_MS = 4000;   // langsames Schul-WLAN: dann lieber die gespeicherte Seite

// Speichert eine Antwort; ältere Fassungen derselben Datei (andere ?v=N) fliegen raus.
async function store(req, res) {
  const cache = await caches.open(VERSION);
  const url = new URL(req.url);
  if (url.search) {
    for (const old of await cache.keys(req, { ignoreSearch: true })) {
      if (old.url !== req.url && new URL(old.url).search) await cache.delete(old);
    }
  }
  await cache.put(req, res);
}

function fetchAndStore(req, fresh) {
  // Eine Seitenanfrage (navigate) lässt sich nicht mit Optionen weiterreichen, darum über die Adresse
  return (fresh ? fetch(req.url, { cache: 'no-cache' }) : fetch(req)).then((res) => {
    if (res.ok) store(req, res.clone());
    return res;
  });
}

// Ohne Netz: irgendeine gespeicherte Fassung der Datei, notfalls die Startseite
function fromCache(req, page) {
  return caches.match(req, { ignoreSearch: true })
    .then((r) => r || (page ? caches.match('index.html') : undefined))
    .then((r) => r || Response.error());
}

// Seiten immer beim Server nachfragen (kurze Rückfrage), nicht aus dem Browser-Zwischenspeicher
function networkFirst(req) {
  const net = fetchAndStore(req, true);
  const timeout = new Promise((res) => setTimeout(res, NET_TIMEOUT_MS))
    .then(() => caches.match(req, { ignoreSearch: true }))
    .then((hit) => hit || net);
  return Promise.race([net.catch(() => fromCache(req, true)), timeout]);
}

function cacheFirst(req) {
  return caches.match(req).then((hit) => {
    const fresh = fetchAndStore(req);
    if (hit) { fresh.catch(() => {}); return hit; }
    return fresh.catch(() => fromCache(req, false));
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  const isPage = req.mode === 'navigate' || req.destination === 'document' || path.endsWith('.md');
  e.respondWith(isPage ? networkFirst(req) : cacheFirst(req));
});
