// NzSurf service worker: de app opent ook zonder of met slecht bereik (strand!).
// - Pagina's: eerst het netwerk, anders de laatst bewaarde versie.
// - Bestanden in /assets/ hebben een hash in de naam: bewaren en hergebruiken.
// - Al het andere (weerdata, Firebase, API's) gaat ongemoeid naar het netwerk;
//   de app bewaart zelf de laatste verwachting.
const CACHE = 'nzsurf-v1';
const SHELL = ['/', '/manifest.webmanifest', '/pwa/icon-192.png', '/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      // Alleen de app zelf bewaren (niet de blogpagina's).
      if (res.ok && url.pathname === '/') { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('/')).then(r => r || Response.error())));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/pwa/') || url.pathname.startsWith('/brand/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
