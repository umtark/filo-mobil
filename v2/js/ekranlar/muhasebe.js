// Fatura Yönetimi, Esnaf Defteri ve Akaryakıt ekranları. Bu ilk sürümde yalnızca görüntüleme.
import { h, kart, satir, bilgiSatiri, cipler, segment, aramaKutusu, ayCubugu, sayfalamali, bosDurum, detayAc } from "../ui.js";
import * as veri from "../veri.js";
import { aylaraGore } from "../hesap.js";
import { ekleDugmesi, islemDugmeleri } from "../form.js";
import * as duz from "../duzenle.js";
import { ciktiDugmeleri } from "../cikti.js";
import { faturaPdf, faturaXlsx, esnafPdf, esnafXlsx, esnaflarPdf, esnaflarXlsx, petrolPdf, petrolXlsx } from "../cikti_muhasebe.js";
import { para, paraKesin, sayiYaz, tarihYaz, tarihKisa, ayAdi, ayAnahtari, bugun, eslesir, sirala } from "../bicim.js";

const durum = { fatura: { arama: "", tip: "hepsi" }, esnaf: { arama: "" }, petrol: { arama: "", ay: null } };

// Masaüstündeki gibi her modül kendi ekranıdır: Fatura Yönetimi, Esnaf Defteri, Akaryakıt.
export const faturaSayfasi = async (alt = "tum") => h("div", { class: "sayfa" }, await faturaEkrani(alt));
export const esnafSayfasi = async () => h("div", { class: "sayfa" }, await esnafEkrani());
export const akaryakitSayfasi = async () => h("div", { class: "sayfa" }, await akaryakitEkrani());

// ── Faturalar ───────────────────────────────────────────────────────────────
async function faturaEkrani(alt = "tum") {
  if (alt === "ozet") return faturaOzeti();
  const liste = (await veri.faturalar()).slice().sort((a, b) => (b.tarih ? b.tarih.getTime() : 0) - (a.tarih ? a.tarih.getTime() : 0));
  const d = durum.fatura;
  d.tip = { tum: "hepsi", gelen: "gelen", giden: "giden" }[alt] || "hepsi";   // Tüm Kayıtlar / Gelen / Giden: masaüstündeki sekmeler
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  const aktar = faturaCiktisi(liste);

  function guncelle() {
    const g = liste.filter((f) => (d.tip === "hepsi" || (d.tip === "giden") === f.giden) && (!d.arama || eslesir(`${f.firma} ${f.no} ${f.aciklama}`, d.arama)));
    const toplam = g.reduce((t, f) => t + f.toplam, 0);
    ozet.textContent = d.tip === "hepsi" ? `${g.length} fatura` : `${g.length} fatura · toplam ${para(toplam)}`;
    sonuc.replaceChildren(g.length ? sayfalamali(g, faturaSatiri) : bosDurum("Fatura bulunamadı."));
  }
  guncelle();
  return h("div", {}, veri.yazabilir("fatura") && ekleDugmesi("Yeni fatura", () => duz.faturaFormu(null)),
    aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Firma, fatura no ya da açıklama ara"), h("div", { class: "ozet-sira" }, ozet, aktar), sonuc);
}

// Aylık Özet: ayın gelen / giden toplamları ve KDV farkı (giden KDV - gelen KDV).
// Masaüstündeki Gelen / Giden Fatura Analizi: PDF (kayıtlar, firma cari durumu, özet) ve Excel (gelen/giden yan yana + özet, cari sayfası).
function faturaCiktisi(liste) {
  return ciktiDugmeleri({ dosya: "fatura_raporu", donem: true,
    pdf: { yatay: true, altSol: "Gelen / Giden Fatura Analizi", uret: (c) => faturaPdf(c, liste) },
    xlsx: { uret: (c) => faturaXlsx(c, liste) } });
}

async function faturaOzeti() {
  const tumFaturalar = await veri.faturalar();
  const aylar = aylaraGore(tumFaturalar);
  const sirali = [...aylar.keys()].sort().reverse();
  if (!sirali.length) return bosDurum("Fatura kaydı yok.");
  const toplamla = (liste) => {
    const t = { adet: liste.length, gelen: 0, giden: 0, gelenKdv: 0, gidenKdv: 0, tev: 0 };
    for (const f of liste) { if (f.giden) { t.giden += f.toplam; t.gidenKdv += f.kdv; } else { t.gelen += f.toplam; t.gelenKdv += f.kdv; } t.tev += f.tevTutar; }
    return t;
  };
  const satirlar = sirali.map((a) => [a, toplamla(aylar.get(a))]);
  return h("div", {},
    faturaCiktisi(tumFaturalar),
    satirlar.map(([a, t]) => kart(h("h3", {}, ayAdi(a)), h("p", { class: "soluk" }, `${t.adet} fatura`),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Gelen", para(t.gelen)), bilgiSatiri("Giden", para(t.giden)),
        bilgiSatiri("Gelen KDV", para(t.gelenKdv)), bilgiSatiri("Giden KDV", para(t.gidenKdv)),
        bilgiSatiri("KDV farkı", para(t.gidenKdv - t.gelenKdv), t.gidenKdv - t.gelenKdv > 0 ? "kirmizi" : "yesil"), bilgiSatiri("Tevkifat", para(t.tev))))));
}

function faturaSatiri(f) {
  return satir({
    baslik: f.firma || "Firma yok", alt: [tarihYaz(f.tarih), f.no].filter(Boolean).join(" · "),
    sag: para(f.toplam), sagAlt: f.giden ? "Giden" : "Gelen", ton: f.giden ? "yesil" : "", onclick: () => detayAc(f.firma || "Fatura", () => faturaDetay(f.id)),
  });
}

async function faturaDetay(id) {
  const f = (await veri.faturalar()).find((x) => x.id === id);
  if (!f) return bosDurum("Fatura bulunamadı.");
  const yaz = veri.yazabilir("fatura");
  return h("div", { class: "sayfa" }, kart(
    h("p", { class: "kart-etiket" }, f.giden ? "Giden fatura" : "Gelen fatura"),
    h("p", { class: "buyuk-sayi " + (f.giden ? "yesil" : "") }, paraKesin(f.toplam)),
    bilgiSatiri("Tarih", tarihYaz(f.tarih)), bilgiSatiri("Fatura no", f.no), bilgiSatiri("Firma", f.firma), bilgiSatiri("Açıklama", f.aciklama),
    bilgiSatiri("Matrah", paraKesin(f.matrah)), bilgiSatiri("KDV", `${f.kdvOrani ? f.kdvOrani + " · " : ""}${paraKesin(f.kdv)}`),
    !f.tevkifat.startsWith("Yok") && bilgiSatiri("Tevkifat", `${f.tevkifat} · ${paraKesin(f.tevTutar)}`)),
    yaz && islemDugmeleri({ duzenle: () => duz.faturaFormu(id, { detaydan: true }) }));
}

// ── Esnaf ───────────────────────────────────────────────────────────────────
async function esnafEkrani() {
  const liste = (await veri.esnaflar()).slice().sort((a, b) => b.bakiye - a.bakiye || sirala(a.isim, b.isim));
  const d = durum.esnaf;
  const sonuc = h("div");
  const borc = liste.reduce((t, e) => t + Math.max(0, e.bakiye), 0);

  function guncelle() {
    const g = liste.filter((e) => !d.arama || eslesir(e.isim, d.arama));
    sonuc.replaceChildren(g.length ? h("div", { class: "liste" }, g.map(esnafSatiri)) : bosDurum("Esnaf bulunamadı."));
  }
  guncelle();
  return h("div", {},
    kart(h("p", { class: "kart-etiket" }, "Toplam borç"), h("p", { class: "buyuk-sayi" }, para(borc)), h("p", { class: "soluk" }, `${liste.filter((e) => e.bakiye > 0.01).length} esnafa borç var`)),
    veri.yazabilir("esnaf") && ekleDugmesi("Yeni esnaf", () => duz.esnafFormu(null)),
    aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Esnaf ara"),
    ciktiDugmeleri({ dosya: "esnaf_raporu", donem: true,
      pdf: { yatay: true, altSol: "Esnaf Hesap Raporu", uret: (c) => esnaflarPdf(c, liste) },
      xlsx: { uret: (c) => esnaflarXlsx(c, liste) } }), sonuc);
}

function esnafSatiri(e) {
  const borcVar = e.bakiye > 0.01;
  return satir({ baslik: e.isim, alt: `${e.islemler.length} işlem`, sag: borcVar ? para(e.bakiye) : "Borç yok", ton: borcVar ? "kirmizi" : "yesil", onclick: () => detayAc(e.isim, () => esnafDetay(e.id)) });
}

async function esnafDetay(id) {
  const e = (await veri.esnaflar()).find((x) => x.id === id);
  if (!e) return bosDurum("Esnaf bulunamadı.");
  const yaz = veri.yazabilir("esnaf");
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "kart-etiket" }, "Kalan borç"), h("p", { class: "buyuk-sayi " + (e.bakiye > 0.01 ? "kirmizi" : "yesil") }, para(Math.max(0, e.bakiye))),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Toplam işlem", para(e.borc)), bilgiSatiri("Ödenen", para(e.odenen)))),
    ciktiDugmeleri({ dosya: "esnaf_hesap", donem: true,
      pdf: { yatay: true, altSol: e.isim, uret: (c) => esnafPdf(c, e) },
      xlsx: { uret: (c) => esnafXlsx(c, e) } }),
    yaz && h("div", { class: "iki-sutun" },
      h("button", { class: "dugme birincil", type: "button", onclick: () => duz.esnafIslemFormu(id, null) }, "İşlem ekle"),
      h("button", { class: "dugme birincil", type: "button", onclick: () => duz.esnafIslemFormu(id, null, { odeme: true }) }, "Ödeme ekle")),
    kart(h("h3", {}, "İşlemler"), e.islemler.length
      ? h("div", { class: "liste" }, e.islemler.slice(0, 100).map((i) => satir({
        baslik: i.odeme ? "Ödeme" : i.aciklama || "İşlem", alt: [tarihYaz(i.tarih), i.plaka].filter(Boolean).join(" · "),
        sag: para(i.toplam), ton: i.odeme ? "yesil" : "", onclick: yaz ? () => duz.esnafIslemFormu(id, i.id) : undefined })))
      : bosDurum("İşlem yok.")),
    yaz && islemDugmeleri({ duzenle: () => duz.esnafFormu(id, { detaydan: true }) }));
}

// ── Akaryakıt ───────────────────────────────────────────────────────────────
async function akaryakitEkrani() {
  const liste = await veri.akaryakit();
  const aylar = aylaraGore(liste);
  const sirali = [...aylar.keys()].sort().reverse();
  const d = durum.petrol;
  const bu = ayAnahtari(bugun());
  const yeni = veri.yazabilir("petrol") && ekleDugmesi("Yeni akaryakıt kaydı", () => duz.akaryakitFormu(null));
  if (!sirali.length) return h("div", {}, yeni, bosDurum("Akaryakıt kaydı yok."));
  if (!sirali.includes(d.ay)) d.ay = sirali.includes(bu) ? bu : sirali[0];

  const kap = h("div");
  function guncelle() {
    const ay = (aylar.get(d.ay) || []);
    const alim = ay.filter((r) => !r.odeme);
    const tutar = alim.reduce((t, r) => t + r.tutar, 0);
    const litre = alim.reduce((t, r) => t + r.litre, 0);
    kap.replaceChildren(
      yeni,
      ayCubugu(sirali, d.ay, (a) => { d.ay = a; guncelle(); }, ayAdi),
      kart(h("p", { class: "kart-etiket" }, "Yakıt alımı"), h("p", { class: "buyuk-sayi" }, para(tutar)), h("p", { class: "soluk" }, `${alim.length} alım${litre ? ` · ${sayiYaz(litre)} lt` : ""}`)),
      aramaKutusu(d.arama, (v) => { d.arama = v; ara(); }, "Plaka ya da istasyon ara"),
      ciktiDugmeleri({ dosya: "akaryakit_ekstre", donem: true, varsayilanAy: () => d.ay,
        pdf: { yatay: false, altSol: "Akaryakıt Hesap Ekstresi", uret: (c) => petrolPdf(c, liste.filter((r) => !d.arama || eslesir(`${r.plaka} ${r.istasyon}`, d.arama))) },
        xlsx: { uret: (c) => petrolXlsx(c, liste.filter((r) => !d.arama || eslesir(`${r.plaka} ${r.istasyon}`, d.arama))) } }),
      h("div", { id: "yakit-liste" }));
    ara();
  }
  function ara() {
    const ay = aylar.get(d.ay) || [];
    const g = ay.filter((r) => !d.arama || eslesir(`${r.plaka} ${r.istasyon}`, d.arama));
    const alan = kap.querySelector("#yakit-liste");
    alan.replaceChildren(g.length ? sayfalamali(g, (r) => satir({
      baslik: r.plaka || "Plaka yok", alt: [tarihKisa(r.tarih), r.istasyon, r.litre ? `${sayiYaz(r.litre)} lt` : ""].filter(Boolean).join(" · "),
      sag: para(r.tutar), sagAlt: r.odeme ? "İstasyona ödeme" : "", ton: r.odeme ? "yesil" : "",
      onclick: veri.yazabilir("petrol") ? () => duz.akaryakitFormu(r.id) : undefined })) : bosDurum("Kayıt bulunamadı."));
  }
  guncelle();
  return kap;
}
