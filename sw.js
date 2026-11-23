// Crypto War PWA Service Worker: caches app shell only (never exchange APIs or WebSockets)
const CACHE = 'cw-shell-f5b2a28a';
const SHELL = [
  './',
  './index.html',
  './style.css?v=f5b2a28a',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './js/app.js?v=f5b2a28a',
  './js/battle.js?v=f5b2a28a',
  './js/chat.js?v=f5b2a28a',
  './js/feeds.js?v=f5b2a28a',
  './js/futures.js?v=f5b2a28a',
  './js/i18n.js?v=f5b2a28a',
  './js/markets.js?v=f5b2a28a',
  './js/music.js?v=f5b2a28a',
  './js/net.js?v=f5b2a28a',
  './js/share.js?v=f5b2a28a',
  './js/storage.js?v=f5b2a28a',
  './js/units.js?v=f5b2a28a',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
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
