// Şoför konum paylaşımı: uygulama açıldığında otomatik başlar, yaklaşık 3 dakikada bir konumu sunucuya gönderir (konum_yaz).
// Web uygulaması arka planda konum alamaz: paylaşım uygulama açık ve ekran yanıkken sürer.
import * as api from "./api.js";
import * as veri from "./veri.js";

export const ARALIK = 180000;
const durum = { acik: false, son: null, dogruluk: null, gonderilen: 0, izinYok: false };
const dinleyiciler = new Set();
let zamanlayici = null, ekranKilidi = null;

const yay = () => dinleyiciler.forEach((f) => f({ ...durum }));
export const durumOku = () => ({ ...durum });
export function dinle(f) { dinleyiciler.add(f); return () => dinleyiciler.delete(f); }
export const konumDestegi = () => "geolocation" in navigator;

function konumAl() {
  return new Promise((coz, red) => navigator.geolocation.getCurrentPosition(coz, red, { enableHighAccuracy: true, timeout: 25000, maximumAge: 60000 }));
}

export async function gonder() {
  if (!durum.acik) return;
  try {
    const k = await konumAl();
    const c = k.coords;
    await api.rpc("konum_yaz", {
      p_isletme: veri.baglam.isletme, p_enlem: c.latitude, p_boylam: c.longitude,
      p_dogruluk: c.accuracy ?? null, p_hiz: c.speed != null && !Number.isNaN(c.speed) ? c.speed * 3.6 : null, p_yon: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
    });
    durum.son = new Date();
    durum.dogruluk = c.accuracy ?? null;
    durum.gonderilen += 1;
    durum.izinYok = false;
  } catch (e) {
    if (e && e.code === 1) { durum.izinYok = true; await bitir(); return; }   // izin verilmedi: uygulama bir sonraki açılışta yeniden dener
    // diğer hatalarda (zaman aşımı, sinyal yok) bir sonraki döngüde yeniden denenir
  } finally {
    yay();
  }
}

async function ekranKilidiAl() {
  try { if ("wakeLock" in navigator && !ekranKilidi) { ekranKilidi = await navigator.wakeLock.request("screen"); ekranKilidi.addEventListener("release", () => { ekranKilidi = null; }); } }
  catch { /* desteklenmiyor ya da pil tasarrufunda: konum yine de ekran açıkken gönderilir */ }
}

async function baslat() {
  if (durum.acik || !konumDestegi()) return;
  durum.acik = true;
  clearInterval(zamanlayici);
  zamanlayici = setInterval(gonder, ARALIK);
  ekranKilidiAl();
  yay();
  await gonder();
}

export async function bitir() {
  clearInterval(zamanlayici);
  zamanlayici = null;
  durum.acik = false;
  if (ekranKilidi) { try { await ekranKilidi.release(); } catch { /* zaten bırakılmış */ } ekranKilidi = null; }
  if (veri.baglam.isletme) await api.rpc("konum_bitir", { p_isletme: veri.baglam.isletme }).catch(() => {});
  yay();
}

// Uygulama her açıldığında (kabuk kurulduğunda) şoför hesabı için paylaşım otomatik başlar; zaten açıksa dokunulmaz.
export function surdur() {
  if (!veri.baglam.uye || !veri.baglam.uye.sofor || durum.acik || !konumDestegi()) return;
  baslat();
}

// Ekran yeniden öne gelince: ekran kilidi yenilenir, son gönderim 3 dakikadan eskiyse hemen gönderilir.
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !durum.acik) return;
  ekranKilidiAl();
  if (!durum.son || Date.now() - durum.son.getTime() >= ARALIK - 5000) gonder();
});
