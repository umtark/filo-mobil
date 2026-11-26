// Oturumun bağlamı (işletme, yetkiler, lisans) ve bellek içi veri önbelleği.
import * as api from "./api.js";
import { markaUygula } from "./marka.js";
import { MENU } from "./menu.js";
import { okulListesi, servisKullanmayanListesi, servisListesi, faturaKaydi, esnafKaydi, aracKaydi, akaryakitListesi, icHizmetListesi } from "./hesap.js";

export const baglam = { isletme: null, uye: null, lisans: null, isletmeAdi: "", platform: false, bakim: null };

const SURE = 5 * 60 * 1000;
const onbellek = new Map();   // anahtar -> { t, sonuc: Promise }
const izlenen = new Map();    // yüklü tablo -> son bilinen değişiklik zamanı (canlı güncelleme için)

export function onbellekTemizle() { onbellek.clear(); izlenen.clear(); }

function onbellekli(anahtar, getir) {
  const o = onbellek.get(anahtar);
  if (o && Date.now() - o.t < SURE) return o.sonuc;
  const sonuc = getir();
  onbellek.set(anahtar, { t: Date.now(), sonuc });
  sonuc.catch(() => onbellek.delete(anahtar));
  return sonuc;
}

// Tablonun son değişiklik zamanı (tek satırlık sorgu; guncelleme sütunu her ekleme/güncellemede sunucuda yenilenir, silme de güncelleme sayılır).
const sonDegisim = async (tablo) => ((await api.sorgu(`${tablo}?select=guncelleme&isletme_id=eq.${baglam.isletme}&order=guncelleme.desc&limit=1`))[0] || {}).guncelleme || "";

// Yüklü tablolardan başkası tarafından (masaüstü ya da başka telefon) değiştirilenleri bulur, önbelleklerini düşürür ve adlarını döndürür.
export async function degisenTablolar() {
  if (!baglam.isletme) return [];
  const degisen = [];
  await Promise.all([...izlenen].map(async ([tablo, eski]) => {
    try { const yeni = await sonDegisim(tablo); if (yeni && yeni !== eski) degisen.push(tablo); } catch { /* bir sonraki turda yeniden denenir */ }
  }));
  for (const t of degisen) { onbellek.delete("ham:" + t); izlenen.delete(t); }
  return degisen;
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
function cihazEtiketi() {
  const u = navigator.userAgent || "";
  const os = /iPhone|iPad|iPod/.test(u) ? "iPhone" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : "Diğer";
  const tarayici = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "";
  return (os + (tarayici ? " " + tarayici : "")).slice(0, 40);
}
export function nabiz() {
  if (!baglam.isletme || Date.now() - sonNabiz < 30000) return;
  sonNabiz = Date.now();
  api.rpc("uye_nabiz", { p_isletme: baglam.isletme, p_platform: "mobil", p_cihaz: cihazEtiketi() }).catch(() => {});
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
  if (baglam.lisans && (baglam.lisans.aktif === false || baglam.lisans.uye_bitti === true)) return "bloke";
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

const ham = (tablo) => onbellekli("ham:" + tablo, async () => {
  const temel = sonDegisim(tablo).catch(() => null);   // veriden ÖNCE alınır: okuma sırasındaki bir değişiklik bir sonraki kontrolde yakalanır
  const liste = await api.hepsi(tablo, baglam.isletme);
  const t = await temel;
  if (t !== null) izlenen.set(tablo, t);
  return liste;
});

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
export const tabloTazele = (...tablolar) => { for (const t of tablolar) { onbellek.delete("ham:" + t); izlenen.delete(t); } };
const kimlikFiltresi = (id) => `isletme_id=eq.${baglam.isletme}&id=eq.${encodeURIComponent(id)}`;
const CAKISMA = "Bu kayıt başka biri tarafından değiştirilmiş. Yenileyip tekrar deneyin.";

// Telefondan yapılan işlem, işletmede bildirim alıcısı seçilmiş kişilere bildirilir (zil listesi + anlık bildirim); kimlerin alacağını sunucu belirler
// (işlemi yapan kişi kendi bildirimini almaz). Bildirim gitmese de işlem etkilenmez.
const BILDIRIM = {
  faturalar: ["Fatura", (k) => k.Firma],
  araclar: ["Araç", (k) => k.plaka],
  esnaflar: ["Esnaf", (k) => k.isim],
  akaryakit: ["Akaryakıt", (k) => k.plaka_yedek || k.istasyon],
  ic_hizmetler: ["İç Hizmet", (k) => k.gidilen_yer],
  okul_ogrenciler: ["Okul", (k) => k.ad_soyad || k.plaka],
  sirket_evraklari: ["Şirket Evrakı", (k) => k.baslik],
};

export function sahibeBildir(kategori, mesaj) {
  if (!baglam.isletme || !baglam.uye) return;
  api.fonksiyon("bildirim", { isletme: baglam.isletme, kategori, mesaj, kaynak: "mobil" }).catch(() => {});
}

function kayitBildir(tablo, eylem, kayit) {
  const [kategori, ad] = BILDIRIM[tablo] || [tablo, () => ""];
  const kim = String((kayit && ad(kayit)) || "").trim();
  sahibeBildir(kategori, `${kim ? kim + " " : ""}kaydını ${eylem}`.trim());
}

// id verilmezse yeni kayıt: degistir({}) kaydı üretir ("id" alanını kendisi koymazsa atanır).
export async function kayitKaydet(tablo, id, degistir) {
  try {
    if (!id) {
      const yeni = degistir({});
      yeni.id = yeni.id || yeniKimlik();
      const donen = await api.ekle(tablo, { isletme_id: baglam.isletme, id: yeni.id, data: yeni });
      if (!donen || !donen.length) throw new Error("Kayıt eklenemedi.");
      kayitBildir(tablo, "ekledi", yeni);
      return yeni;
    }
    const s = await api.sorgu(`${tablo}?select=data,surum&${kimlikFiltresi(id)}&silindi=eq.false`);
    if (!s.length) throw new Error("Kayıt bulunamadı; başkası silmiş olabilir.");
    const veri = degistir(JSON.parse(JSON.stringify(s[0].data)));
    veri.id = id;
    const donen = await api.guncelle(tablo, `${kimlikFiltresi(id)}&surum=eq.${s[0].surum}`, { data: veri });
    if (!donen || !donen.length) throw new Error(CAKISMA);
    kayitBildir(tablo, "güncelledi", veri);
    return veri;
  } finally {
    tabloTazele(tablo);
  }
}

// Excel içe aktarma: kayıtları 100'erli gruplar halinde ekler (her kayıt masaüstü biçiminde, id zorunlu).
export async function topluEkle(tablo, kayitlar, ilerle = () => {}) {
  try {
    for (let i = 0; i < kayitlar.length; i += 100) {
      const parca = kayitlar.slice(i, i + 100).map((k) => ({ isletme_id: baglam.isletme, id: k.id, data: k }));
      await api.ekle(tablo, parca);
      ilerle(Math.min(i + 100, kayitlar.length), kayitlar.length);
    }
    if (kayitlar.length) sahibeBildir((BILDIRIM[tablo] || [tablo])[0], `Excel'den ${kayitlar.length} kayıt aktardı`);
  } finally {
    tabloTazele(tablo);
  }
}

export async function kayitSil(tablo, id) {
  try {
    const s = await api.sorgu(`${tablo}?select=surum,data&${kimlikFiltresi(id)}&silindi=eq.false`);
    if (!s.length) return;
    const donen = await api.guncelle(tablo, `${kimlikFiltresi(id)}&surum=eq.${s[0].surum}`, { silindi: true });
    if (!donen || !donen.length) throw new Error(CAKISMA);
    kayitBildir(tablo, "sildi", s[0].data);
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
  try { izlenen.set("okul_ogrenciler", await sonDegisim("okul_ogrenciler")); } catch { /* eski zaman kalır; bir sonraki kontrol listeyi tazeler */ }   // kendi ödememiz tam yenileme tetiklemesin
}

export async function odemeEkle({ ogrenci, ad, tutar, tarih, yontem, not, mobilId }) {
  const sonuc = await api.rpc("okul_odeme_ekle", { p_isletme: baglam.isletme, p_ogrenci: ogrenci, p_tutar: tutar, p_tarih: tarih, p_yontem: yontem, p_not: not || "", p_mobil_id: mobilId });
  sahibeBildir("Okul", `${ad ? ad + " öğrencisinin" : "Öğrenci"} ödemesini aldı (${Math.round(tutar)} ₺)`);
  return sonuc;
}
