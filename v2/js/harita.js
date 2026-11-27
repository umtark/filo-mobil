// Şoför konum haritası (sahip/yönetici): Leaflet + OpenStreetMap. Leaflet yalnızca harita açılınca yüklenir (vendor/leaflet).
// Veri: konum_son_listesi (her şoförün son konumu) ve konum_gecmisi (rota); ikisi de sunucuda yetki denetimli fonksiyonlardır.
import { h, segment } from "./ui.js";
import * as api from "./api.js";
import * as veri from "./veri.js";

const YENILE_MS = 20000;
let yuklenme = null;

function leafletYukle() {
  if (window.L) return Promise.resolve(window.L);
  if (yuklenme) return yuklenme;
  yuklenme = new Promise((coz, red) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css";
    const js = document.createElement("script");
    js.src = "vendor/leaflet/leaflet.js";
    js.onload = () => coz(window.L);
    js.onerror = () => { yuklenme = null; red(new Error("Harita yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.")); };
    document.head.append(css, js);
  });
  return yuklenme;
}

const saat = (d) => new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(d);
function gecenYaz(sn) {
  if (sn < 90) return "az önce";
  if (sn < 3600) return `${Math.round(sn / 60)} dk önce`;
  if (sn < 86400) return `${Math.round(sn / 3600)} sa önce`;
  return `${Math.round(sn / 86400)} gün önce`;
}
const gunBaslangici = (gunOnce = 0) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - gunOnce); return d; };

function karoEkle(L, harita) {
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(harita);
}
const isaret = (L, ad, canli) => L.divIcon({ className: "konum-isaret-kap", iconSize: [0, 0],
  html: `<div class="konum-isaret${canli ? " canli" : ""}"><i></i><span>${String(ad).replace(/[<>&"]/g, "")}</span></div>` });

// Ortak iskelet: üstte durum satırı, altta harita. kur(harita, L, durumYaz) harita hazır olunca çalışır ve yenileme fonksiyonu döndürür.
function haritaEkrani(ustOgeler, kur) {
  const durum = h("p", { class: "soluk harita-durum" }, "Harita yükleniyor");
  const alan = h("div", { class: "harita-alan", role: "application", "aria-label": "Konum haritası" });
  const kap = h("div", { class: "sayfa harita-sayfa" }, ...ustOgeler, durum, alan);
  let zamanlayici = null, kapali = false;
  const baslat = async () => {
    try {
      const L = await leafletYukle();
      if (!kap.isConnected) return requestAnimationFrame(baslat);
      const harita = L.map(alan, { zoomControl: true, attributionControl: true }).setView([39, 35], 6);
      karoEkle(L, harita);
      setTimeout(() => harita.invalidateSize(), 250);
      const yenile = await kur(harita, L, (m) => { durum.textContent = m; });
      zamanlayici = setInterval(() => {
        if (!kap.isConnected) { clearInterval(zamanlayici); kapali = true; harita.remove(); return; }
        if (!document.hidden) yenile().catch(() => {});
      }, YENILE_MS);
    } catch (e) { if (!kapali) durum.textContent = e.message || "Harita açılamadı."; }
  };
  requestAnimationFrame(baslat);
  return kap;
}

// Tek şoför: son konum + seçilen günün rotası. Rota artımlı çekilir (yalnızca yeni noktalar).
export function soforHaritasi(ad) {
  let gun = 0;
  let yenileDis = null;
  const secici = h("div", { class: "harita-secici" });
  const cizSecici = () => secici.replaceChildren(segment([["0", "Bugün"], ["1", "Dün"], ["2", "2 gün önce"]], String(gun), (k) => { gun = Number(k); cizSecici(); if (yenileDis) yenileDis(true); }));
  cizSecici();
  return haritaEkrani([secici], async (harita, L, durumYaz) => {
    let isaretci = null, cizgi = null, baslangicNokta = null, noktalar = [], sonZaman = null, ilk = true;
    const yenile = async (sifirla = false) => {
      if (sifirla) { noktalar = []; sonZaman = null; if (cizgi) { cizgi.remove(); cizgi = null; } if (baslangicNokta) { baslangicNokta.remove(); baslangicNokta = null; } ilk = true; }
      const baslangic = sonZaman || gunBaslangici(gun).toISOString();
      const bitis = gun === 0 ? null : gunBaslangici(gun - 1).toISOString();
      const [liste, yeniNokta] = await Promise.all([
        api.rpc("konum_son_listesi", { p_isletme: veri.baglam.isletme }),
        api.rpc("konum_gecmisi", { p_isletme: veri.baglam.isletme, p_ad: ad, p_baslangic: baslangic, p_bitis: bitis }),
      ]);
      const s = (liste || []).find((x) => x.ad === ad);
      for (const n of yeniNokta) { noktalar.push([n.enlem, n.boylam]); sonZaman = n.zaman; }
      if (noktalar.length) {
        if (cizgi) cizgi.setLatLngs(noktalar); else cizgi = L.polyline(noktalar, { color: "#1a6fbf", weight: 4, opacity: .75 }).addTo(harita);
        if (!baslangicNokta) baslangicNokta = L.circleMarker(noktalar[0], { radius: 5, color: "#1a6fbf", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(harita);
      }
      if (gun === 0 && s && s.enlem != null) {
        const nokta = [s.enlem, s.boylam], canli = s.mesai;
        if (isaretci) { isaretci.setLatLng(nokta); isaretci.setIcon(isaret(L, ad, canli)); } else isaretci = L.marker(nokta, { icon: isaret(L, ad, canli) }).addTo(harita);
        const sn = (Date.now() - Date.parse(s.zaman)) / 1000;
        durumYaz(`${canli ? "Konum paylaşılıyor" : "Mesai dışı"} · son konum ${saat(new Date(s.zaman))} (${gecenYaz(sn)})${s.hiz != null ? ` · ${Math.round(s.hiz)} km/sa` : ""}`);
      } else if (gun !== 0) {
        if (isaretci) { isaretci.remove(); isaretci = null; }
        durumYaz(noktalar.length ? `${noktalar.length} rota noktası` : "Bu gün için konum kaydı yok");
      } else durumYaz("Henüz konum paylaşılmadı");
      if (ilk && (isaretci || noktalar.length)) {
        ilk = false;
        const hedefler = [...noktalar]; if (isaretci) hedefler.push(isaretci.getLatLng());
        if (hedefler.length === 1) harita.setView(hedefler[0], 16); else harita.fitBounds(L.latLngBounds(hedefler), { padding: [40, 40], maxZoom: 17 });
      }
    };
    yenileDis = yenile;
    await yenile();
    return yenile;
  });
}

// Tüm şoförler: son konumlar tek haritada; isim etiketli, çevrimiçi (mesaide) olanlar vurgulu.
export function tumSoforHaritasi() {
  return haritaEkrani([], async (harita, L, durumYaz) => {
    const isaretciler = new Map();
    let ilk = true;
    const yenile = async () => {
      const liste = (await api.rpc("konum_son_listesi", { p_isletme: veri.baglam.isletme })) || [];
      const konumlu = liste.filter((x) => x.enlem != null);
      for (const s of konumlu) {
        const nokta = [s.enlem, s.boylam], m = isaretciler.get(s.ad);
        if (m) { m.setLatLng(nokta); m.setIcon(isaret(L, s.ad, s.mesai)); } else isaretciler.set(s.ad, L.marker(nokta, { icon: isaret(L, s.ad, s.mesai) }).addTo(harita));
      }
      const canli = konumlu.filter((x) => x.mesai).length;
      durumYaz(`${liste.length} şoför · ${canli} mesaide${liste.length - konumlu.length ? ` · ${liste.length - konumlu.length} kişi henüz konum paylaşmadı` : ""}`);
      if (ilk && konumlu.length) {
        ilk = false;
        if (konumlu.length === 1) harita.setView([konumlu[0].enlem, konumlu[0].boylam], 15);
        else harita.fitBounds(L.latLngBounds(konumlu.map((x) => [x.enlem, x.boylam])), { padding: [40, 40], maxZoom: 16 });
      }
    };
    await yenile();
    return yenile;
  });
}
