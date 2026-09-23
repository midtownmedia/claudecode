/**
 * Offline support. The app gets used at a fridge or in a bathroom where the
 * signal is poor, so every file it needs is kept on the device.
 *
 * Files are served from the cache straight away and refreshed in the
 * background, so a new version arrives the next time the app is opened.
 * `npm test` fails if this list and the files in public/ drift apart.
 */

const CACHE = 'peptides-v2.1';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'css/app.css',
  'js/app.js',
  'js/chart.js',
  'js/data.js',
  'js/example.js',
  'js/file.js',
  'js/math.js',
  'js/model.js',
  'js/store.js',
  'js/syringe.js',
  'js/ui.js',
  'js/views/calculator.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'js/views/sheets.js',
  'js/views/today.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const key = req.mode === 'navigate' ? 'index.html' : req;
    const cached = await cache.match(key, { ignoreSearch: true });
    const fresh = fetch(req)
      .then((res) => {
        if (res.ok) cache.put(key, res.clone());
        return res;
      })
      .catch(() => null);
    return cached ?? (await fresh) ?? new Response('Offline', { status: 503, statusText: 'Offline' });
  }));
});
