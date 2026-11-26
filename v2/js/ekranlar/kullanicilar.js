// Kullanıcılar (sahip ve yönetici): işletmeye kullanıcı ekler, izinlerini ve parolasını değiştirir, siler.
// Yetki sunucuda zorlanır (uye_kaydet / uye_sil); bu ekran yalnızca sahip ve yöneticiye gösterilir.
import * as api from "../api.js";
import * as veri from "../veri.js";
import { h, kart, satir, bosDurum, panelAc, toast, animOnay, parolaAlani, segment } from "../ui.js";
import { baslik, duz } from "../metin.js";

const IZINLER = [
  ["dashboard", baslik("menu_dashboard")], ["okul", baslik("menu_okul_servis")], ["sirket_evrak", baslik("menu_sirket_evrak")], ["fatura", baslik("menu_fatura")], ["arac", baslik("menu_arac")],
  ["esnaf", baslik("menu_esnaf")], ["petrol", baslik("menu_petrol")], ["ic_hizmet", baslik("menu_ic_hizmet")], ["ayarlar", baslik("menu_ayarlar")],
];
const ETIKET = Object.fromEntries(IZINLER);
const ROL = { sahip: "Sahip", yonetici: "Yönetici", kullanici: "Kullanıcı" };

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
  let rol = yeni ? "kullanici" : uye.rol;
  const secili = new Set(yeni ? [] : uye.izinler || []);
  const izinKutulari = IZINLER.map(([kod, etiket]) => animOnay({ etiket, isaretli: secili.has(kod), degisti: (a) => { if (a) secili.add(kod); else secili.delete(kod); } }));
  const izinKap = h("div", { class: "kart" }, izinKutulari);
  const salt = animOnay({ etiket: "Yalnızca görüntüleme", isaretli: !yeni && Boolean(uye.salt_okunur) });
  // Bildirim alıcısı: açıksa bu kişi, yetkisi olduğu modüllerde başkalarının yaptığı işlemlerin bildirimini (telefonda zil + anlık bildirim) alır.
  const bildirimIlk = yeni ? false : (uye.bildirim_al ?? uye.rol !== "kullanici");
  const bildirim = animOnay({ etiket: "Bildirim al", isaretli: bildirimIlk });
  const bildirimAlani = h("div", {}, bildirim, h("p", { class: "ipucu" }, "Açıksa bu kişi, yetkisi olduğu modüllerde başkalarının yaptığı işlemlerin bildirimini alır."));
  const rolAlani = h("div", {});
  const izinAlani = h("div", {}, izinKap, salt);
  const rolCiz = () => {
    izinAlani.hidden = rol === "yonetici";
    if (!sahipMi()) return;
    rolAlani.replaceChildren(segment([["kullanici", "Kullanıcı"], ["yonetici", "Yönetici"]], rol, (k) => { rol = k; rolCiz(); }));
  };
  rolCiz();
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
      await api.rpc("uye_kaydet", {
        p_isletme: veri.baglam.isletme, p_ad: ad.value.trim(), p_parola: parola.value, p_rol: rol,
        p_izinler: rol === "yonetici" ? [] : IZINLER.map(([k]) => k).filter((k) => secili.has(k)),
        p_salt_okunur: rol === "yonetici" ? false : salt.deger(), p_eski_ad: yeni ? null : uye.ad,
      });
      if (bildirim.deger() !== bildirimIlk) await api.rpc("bildirim_tercih_yaz", { p_isletme: veri.baglam.isletme, p_ad: ad.value.trim(), p_al: bildirim.deger() });
      panel.kapat();
      toast(yeni ? "Kullanıcı eklendi" : "Kullanıcı güncellendi");
      yenile();
    });
  } },
    h("label", { class: "alan" }, h("span", {}, "Kullanıcı adı"), ad),
    h("label", { class: "alan" }, h("span", {}, "Şifre"), parolaAlani(parola)),
    rolAlani, izinAlani, bildirimAlani, mesaj, kaydet, sil);
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

export async function ciz() {
  const sorgu = (alanlar) => api.sorgu(`uyelikler?select=${alanlar}&isletme_id=eq.${veri.baglam.isletme}&aktif=eq.true&order=olusturma`);
  let liste;
  try { liste = await sorgu("ad,rol,izinler,salt_okunur,son_gorulme,son_masaustu,son_mobil,masaustu_id,bildirim_al"); }
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
    if (u.rol !== "kullanici") return ROL[u.rol] || u.rol;
    const izin = (u.izinler || []).map((m) => ETIKET[m] || m).join(", ") || "İzin yok";
    return (u.salt_okunur ? `${izin} · yalnızca görüntüleme` : izin) + (u.bildirim_al ? " · bildirim açık" : "");
  };
  kap.append(...[
    kart(h("button", { class: "dugme birincil genis", onclick: () => formPaneli(null, yenile) }, duz("kullanici_ekle"))),
    nabizVar && kart(h("p", { class: "kart-etiket" }, "Çevrimiçi"), h("p", { class: "buyuk-sayi yesil" }, `${liste.filter(cevrimiciMi).length} / ${liste.length}`),
      h("p", { class: "soluk" }, `Masaüstü ${liste.filter(masaustuAcik).length} · Mobil ${liste.filter(mobilAcik).length}`)),
    liste.length
      ? kart(liste.map((u) => satir({ baslik: u.ad, alt: h("span", { class: "satir-alt-kap" }, ozet(u), nabizVar && platformSatiri(u)), sag: nabizVar ? sonGorulme(u) : u.rol === "kullanici" ? "" : ROL[u.rol], ton: nabizVar && cevrimiciMi(u) ? "yesil" : "",
        onclick: yonetilebilir(u) ? () => formPaneli(u, yenile) : undefined })))
      : bosDurum("Kullanıcı yok"),
  ].filter(Boolean));
  return kap;
}
