/**
 * Offline cache.
 *
 * This gets used in a bathroom or at a fridge, where the signal is often bad
 * and sometimes absent. A dosing calculator that fails to load is worse than
 * useless, so the whole app is precached and served cache-first.
 *
 * ASSETS is generated from the files on disk; test/pwa.test.js fails if the
 * two drift apart, because a stale list ships a half-broken offline app.
 */

const VERSION = 'pdt-v2';

const ASSETS = [
  './css/app.css',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon.svg',
  './index.html',
  './js/data/peptides.js',
  './js/data/syringes.js',
  './js/lib/calc.js',
  './js/lib/cost.js',
  './js/lib/safety.js',
  './js/lib/schedule.js',
  './js/lib/store.js',
  './js/lib/units.js',
  './js/main.js',
  './js/ui/costlines.js',
  './js/ui/dom.js',
  './js/ui/syringe.js',
  './js/views/calculator.js',
  './js/views/cost.js',
  './js/views/log.js',
  './js/views/more.js',
  './js/views/order.js',
  './js/views/protocols.js',
  './js/views/reference.js',
  './js/views/swap.js',
  './js/views/today.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // Refresh in the background so the next launch is current, but never
        // make the user wait on the network for something already cached.
        event.waitUntil(
          fetch(request)
            .then((res) => res.ok && caches.open(VERSION).then((c) => c.put(request, res.clone())))
            .catch(() => {})
        );
        return hit;
      }
      return fetch(request).catch(() => {
        // A navigation that misses the cache still gets the app shell.
        if (request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
