// BTC War Room PWA Service Worker: caches app shell only (never exchange APIs or WebSockets)
const CACHE = 'cw-shell-6dd8875c';
const SHELL = [
  './',
  './index.html',
  './style.css?v=6dd8875c',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './js/app.js?v=6dd8875c',
  './js/battle.js?v=6dd8875c',
  './js/chart.js?v=6dd8875c',
  './js/feeds.js?v=6dd8875c',
  './js/futures.js?v=6dd8875c',
  './js/i18n.js?v=6dd8875c',
  './js/intel.js?v=6dd8875c',
  './js/music.js?v=6dd8875c',
  './js/net.js?v=6dd8875c',
  './js/share.js?v=6dd8875c',
  './js/storage.js?v=6dd8875c',
  './js/units.js?v=6dd8875c',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cw-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
