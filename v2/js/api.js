// Supabase ile konuşan tek katman: giriş (GoTrue) ve tablo/fonksiyon çağrıları (PostgREST). Kütüphane yok, derleme yok.
import { SUPABASE_URL, ANON_KEY, KULLANICI_ALAN_ADI } from "./config.js";

const ANAHTAR = "filo2.oturum";
let oturum = null;
try { oturum = JSON.parse(localStorage.getItem(ANAHTAR) || "null"); } catch { oturum = null; }

export class ApiHatasi extends Error {
  constructor(mesaj, durum) { super(mesaj); this.durum = durum; }
}

export const yapilandirildi = () => Boolean(ANON_KEY);
export const girisVar = () => Boolean(oturum && oturum.refresh_token);
export const kullanici = () => (oturum && oturum.user) || null;

function oturumKaydet(o) {
  oturum = o;
  if (o) localStorage.setItem(ANAHTAR, JSON.stringify({ access_token: o.access_token, refresh_token: o.refresh_token, expires_at: o.expires_at, user: { id: o.user.id, email: o.user.email } }));
  else localStorage.removeItem(ANAHTAR);
}

function hataMetni(cevap, govde) {
  const m = (govde && (govde.error_description || govde.msg || govde.message)) || "";
  if (m === "Invalid login credentials") return "Kullanıcı adı ya da parola hatalı.";
  if (cevap.status === 401) return "Oturum süresi doldu, tekrar giriş yapın.";
  if (cevap.status === 403 || (govde && govde.code === "42501")) return "Bu işlem için yetkiniz yok.";
  return m || `İşlem yapılamadı (${cevap.status}).`;
}

async function cagir(yol, { yontem = "GET", govde, ust = {}, jetonlu = true } = {}, tekrar = true) {
  const basliklar = { apikey: ANON_KEY, ...ust };
  if (govde !== undefined) basliklar["Content-Type"] = "application/json";
  if (jetonlu) {
    if (oturum && oturum.expires_at && oturum.expires_at - 30 < Date.now() / 1000) await yenile();
    // Yeni tip "publishable" anahtar JWT değildir; Authorization'a yalnızca kullanıcının oturum jetonu konur.
    if (oturum) basliklar.Authorization = `Bearer ${oturum.access_token}`;
  }
  let cevap;
  try {
    cevap = await fetch(SUPABASE_URL + yol, { method: yontem, headers: basliklar, body: govde === undefined ? undefined : JSON.stringify(govde) });
  } catch {
    throw new ApiHatasi("Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.", 0);
  }
  let veri = null;
  try { veri = await cevap.json(); } catch { veri = null; }
  if (cevap.status === 401 && jetonlu && tekrar && oturum) {
    await yenile();
    return cagir(yol, { yontem, govde, ust, jetonlu }, false);
  }
  if (!cevap.ok) throw new ApiHatasi(hataMetni(cevap, veri), cevap.status);
  return veri;
}

function oturumAyarla(v) {
  oturumKaydet({ ...v, expires_at: v.expires_at || Math.floor(Date.now() / 1000) + (v.expires_in || 3600) });
}

// Kullanıcı yalnızca kullanıcı adını yazar ("Ümit Arik" -> umitarik@filo.local); '@' içeriyorsa e-posta olduğu gibi kullanılır.
// Dönüşüm supabase/kullanici_aktar.py içindeki kullanici_eposta ile aynı kalmalıdır.
const TR_HARITA = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
export const kullaniciAdindanEposta = (ad) => {
  const t = String(ad).trim();
  if (t.includes("@")) return t.toLowerCase();
  const sade = t.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().replace(/[çğıöşüâîû]/g, (c) => TR_HARITA[c]).replace(/[^a-z0-9._-]/g, "");
  return `${sade}@${KULLANICI_ALAN_ADI}`;
};
export const epostadanKullaniciAdi = (e) => String(e || "").replace(new RegExp(`@${KULLANICI_ALAN_ADI.replace(/\./g, "\\.")}$`, "i"), "");

export async function girisYap(kullaniciAdi, parola) {
  const v = await cagir("/auth/v1/token?grant_type=password", { yontem: "POST", govde: { email: kullaniciAdindanEposta(kullaniciAdi), password: parola }, jetonlu: false });
  oturumAyarla(v);
}

let yenileniyor = null;
async function yenile() {
  if (!oturum) return;
  yenileniyor = yenileniyor || cagir("/auth/v1/token?grant_type=refresh_token", { yontem: "POST", govde: { refresh_token: oturum.refresh_token }, jetonlu: false })
    .then(oturumAyarla)
    .catch(() => { oturumKaydet(null); throw new ApiHatasi("Oturum süresi doldu, tekrar giriş yapın.", 401); })
    .finally(() => { yenileniyor = null; });
  return yenileniyor;
}

export function cikisYap() { oturumKaydet(null); }

export const sorgu = (yol) => cagir("/rest/v1/" + yol);
export const rpc = (ad, govde) => cagir("/rest/v1/rpc/" + ad, { yontem: "POST", govde });

// PostgREST bir istekte en çok 1000 satır döndürür; sayfa sayfa hepsini alır.
export async function hepsi(tablo, isletme) {
  const sonuc = [];
  for (let ofset = 0; ; ofset += 1000) {
    const sayfa = await sorgu(`${tablo}?select=id,data&isletme_id=eq.${isletme}&silindi=eq.false&order=id&limit=1000&offset=${ofset}`);
    for (const s of sayfa) sonuc.push({ ...s.data, id: s.id });
    if (sayfa.length < 1000) return sonuc;
  }
}

export async function tek(tablo, isletme, id) {
  const s = await sorgu(`${tablo}?select=id,data&isletme_id=eq.${isletme}&silindi=eq.false&id=eq.${encodeURIComponent(id)}`);
  return s.length ? { ...s[0].data, id: s[0].id } : null;
}
