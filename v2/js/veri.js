// Oturumun bağlamı (işletme, yetkiler, lisans) ve bellek içi veri önbelleği.
import * as api from "./api.js";
import { markaUygula } from "./marka.js";
import { MENU } from "./menu.js";
import { okulListesi, servisKullanmayanListesi, servisListesi, faturaKaydi, esnafKaydi, aracKaydi, akaryakitListesi, icHizmetListesi } from "./hesap.js";

export const baglam = { isletme: null, uye: null, lisans: null, isletmeAdi: "", platform: false, bakim: null };

const SURE = 5 * 60 * 1000;
const onbellek = new Map();   // anahtar -> { t, sonuc: Promise }

export function onbellekTemizle() { onbellek.clear(); }

function onbellekli(anahtar, getir) {
  const o = onbellek.get(anahtar);
  if (o && Date.now() - o.t < SURE) return o.sonuc;
  const sonuc = getir();
  onbellek.set(anahtar, { t: Date.now(), sonuc });
  sonuc.catch(() => onbellek.delete(anahtar));
  return sonuc;
}

export async function baglamKur() {
  baglam.platform = false;
  // Yöneticiler işletmenin tüm üyeliklerini görebilir; yalnızca oturumdaki kullanıcının kendi üyeliği alınır.
  const kimlik = api.kullanici();
  if (!kimlik) { baglam.isletme = null; return false; }
  const uyelikSorgusu = (isletmeAlanlari) => api.sorgu(`uyelikler?select=isletme_id,ad,rol,izinler,salt_okunur,isletmeler(${isletmeAlanlari})&kullanici_id=eq.${encodeURIComponent(kimlik.id)}&aktif=eq.true&order=olusturma`);
  let uyelikler;
  try { uyelikler = await uyelikSorgusu("ad,marka_ad,logo,lisans_bitis,omur_boyu"); }
  catch (e) {
    if (e.durum !== 400) throw e;   // marka.sql henüz uygulanmamış: marka alanları olmadan devam edilir
    uyelikler = await uyelikSorgusu("ad,lisans_bitis,omur_boyu");
  }
  if (!uyelikler.length) { baglam.isletme = null; return false; }
  const u = uyelikler[0];
  baglam.isletme = u.isletme_id;
  baglam.uye = u;
  baglam.isletmeAdi = (u.isletmeler && u.isletmeler.ad) || "";
  if (u.isletmeler) markaUygula({ ad: u.isletmeler.marka_ad || u.isletmeler.ad, logo: u.isletmeler.logo });
  baglam.lisans = await api.rpc("lisans_durumu", { p_isletme: u.isletme_id }).catch(() => null);
  baglam.platform = (await api.rpc("platform_yoneticisi_mi").catch(() => false)) === true;
  baglam.bakim = await api.rpc("bakim_durumu").catch(() => null);   // bakim.sql uygulanmamışsa null: bakım yok sayılır
  onbellekTemizle();
  return true;
}

// Çalışan oturumda yetki/üyelik değişikliğini sunucudan okur: "kaldirildi" | "degisti" | "ayni".
export async function yetkiKontrol() {
  const kimlik = api.kullanici();
  if (!kimlik || !baglam.isletme || !baglam.uye) return "ayni";
  const s = await api.sorgu(`uyelikler?select=ad,rol,izinler,salt_okunur&isletme_id=eq.${baglam.isletme}&kullanici_id=eq.${encodeURIComponent(kimlik.id)}&aktif=eq.true`);
  if (!s.length) return "kaldirildi";
  const yeni = s[0], eski = baglam.uye;
  const imza = (u) => JSON.stringify([u.rol, [...(u.izinler || [])].sort(), Boolean(u.salt_okunur)]);
  if (imza(yeni) === imza(eski)) return "ayni";
  baglam.uye = { ...eski, ...yeni };
  onbellekTemizle();
  return "degisti";
}

// Çevrimiçi göstergesi: açık uygulama 30 saniyede bir sunucuya "buradayım" der (nabiz.sql uygulanmamışsa sessizce atlanır).
let sonNabiz = 0;
export function nabiz() {
  if (!baglam.isletme || Date.now() - sonNabiz < 30000) return;
  sonNabiz = Date.now();
  api.rpc("uye_nabiz", { p_isletme: baglam.isletme }).catch(() => {});
}

// Masaüstündeki "Hesabınızın erişimi kısıtlandı": sahip/yönetici dışındaki kullanıcıya hiçbir sekme izni tanımlanmamışsa.
export function erisimYok() {
  const u = baglam.uye;
  if (!u || baglam.platform || ["sahip", "yonetici"].includes(u.rol)) return false;
  const izinler = u.izinler || [];
  return !MENU.some((m) => izinler.includes(m.izin));
}

// Tam ekran durum sayfası: "bloke" (şirket platform yöneticisince bloke edildi) | "bakim" (tüm şirketler bakımda) | "erisim" (hiçbir sekmeye izin yok) | null. Platform yöneticisi etkilenmez.
export function durumTuru() {
  if (baglam.platform) return null;
  if (baglam.lisans && baglam.lisans.aktif === false) return "bloke";
  if (baglam.bakim && baglam.bakim.acik === true) return "bakim";
  if (erisimYok()) return "erisim";
  return null;
}

export async function durumTazele() {
  const [lisans, bakim] = await Promise.all([
    api.rpc("lisans_durumu", { p_isletme: baglam.isletme }).catch(() => baglam.lisans),
    api.rpc("bakim_durumu").catch(() => baglam.bakim),
  ]);
  baglam.lisans = lisans;
  baglam.bakim = bakim;
  return durumTuru();
}

export const lisansAcik = () => !baglam.lisans || baglam.lisans.acik !== false;
export const izinVar = (modul) => Boolean(baglam.uye) && lisansAcik() && (["sahip", "yonetici"].includes(baglam.uye.rol) || (baglam.uye.izinler || []).includes(modul));
export const yazabilir = (modul) => izinVar(modul) && !baglam.uye.salt_okunur;

const ham = (tablo) => onbellekli("ham:" + tablo, () => api.hepsi(tablo, baglam.isletme));

export const ayarlar = () => onbellekli("ayarlar", async () => {
  const s = await api.sorgu(`isletme_ayarlari?select=anahtar,deger&isletme_id=eq.${baglam.isletme}`);
  return Object.fromEntries(s.map((r) => [r.anahtar, r.deger]));
});

export const okul = () => ham("okul_ogrenciler").then(okulListesi);
export const okulServisKullanmayan = () => ham("okul_ogrenciler").then(servisKullanmayanListesi);
export const okulServisler = () => ham("okul_ogrenciler").then(servisListesi);
export const faturalar = () => ham("faturalar").then((l) => l.map(faturaKaydi));
export const esnaflar = () => ham("esnaflar").then((l) => l.map(esnafKaydi));
export const akaryakit = async () => {
  const [satirlar, araclar] = await Promise.all([ham("akaryakit"), ham("araclar")]);
  return akaryakitListesi(satirlar, araclar);
};
export const icHizmet = () => ham("ic_hizmetler").then(icHizmetListesi);
export const sirketEvraklari = () => ham("sirket_evraklari");
export const icFiyatlar = () => ham("ic_hizmet_fiyatlar");
export const icYerler = () => ham("ic_gidilen_yerler");
export const icSoforler = () => ham("ic_soforler");
export const hamKayit = async (tablo, id) => (await ham(tablo)).find((x) => x.id === id) || null;
export const hamListe = (tablo) => ham(tablo);
export const araclar = async () => {
  const [satirlar, ayar] = await Promise.all([ham("araclar"), ayarlar().catch(() => ({}))]);
  return satirlar.map((a) => aracKaydi(a, ayar.bakim_periyodu_gun));
};

// ── Yazma ───────────────────────────────────────────────────────────────────
// Kayıtlar masaüstüyle aynı biçimde (data = masaüstü kaydı) yazılır. Düzenleme sunucudaki güncel kaydı okuyup değiştirir ve
// "surum" denetimiyle geri yazar; başkası arada değiştirmişse sessizce ezmek yerine uyarı verilir. Silme "silindi" işaretidir.
export const yeniKimlik = (onek = "") => onek + ((crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);
export const tabloTazele = (...tablolar) => { for (const t of tablolar) onbellek.delete("ham:" + t); };
const kimlikFiltresi = (id) => `isletme_id=eq.${baglam.isletme}&id=eq.${encodeURIComponent(id)}`;
const CAKISMA = "Bu kayıt başka biri tarafından değiştirilmiş. Yenileyip tekrar deneyin.";

// id verilmezse yeni kayıt: degistir({}) kaydı üretir ("id" alanını kendisi koymazsa atanır).
export async function kayitKaydet(tablo, id, degistir) {
  try {
    if (!id) {
      const yeni = degistir({});
      yeni.id = yeni.id || yeniKimlik();
      const donen = await api.ekle(tablo, { isletme_id: baglam.isletme, id: yeni.id, data: yeni });
      if (!donen || !donen.length) throw new Error("Kayıt eklenemedi.");
      return yeni;
    }
    const s = await api.sorgu(`${tablo}?select=data,surum&${kimlikFiltresi(id)}&silindi=eq.false`);
    if (!s.length) throw new Error("Kayıt bulunamadı; başkası silmiş olabilir.");
    const veri = degistir(JSON.parse(JSON.stringify(s[0].data)));
    veri.id = id;
    const donen = await api.guncelle(tablo, `${kimlikFiltresi(id)}&surum=eq.${s[0].surum}`, { data: veri });
    if (!donen || !donen.length) throw new Error(CAKISMA);
    return veri;
  } finally {
    tabloTazele(tablo);
  }
}

export async function kayitSil(tablo, id) {
  try {
    const s = await api.sorgu(`${tablo}?select=surum&${kimlikFiltresi(id)}&silindi=eq.false`);
    if (!s.length) return;
    const donen = await api.guncelle(tablo, `${kimlikFiltresi(id)}&surum=eq.${s[0].surum}`, { silindi: true });
    if (!donen || !donen.length) throw new Error(CAKISMA);
  } finally {
    tabloTazele(tablo);
  }
}

// Ödeme sonrası yalnızca ilgili öğrenciyi sunucudan tazeler; tüm listeyi yeniden indirmez.
export async function ogrenciTazele(id) {
  const liste = await ham("okul_ogrenciler");
  const yeni = await api.tek("okul_ogrenciler", baglam.isletme, id);
  const i = liste.findIndex((o) => o.id === id);
  if (yeni && i >= 0) liste[i] = yeni;
}

export function odemeEkle({ ogrenci, tutar, tarih, yontem, not, mobilId }) {
  return api.rpc("okul_odeme_ekle", { p_isletme: baglam.isletme, p_ogrenci: ogrenci, p_tutar: tutar, p_tarih: tarih, p_yontem: yontem, p_not: not || "", p_mobil_id: mobilId });
}
