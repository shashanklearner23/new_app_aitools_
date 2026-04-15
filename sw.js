/* ═══════════════════════════════════════════════════════════
   AI Tools Hub — Service Worker (sw.js)
   PWA offline cache, background sync, update flow
═══════════════════════════════════════════════════════════ */

var CACHE_NAME = 'aih-v1';
var STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ── INSTALL: cache static shell ── */
self.addEventListener('install', function (e) {
  console.log('[SW] Install');
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_ASSETS).catch(function (err) {
        console.warn('[SW] Pre-cache failed for some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── ACTIVATE: purge old caches ── */
self.addEventListener('activate', function (e) {
  console.log('[SW] Activate');
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

/* ── FETCH: network-first for API, cache-first for assets ── */
self.addEventListener('fetch', function (e) {
  var url = e.request.url;

  /* Always bypass for Google Apps Script API calls */
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    return;
  }

  /* Network-first for HTML (so updates are seen) */
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(function (res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
        return res;
      }).catch(function () {
        return caches.match('./index.html') || caches.match('./');
      })
    );
    return;
  }

  /* Cache-first for CDN resources (Bootstrap, fonts, fuse.js) */
  if (
    url.includes('cdn.jsdelivr.net') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('bootstrap-icons')
  ) {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        if (cached) return cached;
        return fetch(e.request).then(function (res) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }

  /* Default: network with fallback to cache */
  e.respondWith(
    fetch(e.request).catch(function () {
      return caches.match(e.request);
    })
  );
});

/* ── MESSAGE: handle SKIP_WAITING and CLEAR_CACHES ── */
self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'CLEAR_CACHES') {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) { caches.delete(k); });
    });
  }
});
