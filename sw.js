// YalnÄ±zca sayfa kabuÄŸunu Ã¶nbelleÄŸe alÄ±r; Ã¶ÄŸrenci verisi (/api) asla Ã¶nbelleÄŸe alÄ±nmaz.
const SURUM = 'filo-v11';
const KABUK = ['./', 'index.html', 'stil.css', 'ayar.js', 'moduller.js', 'uygulama.js', 'manifest.webmanifest', 'ikon-192.png', 'favicon.ico', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SURUM).then(c => c.addAll(KABUK.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== SURUM).map(x => caches.delete(x)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // Ã–nce aÄŸ (gÃ¼ncel kalsÄ±n), aÄŸ yoksa Ã¶nbellek
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const kopya = r.clone();
    caches.open(SURUM).then(c => c.put(e.request, kopya));
    return r;
  }).catch(() => caches.match(e.request)));
});
