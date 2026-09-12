/* Service worker Azimut — mises à jour auto à chaque réouverture. */
const CACHE = 'azimut-static-v67';
const PRECACHE = [
  '/manifest.webmanifest',
  '/icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(PRECACHE.map((u) => cache.add(u).catch(function () {}))),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: 'AZIMUT_SW_ACTIVATED' }));
        }),
      ),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // App bundle + API : toujours le réseau (jamais de vieux JS en cache SW)
  if (
    url.pathname.includes('/_expo/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.startsWith('/api')
  ) {
    return;
  }

  const isHtml =
    req.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/' ||
    (req.headers.get('accept') || '').includes('text/html');

  // HTML / navigation : réseau d’abord (nouvelle version dès réouverture)
  if (isHtml) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => res)
        .catch(() =>
          caches.match(req).then((c) => c || caches.match('/app.html') || caches.match('/welcome')),
        ),
    );
    return;
  }

  // Icônes / manifest : cache puis réseau
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(function () {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    }),
  );
});
