// Araç Yönetimi (belge bitişleri, bakım) ve İç Hizmetler ekranları. Bu ilk sürümde yalnızca görüntüleme.
import { h, kart, satir, bilgiSatiri, cipler, segment, aramaKutusu, ayCubugu, sayfalamali, bosDurum, detayAc, ikon } from "../ui.js";
import * as veri from "../veri.js";
import { aylaraGore } from "../hesap.js";
import { para, sayiYaz, tarihYaz, tarihKisa, ayAdi, ayAnahtari, bugun, eslesir, sirala, telefonTemizle } from "../bicim.js";

const durum = { arac: { arama: "", filtre: "hepsi" }, ic: { arama: "", ay: null } };
export const kalanYaz = (gun) => (gun === 0 ? "Bugün bitiyor" : gun > 0 ? `${gun} gün kaldı` : `${-gun} gün geçti`);
export const belgeTonu = (seviye) => ({ gecmis: "kirmizi", yakin: "kehribar", iyi: "yesil" })[seviye];

// Masaüstündeki gibi her modül kendi ekranıdır: Araç Yönetimi, İç Hizmetler.
export const aracSayfasi = async () => h("div", { class: "sayfa" }, await aracEkrani());
export const icHizmetSayfasi = async () => h("div", { class: "sayfa" }, await icHizmetEkrani());

// ── Araçlar ─────────────────────────────────────────────────────────────────
async function aracEkrani() {
  const liste = (await veri.araclar()).slice().sort((a, b) => sirala(a.plaka, b.plaka));
  const sorunlu = (a) => a.belgeler.some((b) => b.seviye !== "iyi");
  const d = durum.arac;
  const sonuc = h("div");
  const cipAlani = h("div");

  function guncelle() {
    cipAlani.replaceChildren(cipler([["hepsi", "Hepsi", liste.length], ["sorunlu", "Süresi yaklaşan", liste.filter(sorunlu).length]], d.filtre, (k) => { d.filtre = k; guncelle(); }));
    const g = liste.filter((a) => (d.filtre === "hepsi" || sorunlu(a)) && (!d.arama || eslesir(`${a.plaka} ${a.firma} ${a.sofor} ${a.marka} ${a.model}`, d.arama)));
    sonuc.replaceChildren(g.length ? sayfalamali(g, aracSatiri) : bosDurum("Araç bulunamadı."));
  }
  guncelle();
  return h("div", {}, aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Plaka, firma ya da şoför ara"), cipAlani, sonuc);
}

function aracSatiri(a) {
  const b = a.belgeler.slice().sort((x, y) => x.gun - y.gun)[0];
  return satir({
    baslik: a.plaka, alt: [a.firma, `${a.marka} ${a.model}`.trim()].filter(Boolean).join(" · "),
    sag: b && b.seviye !== "iyi" ? b.ad : "", sagAlt: b && b.seviye !== "iyi" ? kalanYaz(b.gun) : "", ton: b ? belgeTonu(b.seviye) : "",
    onclick: () => aracAc(a.id, a.plaka),
  });
}

export function aracAc(id, plaka) {
  detayAc(plaka, async () => {
    const a = (await veri.araclar()).find((x) => x.id === id);
    return a ? aracDetay(a) : bosDurum("Araç bulunamadı.");
  });
}

function aracDetay(a) {
  const tel = telefonTemizle(a.soforTel);
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, a.firma), h("p", { class: "buyuk-sayi baslik" }, `${a.marka} ${a.model}`.trim() || a.plaka),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Yıl", a.yil), bilgiSatiri("Yakıt", a.yakit), bilgiSatiri("Kilometre", a.km))),
    a.sofor && kart(h("h3", {}, "Şoför"), h("div", { class: "telefon" },
      h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, a.sofor), h("span", { class: "satir-alt" }, a.soforTel)),
      tel && h("a", { class: "ikon-dugme dolu", href: "tel:" + tel, "aria-label": "Şoförü ara" }, ikon("telefon", 20)))),
    kart(h("h3", {}, "Belgeler"), a.belgeler.length
      ? h("div", { class: "liste" }, a.belgeler.map((b) => satir({ baslik: b.ad, alt: `${b.bakim ? "Sonraki: " : "Bitiş: "}${tarihYaz(b.son)}`, sag: kalanYaz(b.gun), ton: belgeTonu(b.seviye) })))
      : bosDurum("Belge tarihi girilmemiş.")),
    a.kayitlar.length > 0 && kart(h("h3", {}, "Bakım ve harcamalar"),
      h("div", { class: "liste" }, a.kayitlar.slice(0, 30).map((k) => satir({ baslik: k.aciklama || k.tur, alt: `${tarihYaz(k.tarih)} · ${k.tur}`, sag: k.tutar ? para(k.tutar) : "" })))));
}

// ── İç hizmet ───────────────────────────────────────────────────────────────
async function icHizmetEkrani() {
  const liste = await veri.icHizmet();
  const aylar = aylaraGore(liste);
  const sirali = [...aylar.keys()].sort().reverse();
  const d = durum.ic;
  if (!sirali.length) return bosDurum("İç hizmet kaydı yok.");
  const bu = ayAnahtari(bugun());
  if (!sirali.includes(d.ay)) d.ay = sirali.includes(bu) ? bu : sirali[0];

  const kap = h("div");
  function guncelle() {
    const ay = aylar.get(d.ay) || [];
    const tutar = ay.reduce((t, s) => t + s.tutar, 0);
    const kisi = ay.reduce((t, s) => t + s.kisi, 0);
    kap.replaceChildren(
      ayCubugu(sirali, d.ay, (a) => { d.ay = a; guncelle(); }, ayAdi),
      kart(h("p", { class: "kart-etiket" }, "Seferler"), h("p", { class: "buyuk-sayi" }, para(tutar)), h("p", { class: "soluk" }, `${ay.length} sefer · ${sayiYaz(kisi)} kişi`)),
      aramaKutusu(d.arama, (v) => { d.arama = v; ara(); }, "Plaka, şoför, güzergah ya da yer ara"),
      h("div", { id: "ic-liste" }));
    ara();
  }
  function ara() {
    const g = (aylar.get(d.ay) || []).filter((s) => !d.arama || eslesir(`${s.plaka} ${s.sofor} ${s.guzergah} ${s.yer} ${s.personel}`, d.arama));
    kap.querySelector("#ic-liste").replaceChildren(g.length ? sayfalamali(g, (s) => satir({
      baslik: [s.plaka, s.guzergah].filter(Boolean).join(" · "), alt: [`${tarihKisa(s.tarih)} ${s.saat}`.trim(), s.yer].filter(Boolean).join(" · "),
      sag: para(s.tutar), sagAlt: s.kisi ? `${s.kisi} kişi` : "", onclick: () => detayAc(s.plaka || "Sefer", () => seferDetay(s)),
    })) : bosDurum("Sefer bulunamadı."));
  }
  guncelle();
  return kap;
}

function seferDetay(s) {
  return h("div", { class: "sayfa" }, kart(
    h("p", { class: "kart-etiket" }, "Tutar"), h("p", { class: "buyuk-sayi" }, para(s.tutar)),
    bilgiSatiri("Tarih", `${tarihYaz(s.tarih)} ${s.saat}`.trim()), bilgiSatiri("Plaka", s.plaka), bilgiSatiri("Şoför", s.sofor), bilgiSatiri("Güzergah", s.guzergah),
    bilgiSatiri("Gidilen yer", s.yer), bilgiSatiri("Kişi sayısı", s.kisi ? String(s.kisi) : ""), bilgiSatiri("Personel", s.personel),
    bilgiSatiri("Fiş no", s.fis), bilgiSatiri("Açıklama", s.aciklama)));
}
