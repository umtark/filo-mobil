// Profil fotoğrafı: masaüstüyle ortak, özel "profil_foto" kovasında <işletme>/<kullanıcı_id>.jpg olarak durur (bkz. supabase/profil_foto.sql).
import * as api from "./api.js";
import * as veri from "./veri.js";

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
