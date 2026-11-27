// Masaüstündeki araç ve iç hizmet çıktılarının karşılığı: araç listesi (PDF/Excel), iç hizmet raporu (PDF/Excel, formüllü).
import { sayiTr, tl, gg, matris, genislikler, toplamla, tarihSirasi } from "./cikti_yardim.js";
import { tarihCoz, sayi } from "./bicim.js";

const YOK = "Dışa aktarılacak kayıt yok.";
const p2 = (n) => String(n).padStart(2, "0");
const sirala = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "tr", { sensitivity: "base" });
const kucuk = (s) => String(s ?? "").toLocaleLowerCase("tr");
const buyuk = (s) => String(s ?? "").toLocaleUpperCase("tr").trim();
const baslikHarf = (s) => kucuk(s).replace(/(^|\s)\S/g, (x) => x.toLocaleUpperCase("tr"));
const dolu = (v) => (v === null || v === undefined || String(v).trim() === "" ? "" : String(v).trim());

// ════════════════════════════ ARAÇ ════════════════════════════
const hgsVar = (a) => a.hgs === true || kucuk(a.hgs) === "var";
function aracSirala(araclar) {
  return [...araclar].sort((a, b) => sirala(a.firma || "", b.firma || "") || sirala(a.kurum || "", b.kurum || "") || sirala(a.plaka, b.plaka));
}
const aracVeri = (araclar) => { if (!araclar.length) throw new Error(YOK); return aracSirala(araclar); };

const tarihDeger = (s) => { const t = tarihCoz(s); return t ? t.getTime() : 0; };
const yagTarih = (k) => String(k.tarih_km || "").split(/[\s/|-]+km/i)[0];

export function aracXlsx(ctx, araclar) {
  const l = aracVeri(araclar);
  const baslik = ["S.No", "Çalıştığı Kurum", "Araç Sahibi (Firma)", "Vergi No", "Plaka", "Şoför Bilgisi", "Şoför Tel", "Marka", "Model", "Yıl", "Yakıt", "Vites", "Güncel KM", "Şasi No",
    "UTTS Durumu", "HGS Durumu", "Muayene Bitiş", "Trafik Bitiş", "Kasko Bitiş", "Koltuk Sigortası", "Güzergah Belge Bitiş", "Ruhsat No"];
  const m = matris();
  baslik.forEach((x, i) => m.koy(1, i + 1, { v: x, b: true, renk: "#ffffff", arka: "#475569", hiza: "orta", kenar: true }));
  l.forEach((a, i) => {
    [i + 1, dolu(a.kurum) || "-", dolu(a.firma) || "Belirtilmemiş", dolu(a.vergi_no), dolu(a.plaka), dolu(a.sofor) || "-", dolu(a.sofor_tel) || "-", dolu(a.marka), dolu(a.model), dolu(a.yil), dolu(a.yakit), dolu(a.vites),
      dolu(a.km), dolu(a.sasi), dolu(a.utts), hgsVar(a) ? "Var" : "Yok", dolu(a.muayene_tarihi), dolu(a.trafik_tarihi), dolu(a.kasko_tarihi), dolu(a.koltuk_sigortasi), dolu(a.guzergah_tarihi), dolu(a.ruhsat_no)]
      .forEach((v, j) => m.koy(i + 2, j + 1, { v, kenar: true, hiza: "orta" }));
  });
  const s1 = m.satirlar();
  const sayfalar = [{ ad: "Araç Kayıtları", satirlar: s1, genislik: genislikler(s1), dondur: 1, filtre: [1, 1, l.length + 1, baslik.length] }];
  if (ctx.sec && ctx.sec.bakim) {
    const b = bakimSayfasi(l);
    if (b) sayfalar.push(b);
  }
  return sayfalar;
}

function bakimSayfasi(l) {
  const m = matris();
  let r = 1;
  const bolum = (ad, kolonlar) => {
    m.koy(r, 1, { v: ad, b: true, boyut: 12 });
    r++;
    kolonlar.forEach((c, i) => m.koy(r, i + 1, { v: c, b: true, renk: "#ffffff", arka: "#334155", hiza: "orta", kenar: true }));
    r++;
  };
  const yag = l.flatMap((a) => (a.yakit_kayitlari || []).map((k) => ({ a, k }))).sort((x, y) => sirala(x.a.plaka, y.a.plaka) || tarihDeger(yagTarih(x.k)) - tarihDeger(yagTarih(y.k)));
  const bakim = l.map((a) => ({ a, liste: [...(a.bakim_kayitlari || [])].sort((x, y) => tarihDeger(x.tarih) - tarihDeger(y.tarih)) })).filter((x) => x.liste.length);
  const harcama = l.map((a) => ({ a, liste: [...(a.harcama_kayitlari || [])].sort((x, y) => tarihDeger(x.tarih) - tarihDeger(y.tarih)) })).filter((x) => x.liste.length);
  if (!yag.length && !bakim.length && !harcama.length) return null;
  const hucre = (v, ek = {}) => ({ v, kenar: true, ...ek });
  const para = { fmt: "para", hiza: "sag" };
  if (yag.length) {
    bolum("YAĞ BAKIMI KAYITLARI", ["Plaka", "Tarih/KM", "Yağ Cinsi", "Yağ Lt", "Hava Komp.", "Yağ Filtre", "Mazot Filtre", "Hava Filtre", "Hava Şase Filtre", "Usta", "Yaptıran", "Notlar"]);
    for (const { a, k } of yag) {
      [a.plaka, k.tarih_km, k.yag_cinsi, k.yag_lt, k.hava_kompresoru, k.yag_filtresi, k.mazot_filtresi, k.hava_filtresi, k.hava_sase_filtresi, k.usta, k.yaptiran, k.notlar].forEach((v, i) => m.koy(r, i + 1, hucre(dolu(v))));
      r++;
    }
    r++;
  }
  const toplamBolumu = (ad, kolonlar, gruplar, satir, iscilikVar) => {
    bolum(ad, kolonlar);
    let gt = 0, gi = 0;
    for (const { a, liste } of gruplar) {
      let t = 0, i2 = 0;
      for (const k of liste) {
        satir(a, k).forEach((v, i) => m.koy(r, i + 1, typeof v === "object" ? hucre(v.v, v.ek) : hucre(dolu(v))));
        t += sayi(k.tutar) || 0; i2 += sayi(k.iscilik) || 0;
        r++;
      }
      m.koy(r, 1, hucre(`${a.plaka} Toplam`, { b: true, arka: "#E8EAF6" }));
      for (let c = 2; c <= kolonlar.length; c++) m.koy(r, c, hucre("", { arka: "#E8EAF6" }));
      m.koy(r, 4, hucre(t, { b: true, arka: "#E8EAF6", ...para }));
      if (iscilikVar) m.koy(r, 5, hucre(i2, { b: true, arka: "#E8EAF6", ...para }));
      r++;
      gt += t; gi += i2;
    }
    m.koy(r, 3, { v: "GENEL TOPLAM", b: true, hiza: "sag" });
    m.koy(r, 4, { v: gt, b: true, ...para });
    if (iscilikVar) m.koy(r, 5, { v: gi, b: true, ...para });
    r += 2;
  };
  if (bakim.length) toplamBolumu("BAKIM / TAMİR KAYITLARI", ["Plaka", "Tarih", "Açıklama", "Tutar", "İşçilik"], bakim, (a, k) => [a.plaka, k.tarih, k.aciklama, { v: sayi(k.tutar) || 0, ek: para }, { v: sayi(k.iscilik) || 0, ek: para }], true);
  if (harcama.length) toplamBolumu("GENEL HARCAMA KAYITLARI", ["Plaka", "Tarih", "Açıklama", "Tutar"], harcama, (a, k) => [a.plaka, k.tarih, k.aciklama, { v: sayi(k.tutar) || 0, ek: para }], false);
  const s = m.satirlar();
  return { ad: "Bakım Kayıtları", satirlar: s, genislik: genislikler(s, { alt: 12, ust: 36 }) };
}

export function aracPdf(ctx, araclar) {
  const l = aracVeri(araclar), b = ctx.belge;
  ctx.ust(ctx.firma ? `Araç Kayıtları Analiz Raporu - ${ctx.firma}` : "Araç Kayıtları Analiz Raporu", { donem: false, firma: false });
  b.baslik("Detaylı Araç Listesi");
  const g = [20, 26, 19, 20, 17, 19, 13, 19, 19, 19, 19, 19, 10, 9, 18];
  const ad = ["Çalıştığı Kurum", "Araç Sahibi (Firma)", "Plaka", "Şoför Bilgisi", "Şoför Tel", "Marka Model", "Model Yılı", "Muayene T.", "Trafik S.", "Koltuk S.", "Kasko B.", "Güzergah", "UTTS", "HGS", "Ruhsat No"];
  b.tablo({
    boyut: 7.5, baslikBoyut: 8, zebra: ["#ffffff", "#f8fafc"], sutunlar: ad.map((x, i) => ({ b: x, g: g[i] })),
    satirlar: l.map((a) => [dolu(a.kurum) || "-", `${dolu(a.firma) || "Belirtilmemiş"}${dolu(a.vergi_no) ? `\n${dolu(a.vergi_no)}` : ""}`, dolu(a.plaka), dolu(a.sofor) || "-", dolu(a.sofor_tel) || "-",
      [dolu(a.marka), dolu(a.model)].filter(Boolean).join(" "), dolu(a.yil), dolu(a.muayene_tarihi), dolu(a.trafik_tarihi), dolu(a.koltuk_sigortasi), dolu(a.kasko_tarihi), dolu(a.guzergah_tarihi),
      dolu(a.utts), hgsVar(a) ? "Var" : "Yok", dolu(a.ruhsat_no)]),
  });
  if (ctx.sec && ctx.sec.bakim) {
    for (const a of l) {
      const yag = [...(a.yakit_kayitlari || [])].sort((x, y) => tarihDeger(yagTarih(x)) - tarihDeger(yagTarih(y)));
      const bakim = [...(a.bakim_kayitlari || [])].sort((x, y) => tarihDeger(x.tarih) - tarihDeger(y.tarih));
      const harcama = [...(a.harcama_kayitlari || [])].sort((x, y) => tarihDeger(x.tarih) - tarihDeger(y.tarih));
      if (yag.length) {
        b.baslik(`${a.plaka} — Yağ Bakımı Kayıtları`);
        b.tablo({
          boyut: 8, sutunlar: [["Tarih/KM", 28], ["Yağ Cinsi", 30], ["Yağ Lt", 18], ["Hava Komp.", 22], ["Yağ Filtre", 20], ["Mazot Filtre", 22], ["Hava Filtre", 20], ["Hava Şase Filtre", 22], ["Usta", 28], ["Yaptıran", 28], ["Notlar", 45]].map(([x, w]) => ({ b: x, g: w })),
          satirlar: yag.map((k) => [k.tarih_km, k.yag_cinsi, k.yag_lt, k.hava_kompresoru, k.yag_filtresi, k.mazot_filtresi, k.hava_filtresi, k.hava_sase_filtresi, k.usta, k.yaptiran, k.notlar].map(dolu)),
        });
      }
      if (bakim.length) {
        b.baslik(`${a.plaka} — Bakım / Tamir Kayıtları`);
        b.tablo({
          boyut: 8, sutunlar: [{ b: "Tarih", g: 30 }, { b: "Açıklama", g: 120, hiza: "sol" }, { b: "Tutar", g: 35, hiza: "sag" }, { b: "İşçilik", g: 35, hiza: "sag" }],
          satirlar: bakim.map((k) => [dolu(k.tarih), dolu(k.aciklama), tl(sayi(k.tutar)), tl(sayi(k.iscilik))]),
          toplam: ["TOPLAM", "", tl(toplamla(bakim, (k) => sayi(k.tutar))), tl(toplamla(bakim, (k) => sayi(k.iscilik)))],
        });
      }
      if (harcama.length) {
        b.baslik(`${a.plaka} — Genel Harcama Kayıtları`);
        b.tablo({
          boyut: 8, sutunlar: [{ b: "Tarih", g: 30 }, { b: "Açıklama", g: 150, hiza: "sol" }, { b: "Tutar", g: 40, hiza: "sag" }],
          satirlar: harcama.map((k) => [dolu(k.tarih), dolu(k.aciklama), tl(sayi(k.tutar))]),
          toplam: ["TOPLAM", "", tl(toplamla(harcama, (k) => sayi(k.tutar)))],
        });
      }
    }
  }
  const adetler = new Map();
  for (const a of l) { const f = baslikHarf(dolu(a.firma) || "Belirtilmemiş"); adetler.set(f, (adetler.get(f) || 0) + 1); }
  const ONCELIK = ["Olcay Tur Ltd", "Olcay Başer", "Erkul Seyahat", "Alc Seyahat"];
  const sirali = [...adetler.entries()].sort((x, y) => {
    const i = ONCELIK.indexOf(x[0]), j = ONCELIK.indexOf(y[0]);
    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j) || y[1] - x[1];
  });
  b.baslik("Filo ve Firma Dağılım Özeti");
  b.ozet({
    baslik: "Genel Araç İstatistikleri", sagBaslik: "Adet", baslikArka: "#334155", genislikMm: 165,
    satirlar: [["Sistemde Kayıtlı Toplam Araç", { m: String(l.length), kalin: true }], ...sirali.map(([f, n]) => [`${f} Bünyesindeki Araçlar`, String(n)])],
  });
}

// ════════════════════════════ İÇ HİZMET ════════════════════════════
const BOLUMLER = ["ÜRETİM", "GÜVENLİK", "IK", "BAKIM", "LOJİSTİK", "KALİTE", "CISG", "IT", "AGRO", "PROJE", "SATIN ALMA"];
const BOLUM_RENK = ["808080", "AEAAAA", "ACB9CA", "F8CBAD", "FFD966", "C6E0B4", "C9C9C9", "A9D08E", "D9D9D9", "2E75B6", "FFFFFF"];
const MASRAF = { "ÜRETİM": "32010", "GÜVENLİK": "32230", IK: "32230", BAKIM: "32020", "LOJİSTİK": "32060", "KALİTE": "32040", CISG: "32030", IT: "32210", AGRO: "32130", PROJE: "", "SATIN ALMA": "32110" };

export function aciklamaNorm(aciklama, yer) {
  let t = buyuk(aciklama);
  const y = buyuk(yer);
  if (t) {
    if (/GEL[İI]Ş/.test(t)) return "MESAİ GELİŞİ";
    if (/[ÇC]IK[İI]Ş/.test(t)) return "MESAİ ÇIKIŞI";
    return t;
  }
  if (/^FAB\b/.test(y)) t = "MESAİ ÇIKIŞI";
  else if (/\bFAB$/.test(y)) t = "MESAİ GELİŞİ";
  return t;
}

function icVeri(ctx, liste) {
  const l = liste.filter((r) => ctx.donem.icinde(r.tarih)).sort((a, b) => tarihSirasi(a, b) || sirala(a.saat, b.saat));
  if (!l.length) throw new Error(YOK);
  return l;
}

function icAralik(l) {
  const ilk = l[0].tarih, son = l[l.length - 1].tarih;
  const bitis = new Date(son.getFullYear(), son.getMonth() + 1, 0);
  return ilk.getMonth() === bitis.getMonth() && ilk.getFullYear() === bitis.getFullYear()
    ? `${p2(ilk.getDate())}-${p2(bitis.getDate())}.${p2(bitis.getMonth() + 1)}.${bitis.getFullYear()}` : `${gg(ilk)}-${gg(bitis)}`;
}

function bolumPaylari(r) {
  const bd = r.bolumDagilim || {};
  const anahtarlar = Object.keys(bd).filter((k) => Number(bd[k]) > 0);
  const top = anahtarlar.reduce((t, k) => t + Number(bd[k]), 0);
  const eff = Math.max(r.kisi, top);
  const sonuc = {};
  if (!(top > 0) || !(eff > 0)) { sonuc["Belirtilmemiş"] = r.tutar; return sonuc; }
  let verilen = 0;
  for (const k of anahtarlar) { const v = r.tutar * Number(bd[k]) / eff; sonuc[buyuk(k)] = (sonuc[buyuk(k)] || 0) + v; verilen += v; }
  if (r.tutar - verilen > 0.005) sonuc["Belirtilmemiş"] = r.tutar - verilen;
  return sonuc;
}

const yerSirasi = (a, b) => (/ADANA/.test(buyuk(a)) ? 1 : 0) - (/ADANA/.test(buyuk(b)) ? 1 : 0) || sirala(a, b);

export function icHizmetPdf(ctx, liste) {
  const l = icVeri(ctx, liste), b = ctx.belge;
  const aralik = icAralik(l);
  ctx.ust(`İÇ HİZMETLER RAPORU ${aralik}`, { donem: false });
  const w = [24, 62, 38, 58, 190, 126, 108, 32, 64, 32, 60];
  const ad = ["No", "Tarih", "Saat", "Plaka", "Personel", "Gidilen Yer", "Açıklama", "Kişi", "Ücret (₺)", "Fiş", "Kişi Başı (₺)"];
  const hiza = [null, null, null, null, "sol", "sol", "sol", "sag", "sag", "orta", "sag"];
  const kisi = toplamla(l, (r) => r.kisi), tutar = toplamla(l, (r) => r.tutar);
  b.tablo({
    boyut: 7, baslikArka: "#0d2464", zebra: ["#ffffff", "#dce8f8"], toplamArka: "#b8d0f4", grid: "#9ca3af",
    sutunlar: ad.map((x, i) => ({ b: x, a: w[i], ...(hiza[i] ? { hiza: hiza[i] } : {}) })),
    satirlar: l.map((r, i) => [String(i + 1), gg(r.tarih), r.saat, r.plaka, r.personel || r.sofor, r.yer, aciklamaNorm(r.aciklama, r.yer), String(r.kisi), sayiTr(r.tutar), r.fis, r.kisi > 0 ? sayiTr(r.tutar / r.kisi) : ""]),
    toplam: [{ m: "TOPLAM", span: 7, hiza: "orta" }, "", "", "", "", "", "", String(kisi), sayiTr(tutar), "", kisi > 0 ? sayiTr(tutar / kisi) : ""],
  });
  const yerler = new Map();
  for (const r of l) { const k = buyuk(r.yer) || "-"; const e = yerler.get(k) || { sefer: 0, tutar: 0 }; e.sefer++; e.tutar += r.tutar; yerler.set(k, e); }
  b.baslik("GÜZERGAH ÖZETİ", 12);
  b.tablo({
    boyut: 8, baslikArka: "#1b4abf", zebra: ["#ffffff", "#eaf1fb"], toplamArka: "#c8daf7", genislikMm: 186, hizala: "sol",
    sutunlar: [{ b: "Gidilen Yer", g: 109, hiza: "sol" }, { b: "Sefer Sayısı", g: 35 }, { b: "Toplam Tutar (₺)", g: 42, hiza: "sag" }],
    satirlar: [...yerler.keys()].sort(yerSirasi).map((k) => [k, String(yerler.get(k).sefer), sayiTr(yerler.get(k).tutar)]),
    toplam: ["TOPLAM", String(l.length), sayiTr(tutar)],
  });
  const bolum = new Map();
  for (const r of l) for (const [k, v] of Object.entries(bolumPaylari(r))) bolum.set(k, (bolum.get(k) || 0) + v);
  b.baslik("DEPARTMAN BÜTÇE DAĞILIMI", 12);
  b.tablo({
    boyut: 8, baslikArka: "#0d2464", zebra: ["#ffffff", "#eaf1fb"], toplamArka: "#b8d0f4", genislikMm: 186, hizala: "sol",
    sutunlar: [{ b: "Departman", g: 123, hiza: "sol" }, { b: "Toplam Tutar (₺)", g: 63, hiza: "sag" }],
    satirlar: [...bolum.entries()].sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, sayiTr(v)]),
    toplam: ["TOPLAM", sayiTr(toplamla([...bolum.values()], (v) => v))],
  });
}

function guzergahSirasi(f) {
  const ad = buyuk(f.guzergah), tip = [29, 19, 4].findIndex((t) => new RegExp(`\\b${t}\\b`).test(ad));
  return [/ADANA/.test(ad) ? 1 : 0, tip < 0 ? 9 : tip, ad];
}

export function icHizmetXlsx(ctx, liste, fiyatlar = []) {
  const l = icVeri(ctx, liste);
  const aralik = icAralik(l);
  const rotalar = [...new Map(fiyatlar.filter((f) => dolu(f.guzergah)).map((f) => [buyuk(f.guzergah), { ad: buyuk(f.guzergah), fiyat: sayi(f.birim_fiyat) || 0 }])).values()]
    .sort((a, b) => { const x = guzergahSirasi({ guzergah: a.ad }), y = guzergahSirasi({ guzergah: b.ad }); return x[0] - y[0] || x[1] - y[1] || sirala(x[2], y[2]); });
  const R = rotalar.length, ilkRota = 7, tutarCol = ilkRota + R, yerCol = tutarCol + 1, acikCol = tutarCol + 2, fisCol = tutarCol + 3, kbCol = tutarCol + 4, d0 = tutarCol + 5, sonCol = d0 + BOLUMLER.length * 2 - 1;
  const harf = (n) => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const m = matris(), bir = [];
  const ilk = 6, son = ilk + l.length - 1;
  BOLUMLER.forEach((ad, k) => { m.koy(1, d0 + k * 2, { v: ad, b: true, arka: BOLUM_RENK[k], hiza: "orta", kenar: true }); m.koy(1, d0 + k * 2 + 1, { v: "", arka: BOLUM_RENK[k], kenar: true }); bir.push([1, d0 + k * 2, 1, d0 + k * 2 + 1]); });
  m.koy(3, 1, { v: `${ctx.firma ? ctx.firma + " | " : ""}İÇ HİZMETLER — ${aralik}`, b: true, boyut: 14, hiza: "orta", arka: "#D9E1F2" });
  for (let c = 2; c <= kbCol; c++) m.koy(3, c, { v: "", arka: "#D9E1F2" });
  bir.push([3, 1, 3, kbCol]);
  m.koy(3, d0, { v: "DEPARTMAN BÜTÇE PAYI", b: true, boyut: 12, hiza: "orta", arka: "#D9E1F2" });
  for (let c = d0 + 1; c <= sonCol; c++) m.koy(3, c, { v: "", arka: "#D9E1F2" });
  bir.push([3, d0, 3, sonCol]);
  const baslik = ["NO", "TARİH", "SAAT", "PLAKA", "ADI SOYADI", "KİŞİ SAYISI", ...rotalar.map((x) => x.ad), "TUTAR", "GİDİLEN YER", "AÇIKLAMA", "FİŞ NO", "KİŞİ BAŞI TUTAR"];
  baslik.forEach((x, i) => m.koy(4, i + 1, { v: x, b: true, hiza: "orta", sar: true, kenar: true, arka: "#D9E1F2" }));
  BOLUMLER.forEach((_, k) => { m.koy(4, d0 + k * 2, { v: "SAYI", b: true, hiza: "orta", kenar: true, arka: "#D9E1F2" }); m.koy(4, d0 + k * 2 + 1, { v: "TUTAR", b: true, hiza: "orta", kenar: true, arka: "#D9E1F2" }); });
  m.koy(5, 5, { v: "BİRİM FİYAT", b: true, hiza: "sag", kenar: true });
  rotalar.forEach((x, j) => m.koy(5, ilkRota + j, { v: x.fiyat, b: true, kenar: true, arka: "#E6B8B7", fmt: '#,##0.00 "₺"', hiza: "sag" }));
  const para = '#,##0.00 "₺"';
  l.forEach((r, i) => {
    const y = ilk + i, zemin = i % 2 ? "#F2F2F2" : "#FFFFFF", c = (v, ek = {}) => ({ v, kenar: true, arka: zemin, ...ek });
    const rota = rotalar.findIndex((x) => x.ad === buyuk(r.guzergah));
    m.koy(y, 1, c(i + 1, { hiza: "orta" }));
    m.koy(y, 2, c(gg(r.tarih), { hiza: "orta" }));
    m.koy(y, 3, c(r.saat, { hiza: "orta" }));
    m.koy(y, 4, c(r.plaka, { hiza: "orta" }));
    m.koy(y, 5, c(r.personel || r.sofor));
    m.koy(y, 6, c(r.kisi, { hiza: "orta" }));
    rotalar.forEach((_, j) => m.koy(y, ilkRota + j, j === rota && r.tutar > 0 ? c(r.tutar, { arka: "#E6B8B7", fmt: para, hiza: "sag" }) : c("")));
    m.koy(y, tutarCol, R && rota >= 0 ? c(0, { f: `SUM(${harf(ilkRota)}${y}:${harf(ilkRota + R - 1)}${y})`, v: r.tutar, fmt: para, hiza: "sag", b: true }) : c(r.tutar, { fmt: para, hiza: "sag", b: true }));
    m.koy(y, yerCol, c(r.yer));
    m.koy(y, acikCol, c(aciklamaNorm(r.aciklama, r.yer)));
    m.koy(y, fisCol, c(r.fis, { hiza: "orta" }));
    m.koy(y, kbCol, c(0, { f: `IF(F${y}>0,${harf(tutarCol)}${y}/F${y},0)`, v: r.kisi > 0 ? r.tutar / r.kisi : 0, fmt: para, hiza: "sag" }));
    const pay = bolumPaylari(r), kb = r.kisi > 0 ? r.tutar / r.kisi : 0;
    BOLUMLER.forEach((ad, k) => {
      const sayi = Number((r.bolumDagilim || {})[ad]) || 0;
      m.koy(y, d0 + k * 2, c(sayi > 0 ? sayi : "", { hiza: "orta" }));
      m.koy(y, d0 + k * 2 + 1, sayi > 0 ? c(0, { f: `IF(${harf(d0 + k * 2)}${y}>0,${harf(d0 + k * 2)}${y}*${harf(kbCol)}${y},"")`, v: kb * sayi, fmt: para, hiza: "sag" }) : c(""));
      void pay;
    });
  });
  const rt = son + 1, topla = (col, v, ek = {}) => m.koy(rt, col, { f: `SUM(${harf(col)}${ilk}:${harf(col)}${son})`, v, b: true, kenar: true, fmt: para, hiza: "sag", ...ek });
  m.koy(rt, 1, { v: "TOPLAMLAR", b: true, hiza: "orta", kenar: true, arka: "#D9E1F2" });
  for (let c = 2; c <= 5; c++) m.koy(rt, c, { v: "", kenar: true, arka: "#D9E1F2" });
  bir.push([rt, 1, rt, 5]);
  m.koy(rt, 6, { f: `SUM(F${ilk}:F${son})`, v: toplamla(l, (r) => r.kisi), b: true, kenar: true, hiza: "orta" });
  const rotaToplam = rotalar.map((x) => toplamla(l.filter((r) => buyuk(r.guzergah) === x.ad), (r) => r.tutar));
  const rotaSefer = rotalar.map((x) => l.filter((r) => buyuk(r.guzergah) === x.ad && r.tutar > 0).length);
  rotalar.forEach((_, j) => topla(ilkRota + j, rotaToplam[j], { arka: "#AEAAAA" }));
  topla(tutarCol, toplamla(l, (r) => r.tutar), { arka: "#AEAAAA" });
  const bolumTutar = BOLUMLER.map((ad) => toplamla(l, (r) => { const s = Number((r.bolumDagilim || {})[ad]) || 0; return s > 0 && r.kisi > 0 ? r.tutar / r.kisi * s : 0; }));
  BOLUMLER.forEach((ad, k) => {
    m.koy(rt, d0 + k * 2, { f: `SUM(${harf(d0 + k * 2)}${ilk}:${harf(d0 + k * 2)}${son})`, v: toplamla(l, (r) => Number((r.bolumDagilim || {})[ad]) || 0), b: true, kenar: true, arka: "#70AD47", hiza: "orta" });
    topla(d0 + k * 2 + 1, bolumTutar[k], { arka: "#70AD47" });
  });
  m.koy(rt + 1, 5, { v: "GÜZERGAH", b: true, hiza: "sag" });
  rotalar.forEach((x, j) => m.koy(rt + 1, ilkRota + j, { v: x.ad, b: true, hiza: "orta", sar: true, kenar: true }));
  m.koy(rt + 2, 5, { v: "SEFER SAYISI", b: true, hiza: "sag" });
  rotalar.forEach((_, j) => m.koy(rt + 2, ilkRota + j, { f: `COUNTIF(${harf(ilkRota + j)}${ilk}:${harf(ilkRota + j)}${son},">0")`, v: rotaSefer[j], b: true, kenar: true, arka: "#70AD47", hiza: "orta" }));
  let y = rt + 4;
  ["YER", "SEFER", "FİYAT", "TUTAR"].forEach((x, i) => m.koy(y, 5 + i, { v: x, b: true, renk: "#ffffff", arka: "#334155", hiza: "orta", kenar: true }));
  rotalar.forEach((x, j) => {
    y++;
    m.koy(y, 5, { v: x.ad, kenar: true });
    m.koy(y, 6, { v: rotaSefer[j], kenar: true, hiza: "orta" });
    m.koy(y, 7, { v: x.fiyat, kenar: true, fmt: para, hiza: "sag" });
    m.koy(y, 8, { v: rotaToplam[j], kenar: true, fmt: para, hiza: "sag" });
  });
  y += 2;
  ["DEPARTMAN", "TUTAR", "MASRAF MERKEZİ"].forEach((x, i) => m.koy(y, 5 + i, { v: x, b: true, renk: "#ffffff", arka: "#334155", hiza: "orta", kenar: true }));
  BOLUMLER.forEach((ad, k) => {
    y++;
    m.koy(y, 5, { v: ad, kenar: true, arka: `#${BOLUM_RENK[k]}` });
    m.koy(y, 6, { v: bolumTutar[k], kenar: true, fmt: para, hiza: "sag" });
    m.koy(y, 7, { v: MASRAF[ad] || "", kenar: true, hiza: "orta" });
  });
  const genislik = [6, 11, 8, 13, 30, 13, ...rotalar.map(() => 13), 14, 24, 18, 10, 14, ...BOLUMLER.flatMap(() => [7, 13])];
  return [{
    ad: "İç Hizmetler", satirlar: m.satirlar(), birlestir: bir, genislik, dondur: 5, sekmeRenk: "#0E9B9B",
    yukseklik: { 4: 45 },
  }];
}
