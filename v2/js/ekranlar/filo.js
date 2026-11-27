// Araç Yönetimi (belge bitişleri, bakım) ve İç Hizmetler ekranları. Bu ilk sürümde yalnızca görüntüleme.
import { h, kart, satir, bilgiSatiri, cipler, segment, aramaKutusu, ayCubugu, sayfalamali, bosDurum, detayAc, detayYenile, ikon, yukleniyor, hataGoster } from "../ui.js";
import * as veri from "../veri.js";
import * as api from "../api.js";
import { goruntule } from "../dosya.js";
import { aylaraGore } from "../hesap.js";
import { ekleDugmesi, islemDugmeleri } from "../form.js";
import * as duz from "../duzenle.js";
import { iceAktarDugmesi } from "../ice_aktar.js";
import { ciktiDugmeleri } from "../cikti.js";
import { aracPdf, aracXlsx, icHizmetPdf, icHizmetXlsx } from "../cikti_filo.js";
import { aracFirmaSecenekleri, aracFirmaSuz } from "../firma_suz.js";
import { baslik as mb, etiket as me, duz as md } from "../metin.js";
import { para, sayiYaz, tarihYaz, tarihKisa, ayAdi, ayAnahtari, bugun, eslesir, sirala, telefonTemizle, tarihCoz } from "../bicim.js";

const durum = { arac: { arama: "", filtre: "hepsi", firma: "" }, ic: { arama: "", ay: null }, kayit: { arama: "" } };
export const kalanYaz = (gun) => (gun === 0 ? "Bugün bitiyor" : gun > 0 ? `${gun} gün kaldı` : `${-gun} gün geçti`);
export const belgeTonu = (seviye) => ({ gecmis: "kirmizi", yakin: "kehribar", iyi: "yesil" })[seviye];

// Masaüstündeki gibi her modül kendi ekranıdır: Araç Yönetimi, İç Hizmetler.
export const aracSayfasi = async (alt = "liste") => h("div", { class: "sayfa" }, await (alt === "liste" ? aracEkrani() : kayitEkrani(alt)));
export const icHizmetSayfasi = async () => h("div", { class: "sayfa" }, await icHizmetEkrani());

// ── Araçlar ─────────────────────────────────────────────────────────────────
const ARAC_SECENEK = [{ k: "bakim", ad: mb("export_include_bakim_harcama"), v: false }];
const aracFirmalari = async () => aracFirmaSecenekleri(await veri.hamListe("araclar"));
const aracCiktisi = async (c) => aracFirmaSuz(await veri.hamListe("araclar"), c.firmaSecim);

// Ana sayfadaki Filo Özeti firma satırı buraya gelir: liste o firmanın araçlarıyla açılır (firma, özetteki gruplamayla aynı biçimde karşılaştırılır).
export const aracDurumu = durum.arac;
const firmaAnahtari = (a) => String(a.firma || a.kurum || "").split(/\s+/).join(" ").trim().toLocaleLowerCase("tr");

async function aracEkrani() {
  const d = durum.arac;
  const secili = d.firma === mb("belirtilmemis") ? "" : d.firma.toLocaleLowerCase("tr");
  const tumListe = (await veri.araclar()).slice().sort((a, b) => sirala(a.plaka, b.plaka));
  const liste = d.firma ? tumListe.filter((a) => firmaAnahtari(a) === secili) : tumListe;
  const sorunlu = (a) => a.belgeler.some((b) => b.seviye !== "iyi");
  const sonuc = h("div");
  const cipAlani = h("div");
  const firmaCipi = d.firma && h("button", { class: "firma-filtre", type: "button", "aria-label": `${d.firma} süzgecini kaldır`, onclick: () => { d.firma = ""; detayYenile({ kok: true }); } },
    h("span", {}, d.firma), ikon("kapat", 16));

  function guncelle() {
    cipAlani.replaceChildren(cipler([["hepsi", mb("flt_tip_tumu"), liste.length], ["sorunlu", "Süresi yaklaşan", liste.filter(sorunlu).length]], d.filtre, (k) => { d.filtre = k; guncelle(); }));
    const g = liste.filter((a) => (d.filtre === "hepsi" || sorunlu(a)) && (!d.arama || eslesir(`${a.plaka} ${a.firma} ${a.sofor} ${a.marka} ${a.model} ${a.kurum || ""}`, d.arama)));
    sonuc.replaceChildren(g.length ? sayfalamali(g, aracSatiri) : bosDurum("Araç bulunamadı."));
  }
  guncelle();
  return h("div", {}, veri.yazabilir("arac") && ekleDugmesi(md("qpushbutton__yeni_arac_ekle"), () => duz.aracFormu(null)),
    aramaKutusu(d.arama, (v) => { d.arama = v; guncelle(); }, mb("arac_carsaf_ara_placeholder")),
    ciktiDugmeleri({ dosya: "arac_kayitlari",
      pdf: { yatay: true, altSol: "Araç Kayıtları Analiz Raporu", secenekler: ARAC_SECENEK, firmalar: aracFirmalari, uret: async (c) => aracPdf(c, await aracCiktisi(c)) },
      xlsx: { secenekler: ARAC_SECENEK, firmalar: aracFirmalari, uret: async (c) => aracXlsx(c, await aracCiktisi(c)) } }),
    firmaCipi, cipAlani, sonuc);
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

export async function aracKayitAc(id) {
  const a = (await veri.araclar()).find((x) => x.id === id);
  if (a) aracAc(id, a.plaka);
  return Boolean(a);
}

// Kart başlığı: sağda "Ekle" düğmesi (yazma yetkisi varsa).
const kartBasligi = (ad, ekle) => h("div", { class: "kart-baslik" }, h("h3", {}, ad), ekle && h("button", { class: "dugme ikincil kucuk", type: "button", onclick: ekle }, ikon("arti", 16), "Ekle"));

// Her iki kart aynı listeyi kullanır: tek istek atılır; aynı araca kısa süre sonra dönülürse önbellekten anında gelir.
const evrakOnbellek = new Map();
function evrakListesi(aracId, yeniden = false) {
  const var_ = evrakOnbellek.get(aracId);
  if (!yeniden && var_ && Date.now() - var_.t < 3 * 60000) return var_.p;
  const p = api.aracEvrakListe(veri.baglam.isletme, aracId);
  evrakOnbellek.set(aracId, { t: Date.now(), p });
  p.catch(() => { if (evrakOnbellek.get(aracId)?.p === p) evrakOnbellek.delete(aracId); });
  return p;
}

// Araç ve şoför evrakları: masaüstündeki "Araç Evrakları" / "Şoför Evrakları" klasörlerinin (Google Drive) dosyaları; kart açılınca yüklenir.
const boyutYaz = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function evrakKarti(a, tur) {
  const baslikMetni = tur === "arac" ? mb("evrak_yonetimi_baslik") : mb("sofor_evraklari");
  const kap = kart(h("h3", {}, baslikMetni), yukleniyor(2));
  const yukle = (yeniden = false) => {
    kap.replaceChildren(h("h3", {}, baslikMetni), yukleniyor(2));
    evrakListesi(a.id, yeniden).then((s) => {
      const dosyalar = Array.isArray(s[tur]) ? s[tur] : [];
      kap.replaceChildren(h("h3", {}, baslikMetni), dosyalar.length
        ? h("div", { class: "liste" }, dosyalar.map((d) => satir({
          baslik: d.ad, alt: [d.boyut ? boyutYaz(d.boyut) : "", d.tarih ? tarihYaz(tarihCoz(String(d.tarih).slice(0, 10))) : ""].filter(Boolean).join(" · "),
          onclick: (e) => goruntule(e.currentTarget, () => api.aracEvrakIndir(veri.baglam.isletme, a.id, tur, d.ad), d.ad),
        })))
        : bosDurum(mb("hic_evrak_yok_uyari")));
    }, (e) => kap.replaceChildren(h("h3", {}, baslikMetni), hataGoster(e, () => yukle(true))));
  };
  yukle();
  return kap;
}

const bos = (v) => (String(v ?? "").trim() && String(v).trim() !== "-" ? String(v).trim() : "-");
const belgeTarihi = (v) => { const s = bos(v); const d = s === "-" ? null : tarihCoz(s); return d ? tarihYaz(d) : s; };

// Masaüstündeki "Genel Araç Bilgileri" grubunun aynısı: aynı alanlar, aynı sıra, boş olanlar "-".
function genelBilgiler(a) {
  const t = a.belgeTarihleri;
  return kart(h("h3", {}, mb("qgroupbox_genel_arac_bilgileri")), h("div", { class: "bilgi-grid" },
    [["plaka_lbl", a.plaka], ["firma_lbl", a.firma], ["kurum_lbl", a.kurum], ["vergi_tc_lbl", a.vergiNo], ["sofor_lbl", a.sofor], ["sofor_tel_lbl", a.soforTel], ["marka_lbl", a.marka], ["model_lbl", a.model],
      ["model_yili_lbl", a.yil], ["yakit_tipi_lbl", a.yakit], ["vites_tipi_lbl", a.vites], ["guncel_km_lbl", a.km], ["sasi_no_lbl", a.sasi], ["utts_durumu_lbl", a.utts], ["hgs_durumu_lbl", a.hgs]]
      .map(([k, d]) => bilgiSatiri(me(k), bos(d))),
    [["muayene_bitis_lbl", t.muayene], ["trafik_bitis_lbl", t.trafik], ["kasko_bitis_lbl", t.kasko], ["koltuk_sigortasi_lbl", t.koltuk], ["guzergah_belge_lbl", t.guzergah]]
      .map(([k, d]) => bilgiSatiri(me(k), belgeTarihi(d))),
    bilgiSatiri(me("ruhsat_belge_no_lbl"), bos(a.ruhsatNo))));
}

function soforKarti(a) {
  const satirYap = (ad, telefon, ek) => {
    const tel = telefonTemizle(telefon);
    return h("div", { class: "telefon" },
      h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, ad), h("span", { class: "satir-alt" }, [telefon, ek].filter(Boolean).join(" · "))),
      tel && h("a", { class: "ikon-dugme dolu", href: "tel:" + tel, "aria-label": "Şoförü ara" }, ikon("telefon", 20)));
  };
  return kart(h("h3", {}, mb("hr_sofor")), a.sofor && satirYap(a.sofor, a.soforTel, ""),
    a.ekSoforler.length > 0 && h("div", {}, h("p", { class: "kart-etiket" }, me("ek_soforler_lbl")), a.ekSoforler.map((e) => satirYap(e.ad, e.tel, e.not))));
}

function aracDetay(a) {
  const yaz = veri.yazabilir("arac");
  const duzenleKayit = (tur, k) => (yaz ? () => duz.aracKayitFormu(a.id, tur, k.id) : undefined);
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, a.firma), h("p", { class: "buyuk-sayi baslik" }, `${a.marka} ${a.model}`.trim() || a.plaka)),
    genelBilgiler(a),
    (a.sofor || a.ekSoforler.length > 0) && soforKarti(a),
    kart(h("h3", {}, mb("tab_muayene__sigor")), a.belgeler.length
      ? h("div", { class: "liste" }, a.belgeler.map((b) => satir({ baslik: b.ad, alt: `${b.bakim ? "Sonraki: " : "Bitiş: "}${tarihYaz(b.son)}`, sag: kalanYaz(b.gun), ton: belgeTonu(b.seviye) })))
      : bosDurum("Belge tarihi girilmemiş.")),
    evrakKarti(a, "arac"),
    a.sofor && evrakKarti(a, "sofor"),
    (yaz || a.yagKayitlari.length > 0) && kart(kartBasligi(mb("tab_yakt_kaytlar"), yaz && (() => duz.aracKayitFormu(a.id, "yag", null))),
      a.yagKayitlari.length ? h("div", { class: "liste" }, a.yagKayitlari.slice(0, 30).map((k) => satir({ baslik: [k.yag, k.litre && `${k.litre} lt`].filter(Boolean).join(" · ") || "Yağ bakımı", alt: [tarihYaz(k.tarih), k.km && `${k.km} km`, ...k.degisenler].filter(Boolean).join(" · "), sagAlt: k.usta, onclick: duzenleKayit("yag", k) }))) : bosDurum("Yağ bakımı kaydı yok.")),
    (yaz || a.bakimKayitlari.length > 0) && kart(kartBasligi(mb("tab_bakm__servis"), yaz && (() => duz.aracKayitFormu(a.id, "bakim", null))),
      a.bakimKayitlari.length ? h("div", { class: "liste" }, a.bakimKayitlari.slice(0, 30).map((k) => satir({ baslik: k.aciklama || k.tur, alt: tarihYaz(k.tarih), sag: k.tutar ? para(k.tutar) : "", onclick: duzenleKayit("bakim", k) }))) : bosDurum("Tamir-bakım kaydı yok.")),
    (yaz || a.harcamaKayitlari.length > 0) && kart(kartBasligi(mb("tab_harcamalar"), yaz && (() => duz.aracKayitFormu(a.id, "harcama", null))),
      a.harcamaKayitlari.length ? h("div", { class: "liste" }, a.harcamaKayitlari.slice(0, 30).map((k) => satir({ baslik: k.aciklama || k.tur, alt: tarihYaz(k.tarih), sag: k.tutar ? para(k.tutar) : "", onclick: duzenleKayit("harcama", k) }))) : bosDurum("Harcama kaydı yok.")),
    yaz && islemDugmeleri({ duzenle: () => duz.aracFormu(a.id, { detaydan: true }) }));
}

// ── İç hizmet ───────────────────────────────────────────────────────────────
async function icHizmetEkrani() {
  const liste = await veri.icHizmet();
  const aylar = aylaraGore(liste);
  const sirali = [...aylar.keys()].sort().reverse();
  const d = durum.ic;
  const yeni = veri.yazabilir("ic_hizmet") && h("div", { class: "form" }, ekleDugmesi(md("ic_yeni_sefer"), () => duz.icHizmetFormu(null)), iceAktarDugmesi("ic_hizmet"));
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
      ciktiDugmeleri({ dosya: "ic_hizmetler", donem: true, varsayilanAy: () => d.ay,
        pdf: { yatay: true, altSol: "İç Hizmetler Raporu", uret: (c) => icHizmetPdf(c, liste) },
        xlsx: { uret: async (c) => icHizmetXlsx(c, liste, await veri.icFiyatlar()) } }),
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

export async function seferKayitAc(id) {
  const s = (await veri.icHizmet()).find((x) => x.id === id);
  if (s) detayAc(s.plaka || "Sefer", () => seferDetay(id));
  return Boolean(s);
}

async function seferDetay(id) {
  const s = (await veri.icHizmet()).find((x) => x.id === id);
  if (!s) return bosDurum("Sefer bulunamadı.");
  return h("div", { class: "sayfa" }, kart(
    h("p", { class: "kart-etiket" }, mb("ic_col_sefer")), h("p", { class: "buyuk-sayi" }, para(s.tutar)),
    bilgiSatiri(mb("hr_tarih"), `${tarihYaz(s.tarih)} ${s.saat}`.trim()), bilgiSatiri(mb("hr_plaka"), s.plaka), bilgiSatiri(mb("hr_sofor"), s.sofor), bilgiSatiri(me("ic_guzergah"), s.guzergah),
    bilgiSatiri(me("ic_col_gidilen_yer"), s.yer), bilgiSatiri(me("ic_col_kisi"), s.kisi ? String(s.kisi) : ""), bilgiSatiri(me("ic_col_personel"), s.personel),
    bilgiSatiri(me("ic_col_fis_no"), s.fis), bilgiSatiri(me("rapor_aciklama"), s.aciklama)),
    veri.yazabilir("ic_hizmet") && islemDugmeleri({ duzenle: () => duz.icHizmetFormu(id, { detaydan: true }) }));
}
