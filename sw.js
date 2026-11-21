// Yalnızca sayfa kabuğunu önbelleğe alır; öğrenci verisi (/api) asla önbelleğe alınmaz.
const SURUM = 'filo-v14';
const KABUK = ['./', 'index.html', 'stil.css', 'ayar.js', 'moduller.js', 'uygulama.js', 'manifest.webmanifest',
  'ikon-192.png', 'ikon-512.png', 'ikon-maskable-512.png', 'favicon.ico', 'favicon-32.png', 'apple-touch-icon.png',
  ...['dashboard', 'tahsilat', 'evrak', 'fatura', 'arac', 'esnaf', 'petrol', 'ic_hizmet', 'ayarlar'].map(i => 'ikon/' + i + '.png')];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(KABUK.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SURUM).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Önce ağ (güncel kalsın), ağ yoksa önbellek; yalnızca başarılı yanıtlar önbelleğe yazılır
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok && r.type === 'basic') {
      const kopya = r.clone();
      e.waitUntil(caches.open(SURUM).then(c => c.put(e.request, kopya)));
    }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
