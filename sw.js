/* Yoga Nidra PWA service worker — offline-capable practice */
const VERSION = 'nidra-v1';
const SHELL = [
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
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isAudio = /\.(m4a|mp3|wav|ogg)$/i.test(url.pathname);

  if (isAudio) {
    // cache-first for audio: once practised, works fully offline
    e.respondWith(
      caches.open(VERSION).then((cache) =>
        cache.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // stale-while-revalidate for shell + manifest
  e.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((hit) => {
        const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => hit);
        return hit || net;
      })
    )
  );
});
