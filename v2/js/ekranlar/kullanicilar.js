// Kullanıcılar (sahip ve yönetici): işletmeye kullanıcı ekler, izinlerini ve parolasını değiştirir, siler.
// Yetki sunucuda zorlanır (uye_kaydet / uye_sil); bu ekran yalnızca sahip ve yöneticiye gösterilir.
import * as api from "../api.js";
import * as veri from "../veri.js";
import { h, ikon, kart, satir, bosDurum, panelAc, toast, animOnay, parolaAlani, segment, detayAc } from "../ui.js";
import { soforHaritasi, tumSoforHaritasi } from "../harita.js";
import * as personel from "../personel.js";
import { baslik, duz } from "../metin.js";

const IZINLER = [
  ["dashboard", baslik("menu_dashboard")], ["okul", baslik("menu_okul_servis")], ["sirket_evrak", baslik("menu_sirket_evrak")], ["fatura", baslik("menu_fatura")], ["arac", baslik("menu_arac")],
  ["esnaf", baslik("menu_esnaf")], ["petrol", baslik("menu_petrol")], ["ic_hizmet", baslik("menu_ic_hizmet")], ["ayarlar", baslik("menu_ayarlar")],
];
const ETIKET = Object.fromEntries(IZINLER);
// "sahip" yalnızca sistemdeki ad; ekranda "Üst Yönetici" görünür. Muhasebeci ve Şoför ünvandır (yetki izinlerle belirlenir).
const ROL = { sahip: "Üst Yönetici", yonetici: "Yönetici", kullanici: "Personel", muhasebeci: "Muhasebeci", sofor: "Şoför" };
const MUHASEBECI_IZIN = ["dashboard", "okul", "sirket_evrak", "fatura", "arac", "esnaf", "petrol", "ic_hizmet"];   // Ayarlar dışında hepsi

const ben = () => veri.baglam.uye;
const sahipMi = () => ben().rol === "sahip";
// Sahip her şeyi, yönetici yalnızca 'kullanici' rolündekileri yönetir; sahip satırı kimse tarafından değiştirilemez.
const yonetilebilir = (u) => u.rol !== "sahip" && (sahipMi() || u.rol === "kullanici");

async function yap(dugme, mesaj, is) {
  dugme.disabled = true; mesaj.hidden = true;
  try { await is(); }
  catch (e) { mesaj.textContent = e.message; mesaj.hidden = false; }
  finally { dugme.disabled = false; }
}

function formPaneli(uye, yenile) {
  const yeni = !uye;
  const ad = h("input", { class: "girdi", type: "text", autocapitalize: "words", autocomplete: "off", spellcheck: "false", required: true, maxlength: "30", value: yeni ? "" : uye.ad, "aria-label": "Kullanıcı adı" });
  const parola = h("input", { class: "girdi", type: "password", autocomplete: "new-password", autocapitalize: "none", spellcheck: "false", maxlength: "72", placeholder: yeni ? "" : "Yeni şifre (boşsa değişmez)", "aria-label": "Şifre" });
  // Kullanıcı türü: Kullanıcı (izinleri elle seçilir) · Muhasebeci (hazır izinler) · Şoför (yalnızca Şoför ekranı) · Yönetici (yalnızca üst yönetici atayabilir).
  const tipOf = (u) => (!u ? "kullanici" : u.rol === "yonetici" ? "yonetici" : u.sofor ? "sofor" : u.unvan === "muhasebeci" ? "muhasebeci" : "kullanici");
  const tipIlk = tipOf(uye);
  let tip = tipIlk;
  const secili = new Set(yeni ? [] : uye.izinler || []);
  const izinKap = h("div", { class: "kart" });
  const izinCiz = () => izinKap.replaceChildren(...IZINLER.map(([kod, etiket]) => animOnay({ etiket, isaretli: secili.has(kod), degisti: (a) => { if (a) secili.add(kod); else secili.delete(kod); } })));
  izinCiz();
  const salt = animOnay({ etiket: "Yalnızca görüntüleme", isaretli: !yeni && Boolean(uye.salt_okunur) });
  // Bildirim alıcısı: açıksa bu kişi, yetkisi olduğu modüllerde başkalarının yaptığı işlemlerin bildirimini (telefonda zil + anlık bildirim) alır.
  const bildirimIlk = yeni ? false : (uye.bildirim_al ?? uye.rol !== "kullanici");
  const bildirim = animOnay({ etiket: "Bildirim al", isaretli: bildirimIlk });
  const bildirimAlani = h("div", {}, bildirim, h("p", { class: "ipucu" }, "Açıksa bu kişi, yetkisi olduğu modüllerde başkalarının yaptığı işlemlerin bildirimini alır."));
  // Şoför: mobil uygulamada yalnızca Şoför sekmesini görür (sekme izni gerekmez); konum paylaşımı uygulama açılır açılmaz otomatik başlar. Üst yönetici ve yönetici konumunu haritada izler.
  const harita = tipIlk === "sofor" && h("button", { class: "dugme ikincil genis", type: "button", onclick: () => { panel.kapat(); detayAc(`${uye.ad} · Konum`, () => soforHaritasi(uye.ad)); } }, "Konumunu haritada gör");
  const soforAlani = h("div", {}, h("p", { class: "ipucu" }, "Şoför hesabı yalnızca Şoför ekranını görür. Konum, uygulama açıkken yaklaşık 3 dakikada bir otomatik gönderilir; yalnızca yöneticiler görür. Şoförü işe alırken konum paylaşımı için yazılı onayını almayı unutmayın."), harita);
  // Maaş ve izin: gerçek verilerle yönetici doldurur; çalışan kendi kaydını (Ayarlar > Hesap üzerinden) salt okunur görür.
  const personelDugmesi = !yeni && h("button", { class: "dugme ikincil genis", type: "button", onclick: () => { panel.kapat(); detayAc(`${uye.ad} · Maaş ve İzin`, () => personel.yoneticiPaneli(uye.ad)); } }, "Maaş ve İzin");
  const tipAlani = h("div", { class: "alan" });
  const izinAlani = h("div", {}, izinKap, salt);
  const tipCiz = () => {
    izinAlani.hidden = tip === "yonetici" || tip === "sofor";
    soforAlani.hidden = tip !== "sofor";
    bildirimAlani.hidden = tip === "sofor";
    tipAlani.replaceChildren(h("span", {}, "Kullanıcı türü"), segment([["kullanici", ROL.kullanici], ["muhasebeci", ROL.muhasebeci], ["sofor", ROL.sofor], ...(sahipMi() ? [["yonetici", ROL.yonetici]] : [])], tip, (k) => {
      tip = k;
      if (k === "muhasebeci") { secili.clear(); MUHASEBECI_IZIN.forEach((x) => secili.add(x)); izinCiz(); }
      tipCiz();
    }));
  };
  tipCiz();
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const kaydet = h("button", { class: "dugme birincil genis", type: "submit" }, yeni ? duz("kullanici_ekle") : "Kaydet");
  const sil = !yeni && h("button", { class: "dugme tehlike genis", type: "button", onclick: () => {
    if (sil.dataset.onay !== "1") { sil.dataset.onay = "1"; sil.textContent = "Silmek için tekrar dokunun"; return; }
    yap(sil, mesaj, async () => {
      await api.rpc("uye_sil", { p_isletme: veri.baglam.isletme, p_ad: uye.ad });
      panel.kapat();
      toast("Kullanıcı silindi");
      yenile();
    });
  } }, "Kullanıcıyı sil");
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    yap(kaydet, mesaj, async () => {
      const yetkisiz = tip === "yonetici" || tip === "sofor";   // yönetici her şeyi görür; şoförün tek ekranı Şoför'dür
      const kisi = ad.value.trim();
      await api.rpc("uye_kaydet", {
        p_isletme: veri.baglam.isletme, p_ad: kisi, p_parola: parola.value, p_rol: tip === "yonetici" ? "yonetici" : "kullanici",
        p_izinler: yetkisiz ? [] : IZINLER.map(([k]) => k).filter((k) => secili.has(k)),
        p_salt_okunur: yetkisiz ? false : salt.deger(), p_eski_ad: yeni ? null : uye.ad,
      });
      if ((tip === "sofor") !== (tipIlk === "sofor")) await api.rpc("sofor_yaz", { p_isletme: veri.baglam.isletme, p_ad: kisi, p_sofor: tip === "sofor" });
      if ((tip === "muhasebeci") !== (tipIlk === "muhasebeci")) await api.rpc("unvan_yaz", { p_isletme: veri.baglam.isletme, p_ad: kisi, p_unvan: tip === "muhasebeci" ? "muhasebeci" : null });
      if (bildirim.deger() !== bildirimIlk) await api.rpc("bildirim_tercih_yaz", { p_isletme: veri.baglam.isletme, p_ad: kisi, p_al: bildirim.deger() });
      panel.kapat();
      toast(yeni ? "Kullanıcı eklendi" : "Kullanıcı güncellendi");
      yenile();
    });
  } },
    h("label", { class: "alan" }, h("span", {}, "Kullanıcı adı"), ad),
    h("label", { class: "alan" }, h("span", {}, "Şifre"), parolaAlani(parola)),
    tipAlani, soforAlani, izinAlani, bildirimAlani, personelDugmesi, mesaj, kaydet, sil);
  const panel = panelAc(yeni ? duz("kullanici_yeni_ekle") : uye.ad, form);
}

// Son nabzı 2 dakikadan yeni olan (ve oturumu bu cihazda açık olan) kullanıcı çevrimiçi sayılır; masaüstü de nabız gönderir.
const CEVRIMICI_SN = 120;
const yakin = (t) => Boolean(t && (Date.now() - Date.parse(t)) / 1000 < CEVRIMICI_SN);
const cevrimiciMi = (u) => u.ad === ben().ad || yakin(u.son_gorulme);
// Hangi platformda çevrimiçi: masaüstü ve mobil ayrı ayrı; kendi satırım bu cihazda (mobil) açık sayılır.
const masaustuAcik = (u) => yakin(u.son_masaustu);
const mobilAcik = (u) => u.ad === ben().ad || yakin(u.son_mobil);
function platformSatiri(u) {
  const cip = (ad, acik, hic) => (acik || hic) && h("span", { class: "plat-cip" + (acik ? " acik" : "") }, ad);
  const etiketler = [
    cip("Masaüstü", masaustuAcik(u), Boolean(u.son_masaustu)),
    cip("Mobil", mobilAcik(u), Boolean(u.son_mobil)),
    u.masaustu_id && h("span", { class: "plat-id" }, `PC ID: ${u.masaustu_id}`),
  ].filter(Boolean);
  return etiketler.length ? h("span", { class: "plat-satir" }, etiketler) : null;
}
function sonGorulme(u) {
  if (cevrimiciMi(u)) return "Çevrimiçi";
  if (!u.son_gorulme) return "";
  const dk = Math.max(1, Math.round((Date.now() - Date.parse(u.son_gorulme)) / 60000));
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.round(dk / 60);
  return sa < 24 ? `${sa} sa önce` : `${Math.round(sa / 24)} gün önce`;
}

// Yan menüdeki "Çevrimiçi" bölümü (masaüstündeki yan menü gibi): kimler çevrimiçi, hangi platformdan (Masaüstü / Mobil); çevrimdışı olanlar 12 saat daha gri kalır.
// Liste menü açıkken 15 saniyede bir tazelenir. Başkalarının üyeliğini yalnızca sahip ve yönetici okuyabilir; çevrimiçi bilgisi (nabiz.sql) yoksa bölüm gösterilmez.
const CEVRIMDISI_GOSTER_SN = 43200;
const gecenYaz = (sn) => (sn < 60 ? `${Math.max(1, Math.round(sn))}s` : sn < 3600 ? `${Math.round(sn / 60)}${baslik("dk")}` : `${Math.round(sn / 3600)} sa`);

// Son okunan liste bellekte tutulur: menü açılınca bölüm anında dolu çizilir (kabuk açılırken ve her 10 saniyede arka planda tazelenir), bekleme sırasında yer ayrılır.
let sonCevrimici = null;
let cevrimiciSurucu = null;
export async function cevrimiciYukle() {
  if (!veri.baglam.isletme) return;
  if (cevrimiciSurucu) return cevrimiciSurucu;
  cevrimiciSurucu = api.sorgu(`uyelikler?select=ad,rol,son_gorulme,son_masaustu,son_mobil&isletme_id=eq.${veri.baglam.isletme}&aktif=eq.true&son_gorulme=not.is.null`)
    .then((l) => { sonCevrimici = l; return l; }, () => sonCevrimici)   // çevrimiçi bilgisi yoksa ya da bağlantı kopuksa eski liste kalır
    .finally(() => { cevrimiciSurucu = null; });
  return cevrimiciSurucu;
}
export const cevrimiciSifirla = () => { sonCevrimici = null; };

export function cevrimiciBolumu() {
  const kap = h("div", { class: "cevrimici" + (sonCevrimici ? "" : " bekliyor") });
  const satirCiz = (u, simdi) => {
    const sn = (simdi - Date.parse(u.son_gorulme)) / 1000;
    const acik = sn < CEVRIMICI_SN;
    const cip = (ad, z) => {
      if (!z || (simdi - Date.parse(z)) / 1000 > CEVRIMDISI_GOSTER_SN) return null;
      return h("span", { class: "plat-cip" + ((simdi - Date.parse(z)) / 1000 < CEVRIMICI_SN ? " acik" : "") }, ad);
    };
    return h("div", { class: "cevrimici-satir" + (acik ? " acik" : "") },
      h("span", { class: "cevrimici-nokta", "aria-hidden": "true" }),
      h("span", { class: "cevrimici-ad" }, u.ad),
      h("span", { class: "cevrimici-sure" }, acik ? `${gecenYaz(sn)} ${baslik("once")}` : `${baslik("cevrimdisi")} · ${gecenYaz(sn)}`),
      h("span", { class: "plat-satir" }, [cip(baslik("platform_masaustu"), u.son_masaustu), cip(baslik("platform_mobil"), u.son_mobil)].filter(Boolean)));
  };
  let sonImza = "";
  function ciz() {
    if (!sonCevrimici) return;
    const simdi = Date.now();
    const digerleri = sonCevrimici.filter((u) => u.ad !== ben().ad && (simdi - Date.parse(u.son_gorulme)) / 1000 <= CEVRIMDISI_GOSTER_SN)
      .sort((a, b) => Number(yakin(b.son_gorulme)) - Number(yakin(a.son_gorulme)) || Date.parse(b.son_gorulme) - Date.parse(a.son_gorulme));
    const acikSayi = digerleri.filter((u) => yakin(u.son_gorulme)).length;
    const imza = JSON.stringify([acikSayi, digerleri.map((u) => [u.ad, Math.floor((simdi - Date.parse(u.son_gorulme)) / 10000), u.son_masaustu && 1, u.son_mobil && 1])]);
    if (imza === sonImza) return;   // değişmediyse yeniden çizilmez (titreme olmaz)
    sonImza = imza;
    kap.replaceChildren(h("p", { class: "cevrimici-baslik" }, h("span", { class: "cevrimici-nokta acik", "aria-hidden": "true" }), `${baslik("cevrimici")} (${acikSayi})`),
      digerleri.length > 0 && h("div", { class: "cevrimici-liste" }, digerleri.map((u) => satirCiz(u, simdi))));
    kap.classList.remove("bekliyor");
  }
  ciz();
  const tazele = () => cevrimiciYukle().then(() => { if (kap.isConnected) ciz(); });
  tazele();
  const zamanlayici = setInterval(() => { if (!kap.isConnected) return clearInterval(zamanlayici); if (!document.hidden) tazele(); }, 10000);
  return kap;
}
export async function ciz() {
  const sorgu = (alanlar) => api.sorgu(`uyelikler?select=${alanlar}&isletme_id=eq.${veri.baglam.isletme}&aktif=eq.true&order=olusturma`);
  let liste;
  try { liste = await sorgu("ad,rol,izinler,salt_okunur,son_gorulme,son_masaustu,son_mobil,masaustu_id,bildirim_al,sofor,unvan"); }
  catch (e0) {
    if (e0.durum !== 400) throw e0;   // sofor_konum.sql henüz uygulanmamış
    liste = null;
  }
  if (!liste) try { liste = await sorgu("ad,rol,izinler,salt_okunur,son_gorulme,son_masaustu,son_mobil,masaustu_id,bildirim_al"); }
  catch (e) {
    if (e.durum !== 400) throw e;   // bildirim2.sql henüz uygulanmamış: bildirim seçimi olmadan devam edilir
    try { liste = await sorgu("ad,rol,izinler,salt_okunur,son_gorulme,son_masaustu,son_mobil,masaustu_id"); }
    catch (e2) {
      if (e2.durum !== 400) throw e2;   // nabiz.sql henüz uygulanmamış: çevrimiçi bilgisi olmadan devam edilir
      liste = await sorgu("ad,rol,izinler,salt_okunur");
    }
  }
  const nabizVar = liste.some((u) => "son_gorulme" in u);
  const kap = h("div", { class: "sayfa" });
  const yenile = async () => {
    const t = await ciz();
    kap.replaceWith(t);
  };
  // Çevrimiçi durumu zamanla değişir: ekran açıkken liste 15 saniyede bir kendiliğinden tazelenir (arka plandaysa beklenir; ekran kapanınca durur).
  const tazeleyici = setInterval(async () => {
    if (!kap.isConnected) return clearInterval(tazeleyici);
    if (document.hidden) return;
    try {
      const t = await ciz();
      if (kap.isConnected) kap.replaceWith(t);
    } catch { /* bir sonraki turda yeniden denenir */ }
  }, 15000);
  const ozet = (u) => {
    if (u.sofor) return ROL.sofor;
    if (u.unvan === "muhasebeci") return ROL.muhasebeci + (u.salt_okunur ? " · yalnızca görüntüleme" : "") + (u.bildirim_al ? " · bildirim açık" : "");
    if (u.rol !== "kullanici") return ROL[u.rol] || u.rol;
    const izin = (u.izinler || []).map((m) => ETIKET[m] || m).join(", ") || "İzin yok";
    return (u.salt_okunur ? `${izin} · yalnızca görüntüleme` : izin) + (u.bildirim_al ? " · bildirim açık" : "");
  };
  kap.append(...[
    kart(h("button", { class: "dugme ekle genis", onclick: () => formPaneli(null, yenile) }, ikon("arti", 18), duz("kullanici_ekle"))),
    liste.some((u) => u.sofor) && kart(h("button", { class: "dugme ikincil genis", onclick: () => detayAc("Şoför konumları", () => tumSoforHaritasi()) }, "Şoförleri haritada gör")),
    nabizVar && kart(h("p", { class: "kart-etiket" }, "Çevrimiçi"), h("p", { class: "buyuk-sayi yesil" }, `${liste.filter(cevrimiciMi).length} / ${liste.length}`),
      h("p", { class: "soluk" }, `Masaüstü ${liste.filter(masaustuAcik).length} · Mobil ${liste.filter(mobilAcik).length}`)),
    liste.length
      ? kart(liste.map((u) => satir({ baslik: u.ad, alt: h("span", { class: "satir-alt-kap" }, ozet(u), nabizVar && platformSatiri(u)), sag: nabizVar ? sonGorulme(u) : u.rol === "kullanici" ? "" : ROL[u.rol], ton: nabizVar && cevrimiciMi(u) ? "yesil" : "",
        onclick: yonetilebilir(u) ? () => formPaneli(u, yenile) : undefined })))
      : bosDurum("Kullanıcı yok"),
  ].filter(Boolean));
  return kap;
}
