// Uygulama kabuğunu çevrimdışı açar. Veri (Supabase) ve oturum istekleri ASLA önbelleğe alınmaz.
const SURUM = "filo2-v43";
const KABUK = [
  "./", "index.html", "stil.css", "manifest.webmanifest",
  "js/uygulama.js", "js/bildirim.js", "js/xlsx_oku.js", "js/ice_aktar.js", "js/api.js", "js/profil.js", "js/config.js", "js/veri.js", "js/hesap.js", "js/bicim.js", "js/ui.js", "js/dosya.js", "js/goruntuleyici.js", "js/kurulum.js", "js/ozet.js", "js/grafik.js", "js/firma_suz.js", "js/marka.js", "js/marka_normal.js", "js/kimlik.js", "js/metin.js", "js/menu.js", "js/lottie.js", "js/form.js", "js/duzenle.js", "js/rapor.js", "js/puantaj.js",
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

// Anlık bildirim (Web Push): sahibe masaüstündeki kullanıcı hareketlerini bildirir (bkz. supabase/functions/bildirim).
self.addEventListener("push", (e) => {
  let v = {};
  try { v = e.data ? e.data.json() : {}; } catch { v = { mesaj: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(v.baslik || "Filo Muhasebe", {
    body: v.mesaj || "", tag: v.etiket || "filo", renotify: true, icon: "ikon-192.png", badge: "favicon-32.png",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => {
    for (const c of l) if ("focus" in c) return c.focus();
    return self.clients.openWindow("./");
  }));
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
