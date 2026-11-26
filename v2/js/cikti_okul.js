// Masaüstündeki okul çıktılarının karşılığı: öğrenci/servis listeleri, servis puantajı, tahsilat raporları, indirim analizi.
import { sayiTr, tl, gg, matris, genislikler, toplamla } from "./cikti_yardim.js";
import { tarihCoz, sayi, ayAnahtari, ayEkle, ayAdi, bugun } from "./bicim.js";
import { ogrenciKaydi } from "./hesap.js";
import { ayGunSayisi, gelmeyenGunler, servisAyGecerli, odenecekTutar } from "./puantaj.js";

const YOK = "Dışa aktarılacak kayıt yok.";
const sirala = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "tr", { sensitivity: "base" });
const dolu = (v) => (v === null || v === undefined ? "" : String(v).trim());
const servisMi = (r) => String(r.id).startsWith("srv_");
const plakaAnahtar = (p) => dolu(p).toLocaleUpperCase("tr");
const soyadAd = (r) => { const t = dolu(r.ad_soyad).split(/\s+/); return `${t.length > 1 ? t[t.length - 1] : ""} ${t.slice(0, -1).join(" ")}`.trim() || dolu(r.ad_soyad); };

function ogrenciSirala(liste) {
  const manuel = liste.some((o) => o.manuel_sira !== undefined && o.manuel_sira !== null && o.manuel_sira !== "");
  return [...liste].sort(manuel
    ? (a, b) => (sayi(a.manuel_sira) || 1e9) - (sayi(b.manuel_sira) || 1e9) || sirala(soyadAd(a), soyadAd(b))
    : (a, b) => sirala(soyadAd(a), soyadAd(b)));
}

const servisKullaniyor = (o) => ogrenciKaydi(o).servisVar;
const baslikHucre = (v, arka = "#334155") => ({ v, b: true, renk: "#ffffff", arka, hiza: "orta", kenar: true, sar: true });

function tabloSayfa(ad, baslik, satirlar, { arka = "#334155", genislik } = {}) {
  const m = matris();
  baslik.forEach((x, i) => m.koy(1, i + 1, baslikHucre(x, arka)));
  satirlar.forEach((r, i) => r.forEach((v, j) => m.koy(i + 2, j + 1, typeof v === "object" && v !== null ? { kenar: true, ...v } : { v, kenar: true })));
  const s = m.satirlar();
  return { ad, satirlar: s, genislik: genislik || genislikler(s, { alt: 8, ust: 50, ek: 4 }), dondur: 1 };
}

// ════════════════════════════ ÖĞRENCİ LİSTELERİ ════════════════════════════
export function ogrenciListesiXlsx(ctx, ham) {
  const l = ogrenciSirala(ham.filter((o) => !servisMi(o) && servisKullaniyor(o)));
  if (!l.length) throw new Error(YOK);
  const buAy = ayAnahtari(bugun());
  return [tabloSayfa("Öğrenci Listesi",
    ["S.No", "Adı Soyadı", "TC Kimlik No", "Sınıf", "Öğrenci Tel", "Veli Tel", "Baba Tel", "Anne Tel", "Veli Adı / Meslek", "Adres", "Servis Plaka", "Aylık Ücret", "Bu Ay Ödeme"],
    l.map((o, i) => [i + 1, dolu(o.ad_soyad), dolu(o.tc_kimlik), dolu(o.sinif), dolu(o.ogrenci_tel), dolu(o.veli_tel), dolu(o.baba_tel), dolu(o.anne_tel), dolu(o.veli_adi), dolu(o.adres), dolu(o.servis_plaka),
      { v: sayi(o.aylik_odeme), fmt: "para" }, ogrenciKaydi(o).odemeler.some((g) => g.ay === buAy) ? "Ödendi" : "Bekliyor"]))];
}

export function kullanmayanXlsx(ctx, ham) {
  const l = ogrenciSirala(ham.filter((o) => !servisMi(o) && !servisKullaniyor(o)));
  if (!l.length) throw new Error(YOK);
  return [tabloSayfa("Servis Kullanmayanlar", ["S.No", "Adı Soyadı", "TC Kimlik No", "Sınıf", "Öğrenci Tel", "Veli Tel", "Baba Tel", "Anne Tel", "Veli Adı / Meslek", "Adres"],
    l.map((o, i) => [i + 1, dolu(o.ad_soyad), dolu(o.tc_kimlik), dolu(o.sinif), dolu(o.ogrenci_tel), dolu(o.veli_tel), dolu(o.baba_tel), dolu(o.anne_tel), dolu(o.veli_adi), dolu(o.adres)]))];
}

// ════════════════════════════ SERVİSLER ════════════════════════════
const SERVIS_BASLIK = ["Plaka", "Şoför Adı Soyadı", "Şoför Tel", "Araç No", "Araç Tipi", "Güzergah", "Araç Sahibi", "Aylık Ücret", "Sigorta Bitiş", "Muayene Bitiş", "Koltuk Sigortası Bitiş", "Öğrenci Sayısı"];

function servisSatirlari(ham) {
  const servisler = ham.filter(servisMi).sort((a, b) => (sayi(a.sira_no) - sayi(b.sira_no)) || sirala(a.plaka, b.plaka));
  if (!servisler.length) throw new Error(YOK);
  const adet = new Map();
  for (const o of ham) if (!servisMi(o) && ogrenciKaydi(o).servisVar) { const k = plakaAnahtar(o.servis_plaka); adet.set(k, (adet.get(k) || 0) + 1); }
  return servisler.map((s) => [dolu(s.plaka), dolu(s.sofor_ad), dolu(s.sofor_tel), dolu(s.arac_no), dolu(s.arac_tipi), dolu(s.guzergah), dolu(s.arac_sahibi),
    sayi(s.aylik_ucret), dolu(s.sigorta_bitis), dolu(s.muayene_bitis), dolu(s.koltuk_bitis), adet.get(plakaAnahtar(s.plaka)) || 0]);
}

export function servislerXlsx(ctx, ham) {
  return [tabloSayfa("Servis Araçları", SERVIS_BASLIK, servisSatirlari(ham).map((r) => r.map((v, i) => (i === 7 ? { v, fmt: "para" } : v))))];
}

export function servislerPdf(ctx, ham) {
  const satirlar = servisSatirlari(ham), b = ctx.belge;
  ctx.ust("Servis Araçları Listesi", { donem: false });
  b.tablo({
    boyut: 8, baslikArka: "#334155", zebra: ["#ffffff", "#f1f5f9"], grid: "#cbd5e1",
    sutunlar: SERVIS_BASLIK.map((x, i) => ({ b: x, a: [12, 22, 16, 9, 12, 24, 20, 12, 13, 13, 13, 9][i] })),
    satirlar: satirlar.map((r) => r.map((v, i) => (i === 7 ? (v ? `${sayiTr(v, 0)} ₺` : "") : String(v)))),
  });
}

// Bir servisin öğrenci listesi (Servisler sekmesinden).
function servisOgrencileri(ham, servis) {
  const k = plakaAnahtar(servis.plaka);
  const l = ham.filter((o) => !servisMi(o) && !o.servis_kullanmiyor && plakaAnahtar(o.servis_plaka) === k)
    .sort((a, c) => (sayi(a.servis_sira) || 1e9) - (sayi(c.servis_sira) || 1e9) || sirala(soyadAd(a), soyadAd(c)));
  if (!l.length) throw new Error("Bu serviste öğrenci yok.");
  return l;
}
const servisBaslik = (s) => [dolu(s.plaka), dolu(s.sofor_ad), dolu(s.guzergah)].filter(Boolean).join(" | ");
const veliTel = (o) => [o.veli_tel, o.anne_tel, o.baba_tel].map(dolu).filter(Boolean).join(" / ");

export function servisOgrenciPdf(ctx, ham, servis) {
  const l = servisOgrencileri(ham, servis), b = ctx.belge;
  ctx.ust(servisBaslik(servis), { donem: false });
  b.tablo({
    boyut: 8.5, baslikArka: "#334155", zebra: ["#ffffff", "#f1f5f9"],
    sutunlar: [{ b: "No", g: 12 }, { b: "Adı Soyadı", g: 55, hiza: "sol" }, { b: "Sınıf", g: 20 }, { b: "Öğrenci Tel", g: 30 }, { b: "Veli Adı / Meslek", g: 45, hiza: "sol" }, { b: "Veli Tel", g: 40 }, { b: "Adres", a: 1, hiza: "sol" }],
    satirlar: l.map((o, i) => [String(i + 1), dolu(o.ad_soyad), dolu(o.sinif), dolu(o.ogrenci_tel), dolu(o.veli_adi), veliTel(o), dolu(o.adres)]),
  });
}

export function servisOgrenciXlsx(ctx, ham, servis) {
  const l = servisOgrencileri(ham, servis);
  const s = tabloSayfa(dolu(servis.plaka).slice(0, 28).replace(/[\\/?*[\]:]/g, " ") || "Servis", ["No", "Adı Soyadı", "Sınıf", "Öğrenci Tel", "Veli Adı / Meslek", "Veli Tel", "Adres"],
    l.map((o, i) => [i + 1, dolu(o.ad_soyad), dolu(o.sinif), dolu(o.ogrenci_tel), dolu(o.veli_adi), veliTel(o), { v: dolu(o.adres), sar: true }]), { arka: "#7C3AED", genislik: [6, 28, 10, 16, 26, 24, 55] });
  return [s];
}

// ════════════════════════════ PUANTAJ ════════════════════════════
const KADEME_ETIKET = { ilkokul: "İlkokul", ortaokul: "Ortaokul" };
const ucretYaz = (v) => `${sayiTr(v, 0)} ₺`;

export function puantajPdf(ctx, ham, ayar, ay) {
  const gizli = new Set((Array.isArray(ayar.puantaj_gizli_servisler) ? ayar.puantaj_gizli_servisler : []).map(String));
  const servisler = ham.filter((s) => servisMi(s) && !gizli.has(String(s.id)) && !gizli.has(String(s.plaka))).sort((a, c) => sirala(a.plaka, c.plaka));
  if (!servisler.length) throw new Error("Puantaj için servis kaydı yok.");
  const etiketler = { ...KADEME_ETIKET, ...(ayar.okul_puantaj_kademe_etiket || {}) };
  const sira = Array.isArray(ayar.okul_puantaj_kategori_sirasi) ? ayar.okul_puantaj_kategori_sirasi.map(String) : [];
  const gruplar = new Map();
  for (const s of servisler) { const k = dolu(s.kademe).toLowerCase() || "ortaokul"; (gruplar.get(k) || gruplar.set(k, []).get(k)).push(s); }
  const kademeler = [...gruplar.keys()].sort((a, c) => (sira.indexOf(a) < 0 ? 99 : sira.indexOf(a)) - (sira.indexOf(c) < 0 ? 99 : sira.indexOf(c)));
  const ay2 = ayEkle(ay, 1), gun1 = ayGunSayisi(ay), gun2 = ayGunSayisi(ay2), gmax = Math.max(gun1, gun2);
  const ad1 = ayAdi(ay).split(" ")[0], ad2 = ayAdi(ay2).split(" ")[0], yil2 = ayAdi(ay2).split(" ")[1];
  const b = ctx.belge;
  ctx.ust(`Servis Puantaj Listesi — ${ayAdi(ay)}`, { donem: false, firma: false });
  b.paragraf(`Hizmet Dönemi: 14 ${ad1} – 14 ${ad2} ${yil2} (1 aylık ücret)`, { boyut: 9, kalin: true, sonrasi: 4 });
  let genel = 0;
  const GRI = "#e2e8f0";
  const gunHucre = (g, ayGun, geldi, donemde, solKalin) => {
    if (g > ayGun) return { m: "", arka: GRI, ...(solKalin ? { solKalin: true } : {}) };
    const ek = solKalin ? { solKalin: true } : {};
    return geldi
      ? { m: "√", kalin: true, boyut: 9, renk: donemde ? "#15803d" : "#94a3b8", ...(donemde ? {} : { arka: GRI }), ...ek }
      : { m: "×", kalin: true, boyut: 9, renk: donemde ? "#dc2626" : "#fca5a5", arka: donemde ? "#fecaca" : "#f1f5f9", ...ek };
  };
  for (const k of kademeler) {
    const satirlar = [];
    let ara = 0;
    gruplar.get(k).forEach((s, i) => {
      const sirket = Boolean(s.sirket_araci), od = odenecekTutar(s, ay, ayar);
      ara += od;
      const zemin = i % 2 ? { arka: "#f1f5f9" } : {};
      const yok1 = gelmeyenGunler(s, ay), yok2 = gelmeyenGunler(s, ay2), gecerli1 = servisAyGecerli(s, ay, ayar), gecerli2 = servisAyGecerli(s, ay2, ayar);
      const r1 = [{ m: dolu(s.plaka), altYok: true, ...zemin }, { m: dolu(s.sofor_ad), altYok: true, hiza: "sol", ...zemin }, { m: sirket ? "Şirket Aracı" : ucretYaz(sayi(s.aylik_ucret)), altYok: true, ...zemin }, { m: ad1, hiza: "sol", ...zemin }];
      const r2 = [{ m: "", ustYok: true, ...zemin }, { m: "", ustYok: true, ...zemin }, { m: "", ustYok: true, ...zemin }, { m: ad2, hiza: "sol", ...zemin }];
      for (let g = 1; g <= gmax; g++) {
        r1.push(gunHucre(g, gun1, gecerli1 && !yok1.has(g), g >= 14, g === 14));
        r2.push(gunHucre(g, gun2, gecerli2 && !yok2.has(g), g <= 14, g === 15));
      }
      r1.push({ m: sirket ? "-" : ucretYaz(od), altYok: true, hiza: "sag", kalin: true, ...zemin });
      r2.push({ m: "", ustYok: true, ...zemin });
      satirlar.push(r1, r2);
    });
    genel += ara;
    b.baslik(etiketler[k] || (k ? k : "Diğer"), 10);
    b.tablo({
      boyut: 6.5, baslikArka: "#334155", grid: "#cbd5e1", cift: 2, padXmm: 0.5, padYmm: 0.9,
      sutunlar: [{ b: "Plaka", g: 18 }, { b: "Şoför Adı Soyadı", g: 38, hiza: "sol" }, { b: "Aylık Ücret", g: 19 }, { b: "Ay", g: 12, hiza: "sol" },
        ...Array.from({ length: gmax }, (_, i) => ({ b: String(i + 1), a: 1 })), { b: "Ödenecek", g: 22, hiza: "sag" }],
      satirlar,
    });
  }
  b.paragraf(`ÖDENECEK TOPLAM TUTAR: ${ucretYaz(genel)}`, { boyut: 11, kalin: true, renk: "#dc2626", sonrasi: 4 });
}

// ════════════════════════════ TAHSİLAT ════════════════════════════
const DURUM_AD = { odendi: "Tam", kismi: "Kısmi", bekliyor: "Ödemedi" };

function tahsilatListesi(liste) {
  const l = [...liste].filter((o) => o.servisVar !== false).sort((a, c) => sirala(a.ad, c.ad));
  if (!l.length) throw new Error(YOK);
  return l;
}

export function tahsilatOzetPdf(ctx, liste) {
  const l = tahsilatListesi(liste), b = ctx.belge;
  ctx.ust("Tahsilat Raporu — Dönem Özeti", { donem: false });
  const tUcret = toplamla(l, (o) => o.ucret), tOdenen = toplamla(l, (o) => o.odenen), tKalan = toplamla(l, (o) => o.kalan);
  b.paragraf(`Servis Öğrencisi: ${l.length} · Tam Ödeyen: ${l.filter((o) => o.durum === "odendi").length} · Kısmi Ödeyen: ${l.filter((o) => o.durum === "kismi").length} · Hiç Ödemeyen: ${l.filter((o) => o.durum === "bekliyor").length}`, { boyut: 9, renk: "#334155", sonrasi: 6 });
  b.tablo({
    boyut: 8.5, baslikArka: "#334155",
    sutunlar: [{ b: "No", a: 4.5 }, { b: "Adı Soyadı", a: 28.5, hiza: "sol" }, { b: "Sınıf", a: 11 }, { b: "Servis", a: 14 }, { b: "Dönem Ücreti", a: 14, hiza: "sag" }, { b: "Ödenen", a: 14, hiza: "sag" }, { b: "Kalan", a: 14, hiza: "sag" }],
    satirlar: l.map((o, i) => {
      const arka = o.kalan <= 0.01 && o.ucret > 0 ? "#e8f0fe" : "#fff7ed";
      const h = (m, ek = {}) => ({ m, arka, ...ek });
      return [h(String(i + 1)), h(o.ad), h(o.sinif), h(o.plaka), h(tl(o.ucret)), h(tl(o.odenen)), h(tl(o.kalan), { kalin: true, renk: o.kalan > 0.01 ? "#b91c1c" : "#15803d" })];
    }),
    toplam: ["", "TOPLAM", "", "", tl(tUcret), tl(tOdenen), tl(tKalan)], toplamArka: "#e2e8f0",
  });
  b.paragraf(`Toplam Tahsil: ${tl(tOdenen)}      Toplam Kalan: ${tl(tKalan)}`, { boyut: 11, kalin: true, sonrasi: 4 });
}

function odemeSatirlari(o) {
  let toplam = 0;
  return [...o.odemeler].sort((a, c) => (a.tarih ? a.tarih.getTime() : 0) - (c.tarih ? c.tarih.getTime() : 0)).map((g, i) => {
    toplam += g.tutar;
    return { no: i + 1, tarih: gg(g.tarih), tutar: g.tutar, yontem: ({ nakit: "Nakit", iban: "IBAN", kart: "Kart" })[g.yontem] || g.yontem, not: g.not, kalan: Math.max(0, o.ucret - toplam) };
  });
}

export function ogrenciOdemePdf(ctx, o) {
  const b = ctx.belge;
  ctx.ust("Ödeme Geçmişi Raporu", { donem: false, firma: false });
  b.paragraf(o.ad, { boyut: 12, kalin: true, sonrasi: 2 });
  b.paragraf([o.sinif, o.plaka ? `Servis: ${o.plaka}` : ""].filter(Boolean).join(" · "), { boyut: 10, renk: "#64748b", sonrasi: 6 });
  b.tablo({
    boyut: 14, baslikBoyut: 8, baslikArka: "#64748b", zebra: ["#e2e8f0", "#e2e8f0"],
    sutunlar: [{ b: "DÖNEM TUTARI", a: 1 }, { b: "ÖDENEN", a: 1 }, { b: "KALAN", a: 1 }],
    satirlar: [[{ m: tl(o.ucret), kalin: true }, { m: tl(o.odenen), kalin: true }, { m: tl(o.kalan), kalin: true, renk: o.kalan > 0.01 ? "#b91c1c" : "#15803d" }]],
  });
  const s = odemeSatirlari(o);
  if (!s.length) { b.paragraf("Henüz ödeme yapılmadı.", { boyut: 10, renk: "#b45309" }); return; }
  b.tablo({
    boyut: 9, baslikArka: "#334155", zebra: ["#ffffff", "#f8fafc"],
    sutunlar: [{ b: "No", a: 5 }, { b: "Tarih", a: 15 }, { b: "Ödenen", a: 15, hiza: "sag" }, { b: "Kalan", a: 15, hiza: "sag" }, { b: "Not", a: 50, hiza: "sol" }],
    satirlar: s.map((x) => [String(x.no), x.tarih, tl(x.tutar), tl(x.kalan), x.not]),
  });
}

export function tahsilatDetayPdf(ctx, liste) {
  const l = tahsilatListesi(liste), b = ctx.belge;
  ctx.ust("Tahsilat Raporu — Detaylı Döküm", { donem: false, firma: false });
  for (const o of l) {
    b.kosulluSayfaSonu(45);
    b.paragraf([o.ad, o.sinif, o.plaka].filter(Boolean).join(" · "), { boyut: 10, kalin: true, sonrasi: 2 });
    b.tablo({
      boyut: 9, baslikArka: "#64748b", baslikBoyut: 8,
      sutunlar: [{ b: "Dönem Ücreti", a: 1 }, { b: "Ödenen", a: 1 }, { b: "Kalan", a: 1 }, { b: "Durum", a: 1 }],
      satirlar: [[tl(o.ucret), tl(o.odenen), { m: tl(o.kalan), kalin: true, renk: o.kalan > 0.01 ? "#b91c1c" : "#15803d" }, DURUM_AD[o.durum] || ""]],
    });
    const s = odemeSatirlari(o);
    if (!s.length) { b.paragraf("Henüz ödeme yapılmadı.", { boyut: 9, renk: "#b45309", sonrasi: 6 }); continue; }
    b.tablo({
      boyut: 8.5, baslikArka: "#334155", zebra: ["#ffffff", "#f8fafc"],
      sutunlar: [{ b: "No", g: 10 }, { b: "Tarih", g: 24 }, { b: "Tutar", g: 28, hiza: "sag" }, { b: "Yöntem", g: 22 }, { b: "Not", a: 1, hiza: "sol" }, { b: "Kalan", g: 28, hiza: "sag" }],
      satirlar: s.map((x) => [String(x.no), x.tarih, tl(x.tutar), x.yontem, x.not, tl(x.kalan)]),
    });
  }
  const tam = l.filter((o) => o.durum === "odendi"), kismi = l.filter((o) => o.durum === "kismi"), hic = l.filter((o) => o.durum === "bekliyor");
  b.baslik("GENEL ÖZET", 12);
  b.tablo({
    boyut: 9, baslikArka: "#334155", genislikMm: 120, hizala: "sol",
    sutunlar: [{ b: "Kategori", g: 70, hiza: "sol" }, { b: "Öğrenci", g: 50 }],
    satirlar: [[{ m: "Tam Ödeyen", renk: "#15803d", kalin: true }, String(tam.length)], [{ m: "Kısmi Ödeyen", renk: "#b45309", kalin: true }, String(kismi.length)], [{ m: "Hiç Ödemeyen", renk: "#b91c1c", kalin: true }, String(hic.length)]],
    toplam: ["TOPLAM", String(l.length)],
  });
  b.paragraf(`Toplam Kalan Alacak: ${tl(toplamla(l, (o) => o.kalan))}`, { boyut: 11, kalin: true });
}

export function indirimPdf(ctx, ham) {
  const l = ham.filter((o) => !servisMi(o) && servisKullaniyor(o));
  const satirlar = l.map((o) => ({ ad: dolu(o.ad_soyad), sinif: dolu(o.sinif), liste: sayi(o.liste_ucreti), ucret: sayi(o.aylik_odeme), odenen: ogrenciKaydi(o).odenen }))
    .map((x) => ({ ...x, kayip: Math.max(0, x.liste - x.ucret) })).filter((x) => x.kayip > 0.005).sort((a, c) => sirala(a.ad, c.ad));
  if (!satirlar.length) throw new Error("İndirim yapılan öğrenci yok.");
  const b = ctx.belge, tKayip = toplamla(satirlar, (x) => x.kayip);
  ctx.ust("İndirim Analizi", { donem: false, firma: false });
  b.tablo({
    boyut: 9, baslikArka: "#334155", zebra: ["#ffffff", "#f8fafc"],
    sutunlar: [{ b: "S.No", g: 15 }, { b: "Adı Soyadı", g: 85, hiza: "sol" }, { b: "Sınıf", g: 35 }, { b: "İndirim Tutarı", g: 45, hiza: "sag" }],
    satirlar: satirlar.map((x, i) => [String(i + 1), x.ad, x.sinif, tl(x.kayip)]),
    toplam: ["", "Toplam İndirim", "", tl(tKayip)],
  });
  b.ozet({
    baslik: `İndirim yapılan ${satirlar.length} öğrenci`, sagBaslik: "Tutar", baslikArka: "#334155", genislikMm: 110,
    satirlar: [["Liste Fiyatı Toplamı", tl(toplamla(satirlar, (x) => x.liste))], ["Dönemlik Ücret Toplamı", tl(toplamla(satirlar, (x) => x.ucret))], ["Tahsilat Toplamı", tl(toplamla(satirlar, (x) => x.odenen))],
      [{ m: "Toplam İndirim", kalin: true }, { m: tl(tKayip), kalin: true, renk: "#b91c1c" }]],
  });
}

export function tahsilatXlsx(ctx, liste) {
  const l = tahsilatListesi(liste);
  const m = matris();
  const baslik = ["S.No", "Adi Soyadi", "Sinif", "Servis (Plaka)", "Donem Ucreti (TL)", "Odenen (TL)", "Kalan (TL)", "Durum"];
  baslik.forEach((x, i) => m.koy(1, i + 1, baslikHucre(x, "#1E3A5F")));
  const ZEMIN = { odendi: "#C8E6C9", kismi: "#FFE0B2", bekliyor: "#FFF9C4" }, YAZI = { odendi: "#1B5E20", kismi: "#E65100", bekliyor: "#B71C1C" };
  l.forEach((o, i) => {
    const arka = ZEMIN[o.durum] || "#FFFFFF", y = i + 2;
    [[i + 1, {}], [o.ad, {}], [o.sinif, {}], [o.plaka, {}], [o.ucret, { fmt: "para" }], [o.odenen, { fmt: "para" }], [o.kalan, { fmt: "para" }], [DURUM_AD[o.durum] || "", { b: true, renk: YAZI[o.durum] }]]
      .forEach(([v, ek], j) => m.koy(y, j + 1, { v, kenar: true, arka, ...ek }));
  });
  const rt = l.length + 2;
  m.koy(rt, 2, { v: "TOPLAM", b: true, arka: "#E3F2FD", kenar: true });
  [1, 3, 4, 8].forEach((c) => m.koy(rt, c, { v: "", arka: "#E3F2FD", kenar: true }));
  [[5, "E"], [6, "F"], [7, "G"]].forEach(([c, h], i) => m.koy(rt, c, { f: `SUM(${h}2:${h}${rt - 1})`, v: toplamla(l, (o) => [o.ucret, o.odenen, o.kalan][i]), b: true, arka: "#E3F2FD", kenar: true, fmt: "para" }));
  const s1 = m.satirlar();
  const m2 = matris();
  ["S.No", "Adi Soyadi", "Sinif", "Servis", "Odeme Tarihi", "Tutar (TL)", "Not"].forEach((x, i) => m2.koy(1, i + 1, baslikHucre(x, "#1E3A5F")));
  let r = 2;
  l.forEach((o, i) => { for (const g of odemeSatirlari(o)) { [i + 1, o.ad, o.sinif, o.plaka, g.tarih, { v: g.tutar, fmt: "para" }, g.not].forEach((v, j) => m2.koy(r, j + 1, typeof v === "object" ? { kenar: true, ...v } : { v, kenar: true })); r++; } });
  const s2 = m2.satirlar();
  return [{ ad: "Tahsilat Donem", satirlar: s1, genislik: genislikler(s1, { alt: 8, ust: 40, ek: 3 }), dondur: 1 }, { ad: "Odeme Detayi", satirlar: s2, genislik: genislikler(s2, { alt: 8, ust: 40, ek: 3 }), dondur: 1 }];
}
