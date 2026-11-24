// Uygulama kabuğu: açılış, giriş, alt sekmeler, sekme değişimi.
import * as api from "./api.js";
import * as veri from "./veri.js";
import { marka, markaDinle, markaOnbellektenYukle, markaSunucudanYukle } from "./marka.js";
import { VARSAYILAN_MARKA } from "./marka_normal.js";
import { h, ikon, toast, yukleniyor, hataGoster, kokYenileyiciAyarla, tumDetaylariKapat, uyariKutusu } from "./ui.js";
import * as bugun from "./ekranlar/bugun.js";
import * as okul from "./ekranlar/okul.js";
import * as muhasebe from "./ekranlar/muhasebe.js";
import * as filo from "./ekranlar/filo.js";
import * as hesap from "./ekranlar/hesap.js";

const kok = document.getElementById("uygulama");

const SEKMELER = [
  { id: "bugun", ad: "Bugün", ikon: "bugun", goster: () => veri.lisansAcik(), ciz: () => bugun.ciz(sekmeyeGit) },
  { id: "okul", ad: "Okul", ikon: "okul", goster: () => veri.izinVar("okul"), ciz: () => okul.ciz() },
  { id: "muhasebe", ad: "Muhasebe", ikon: "muhasebe", goster: () => muhasebe.mevcutBolumler().length > 0, ciz: () => muhasebe.ciz(yeniden) },
  { id: "filo", ad: "Filo", ikon: "filo", goster: () => filo.mevcutBolumler().length > 0, ciz: () => filo.ciz(yeniden) },
  { id: "hesap", ad: "Hesap", ikon: "hesap", goster: () => true, ciz: () => hesap.ciz({ cikis, yenile: tazele }) },
];

let aktif = null;
let cizimSirasi = 0;
let icerik, baslik, sekmeCubugu, bildirim;

// ── Açılış ──────────────────────────────────────────────────────────────────
async function baslat() {
  tumDetaylariKapat();
  markaOnbellektenYukle();
  markaSunucudanYukle();   // beklenmez: giriş ekranı son bilinen markayla anında açılır, taze marka gelince güncellenir
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
  const eposta = h("input", { class: "girdi", type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false", required: true, "aria-label": "Kullanıcı adı", placeholder: "Kullanıcı adı" });
  const parola = h("input", { class: "girdi", type: "password", autocomplete: "current-password", required: true, "aria-label": "Parola", placeholder: "Parola" });
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: !hata }, hata);
  const dugme = h("button", { class: "dugme birincil genis", type: "submit" }, "Giriş yap");
  const form = h("form", { class: "form", onsubmit: async (e) => {
    e.preventDefault();
    dugme.disabled = true; dugme.textContent = "Giriş yapılıyor"; mesaj.hidden = true;
    try { await api.girisYap(eposta.value.trim(), parola.value); await baslat(); }
    catch (err) { dugme.disabled = false; dugme.textContent = "Giriş yap"; mesaj.textContent = err.message; mesaj.hidden = false; }
  } }, eposta, parola, mesaj, dugme);
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
  kok.replaceChildren(h("main", { class: "tam-ekran giris" }, markaKabi, form));
  eposta.focus();
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
  baslik = h("h1", {});
  icerik = h("main", { class: "icerik", id: "icerik" });
  bildirim = h("div");
  sekmeCubugu = h("nav", { class: "sekmeler", "aria-label": "Ana bölümler" }, sekmeler.map((s) =>
    h("button", { class: "sekme", id: "sekme-" + s.id, "aria-label": s.ad, onclick: () => sekmeyeGit(s.id) }, ikon(s.ikon, 24), h("span", {}, s.ad))));
  const ustLogo = h("img", { class: "ust-logo", src: marka.logo, alt: marka.ad });
  markaDinle(() => {
    if (!ustLogo.isConnected) return false;   // kabuk yeniden çizildi
    ustLogo.src = marka.logo;
    ustLogo.alt = marka.ad;
  });
  kok.replaceChildren(
    h("header", { class: "ust" }, ustLogo, baslik, h("button", { class: "ikon-dugme", "aria-label": "Yenile", onclick: tazele }, ikon("yenile"))),
    bildirim, icerik, sekmeCubugu);
  kokYenileyiciAyarla(() => sekmeCiz(aktif, true));
  if (!veri.lisansAcik()) bildirim.append(uyariKutusu("İşletmenin lisans süresi dolmuş. Veriler gösterilmiyor; lisansı yenileyin."));
  const istenen = location.hash.slice(1);
  sekmeyeGit(sekmeler.some((s) => s.id === istenen) ? istenen : sekmeler[0].id);
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
  for (const d of sekmeCubugu.children) {
    const secili = d.id === "sekme-" + id;
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
