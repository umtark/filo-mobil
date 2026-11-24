// Muhasebe: faturalar, esnaf hesapları, akaryakıt. Bu ilk sürümde yalnızca görüntüleme.
import { h, kart, satir, bilgiSatiri, cipler, segment, aramaKutusu, ayCubugu, sayfalamali, bosDurum, detayAc } from "../ui.js";
import * as veri from "../veri.js";
import { aylaraGore } from "../hesap.js";
import { para, paraKesin, sayiYaz, tarihYaz, tarihKisa, ayAdi, ayAnahtari, bugun, eslesir, sirala } from "../bicim.js";

const BOLUMLER = [["fatura", "Faturalar"], ["esnaf", "Esnaf"], ["petrol", "Akaryakıt"]];
const durum = { bolum: null, fatura: { arama: "", tip: "hepsi" }, esnaf: { arama: "" }, petrol: { arama: "", ay: null } };

export const mevcutBolumler = () => BOLUMLER.filter(([k]) => veri.izinVar(k));

export async function ciz(yeniden) {
  const bolumler = mevcutBolumler();
  if (!bolumler.some(([k]) => k === durum.bolum)) durum.bolum = bolumler[0][0];
  const icerik = await { fatura: faturaEkrani, esnaf: esnafEkrani, petrol: akaryakitEkrani }[durum.bolum]();
  return h("div", { class: "sayfa" }, bolumler.length > 1 && segment(bolumler, durum.bolum, (k) => { durum.bolum = k; yeniden(); }), icerik);
}

// ── Faturalar ───────────────────────────────────────────────────────────────
async function faturaEkrani() {
  const liste = (await veri.faturalar()).slice().sort((a, b) => (b.tarih ? b.tarih.getTime() : 0) - (a.tarih ? a.tarih.getTime() : 0));
  const d = durum.fatura;
  const sonuc = h("div");
  const cipAlani = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });

  function guncelle() {
    cipAlani.replaceChildren(cipler([["hepsi", "Hepsi"], ["giden", "Giden"], ["gelen", "Gelen"]], d.tip, (k) => { d.tip = k; guncelle(); }));
    const g = liste.filter((f) => (d.tip === "hepsi" || (d.tip === "giden") === f.giden) && (!d.arama || eslesir(`${f.firma} ${f.no} ${f.aciklama}`, d.arama)));
    const toplam = g.reduce((t, f) => t + f.toplam, 0);
    ozet.textContent = d.tip === "hepsi" ? `${g.length} fatura` : `${g.length} fatura · toplam ${para(toplam)}`;
    sonuc.replaceChildren(g.length ? sayfalamali(g, faturaSatiri) : bosDurum("Fatura bulunamadı."));
  }
  guncelle();
  return h("div", {}, aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Firma, fatura no ya da açıklama ara"), cipAlani, ozet, sonuc);
}

function faturaSatiri(f) {
  return satir({
    baslik: f.firma || "Firma yok", alt: [tarihYaz(f.tarih), f.no].filter(Boolean).join(" · "),
    sag: para(f.toplam), sagAlt: f.giden ? "Giden" : "Gelen", ton: f.giden ? "yesil" : "", onclick: () => detayAc(f.firma || "Fatura", () => faturaDetay(f)),
  });
}

function faturaDetay(f) {
  return h("div", { class: "sayfa" }, kart(
    h("p", { class: "kart-etiket" }, f.giden ? "Giden fatura" : "Gelen fatura"),
    h("p", { class: "buyuk-sayi " + (f.giden ? "yesil" : "") }, paraKesin(f.toplam)),
    bilgiSatiri("Tarih", tarihYaz(f.tarih)), bilgiSatiri("Fatura no", f.no), bilgiSatiri("Firma", f.firma), bilgiSatiri("Açıklama", f.aciklama),
    bilgiSatiri("Matrah", paraKesin(f.matrah)), bilgiSatiri("KDV", `${f.kdvOrani ? f.kdvOrani + " · " : ""}${paraKesin(f.kdv)}`),
    f.tevkifat !== "Yok" && bilgiSatiri("Tevkifat", `${f.tevkifat} · ${paraKesin(f.tevTutar)}`)));
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
    aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Esnaf ara"), sonuc);
}

function esnafSatiri(e) {
  const borcVar = e.bakiye > 0.01;
  return satir({ baslik: e.isim, alt: `${e.islemler.length} işlem`, sag: borcVar ? para(e.bakiye) : "Borç yok", ton: borcVar ? "kirmizi" : "yesil", onclick: () => detayAc(e.isim, () => esnafDetay(e.id)) });
}

async function esnafDetay(id) {
  const e = (await veri.esnaflar()).find((x) => x.id === id);
  if (!e) return bosDurum("Esnaf bulunamadı.");
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "kart-etiket" }, "Kalan borç"), h("p", { class: "buyuk-sayi " + (e.bakiye > 0.01 ? "kirmizi" : "yesil") }, para(Math.max(0, e.bakiye))),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Toplam işlem", para(e.borc)), bilgiSatiri("Ödenen", para(e.odenen)))),
    kart(h("h3", {}, "İşlemler"), e.islemler.length
      ? h("div", { class: "liste" }, e.islemler.slice(0, 100).map((i) => satir({
        baslik: i.odeme ? "Ödeme" : i.aciklama || "İşlem", alt: [tarihYaz(i.tarih), i.plaka].filter(Boolean).join(" · "),
        sag: para(i.toplam), ton: i.odeme ? "yesil" : "" })))
      : bosDurum("İşlem yok.")));
}

// ── Akaryakıt ───────────────────────────────────────────────────────────────
async function akaryakitEkrani() {
  const liste = await veri.akaryakit();
  const aylar = aylaraGore(liste);
  const sirali = [...aylar.keys()].sort().reverse();
  const d = durum.petrol;
  const bu = ayAnahtari(bugun());
  if (!sirali.length) return bosDurum("Akaryakıt kaydı yok.");
  if (!sirali.includes(d.ay)) d.ay = sirali.includes(bu) ? bu : sirali[0];

  const kap = h("div");
  function guncelle() {
    const ay = (aylar.get(d.ay) || []);
    const alim = ay.filter((r) => !r.odeme);
    const tutar = alim.reduce((t, r) => t + r.tutar, 0);
    const litre = alim.reduce((t, r) => t + r.litre, 0);
    kap.replaceChildren(
      ayCubugu(sirali, d.ay, (a) => { d.ay = a; guncelle(); }, ayAdi),
      kart(h("p", { class: "kart-etiket" }, "Yakıt alımı"), h("p", { class: "buyuk-sayi" }, para(tutar)), h("p", { class: "soluk" }, `${alim.length} alım${litre ? ` · ${sayiYaz(litre)} lt` : ""}`)),
      aramaKutusu(d.arama, (v) => { d.arama = v; ara(); }, "Plaka ya da istasyon ara"),
      h("div", { id: "yakit-liste" }));
    ara();
  }
  function ara() {
    const ay = aylar.get(d.ay) || [];
    const g = ay.filter((r) => !d.arama || eslesir(`${r.plaka} ${r.istasyon}`, d.arama));
    const alan = kap.querySelector("#yakit-liste");
    alan.replaceChildren(g.length ? sayfalamali(g, (r) => satir({
      baslik: r.plaka || "Plaka yok", alt: [tarihKisa(r.tarih), r.istasyon, r.litre ? `${sayiYaz(r.litre)} lt` : ""].filter(Boolean).join(" · "),
      sag: para(r.tutar), sagAlt: r.odeme ? "İstasyona ödeme" : "", ton: r.odeme ? "yesil" : "" })) : bosDurum("Kayıt bulunamadı."));
  }
  guncelle();
  return kap;
}
