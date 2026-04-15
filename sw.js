/* ═══════════════════════════════════════════════════════════════
   AI TOOLS HUB — Service Worker  (sw.js)
═══════════════════════════════════════════════════════════════ */

const APP_VERSION   = 'v1.1.0';
const SHELL_CACHE   = 'aih-shell-'   + APP_VERSION;
const CDN_CACHE     = 'aih-cdn-'     + APP_VERSION;
const API_CACHE     = 'aih-api-'     + APP_VERSION;
const FONT_CACHE    = 'aih-fonts-'   + APP_VERSION;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/pwa-register.js', '/icons/icon-192.png', '/icons/icon-512.png'];
const CDN_ORIGINS  = ['cdn.jsdelivr.net', 'unpkg.com'];
const FONT_ORIGINS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const API_ORIGIN   = 'script.google.com';

const LIMITS = {
  api  : { entries: 50,  ttlMs: 5  * 60 * 1000 },
  cdn  : { entries: 80,  ttlMs: 7  * 24 * 60 * 60 * 1000 },
  font : { entries: 30,  ttlMs: 30 * 24 * 60 * 60 * 1000 }
};

self.addEventListener('install', function(event) {
  console.log('[SW] Installing', APP_VERSION);
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(function(cache) { return cache.addAll(SHELL_ASSETS); })
      .then(function() { return self.skipWaiting(); })
      .catch(function(err) { console.warn('[SW] Pre-cache partial failure:', err); return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  console.log('[SW] Activating', APP_VERSION);
  var currentCaches = [SHELL_CACHE, CDN_CACHE, API_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys.filter(function(key) { return !currentCaches.includes(key); })
              .map(function(key) { return caches.delete(key); })
        );
      })
      .then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  var url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;
  if (url.pathname.includes('webauthn') || url.pathname.includes('credential')) return;

  if (url.hostname === API_ORIGIN || (url.hostname.endsWith('.googleapis.com') && url.pathname.includes('/macros/'))) {
    event.respondWith(networkFirstWithCache(req, API_CACHE, LIMITS.api)); return;
  }
  if (FONT_ORIGINS.includes(url.hostname)) {
    event.respondWith(cacheFirstWithNetwork(req, FONT_CACHE, LIMITS.font)); return;
  }
  if (CDN_ORIGINS.includes(url.hostname)) {
    event.respondWith(cacheFirstWithNetwork(req, CDN_CACHE, LIMITS.cdn)); return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE)); return;
  }
  event.respondWith(fetch(req).catch(function() { return offlineFallback(req); }));
});

async function networkFirstWithCache(req, cacheName, limits) {
  var cache = await caches.open(cacheName);
  try {
    var networkRes = await fetch(req);
    if (networkRes.ok) {
      cache.put(req, networkRes.clone());
      await trimCache(cache, limits.entries);
      await setTimestamp(cacheName, req.url);
    }
    return networkRes;
  } catch (_) {
    var cached = await cache.match(req);
    if (cached) return cached;
    return offlineFallback(req);
  }
}

async function cacheFirstWithNetwork(req, cacheName, limits) {
  var cache = await caches.open(cacheName);
  var cached = await cache.match(req);
  if (cached && !isExpired(cacheName, req.url, limits.ttlMs)) return cached;
  try {
    var networkRes = await fetch(req);
    if (networkRes.ok) {
      cache.put(req, networkRes.clone());
      await trimCache(cache, limits.entries);
      await setTimestamp(cacheName, req.url);
    }
    return networkRes;
  } catch (_) {
    if (cached) return cached;
    return offlineFallback(req);
  }
}

async function staleWhileRevalidate(req, cacheName) {
  var cache  = await caches.open(cacheName);
  var cached = await cache.match(req);
  var fetchPromise = fetch(req).then(function(networkRes) {
    if (networkRes.ok) cache.put(req, networkRes.clone());
    return networkRes;
  }).catch(function() { return null; });
  return cached || await fetchPromise || offlineFallback(req);
}

async function offlineFallback(req) {
  if (req.mode === 'navigate') {
    var cache  = await caches.open(SHELL_CACHE);
    var cached = await cache.match('/index.html') || await cache.match('/');
    if (cached) return cached;
  }
  var url = new URL(req.url);
  if (url.hostname === API_ORIGIN || url.searchParams.has('action')) {
    return new Response(
      JSON.stringify({ success: false, error: 'offline', message: 'You are offline.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — AI Tools Hub</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#07080c;color:#eeeef5;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}.ico{font-size:56px;margin-bottom:20px}h1{font-size:22px;font-weight:800;margin-bottom:8px;color:#e8a430}p{font-size:14px;color:#6b6d80;line-height:1.6;max-width:300px;margin:0 auto 24px}button{padding:14px 28px;background:linear-gradient(135deg,#e8a430,#f5c842);border:none;border-radius:12px;color:#0a0a0a;font-size:15px;font-weight:700;cursor:pointer}</style>
</head><body><div class="ico">📡</div><h1>You're Offline</h1><p>AI Tools Hub needs an internet connection. Check your network and try again.</p><button onclick="location.reload()">Try Again</button></body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function trimCache(cache, maxEntries) {
  var keys = await cache.keys();
  if (keys.length > maxEntries) {
    var toDelete = keys.slice(0, keys.length - maxEntries);
    await Promise.all(toDelete.map(function(k) { return cache.delete(k); }));
  }
}

var TS_CACHE = 'aih-timestamps';
var _tsMap   = new Map();

async function setTimestamp(cacheName, url) {
  try {
    var key = cacheName + '::' + url;
    _tsMap.set(key, Date.now());
    var store = await caches.open(TS_CACHE);
    await store.put(new Request(key), new Response(String(Date.now()), { headers: { 'Content-Type': 'text/plain' } }));
  } catch (_) {}
}

function isExpired(cacheName, url, ttlMs) {
  var key = cacheName + '::' + url;
  var ts  = _tsMap.get(key);
  if (!ts) return false;
  return (Date.now() - ts) > ttlMs;
}

(async function warmTimestamps() {
  try {
    var store = await caches.open(TS_CACHE);
    var keys  = await store.keys();
    for (var i = 0; i < keys.length; i++) {
      var r = await store.match(keys[i]);
      var t = await r.text();
      _tsMap.set(keys[i].url, parseInt(t, 10));
    }
  } catch (_) {}
})();

self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-tool-clicks') event.waitUntil(syncPendingClicks());
});

async function syncPendingClicks() {
  var store = await caches.open('aih-pending-clicks');
  var keys  = await store.keys();
  for (var i = 0; i < keys.length; i++) {
    try {
      var r    = await store.match(keys[i]);
      var data = await r.json();
      var res  = await fetch(data.url, { method: 'GET', mode: 'cors' });
      if (res.ok) await store.delete(keys[i]);
    } catch (_) {}
  }
}

self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  var opts = {
    body: data.body || 'New update from AI Tools Hub',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'aih-notification',
    renotify: true,
    data: { url: data.url || '/' },
    actions: [{ action: 'open', title: 'Open App' }, { action: 'dismiss', title: 'Dismiss' }]
  };
  event.waitUntil(self.registration.showNotification(data.title || '⚡ AI Tools Hub', opts));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (event.action === 'dismiss') return;
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clients) {
      for (var i = 0; i < clients.length; i++) {
        if (clients[i].url === targetUrl && 'focus' in clients[i]) return clients[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', function(event) {
  var data = event.data;
  if (!data) return;
  if (data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (data.type === 'CLEAR_CACHES') {
    caches.keys().then(function(keys) {
      Promise.all(keys.map(function(k) { return caches.delete(k); })).then(function() {
        if (event.source) event.source.postMessage({ type: 'CACHES_CLEARED' });
      });
    });
    return;
  }
  if (data.type === 'PREFETCH' && Array.isArray(data.urls)) {
    caches.open(SHELL_CACHE).then(function(cache) {
      data.urls.forEach(function(url) {
        fetch(url).then(function(r) { if (r.ok) cache.put(url, r); }).catch(function(){});
      });
    });
    return;
  }
});

console.log('[SW] sw.js loaded —', APP_VERSION);
