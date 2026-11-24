// Uygulama kabuğu: açılış, giriş, alt sekmeler, sekme değişimi.
import * as api from "./api.js";
import * as veri from "./veri.js";
import { marka, markaDinle, markaOnbellektenYukle, sirketBaslangici, sirketBilgisiYukle, sirketKaydet } from "./marka.js";
import { sirketKodunuNormalle } from "./kimlik.js";
import { VARSAYILAN_MARKA } from "./marka_normal.js";
import { h, ikon, toast, yukleniyor, hataGoster, kokYenileyiciAyarla, tumDetaylariKapat, uyariKutusu, panelAc, animOnay, parolaAlani } from "./ui.js";
import * as bugun from "./ekranlar/bugun.js";
import * as okul from "./ekranlar/okul.js";
import * as muhasebe from "./ekranlar/muhasebe.js";
import * as filo from "./ekranlar/filo.js";
import * as hesap from "./ekranlar/hesap.js";
import * as evrak from "./ekranlar/evrak.js";
import * as yonetim from "./ekranlar/yonetim.js";
import { basvuruEkrani } from "./ekranlar/basvuru.js";
import { MENU, ALT_CUBUK_SIRASI } from "./menu.js";
import { metin } from "./metin.js";

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
  fatura: () => muhasebe.faturaSayfasi(),
  arac: () => filo.aracSayfasi(),
  esnaf: () => muhasebe.esnafSayfasi(),
  petrol: () => muhasebe.akaryakitSayfasi(),
  ic_hizmet: () => filo.icHizmetSayfasi(),
  okul: () => okul.ciz(),
  ayarlar: () => hesap.ciz({ cikis, yenile: tazele }),
};
const SEKMELER = [
  ...MENU.map((m) => ({ ...m, goster: () => m.id === "ayarlar" || veri.izinVar(m.izin), ciz: EKRANLAR[m.id] })),
  { id: "yonetim", ad: "Yönetim", ikon: "yonetim", goster: () => veri.baglam.platform, ciz: () => yonetim.ciz({ yenile: yeniden }) },
];
const simge = (s, boyut) => (s.resim ? h("img", { class: "menu-resim", src: s.resim, alt: "", width: boyut, height: boyut, draggable: "false" }) : ikon(s.ikon, boyut));

let aktif = null;
let cizimSirasi = 0;
let icerik, baslik, baslikIkonu, sekmeCubugu, bildirim, gorunenSekmeler = [];

// ── Açılış ──────────────────────────────────────────────────────────────────
async function baslat() {
  tumDetaylariKapat();
  const sirket = sirketBaslangici();
  markaOnbellektenYukle(sirket.kod);
  if (sirket.kod) sirketBilgisiYukle(sirket.kod);   // beklenmez: giriş ekranı son bilinen markayla anında açılır, taze marka gelince güncellenir
  if (!api.yapilandirildi()) return kurulumEkrani();
  if (!api.girisVar()) return girisEkrani();
  kok.replaceChildren(h("div", { class: "tam-ekran" }, yukleniyor()));
  try {
    if (!(await veri.baglamKur())) return hataEkrani("Bu hesap henüz bir işletmeye bağlı değil. Yöneticinizden hesabınızı işletmeye eklemesini isteyin.", false);
  } catch (e) {
    if (!api.girisVar() || e.durum === 401) return girisEkrani();
    return hataEkrani(e.message, true);
  }
  kabuk();
}

function kurulumEkrani() {
  kok.replaceChildren(h("main", { class: "tam-ekran giris" },
    h("h1", {}, "Kurulum gerekli"),
    h("p", { class: "soluk" }, "mobilv2/js/config.js dosyasındaki ANON_KEY boş. Supabase panelinden Project Settings > API Keys bölümündeki anon public anahtarını yazın.")));
}

function hataEkrani(mesaj, tekrar) {
  kok.replaceChildren(h("main", { class: "tam-ekran giris" }, h("h1", {}, "Açılamadı"), hataGoster({ message: mesaj }, tekrar ? baslat : null),
    h("button", { class: "dugme ikincil", onclick: cikis }, "Çıkış yap")));
}

function girisEkrani(hata = "") {
  const sirket = sirketBaslangici();
  const sirketGirdisi = h("input", { class: "girdi", type: "text", autocomplete: "organization", autocapitalize: "none", spellcheck: "false", required: true,
    "aria-label": "Şirket kodu", placeholder: "Şirket kodu", value: sirket.kod, readonly: sirket.kilitli });
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
    if (!kod) return hataYaz("Şirket kodunu yazın (örn. abc-turizm). Kodu yöneticiniz verir.");
    dugme.disabled = true; dugme.textContent = "Giriş yapılıyor"; mesaj.hidden = true;
    const bilgi = await sirketBilgisiYukle(kod);
    if (bilgi.durum === "yok") {
      const basvuru = await api.rpc("sirket_basvuru_durumu", { p_kod: kod }).catch(() => null);
      if (basvuru === "bekliyor") return hataYaz("Bu şirket için başvurunuz alındı ve onay bekliyor. Onaylanınca aynı kodla giriş yapabilirsiniz.");
      if (basvuru === "reddedildi") return hataYaz("Bu şirket başvurusu kabul edilmedi. Ayrıntı için bizimle iletişime geçin.");
      return hataYaz("Şirket kodu bulunamadı. Kodu kontrol edin.");
    }
    if (bilgi.durum === "hata") return hataYaz(metin("login_hata_sunucu"));
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
    h("button", { class: "baglanti-dugme", type: "button", onclick: () => kok.replaceChildren(basvuruEkrani({ geri: () => girisEkrani(), ad: "" })) }, "Yeni şirket başvurusu")));
  (kayitliAd ? parola : eposta).focus();   // masaüstündeki gibi: kayıtlı kullanıcı varsa şifreye odaklanır
}

function cikis() {
  api.cikisYap();
  veri.onbellekTemizle();
  aktif = null;
  girisEkrani();
}

// ── Kabuk ───────────────────────────────────────────────────────────────────
function kabuk() {
  const sekmeler = SEKMELER.filter((s) => s.goster());
  gorunenSekmeler = sekmeler;
  baslik = h("h1", {});
  baslikIkonu = h("span", { class: "ust-ikon" });
  icerik = h("main", { class: "icerik", id: "icerik" });
  bildirim = h("div");
  // Alt çubuk: sık kullanılan en çok 3 modül + Menü (masaüstündeki yan menünün tamamı). Seçili modül çubukta yoksa "Menü" seçili görünür.
  const altCubuk = ALT_CUBUK_SIRASI.map((id) => sekmeler.find((s) => s.id === id)).filter(Boolean).slice(0, 3);
  sekmeCubugu = h("nav", { class: "sekmeler", "aria-label": "Ana bölümler" },
    altCubuk.map((s) => h("button", { class: "sekme", id: "sekme-" + s.id, "aria-label": s.ad, onclick: () => sekmeyeGit(s.id) }, simge(s, 28), h("span", {}, s.ad))),
    h("button", { class: "sekme", id: "sekme-menu", "aria-label": "Menü", "aria-haspopup": "dialog", onclick: menuAc }, ikon("menu", 28), h("span", {}, "Menü")));
  const ustLogo = h("img", { class: "ust-logo", src: marka.logo, alt: marka.ad });
  markaDinle(() => {
    if (!ustLogo.isConnected) return false;   // kabuk yeniden çizildi
    ustLogo.src = marka.logo;
    ustLogo.alt = marka.ad;
  });
  kok.replaceChildren(
    h("header", { class: "ust" }, ustLogo, baslikIkonu, baslik, h("button", { class: "ikon-dugme", "aria-label": "Yenile", onclick: tazele }, ikon("yenile"))),
    bildirim, icerik, sekmeCubugu);
  kokYenileyiciAyarla(() => sekmeCiz(aktif, true));
  if (!veri.lisansAcik()) bildirim.append(uyariKutusu("İşletmenin lisans süresi dolmuş. Veriler gösterilmiyor; lisansı yenileyin."));
  const istenen = location.hash.slice(1);
  const ilk = ALT_CUBUK_SIRASI.map((id) => sekmeler.find((s) => s.id === id)).find(Boolean) || sekmeler[0];
  sekmeyeGit(sekmeler.some((s) => s.id === istenen) ? istenen : ilk.id);
}

// Masaüstündeki yan menü: ikon üstte, başlık altta; altta kullanıcı ve Çıkış Yap.
function menuAc() {
  const kullanici = api.kullanici();
  const kutu = (s) => h("button", { class: "menu-kutu" + (s.id === aktif ? " secili" : ""), onclick: () => { panel.kapat(); sekmeyeGit(s.id); } }, simge(s, 64), h("span", {}, s.ad));
  const panel = panelAc("Menü", h("div", { class: "menu-icerik" },
    h("div", { class: "menu-izgara" }, gorunenSekmeler.map(kutu)),
    h("div", { class: "menu-kullanici" },
      h("strong", {}, (kullanici && api.epostadanKullaniciAdi(kullanici.email)) || ""),
      h("button", { class: "dugme tehlike genis", onclick: () => { panel.kapat(); cikis(); } }, metin("settings_session_logout")))));
}

export function sekmeyeGit(id) {
  tumDetaylariKapat();
  history.replaceState(null, "", "#" + id);
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
  const altta = sekmeCubugu.querySelector("#sekme-" + id);
  for (const d of sekmeCubugu.children) {
    const secili = altta ? d === altta : d.id === "sekme-menu";   // çubukta olmayan modülde "Menü" seçili görünür
    d.classList.toggle("secili", secili);
    d.toggleAttribute("aria-current", secili);
  }
  if (!kaydirmayiKoru) icerik.replaceChildren(yukleniyor());
  try {
    const dugum = await sekme.ciz();
    if (sira !== cizimSirasi) return;
    icerik.replaceChildren(dugum);
    icerik.scrollTop = eski;
  } catch (e) {
    if (sira !== cizimSirasi) return;
    if (e.durum === 401 && !api.girisVar()) return girisEkrani("Oturum süresi doldu, tekrar giriş yapın.");
    icerik.replaceChildren(hataGoster(e, () => sekmeCiz(id)));
  }
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

baslat();
