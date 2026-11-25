// Uygulama içi dosya görüntüleyici (tam ekran): PDF, resim ve düz metin yeni sekme açmadan burada gösterilir.
// Telefon tarayıcıları PDF'i sayfaya gömmediği için PDF, pdf.js ile sayfa sayfa çizilir (kütüphane yalnızca ilk kullanımda indirilir).
// Telefonun geri tuşu görüntüleyiciyi kapatır; iki parmakla ya da +/- düğmeleriyle yakınlaştırılır.
import { h, ikon, geriKancasi } from "./ui.js";

const ZMIN = 1, ZMAX = 5, KENAR = 16, PIKSEL_SINIRI = 12e6;
const RESIM = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif"];

let pdfSozu = null;
function pdfKutuphanesi() {
  return (pdfSozu = pdfSozu || new Promise((coz, red) => {
    if (window.pdfjsLib) return coz(window.pdfjsLib);
    const s = h("script", { src: new URL("../lib/pdf.min.js", import.meta.url).href });
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../lib/pdf.worker.min.js", import.meta.url).href;
      coz(window.pdfjsLib);
    };
    s.onerror = () => { pdfSozu = null; red(new Error("PDF görüntüleyici yüklenemedi. Bağlantıyı kontrol edin ya da dosyayı indirin.")); };
    document.head.append(s);
  }));
}

function turBul(blob, ad) {
  const uzanti = String(ad || "").split(".").pop().toLowerCase();
  const tur = String(blob.type || "");
  if (tur === "application/pdf" || uzanti === "pdf") return "pdf";
  if (tur.startsWith("image/") || RESIM.includes(uzanti)) return "resim";
  if (tur.startsWith("text/") || uzanti === "txt") return "metin";
  return null;
}

export const gosterilebilir = (blob, ad) => turBul(blob, ad) !== null;

const sinirla = (z) => Math.min(ZMAX, Math.max(ZMIN, z));

// PDF: sayfalar ekrana yaklaştıkça çizilir, uzaklaşınca bellekten bırakılır (uzun belgelerde telefon takılmasın).
async function pdfCiz(blob, alan, icerik, durum) {
  const lib = await pdfKutuphanesi();
  const belge = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const sayfalar = [];
  for (let n = 1; n <= belge.numPages; n++) {
    const sayfa = await belge.getPage(n);
    const v = sayfa.getViewport({ scale: 1 });
    const kap = h("div", { class: "gor-sayfa", "aria-label": `Sayfa ${n}` });
    const s = { n, sayfa, oran: v.height / v.width, kap, gorev: null, cizilen: 0, gorunur: false };
    kap._s = s;
    sayfalar.push(s);
    icerik.append(kap);
  }
  const genislik = () => Math.max(120, (alan.clientWidth - KENAR) * durum.zoom);

  async function ciz(s) {
    const w = genislik();
    if (!s.gorunur || s.cizilen === w) return;
    if (s.gorev) { s.gorev.cancel(); s.gorev = null; }
    s.cizilen = w;
    const v1 = s.sayfa.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIKSEL_SINIRI / (w * w * s.oran)));
    const vp = s.sayfa.getViewport({ scale: (w / v1.width) * dpr });
    const tuval = document.createElement("canvas");
    tuval.width = Math.floor(vp.width); tuval.height = Math.floor(vp.height);
    const gorev = s.sayfa.render({ canvasContext: tuval.getContext("2d"), viewport: vp });
    s.gorev = gorev;
    try { await gorev.promise; if (s.gorev === gorev) { s.kap.replaceChildren(tuval); s.gorev = null; } }
    catch { if (s.gorev === gorev) { s.gorev = null; s.cizilen = 0; } }
  }
  function birak(s) {
    if (s.gorev) { s.gorev.cancel(); s.gorev = null; }
    s.kap.replaceChildren(); s.cizilen = 0;
  }
  const gozcu = new IntersectionObserver((kayitlar) => {
    for (const k of kayitlar) { const s = k.target._s; s.gorunur = k.isIntersecting; if (s.gorunur) ciz(s); else birak(s); }
  }, { root: alan, rootMargin: "120% 0px" });

  const boyutla = () => {
    const w = genislik();
    for (const s of sayfalar) { s.kap.style.width = `${w}px`; s.kap.style.height = `${w * s.oran}px`; if (s.gorunur) ciz(s); }
  };
  boyutla();
  sayfalar.forEach((s) => gozcu.observe(s.kap));
  return {
    uygula: boyutla,
    sayfaSayisi: sayfalar.length,
    gecerliSayfa: () => {
      const orta = alan.scrollTop + alan.clientHeight / 3;
      let bulunan = 1;
      for (const s of sayfalar) { if (s.kap.offsetTop <= orta) bulunan = s.n; else break; }
      return bulunan;
    },
    temizle: () => { gozcu.disconnect(); sayfalar.forEach(birak); belge.destroy(); },
  };
}

function resimCiz(blob, alan, icerik, durum) {
  const adres = URL.createObjectURL(blob);
  const resim = h("img", { class: "gor-resim", src: adres, alt: "", draggable: "false" });
  const bitti = new Promise((coz, red) => { resim.onload = coz; resim.onerror = () => red(new Error("Bu resim bu cihazda gösterilemiyor. Dosyayı indirin.")); });
  icerik.append(resim);
  const uygula = () => { resim.style.width = `${Math.max(120, (alan.clientWidth - KENAR) * durum.zoom)}px`; };
  uygula();
  return bitti.then(() => ({ uygula, sayfaSayisi: 0, temizle: () => URL.revokeObjectURL(adres) }));
}

async function metinCiz(blob, icerik) {
  icerik.append(h("pre", { class: "gor-metin" }, await blob.text()));
  return { uygula: () => {}, sayfaSayisi: 0, temizle: () => {}, yakinlastirma: false };
}

// blob: gösterilecek dosya, ad: dosya adı, indir: "İndir" düğmesinin çağıracağı işlev. Desteklenmeyen türde false döner (çağıran indirir).
export function goruntuleyiciAc(blob, ad, indir) {
  const tur = turBul(blob, ad);
  if (!tur) return false;
  const durum = { zoom: 1 };
  let motor = null, kapandi = false;

  const alan = h("div", { class: "gor-alan", tabindex: "0" });
  const icerik = h("div", { class: "gor-icerik" });
  alan.append(icerik);
  const alt = h("span", { class: "gor-alt" });
  const dugme = (ad_, simge, tikla, ozellik = {}) => h("button", { class: "ikon-dugme", type: "button", "aria-label": ad_, onclick: tikla, ...ozellik }, ikon(simge));
  const kapatDugmesi = dugme("Kapat", "geri", () => history.back());
  const eksi = dugme("Uzaklaştır", "eksi", () => zoomYap(durum.zoom / 1.4));
  const arti = dugme("Yakınlaştır", "arti", () => zoomYap(durum.zoom * 1.4));
  const indirDugmesi = dugme("Telefona indir", "indir", () => indir());
  const ust = h("header", { class: "gor-ust" }, kapatDugmesi, h("div", { class: "gor-baslik" }, h("strong", {}, ad), alt), tur === "metin" ? null : eksi, tur === "metin" ? null : arti, indirDugmesi);
  const kok = h("div", { class: "goruntuleyici", role: "dialog", "aria-modal": "true", "aria-label": ad }, ust, alan);
  const bekle = h("p", { class: "gor-bekle", role: "status" }, "Yükleniyor");
  alan.append(bekle);

  function kapat() {
    if (kapandi) return;
    kapandi = true;
    document.removeEventListener("keydown", tus);
    if (motor) motor.temizle();
    kok.remove();
  }
  const tus = (e) => { if (e.key === "Escape") history.back(); };

  function zoomYap(yeni) {
    const z = sinirla(yeni);
    if (!motor || z === durum.zoom) return;
    const oran = z / durum.zoom;
    const ortaY = alan.scrollTop + alan.clientHeight / 2, ortaX = alan.scrollLeft + alan.clientWidth / 2;
    durum.zoom = z;
    motor.uygula();
    alan.scrollTop = ortaY * oran - alan.clientHeight / 2;
    alan.scrollLeft = ortaX * oran - alan.clientWidth / 2;
    arti.disabled = z >= ZMAX; eksi.disabled = z <= ZMIN;
  }

  // İki parmakla yakınlaştırma: parmaklar hareket ederken içerik anlık ölçeklenir, bırakınca yeni boyutta yeniden çizilir.
  let baslangic = 0, oran = 1;
  const mesafe = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  alan.addEventListener("touchstart", (e) => { if (e.touches.length === 2 && motor && tur !== "metin") { baslangic = mesafe(e); oran = 1; } }, { passive: true });
  alan.addEventListener("touchmove", (e) => {
    if (baslangic && e.touches.length === 2) {
      oran = Math.min(ZMAX / durum.zoom, Math.max(ZMIN / durum.zoom, mesafe(e) / baslangic));
      icerik.style.transformOrigin = "0 0"; icerik.style.transform = `scale(${oran})`;
      e.preventDefault();
    }
  }, { passive: false });
  alan.addEventListener("touchend", (e) => {
    if (baslangic && e.touches.length < 2) { baslangic = 0; icerik.style.transform = ""; const o = oran; oran = 1; if (o !== 1) zoomYap(durum.zoom * o); }
  });

  let bekleyen = false;
  alan.addEventListener("scroll", () => {
    if (bekleyen || !motor || !motor.gecerliSayfa) return;
    bekleyen = true;
    requestAnimationFrame(() => { bekleyen = false; if (motor && motor.gecerliSayfa) alt.textContent = `Sayfa ${motor.gecerliSayfa()} / ${motor.sayfaSayisi}`; });
  }, { passive: true });

  document.body.append(kok);
  document.addEventListener("keydown", tus);
  history.pushState({ ...(history.state || {}), gor: 1 }, "");
  geriKancasi(kapat);
  kapatDugmesi.focus();

  (tur === "pdf" ? pdfCiz(blob, alan, icerik, durum) : tur === "resim" ? resimCiz(blob, alan, icerik, durum) : metinCiz(blob, icerik))
    .then((m) => {
      if (kapandi) { m.temizle(); return; }
      motor = m;
      bekle.remove();
      if (m.yakinlastirma === false) { eksi.hidden = true; arti.hidden = true; }
      if (m.sayfaSayisi) alt.textContent = `Sayfa 1 / ${m.sayfaSayisi}`;
      eksi.disabled = true;
    })
    .catch((e) => {
      bekle.replaceChildren(h("span", {}, (e && e.message) || "Dosya gösterilemedi."), h("button", { class: "dugme ikincil", type: "button", onclick: () => indir() }, ikon("indir", 18), "Telefona indir"));
      bekle.classList.add("hata");
    });
  return true;
}
