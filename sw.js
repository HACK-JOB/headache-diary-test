// Caches the app files so the diary opens offline. Bump VERSION whenever files change.
const VERSION = 'hd-v23';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/time.js', 'js/hydration.js', 'js/events.js', 'js/settings.js', 'js/episodes.js', 'js/memory.js', 'js/headache-ui.js', 'js/type-art.js', 'js/day.js', 'js/day-ui.js', 'js/intake.js', 'js/intake-ui.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
];
self.addEventListener('install', (e) => {
  // 'reload' skips the browser's own HTTP cache, so a new version never stores stale copies of its files.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(FILES.map(async (f) => {
        const res = await fetch(new Request(f, { cache: 'reload' }));
        if (!res.ok) throw new Error(`Could not fetch ${f}`);
        await c.put(f, res);
      })))
      .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
