// Service worker: makes the app open instantly and the map draw with no signal.
// Bump V together with the ?v= numbers in index.html on every release.
const V = '8';
const SHELL = 'fireline-shell-v' + V;
const TILES = 'fireline-tiles';
const SHELL_FILES = [
  './', 'index.html', `styles.css?v=${V}`, `app.js?v=${V}`, `config.js?v=${V}`, `db.js?v=${V}`, `icon.svg?v=${V}`, 'manifest.webmanifest',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // GeoPDF reader, so incident maps can be imported with no signal
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
];
const TILE_HOSTS = ['basemap.nationalmap.gov', 'server.arcgisonline.com', 'tile.opentopomap.org', 'tile.openstreetmap.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fireline-shell') && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const cacheable = (r) => r && (r.ok || r.type === 'opaque');

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Map tiles: cache-first, and remember every tile you've looked at.
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request.url);
      if (hit) return hit;
      try {
        const r = await fetch(e.request);
        if (cacheable(r)) c.put(e.request.url, r.clone());
        return r;
      } catch { return new Response('', { status: 504 }); }
    }));
    return;
  }

  // Live data (ArcGIS REST, USGS elevation): always network; the app keeps its own offline copy.
  if (url.pathname.includes('/arcgis/rest/') || url.hostname === 'epqs.nationalmap.gov') return;

  const isShell = url.origin === location.origin || url.hostname === 'unpkg.com';
  if (!isShell) return;

  // App files: serve the saved copy instantly (works on no signal or weak "lie-fi"),
  // and refresh it in the background so the next open gets any update.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const exact = await cache.match(e.request);
    const refresh = fetch(e.request).then((r) => { if (cacheable(r)) cache.put(e.request, r.clone()); return r; });
    if (exact) { e.waitUntil(refresh.catch(() => {})); return exact; }
    try { return await refresh; }
    catch {
      const loose = await caches.match(e.request, { ignoreSearch: true });
      return loose || (e.request.mode === 'navigate' ? caches.match('index.html') : new Response('', { status: 504 }));
    }
  })());
});
