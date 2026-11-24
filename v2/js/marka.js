// İşletme markası (ad + logo). Giriş ekranında işletme henüz bilinmediği için config.js'teki ISLETME_ANAHTARI ile herkese açık
// marka_getir çağrılır; giriş yapılınca işletmenin kendi kaydı kullanılır (veri.js). Son marka cihazda saklanır, açılışta anında görünür.
import * as api from "./api.js";
import { ISLETME_ANAHTARI } from "./config.js";
import { markaNormalle, VARSAYILAN_MARKA } from "./marka_normal.js";

const ANAHTAR = "filo2.marka";
export const marka = { ...VARSAYILAN_MARKA };
const dinleyiciler = new Set();

// Dinleyici false dönerse (ekran artık yoksa) listeden çıkarılır.
export function markaDinle(fn) { dinleyiciler.add(fn); }

export function markaUygula(ham) {
  Object.assign(marka, markaNormalle(ham));
  document.title = marka.ad;
  try { localStorage.setItem(ANAHTAR, JSON.stringify({ ad: marka.ad, logo: marka.logo === VARSAYILAN_MARKA.logo ? "" : marka.logo })); } catch { /* depolama dolu ya da kapalı */ }
  for (const fn of [...dinleyiciler]) if (fn() === false) dinleyiciler.delete(fn);
}

export function markaOnbellektenYukle() {
  try { markaUygula(JSON.parse(localStorage.getItem(ANAHTAR) || "null")); } catch { /* bozuk kayıt yok sayılır */ }
}

export async function markaSunucudanYukle() {
  if (!ISLETME_ANAHTARI) return;
  try {
    const r = await api.rpc("marka_getir", { p_slug: ISLETME_ANAHTARI });
    if (r) markaUygula(r);
  } catch { /* ağ yok ya da henüz kurulmamış: son bilinen marka kalır */ }
}
