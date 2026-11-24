// Uygulama kabuğu: açılış, giriş, soldan açılan menü (masaüstündeki yan menü), sekme değişimi.
import * as api from "./api.js";
import * as veri from "./veri.js";
import { marka, markaDinle, markaOnbellektenYukle, sirketBaslangici, sirketBilgisiYukle, sirketKaydet } from "./marka.js";
import { sirketKodunuNormalle } from "./kimlik.js";
import { VARSAYILAN_MARKA } from "./marka_normal.js";
import { h, ikon, toast, yukleniyor, hataGoster, kokYenileyiciAyarla, tumDetaylariKapat, uyariKutusu, animOnay, parolaAlani, cipler, telif } from "./ui.js";
import * as bugun from "./ekranlar/bugun.js";
import * as okul from "./ekranlar/okul.js";
import * as muhasebe from "./ekranlar/muhasebe.js";
import * as filo from "./ekranlar/filo.js";
import * as hesap from "./ekranlar/hesap.js";
import * as evrak from "./ekranlar/evrak.js";
import * as kullanicilar from "./ekranlar/kullanicilar.js";
import * as yonetim from "./ekranlar/yonetim.js";
import { durumEkrani } from "./ekranlar/durum.js";
import { basvuruEkrani } from "./ekranlar/basvuru.js";
import { MENU, ALT_CUBUK_SIRASI } from "./menu.js";
import { metin, duz } from "./metin.js";

const kok = document.getElementById("uygulama");
const HATIRLA_ANAHTARI = "filo2.hatirla";
const KULLANICI_ANAHTARI = "filo2.kullanici";
const depoOku = (a) => { try { return localStorage.getItem(a) || ""; } catch { return ""; } };
const depoYaz = (a, d) => { try { if (d) localStorage.setItem(a, d); else localStorage.removeItem(a); } catch { /* depolama kapalı */ } };

// Masaüstündeki yan menüyle aynı modüller (menu.js) + yalnızca platform yöneticisine görünen Yönetim. Ayarlar herkese açık:
// mobilde hesap, lisans ve çıkış bilgisi içerir (masaüstündeki gibi yetkiye bağlı bir ayar sayfası yoktur).
const EKRANLAR = {
  dashboard: () => bugun.ciz(sekmeyeGit),
  sirket_evrak: () => evrak.ciz(),
  fatura: (alt) => muhasebe.faturaSayfasi(alt),
  arac: (alt) => filo.aracSayfasi(alt),
  esnaf: () => muhasebe.esnafSayfasi(),
  petrol: () => muhasebe.akaryakitSayfasi(),
  ic_hizmet: () => filo.icHizmetSayfasi(),
  okul: (alt) => okul.ciz(alt),
  ayarlar: (alt) => (alt === "kullanicilar" ? kullanicilar.ciz() : hesap.ciz({ cikis, yenile: tazele })),
};
const SEKMELER = [
  ...MENU.map((m) => ({ ...m, goster: () => m.id === "ayarlar" || veri.izinVar(m.izin), ciz: EKRANLAR[m.id] })),
  { id: "yonetim", ad: "Yönetim", ikon: "yonetim", goster: () => veri.baglam.platform, ciz: () => yonetim.ciz({ yenile: yeniden }) },
];
const simge = (s, boyut) => (s.resim ? h("img", { class: "menu-resim", src: s.resim, alt: "", width: boyut, height: boyut, draggable: "false" }) : ikon(s.ikon, boyut));

let aktif = null;
const aktifAlt = {};   // modül -> son açık alt başlık (masaüstündeki sekme seçimi gibi hatırlanır)
let cizimSirasi = 0;
let icerik, baslik, baslikIkonu, altCubugu, menuDugmesi, bildirim, gorunenSekmeler = [];
let kabukAcik = false;
let durumAcik = false;   // bloke / bakım ekranı gösteriliyor
let cekmece = null;
const yoneticiMi = () => ["sahip", "yonetici"].includes(veri.baglam.uye && veri.baglam.uye.rol);
const altlar = (s) => (s.alt || []).filter(([k]) => k !== "kullanicilar" || yoneticiMi());
const altSecimi = (s) => { const l = altlar(s); return (l.find(([k]) => k === aktifAlt[s.id]) || l[0] || [])[0]; };

// ── Açılış ──────────────────────────────────────────────────────────────────
async function baslat() {
  tumDetaylariKapat();
  const sirket = sirketBaslangici();
  markaOnbellektenYukle(sirket.kod);
  if (sirket.kod) sirketBilgisiYukle(sirket.kod);   // beklenmez: giriş ekranı son bilinen markayla anında açılır, taze marka gelince güncellenir
  if (!api.yapilandirildi()) return kurulumEkrani();
  if (!api.girisVar()) return girisEkrani();
  kok.replaceChildren(h("div", { class: "tam-ekran" }, yukleniyor(3)));
  try {
    if (!(await veri.baglamKur())) return hataEkrani("Bu hesap henüz bir işletmeye bağlı değil. Yöneticinizden hesabınızı işletmeye eklemesini isteyin.", false);
  } catch (e) {
    if (!api.girisVar() || e.durum === 401) return girisEkrani();
    return hataEkrani(e.message, true);
  }
  const durum = veri.durumTuru();
  if (durum) return durumGoster(durum);
  kabuk();
}

function durumGoster(tur) {
  cekmeceKapat(false);
  tumDetaylariKapat();
  kabukAcik = false;
  durumAcik = true;
  aktif = null;
  kok.replaceChildren(durumEkrani({ tur, mesaj: veri.baglam.bakim && veri.baglam.bakim.mesaj, yenile: baslat, cikis }));
}

function kurulumEkrani() {
  kok.replaceChildren(h("main", { class: "tam-ekran giris" },
    h("h1", {}, "Kurulum gerekli"),
    h("p", { class: "soluk" }, "mobilv2/js/config.js dosyasındaki ANON_KEY boş. Supabase panelinden Project Settings > API Keys bölümündeki anon public anahtarını yazın.")));
}

function hataEkrani(mesaj, tekrar) {
  kabukAcik = false;
  durumAcik = false;
  kok.replaceChildren(h("main", { class: "tam-ekran giris" }, h("h1", {}, "Açılamadı"), hataGoster({ message: mesaj }, tekrar ? baslat : null),
    h("button", { class: "dugme ikincil", onclick: cikis }, "Çıkış yap")));
}

function girisEkrani(hata = "") {
  kabukAcik = false;
  durumAcik = false;
  const sirket = sirketBaslangici();
  const sirketGirdisi = h("input", { class: "girdi", type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: "6", autocomplete: "off", spellcheck: "false", required: true,
    "aria-label": "Şirket kodu", placeholder: "Şirket kodu (6 haneli)", value: sirket.kod, readonly: sirket.kilitli });
  // "Beni hatırla" masaüstündeki gibi kullanıcı adını hatırlar; telefonda ayrıca oturumu cihazda açık tutar.
  const hatirlaAcik = depoOku(HATIRLA_ANAHTARI) !== "0";
  const kayitliAd = hatirlaAcik ? depoOku(KULLANICI_ANAHTARI) : "";
  const eposta = h("input", { class: "girdi", type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, "aria-label": metin("kullanici_ad_placeholder"), placeholder: metin("kullanici_ad_placeholder"), value: kayitliAd });
  const parola = h("input", { class: "girdi", type: "password", autocomplete: "current-password", required: true, "aria-label": metin("kullanici_sifre_placeholder"), placeholder: metin("kullanici_sifre_placeholder") });
  const hatirla = animOnay({ etiket: metin("login_hatirla"), isaretli: hatirlaAcik });
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: !hata }, hata);
  const dugme = h("button", { class: "dugme birincil genis", type: "submit" }, metin("giris_yap"));
  // Şirket kodu yazılırken marka (ad + logo) canlı güncellenir; geçerli kod yoksa varsayılan görünüm kalır.
  let bekleme = null;
  sirketGirdisi.addEventListener("input", () => {
    clearTimeout(bekleme);
    bekleme = setTimeout(() => {
      const k = sirketKodunuNormalle(sirketGirdisi.value);
      if (k) { markaOnbellektenYukle(k); sirketBilgisiYukle(k); }
    }, 350);
  });
  const form = h("form", { class: "form", onsubmit: async (e) => {
    e.preventDefault();
    const kod = sirketKodunuNormalle(sirketGirdisi.value);
    const sifirla = () => { dugme.disabled = false; dugme.textContent = metin("giris_yap"); };
    const hataYaz = (m) => { sifirla(); mesaj.textContent = m; mesaj.hidden = false; };
    if (!kod) return hataYaz("Şirket kodunu yazın: 6 haneli rakam. Kodu yöneticiniz verir.");
    dugme.disabled = true; dugme.textContent = "Giriş yapılıyor"; mesaj.hidden = true;
    const bilgi = await sirketBilgisiYukle(kod);
    if (bilgi.durum === "yok") {
      const basvuru = await api.rpc("sirket_basvuru_durumu", { p_kod: kod }).catch(() => null);
      if (basvuru === "bekliyor") return hataYaz("Bu şirket için başvurunuz alındı ve onay bekliyor. Onaylanınca aynı kodla giriş yapabilirsiniz.");
      if (basvuru === "reddedildi") return hataYaz("Bu şirket başvurusu kabul edilmedi. Ayrıntı için bizimle iletişime geçin.");
      return hataYaz("Şirket kodu bulunamadı. Kodu kontrol edin.");
    }
    if (bilgi.durum === "hata") return hataYaz(duz("login_hata_sunucu"));
    try {
      await api.girisYap(eposta.value.trim(), parola.value, bilgi.alan, hatirla.deger());
      sirketKaydet(kod);
      depoYaz(HATIRLA_ANAHTARI, hatirla.deger() ? "1" : "0");
      depoYaz(KULLANICI_ANAHTARI, hatirla.deger() ? eposta.value.trim() : "");
      await baslat();
    }
    catch (err) { hataYaz(err.message); }
  } }, sirketGirdisi, eposta, parolaAlani(parola), hatirla, mesaj, dugme);
  const logo = h("img", { class: "marka-logo", src: marka.logo, alt: "", height: "56" });
  const markaBasligi = h("h1", {}, marka.ad);
  const markaKabi = h("div", { class: "marka" }, logo, markaBasligi);
  const markaCiz = () => {
    logo.src = marka.logo;
    markaBasligi.textContent = marka.ad;
    markaKabi.classList.toggle("ozel", marka.logo !== VARSAYILAN_MARKA.logo);   // işletmenin kendi logosu: ortada büyük, ad alt yazı
  };
  markaCiz();
  markaDinle(() => {
    if (!logo.isConnected) return false;   // giriş ekranı kapandı
    markaCiz();
  });
  kok.replaceChildren(h("main", { class: "tam-ekran giris" }, markaKabi, form,
    h("button", { class: "baglanti-dugme", type: "button", onclick: () => kok.replaceChildren(basvuruEkrani({ geri: () => girisEkrani(), ad: "" })) }, "Yeni şirket başvurusu"), telif()));
  (kayitliAd ? parola : eposta).focus();   // masaüstündeki gibi: kayıtlı kullanıcı varsa şifreye odaklanır
}

function cikis() {
  cekmeceKapat(false);
  api.cikisYap();
  veri.onbellekTemizle();
  aktif = null;
  girisEkrani();
}

// ── Kabuk ───────────────────────────────────────────────────────────────────
function kabuk() {
  cekmeceKapat(false);
  kabukAcik = true;
  durumAcik = false;
  const sekmeler = SEKMELER.filter((s) => s.goster());
  gorunenSekmeler = sekmeler;
  baslik = h("h1", {});
  baslikIkonu = h("span", { class: "ust-ikon" });
  icerik = h("main", { class: "icerik", id: "icerik" });
  bildirim = h("div");
  // Masaüstündeki yan menü soldan açılır; seçili modülün alt başlıkları (masaüstündeki sekmeler) başlığın altında çip olarak durur.
  altCubugu = h("nav", { class: "alt-cubugu", "aria-label": "Alt başlıklar", hidden: true });
  menuDugmesi = h("button", { class: "ikon-dugme", "aria-label": "Menü", "aria-haspopup": "dialog", "aria-expanded": "false", onclick: cekmeceAc }, ikon("menu", 26));
  const ustLogo = h("img", { class: "ust-logo", src: marka.logo, alt: marka.ad });
  markaDinle(() => {
    if (!ustLogo.isConnected) return false;   // kabuk yeniden çizildi
    ustLogo.src = marka.logo;
    ustLogo.alt = marka.ad;
  });
  kok.replaceChildren(
    h("header", { class: "ust" }, menuDugmesi, ustLogo, baslikIkonu, baslik, h("button", { class: "ikon-dugme", "aria-label": "Yenile", onclick: tazele }, ikon("yenile"))),
    altCubugu, bildirim, icerik);
  kokYenileyiciAyarla(() => sekmeCiz(aktif, true));
  if (!veri.lisansAcik()) bildirim.append(uyariKutusu("İşletmenin lisans süresi dolmuş. Veriler gösterilmiyor; lisansı yenileyin."));
  const [istenen, istenenAlt] = location.hash.slice(1).split("/");
  const ilk = ALT_CUBUK_SIRASI.map((id) => sekmeler.find((s) => s.id === id)).find(Boolean) || sekmeler[0];
  sekmeyeGit(sekmeler.some((s) => s.id === istenen) ? istenen : ilk.id, istenenAlt);
}

// Masaüstündeki yan menünün aynısı: soldan açılır, her modülün altında sekmeleri vardır; altta kullanıcı ve Çıkış Yap.
function cekmeceAc() {
  if (cekmece) return cekmeceKapat();
  const kullanici = api.kullanici();
  const ad = (kullanici && api.epostadanKullaniciAdi(kullanici.email)) || "";
  const rol = { sahip: "Sahip", yonetici: "Yönetici", kullanici: "Kullanıcı" }[veri.baglam.uye && veri.baglam.uye.rol] || "";
  const acik = new Set(aktif && altlar(gorunenSekmeler.find((s) => s.id === aktif) || {}).length > 1 ? [aktif] : []);
  const liste = h("nav", { class: "cekmece-liste", "aria-label": "Ana bölümler" });

  function listeCiz() {
    liste.replaceChildren(...gorunenSekmeler.map((s) => {
      const alt = altlar(s);
      const grup = alt.length > 1;
      const seciliModul = s.id === aktif;
      const baslikDugmesi = h("button", { class: "cekmece-oge" + (seciliModul ? " secili" : ""), "aria-expanded": grup ? String(acik.has(s.id)) : undefined, "aria-current": seciliModul && !grup ? "page" : undefined,
        onclick: () => { if (!grup) { cekmeceKapat(false); return sekmeyeGit(s.id); } acik.has(s.id) ? acik.delete(s.id) : acik.add(s.id); listeCiz(); } },
        simge(s, 28), h("span", { class: "cekmece-ad" }, s.ad), grup && h("span", { class: "cekmece-ok" + (acik.has(s.id) ? " acik" : "") }, ikon("sag", 18)));
      return h("div", { class: "cekmece-grup" }, baslikDugmesi,
        grup && acik.has(s.id) && h("div", { class: "cekmece-alt" }, alt.map(([k, adi]) =>
          h("button", { class: "cekmece-altoge" + (seciliModul && k === altSecimi(s) ? " secili" : ""), onclick: () => { cekmeceKapat(false); sekmeyeGit(s.id, k); } }, adi))));
    }));
  }
  listeCiz();

  const logo = h("img", { class: "cekmece-logo", src: marka.logo, alt: "" });
  const panel = h("aside", { class: "cekmece", role: "dialog", "aria-modal": "true", "aria-label": "Menü" },
    h("div", { class: "cekmece-ust" }, logo, h("span", { class: "cekmece-sirket" }, veri.baglam.isletmeAdi || marka.ad),
      h("button", { class: "ikon-dugme", "aria-label": "Kapat", onclick: () => cekmeceKapat() }, ikon("kapat"))),
    liste,
    h("div", { class: "cekmece-alt-kisim" },
      h("div", { class: "cekmece-kullanici" }, h("span", { class: "avatar", "aria-hidden": "true" }, (ad[0] || "?").toLocaleUpperCase("tr")),
        h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, ad), h("span", { class: "satir-alt" }, rol))),
      h("button", { class: "dugme tehlike genis", onclick: cikis }, metin("settings_session_logout"))));
  const arka = h("div", { class: "cekmece-arka", onclick: (e) => { if (e.target === arka) cekmeceKapat(); } }, panel);
  const tus = (e) => { if (e.key === "Escape") cekmeceKapat(); };
  let baslangicX = null;
  panel.addEventListener("touchstart", (e) => { baslangicX = e.touches[0].clientX; }, { passive: true });
  panel.addEventListener("touchend", (e) => { if (baslangicX !== null && e.changedTouches[0].clientX - baslangicX < -60) cekmeceKapat(); baslangicX = null; }, { passive: true });
  document.addEventListener("keydown", tus);
  document.body.append(arka);
  menuDugmesi.setAttribute("aria-expanded", "true");
  cekmece = { arka, tus };
  (panel.querySelector(".cekmece-oge.secili") || panel.querySelector(".cekmece-oge")).focus();
}

function cekmeceKapat(odak = true) {
  if (!cekmece) return;
  const { arka, tus } = cekmece;
  cekmece = null;
  arka.remove();
  document.removeEventListener("keydown", tus);
  if (menuDugmesi) { menuDugmesi.setAttribute("aria-expanded", "false"); if (odak) menuDugmesi.focus(); }
}

export function sekmeyeGit(id, alt) {
  tumDetaylariKapat();
  if (alt) aktifAlt[id] = alt;
  const secili = aktifAlt[id];
  history.replaceState(null, "", "#" + id + (secili ? "/" + secili : ""));
  return sekmeCiz(id);
}

const yeniden = () => sekmeCiz(aktif, true);

function tazele() {
  veri.onbellekTemizle();
  return sekmeCiz(aktif);
}

async function sekmeCiz(id, kaydirmayiKoru = false) {
  const sekme = SEKMELER.find((s) => s.id === id);
  if (!sekme || !icerik) return;
  const sira = ++cizimSirasi;
  const eski = kaydirmayiKoru ? icerik.scrollTop : 0;
  aktif = id;
  baslik.textContent = sekme.ad;
  baslikIkonu.replaceChildren(simge(sekme, 30));
  const altListe = altlar(sekme);
  const alt = altSecimi(sekme);
  altCubugu.hidden = altListe.length < 2;
  altCubugu.replaceChildren(...(altListe.length > 1 ? [cipler(altListe, alt, (k) => sekmeyeGit(id, k))] : []));
  if (!kaydirmayiKoru) icerik.replaceChildren(yukleniyor());
  try {
    const dugum = await sekme.ciz(alt);
    if (sira !== cizimSirasi) return;
    icerik.replaceChildren(dugum, telif());
    icerik.scrollTop = eski;
  } catch (e) {
    if (sira !== cizimSirasi) return;
    if (e.durum === 401 && !api.girisVar()) return girisEkrani("Oturum süresi doldu, tekrar giriş yapın.");
    icerik.replaceChildren(hataGoster(e, () => sekmeCiz(id)));
  }
}

// ── Yetki izleme ────────────────────────────────────────────────────────────
// Yönetici yetkiyi değiştirince ya da hesabı kaldırınca açık oturum yeniden giriş beklemeden güncellenir.
let yetkiKontrolSuruyor = false;
async function yetkiIzle() {
  if ((!kabukAcik && !durumAcik) || yetkiKontrolSuruyor || document.hidden) return;
  yetkiKontrolSuruyor = true;
  try {
    if (durumAcik) {   // bloke kalkınca, bakım bitince ya da yönetici izin verince ekran kendiliğinden açılır
      if ((await veri.yetkiKontrol()) === "kaldirildi") {
        api.cikisYap(); veri.onbellekTemizle(); aktif = null; tumDetaylariKapat();
        return girisEkrani("Hesabınızın bu işletmeye erişimi kaldırıldı.");
      }
      if (!(await veri.durumTazele())) baslat();
      return;
    }
    veri.nabiz();
    const durum = await veri.yetkiKontrol();
    if (!kabukAcik) return;
    const yeniDurum = await veri.durumTazele();
    if (yeniDurum) return durumGoster(yeniDurum);
    if (durum === "kaldirildi") {
      api.cikisYap(); veri.onbellekTemizle(); aktif = null; tumDetaylariKapat();
      return girisEkrani("Hesabınızın bu işletmeye erişimi kaldırıldı.");
    }
    if (durum === "degisti") { tumDetaylariKapat(); kabuk(); toast("Yetkileriniz güncellendi"); }
  } catch (e) {
    if (e.durum === 401 && !api.girisVar()) girisEkrani("Oturum süresi doldu, tekrar giriş yapın.");
  } finally { yetkiKontrolSuruyor = false; }
}
setInterval(yetkiIzle, 10000);
document.addEventListener("visibilitychange", yetkiIzle);
window.addEventListener("focus", yetkiIzle);
window.addEventListener("online", yetkiIzle);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

baslat();
