// App-shell service worker. Data offline support comes from Firestore's own persistent cache,
// so this only caches the static files needed to open the app without a connection.

// Both filled in by the build (swPrecache in vite.config.ts): a name that changes with every new
// version, and every file of the app, so it opens offline after the very first visit. A new
// version's name also makes "activate" below delete the old version's files.
const VERSION = 'dev';
const BUILD_FILES = [];
const CACHE = `xpencex-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([...SHELL, ...BUILD_FILES])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Old app files go; receipts kept on the phone (src/features/receipts/receiptService.ts) stay
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== 'xpences-receipts').map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never touch Firebase/Gemini API traffic or non-GET requests
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Plain pages of their own. They must not be stored as the app's main page below.
  if (url.pathname === '/privacy.html' || url.pathname === '/privacy-bn.html') return;

  if (request.mode === 'navigation') {
    // A shared SMS arrives in the address (?shared_text=...). Serve the app from the phone instead of
    // the server, so the message (which may contain an account number) is never sent over the network.
    if (['shared_text', 'shared_title', 'shared_url'].some((p) => url.searchParams.has(p))) {
      event.respondWith(caches.match('/index.html').then((cached) => cached || fetch('/')));
      return;
    }
    // Network first so new deployments show up, cached shell when offline
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Only a good page is kept, so an error page (a server problem) never replaces the app
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed build assets never change, so cache-first is safe
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});
