// BTC War Room PWA Service Worker: caches app shell only (never exchange APIs or WebSockets)
const CACHE = 'cw-shell-fdac0e84';
const SHELL = [
  './',
  './index.html',
  './style.css?v=fdac0e84',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon.png',
  './icon-192.png',
  './icon-512.png',
  './js/app.js?v=fdac0e84',
  './js/battle.js?v=fdac0e84',
  './js/chart.js?v=fdac0e84',
  './js/feeds.js?v=fdac0e84',
  './js/futures.js?v=fdac0e84',
  './js/i18n.js?v=fdac0e84',
  './js/intel.js?v=fdac0e84',
  './js/music.js?v=fdac0e84',
  './js/net.js?v=fdac0e84',
  './js/share.js?v=fdac0e84',
  './js/storage.js?v=fdac0e84',
  './js/units.js?v=fdac0e84',
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
