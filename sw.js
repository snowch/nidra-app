/* Yoga Nidra PWA service worker — offline-capable practice.
 * Two caches so updating the app never wipes your saved-offline audio:
 *   SHELL  — app files, versioned (bump to ship an app update)
 *   AUDIO  — recordings, persistent across app updates
 */
const SHELL = 'nidra-shell-v29';
const AUDIO = 'nidra-audio';
const SHELL_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  const keep = [SHELL, AUDIO];
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (/\.(m4a|mp3|wav|ogg)$/i.test(url.pathname)) {
    // audio: cache-first in the persistent audio cache -> works fully offline
    e.respondWith(
      caches.open(AUDIO).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // shell: stale-while-revalidate so app updates roll in without losing offline audio
  e.respondWith(
    caches.open(SHELL).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    )
  );
});
