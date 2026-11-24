// Şirket Evrakları: masaüstündeki aynı kayıtlar (firma, kategori, başlık, geçerlilik). Bu ilk sürümde yalnızca görüntüleme;
// dosyaların kendisi Google Drive'da durur, telefondan yalnızca bilgileri görülür.
import { h, kart, satir, bilgiSatiri, aramaKutusu, sayfalamali, bosDurum, detayAc, animOnay } from "../ui.js";
import * as veri from "../veri.js";
import { tarihCoz, tarihYaz, gunFarki, eslesir, sirala } from "../bicim.js";
import { metin, etiket } from "../metin.js";
import { islemDugmeleri } from "../form.js";
import * as duz from "../duzenle.js";

const UYARI_GUN = 30;   // masaüstündeki _SEVRAK_UYARI_GUN ile aynı
const durum = { arama: "", firma: "", yil: "", arsiv: false };

function kayit(r) {
  const gecerlilik = tarihCoz(r.gecerlilik);
  const gun = gecerlilik ? gunFarki(gecerlilik) : null;
  return { ...r, gecerlilikTarihi: gecerlilik, gun, belgeTarihi: tarihCoz(r.belge_tarihi), etiketler: String(r.etiketler || ""), not: String(r.not || "") };
}

const kalanMetni = (gun) => (gun === 0 ? "Bugün bitiyor" : gun > 0 ? `${gun} gün kaldı` : `${-gun} gün geçti`);
const ton = (gun) => (gun === null ? "" : gun < 0 ? "kirmizi" : gun <= UYARI_GUN ? "kehribar" : "yesil");

export async function ciz() {
  const tumu = (await veri.sirketEvraklari()).map(kayit);
  const firmalar = [...new Set(tumu.map((r) => r.firma).filter(Boolean))].sort(sirala);
  const yillar = [...new Set(tumu.map((r) => r.yil).filter(Boolean))].sort((a, b) => b - a);
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  const arsiv = animOnay({ etiket: metin("sevrak_arsiv_goster"), isaretli: durum.arsiv, degisti: (acik) => { durum.arsiv = acik; guncelle(); } });

  function guncelle() {
    const g = tumu.filter((r) => (durum.arsiv || !r.arsiv) && (!durum.firma || r.firma === durum.firma) && (!durum.yil || String(r.yil) === durum.yil)
      && (!durum.arama || eslesir(`${r.baslik} ${r.firma} ${r.kategori} ${r.etiketler} ${r.not} ${r.dosya_adi} ${r.metin || ""}`, durum.arama)))
      .sort((a, b) => sirala(a.firma, b.firma) || sirala(a.kategori, b.kategori) || sirala(a.baslik, b.baslik));
    ozet.textContent = `${g.length} evrak`;
    sonuc.replaceChildren(g.length ? sayfalamali(g, evrakSatiri) : bosDurum("Evrak bulunamadı."));
  }

  const secim = (ad, ilk, secenekler, deger, degisti) => {
    const s = h("select", { class: "girdi", "aria-label": ad }, h("option", { value: "" }, ilk), secenekler.map((x) => h("option", { value: String(x) }, String(x))));
    s.value = deger;
    s.addEventListener("change", () => degisti(s.value));
    return s;
  };
  guncelle();
  return h("div", { class: "sayfa" },
    h("p", { class: "soluk" }, metin("sevrak_sayfa_aciklama")),
    aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, metin("sevrak_ara_ph")),
    h("div", { class: "iki-sutun" },
      secim("Firma", metin("sevrak_tum_firmalar"), firmalar, durum.firma, (v) => { durum.firma = v; guncelle(); }),
      secim("Yıl", metin("sevrak_tum_yillar"), yillar, durum.yil, (v) => { durum.yil = v; guncelle(); })),
    arsiv, ozet, sonuc);
}

function evrakSatiri(r) {
  return satir({
    baslik: r.baslik || r.dosya_adi, alt: [r.firma, r.kategori, r.yil].filter(Boolean).join(" · "),
    sag: r.gecerlilikTarihi ? kalanMetni(r.gun) : "", sagAlt: r.gecerlilikTarihi ? tarihYaz(r.gecerlilikTarihi) : "", ton: ton(r.gun),
    onclick: () => detayAc(r.baslik || r.dosya_adi, () => evrakDetay(r.id)),
  });
}

async function evrakDetay(id) {
  const bulunan = (await veri.sirketEvraklari()).find((x) => x.id === id);
  if (!bulunan) return bosDurum("Evrak bulunamadı.");
  const r = kayit(bulunan);
  return h("div", { class: "sayfa" }, kart(
    bilgiSatiri(etiket("sevrak_firma"), r.firma), bilgiSatiri(etiket("sevrak_kategori"), r.kategori), bilgiSatiri(etiket("sevrak_baslik_lbl"), r.baslik),
    bilgiSatiri(etiket("sevrak_yil"), r.yil), bilgiSatiri(etiket("sevrak_belge_tarihi"), r.belgeTarihi ? tarihYaz(r.belgeTarihi) : ""),
    bilgiSatiri(etiket("sevrak_gecerlilik"), r.gecerlilikTarihi ? `${tarihYaz(r.gecerlilikTarihi)} (${kalanMetni(r.gun)})` : "", ton(r.gun)),
    bilgiSatiri(etiket("sevrak_etiketler"), r.etiketler), bilgiSatiri(etiket("sevrak_not"), r.not), bilgiSatiri("Dosya", r.dosya_adi)),
    veri.yazabilir("sirket_evrak") && islemDugmeleri({ duzenle: () => duz.evrakFormu(id, { detaydan: true }) }));
}
