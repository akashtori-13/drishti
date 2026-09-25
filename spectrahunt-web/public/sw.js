/* DRISHTI service worker: offline-first shell + data.
 * Bump SW_VERSION to invalidate all caches on breaking changes.
 * Strategies:
 *  - navigations: network-first, cache fallback, offline page last resort
 *  - /showcases|reports|coverage|tle JSON: stale-while-revalidate
 *  - images + _next/static + fonts: cache-first (bounded image cache)
 */
const SW_VERSION = 'drishti-v2';
const STATIC_CACHE = `${SW_VERSION}-static`;
const DATA_CACHE = `${SW_VERSION}-data`;
const IMG_CACHE = `${SW_VERSION}-img`;
const MAX_IMG_ENTRIES = 250;

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width,initial-scale=1">`
  + `<title>DRISHTI — offline</title></head><body style="background:#05060c;color:#eef0f8;`
  + `font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center">`
  + `<div><h1>DRISHTI is offline</h1><p>Reconnect, then reload — visited fields stay cached.</p></div>`
  + `</body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest'])).catch(() => undefined)
      .then(() => caches.open(DATA_CACHE))
      // Pin the full curated bundle (precache.json lists every data URL,
      // ~2.5MB): chunked so one missing file can't fail the whole install.
      .then((c) => fetch('/precache.json').then((r) => (r.ok ? r.json() : [])).catch(() => [])
        .then((urls) => (async () => {
          for (let i = 0; i < urls.length; i += 40) {
            try { await c.addAll(urls.slice(i, i + 40)); } catch { /* keep going */ }
          }
        })()))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(SW_VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > max) {
      await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
    }
  } catch { /* noop */ }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchAndPut = fetch(request).then((res) => {
    if (res && res.ok) {
      cache.put(request, res.clone()).catch(() => undefined);
      void trim(DATA_CACHE, 200);
    }
    return res;
  }).catch(() => undefined);
  if (cached) {
    void fetchAndPut;
    return cached;
  }
  const fresh = await fetchAndPut;
  if (fresh) return fresh;
  return Response.error();
}

async function cacheFirst(request, cacheName, trimTo) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      cache.put(request, res.clone()).catch(() => undefined);
      if (trimTo > 0) void trim(cacheName, trimTo);
    }
    return res;
  } catch {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !url.hostname.endsWith('googleapis.com')
    && !url.hostname.endsWith('gstatic.com')) return;

  // navigations: network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html' } });
        }),
    );
    return;
  }

  const path = url.pathname;
  if (path.endsWith('.json') || path.includes('/showcases/') || path.includes('/reports/')
    || path.includes('/tle-bundle') || path.includes('coverage')) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  if (path.startsWith('/_next/static/') || /\.(png|jpg|jpeg|webp|svg|woff2?)$/.test(path)
    || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    const trimTo = path.startsWith('/_next/static/') ? 100 : MAX_IMG_ENTRIES;
    event.respondWith(cacheFirst(request, path.startsWith('/_next/static/') ? STATIC_CACHE : IMG_CACHE, trimTo));
  }
});
