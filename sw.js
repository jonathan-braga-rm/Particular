// Service worker — offline-first com pré-cache versionado do app shell
const VERSION = 'v1';
const CACHE = `gastos-viagem-${VERSION}`;
const RUNTIME = 'gastos-viagem-runtime';

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/charts.js',
  './js/export.js',
  './js/ocr.js',
  './vendor/xlsx.mini.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('gastos-viagem-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // CDN do Tesseract (OCR opcional): cache-first no cache runtime,
  // para que o OCR continue funcionando offline depois do 1º uso.
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.open(RUNTIME).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res && res.ok) c.put(e.request, res.clone());
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell: cache-first, com fallback de navegação para o index
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
