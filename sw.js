/* ═══════════════════════════════════════════════════════
   AI Tools Hub — Service Worker (sw.js)
   Place this file in the ROOT of your GitHub Pages repo.
═══════════════════════════════════════════════════════ */

var CACHE_NAME    = 'aih-v1.0.0';
var SHELL_CACHE   = 'aih-shell-v1';
var RUNTIME_CACHE = 'aih-runtime-v1';

/* Files to pre-cache on install (app shell) */
var PRECACHE_ASSETS = [
  './',
  '/new_app_aitools_/index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/fuse.js@6.6.2',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Outfit:wght@300;400;500;600;700&display=swap'
];

/* ── INSTALL: cache app shell ── */
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function(cache) {
      return cache.addAll(PRECACHE_ASSETS.map(function(url) {
        return new Request(url, { mode: 'cors' });
      })).catch(function(err) {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
});

/* ── ACTIVATE: remove old caches ── */
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) {
            return key !== SHELL_CACHE && key !== RUNTIME_CACHE;
          })
          .map(function(key) {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── FETCH: network-first for API, cache-first for assets ── */
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  /* Always go to network for Apps Script API calls */
  if (url.indexOf('script.google.com') !== -1) {
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          return new Response(JSON.stringify({ error: 'You are offline. Please reconnect.' }), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  /* Skip non-GET requests */
  if (event.request.method !== 'GET') return;

  /* Skip browser-extension or chrome-extension requests */
  if (!url.startsWith('http')) return;

  /* Cache-first for static CDN assets */
  if (
    url.indexOf('cdn.jsdelivr.net') !== -1 ||
    url.indexOf('fonts.googleapis.com') !== -1 ||
    url.indexOf('fonts.gstatic.com') !== -1
  ) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(RUNTIME_CACHE).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {
          return new Response('/* offline */', { headers: { 'Content-Type': 'text/css' } });
        });
      })
    );
    return;
  }

  /* Network-first for HTML pages (index.html, app shell) */
  if (
    event.request.headers.get('accept') &&
    event.request.headers.get('accept').indexOf('text/html') !== -1
  ) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          var clone = response.clone();
          caches.open(SHELL_CACHE).then(function(cache) {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(function() {
          return caches.match('./index.html');
        })
    );
    return;
  }

  /* Default: stale-while-revalidate for everything else */
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(function(cache) {
      return cache.match(event.request).then(function(cached) {
        var networkFetch = fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
        return cached || networkFetch;
      });
    })
  );
});

/* ── BACKGROUND SYNC (optional, for deferred tool clicks) ── */
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-tool-clicks') {
    event.waitUntil(syncPendingClicks());
  }
});

function syncPendingClicks() {
  /* If you want to store tool clicks offline and sync later,
     read from IndexedDB here and POST to Apps Script */
  return Promise.resolve();
}

/* ── PUSH NOTIFICATIONS (scaffold) ── */
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'AI Tools Hub', {
      body   : data.body || 'New tools available!',
      icon   : './icons/icon-192.png',
      badge  : './icons/icon-72.png',
      vibrate: [100, 50, 100]
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});
