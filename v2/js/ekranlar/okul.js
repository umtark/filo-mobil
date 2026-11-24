// Okul: servis kullanan öğrencilerin tahsilat takibi. Telefondan yapılabilen tek yazma işlemi ödeme eklemektir.
import { h, ikon, kart, satir, bilgiSatiri, cipler, aramaKutusu, sayfalamali, bosDurum, panelAc, detayAc, detayYenile, toast, segment } from "../ui.js";
import * as veri from "../veri.js";
import { okulToplam } from "../hesap.js";
import { para, paraKesin, sayi, tarihYaz, eslesir, isoTarih, bugun, telefonTemizle } from "../bicim.js";

export const durum = { arama: "", filtre: "hepsi" };

const TON = { bekliyor: "kirmizi", kismi: "kehribar", odendi: "yesil" };
const YONTEM = { nakit: "Nakit", iban: "IBAN", kart: "Kart" };

const ilerleme = (oran) => h("div", { class: "ilerleme", role: "progressbar", "aria-valuenow": Math.round(oran * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
  h("span", { style: `width:${Math.min(100, Math.max(0, oran * 100)).toFixed(1)}%` }));

export async function ciz() {
  const liste = await veri.okul();
  const t = okulToplam(liste);
  const sonuc = h("div");
  const cipAlani = h("div");

  function guncelle() {
    cipAlani.replaceChildren(cipler([["hepsi", "Hepsi", liste.length], ["bekliyor", "Ödemedi", t.bekliyor], ["kismi", "Eksik", t.kismi], ["odendi", "Ödendi", t.odendi]],
      durum.filtre, (k) => { durum.filtre = k; guncelle(); }));
    const g = liste.filter((o) => (durum.filtre === "hepsi" || o.durum === durum.filtre) && (!durum.arama || eslesir(`${o.ad} ${o.sinif} ${o.plaka}`, durum.arama)));
    sonuc.replaceChildren(g.length ? sayfalamali(g, ogrenciSatiri) : bosDurum("Bu filtreyle eşleşen öğrenci yok."));
  }

  const ozet = kart(
    h("p", { class: "kart-etiket" }, "Kalan tahsilat"),
    h("p", { class: "buyuk-sayi" }, para(t.kalan)),
    ilerleme(t.ucret ? t.odenen / t.ucret : 0),
    h("p", { class: "soluk" }, `${para(t.odenen)} tahsil edildi, toplam ${para(t.ucret)} · ${t.ogrenci} öğrenci`));

  guncelle();
  return h("div", { class: "sayfa" }, ozet, aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, "Öğrenci, sınıf ya da plaka ara"), cipAlani, sonuc);
}

function ogrenciSatiri(o) {
  const ucretYok = o.ucret <= 0;
  return satir({
    baslik: o.ad, alt: [o.sinif, o.plaka].filter(Boolean).join(" · "), ton: ucretYok ? "" : TON[o.durum],
    sag: ucretYok ? "Ücret yok" : o.durum === "odendi" ? "Ödendi" : para(o.kalan), sagAlt: ucretYok ? (o.odenen ? `${para(o.odenen)} ödendi` : "") : `${para(o.odenen)} / ${para(o.ucret)}`,
    onclick: () => ogrenciAc(o.id, o.ad),
  });
}

export function ogrenciAc(id, ad) {
  detayAc(ad, async () => {
    const o = (await veri.okul()).find((x) => x.id === id);
    return o ? detay(o) : bosDurum("Öğrenci bulunamadı.");
  });
}

function detay(o) {
  const yazabilir = veri.yazabilir("okul");
  const ucretYok = o.ucret <= 0;
  return h("div", { class: "sayfa" },
    kart(
      h("p", { class: "soluk" }, [o.sinif, o.plaka].filter(Boolean).join(" · ")),
      h("p", { class: "kart-etiket" }, ucretYok || o.durum === "odendi" ? "Durum" : "Kalan"),
      h("p", { class: "buyuk-sayi " + (ucretYok ? "" : TON[o.durum]) }, ucretYok ? "Ücret girilmemiş" : o.durum === "odendi" ? "Ödendi" : para(o.kalan)),
      ilerleme(o.ucret ? o.odenen / o.ucret : 0),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Ücret", para(o.ucret)), bilgiSatiri("Ödenen", para(o.odenen))),
      yazabilir && h("button", { class: "dugme birincil genis", onclick: () => odemePaneli(o) }, ikon("arti", 18), "Ödeme ekle")),
    o.telefonlar.length > 0 && kart(h("h3", {}, o.veli ? `Ulaş · ${o.veli}` : "Ulaş"), o.telefonlar.map(([kim, tel]) => telefonSatiri(kim, tel))),
    kart(h("h3", {}, "Ödemeler"),
      o.odemeler.length
        ? o.odemeler.map((g) => satir({ baslik: para(g.tutar), alt: [tarihYaz(g.tarih), YONTEM[g.yontem] || g.yontem, g.not].filter(Boolean).join(" · "), sagAlt: g.kisi ? `Telefon: ${g.kisi}` : "" }))
        : bosDurum("Henüz ödeme yok.")));
}

function telefonSatiri(kim, tel) {
  const temiz = telefonTemizle(tel);
  return h("div", { class: "telefon" },
    h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, String(tel).trim()), h("span", { class: "satir-alt" }, kim)),
    temiz && h("a", { class: "ikon-dugme dolu", href: "tel:" + temiz, "aria-label": `${kim} ara` }, ikon("telefon", 20)),
    temiz && h("a", { class: "ikon-dugme dolu", href: "https://wa.me/" + temiz.replace("+", ""), target: "_blank", rel: "noopener", "aria-label": `${kim} WhatsApp` }, ikon("mesaj", 20)));
}

function yeniKimlik() {
  return (crypto.randomUUID && crypto.randomUUID()) || `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function odemePaneli(o) {
  const mobilId = yeniKimlik();   // bağlantı kopup yeniden denenirse sunucu aynı ödemeyi ikinci kez eklemez
  let yontem = "nakit";
  const tutar = h("input", { class: "girdi", type: "text", inputmode: "decimal", autocomplete: "off", value: o.kalan > 0 ? String(o.kalan).replace(".", ",") : "", "aria-label": "Tutar", oninput: etiketle });
  const tarih = h("input", { class: "girdi", type: "date", value: isoTarih(bugun()), max: isoTarih(bugun()), "aria-label": "Tarih", oninput: etiketle });
  const not = h("input", { class: "girdi", type: "text", maxlength: "120", placeholder: "Not (isteğe bağlı)", "aria-label": "Not" });
  const hata = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const kaydet = h("button", { class: "dugme birincil genis", onclick: gonder }, "");
  const yontemAlani = h("div");

  function yontemCiz() {
    yontemAlani.replaceChildren(segment(Object.entries(YONTEM), yontem, (k) => { yontem = k; yontemCiz(); }));
  }
  function etiketle() {
    const n = sayi(tutar.value);
    kaydet.textContent = n > 0 ? `${paraKesin(n)} kaydet` : "Kaydet";
  }
  async function gonder() {
    const n = sayi(tutar.value);
    hata.hidden = true;
    if (!(n > 0)) return hataYaz("Tutarı girin.");
    if (!tarih.value) return hataYaz("Tarihi seçin.");
    kaydet.disabled = true;
    kaydet.textContent = "Kaydediliyor";
    try {
      await veri.odemeEkle({ ogrenci: o.id, tutar: n, tarih: tarih.value, yontem, not: not.value, mobilId });
      await veri.ogrenciTazele(o.id);
      panel.kapat();
      toast("Ödeme kaydedildi", "basari");
      await detayYenile({ kok: true });
    } catch (e) {
      kaydet.disabled = false;
      etiketle();
      hataYaz(e.message);
    }
  }
  function hataYaz(m) { hata.textContent = m; hata.hidden = false; }

  const form = h("form", { class: "form", onsubmit: (e) => { e.preventDefault(); gonder(); } },
    h("label", { class: "alan" }, h("span", {}, "Tutar"), tutar),
    h("label", { class: "alan" }, h("span", {}, "Tarih"), tarih),
    h("div", { class: "alan" }, h("span", {}, "Yöntem"), yontemAlani),
    h("label", { class: "alan" }, h("span", {}, "Not"), not),
    hata, kaydet);
  yontemCiz();
  etiketle();
  const panel = panelAc(`Ödeme ekle · ${o.ad}`, form);
}
