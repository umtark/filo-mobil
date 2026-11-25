// Profil fotoğrafı: masaüstüyle ortak, özel "profil_foto" kovasında <işletme>/<kullanıcı_id>.jpg olarak durur (bkz. supabase/profil_foto.sql).
import * as api from "./api.js";
import * as veri from "./veri.js";
import { h, toast } from "./ui.js";

const BOYUT = 256;
const yol = () => { const k = api.kullanici(); return k && veri.baglam.isletme ? `${veri.baglam.isletme}/${k.id}.jpg` : null; };
let onbellek = null;   // { url, bitis }

export async function fotoUrl(yeniden = false) {
  const y = yol();
  if (!y) return null;
  if (!yeniden && onbellek && onbellek.bitis > Date.now()) return onbellek.url;
  try {
    const url = await api.depoBaglantisi("profil_foto", y, 3600);
    onbellek = { url: `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, bitis: Date.now() + 50 * 60 * 1000 };
  } catch {
    onbellek = { url: null, bitis: Date.now() + 60 * 1000 };   // fotoğraf yok
  }
  return onbellek.url;
}

// Resmi merkezden kare kırpıp 256x256 JPEG yapar (masaüstündeki kayıtla aynı boyut).
async function kareJpeg(dosya) {
  const adres = URL.createObjectURL(dosya);
  try {
    const resim = await new Promise((coz, red) => { const r = new Image(); r.onload = () => coz(r); r.onerror = () => red(new Error("Bu görsel açılamadı. JPG veya PNG seçin.")); r.src = adres; });
    const kenar = Math.min(resim.naturalWidth, resim.naturalHeight);
    const tuval = document.createElement("canvas");
    tuval.width = tuval.height = BOYUT;
    const c = tuval.getContext("2d");
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, BOYUT, BOYUT);
    c.drawImage(resim, (resim.naturalWidth - kenar) / 2, (resim.naturalHeight - kenar) / 2, kenar, kenar, 0, 0, BOYUT, BOYUT);
    return await new Promise((coz, red) => tuval.toBlob((b) => (b ? coz(b) : red(new Error("Görsel hazırlanamadı."))), "image/jpeg", 0.88));
  } finally { URL.revokeObjectURL(adres); }
}

export async function fotoYukle(dosya) {
  const y = yol();
  if (!y) throw new Error("Oturum bulunamadı.");
  await api.depoYukle("profil_foto", y, await kareJpeg(dosya), { "x-upsert": "true" });
  return fotoUrl(true);
}

export async function fotoSil() {
  const y = yol();
  if (!y) return;
  await api.depoSil("profil_foto", y);
  onbellek = { url: null, bitis: Date.now() + 60 * 1000 };
}

// Avatar öğesine fotoğrafı (varsa) arka plan olarak uygular; yoksa baş harf kalır.
export async function avatarUygula(el) {
  const url = await fotoUrl();
  if (url && el.isConnected !== false) { el.style.backgroundImage = `url("${url}")`; el.classList.add("foto"); }
  return Boolean(url);
}

// Büyük avatar + fotoğraf seç/kaldır (Hesap ekranı ve menüdeki avatar paneli ortak kullanır). degisti(url): fotoğraf değişince çağrılır.
export function fotoBolumu(ad, degisti = () => {}) {
  const av = h("span", { class: "avatar avatar-buyuk", "aria-hidden": "true" }, (ad[0] || "?").toLocaleUpperCase("tr"));
  const girdi = h("input", { type: "file", accept: "image/*", hidden: true, "aria-label": "Profil fotoğrafı seç" });
  const kaldir = h("button", { class: "dugme ikincil", type: "button", hidden: true }, "Fotoğrafı kaldır");
  const uygula = (url) => {
    av.style.backgroundImage = url ? `url("${url}")` : "";
    av.classList.toggle("foto", Boolean(url));
    kaldir.hidden = !url;
  };
  fotoUrl().then(uygula);
  girdi.addEventListener("change", async () => {
    const dosya = girdi.files[0];
    girdi.value = "";
    if (!dosya) return;
    try { const url = await fotoYukle(dosya); uygula(url); degisti(url); toast("Fotoğraf kaydedildi", "basari"); } catch (e) { toast(e.message || "Fotoğraf yüklenemedi", "hata"); }
  });
  kaldir.onclick = async () => {
    try { await fotoSil(); uygula(null); degisti(null); toast("Fotoğraf kaldırıldı", "basari"); } catch (e) { toast(e.message || "Fotoğraf kaldırılamadı", "hata"); }
  };
  return h("div", { class: "profil-foto" }, h("button", { class: "avatar-dugme", type: "button", "aria-label": "Profil fotoğrafı seç", onclick: () => girdi.click() }, av),
    h("button", { class: "dugme birincil", type: "button", onclick: () => girdi.click() }, "Fotoğraf seç"), girdi, kaldir);
}

export const gorunenAd = () => (veri.baglam.uye && veri.baglam.uye.ad) || (api.kullanici() && api.epostadanKullaniciAdi(api.kullanici().email)) || "";