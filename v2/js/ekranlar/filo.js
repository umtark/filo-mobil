// Araç Yönetimi (belge bitişleri, bakım) ve İç Hizmetler ekranları. Bu ilk sürümde yalnızca görüntüleme.
import { h, kart, satir, bilgiSatiri, cipler, segment, aramaKutusu, ayCubugu, sayfalamali, bosDurum, detayAc, ikon } from "../ui.js";
import * as veri from "../veri.js";
import { aylaraGore } from "../hesap.js";
import { ekleDugmesi, islemDugmeleri } from "../form.js";
import * as duz from "../duzenle.js";
import { aktarDugmesi } from "../rapor.js";
import { para, sayiYaz, tarihYaz, tarihKisa, ayAdi, ayAnahtari, bugun, eslesir, sirala, telefonTemizle } from "../bicim.js";

const durum = { arac: { arama: "", filtre: "hepsi" }, ic: { arama: "", ay: null }, kayit: { arama: "" } };
export const kalanYaz = (gun) => (gun === 0 ? "Bugün bitiyor" : gun > 0 ? `${gun} gün kaldı` : `${-gun} gün geçti`);
export const belgeTonu = (seviye) => ({ gecmis: "kirmizi", yakin: "kehribar", iyi: "yesil" })[seviye];

// Masaüstündeki gibi her modül kendi ekranıdır: Araç Yönetimi, İç Hizmetler.
export const aracSayfasi = async (alt = "liste") => h("div", { class: "sayfa" }, await (alt === "liste" ? aracEkrani() : kayitEkrani(alt)));
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
  return h("div", {}, veri.yazabilir("arac") && ekleDugmesi("Yeni araç", () => duz.aracFormu(null)),
    aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Plaka, firma ya da şoför ara"), cipAlani, sonuc);
}

// Masaüstündeki Yağ Bakımı / Genel Tamir-Bakım / Harcamalar sekmeleri: tüm araçların kayıtları tek listede (plaka ile).
const KAYIT_ADLARI = { yag: "yağ bakımı", bakim: "tamir-bakım", harcama: "harcama" };
const KAYIT_TURLERI = {
  yag: { alan: "yagKayitlari", bos: "Yağ bakımı kaydı yok.", toplam: false },
  bakim: { alan: "bakimKayitlari", bos: "Tamir-bakım kaydı yok.", toplam: true },
  harcama: { alan: "harcamaKayitlari", bos: "Harcama kaydı yok.", toplam: true },
};

async function kayitEkrani(tur) {
  const t = KAYIT_TURLERI[tur];
  const araclar = await veri.araclar();
  const tumu = araclar.flatMap((a) => a[t.alan].map((k) => ({ ...k, plaka: a.plaka, aracId: a.id })))
    .sort((x, y) => (y.tarih ? y.tarih.getTime() : 0) - (x.tarih ? x.tarih.getTime() : 0));
  const yaz = veri.yazabilir("arac");
  const yeni = yaz && ekleDugmesi(`Yeni ${KAYIT_ADLARI[tur]} kaydı`, () => duz.aracKayitFormu(null, tur, null));
  if (!tumu.length) return h("div", {}, yeni, bosDurum(t.bos));
  const d = durum.kayit;
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  const kayitTikla = (k) => (yaz ? () => duz.aracKayitFormu(k.aracId, tur, k.id) : () => aracAc(k.aracId, k.plaka));
  const satirOlustur = (k) => satir(tur === "yag"
    ? { baslik: k.plaka, alt: [tarihYaz(k.tarih), k.km && `${k.km} km`, k.usta].filter(Boolean).join(" · "), sag: k.yag, sagAlt: k.litre && `${k.litre} lt`, onclick: kayitTikla(k) }
    : { baslik: k.aciklama || k.tur, alt: [k.plaka, tarihYaz(k.tarih)].filter(Boolean).join(" · "), sag: k.tutar ? para(k.tutar) : "", onclick: kayitTikla(k) });

  function guncelle() {
    const g = tumu.filter((k) => !d.arama || eslesir(`${k.plaka} ${k.aciklama || ""} ${k.yag || ""} ${k.usta || ""} ${k.yaptiran || ""} ${k.not || ""}`, d.arama));
    ozet.textContent = t.toplam ? `${g.length} kayıt · toplam ${para(g.reduce((s, k) => s + k.tutar, 0))}` : `${g.length} kayıt`;
    sonuc.replaceChildren(g.length ? sayfalamali(g, satirOlustur) : bosDurum("Kayıt bulunamadı."));
  }
  guncelle();
  return h("div", {}, yeni, aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, "Plaka ya da açıklama ara"), ozet, sonuc);
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

// Kart başlığı: sağda "Ekle" düğmesi (yazma yetkisi varsa).
const kartBasligi = (ad, ekle) => h("div", { class: "kart-baslik" }, h("h3", {}, ad), ekle && h("button", { class: "dugme ikincil kucuk", type: "button", onclick: ekle }, ikon("arti", 16), "Ekle"));

function aracDetay(a) {
  const tel = telefonTemizle(a.soforTel);
  const yaz = veri.yazabilir("arac");
  const duzenleKayit = (tur, k) => (yaz ? () => duz.aracKayitFormu(a.id, tur, k.id) : undefined);
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, a.firma), h("p", { class: "buyuk-sayi baslik" }, `${a.marka} ${a.model}`.trim() || a.plaka),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Yıl", a.yil), bilgiSatiri("Yakıt", a.yakit), bilgiSatiri("Kilometre", a.km))),
    a.sofor && kart(h("h3", {}, "Şoför"), h("div", { class: "telefon" },
      h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, a.sofor), h("span", { class: "satir-alt" }, a.soforTel)),
      tel && h("a", { class: "ikon-dugme dolu", href: "tel:" + tel, "aria-label": "Şoförü ara" }, ikon("telefon", 20)))),
    kart(h("h3", {}, "Belgeler"), a.belgeler.length
      ? h("div", { class: "liste" }, a.belgeler.map((b) => satir({ baslik: b.ad, alt: `${b.bakim ? "Sonraki: " : "Bitiş: "}${tarihYaz(b.son)}`, sag: kalanYaz(b.gun), ton: belgeTonu(b.seviye) })))
      : bosDurum("Belge tarihi girilmemiş.")),
    (yaz || a.yagKayitlari.length > 0) && kart(kartBasligi("Yağ bakımı", yaz && (() => duz.aracKayitFormu(a.id, "yag", null))),
      a.yagKayitlari.length ? h("div", { class: "liste" }, a.yagKayitlari.slice(0, 30).map((k) => satir({ baslik: [k.yag, k.litre && `${k.litre} lt`].filter(Boolean).join(" · ") || "Yağ bakımı", alt: [tarihYaz(k.tarih), k.km && `${k.km} km`, ...k.degisenler].filter(Boolean).join(" · "), sagAlt: k.usta, onclick: duzenleKayit("yag", k) }))) : bosDurum("Yağ bakımı kaydı yok.")),
    (yaz || a.bakimKayitlari.length > 0) && kart(kartBasligi("Tamir-bakım", yaz && (() => duz.aracKayitFormu(a.id, "bakim", null))),
      a.bakimKayitlari.length ? h("div", { class: "liste" }, a.bakimKayitlari.slice(0, 30).map((k) => satir({ baslik: k.aciklama || k.tur, alt: tarihYaz(k.tarih), sag: k.tutar ? para(k.tutar) : "", onclick: duzenleKayit("bakim", k) }))) : bosDurum("Tamir-bakım kaydı yok.")),
    (yaz || a.harcamaKayitlari.length > 0) && kart(kartBasligi("Harcamalar", yaz && (() => duz.aracKayitFormu(a.id, "harcama", null))),
      a.harcamaKayitlari.length ? h("div", { class: "liste" }, a.harcamaKayitlari.slice(0, 30).map((k) => satir({ baslik: k.aciklama || k.tur, alt: tarihYaz(k.tarih), sag: k.tutar ? para(k.tutar) : "", onclick: duzenleKayit("harcama", k) }))) : bosDurum("Harcama kaydı yok.")),
    yaz && islemDugmeleri({ duzenle: () => duz.aracFormu(a.id, { detaydan: true }) }));
}

// ── İç hizmet ───────────────────────────────────────────────────────────────
async function icHizmetEkrani() {
  const liste = await veri.icHizmet();
  const aylar = aylaraGore(liste);
  const sirali = [...aylar.keys()].sort().reverse();
  const d = durum.ic;
  const yeni = veri.yazabilir("ic_hizmet") && ekleDugmesi("Yeni sefer", () => duz.icHizmetFormu(null));
  if (!sirali.length) return h("div", {}, yeni, bosDurum("İç hizmet kaydı yok."));
  const bu = ayAnahtari(bugun());
  if (!sirali.includes(d.ay)) d.ay = sirali.includes(bu) ? bu : sirali[0];

  const kap = h("div");
  function guncelle() {
    const ay = aylar.get(d.ay) || [];
    const tutar = ay.reduce((t, s) => t + s.tutar, 0);
    const kisi = ay.reduce((t, s) => t + s.kisi, 0);
    kap.replaceChildren(
      yeni,
      ayCubugu(sirali, d.ay, (a) => { d.ay = a; guncelle(); }, ayAdi),
      kart(h("p", { class: "kart-etiket" }, "Seferler"), h("p", { class: "buyuk-sayi" }, para(tutar)), h("p", { class: "soluk" }, `${ay.length} sefer · ${sayiYaz(kisi)} kişi`)),
      aramaKutusu(d.arama, (v) => { d.arama = v; ara(); }, "Plaka, şoför, güzergah ya da yer ara"),
      aktarDugmesi(() => [`ic-hizmet-${d.ay}`, ["Tarih", "Saat", "Plaka", "Şoför", "Güzergah", "Gidilen yer", "Kişi", "Personel", "Tutar", "Fiş no"],
        (aylar.get(d.ay) || []).map((s) => [s.tarih, s.saat, s.plaka, s.sofor, s.guzergah, s.yer, s.kisi, s.personel, s.tutar, s.fis])]),
      h("div", { id: "ic-liste" }));
    ara();
  }
  function ara() {
    const g = (aylar.get(d.ay) || []).filter((s) => !d.arama || eslesir(`${s.plaka} ${s.sofor} ${s.guzergah} ${s.yer} ${s.personel}`, d.arama));
    kap.querySelector("#ic-liste").replaceChildren(g.length ? sayfalamali(g, (s) => satir({
      baslik: [s.plaka, s.guzergah].filter(Boolean).join(" · "), alt: [`${tarihKisa(s.tarih)} ${s.saat}`.trim(), s.yer].filter(Boolean).join(" · "),
      sag: para(s.tutar), sagAlt: s.kisi ? `${s.kisi} kişi` : "", onclick: () => detayAc(s.plaka || "Sefer", () => seferDetay(s.id)),
    })) : bosDurum("Sefer bulunamadı."));
  }
  guncelle();
  return kap;
}

async function seferDetay(id) {
  const s = (await veri.icHizmet()).find((x) => x.id === id);
  if (!s) return bosDurum("Sefer bulunamadı.");
  return h("div", { class: "sayfa" }, kart(
    h("p", { class: "kart-etiket" }, "Tutar"), h("p", { class: "buyuk-sayi" }, para(s.tutar)),
    bilgiSatiri("Tarih", `${tarihYaz(s.tarih)} ${s.saat}`.trim()), bilgiSatiri("Plaka", s.plaka), bilgiSatiri("Şoför", s.sofor), bilgiSatiri("Güzergah", s.guzergah),
    bilgiSatiri("Gidilen yer", s.yer), bilgiSatiri("Kişi sayısı", s.kisi ? String(s.kisi) : ""), bilgiSatiri("Personel", s.personel),
    bilgiSatiri("Fiş no", s.fis), bilgiSatiri("Açıklama", s.aciklama)),
    veri.yazabilir("ic_hizmet") && islemDugmeleri({ duzenle: () => duz.icHizmetFormu(id, { detaydan: true }) }));
}
