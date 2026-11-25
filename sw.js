// BTC War Room PWA Service Worker: caches app shell only (never exchange APIs or WebSockets)
const CACHE = 'cw-shell-33d8746f';
const SHELL = [
  './',
  './index.html',
  './style.css?v=33d8746f',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.png',
  './avatar.png',
  './icon-192.png',
  './icon-512.png',
  './js/app.js?v=33d8746f',
  './js/battle.js?v=33d8746f',
  './js/chart.js?v=33d8746f',
  './js/feeds.js?v=33d8746f',
  './js/futures.js?v=33d8746f',
  './js/i18n.js?v=33d8746f',
  './js/intel.js?v=33d8746f',
  './js/music.js?v=33d8746f',
  './js/net.js?v=33d8746f',
  './js/share.js?v=33d8746f',
  './js/storage.js?v=33d8746f',
  './js/units.js?v=33d8746f',
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
