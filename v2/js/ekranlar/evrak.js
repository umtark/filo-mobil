// Şirket Evrakları: masaüstündeki aynı kayıtlar (firma, kategori, başlık, geçerlilik). Dosyalar Google Drive'da durur; telefondan yüklenen dosya
// önce geçici aktarım kovasına gider, masaüstü onu Drive yoluna taşır (bkz. duzenle.js evrakYukle, supabase/evrak_aktarim.sql).
import { h, ikon, toast, kart, satir, bilgiSatiri, aramaKutusu, sayfalamali, bosDurum, detayAc, animOnay } from "../ui.js";
import * as api from "../api.js";
import * as veri from "../veri.js";
import { tarihCoz, tarihYaz, gunFarki, eslesir, sirala } from "../bicim.js";
import { metin, etiket } from "../metin.js";
import { islemDugmeleri, ekleDugmesi } from "../form.js";
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
    veri.yazabilir("sirket_evrak") && ekleDugmesi("Evrak yükle", () => duz.evrakYukle()),
    aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, metin("sevrak_ara_ph")),
    h("div", { class: "iki-sutun" },
      secim("Firma", metin("sevrak_tum_firmalar"), firmalar, durum.firma, (v) => { durum.firma = v; guncelle(); }),
      secim("Yıl", metin("sevrak_tum_yillar"), yillar, durum.yil, (v) => { durum.yil = v; guncelle(); })),
    arsiv, ozet, sonuc);
}

const bekliyor = (r) => Boolean(r.aktarim && r.aktarim.durum === "bekliyor");

const TUR = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", txt: "text/plain" };

// Tarayıcının dosyayı sayfada gösterebilmesi için doğru MIME türü gerekir; sunucu genel tür dönerse uzantıdan çıkarılır.
async function drive(r) {
  const blob = await api.evrakDriveIndir(veri.baglam.isletme, r.id);
  const tur = TUR[String(r.dosya_adi || "").split(".").pop().toLowerCase()];
  return tur && (!blob.type || blob.type === "application/octet-stream") ? new Blob([blob], { type: tur }) : blob;
}

// Düğme çalışırken dönen halka ve yazı gösterir; bitince bildirim verir.
async function dugmeIsi(dugme, yazi, is) {
  const eski = [...dugme.childNodes];
  dugme.disabled = true; dugme.classList.add("mesgul");
  dugme.replaceChildren(h("span", { class: "doner", "aria-hidden": "true" }), yazi);
  try { await is(); } finally { dugme.replaceChildren(...eski); dugme.classList.remove("mesgul"); dugme.disabled = false; }
}

function driveDosyasiIndir(r, dugme) {
  return dugmeIsi(dugme, "İndiriliyor", async () => {
    try {
      const adres = URL.createObjectURL(await drive(r));
      const a = h("a", { href: adres, download: r.dosya_adi || "evrak", hidden: true });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(adres), 60000);
      toast("Dosya indirildi");
    } catch (e) { toast(e.message || "Dosya indirilemedi", "hata"); }
  });
}

// Sekme tıklama anında açılır (telefon tarayıcıları beklemeden sonra açılan pencereyi engeller); dosya gelince içine yüklenir.
function driveDosyasiGoruntule(r, dugme) {
  const sekme = window.open("", "_blank");
  if (sekme) sekme.document.title = "Dosya açılıyor";
  return dugmeIsi(dugme, "Açılıyor", async () => {
    try {
      const adres = URL.createObjectURL(await drive(r));
      if (sekme) sekme.location.href = adres; else window.location.assign(adres);
      setTimeout(() => URL.revokeObjectURL(adres), 300000);
    } catch (e) {
      if (sekme) sekme.close();
      toast(e.message || "Dosya açılamadı", "hata");
    }
  });
}

async function dosyaAc(r) {
  try { window.open(await api.depoBaglantisi("evrak_aktarim", r.aktarim.yol), "_blank", "noopener"); } catch (e) { toast(e.message || "Dosya açılamadı", "hata"); }
}

function evrakSatiri(r) {
  return satir({
    baslik: r.baslik || r.dosya_adi, alt: [r.firma, r.kategori, r.yil, bekliyor(r) && "Aktarım bekliyor"].filter(Boolean).join(" · "),
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
    bilgiSatiri(etiket("sevrak_etiketler"), r.etiketler), bilgiSatiri(etiket("sevrak_not"), r.not), bilgiSatiri("Dosya", r.dosya_adi), bekliyor(r) && bilgiSatiri("Aktarım", "Bilgisayara aktarılmayı bekliyor", "kehribar")),
    bekliyor(r) && h("button", { class: "dugme ikincil genis", type: "button", onclick: () => dosyaAc(r) }, ikon("indir", 18), "Dosyayı aç"),
    !bekliyor(r) && r.drive_id && h("button", { class: "dugme birincil genis", type: "button", onclick: (e) => driveDosyasiGoruntule(r, e.currentTarget) }, ikon("goz", 18), "Görüntüle"),
    !bekliyor(r) && r.drive_id && h("button", { class: "dugme ikincil genis", type: "button", onclick: (e) => driveDosyasiIndir(r, e.currentTarget) }, ikon("indir", 18), "Telefona indir"),
    veri.yazabilir("sirket_evrak") && islemDugmeleri({ duzenle: () => duz.evrakFormu(id, { detaydan: true }) }));
}
