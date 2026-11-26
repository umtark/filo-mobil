// PDF ve Excel çıktılarının ortak altyapısı: yazı tipi/logo yükleme, dışa aktarma ayarları paneli (dönem, firma, logo), dosyayı indirme.
// Raporların kendisi cikti_raporlar.js'dedir; bu dosya yalnızca düğmeleri ve dosya üretim akışını sağlar.
import { h, ikon, toast, panelAc, segment, animOnay } from "./ui.js";
import { Belge } from "./cikti_pdf.js";
import { xlsxUret } from "./cikti_xlsx.js";
import { marka } from "./marka.js";
import { VARSAYILAN_MARKA } from "./marka_normal.js";
import { baglam } from "./veri.js";
import { ayAnahtari, bugun } from "./bicim.js";
import { sayiTr, tl, gg, ggSaat, donemCoz } from "./cikti_yardim.js";
import { goruntuleyiciAc } from "./goruntuleyici.js";
import { duz, baslik as mb, etiket as me } from "./metin.js";

const AYAR_ANAHTARI = "filo2.cikti";
const p2 = (n) => String(n).padStart(2, "0");

export { sayiTr, tl, gg, ggSaat, donemCoz };

// ── Yazı tipi ve logo ───────────────────────────────────────────────────────────────────────────────
let yaziSozu = null;
function yazilariYukle() {
  if (!yaziSozu) {
    const getir = async (ad) => {
      const y = await fetch(new URL(`../yazi/${ad}`, import.meta.url));
      if (!y.ok) throw new Error("Yazı tipi yüklenemedi.");
      return new Uint8Array(await y.arrayBuffer());
    };
    yaziSozu = Promise.all([getir("Nunito-Regular.ttf"), getir("Nunito-Bold.ttf")]).catch((e) => { yaziSozu = null; throw e; });
  }
  return yaziSozu;
}

const ozelLogoVar = () => Boolean(marka.logo) && marka.logo !== VARSAYILAN_MARKA.logo;

// Logo PDF'e JPEG olarak gömülür (şeffaflık beyaza basılır).
async function logoJpeg() {
  if (!ozelLogoVar()) return null;
  const resim = await new Promise((coz, red) => { const r = new Image(); r.onload = () => coz(r); r.onerror = red; r.src = marka.logo; }).catch(() => null);
  if (!resim || !resim.naturalWidth) return null;
  const olcek = Math.min(1, 480 / Math.max(resim.naturalWidth, resim.naturalHeight));
  const g = Math.max(1, Math.round(resim.naturalWidth * olcek)), y = Math.max(1, Math.round(resim.naturalHeight * olcek));
  const tuval = document.createElement("canvas");
  tuval.width = g; tuval.height = y;
  const c = tuval.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, g, y);
  c.drawImage(resim, 0, 0, g, y);
  const blob = await new Promise((coz) => tuval.toBlob(coz, "image/jpeg", 0.92));
  return blob ? { jpeg: new Uint8Array(await blob.arrayBuffer()), g, y } : null;
}

// ── Ayarlar ─────────────────────────────────────────────────────────────────────────────────────────
function ayarOku() {
  try { return JSON.parse(localStorage.getItem(AYAR_ANAHTARI) || "{}") || {}; } catch { return {}; }
}
function ayarYaz(a) {
  try { localStorage.setItem(AYAR_ANAHTARI, JSON.stringify(a)); } catch { /* depolama kapalı */ }
}

function ayarPaneli({ donem, baslik, onay, secenekler = [], firmalar = [], varsayilanAy = "", goster = false }, devam) {
  const kayit = ayarOku();
  const durum = {
    tur: donem ? (varsayilanAy ? "ay" : kayit.donemTur || "tumu") : "tumu", ay: varsayilanAy || kayit.donemAy || ayAnahtari(bugun()),
    firma: kayit.firma ?? baglam.isletmeAdi ?? marka.ad, logo: ozelLogoVar() ? (kayit.logo || "sol") : "yok", boyut: kayit.boyut || "kucuk",
    sec: Object.fromEntries(secenekler.map((s) => [s.k, s.v !== false])), firmaSec: new Set(),
  };
  const kap = h("div", { class: "form" });
  const yerles = (...cocuklar) => kap.replaceChildren(...cocuklar.filter(Boolean));
  const firma = h("input", { class: "girdi", type: "text", maxlength: "80", value: durum.firma, "aria-label": "Firma adı", oninput: () => { durum.firma = firma.value; } });
  const ayGirdi = h("input", { class: "girdi", type: "month", value: durum.ay, "aria-label": "Ay", oninput: () => { if (ayGirdi.value) durum.ay = ayGirdi.value; } });
  function ciz() {
    yerles(
      donem && h("div", { class: "alan" }, h("span", {}, "Dönem"),
        segment([["tumu", mb("export_period_all")], ["bu", mb("export_period_this_month")], ["gecen", mb("export_period_prev_month")], ["ay", mb("export_period_pick_month")]], durum.tur, (k) => { durum.tur = k; ciz(); }),
        durum.tur === "ay" && ayGirdi),
      h("label", { class: "alan" }, h("span", {}, "Firma adı"), firma),
      firmalar.length > 0 && h("div", { class: "alan" }, h("span", {}, "Dışa aktarılacak firmalar"),
        h("p", { class: "soluk" }, "İşaretleyin; hiçbiri işaretli değilse tümü çıkar"),
        h("div", { class: "firma-liste", role: "group", "aria-label": "Dışa aktarılacak firmalar" },
          firmalar.map((f) => animOnay({ etiket: f, isaretli: durum.firmaSec.has(f), degisti: (a) => { if (a) durum.firmaSec.add(f); else durum.firmaSec.delete(f); } })))),
      ...secenekler.map((s) => animOnay({ etiket: s.ad, isaretli: durum.sec[s.k], degisti: (a) => { durum.sec[s.k] = a; } })),
      ozelLogoVar() && h("div", { class: "alan" }, h("span", {}, "Logo"), segment([["yok", "Yok"], ["sol", "Sol"], ["sag", "Sağ"]], durum.logo, (k) => { durum.logo = k; ciz(); })),
      ozelLogoVar() && durum.logo !== "yok" && h("div", { class: "alan" }, h("span", {}, me("export_logo_size")), segment([["kucuk", "Küçük"], ["orta", "Orta"], ["buyuk", "Büyük"]], durum.boyut, (k) => { durum.boyut = k; ciz(); })),
      h("button", { class: "dugme birincil genis", type: "button", onclick: () => gonder("indir") }, ikon("indir", 18), onay),
      goster && h("button", { class: "dugme ikincil genis", type: "button", onclick: () => gonder("goster") }, ikon("goz", 18), "Görüntüle"));
  }
  function gonder(mod) {
    ayarYaz({ donemTur: durum.tur, donemAy: durum.ay, firma: durum.firma.trim(), logo: ozelLogoVar() ? durum.logo : kayit.logo, boyut: durum.boyut });
    panel.kapat();
    devam({ donem: donemCoz({ tur: durum.tur, ay: durum.ay }), firma: durum.firma.trim(), logoKonum: durum.logo, logoBoyut: durum.boyut, sec: { ...durum.sec }, firmaSecim: firmalar.filter((f) => durum.firmaSec.has(f)) }, mod);
  }
  ciz();
  const panel = panelAc(baslik, kap);
}

// ── Dosya indirme ───────────────────────────────────────────────────────────────────────────────────
const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };

export function dosyaIndir(bayt, ad, uzanti) {
  const url = URL.createObjectURL(new Blob([bayt], { type: MIME[uzanti] }));
  const a = h("a", { href: url, download: ad });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const dosyaAdi = (dosya, uzanti) => { const t = new Date(); return `${dosya}_${p2(t.getDate())}${p2(t.getMonth() + 1)}${t.getFullYear()}_${p2(t.getHours())}${p2(t.getMinutes())}.${uzanti}`; };

async function pdfUret(tanim, ayar) {
  const [regular, bold] = await yazilariYukle();
  const logo = ayar.logoKonum !== "yok" ? await logoJpeg() : null;
  const belge = new Belge({ yatay: tanim.yatay !== false, regular, bold, altSol: tanim.altSol || "" });
  const ctx = {
    ...ayar, belge, logo,
    ust: (baslik, { donem = true, firma = true, tarih } = {}) => belge.ustBilgi({
      baslik, firma: firma ? ayar.firma : "", donem: donem && ayar.donemGoster ? ayar.donem.etiket : "", logo,
      logoKonum: ayar.logoKonum === "sag" ? "sag" : "sol", logoBoyut: ayar.logoBoyut, tarih,
    }),
  };
  await tanim.uret(ctx);
  return belge.bitir();
}

// Düğme çifti: PDF ve Excel. pdf: { yatay, altSol, uret(ctx) }, xlsx: { sor, uret(ctx) -> sayfalar[] }. donem: ayar panelinde dönem seçimi gösterilsin.
// uret fonksiyonları tıklama anında çalışır; ekrandaki güncel süzgeç ve seçimler bu sırada okunur. Veri yoksa Error fırlatılır (mesaj gösterilir).
export function ciktiDugmeleri({ dosya, donem = false, varsayilanAy = null, pdf = null, xlsx = null }) {
  const kap = h("div", { class: "cikti-dugmeleri" });
  async function calistir(tur, tanim, dugme) {
    const etiket = dugme.lastChild.textContent;
    const calis = async (ayar, mod = "indir") => {
      dugme.disabled = true;
      dugme.lastChild.textContent = "Hazırlanıyor";
      try {
        const ctx = { ...ayar, donemGoster: donem };
        const bayt = tur === "pdf" ? await pdfUret(tanim, ctx) : xlsxUret(await tanim.uret(ctx));
        if (mod === "goster") { const ad = dosyaAdi(dosya, "pdf"); goruntuleyiciAc(new Blob([bayt], { type: MIME.pdf }), ad, () => dosyaIndir(bayt, ad, "pdf")); }
        else {
          dosyaIndir(bayt, dosyaAdi(dosya, tur), tur);
          toast(`${tur === "pdf" ? "PDF" : "Excel"} dosyası indirildi`, "basari");
        }
      } catch (e) {
        toast((e && e.message) || "Dosya oluşturulamadı", "hata");
      } finally {
        dugme.disabled = false;
        dugme.lastChild.textContent = etiket;
      }
    };
    if (tur === "xlsx" && !tanim.sor && !donem && !(tanim.secenekler || []).length && !tanim.firmalar) return calis({ donem: donemCoz({}), firma: ayarOku().firma ?? baglam.isletmeAdi ?? marka.ad, logoKonum: "yok", logoBoyut: "kucuk", sec: {} });
    let firmalar = [];
    if (tanim.firmalar) {
      try { firmalar = await tanim.firmalar(); } catch (e) { return toast((e && e.message) || "Firma listesi okunamadı", "hata"); }
    }
    ayarPaneli({ donem, baslik: tur === "pdf" ? mb("export_options_pdf") : "Excel ayarları", onay: tur === "pdf" ? "PDF indir" : "Excel indir", goster: tur === "pdf", secenekler: tanim.secenekler, firmalar, varsayilanAy: varsayilanAy ? varsayilanAy() : "" }, calis);
  }
  const dugme = (tur, ad, tanim) => {
    const d = h("button", { class: "dugme ikincil kucuk", type: "button" }, ikon("indir", 16), h("span", {}, ad));
    d.onclick = () => calistir(tur, tanim, d);
    return d;
  };
  if (pdf) kap.append(dugme("pdf", pdf.ad || duz("pdf_aktar"), pdf));
  if (xlsx) kap.append(dugme("xlsx", xlsx.ad || duz("tah_excel_btn"), xlsx));
  return kap;
}
