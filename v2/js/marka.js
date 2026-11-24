// Şirket (işletme) kodu ve marka (ad + logo). Giriş ekranında kullanıcı henüz belli olmadığı için şirket, kodundan bulunur:
// alt alan adı > adresteki ?i= > cihazda saklı > varsayılan. Kod yazılınca herkese açık marka_getir yalnızca ad, logo ve giriş alan adını döner.
// Giriş yapılınca işletmenin kendi kaydı kullanılır (veri.js). Son marka şirket koduna göre cihazda saklanır, açılışta anında görünür.
import * as api from "./api.js";
import { VARSAYILAN_SIRKET, ALT_ALAN_KOKU } from "./config.js";
import { markaNormalle, VARSAYILAN_MARKA } from "./marka_normal.js";
import { sirketKodunuBul, sirketKodunuNormalle } from "./kimlik.js";

const MARKA_ANAHTARI = "filo2.marka.";
const SIRKET_ANAHTARI = "filo2.sirket";
export const marka = { ...VARSAYILAN_MARKA };
const durum = { kod: "", alan: "" };
const dinleyiciler = new Set();

const oku = (anahtar) => { try { return localStorage.getItem(anahtar) || ""; } catch { return ""; } };
const yaz = (anahtar, deger) => { try { localStorage.setItem(anahtar, deger); } catch { /* depolama dolu ya da kapalı */ } };

// Dinleyici false dönerse (ekran artık yoksa) listeden çıkarılır.
export function markaDinle(fn) { dinleyiciler.add(fn); }

export function markaUygula(ham, kalici = true) {
  Object.assign(marka, markaNormalle(ham));
  document.title = marka.ad;
  if (kalici && durum.kod) yaz(MARKA_ANAHTARI + durum.kod, JSON.stringify({ ad: marka.ad, logo: marka.logo === VARSAYILAN_MARKA.logo ? "" : marka.logo }));
  for (const fn of [...dinleyiciler]) if (fn() === false) dinleyiciler.delete(fn);
}

// Açılışta şirket kodunu belirler. Dönüş: { kod, kilitli } (kilitli: alt alan adından geldi, değiştirilemez)
export function sirketBaslangici() {
  const b = sirketKodunuBul({ arama: location.search, depolanan: oku(SIRKET_ANAHTARI), hostname: location.hostname, altAlanKoku: ALT_ALAN_KOKU, varsayilan: VARSAYILAN_SIRKET });
  durum.kod = b.kod;
  return { kod: b.kod, kilitli: b.kaynak === "altalan" };
}

export function markaOnbellektenYukle(kod) {
  const k = sirketKodunuNormalle(kod);
  if (!k) return markaUygula({}, false);
  try { markaUygula(JSON.parse(oku(MARKA_ANAHTARI + k) || "null"), false); } catch { markaUygula({}, false); }
}

// Dönüş: { durum: "bulundu" | "yok" | "hata", alan }. "hata": ağ yok; "yok": böyle bir şirket kodu yok.
export async function sirketBilgisiYukle(kod) {
  const k = sirketKodunuNormalle(kod);
  if (!k) return { durum: "yok", alan: "" };
  try {
    const r = await api.rpc("marka_getir", { p_slug: k });
    if (!r) { markaUygula({}, false); return { durum: "yok", alan: "" }; }
    durum.kod = k;
    durum.alan = r.alan;
    markaUygula(r);
    return { durum: "bulundu", alan: durum.alan };
  } catch {
    return { durum: "hata", alan: durum.alan };
  }
}

// Başarılı girişten sonra: kod cihazda saklanır, bir sonraki açılışta yazmak gerekmez.
export function sirketKaydet(kod) {
  const k = sirketKodunuNormalle(kod);
  if (k) { durum.kod = k; yaz(SIRKET_ANAHTARI, k); }
}
