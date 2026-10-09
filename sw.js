// Caches the app files so the diary opens offline. Bump VERSION whenever files change.
const VERSION = 'hd-v145';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/time.js', 'js/hydration.js', 'js/events.js', 'js/settings.js', 'js/episodes.js', 'js/memory.js', 'js/headache-ui.js', 'js/type-art.js', 'js/day.js', 'js/day-ui.js', 'js/intake.js', 'js/intake-ui.js', 'js/pin.js', 'js/clock-ui.js', 'js/admin-ui.js', 'js/doctors.js', 'js/measures.js', 'js/measures-ui.js', 'js/tour.js', 'js/tour-ui.js', 'js/prescriptions.js', 'js/rx-ui.js', 'js/reminders.js', 'js/reminder-ui.js', 'js/nudges.js', 'js/reset.js', 'js/tester.js', 'js/barcode.js', 'js/barcode-ui.js', 'js/sidetabs.js', 'js/forget.js', 'js/layout.js', 'js/layout-ui.js', 'js/updatecheck.js', 'js/tracking.js', 'js/tracking-ui.js', 'js/patchnotes.js', 'js/patchnotes-ui.js', 'js/releases.js', 'js/tester-ui.js', 'js/reset.js', 'js/doctor-ui.js',
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

// Overnight check: the browser wakes this now and then (installed app only). Looking for a newer sw.js starts the install,
// which downloads every file. The app then offers the refresh next time it is opened.
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'hd-update-check') e.waitUntil(self.registration.update().catch(() => {}));
});
