// Uygulama kabuğunu çevrimdışı açar. Veri (Supabase) ve oturum istekleri ASLA önbelleğe alınmaz.
const SURUM = "filo2-v40";
const KABUK = [
  "./", "index.html", "stil.css", "manifest.webmanifest",
  "js/uygulama.js", "js/api.js", "js/profil.js", "js/config.js", "js/veri.js", "js/hesap.js", "js/bicim.js", "js/ui.js", "js/dosya.js", "js/goruntuleyici.js", "js/ozet.js", "js/grafik.js", "js/firma_suz.js", "js/marka.js", "js/marka_normal.js", "js/kimlik.js", "js/metin.js", "js/menu.js", "js/lottie.js", "js/form.js", "js/duzenle.js", "js/rapor.js", "js/puantaj.js",
  "js/cikti.js", "js/cikti_pdf.js", "js/cikti_xlsx.js", "js/cikti_yardim.js", "js/cikti_muhasebe.js", "js/cikti_filo.js", "js/cikti_okul.js", "js/cikti_genel.js",
  "js/ekranlar/bugun.js", "js/ekranlar/okul.js", "js/ekranlar/muhasebe.js", "js/ekranlar/filo.js", "js/ekranlar/evrak.js", "js/ekranlar/hesap.js", "js/ekranlar/yonetim.js", "js/ekranlar/kullanicilar.js", "js/ekranlar/basvuru.js", "js/ekranlar/durum.js",
  "yazi/Nunito-Regular.ttf", "yazi/Nunito-Bold.ttf", "yazi/manrope-latin.woff2", "yazi/manrope-latin-ext.woff2", "ikon/onay-animasyon.png", "ikon/goz-acik.png", "ikon/goz-kapali.png", "ikon/bakim-modu.png", "ikon/Bloke.png", "ikon-192.png", "ikon-512.png", "favicon-32.png", "apple-touch-icon.png",
  ...["ana-sayfa", "sirket-evrak", "fatura", "arac", "esnaf", "akaryakit", "ic-hizmet", "okul", "ayarlar"].map((a) => `ikon/menu/${a}.png`),
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((adlar) => Promise.all(adlar.filter((a) => a !== SURUM).map((a) => caches.delete(a)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const istek = e.request;
  const url = new URL(istek.url);
  if (istek.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/rest/") || url.pathname.startsWith("/auth/")) return;
  // Önce ağ (güncel kod), ağ yoksa önbellek; başarılı yanıtlar önbelleği tazeler.
  e.respondWith(fetch(istek).then((yanit) => {
    if (yanit.ok) { const kopya = yanit.clone(); caches.open(SURUM).then((c) => c.put(istek, kopya)); }
    return yanit;
  }).catch(() => caches.match(istek).then((o) => o || caches.match("index.html"))));
});
