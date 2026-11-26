// Arayüz yapı taşları: DOM yardımcısı, simgeler, bildirim, alt panel, detay ekranı yığını ve ortak bileşenler.
// Veri hiçbir yerde innerHTML ile yazılmaz; her metin textContent olarak eklenir.

export function h(etiket, ozellikler, ...cocuklar) {
  const el = document.createElement(etiket);
  for (const [k, v] of Object.entries(ozellikler || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  ekle(el, cocuklar);
  return el;
}

// Uygulama genelindeki telif satırı (masaüstü ve PDF alt bilgisiyle aynı kural): yapım yılı, sonraki yıllarda "yapım yılı - bu yıl".
const YAPIM_YILI = 2026;
export function telif() {
  const yil = new Date().getFullYear();
  return h("footer", { class: "telif" }, `© ${yil <= YAPIM_YILI ? YAPIM_YILI : `${YAPIM_YILI} - ${yil}`} Ümit Arik`);
}

function ekle(el, cocuklar) {
  for (const c of cocuklar) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) ekle(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const YOLLAR = {
  bugun: "M3 11l9-8 9 8M5 10v10h14V10",
  okul: "M2 9l10-5 10 5-10 5-10-5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5",
  muhasebe: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
  filo: "M5 4h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM4 11h16M7 20v-3M17 20v-3M7.5 14h.01M16.5 14h.01",
  hesap: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  yonetim: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2.2 2.2L15.5 10",
  geri: "M15 5l-7 7 7 7",
  sag: "M9 5l7 7-7 7",
  yenile: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  menu: "M4 7h16M4 12h16M4 17h16",
  ara: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5",
  telefon: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mesaj: "M4 5h16v11H9l-5 4V5z",
  arti: "M12 5v14M5 12h14",
  eksi: "M5 12h14",
  yazdir: "M7 8V4h10v4M6 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M7 14h10v6H7z",
  paylas: "M12 15V4M8 8l4-4 4 4M5 12v7h14v-7",
  tik: "M5 12.5l4.5 4.5L19 7.5",
  cikis: "M9 4H5v16h4M16 8l4 4-4 4M20 12H9",
  indir: "M12 4v11M7 11l5 5 5-5M5 20h14",
  goz: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  kapat: "M6 6l12 12M18 6L6 18",
  zil: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 21h4",
};

export function ikon(ad, boyut = 22) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", boyut);
  svg.setAttribute("height", boyut);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", YOLLAR[ad] || "");
  svg.append(p);
  return svg;
}

// ── Bildirim ────────────────────────────────────────────────────────────────
let toastZaman;
export function toast(mesaj, tur = "") {
  let el = document.getElementById("toast");
  if (!el) { el = h("div", { id: "toast", role: "status" }); document.body.append(el); }
  el.className = "toast " + tur;
  el.textContent = mesaj;
  requestAnimationFrame(() => el.classList.add("acik"));
  clearTimeout(toastZaman);
  toastZaman = setTimeout(() => el.classList.remove("acik"), 3200);
}

// ── Alt panel ───────────────────────────────────────────────────────────────
export function panelAc(baslik, icerik) {
  const kapat = () => { arka.remove(); document.removeEventListener("keydown", tus); };
  const tus = (e) => { if (e.key === "Escape") kapat(); };
  const arka = h("div", { class: "arka", onclick: (e) => { if (e.target === arka) kapat(); } },
    h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": baslik },
      h("div", { class: "panel-ust" }, h("h2", {}, baslik), h("button", { class: "ikon-dugme", "aria-label": "Kapat", onclick: kapat }, ikon("kapat"))),
      icerik));
  document.body.append(arka);
  document.addEventListener("keydown", tus);
  const ilk = arka.querySelector("input, select, textarea");
  if (ilk) setTimeout(() => ilk.focus(), 60);
  return { kapat, arka };
}

// ── Detay ekranı yığını (tarayıcı geri tuşuyla uyumlu) ─────────────────────
const yigin = [];
let kokYenileyici = () => {};
export const kokYenileyiciAyarla = (f) => { kokYenileyici = f; };

export function detayAc(baslik, kur) {
  yigin.push({ baslik, kur });
  history.pushState({ d: yigin.length }, "");
  detayCiz();
}

export function geri() { history.back(); }

// Tam ekran görüntüleyici gibi yığına girmeyen katmanlar: geri tuşu önce bu katmanı kapatır, ekran yığınına dokunmaz.
let geriKapatici = null;
export const geriKancasi = (kapat) => { geriKapatici = kapat; };

window.addEventListener("popstate", () => {
  if (geriKapatici) { const kapat = geriKapatici; geriKapatici = null; kapat(); return; }
  const hedef = (history.state && history.state.d) || 0;
  while (yigin.length > hedef) yigin.pop();
  detayCiz();
});

export function tumDetaylariKapat() { yigin.length = 0; detayCiz(); }

export async function detayYenile({ kok = false } = {}) {
  if (kok) kokYenileyici();
  await detayCiz(true);
}

let kapanisZamani = null;
async function detayCiz(koru = false) {
  const kap = document.getElementById("detay");
  if (!kap) return;
  if (!yigin.length) {
    document.body.classList.remove("detay-acik");
    const bitir = () => { kapanisZamani = null; if (yigin.length) return; kap.hidden = true; kap.replaceChildren(); kap.classList.remove("kapaniyor"); };
    // Kapanışta ekran sağa doğru kayarak solar; hareket azaltma açıksa anında kapanır
    if (kap.hidden || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)) { bitir(); return; }
    kap.classList.add("kapaniyor");
    clearTimeout(kapanisZamani);
    kapanisZamani = setTimeout(bitir, 160);
    return;
  }
  clearTimeout(kapanisZamani);
  kap.classList.remove("kapaniyor");
  const { baslik, kur } = yigin[yigin.length - 1];
  const eskiKaydirma = koru && kap.querySelector(".detay-icerik") ? kap.querySelector(".detay-icerik").scrollTop : 0;
  const icerik = h("div", { class: "detay-icerik" }, yukleniyor());
  kap.replaceChildren(h("header", { class: "ust" }, h("button", { class: "ikon-dugme", "aria-label": "Geri", onclick: geri }, ikon("geri")), h("h1", {}, baslik)), icerik);
  kap.hidden = false;
  document.body.classList.add("detay-acik");
  const sira = yigin.length;
  try {
    const dugum = await kur();
    if (yigin.length === sira && kap.contains(icerik)) { icerik.replaceChildren(dugum); icerik.scrollTop = eskiKaydirma; }
  } catch (e) {
    if (kap.contains(icerik)) icerik.replaceChildren(hataGoster(e, () => detayCiz()));
  }
}

// ── Ortak bileşenler ────────────────────────────────────────────────────────
export const yukleniyor = (satir = 5) => h("div", { class: "yukleniyor", role: "status" }, Array.from({ length: satir }, () => h("div", { class: "iskelet" })), h("span", { class: "gizli" }, "Yükleniyor"));
export const bosDurum = (mesaj) => h("p", { class: "bos" }, mesaj);

export function hataGoster(e, tekrar) {
  return h("div", { class: "hata-kutusu" }, h("p", {}, (e && e.message) || "Bir sorun oluştu."), tekrar && h("button", { class: "dugme ikincil", onclick: tekrar }, "Tekrar dene"));
}

// Tahsilat havuzu: yuvarlak bir tank, ödenen oran kadar turkuaz-yeşil suyla dolar (görününce yükselir); su yüzeyi sürekli dalgalanır. Ortada yüzde yazar.
export function havuz(oran, { boyut = 132 } = {}) {
  const yuzde = Math.round(Math.min(1, Math.max(0, Number.isFinite(oran) ? oran : 0)) * 100);
  const ns = "http://www.w3.org/2000/svg";
  const dalga = (sinif, d) => {
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 200 12");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("class", `havuz-dalga ${sinif}`);
    svg.setAttribute("aria-hidden", "true");
    const yol = document.createElementNS(ns, "path");
    yol.setAttribute("d", d);
    svg.append(yol);
    return svg;
  };
  const el = h("div", { class: "havuz", role: "img", "aria-label": `Tahsilat yüzde ${yuzde}`, style: `--b:${boyut}px;--p:0` },
    h("div", { class: "havuz-su", "aria-hidden": "true" },
      dalga("arka", "M0 6 Q25 1 50 6 T100 6 T150 6 T200 6 V12 H0 Z"), dalga("on", "M0 6 Q25 11 50 6 T100 6 T150 6 T200 6 V12 H0 Z"), h("div", { class: "havuz-govde" })),
    h("span", { class: "havuz-yazi" }, `%${yuzde}`));
  const doldur = () => el.style.setProperty("--p", String(yuzde));
  // Ekrandan çıkınca dalgalar durur (pil ve akıcılık); girince devam eder. Su seviyesi ilk görünüşte yükselir.
  let doldu = false;
  if (typeof IntersectionObserver === "undefined") doldur();
  else {
    const gozcu = new IntersectionObserver((k) => {
      const gorunur = k.some((x) => x.isIntersecting);
      el.classList.toggle("durgun", !gorunur);
      if (gorunur && !doldu) { doldu = true; requestAnimationFrame(doldur); }
    });
    gozcu.observe(el);
  }
  return el;
}
export function kart(...cocuklar) { return h("section", { class: "kart" }, ...cocuklar); }

export function satir({ baslik, alt, sag, sagAlt, ton = "", onclick }) {
  const govde = [
    h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, baslik), alt && h("span", { class: "satir-alt" }, alt)),
    (sag || sagAlt) && h("span", { class: "satir-sag " + ton }, sag && h("span", { class: "satir-tutar" }, sag), sagAlt && h("span", { class: "satir-alt" }, sagAlt)),
    onclick && h("span", { class: "satir-ok" }, ikon("sag", 18)),
  ];
  return onclick ? h("button", { class: "satir", onclick }, govde) : h("div", { class: "satir" }, govde);
}

export function bilgiSatiri(etiket, deger, ton = "") {
  if (deger === "" || deger === null || deger === undefined) return null;
  return h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, etiket), h("span", { class: "bilgi-deger " + ton }, deger));
}

export function cipler(secenekler, secili, sec) {
  const kap = h("div", { class: "cipler", role: "tablist" }, secenekler.map(([kod, ad, adet]) =>
    h("button", { class: "cip" + (kod === secili ? " secili" : ""), role: "tab", "aria-selected": kod === secili ? "true" : "false", onclick: () => sec(kod) },
      ad, adet !== undefined && h("span", { class: "cip-adet" }, adet))));
  // Çipler her seçimde yeniden çizilir; kaydırma başa dönmesin diye seçili çip görünür alanın ortasına getirilir.
  requestAnimationFrame(() => {
    const s = kap.querySelector(".cip.secili");
    if (s && kap.scrollWidth > kap.clientWidth) kap.scrollLeft = s.getBoundingClientRect().left - kap.getBoundingClientRect().left + kap.scrollLeft - (kap.clientWidth - s.offsetWidth) / 2;
  });
  return kap;
}

export function segment(secenekler, secili, sec) {
  return h("div", { class: "segment", role: "tablist" }, secenekler.map(([kod, ad]) =>
    h("button", { class: "segment-dugme" + (kod === secili ? " secili" : ""), role: "tab", "aria-selected": kod === secili ? "true" : "false", onclick: () => sec(kod) }, ad)));
}

export function aramaKutusu(deger, yazildi, yerTutucu = "Ara") {
  const girdi = h("input", { type: "search", class: "arama-girdi", placeholder: yerTutucu, value: deger, autocomplete: "off", "aria-label": yerTutucu, oninput: () => yazildi(girdi.value) });
  return h("label", { class: "arama" }, ikon("ara", 18), girdi);
}

// aylar: yeniden eskiye sıralı 'YYYY-MM' listesi
export function ayCubugu(aylar, secili, sec, adlandir) {
  const i = aylar.indexOf(secili);
  return h("div", { class: "ay-cubugu" },
    h("button", { class: "ikon-dugme", "aria-label": "Önceki ay", disabled: i < 0 || i >= aylar.length - 1, onclick: () => sec(aylar[i + 1]) }, ikon("geri")),
    h("strong", {}, adlandir(secili)),
    h("button", { class: "ikon-dugme", "aria-label": "Sonraki ay", disabled: i <= 0, onclick: () => sec(aylar[i - 1]) }, ikon("sag")));
}

export function uyariKutusu(mesaj) { return h("p", { class: "uyari-kutusu", role: "alert" }, mesaj); }

// Masaüstündeki AnimCheckBox'ın aynısı: data/anim/checkbox_0..13.png kareleri (ikon/onay-animasyon.png tek şeritte), 25 ms/kare.
// Dönen düğmede deger() işaret durumunu verir; hareket azaltma tercihi açıksa animasyonsuz geçer.
const ONAY_KARE = 13, ONAY_MS = 25, ONAY_BOYUT = 30;
export function animOnay({ etiket, isaretli = false, degisti, id }) {
  let acik = isaretli, kare = isaretli ? ONAY_KARE : 0, zamanlayici = null;
  const kutu = h("span", { class: "onay-kutu", "aria-hidden": "true" });
  const dugme = h("button", { class: "onay-dugme", type: "button", role: "checkbox", "aria-checked": String(acik), id }, kutu, etiket && h("span", { class: "onay-etiket" }, etiket));
  const ciz = () => { kutu.style.backgroundPosition = `${-kare * ONAY_BOYUT}px 0`; };
  dugme.addEventListener("click", () => {
    if (zamanlayici) return;
    acik = !acik;
    dugme.setAttribute("aria-checked", String(acik));
    const hedef = acik ? ONAY_KARE : 0;
    const bitir = () => { kare = hedef; ciz(); if (degisti) degisti(acik); };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return bitir();
    kare = acik ? 1 : ONAY_KARE;
    ciz();
    zamanlayici = setInterval(() => {
      kare += acik ? 1 : -1;
      ciz();
      if (kare === hedef) { clearInterval(zamanlayici); zamanlayici = null; bitir(); }
    }, ONAY_MS);
  });
  dugme.deger = () => acik;
  ciz();
  return dugme;
}

// Şifre alanı + masaüstündeki göz düğmesi (open_eye/close_eye): basınca şifreyi gösterir/gizler.
export function parolaAlani(girdi) {
  const resim = h("img", { class: "goz-resim", src: "ikon/goz-kapali.png", alt: "", width: "22", height: "22", draggable: "false" });
  const dugme = h("button", { class: "goz-dugme", type: "button", "aria-label": "Şifreyi göster", "aria-pressed": "false" }, resim);
  dugme.addEventListener("click", () => {
    const goster = girdi.type === "password";
    girdi.type = goster ? "text" : "password";
    resim.src = goster ? "ikon/goz-acik.png" : "ikon/goz-kapali.png";
    dugme.setAttribute("aria-pressed", String(goster));
    dugme.setAttribute("aria-label", goster ? "Şifreyi gizle" : "Şifreyi göster");
  });
  girdi.classList.add("parola-girdi");
  return h("div", { class: "parola-alani" }, girdi, dugme);
}

// Canlı yenilemede, kullanıcının "Daha fazla göster" ile açtığı kayıt sayısı korunur: yenilemeden önce DOM'daki sayılar okunur, yeni listeler sırayla bunları kullanır.
let hatirlananSayilar = null;
export function sayfalamaHatirla(kok) { hatirlananSayilar = [...kok.querySelectorAll("[data-gosterilen]")].map((e) => Number(e.dataset.gosterilen) || 0); }
export function sayfalamaBirak() { hatirlananSayilar = null; }

export function sayfalamali(liste, olustur, adim = 60) {
  const kap = h("div", { class: "liste" });
  let gosterilen = 0;
  const onceki = hatirlananSayilar && hatirlananSayilar.length ? hatirlananSayilar.shift() : 0;
  const dahaFazla = h("button", { class: "dugme ikincil genis", onclick: () => ekleSonraki() }, "");
  function ekleSonraki(hedef = gosterilen + adim) {
    liste.slice(gosterilen, hedef).forEach((r) => kap.insertBefore(olustur(r), dahaFazla));
    gosterilen = Math.min(liste.length, Math.max(gosterilen, hedef));
    kap.dataset.gosterilen = String(gosterilen);
    dahaFazla.hidden = gosterilen >= liste.length;
    dahaFazla.textContent = `Daha fazla göster (${liste.length - gosterilen} kayıt kaldı)`;
  }
  kap.append(dahaFazla);
  ekleSonraki(Math.max(adim, onceki));
  return kap;
}
