// Genel Durum Raporu (masaüstündeki "genel_durum_raporu_pdf" kitapçığının mobil karşılığı): kapak, finansal özet, faturalar, araç filosu,
// araç işlemleri, iç hizmet, okul/servis tahsilat. Grafikler vektör olarak çizilir.
import { ayAnahtari, ayEkle } from "./bicim.js";
import { tl, sayiTr, gg, ggSaat } from "./cikti_yardim.js";

const mm = (v) => v * 72 / 25.4;
const DETAY_SINIRI = 60;
const RENK = { finans: "#0ea5e9", fatura: "#6366f1", filo: "#14b8a6", islem: "#f59e0b", ic: "#ec4899", okul: "#22c55e", gelir: "#16a34a", gider: "#dc2626", mavi: "#1e3a8a" };
const kisalt = (m, n) => { const s = String(m ?? ""); return s.length <= n ? s : s.slice(0, n - 1) + "…"; };
const kisaSayi = (v) => (v >= 1e6 ? `${sayiTr(v / 1e6, 1)} M` : v >= 1e3 ? `${sayiTr(v / 1e3, 0)} B` : sayiTr(v, 0));

// ── Veri toplama ────────────────────────────────────────────────────────────────────────────────────
export function genelVeri({ faturalar, akaryakit, esnaflar, icHizmet, okul, araclar }, donem) {
  const icinde = (t) => Boolean(t) && donem.icinde(t);
  const aylik = new Map();
  const ay = (t) => { const k = ayAnahtari(t); return aylik.get(k) || aylik.set(k, { gelir: 0, gider: 0 }).get(k); };

  const fat = { gelir: 0, gider: 0, giden: 0, gelen: 0, detay: [] };
  for (const f of faturalar) {
    if (!icinde(f.tarih)) continue;
    if (f.giden) { fat.gelir += f.toplam; fat.giden += 1; ay(f.tarih).gelir += f.toplam; } else { fat.gider += f.toplam; fat.gelen += 1; ay(f.tarih).gider += f.toplam; }
    fat.detay.push(f);
  }
  fat.detay.sort((a, b) => b.tarih - a.tarih);

  const akar = { gider: 0, adet: 0, detay: [] };
  for (const r of akaryakit) {
    if (r.odeme || !icinde(r.tarih)) continue;
    akar.gider += r.tutar; akar.adet += 1; ay(r.tarih).gider += r.tutar; akar.detay.push(r);
  }

  const esn = { gider: 0, adet: 0, ozet: new Map() };
  for (const e of esnaflar) {
    for (const i of e.islemler) {
      if (i.odeme || !icinde(i.tarih)) continue;
      esn.gider += i.toplam; esn.adet += 1; ay(i.tarih).gider += i.toplam;
      const o = esn.ozet.get(e.isim || "Belirtilmemiş") || esn.ozet.set(e.isim || "Belirtilmemiş", { adet: 0, toplam: 0 }).get(e.isim || "Belirtilmemiş");
      o.adet += 1; o.toplam += i.toplam;
    }
  }

  const ic = { gelir: 0, adet: 0, detay: [] };
  for (const s of icHizmet) {
    if (!icinde(s.tarih)) continue;
    ic.gelir += s.tutar; ic.adet += 1; ay(s.tarih).gelir += s.tutar; ic.detay.push(s);
  }

  const ok = { n: okul.length, tam: 0, kismi: 0, hic: 0, tahsil: 0, kalan: 0, nakit: 0, iban: 0, kart: 0 };
  for (const o of okul) {
    if (o.durum === "odendi") ok.tam += 1; else if (o.durum === "kismi") ok.kismi += 1; else ok.hic += 1;
    ok.kalan += o.kalan;
    for (const g of o.odemeler) {
      if (!icinde(g.tarih)) continue;
      ok.tahsil += g.tutar;
      ok[g.yontem === "iban" ? "iban" : g.yontem === "kart" ? "kart" : "nakit"] += g.tutar;
      ay(g.tarih).gelir += g.tutar;
    }
  }

  const firmalar = new Map();
  const belge = { gecen: 0, yaklasan: 0, acil: [] };
  for (const a of araclar) {
    const ad = a.firma || "Belirtilmemiş", k = ad.toLocaleLowerCase("tr");
    (firmalar.get(k) || firmalar.set(k, { ad, adet: 0 }).get(k)).adet += 1;
    for (const b of a.belgeler) {
      if (b.gun < 0) { belge.gecen += 1; belge.acil.push({ plaka: a.plaka, ad: b.ad, son: b.son, gun: b.gun }); }
      else if (b.gun <= 30) { belge.yaklasan += 1; if (b.gun <= 7) belge.acil.push({ plaka: a.plaka, ad: b.ad, son: b.son, gun: b.gun }); }
    }
  }
  belge.acil.sort((x, y) => x.gun - y.gun);

  // Aylık seri: seçili ay ya da verideki ilk-son ay arası (en çok son 24 ay).
  const anahtarlar = [...aylik.keys()].sort();
  let seri = [];
  if (anahtarlar.length) {
    const ilk = donem.ay || anahtarlar[0], son = donem.ay || anahtarlar[anahtarlar.length - 1];
    for (let k = ilk; k <= son; k = ayEkle(k, 1)) { const v = aylik.get(k) || { gelir: 0, gider: 0 }; seri.push({ etiket: `${k.slice(5)}.${k.slice(2, 4)}`, tam: `${k.slice(5)}.${k.slice(0, 4)}`, ...v }); }
    seri = seri.slice(-24);
  }

  const topGelir = fat.gelir + ic.gelir + ok.tahsil, topGider = fat.gider + akar.gider + esn.gider;
  return { fat, akar, esn, ic, ok, firmalar: [...firmalar.values()].sort((a, b) => b.adet - a.adet), belge, seri, araclar, topGelir, topGider, net: topGelir - topGider };
}

// ── Çizim parçaları ─────────────────────────────────────────────────────────────────────────────────
function bolum(b, no, baslik, alt, renk, gerekenMm = 60) {
  b.kosulluSayfaSonu(gerekenMm);
  const y = b.y, x = b.kenar;
  b.dikdortgen(x, y, mm(9), mm(9), { dolgu: renk });
  b.metin(x, y + mm(6.2), String(no), { boyut: 13, kalin: true, renk: "#ffffff", hiza: "orta", genislik: mm(9) });
  b.metin(x + mm(12), y + mm(4.6), baslik, { boyut: 13, kalin: true, renk: "#0f172a" });
  if (alt) b.metin(x + mm(12), y + mm(8.4), alt, { boyut: 8, renk: "#94a3b8" });
  b.cizgi(x, y + mm(10.5), x + b.genislik, y + mm(10.5), renk, 1.2);
  b.y = y + mm(14);
}

function altBaslik(b, metin, renk, gerekenMm = 40) {
  b.kosulluSayfaSonu(gerekenMm);
  b.paragraf(metin, { boyut: 11, kalin: true, renk, sonrasi: 4 });
}

function tablo(b, sutunlar, satirlar, renk, { toplam = null, genislikMm = 182 } = {}) {
  b.tablo({ sutunlar, satirlar, baslikArka: renk, boyut: 9, genislikMm, toplam, ortala: false, zebra: ["#ffffff", "#f8fafc"] });
}

function netKutu(b, net) {
  b.kosulluSayfaSonu(22);
  const renk = net >= 0 ? RENK.gelir : RENK.gider, y = b.y, w = b.genislik;
  b.dikdortgen(b.kenar, y, w, mm(15), { dolgu: renk });
  b.metin(b.kenar + mm(4), y + mm(6.2), net >= 0 ? "NET KÂR" : "NET ZARAR", { boyut: 12, kalin: true, renk: "#ffffff" });
  b.metin(b.kenar + mm(4), y + mm(11.4), "Toplam Gelir − Toplam Gider", { boyut: 7, renk: "#e0f2fe" });
  b.metin(b.kenar, y + mm(9.8), tl(net), { boyut: 16, kalin: true, renk: "#ffffff", hiza: "sag", genislik: w - mm(4) });
  b.y = y + mm(19);
}

function kpiKutu(b, x, y, baslik, deger, renk, zemin) {
  const w = mm(88), h = mm(22);
  b.dikdortgen(x, y, w, h, { dolgu: zemin, cizgi: renk, kalinlik: 1 });
  b.metin(x, y + mm(7), baslik.toLocaleUpperCase("tr"), { boyut: 9, kalin: true, renk, hiza: "orta", genislik: w });
  b.metin(x, y + mm(16), deger, { boyut: 16, kalin: true, renk: "#0f172a", hiza: "orta", genislik: w });
}

function trendGrafigi(b, seri) {
  const Hh = mm(58), sol = mm(18), W = b.genislik;
  b.kosulluSayfaSonu(58 + 22);
  const y0 = b.y + mm(6);
  b.dikdortgen(b.kenar + sol, b.y, mm(3), mm(3), { dolgu: RENK.gelir });
  b.metin(b.kenar + sol + mm(4.5), b.y + mm(2.6), "Gelir", { boyut: 8, renk: "#334155" });
  b.dikdortgen(b.kenar + sol + mm(20), b.y, mm(3), mm(3), { dolgu: RENK.gider });
  b.metin(b.kenar + sol + mm(24.5), b.y + mm(2.6), "Gider", { boyut: 8, renk: "#334155" });
  const maks = Math.max(1, ...seri.flatMap((s) => [s.gelir, s.gider]));
  for (let i = 0; i <= 4; i++) {
    const gy = y0 + Hh * (1 - i / 4);
    b.cizgi(b.kenar + sol, gy, b.kenar + W, gy, "#e2e8f0", 0.5);
    b.metin(b.kenar, gy + 2.5, kisaSayi(maks * i / 4), { boyut: 7, renk: "#64748b", hiza: "sag", genislik: sol - mm(2) });
  }
  const grup = (W - sol) / seri.length, cw = Math.min(mm(6), grup * 0.36);
  seri.forEach((s, i) => {
    const gx = b.kenar + sol + grup * i + grup / 2;
    [[s.gelir, RENK.gelir, -cw], [s.gider, RENK.gider, 0]].forEach(([deger, renk, ofs]) => {
      const yuk = Hh * deger / maks;
      if (yuk >= 0.3) b.dikdortgen(gx + ofs, y0 + Hh - yuk, cw, yuk, { dolgu: renk });
    });
    b.metin(gx - grup / 2, y0 + Hh + mm(4.2), s.etiket, { boyut: seri.length > 14 ? 6 : 7, renk: "#475569", hiza: "orta", genislik: grup });
  });
  b.y = y0 + Hh + mm(9);
}

function yatayCubuk(b, ogeler, renk, para = false) {
  const etW = mm(62), degW = mm(32), barW = b.genislik - etW - degW, maks = Math.max(1, ...ogeler.map((o) => o.deger));
  for (const o of ogeler) {
    b.kosulluSayfaSonu(8);
    const y = b.y, bw = Math.max(mm(0.6), barW * o.deger / maks);
    b.metin(b.kenar, y + mm(4.6), b.satirlaraBol(o.ad, 8.5, false, etW - mm(2))[0], { boyut: 8.5, renk: "#334155" });
    b.dikdortgen(b.kenar + etW, y + mm(0.8), bw, mm(5), { dolgu: renk });
    b.metin(b.kenar + etW + bw + mm(1.5), y + mm(4.6), para ? tl(o.deger, 0) : String(o.deger), { boyut: 8.5, kalin: true, renk: "#0f172a" });
    b.y += mm(7);
  }
  b.y += mm(3);
}

function pasta(b, ogeler, { x, y, r = mm(20), genislik = mm(88) }) {
  const toplam = ogeler.reduce((t, o) => t + o.deger, 0);
  if (!(toplam > 0)) { b.metin(x, y + mm(10), "Veri yok", { boyut: 9, renk: "#94a3b8" }); return; }
  const cx = x + r, cy = y + r;
  let a = 0;
  for (const o of ogeler) {
    if (!(o.deger > 0)) continue;
    const b1 = a + 2 * Math.PI * o.deger / toplam;
    b.dilim(cx, cy, r, a, Math.min(b1, 2 * Math.PI), o.renk);
    a = b1;
  }
  let ly = y + mm(2);
  for (const o of ogeler) {
    b.dikdortgen(x + 2 * r + mm(5), ly, mm(3), mm(3), { dolgu: o.renk });
    b.metin(x + 2 * r + mm(9.5), ly + mm(2.6), `${o.ad}  %${sayiTr(100 * o.deger / toplam, 1)}`, { boyut: 8, kalin: true, renk: "#334155" });
    b.metin(x + 2 * r + mm(9.5), ly + mm(6.4), o.para ? tl(o.deger) : String(o.deger), { boyut: 8, renk: "#64748b" });
    ly += mm(10.5);
  }
}

function ikiPasta(b, sol, sag) {
  const yuk = mm(60);
  b.kosulluSayfaSonu(66);
  const y = b.y;
  b.metin(b.kenar, y + mm(3), sol.baslik, { boyut: 10, kalin: true, renk: RENK.okul });
  b.metin(b.kenar + mm(94), y + mm(3), sag.baslik, { boyut: 10, kalin: true, renk: RENK.okul });
  pasta(b, sol.ogeler, { x: b.kenar, y: y + mm(8) });
  pasta(b, sag.ogeler, { x: b.kenar + mm(94), y: y + mm(8) });
  b.y = y + yuk;
}

// ── Rapor ───────────────────────────────────────────────────────────────────────────────────────────
export function genelDurumPdf(ctx, v) {
  const b = ctx.belge;

  // Kapak
  b.bosluk(mm(14));
  if (ctx.logo) {
    const oran = Math.min(mm(90) / ctx.logo.g, mm(50) / ctx.logo.y), w = ctx.logo.g * oran, h = ctx.logo.y * oran;
    b.resim(ctx.logo, b.kenar + (b.genislik - w) / 2, b.y, w, h);
    b.bosluk(h + mm(8));
  }
  b.dikdortgen(b.kenar, b.y, b.genislik, mm(24), { dolgu: RENK.mavi });
  b.metin(b.kenar, b.y + mm(15), "GENEL DURUM RAPORU", { boyut: 24, kalin: true, renk: "#ffffff", hiza: "orta", genislik: b.genislik });
  b.bosluk(mm(32));
  if (ctx.firma) { b.metin(b.kenar, b.y, ctx.firma, { boyut: 17, kalin: true, renk: "#0f172a", hiza: "orta", genislik: b.genislik }); b.bosluk(mm(9)); }
  const donemMetni = `Rapor Dönemi:  ${ctx.donem.etiket}` + (v.seri.length ? `  (${v.seri[0].tam}  -  ${v.seri[v.seri.length - 1].tam})` : "");
  const rw = mm(150);
  b.dikdortgen(b.kenar + (b.genislik - rw) / 2, b.y, rw, mm(11), { dolgu: "#eff6ff", cizgi: "#93c5fd", kalinlik: 1 });
  b.metin(b.kenar, b.y + mm(7.2), donemMetni, { boyut: 11.5, kalin: true, renk: RENK.mavi, hiza: "orta", genislik: b.genislik });
  b.bosluk(mm(16));
  b.metin(b.kenar, b.y, `Oluşturma Tarihi: ${ggSaat(new Date())}`, { boyut: 10, renk: "#64748b", hiza: "orta", genislik: b.genislik });
  b.bosluk(mm(12));

  const net = v.net, netRenk = net >= 0 ? RENK.gelir : RENK.gider;
  const y1 = b.y, x0 = b.kenar + mm(3), x1 = b.kenar + mm(93);
  kpiKutu(b, x0, y1, "Toplam Gelir", tl(v.topGelir), RENK.gelir, "#f0fdf4");
  kpiKutu(b, x1, y1, "Toplam Gider", tl(v.topGider), RENK.gider, "#fef2f2");
  kpiKutu(b, x0, y1 + mm(26), net >= 0 ? "Net Kâr" : "Net Zarar", tl(net), netRenk, "#eff6ff");
  kpiKutu(b, x1, y1 + mm(26), "Toplam Araç", `${v.araclar.length} araç`, "#7c3aed", "#faf5ff");
  b.bosluk(mm(58));

  b.metin(b.kenar, b.y, "Rapor Kapsamı", { boyut: 12, kalin: true, renk: RENK.mavi, hiza: "orta", genislik: b.genislik });
  b.bosluk(mm(4));
  const kapsam = (e, d) => [{ m: e, kalin: true, renk: "#475569", arka: "#f8fafc" }, { m: d, arka: "#f8fafc" }];
  b.tablo({
    sutunlar: [{ b: "", g: 45 }, { b: "", g: 45 }, { b: "", g: 45 }, { b: "", g: 45 }], baslikYok: true, boyut: 10, genislikMm: 180, hizala: "orta",
    satirlar: [
      [...kapsam("Faturalar", `${v.fat.giden + v.fat.gelen} adet`), ...kapsam("Akaryakıt", `${v.akar.adet} adet`)],
      [...kapsam("Esnaf/Bakım", `${v.esn.adet} adet`), ...kapsam("İç Hizmet", `${v.ic.adet} sefer`)],
      [...kapsam("Okul/Servis", `${v.ok.n} öğrenci`), ...kapsam("Belge Uyarısı", `${v.belge.gecen + v.belge.yaklasan} adet`)],
    ],
  });

  // 1) Finansal özet
  b.yeniSayfa();
  bolum(b, 1, "Finansal Özet", "Gelir / gider kaynak dağılımı", RENK.finans, 110);
  tablo(b, [{ b: "Kaynak", g: 70 }, { b: "Gelir", g: 56, hiza: "sag" }, { b: "Gider", g: 56, hiza: "sag" }], [
    ["Faturalar", tl(v.fat.gelir), tl(v.fat.gider)],
    ["Akaryakıt", "-", tl(v.akar.gider)],
    ["Esnaf/Bakım", "-", tl(v.esn.gider)],
    ["İç Hizmet", tl(v.ic.gelir), "-"],
    ["Okul/Servis Tahsilat", tl(v.ok.tahsil), "-"],
  ], RENK.finans, { toplam: ["TOPLAM", tl(v.topGelir), tl(v.topGider)] });
  netKutu(b, net);
  if (v.seri.length) {
    b.bosluk(mm(3));
    altBaslik(b, `Aylık Gelir / Gider Trendi (${ctx.donem.etiket})`, "#334155", 92);
    trendGrafigi(b, v.seri);
  }
  b.bosluk(mm(3));
  altBaslik(b, "Gider Dağılımı", "#334155", 66);
  pasta(b, [
    { ad: "Faturalar", deger: v.fat.gider, renk: "#6366f1", para: true },
    { ad: "Akaryakıt", deger: v.akar.gider, renk: "#f59e0b", para: true },
    { ad: "Esnaf/Bakım", deger: v.esn.gider, renk: "#14b8a6", para: true },
  ], { x: b.kenar, y: b.y });
  b.bosluk(mm(46));

  // 2) Faturalar
  b.yeniSayfa();
  bolum(b, 2, "Faturalar", "Giden / gelen fatura özeti", RENK.fatura);
  tablo(b, [{ b: "Tür", g: 100 }, { b: "Adet", g: 30, hiza: "sag" }, { b: "Tutar", g: 52, hiza: "sag" }], [
    ["Giden Fatura (Gelir)", String(v.fat.giden), tl(v.fat.gelir)],
    ["Gelen Fatura (Gider)", String(v.fat.gelen), tl(v.fat.gider)],
  ], RENK.fatura, { toplam: ["TOPLAM", String(v.fat.giden + v.fat.gelen), tl(v.fat.gelir + v.fat.gider)] });
  if (v.fat.detay.length) {
    const n = v.fat.detay.length, lim = Math.min(n, DETAY_SINIRI);
    altBaslik(b, `Son Faturalar${n > lim ? ` — son ${lim} / ${n}` : ` (${n})`}`, RENK.fatura);
    tablo(b, [{ b: "Tarih", g: 26 }, { b: "Tür", g: 46 }, { b: "Cari / Müşteri", g: 66 }, { b: "Tutar", g: 44, hiza: "sag" }],
      v.fat.detay.slice(0, lim).map((f) => [gg(f.tarih), f.giden ? "Giden Fatura (Gelir)" : "Gelen Fatura (Gider)", kisalt(f.firma || "-", 34), tl(f.toplam)]), RENK.fatura);
  }

  // 3) Araç filosu
  b.bosluk(mm(4));
  bolum(b, 3, "Araç Filosu", "Filo dağılımı ve belge durumu", RENK.filo, 90);
  b.paragraf(`Toplam Araç: ${v.araclar.length}   •   Firma: ${v.firmalar.length}`, { boyut: 9.5, renk: "#334155", sonrasi: 2 });
  b.paragraf(`${v.belge.gecen} belge süresi geçmiş   •   ${v.belge.yaklasan} belge 30 gün içinde dolacak`, { boyut: 9.5, renk: "#b45309", sonrasi: 6 });
  if (v.firmalar.length) {
    altBaslik(b, "Firma Bazında Araç Dağılımı", RENK.filo, 40);
    yatayCubuk(b, v.firmalar.slice(0, 8).map((f) => ({ ad: f.ad, deger: f.adet })), "#3b82f6");
  }
  if (v.araclar.length) {
    const n = v.araclar.length, lim = Math.min(n, DETAY_SINIRI);
    const sirali = [...v.araclar].sort((x, y) => String(x.firma).localeCompare(String(y.firma), "tr") || String(x.plaka).localeCompare(String(y.plaka), "tr"));
    altBaslik(b, `Araç Listesi${n > lim ? ` — ilk ${lim} / ${n}` : ` (${n})`}`, RENK.filo);
    tablo(b, [{ b: "Plaka", g: 30 }, { b: "Firma", g: 50 }, { b: "Marka / Model", g: 50 }, { b: "Şoför", g: 52 }],
      sirali.slice(0, lim).map((a) => [a.plaka || "-", kisalt(a.firma || "-", 24), kisalt(`${a.marka} ${a.model}`.trim() || "-", 22), kisalt(a.sofor || "-", 24)]), RENK.filo);
  }
  if (v.belge.acil.length) {
    const n = v.belge.acil.length, lim = Math.min(n, DETAY_SINIRI);
    altBaslik(b, `Acil Belgeler (Geçmiş / 7 gün içinde)${n > lim ? ` — ilk ${lim} / ${n}` : ` (${n})`}`, RENK.filo);
    tablo(b, [{ b: "Plaka", g: 42 }, { b: "Belge", g: 56 }, { b: "Tarih", g: 42 }, { b: "Durum", g: 42, hiza: "sag" }],
      v.belge.acil.slice(0, lim).map((a) => [a.plaka, a.ad, gg(a.son), a.gun < 0 ? { m: `GEÇTİ (${-a.gun} gün)`, renk: RENK.gider, kalin: true } : `${a.gun} gün`]), RENK.filo);
  }

  // 4) Araç işlemleri
  b.yeniSayfa();
  bolum(b, 4, "Araç İşlemleri", "Akaryakıt ve esnaf/bakım giderleri", RENK.islem);
  tablo(b, [{ b: "İşlem Türü", g: 100 }, { b: "Adet", g: 30, hiza: "sag" }, { b: "Tutar", g: 52, hiza: "sag" }], [
    ["Akaryakıt", String(v.akar.adet), tl(v.akar.gider)],
    ["Esnaf/Bakım", String(v.esn.adet), tl(v.esn.gider)],
  ], RENK.islem, { toplam: ["TOPLAM", String(v.akar.adet + v.esn.adet), tl(v.akar.gider + v.esn.gider)] });
  const esnaflar = [...v.esn.ozet.entries()].sort((x, y) => y[1].toplam - x[1].toplam);
  if (esnaflar.length) {
    altBaslik(b, "En Çok Harcama Yapılan Esnaf / Servisler", RENK.islem, 40);
    yatayCubuk(b, esnaflar.slice(0, 8).map(([ad, o]) => ({ ad, deger: o.toplam })), RENK.islem, true);
    const lim = Math.min(esnaflar.length, DETAY_SINIRI);
    altBaslik(b, `Esnaf / Bakım Dökümü${esnaflar.length > lim ? ` — ilk ${lim} / ${esnaflar.length}` : ` (${esnaflar.length})`}`, RENK.islem);
    tablo(b, [{ b: "Esnaf / Servis", g: 102 }, { b: "İşlem", g: 30, hiza: "sag" }, { b: "Tutar", g: 50, hiza: "sag" }],
      esnaflar.slice(0, lim).map(([ad, o]) => [kisalt(ad, 44), String(o.adet), tl(o.toplam)]), RENK.islem, { toplam: ["TOPLAM", String(v.esn.adet), tl(v.esn.gider)] });
  }
  if (v.akar.detay.length) {
    const n = v.akar.detay.length, lim = Math.min(n, DETAY_SINIRI);
    altBaslik(b, `Akaryakıt Detayı${n > lim ? ` — son ${lim} / ${n}` : ` (${n})`}`, RENK.islem);
    tablo(b, [{ b: "Tarih", g: 26 }, { b: "Plaka", g: 34 }, { b: "Litre / Miktar", g: 30, hiza: "sag" }, { b: "İstasyon", g: 52 }, { b: "Tutar", g: 40, hiza: "sag" }],
      v.akar.detay.slice(0, lim).map((r) => [gg(r.tarih), r.plaka || "-", r.litre ? `${sayiTr(r.litre, 2)} L` : "-", kisalt(r.istasyon || "-", 24), tl(r.tutar)]), RENK.islem);
  }

  // 5) İç hizmet
  b.bosluk(mm(4));
  bolum(b, 5, "İç Hizmet", "Kurum içi sefer ve kazançlar", RENK.ic, 60);
  tablo(b, [{ b: "Metrik", g: 112 }, { b: "Değer", g: 70, hiza: "sag" }], [
    ["Toplam Sefer", String(v.ic.adet)],
    ["Toplam Kazanç", tl(v.ic.gelir)],
  ], RENK.ic);
  if (v.ic.detay.length) {
    const n = v.ic.detay.length, lim = Math.min(n, DETAY_SINIRI);
    altBaslik(b, `İç Hizmet Detayı${n > lim ? ` — son ${lim} / ${n}` : ` (${n})`}`, RENK.ic);
    tablo(b, [{ b: "Tarih", g: 30 }, { b: "Açıklama", g: 102 }, { b: "Tutar", g: 50, hiza: "sag" }],
      v.ic.detay.slice(0, lim).map((s) => [gg(s.tarih), kisalt(s.aciklama || s.guzergah || s.plaka || s.sofor || "-", 60), tl(s.tutar)]), RENK.ic);
  }

  // 6) Okul / servis tahsilat
  b.yeniSayfa();
  bolum(b, 6, "Okul / Servis Tahsilat", "Servis öğrencisi ödeme ve tahsilat durumu", RENK.okul);
  tablo(b, [{ b: "Metrik", g: 112 }, { b: "Değer", g: 70, hiza: "sag" }], [
    ["Servis Öğrencisi", String(v.ok.n)],
    ["Tam Ödeyen", String(v.ok.tam)],
    ["Kısmi Ödeyen", String(v.ok.kismi)],
    ["Hiç Ödemeyen", String(v.ok.hic)],
    ["Tahsil Edilen", tl(v.ok.tahsil)],
    ["Kalan Alacak", tl(v.ok.kalan)],
    ["Nakit", tl(v.ok.nakit)],
    ["IBAN / Havale", tl(v.ok.iban)],
    ["Kredi Kartı", tl(v.ok.kart)],
  ], RENK.okul);
  ikiPasta(b,
    { baslik: "Ödeme Durumu", ogeler: [{ ad: "Tam Ödeyen", deger: v.ok.tam, renk: "#22c55e" }, { ad: "Kısmi Ödeyen", deger: v.ok.kismi, renk: "#f59e0b" }, { ad: "Hiç Ödemeyen", deger: v.ok.hic, renk: "#ef4444" }] },
    { baslik: "Tahsilat Yöntemi", ogeler: [{ ad: "Nakit", deger: v.ok.nakit, renk: "#16a34a", para: true }, { ad: "IBAN / Havale", deger: v.ok.iban, renk: "#3b82f6", para: true }, { ad: "Kredi Kartı", deger: v.ok.kart, renk: "#8b5cf6", para: true }] });
}
