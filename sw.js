// Keeps the app's own files cached so Aloud opens instantly and works with no connection.
// Recordings are never here: they live in IndexedDB on the device.
const CACHE = 'aloud-v10';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'i18n.js', 'hope.js', 'zip.js', 'manifest.webmanifest', 'fonts/Afsaneh.ttf', 'icons/icon.svg', 'icons/apple-touch-icon.png', 'orn/medallion.svg', 'orn/headpiece.svg', 'orn/shamseh.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  // Network first so updates show up at once; the cache answers when offline.
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
