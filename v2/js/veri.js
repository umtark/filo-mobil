// Oturumun bağlamı (işletme, yetkiler, lisans) ve bellek içi veri önbelleği.
import * as api from "./api.js";
import { markaUygula } from "./marka.js";
import { MENU } from "./menu.js";
import { okulListesi, servisKullanmayanListesi, servisListesi, faturaKaydi, esnafKaydi, aracKaydi, akaryakitListesi, icHizmetListesi } from "./hesap.js";
import * as dn from "./donem.js";
import * as kalici from "./kalici_depo.js";

export const baglam = { isletme: null, uye: null, lisans: null, isletmeAdi: "", platform: false, bakim: null };

const SURE = 5 * 60 * 1000;
const onbellek = new Map();   // anahtar -> { t, sonuc: Promise }
const izlenen = new Map();    // yüklü tablo -> son bilinen değişiklik zamanı (canlı güncelleme için)

const hamDepo = new Map();    // tablo -> { liste, imlec, t, tam, bayat, surucu }: tablo bir kez tamamen indirilir, sonra yalnızca değişen satırlar çekilir
const TAM_YENILEME = 24 * 60 * 60 * 1000;   // tam indirme yalnızca güvenlik ağı: günde bir (silinen satırlar zaten "silindi" işaretiyle artımlı gelir)

// Cihazdaki kalıcı kopya yalnızca "beni hatırla" açıkken tutulur; maaş/izin (personel_*) gibi kişisel kayıtlar cihaza kaydedilmez.
const kopyaAnahtari = (tablo) => {
  const k = api.kullanici();
  return api.kalicimi() && k && baglam.isletme && !tablo.startsWith("personel_") ? `${k.id}|${baglam.isletme}|${tablo}` : null;
};
// Kullanıcının cihazdaki tüm tablo kopyalarını siler (çıkış, hesabın kaldırılması, yetki değişimi).
export const kopyalariSil = () => { const k = api.kullanici(); return k ? kalici.sil(`${k.id}|`) : Promise.resolve(); };

// Tablo verisi bayatladı: bir sonraki okuma tamamını değil yalnızca değişenleri indirir.
const bayatla = (...tablolar) => { for (const t of tablolar) { const d = hamDepo.get(t); if (d) d.bayat = true; izlenen.delete(t); } };

export function onbellekTemizle() { onbellek.clear(); izlenen.clear(); hamDepo.clear(); }
export const onbellekEskit = () => { for (const t of hamDepo.keys()) bayatla(t); onbellek.clear(); };   // veriler korunur, bir sonraki açılışta artımlı tazelenir

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
  for (const t of degisen) bayatla(t);
  if (degisen.includes("okul_ogrenciler")) onbellek.delete("ayarlar");   // dönem geçişi öğrencileri ve seçili dönem ayarını birlikte değiştirir
  return degisen;
}

export async function baglamKur() {
  baglam.platform = false;
  // Yöneticiler işletmenin tüm üyeliklerini görebilir; yalnızca oturumdaki kullanıcının kendi üyeliği alınır.
  const kimlik = api.kullanici();
  if (!kimlik) { baglam.isletme = null; return false; }
  const uyelikSorgusu = (uyeAlanlari, isletmeAlanlari) => api.sorgu(`uyelikler?select=${uyeAlanlari},isletmeler(${isletmeAlanlari})&kullanici_id=eq.${encodeURIComponent(kimlik.id)}&aktif=eq.true&order=olusturma`);
  // Yeni sütunlar (marka.sql, sofor_konum.sql, personel.sql) henüz uygulanmamışsa sorgu 400 verir: eski alanlarla devam edilir.
  const denemeler = [["isletme_id,ad,rol,izinler,salt_okunur,sofor,izin_hakki,unvan", "ad,marka_ad,logo,lisans_bitis,omur_boyu"], ["isletme_id,ad,rol,izinler,salt_okunur,sofor,izin_hakki", "ad,marka_ad,logo,lisans_bitis,omur_boyu"], ["isletme_id,ad,rol,izinler,salt_okunur,sofor", "ad,marka_ad,logo,lisans_bitis,omur_boyu"], ["isletme_id,ad,rol,izinler,salt_okunur", "ad,marka_ad,logo,lisans_bitis,omur_boyu"], ["isletme_id,ad,rol,izinler,salt_okunur", "ad,lisans_bitis,omur_boyu"]];
  let uyelikler;
  for (const [i, [uye, isletme]] of denemeler.entries()) {
    try { uyelikler = await uyelikSorgusu(uye, isletme); break; }
    catch (e) { if (e.durum !== 400 || i === denemeler.length - 1) throw e; }
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

// Çalışan oturumda yetki/üyelik değişikliğini sunucudan okur: "kaldirildi" | "degisti" | "ad" (yalnızca kullanıcı adı) | "ayni".
export async function yetkiKontrol() {
  const kimlik = api.kullanici();
  if (!kimlik || !baglam.isletme || !baglam.uye) return "ayni";
  const yol = (alanlar) => `uyelikler?select=${alanlar}&isletme_id=eq.${baglam.isletme}&kullanici_id=eq.${encodeURIComponent(kimlik.id)}&aktif=eq.true`;
  let s;
  try { s = await api.sorgu(yol("ad,rol,izinler,salt_okunur,sofor")); }
  catch (e) { if (e.durum !== 400) throw e; s = await api.sorgu(yol("ad,rol,izinler,salt_okunur")); }
  if (!s.length) return "kaldirildi";
  const yeni = s[0], eski = baglam.uye;
  const imza = (u) => JSON.stringify([u.rol, [...(u.izinler || [])].sort(), Boolean(u.salt_okunur), Boolean(u.sofor)]);
  if (imza(yeni) === imza(eski)) {
    if (yeni.ad === eski.ad) return "ayni";
    baglam.uye = { ...eski, ...yeni };   // yalnızca görünen ad değişti (yönetici kullanıcıyı yeniden adlandırdı); yetkiler aynı
    return "ad";
  }
  baglam.uye = { ...eski, ...yeni };
  kopyalariSil();   // yetki değişti: cihazdaki kopya silinir, tablolar yeni yetkiyle baştan indirilir
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

// Uygulama arka plana atılınca ya da kapanınca bu cihaz hemen çevrimdışı görünür (beklemeden 2 dakikalık zaman aşımı dolmasın);
// öne dönünce nabız hemen yeniden atılır. donem_nabiz.sql uygulanmamışsa çağrı sessizce başarısız olur.
export function cevrimdisiBildir() {
  if (!baglam.isletme) return;
  sonNabiz = 0;
  api.rpcArka("uye_cikis", { p_isletme: baglam.isletme, p_platform: "mobil" });
}

// Masaüstündeki "Hesabınızın erişimi kısıtlandı": sahip/yönetici dışındaki kullanıcıya hiçbir sekme izni tanımlanmamışsa.
export function erisimYok() {
  const u = baglam.uye;
  if (!u || baglam.platform || u.sofor || ["sahip", "yonetici"].includes(u.rol)) return false;   // şoförün tek ekranı konum paylaşımıdır
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

// Tablo verisi: ilk okumada tamamı indirilir; sonra (başkası değiştirince, kendi yazımımızdan sonra, 5 dakikada bir) yalnızca değişen satırlar çekilip birleştirilir.
// Liste her birleştirmede yeni bir dizi olur (eski dizi referansı tutan kod bozulmaz).
async function hamYukle(tablo) {
  let d = hamDepo.get(tablo);
  if (!d) { d = { liste: [], imlec: null, t: 0, bayat: true, surucu: null }; hamDepo.set(tablo, d); }
  if (d.t && !d.bayat && Date.now() - d.t < SURE) return d.liste;
  if (d.surucu) return d.surucu;
  d.surucu = (async () => {
    const kopya = kopyaAnahtari(tablo);
    if (kopya && !d.imlec) {   // uygulama yeni açıldı: cihazdaki kopyadan başlanır, yalnızca değişenler indirilir
      const k = await kalici.oku(kopya);
      if (k && k.imlec) { d.liste = k.liste; d.imlec = k.imlec; d.tam = k.tam; }
    }
    const temel = await sonDegisim(tablo).catch(() => null);   // veriden ÖNCE alınır: okuma sırasındaki bir değişiklik bir sonraki kontrolde yakalanır
    let degisti = false;
    if (!d.imlec || Date.now() - d.tam > TAM_YENILEME) {   // ilk okuma ve günde bir tam indirme (artımlı yenilemenin güvenlik ağı)
      d.liste = await api.hepsi(tablo, baglam.isletme);
      d.tam = Date.now();
      degisti = true;
    } else {
      const satirlar = await api.degisenSatirlar(tablo, baglam.isletme, d.imlec);
      if (satirlar.length) {
        const harita = new Map(d.liste.map((x) => [x.id, x]));
        for (const s of satirlar) {   // imleç sınırındaki satır her seferinde yeniden gelir: yalnızca gerçekten değişenler kopyayı yeniden yazdırır
          if (s.silindi) { if (harita.delete(s.id)) degisti = true; continue; }
          const yeni = { ...s.data, id: s.id }, eski = harita.get(s.id);
          if (!eski || JSON.stringify(eski) !== JSON.stringify(yeni)) degisti = true;
          harita.set(s.id, yeni);
        }
        d.liste = [...harita.values()];
      }
    }
    d.imlec = temel || d.imlec;
    d.bayat = false;
    d.t = Date.now();
    if (temel !== null) izlenen.set(tablo, temel);
    if (kopya && degisti) kalici.yaz(kopya, { liste: d.liste, imlec: d.imlec, tam: d.tam });
    return d.liste;
  })();
  try { return await d.surucu; }
  catch (e) { if (!d.t) hamDepo.delete(tablo); throw e; }
  finally { d.surucu = null; }
}
const ham = (tablo) => hamYukle(tablo);

export const ayarlar = () => onbellekli("ayarlar", async () => {
  const s = await api.sorgu(`isletme_ayarlari?select=anahtar,deger&isletme_id=eq.${baglam.isletme}`);
  return Object.fromEntries(s.map((r) => [r.anahtar, r.deger]));
});
export const ayarTazele = () => onbellek.delete("ayarlar");

// Okul dönemi cihaz başınadır: her kullanıcı kendi telefonunda istediği dönemi seçer (başkasının ekranı değişmez). Seçim yoksa işletmenin
// asıl dönemi (okul_aktif_donem; masaüstünün genel dönem geçişi bunu değiştirir) gösterilir.
const donemAnahtari = () => "filo2.okulDonem." + baglam.isletme;
export async function okulDonemi() {
  const layout = dn.aktifDonem(await ayarlar().catch(() => ({})));
  let kayitli = "";
  try { kayitli = localStorage.getItem(donemAnahtari()) || ""; } catch { /* depolama kapalı: asıl dönem */ }
  return { secili: dn.donemGecerliMi(kayitli) ? kayitli : layout, layout };
}
export function okulDonemiSec(anahtar) {
  try { if (anahtar) localStorage.setItem(donemAnahtari(), anahtar); else localStorage.removeItem(donemAnahtari()); } catch { /* depolama kapalı: seçim hatırlanmaz */ }
}
// Öğrenciler seçili dönemin gözüyle (servis kayıtları olduğu gibi); asıl dönem seçiliyse liste aynen döner.
const okulGorunumu = async () => {
  const [liste, { secili, layout }] = await Promise.all([ham("okul_ogrenciler"), okulDonemi()]);
  return dn.gorunumListesi(liste, secili, layout);
};

export const okul = () => okulGorunumu().then(okulListesi);
export const okulServisKullanmayan = () => okulGorunumu().then(servisKullanmayanListesi);
export const okulServisler = () => okulGorunumu().then(servisListesi);
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
export const hamKayit = async (tablo, id) => (await hamListe(tablo)).find((x) => x.id === id) || null;
export const hamListe = (tablo) => (tablo === "okul_ogrenciler" ? okulGorunumu() : ham(tablo));
export const araclar = async () => {
  const [satirlar, ayar] = await Promise.all([ham("araclar"), ayarlar().catch(() => ({}))]);
  return satirlar.map((a) => aracKaydi(a, ayar.bakim_periyodu_gun));
};
// Personel (maaş/izin): kişi bazlı RLS sayesinde yönetici yönettiği herkesi, çalışan yalnızca kendi kaydını görür; burada isme göre süzülür.
export const personelMaaslari = (ad) => ham("personel_maas").then((l) => l.filter((x) => x.ad === ad).sort((a, b) => String(b.donem || "").localeCompare(String(a.donem || ""))));
export const personelIzinleri = (ad) => ham("personel_izin").then((l) => l.filter((x) => x.ad === ad).sort((a, b) => String(b.baslangic || "").localeCompare(String(a.baslangic || ""))));
export const izinHakkiOku = (ad) => api.rpc("izin_hakki_oku", { p_isletme: baglam.isletme, p_ad: ad });
export const izinHakkiYaz = (ad, gun) => api.rpc("izin_hakki_yaz", { p_isletme: baglam.isletme, p_ad: ad, p_gun: gun });

// ── Yazma ───────────────────────────────────────────────────────────────────
// Kayıtlar masaüstüyle aynı biçimde (data = masaüstü kaydı) yazılır. Düzenleme sunucudaki güncel kaydı okuyup değiştirir ve
// "surum" denetimiyle geri yazar; başkası arada değiştirmişse sessizce ezmek yerine uyarı verilir. Silme "silindi" işaretidir.
export const yeniKimlik = (onek = "") => onek + ((crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);
export const tabloTazele = (...tablolar) => bayatla(...tablolar);
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

// hedef: "tablo/kayıt kimliği" (isteğe bağlı); bildirime dokunan, ilgili kaydı doğrudan açar.
export function sahibeBildir(kategori, mesaj, hedef = "") {
  if (!baglam.isletme || !baglam.uye) return;
  api.fonksiyon("bildirim", { isletme: baglam.isletme, kategori, mesaj, kaynak: "mobil", hedef }).catch(() => {});
}

function kayitBildir(tablo, eylem, kayit, hedefKimlik = "") {
  const [kategori, ad] = BILDIRIM[tablo] || [tablo, () => ""];
  const kim = String((kayit && ad(kayit)) || "").trim();
  sahibeBildir(kategori, `${kim ? kim + " " : ""}kaydını ${eylem}`.trim(), hedefKimlik && BILDIRIM[tablo] ? `${tablo}/${hedefKimlik}` : "");
}

// id verilmezse yeni kayıt: degistir({}) kaydı üretir ("id" alanını kendisi koymazsa atanır).
// Öğrenci kayıtlarında degistir, cihazın seçtiği dönemin görünümünü alır ve verir; yazılırken dönem verisi asıl yerine konur (donem.js).
// bildirimsiz: çağıran kendi bildirimini gönderiyorsa genel "kaydını güncelledi" bildirimi atlanır.
export async function kayitKaydet(tablo, id, degistir, { bildirimsiz = false } = {}) {
  const donemli = tablo === "okul_ogrenciler" && !String(id || "").startsWith("srv_");
  try {
    const { secili, layout } = donemli ? await okulDonemi() : {};
    if (!id) {
      let yeni = degistir({});
      yeni.id = yeni.id || yeniKimlik();
      if (donemli && !String(yeni.id).startsWith("srv_")) yeni = dn.gorunumdenDon(yeni, null, secili, layout);
      const donen = await api.ekle(tablo, { isletme_id: baglam.isletme, id: yeni.id, data: yeni });
      if (!donen || !donen.length) throw new Error("Kayıt eklenemedi.");
      if (!bildirimsiz) kayitBildir(tablo, "ekledi", yeni, yeni.id);
      return yeni;
    }
    const s = await api.sorgu(`${tablo}?select=data,surum&${kimlikFiltresi(id)}&silindi=eq.false`);
    if (!s.length) throw new Error("Kayıt bulunamadı; başkası silmiş olabilir.");
    const orijinal = s[0].data;
    let veri = donemli ? degistir(dn.ogrenciDonemeGetir(orijinal, secili, layout)) : degistir(JSON.parse(JSON.stringify(orijinal)));
    if (donemli) veri = dn.gorunumdenDon(veri, orijinal, secili, layout);
    veri.id = id;
    const donen = await api.guncelle(tablo, `${kimlikFiltresi(id)}&surum=eq.${s[0].surum}`, { data: veri });
    if (!donen || !donen.length) throw new Error(CAKISMA);
    if (!bildirimsiz) kayitBildir(tablo, "güncelledi", veri, id);
    return veri;
  } finally {
    tabloTazele(tablo);
  }
}

// Excel içe aktarma: kayıtları 100'erli gruplar halinde ekler (her kayıt masaüstü biçiminde, id zorunlu).
export async function topluEkle(tablo, kayitlar, ilerle = () => {}) {
  try {
    if (tablo === "okul_ogrenciler") {   // seçili dönem asıl dönemden farklıysa içe aktarılan öğrencilerin verisi seçili döneme yazılır
      const { secili, layout } = await okulDonemi();
      kayitlar = kayitlar.map((k) => (String(k.id).startsWith("srv_") ? k : dn.gorunumdenDon(k, null, secili, layout)));
    }
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

// Dönem geçişi: öğrencilerin sunucudaki güncel hali (sürüm numaralarıyla, servis kayıtları hariç); önbellekten okunmaz.
export async function okulSatirlariTaze() {
  const sonuc = [];
  for (let ofset = 0; ; ofset += 1000) {
    const sayfa = await api.sorgu(`okul_ogrenciler?select=id,surum,data&isletme_id=eq.${baglam.isletme}&silindi=eq.false&order=id&limit=1000&offset=${ofset}`);
    for (const s of sayfa) if (!String(s.id).startsWith("srv_")) sonuc.push({ id: s.id, surum: s.surum, data: { ...s.data, id: s.id } });
    if (sayfa.length < 1000) return sonuc;
  }
}

// Dönem açma: öğrencilere yeni dönemin kaydı TEK işlemde yazılır (okul_donem_uygula); araya başka değişiklik girmişse hiçbiri yazılmaz.
// ayarla=false: işletmenin asıl dönem ayarı (masaüstünün genel dönemi) değişmez; hangi dönemin gösterileceği cihaz başına seçilir.
export async function donemUygula({ eski, hedef, kayitlar, sayi, yedek, ayarla = false }) {
  try {
    return await api.rpc("okul_donem_uygula", { p_isletme: baglam.isletme, p_eski: eski, p_hedef: hedef, p_kayitlar: kayitlar, p_sayi: sayi, p_yedek: yedek, p_ayarla: ayarla });
  } finally {
    tabloTazele("okul_ogrenciler");
    ayarTazele();
  }
}

// Seçili dönem asıl dönemse ödeme sunucu fonksiyonuyla (tek adımda, çakışmasız) eklenir; başka dönemse o dönemin kaydına sürüm denetimiyle yazılır,
// başkası arada aynı öğrenciyi değiştirirse birkaç kez yeniden denenir (aynı mobil_id ikinci kez eklenmez).
export async function odemeEkle({ ogrenci, ad, tutar, tarih, yontem, not, mobilId, pesin = false }) {
  const { secili, layout } = await okulDonemi();
  const asil = ((await ham("okul_ogrenciler")).find((o) => o.id === ogrenci) || {}).aktif_donem || layout;
  const donemEki = secili === layout ? "" : ` · ${dn.donemAdi(secili)}`;
  let sonuc;
  if (secili === asil && !pesin) {
    sonuc = await api.rpc("okul_odeme_ekle", { p_isletme: baglam.isletme, p_ogrenci: ogrenci, p_tutar: tutar, p_tarih: tarih, p_yontem: yontem, p_not: not || "", p_mobil_id: mobilId });
  } else {
    for (let deneme = 0; ; deneme++) {
      try {
        await kayitKaydet("okul_ogrenciler", ogrenci, (o) => { dn.odemeEkleGorunume(o, { id: yeniKimlik(), tarih, tutar, yontem, not, mobilId, kisi: baglam.uye.ad, pesin }); return o; }, { bildirimsiz: true });
        break;
      } catch (e) {
        if (e.message !== CAKISMA || deneme >= 2) throw e;
      }
    }
    sonuc = { ok: true };
  }
  sahibeBildir("Okul", `${ad ? ad + " öğrencisinin" : "Öğrenci"} ödemesini aldı (${Math.round(tutar)} ₺)${pesin ? " · iki dönem birden" : ""}${donemEki}`, `okul_ogrenciler/${ogrenci}`);
  return sonuc;
}
