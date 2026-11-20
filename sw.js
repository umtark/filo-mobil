// Yalnızca sayfa kabuğunu önbelleğe alır; öğrenci verisi (/api) asla önbelleğe alınmaz.
const SURUM = 'filo-v4';
const KABUK = ['./', 'index.html', 'stil.css', 'ayar.js', 'moduller.js', 'uygulama.js', 'manifest.webmanifest', 'ikon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(KABUK)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SURUM).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Önce ağ (güncel kalsın), ağ yoksa önbellek
  e.respondWith(fetch(e.request).then(r => {
    const kopya = r.clone();
    caches.open(SURUM).then(c => c.put(e.request, kopya));
    return r;
  }).catch(() => caches.match(e.request)));
});
