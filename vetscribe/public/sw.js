/**
 * Keeps the app shell on the phone so it opens instantly in the back of the
 * building. The API is never cached: a visit is live data. `npm test` fails
 * if this list and the files in public/ drift apart.
 */

const CACHE = 'vetscribe-v1';

const ASSETS = [
  './',
  'apple-touch-icon.png',
  'css/app.css',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'icon.svg',
  'index.html',
  'js/api.js',
  'js/app.js',
  'js/recorder.js',
  'js/ui.js',
  'js/views/badge.js',
  'js/views/schedule.js',
  'js/views/settings.js',
  'js/views/visit.js',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      const fresh = fetch(event.request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached ?? fresh;
    }),
  );
});
