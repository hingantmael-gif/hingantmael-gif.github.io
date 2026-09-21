/* Service worker Mova — mises à jour auto à chaque réouverture. */
const CACHE = 'mova-static-v96';
const IMMUTABLE = 'mova-immutable-v1';
/** Nom de fichier avec empreinte (…-<hash 32 hex>.ext ou entry-<hash>.js) : jamais modifié après publication. */
const HASHED = /[.-][0-9a-f]{32}\.[a-z0-9]+$/i;
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

/* Clic sur une notification : ramène l'app au premier plan (ou l'ouvre). */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== IMMUTABLE)
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

  // Le site vitrine est indépendant de l'application : on ne l'intercepte jamais.
  if (url.pathname.startsWith('/mova-site/')) return;

  // Contrôle de version et liste des pages à précharger : toujours frais (jamais en cache).
  if (url.pathname === '/version.json' || url.pathname === '/chunks.json') return;

  // Fichiers hachés (bundles, images, polices) : cache d'abord — le nom change à chaque
  // modification, donc jamais périmé ; les visites suivantes sont quasi instantanées.
  if (HASHED.test(url.pathname)) {
    event.respondWith(
      caches.open(IMMUTABLE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

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

// build: mubkumzf
