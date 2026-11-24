// Masaüstündeki PDF/Excel çıktılarının birebir karşılığı olan muhasebe raporları: fatura, esnaf, akaryakıt.
// Her fonksiyon (ctx, veri) alır; ctx = { belge, ust, donem, firma, sec } (PDF) ya da { donem, firma, sec } (Excel). Veri yoksa Error fırlatır.
import { sayiTr, tl, gg, matris, genislikler, toplamla, tarihSirasi } from "./cikti_yardim.js";

const YOK = "Dışa aktarılacak kayıt yok.";
const sirala = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "tr", { sensitivity: "base" });
const bitisTarihi = (donem) => (donem.ay ? new Date(Number(donem.ay.slice(0, 4)), Number(donem.ay.slice(5, 7)), 0, 23, 59, 59) : null);
const sayfaAdi = (ad, kullanilan) => {
  let t = String(ad || "Sayfa").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Sayfa";
  let n = t, i = 2;
  while (kullanilan.has(n.toLowerCase())) n = `${t.slice(0, 26)} ${i++}`;
  kullanilan.add(n.toLowerCase());
  return n;
};

// ════════════════════════════ FATURA ════════════════════════════
function faturaVeri(liste, donem) {
  const l = liste.filter((f) => donem.icinde(f.tarih)).sort(tarihSirasi);
  if (!l.length) throw new Error(YOK);
  return l;
}

function faturaOzeti(l) {
  const g = l.filter((f) => f.giden), a = l.filter((f) => !f.giden);
  const t = (x, k) => toplamla(x, (f) => f[k]);
  const o = {
    gidenToplam: t(g, "toplam"), gelenToplam: t(a, "toplam"), gidenMatrah: t(g, "matrah"), gelenMatrah: t(a, "matrah"),
    gidenKdv: t(g, "kdv"), gelenKdv: t(a, "kdv"), gidenTev: t(g, "tevTutar"), gelenTev: t(a, "tevTutar"),
  };
  o.netFark = o.gidenMatrah - o.gelenMatrah;
  o.kdvFark = (o.gidenKdv - o.gidenTev) - (o.gelenKdv - o.gelenTev);
  return o;
}

function cariDurum(l) {
  const m = new Map();
  for (const f of l) {
    const k = f.firma || "-";
    const e = m.get(k) || { firma: k, gelen: 0, giden: 0 };
    if (f.giden) e.giden += f.toplam; else e.gelen += f.toplam;
    m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, bakiye: e.giden - e.gelen })).sort((a, b) => b.bakiye - a.bakiye);
}

const bakiyeMetni = (b) => (Math.abs(b) < 0.005 ? ["0,00 ₺ (Borç/Alacak Yok)", "#4c3a73"] : b > 0 ? [`+ ${tl(b)} (Alacaklı)`, "#059669"] : [`- ${tl(Math.abs(b))} (Borçlu)`, "#dc2626"]);

export function faturaPdf(ctx, liste) {
  const l = faturaVeri(liste, ctx.donem), oz = faturaOzeti(l), b = ctx.belge;
  ctx.ust("Gelen / Giden Fatura Analizi");
  b.baslik("Fatura Kayıt Detayları");
  b.tablo({
    boyut: 9,
    sutunlar: [{ b: "Tarih", g: 22 }, { b: "Tip", g: 16 }, { b: "Fatura No", g: 22 }, { b: "Firma", a: 1 }, { b: "Matrah", g: 26, hiza: "sag" }, { b: "KDV %", g: 14, hiza: "sag" },
      { b: "KDV Tutari", g: 26, hiza: "sag" }, { b: "Tev.Tutarı", g: 24, hiza: "sag" }, { b: "Toplam", g: 30, hiza: "sag" }],
    satirlar: l.map((f) => [gg(f.tarih), { m: f.giden ? "Giden" : "Gelen", renk: f.giden ? "#059669" : "#dc2626", kalin: true }, f.no, f.firma,
      sayiTr(f.matrah), f.kdvOrani, sayiTr(f.kdv), sayiTr(f.tevTutar), sayiTr(f.toplam)]),
  });
  b.baslik("Firma Cari Durumları (Bakiye / Borç / Alacak İşlemleri)");
  b.tablo({
    baslikArka: "#4c3a73", boyut: 9,
    sutunlar: [{ b: "Firma Ünvanı", g: 90 }, { b: "Bize Kestiği Toplam (Gider)", g: 60, hiza: "sag" }, { b: "Bizim Kestiğimiz Toplam (Gelir)", g: 60, hiza: "sag" }, { b: "Net Durum (Bakiye)", g: 59 }],
    satirlar: cariDurum(l).map((e) => { const [m, renk] = bakiyeMetni(e.bakiye); return [e.firma, tl(e.gelen), tl(e.giden), { m, renk, kalin: true }]; }),
  });
  const z = (m) => ({ m, arka: "#f8fafc" });
  b.ozet({
    baslik: "Genel Finansal Durum (Özet)", baslikArka: "#0f766e",
    satirlar: [
      [z("Toplam Kestiğiniz Faturalar (Gelir)"), z(tl(oz.gidenToplam))],
      [z("Toplam Aldığınız Faturalar (Gider)"), z(tl(oz.gelenToplam))],
      [z("Net Matrah Farkı (Fatura Bazlı)"), { m: tl(oz.netFark), arka: "#f8fafc", renk: oz.netFark >= 0 ? "#059669" : "#dc2626", kalin: true }],
      [z("Net KDV (Tevkifat Sonrası)"), { m: tl(oz.kdvFark), arka: "#f8fafc", renk: oz.kdvFark >= 0 ? "#059669" : "#dc2626", kalin: true }],
    ],
  });
}

export function faturaXlsx(ctx, liste) {
  const l = faturaVeri(liste, ctx.donem), oz = faturaOzeti(l);
  const m = matris(), birlestir = [];
  const bas = ["Tarih", "Fatura No", "Firma", "Aciklama", "Matrah", "KDV %", "KDV Tutari", "Tevkifat", "Tev.Tutarı", "Toplam"];
  const sayisal = [4, 6, 8, 9];
  const yan = (liste2, c0, ad, renk) => {
    m.koy(1, c0, { v: ad, b: true, renk: "#ffffff", arka: renk, hiza: "orta", boyut: 12 });
    for (let i = 1; i < 10; i++) m.koy(1, c0 + i, { v: "", arka: renk });
    birlestir.push([1, c0, 1, c0 + 9]);
    bas.forEach((x, i) => m.koy(2, c0 + i, { v: x, b: true, arka: "#e2e8f0", kenar: true, hiza: "orta" }));
    liste2.forEach((f, i) => {
      [gg(f.tarih), f.no, f.firma, f.aciklama, f.matrah, f.kdvOrani, f.kdv, f.tevkifat, f.tevTutar, f.toplam].forEach((x, j) =>
        m.koy(3 + i, c0 + j, { v: x, kenar: true, ...(sayisal.includes(j) ? { fmt: "para", hiza: "sag" } : {}) }));
    });
    const rt = 3 + liste2.length;
    m.koy(rt, c0, { v: "TOPLAM:", b: true });
    m.koy(rt, c0 + 9, { v: tl(toplamla(liste2, (f) => f.toplam)), b: true, hiza: "sag" });
    return rt;
  };
  const gelen = l.filter((f) => !f.giden), giden = l.filter((f) => f.giden);
  const r1 = yan(gelen, 1, "GELEN FATURALAR", "#dc2626"), r2 = yan(giden, 13, "GİDEN FATURALAR", "#059669");
  if (ctx.firma) { m.koy(1, 25, { v: `Firma: ${ctx.firma}`, b: true }); m.koy(2, 25, { v: `Dönem: ${ctx.donem.etiket}`, b: true }); }
  const genis = genislikler(m.satirlar(), { atla: [1] });
  genis[24] = 32;
  let r = Math.max(r1, r2) + 3;
  m.koy(r, 1, { v: "ÖZET BİLGİLER VE KDV DURUMU", b: true, boyut: 13, renk: "#4c3a73" });
  const renkli = (v) => (v >= 0 ? "#059669" : "#dc2626");
  [["Toplam Kestiğiniz Faturalar (Gelir):", oz.gidenToplam], ["Toplam Aldığınız Faturalar (Gider):", oz.gelenToplam], ["Net Matrah Farkı (Fatura Bazlı):", oz.netFark, true],
    ["Müşteriden Alınan KDV (Satışlardan):", oz.gidenKdv], ["Firmalara Ödenen KDV (Alışlardan):", oz.gelenKdv], ["Tevkifat (Satışlar):", oz.gidenTev], ["Tevkifat (Alışlar):", oz.gelenTev],
    ["Net KDV (Tevkifat Sonrası, Artı: Ödenecek / Eksi: Devreden):", oz.kdvFark, true]].forEach(([ad, v, renk]) => {
    r++;
    m.koy(r, 1, { v: ad, b: true });
    birlestir.push([r, 1, r, 3]);
    m.koy(r, 4, { v: tl(v), b: true, hiza: "sag", ...(renk ? { renk: renkli(v) } : {}) });
  });
  const cari = cariDurum(l), m2 = matris();
  m2.koy(1, 1, { v: "FİRMA LİSTESİ / CARİ DURUM ÖZETİ", b: true, boyut: 14, renk: "#ffffff", arka: "#4c3a73", hiza: "orta" });
  for (let i = 2; i <= 4; i++) m2.koy(1, i, { v: "", arka: "#4c3a73" });
  ["Firma Ünvanı", "Bize Kestiği Toplam (Gider)", "Bizim Kestiğimiz Toplam (Gelir)", "Net Durum (Bakiye)"].forEach((x, i) => m2.koy(2, i + 1, { v: x, b: true, arka: "#e2e8f0", kenar: true, hiza: "orta" }));
  cari.forEach((e, i) => {
    const [t, renk] = bakiyeMetni(e.bakiye);
    [e.firma, tl(e.gelen), tl(e.giden)].forEach((x, j) => m2.koy(3 + i, j + 1, { v: x, kenar: true, ...(j ? { hiza: "sag" } : {}) }));
    m2.koy(3 + i, 4, { v: t, kenar: true, b: true, renk });
  });
  const s2 = m2.satirlar();
  return [
    { ad: "Fatura Raporu", satirlar: m.satirlar(), birlestir, genislik: genis, dondur: 2 },
    { ad: "Firma Cari Özetleri", satirlar: s2, birlestir: [[1, 1, 1, 4]], genislik: genislikler(s2, { atla: [1], alt: 28 }) },
  ];
}

// ════════════════════════════ ESNAF ════════════════════════════
// Bir esnafın işlemleri: kronolojik yürüyen bakiye (borç +, ödeme −), dönem süzgeci, en yeni üstte.
function esnafSatirlari(e, donem) {
  const kro = e.islemler.map((i, idx) => ({ ...i, idx })).sort((a, b) => tarihSirasi(a, b) || b.idx - a.idx);
  const bitis = bitisTarihi(donem);
  let bak = 0, kalan = 0;
  const hepsi = kro.map((i) => {
    bak += i.odeme ? -i.toplam : i.toplam;
    if (!bitis || (i.tarih && i.tarih <= bitis)) kalan = bak;
    return { ...i, bakiye: bak };
  });
  const satirlar = hepsi.filter((i) => donem.icinde(i.tarih)).reverse();
  const borclar = satirlar.filter((i) => !i.odeme);
  return {
    satirlar,
    ozet: {
      adet: satirlar.length, kalan,
      borc: toplamla(borclar, (i) => i.toplam), odeme: toplamla(satirlar.filter((i) => i.odeme), (i) => i.toplam),
      parca: toplamla(borclar, (i) => i.parca), iscilik: toplamla(borclar, (i) => i.iscilik),
    },
  };
}

const kalanRenk = (k) => (k > 0.005 ? "#dc2626" : k < -0.005 ? "#059669" : "#64748b");
function ibareKutusu(b, kalan, toplu) {
  const [metin, renk, arka] = kalan > 0.005
    ? [`Borçluyuz: ${tl(kalan)} (${toplu ? "esnaflara toplam borcumuz" : "esnafa borcumuz"})`, "#dc2626", "#fef2f2"]
    : kalan < -0.005 ? [`Alacaklıyız: ${tl(-kalan)} (${toplu ? "esnaflardan toplam alacağımız" : "esnaftan alacağımız"})`, "#059669", "#ecfdf5"]
      : ["Hesap kapalı: borç/alacak bulunmuyor", "#64748b", "#f1f5f9"];
  b.tablo({ sutunlar: [{ b: "", a: 1 }], baslikYok: true, ortala: true, satirlar: [[{ m: metin, kalin: true, boyut: 13, renk, arka, kenarRenk: renk, kenarKalinlik: 1 }]] });
}

const islemAciklama = (i) => [i.tip, i.aciklama].filter((x) => x && String(x).trim()).join(" - ").trim() || (i.odeme ? "Ödeme" : "");

function esnafBolumu(ctx, e) {
  const b = ctx.belge, { satirlar, ozet } = esnafSatirlari(e, ctx.donem);
  b.paragraf(`Dönem: ${ctx.donem.etiket}`, { boyut: 10, kalin: true, renk: "#334155", sonrasi: 6 });
  b.tablo({
    boyut: 10, baslikArka: "#334155", zebra: ["#f0f9ff", "#f0f9ff"],
    sutunlar: [{ b: "İşlem Sayısı", a: 16 }, { b: "Toplam Borç (Faturalar)", a: 28 }, { b: "Toplam Ödeme", a: 28 }, { b: "Güncel Kalan Bakiye", a: 28 }],
    satirlar: [[String(ozet.adet), tl(ozet.borc), tl(ozet.odeme), { m: tl(Math.abs(ozet.kalan)), kalin: true, renk: kalanRenk(ozet.kalan) }]],
  });
  ibareKutusu(b, ozet.kalan, false);
  b.tablo({
    boyut: 8.5, baslikArka: "#334155", zebra: ["#f8fafc", "#eef2ff"], grid: "#e2e8f0",
    sutunlar: [{ b: "Tarih", a: 9 }, { b: "Plaka", a: 11 }, { b: "İşlem / Açıklama", a: 33, hiza: "sol" }, { b: "Parça", a: 11, hiza: "sag" }, { b: "İşçilik", a: 10, hiza: "sag" }, { b: "Toplam", a: 12, hiza: "sag" }, { b: "Kalan Bakiye", a: 14, hiza: "sag" }],
    satirlar: satirlar.map((i) => [
      gg(i.tarih), i.plaka || "-", islemAciklama(i),
      i.odeme ? "-" : tl(i.parca), i.odeme ? "-" : tl(i.iscilik),
      i.odeme ? { m: `+${tl(i.toplam)}`, renk: "#059669", kalin: true } : { m: tl(i.toplam), renk: "#dc2626" },
      i.bakiye > 0.005 ? { m: tl(i.bakiye), renk: "#dc2626" } : i.bakiye < -0.005 ? { m: `${tl(-i.bakiye)}\nalacak`, renk: "#059669" } : { m: tl(0), renk: "#64748b" },
    ]),
    toplam: [{ m: "", span: 2 }, "", { m: "Listelenen Faturaların Toplamı", hiza: "sol" }, tl(ozet.parca), tl(ozet.iscilik), { m: tl(ozet.borc), renk: "#dc2626" }, ""],
    toplamArka: "#e2e8f0",
  });
}

export function esnafPdf(ctx, e) {
  if (!esnafSatirlari(e, ctx.donem).satirlar.length) throw new Error(YOK);
  ctx.ust(ctx.firma ? `${ctx.firma} — ${e.isim}` : e.isim, { donem: false, firma: false });
  esnafBolumu(ctx, e);
}

export function esnaflarPdf(ctx, esnaflar) {
  const hepsi = esnaflar.map((e) => ({ e, ...esnafSatirlari(e, ctx.donem) })).filter((x) => x.satirlar.length);
  if (!hepsi.length) throw new Error(YOK);
  const b = ctx.belge;
  ctx.ust(ctx.firma ? `${ctx.firma} — Esnaf Raporu` : "Esnaf Raporu", { donem: false, firma: false });
  b.paragraf("Genel Özet — Tüm Esnaflar", { boyut: 14, kalin: true, sonrasi: 4 });
  b.paragraf(`Dönem: ${ctx.donem.etiket}`, { boyut: 10, kalin: true, renk: "#334155", sonrasi: 6 });
  const toplamKalan = toplamla(hepsi, (x) => x.ozet.kalan);
  ibareKutusu(b, toplamKalan, true);
  const sirali = [...hepsi].sort((a, c) => Math.abs(c.ozet.kalan) - Math.abs(a.ozet.kalan));
  b.tablo({
    boyut: 9, baslikArka: "#334155", zebra: ["#f8fafc", "#eef2ff"], grid: "#e2e8f0",
    sutunlar: [{ b: "Esnaf", a: 30, hiza: "sol" }, { b: "İşlem Sayısı", a: 10 }, { b: "Toplam Borç (Faturalar)", a: 18, hiza: "sag" }, { b: "Toplam Ödeme", a: 16, hiza: "sag" }, { b: "Güncel Kalan Bakiye", a: 14, hiza: "sag" }, { b: "Durum", a: 12 }],
    satirlar: sirali.map(({ e, ozet }) => [e.isim, String(ozet.adet), tl(ozet.borc), tl(ozet.odeme), { m: tl(Math.abs(ozet.kalan)), renk: kalanRenk(ozet.kalan), kalin: true },
      { m: ozet.kalan > 0.005 ? "Borçluyuz" : ozet.kalan < -0.005 ? "Alacaklıyız" : "Kapalı", renk: kalanRenk(ozet.kalan) }]),
    toplam: ["TOPLAM", String(toplamla(hepsi, (x) => x.ozet.adet)), tl(toplamla(hepsi, (x) => x.ozet.borc)), tl(toplamla(hepsi, (x) => x.ozet.odeme)), { m: tl(Math.abs(toplamKalan)), renk: kalanRenk(toplamKalan) }, ""],
    toplamArka: "#e2e8f0",
  });
  for (const { e } of hepsi) {
    b.yeniSayfa();
    ctx.ust(ctx.firma ? `${ctx.firma} — ${e.isim}` : e.isim, { donem: false, firma: false });
    esnafBolumu(ctx, e);
  }
}

function esnafSayfasi(ctx, e, ad) {
  const { satirlar, ozet } = esnafSatirlari(e, ctx.donem);
  const m = matris(), birlestir = [];
  let r = 1;
  if (ctx.firma) { m.koy(1, 1, { v: ctx.firma, b: true, boyut: 14, hiza: "orta" }); birlestir.push([1, 1, 1, 6]); r = 3; }
  m.koy(r, 1, { v: `Esnaf Adı: ${e.isim}`, b: true, boyut: 12 });
  r += 1;
  ["Tarih", "Plaka", "İşlem Tipi / Açıklama", "Parça", "İşçilik", "Toplam"].forEach((x, i) => m.koy(r, i + 1, { v: x, b: true, renk: "#ffffff", arka: "#334155", hiza: "orta", kenar: true }));
  const ilk = r + 1;
  satirlar.forEach((i, k) => {
    const y = ilk + k, sag = { kenar: true, fmt: "para", hiza: "sag" };
    m.koy(y, 1, { v: gg(i.tarih), kenar: true });
    m.koy(y, 2, { v: i.plaka || "-", kenar: true });
    m.koy(y, 3, { v: islemAciklama(i), kenar: true });
    m.koy(y, 4, i.odeme ? { v: "-", kenar: true, hiza: "sag" } : { v: i.parca, ...sag });
    m.koy(y, 5, i.odeme ? { v: "-", kenar: true, hiza: "sag" } : { v: i.iscilik, ...sag });
    m.koy(y, 6, { v: i.odeme ? -i.toplam : i.toplam, ...sag });
  });
  const son = ilk + satirlar.length - 1, rt = son + 1;
  m.koy(rt, 1, { v: "Genel Toplam:", b: true, hiza: "sag" });
  birlestir.push([rt, 1, rt, 3]);
  const net = ozet.borc - ozet.odeme;
  [["D", ozet.parca], ["E", ozet.iscilik], ["F", net]].forEach(([c, v], i) => m.koy(rt, 4 + i, { f: `SUM(${c}${ilk}:${c}${son})`, v, b: true, fmt: "para", hiza: "sag" }));
  const renk = ozet.kalan > 0.005 ? "#EF4444" : ozet.kalan < -0.005 ? "#10B981" : "#64748B";
  m.koy(rt + 2, 1, {
    v: ozet.kalan > 0.005 ? `Borçluyuz: ${tl(ozet.kalan)} (esnafa borcumuz)` : ozet.kalan < -0.005 ? `Alacaklıyız: ${tl(-ozet.kalan)} (esnaftan alacağımız)` : "Hesap kapalı: borç/alacak bulunmuyor",
    b: true, boyut: 12, renk, hiza: "sag",
  });
  birlestir.push([rt + 2, 1, rt + 2, 6]);
  return { ad, satirlar: m.satirlar(), birlestir, genislik: [15, 15, 40, 15, 15, 15] };
}

export function esnafXlsx(ctx, e) {
  if (!esnafSatirlari(e, ctx.donem).satirlar.length) throw new Error(YOK);
  return [esnafSayfasi(ctx, e, sayfaAdi(e.isim, new Set()))];
}

export function esnaflarXlsx(ctx, esnaflar) {
  const hepsi = esnaflar.map((e) => ({ e, ...esnafSatirlari(e, ctx.donem) })).filter((x) => x.satirlar.length);
  if (!hepsi.length) throw new Error(YOK);
  const kullanilan = new Set(["genel özet"]);
  const m = matris();
  ["Esnaf", "İşlem Sayısı", "Toplam Borç (Faturalar)", "Toplam Ödeme", "Güncel Kalan Bakiye", "Durum"].forEach((x, i) => m.koy(1, i + 1, { v: x, b: true, renk: "#ffffff", arka: "#334155", hiza: "orta", kenar: true }));
  [...hepsi].sort((a, c) => Math.abs(c.ozet.kalan) - Math.abs(a.ozet.kalan)).forEach(({ e, ozet }, k) => {
    const y = 2 + k;
    m.koy(y, 1, { v: e.isim, kenar: true });
    m.koy(y, 2, { v: ozet.adet, kenar: true, hiza: "orta" });
    m.koy(y, 3, { v: ozet.borc, kenar: true, fmt: "para" });
    m.koy(y, 4, { v: ozet.odeme, kenar: true, fmt: "para" });
    m.koy(y, 5, { v: Math.abs(ozet.kalan), kenar: true, fmt: "para", b: true, renk: kalanRenk(ozet.kalan) });
    m.koy(y, 6, { v: ozet.kalan > 0.005 ? "Borçluyuz" : ozet.kalan < -0.005 ? "Alacaklıyız" : "Kapalı", kenar: true, renk: kalanRenk(ozet.kalan) });
  });
  const kalan = toplamla(hepsi, (x) => x.ozet.kalan), rt = 2 + hepsi.length;
  m.koy(rt, 1, { v: "TOPLAM", b: true, arka: "#e2e8f0", kenar: true });
  [[2, toplamla(hepsi, (x) => x.ozet.adet), "sayi"], [3, toplamla(hepsi, (x) => x.ozet.borc), "para"], [4, toplamla(hepsi, (x) => x.ozet.odeme), "para"], [5, Math.abs(kalan), "para"]]
    .forEach(([c, v, f]) => m.koy(rt, c, { v, b: true, arka: "#e2e8f0", kenar: true, fmt: f }));
  const s1 = m.satirlar();
  return [
    { ad: "Genel Özet", satirlar: s1, genislik: genislikler(s1, { alt: 14 }), dondur: 1 },
    ...hepsi.map(({ e }) => esnafSayfasi(ctx, e, sayfaAdi(e.isim, kullanilan))),
  ];
}

// ════════════════════════════ AKARYAKIT (PETROL HESAP EKSTRESİ) ════════════════════════════
const istasyonAdi = (r) => (r.istasyon || "").trim() || "Belirtilmemiş";

function petrolHazirla(ctx, kayitlar, istasyon) {
  const tum = kayitlar.filter((r) => !istasyon || istasyonAdi(r) === istasyon);
  const bitis = bitisTarihi(ctx.donem);
  const donemde = tum.filter((r) => ctx.donem.icinde(r.tarih));
  if (!donemde.length) throw new Error(YOK);
  const gruplar = new Map();
  for (const r of donemde) { const k = istasyonAdi(r); (gruplar.get(k) || gruplar.set(k, []).get(k)).push(r); }
  return [...gruplar.keys()].sort(sirala).map((ad) => {
    const kayit = gruplar.get(ad).sort((a, c) => tarihSirasi(a, c) || sirala(a.fis, c.fis));
    const gecmis = tum.filter((r) => istasyonAdi(r) === ad && (!bitis || (r.tarih && r.tarih <= bitis)));
    return {
      ad, borclar: kayit.filter((r) => !r.odeme), odemeler: kayit.filter((r) => r.odeme),
      bakiye: toplamla(gecmis.filter((r) => !r.odeme), (r) => r.tutar) - toplamla(gecmis.filter((r) => r.odeme), (r) => r.tutar),
      ilk: kayit[0].tarih, son: kayit[kayit.length - 1].tarih,
    };
  });
}

export function petrolPdf(ctx, kayitlar, { istasyon = "" } = {}) {
  const b = ctx.belge, istasyonlar = petrolHazirla(ctx, kayitlar, istasyon);
  istasyonlar.forEach((s, idx) => {
    if (idx) b.yeniSayfa();
    ctx.ust(istasyonlar.length > 1 || istasyon ? `${s.ad.toLocaleUpperCase("tr")} Hesap Ekstresi` : "Akaryakıt Hesap Ekstresi", { donem: false, firma: false });
    b.paragraf(`${gg(s.ilk)} - ${gg(s.son)}`, { boyut: 10, renk: "#64748b", sonrasi: 6 });
    const litreli = s.borclar.some((r) => r.litre > 0);
    const plakalar = new Map();
    for (const r of s.borclar) { const k = r.plaka || "-"; (plakalar.get(k) || plakalar.set(k, []).get(k)).push(r); }
    const satirlar = [];
    for (const k of [...plakalar.keys()].sort(sirala)) {
      const grup = plakalar.get(k);
      grup.forEach((r, i) => {
        const son = i === grup.length - 1, kal = son ? { altKalin: true } : {};
        const toplamHucre = { m: son ? tl(toplamla(grup, (x) => x.tutar)) : "", kalin: son, ...kal };
        const ortak = [{ m: gg(r.tarih), ...kal }, { m: r.fis || "-", ...kal }, { m: r.plaka || "-", ...kal }];
        satirlar.push(litreli
          ? [...ortak, { m: r.litre > 0 ? sayiTr(r.litre) : "-", ...kal }, { m: r.fiyat > 0 ? tl(r.fiyat) : "-", ...kal }, { m: tl(r.tutar), ...kal }, toplamHucre]
          : [...ortak, { m: tl(r.tutar), ...kal }, toplamHucre]);
      });
    }
    b.tablo({
      boyut: 8, baslikArka: "#334155", grid: "#d3d3d3",
      sutunlar: litreli
        ? [{ b: "TARİH", g: 22 }, { b: "FİŞ NO", g: 36 }, { b: "PLAKA", g: 36 }, { b: "MİKTAR", g: 18, hiza: "sag" }, { b: "FİYAT", g: 27, hiza: "sag" }, { b: "BORÇ", g: 20, hiza: "sag" }, { b: "TOPLAM", g: 25, hiza: "sag" }]
        : [{ b: "TARİH", g: 22 }, { b: "FİŞ NO", g: 50 }, { b: "PLAKA / AÇIKLAMA", g: 66 }, { b: "BORÇ", g: 25, hiza: "sag" }, { b: "TOPLAM", g: 25, hiza: "sag" }],
      satirlar,
    });
    const yesil = (m, hiza, boyut = 11) => ({ m, arka: "#10b981", renk: "#ffffff", kalin: true, boyut, hiza, kenarRenk: "#10b981" });
    if (s.odemeler.length) {
      b.tablo({
        baslikYok: true, genislikMm: 182, hizala: "sol", grid: "#10b981", sutunlar: [{ b: "", g: 143 }, { b: "", g: 45 }],
        satirlar: s.odemeler.map((o) => [yesil(`${gg(o.tarih)} NAKİT / EFT / ÇEK ÖDEME`, "sol"), yesil(`+${tl(o.tutar)}`, "orta")]),
      });
    }
    const kirmizi = (m, hiza) => ({ m, arka: "#ef4444", renk: "#ffffff", kalin: true, boyut: 11, hiza, kenarRenk: "#ef4444" });
    b.tablo({
      baslikYok: true, genislikMm: 182, hizala: "sol", grid: "#ef4444", sutunlar: [{ b: "", g: 143 }, { b: "", g: 45 }],
      satirlar: [[kirmizi(istasyonlar.length > 1 ? `${s.ad.toLocaleUpperCase("tr")} GÜNCEL BORÇ BAKİYESİ:` : "SON GÜNCEL BORÇ BAKİYESİ:", "sag"), kirmizi(tl(s.bakiye), "orta")]],
    });
  });
}

export function petrolXlsx(ctx, kayitlar, { istasyon = "" } = {}) {
  const istasyonlar = petrolHazirla(ctx, kayitlar, istasyon);
  const m = matris();
  ["Tarih", "İstasyon", "Plaka", "Fiş No", "Litre", "Birim Fiyat", "Tutar", "Tür"].forEach((x, i) => m.koy(1, i + 1, { v: x, b: true, renk: "#ffffff", arka: "#334155", hiza: "orta", kenar: true }));
  let r = 2, borc = 0, odeme = 0;
  for (const s of istasyonlar) {
    for (const k of [...s.borclar, ...s.odemeler].sort(tarihSirasi)) {
      const o = Boolean(k.odeme);
      if (o) odeme += k.tutar; else borc += k.tutar;
      [{ v: gg(k.tarih) }, { v: s.ad }, { v: k.plaka || "-" }, { v: k.fis || "-" }, { v: k.litre || "", fmt: "para", hiza: "sag" }, { v: k.fiyat || "", fmt: "para", hiza: "sag" },
        { v: o ? -k.tutar : k.tutar, fmt: "para", hiza: "sag", ...(o ? { renk: "#059669" } : {}) }, { v: o ? "Ödeme" : "Borç" }]
        .forEach((h, c) => m.koy(r, c + 1, { kenar: true, ...h }));
      r++;
    }
  }
  const alt = [["TOPLAM BORÇ", borc], ["TOPLAM ÖDEME", odeme], ["GÜNCEL BORÇ BAKİYESİ", borc - odeme]];
  alt.forEach(([ad, v], i) => { m.koy(r + i, 6, { v: ad, b: true, hiza: "sag" }); m.koy(r + i, 7, { v, b: true, fmt: "para", arka: "#e2e8f0" }); });
  const s1 = m.satirlar();
  return [{ ad: "Akaryakıt", satirlar: s1, genislik: genislikler(s1, { alt: 12 }), dondur: 1 }];
}
