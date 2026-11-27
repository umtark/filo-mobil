// Şirket Evrakları: masaüstündeki aynı kayıtlar (firma, kategori, başlık, geçerlilik). Dosyalar Google Drive'da durur; telefondan yüklenen dosya
// önce geçici aktarım kovasına gider, masaüstü onu Drive yoluna taşır (bkz. duzenle.js evrakYukle, supabase/evrak_aktarim.sql).
import { h, ikon, toast, kart, satir, bilgiSatiri, aramaKutusu, sayfalamali, bosDurum, detayAc, animOnay } from "../ui.js";
import * as api from "../api.js";
import * as veri from "../veri.js";
import { tarihCoz, tarihYaz, gunFarki, eslesir, sirala } from "../bicim.js";
import { metin, etiket, duz as md } from "../metin.js";
import { islemDugmeleri, ekleDugmesi } from "../form.js";
import * as duz from "../duzenle.js";
import { goruntule, indir, turlu, blobIndir, dugmeIsi } from "../dosya.js";
import { zipYap } from "../zip.js";

const UYARI_GUN = 30;   // masaüstündeki _SEVRAK_UYARI_GUN ile aynı
const durum = { arama: "", firma: "", yil: "", arsiv: false };

function kayit(r) {
  const gecerlilik = tarihCoz(r.gecerlilik);
  const gun = gecerlilik ? gunFarki(gecerlilik) : null;
  return { ...r, gecerlilikTarihi: gecerlilik, gun, belgeTarihi: tarihCoz(r.belge_tarihi), etiketler: String(r.etiketler || ""), not: String(r.not || "") };
}

// Evrakın sisteme eklenme zamanı (yerel saat, ISO); yoksa en sona düşer.
const eklenmeZamani = (r) => Date.parse(r.eklenme) || 0;
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
      .sort((a, b) => eklenmeZamani(b) - eklenmeZamani(a) || sirala(a.firma, b.firma) || sirala(a.baslik, b.baslik));   // en son eklenen üstte
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
    veri.yazabilir("sirket_evrak") && ekleDugmesi(md("qpushbutton_evrak_yukle"), () => duz.evrakYukle()),
    h("button", { class: "dugme ikincil genis", type: "button", onclick: () => detayAc("Evrak gönderimi", () => gonderimEkrani(tumu)) }, ikon("indir", 18), "Seç ve gönder (banka, kurum)"),
    aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, metin("sevrak_ara_ph")),
    h("div", { class: "iki-sutun" },
      secim("Firma", metin("sevrak_tum_firmalar"), firmalar, durum.firma, (v) => { durum.firma = v; guncelle(); }),
      secim("Yıl", metin("sevrak_tum_yillar"), yillar, durum.yil, (v) => { durum.yil = v; guncelle(); })),
    arsiv, ozet, sonuc);
}

const bekliyor = (r) => Boolean(r.aktarim && r.aktarim.durum === "bekliyor");

const evrakBlob = (r) => () => api.evrakDriveIndir(veri.baglam.isletme, r.id);

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

export async function kayitAc(id) {
  const r = (await veri.sirketEvraklari()).find((x) => x.id === id);
  if (r) detayAc(r.baslik || r.dosya_adi, () => evrakDetay(id));
  return Boolean(r);
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
    !bekliyor(r) && r.drive_id && h("button", { class: "dugme birincil genis", type: "button", onclick: (e) => goruntule(e.currentTarget, evrakBlob(r), r.dosya_adi || "evrak") }, ikon("goz", 18), "Görüntüle"),
    !bekliyor(r) && r.drive_id && h("button", { class: "dugme ikincil genis", type: "button", onclick: (e) => indir(e.currentTarget, evrakBlob(r), r.dosya_adi || "evrak") }, ikon("indir", 18), "Telefona indir"),
    veri.yazabilir("sirket_evrak") && islemDugmeleri({ duzenle: () => duz.evrakFormu(id, { detaydan: true }) }));
}

// ── Seç ve gönder ───────────────────────────────────────────────────────────
// Bankaya ya da kuruma gönderilecek evrakları süzüp toplu paylaşmak/indirmek için. Aynı gruptaki seçimler "ya da", gruplar "ve" ile birleşir
// (örn. Firma: Olcay Başer · Yıl: 2024, 2025, 2026 · Belge: Mizan · Dosya: Excel, PDF).
const DOSYA_TURLERI = [["pdf", "PDF", ["pdf"]], ["excel", "Excel", ["xls", "xlsx", "xlsm", "csv"]], ["word", "Word", ["doc", "docx"]], ["resim", "Resim", ["jpg", "jpeg", "png", "webp", "gif", "heic"]]];
const dosyaTuru = (r) => {
  const uzanti = String(r.dosya_adi || "").split(".").pop().toLowerCase();
  return (DOSYA_TURLERI.find(([, , l]) => l.includes(uzanti)) || ["diger"])[0];
};
const TUR_ADI = Object.fromEntries([...DOSYA_TURLERI.map(([k, ad]) => [k, ad]), ["diger", "Diğer"]]);
const boyutMetni = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function cokluCipler(baslik, secenekler, secili, degisti) {
  const kap = h("div", { class: "alan" }, h("span", {}, baslik));
  const ciz = () => {
    kap.querySelector(".cipler")?.remove();
    kap.append(h("div", { class: "cipler cipler-sar" }, secenekler.map(([kod, ad, adet]) =>
      h("button", { class: "cip" + (secili.has(kod) ? " secili" : ""), type: "button", "aria-pressed": String(secili.has(kod)),
        onclick: () => { if (secili.has(kod)) secili.delete(kod); else secili.add(kod); ciz(); degisti(); } }, ad, h("span", { class: "cip-adet" }, adet)))));
  };
  ciz();
  return kap;
}

async function dosyaBlobu(r) {
  if (bekliyor(r)) {
    const c = await fetch(await api.depoBaglantisi("evrak_aktarim", r.aktarim.yol));
    if (!c.ok) throw new Error("Dosya alınamadı.");
    return turlu(await c.blob(), r.dosya_adi);
  }
  if (!r.drive_id) throw new Error("Dosya henüz hazır değil.");
  return turlu(await evrakBlob(r)(), r.dosya_adi);
}

function gonderimEkrani(tumu) {
  const f = { firma: new Set(), yil: new Set(), kategori: new Set(), tur: new Set(), arama: "", arsiv: false };
  const secili = new Set();
  let hazir = null;   // [{ ad, blob }]: indirilen dosyalar; paylaşım dokunuşu indirme bittikten sonra ayrı bir düğmeyle yapılır (tarayıcılar uzun beklemeden sonra paylaşıma izin vermez)
  const liste = h("div", { class: "liste" });
  const ozet = h("p", { class: "soluk ozet-satir" });
  const eylemler = h("div", { class: "form" });
  const say = (ozellik) => { const m = new Map(); for (const r of tumu) { const d = ozellik(r); if (d) m.set(d, (m.get(d) || 0) + 1); } return m; };
  const secenek = (m, sirali = sirala) => [...m.entries()].sort((a, b) => sirali(a[0], b[0])).map(([k, n]) => [k, k, n]);
  const turSayilari = say(dosyaTuru);

  const eslesen = () => tumu.filter((r) => (f.arsiv || !r.arsiv)
    && (!f.firma.size || f.firma.has(r.firma)) && (!f.yil.size || f.yil.has(String(r.yil))) && (!f.kategori.size || f.kategori.has(r.kategori)) && (!f.tur.size || f.tur.has(dosyaTuru(r)))
    && (!f.arama || eslesir(`${r.baslik} ${r.firma} ${r.kategori} ${r.etiketler} ${r.not} ${r.dosya_adi}`, f.arama)))
    .sort((a, b) => eklenmeZamani(b) - eklenmeZamani(a) || sirala(a.baslik, b.baslik));

  function eylemCiz() {
    const secilen = tumu.filter((r) => secili.has(r.id));
    const toplam = hazir ? hazir.reduce((t, d) => t + d.blob.size, 0) : 0;
    const dosyalar = hazir && hazir.map((d) => new File([d.blob], d.ad, { type: d.blob.type }));
    const paylasilabilir = Boolean(dosyalar && navigator.canShare && navigator.canShare({ files: dosyalar }));
    const hazirla = h("button", { class: "dugme birincil genis", type: "button", disabled: !secilen.length }, secilen.length ? `${secilen.length} evrakı hazırla` : "Evrak seçin");
    hazirla.addEventListener("click", () => dugmeIsi(hazirla, "Hazırlanıyor", async () => {
      const sonuc = [], hatali = [];
      for (const [i, r] of secilen.entries()) {
        hazirla.lastChild.textContent = `Hazırlanıyor ${i + 1} / ${secilen.length}`;
        try { sonuc.push({ ad: r.dosya_adi || `${r.baslik}.pdf`, blob: await dosyaBlobu(r) }); } catch (e) { hatali.push(`${r.baslik || r.dosya_adi}: ${e.message}`); }
      }
      hazir = sonuc;
      eylemCiz();
      if (hatali.length) toast(`${hatali.length} evrak alınamadı: ${hatali[0]}`, "hata");
    }));
    eylemler.replaceChildren(...[hazirla, ...(hazir && hazir.length ? [
      h("p", { class: "ipucu" }, `${hazir.length} dosya hazır · ${boyutMetni(toplam)}`),
      paylasilabilir && h("button", { class: "dugme birincil genis", type: "button", onclick: () => navigator.share({ files: dosyalar, title: "Evraklar" }).catch((e) => { if (e.name !== "AbortError") toast(e.message || "Paylaşılamadı", "hata"); }) }, "Paylaş (WhatsApp, e-posta...)"),
      h("button", { class: (paylasilabilir ? "dugme ikincil" : "dugme birincil") + " genis", type: "button",
        onclick: (e) => dugmeIsi(e.currentTarget, "ZIP hazırlanıyor", async () => {
          const dosyaVerisi = await Promise.all(hazir.map(async (d) => ({ ad: d.ad, veri: new Uint8Array(await d.blob.arrayBuffer()) })));
          blobIndir(zipYap(dosyaVerisi), "Evraklar.zip");
        }) }, "ZIP olarak indir")] : [])].filter(Boolean));
  }

  function guncelle() {
    const g = eslesen();
    ozet.textContent = `${g.length} evrak · ${g.filter((r) => secili.has(r.id)).length} seçili`;
    liste.replaceChildren(...(g.length ? g.map((r) => {
      const sec = secili.has(r.id);
      const el = satir({ baslik: r.baslik || r.dosya_adi, alt: [r.firma, r.kategori, r.yil, TUR_ADI[dosyaTuru(r)]].filter(Boolean).join(" · "), sag: sec ? "Seçili" : "", ton: "yesil", sagAlt: r.eklenme ? tarihYaz(new Date(r.eklenme)) : "",
        onclick: () => { if (sec) secili.delete(r.id); else secili.add(r.id); hazir = null; guncelle(); } });
      el.classList.toggle("secili-satir", sec);
      return el;
    }) : [bosDurum("Bu filtreye uyan evrak yok.")]));
    eylemCiz();
  }
  const filtreDegisti = () => { hazir = null; guncelle(); };
  const tumunuSec = () => { for (const r of eslesen()) secili.add(r.id); hazir = null; guncelle(); };
  const secimiKaldir = () => { secili.clear(); hazir = null; guncelle(); };

  guncelle();
  return h("div", { class: "sayfa" },
    aramaKutusu("", (v) => { f.arama = v; guncelle(); }, metin("sevrak_ara_ph")),
    cokluCipler(etiket("sevrak_firma"), secenek(say((r) => r.firma)), f.firma, filtreDegisti),
    cokluCipler(etiket("sevrak_yil"), secenek(say((r) => String(r.yil || "")), (a, b) => b - a), f.yil, filtreDegisti),
    cokluCipler("Belge türü", secenek(say((r) => r.kategori)), f.kategori, filtreDegisti),
    cokluCipler("Dosya türü", [...turSayilari.entries()].map(([k, n]) => [k, TUR_ADI[k], n]), f.tur, filtreDegisti),
    animOnay({ etiket: metin("sevrak_arsiv_goster"), isaretli: false, degisti: (acik) => { f.arsiv = acik; guncelle(); } }),
    h("div", { class: "iki-sutun" },
      h("button", { class: "dugme ikincil", type: "button", onclick: tumunuSec }, "Listelenenleri seç"),
      h("button", { class: "dugme ikincil", type: "button", onclick: secimiKaldir }, "Seçimi kaldır")),
    ozet, liste, eylemler);
}