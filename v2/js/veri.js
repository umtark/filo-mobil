// Oturumun bağlamı (işletme, yetkiler, lisans) ve bellek içi veri önbelleği.
import * as api from "./api.js";
import { markaUygula } from "./marka.js";
import { okulListesi, faturaKaydi, esnafKaydi, aracKaydi, akaryakitListesi, icHizmetListesi } from "./hesap.js";

export const baglam = { isletme: null, uye: null, lisans: null, isletmeAdi: "" };

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
  onbellekTemizle();
  return true;
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
export const faturalar = () => ham("faturalar").then((l) => l.map(faturaKaydi));
export const esnaflar = () => ham("esnaflar").then((l) => l.map(esnafKaydi));
export const akaryakit = async () => {
  const [satirlar, araclar] = await Promise.all([ham("akaryakit"), ham("araclar")]);
  return akaryakitListesi(satirlar, araclar);
};
export const icHizmet = () => ham("ic_hizmetler").then(icHizmetListesi);
export const araclar = async () => {
  const [satirlar, ayar] = await Promise.all([ham("araclar"), ayarlar().catch(() => ({}))]);
  return satirlar.map((a) => aracKaydi(a, ayar.bakim_periyodu_gun));
};

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
