// Okul: servis kullanan öğrencilerin tahsilat takibi. Telefondan yapılabilen tek yazma işlemi ödeme eklemektir.
import { h, ikon, kart, satir, bilgiSatiri, cipler, aramaKutusu, ayCubugu, sayfalamali, bosDurum, panelAc, detayAc, detayYenile, toast, segment } from "../ui.js";
import * as veri from "../veri.js";
import { okulToplam, yontemToplami } from "../hesap.js";
import { animasyon } from "../lottie.js";
import { duz, doldur } from "../metin.js";
import { para, paraKesin, sayi, tarihYaz, tarihCoz, ayAdi, ayAnahtari, ayEkle, eslesir, sirala, isoTarih, bugun, telefonTemizle } from "../bicim.js";
import { ekleDugmesi, islemDugmeleri } from "../form.js";
import * as ed from "../duzenle.js";
import { aktarDugmesi } from "../rapor.js";
import { kalanYaz, belgeTonu } from "./filo.js";

export const durum = { arama: "", filtre: "hepsi", yontem: "", kullanmayan: "", servis: "", puantajAy: null, puantaj: "" };

const TON = { bekliyor: "kirmizi", kismi: "kehribar", odendi: "yesil" };
const YONTEM = { nakit: "Nakit", iban: "IBAN", kart: "Kart" };
// Masaüstündeki tahsilat kartları: aynı ad, aynı Lottie ikonu, dokununca o yöntemle ödeyenleri süzer (tekrar dokununca kalkar).
const YONTEM_KARTLARI = [["nakit", "tah_kpi_nakit", "nakit_payment", 0.7], ["iban", "tah_kpi_iban", "iban_payment", 0.5], ["kart", "tah_kpi_kart", "Card_payment", 0.5]];

const ilerleme = (oran) => h("div", { class: "ilerleme", role: "progressbar", "aria-valuenow": Math.round(oran * 100), "aria-valuemin": 0, "aria-valuemax": 100 },
  h("span", { style: `width:${Math.min(100, Math.max(0, oran * 100)).toFixed(1)}%` }));

// Masaüstündeki Okul sekmeleri: Öğrenciler, Servis Kullanmayanlar, Servisler, Tahsilat Raporu.
export async function ciz(alt = "ogrenciler") {
  if (alt === "kullanmayan") return h("div", { class: "sayfa" }, await kullanmayanEkrani());
  if (alt === "servisler") return h("div", { class: "sayfa" }, await servislerEkrani());
  if (alt === "puantaj") return h("div", { class: "sayfa" }, await puantajEkrani());
  return ogrencilerEkrani(alt === "tahsilat");
}

async function kullanmayanEkrani() {
  const liste = await veri.okulServisKullanmayan();
  const yeni = veri.yazabilir("okul") && ekleDugmesi("Yeni öğrenci", () => ed.ogrenciFormu(null));
  if (!liste.length) return h("div", {}, yeni, bosDurum("Servis kullanmayan öğrenci yok."));
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  function guncelle() {
    const g = liste.filter((o) => !durum.kullanmayan || eslesir(`${o.ad} ${o.sinif} ${o.veli}`, durum.kullanmayan));
    ozet.textContent = `${g.length} öğrenci`;
    sonuc.replaceChildren(g.length ? sayfalamali(g, (o) => satir({ baslik: o.ad, alt: [o.sinif, o.veli].filter(Boolean).join(" · "), sag: o.neden, onclick: () => detayAc(o.ad, () => kullanmayanDetay(o.id)) })) : bosDurum("Öğrenci bulunamadı."));
  }
  guncelle();
  return h("div", {}, yeni, aramaKutusu(durum.kullanmayan, (v) => { durum.kullanmayan = v; guncelle(); }, "Öğrenci, sınıf ya da veli ara"), ozet, sonuc);
}

async function kullanmayanDetay(id) {
  const o = (await veri.okulServisKullanmayan()).find((x) => x.id === id);
  if (!o) return bosDurum("Öğrenci artık bu listede değil.");
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, o.sinif), h("p", { class: "kart-etiket" }, "Durum"), h("p", { class: "buyuk-sayi" }, o.neden)),
    o.telefonlar.length > 0 && kart(h("h3", {}, o.veli ? `Ulaş · ${o.veli}` : "Ulaş"), o.telefonlar.map(([kim, tel]) => telefonSatiri(kim, tel))),
    veri.yazabilir("okul") && islemDugmeleri({ duzenle: () => ed.ogrenciFormu(id, { detaydan: true }) }));
}

async function servislerEkrani() {
  const liste = await veri.okulServisler();
  const yeni = veri.yazabilir("okul") && ekleDugmesi("Yeni servis", () => ed.servisFormu(null));
  if (!liste.length) return h("div", {}, yeni, bosDurum("Servis kaydı yok."));
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  function guncelle() {
    const g = liste.filter((s) => !durum.servis || eslesir(`${s.plaka} ${s.sofor} ${s.guzergah} ${s.sahip}`, durum.servis));
    ozet.textContent = `${g.length} servis · ${g.reduce((t, s) => t + s.ogrenci, 0)} öğrenci`;
    sonuc.replaceChildren(g.length ? sayfalamali(g, (s) => {
      const b = s.belgeler.find((x) => x.seviye !== "iyi");
      return satir({
        baslik: s.plaka, alt: [s.sofor, s.guzergah].filter(Boolean).join(" · "),
        sag: b ? b.ad : `${s.ogrenci} öğrenci`, sagAlt: b ? kalanYaz(b.gun) : "", ton: b ? belgeTonu(b.seviye) : "",
        onclick: () => detayAc(s.plaka, () => servisDetay(s.id)),
      });
    }) : bosDurum("Servis bulunamadı."));
  }
  guncelle();
  return h("div", {}, yeni, aramaKutusu(durum.servis, (v) => { durum.servis = v; guncelle(); }, "Plaka, şoför ya da güzergah ara"), ozet, sonuc);
}

async function servisDetay(id) {
  const s = (await veri.okulServisler()).find((x) => x.id === id);
  if (!s) return bosDurum("Servis bulunamadı.");
  const temiz = telefonTemizle(s.tel);
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, [s.tip, s.sahip].filter(Boolean).join(" · ")), h("p", { class: "buyuk-sayi baslik" }, s.plaka),
      h("div", { class: "bilgi-grid" }, bilgiSatiri("Öğrenci", String(s.ogrenci)), bilgiSatiri("Aylık ücret", s.ucret ? para(s.ucret) : ""), bilgiSatiri("Güzergah", s.guzergah))),
    s.sofor && kart(h("h3", {}, "Şoför"), h("div", { class: "telefon" },
      h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, s.sofor), h("span", { class: "satir-alt" }, s.tel)),
      temiz && h("a", { class: "ikon-dugme dolu", href: "tel:" + temiz, "aria-label": "Şoförü ara" }, ikon("telefon", 20)))),
    kart(h("h3", {}, "Belgeler"), s.belgeler.length
      ? h("div", { class: "liste" }, s.belgeler.map((b) => satir({ baslik: b.ad, alt: `Bitiş: ${tarihYaz(b.son)}`, sag: kalanYaz(b.gun), ton: belgeTonu(b.seviye) })))
      : bosDurum("Belge tarihi girilmemiş.")),
    veri.yazabilir("okul") && islemDugmeleri({ duzenle: () => ed.servisFormu(id, { detaydan: true }) }));
}

// Servis Puantajları: her servisin ay içinde çalıştığı günler ve servis sahibine ödeme tarihi; dokununca gün izgarası açılır.
async function puantajEkrani() {
  const [ham, ayar] = await Promise.all([veri.hamListe("okul_ogrenciler"), veri.ayarlar().catch(() => ({}))]);
  const gizli = new Set((Array.isArray(ayar.puantaj_gizli_servisler) ? ayar.puantaj_gizli_servisler : []).map(String));
  const servisler = ham.filter((s) => String(s.id).startsWith("srv_") && !gizli.has(String(s.id)) && !gizli.has(String(s.plaka)))
    .sort((a, b) => sayi(a.sira_no) - sayi(b.sira_no) || sirala(a.plaka, b.plaka));
  if (!servisler.length) return bosDurum("Servis kaydı yok.");
  const baslangic = tarihCoz(ayar.okul_puantaj_donem_baslangic) || new Date(bugun().getFullYear(), 8, 1);
  const kume = new Set(Array.from({ length: 12 }, (_, i) => ayEkle(ayAnahtari(baslangic), i)));
  for (const s of servisler) for (const ay of Object.keys(s.puantaj || {})) kume.add(ay);
  const aylar = [...kume].sort();
  const verili = aylar.filter((ay) => servisler.some((s) => ((s.puantaj || {})[ay] || []).length));
  if (!aylar.includes(durum.puantajAy)) durum.puantajAy = aylar.includes(ayAnahtari(bugun())) ? ayAnahtari(bugun()) : verili[verili.length - 1] || aylar[0];
  const yaz = veri.yazabilir("okul");
  const etiketler = ayar.okul_puantaj_kademe_etiket || {};
  const sira = Array.isArray(ayar.okul_puantaj_kategori_sirasi) ? ayar.okul_puantaj_kategori_sirasi.map(String) : [];
  const sonuc = h("div");
  const kap = h("div");

  function guncelle() {
    const ay = durum.puantajAy;
    const g = servisler.filter((s) => !durum.puantaj || eslesir(`${s.plaka} ${s.guzergah || ""} ${s.sofor_ad || ""} ${s.arac_sahibi || ""}`, durum.puantaj));
    const gunler = (s) => ((s.puantaj || {})[ay] || []).length;
    const gruplar = new Map();
    for (const s of g) { const k = String(s.kademe || ""); (gruplar.get(k) || gruplar.set(k, []).get(k)).push(s); }
    const kademeler = [...gruplar.keys()].sort((a, b) => (sira.indexOf(a) < 0 ? 99 : sira.indexOf(a)) - (sira.indexOf(b) < 0 ? 99 : sira.indexOf(b)));
    kap.replaceChildren(
      ayCubugu(aylar, ay, (a) => { durum.puantajAy = a; guncelle(); }, ayAdi),
      kart(h("p", { class: "kart-etiket" }, ayAdi(ay)), h("p", { class: "buyuk-sayi" }, `${servisler.reduce((t, s) => t + gunler(s), 0)} gün`),
        h("p", { class: "soluk" }, `${servisler.filter((s) => gunler(s)).length} / ${servisler.length} serviste puantaj var`)),
      aramaKutusu(durum.puantaj, (v) => { durum.puantaj = v; guncelle(); }, "Plaka, güzergah ya da şoför ara"),
      aktarDugmesi(() => [`puantaj-${ay}`, ["Plaka", "Kademe", "Güzergah", "Şoför", "Araç sahibi", "Çalışılan gün", "Günler", "Ödeme tarihi"],
        servisler.map((s) => [s.plaka, etiketler[s.kademe] || s.kademe || "", s.guzergah || "", s.sofor_ad || "", s.arac_sahibi || "", ((s.puantaj || {})[ay] || []).length, ((s.puantaj || {})[ay] || []).join(" "), ((s.odemeler || {})[ay]) || ""])]),
      sonuc);
    sonuc.replaceChildren(...(g.length ? kademeler.map((k) => h("section", { class: "grup" },
      h("h3", { class: "grup-baslik" }, etiketler[k] || k || "Diğer"),
      h("div", { class: "liste" }, gruplar.get(k).map((s) => {
        const odeme = ((s.odemeler || {})[ay]) || "";
        return satir({
          baslik: s.plaka, alt: [s.guzergah, s.sofor_ad].filter(Boolean).join(" · "), sag: `${gunler(s)} gün`, sagAlt: odeme ? `Ödeme ${odeme}` : "",
          onclick: yaz ? () => ed.puantajPaneliAc(s.id, ay) : undefined,
        });
      })))) : [bosDurum("Servis bulunamadı.")]));
  }
  guncelle();
  return kap;
}

async function ogrencilerEkrani(tahsilat) {
  const liste = await veri.okul();
  const t = okulToplam(liste);
  const sonuc = h("div");
  const cipAlani = h("div");

  function guncelle() {
    cipAlani.replaceChildren(cipler([["hepsi", "Hepsi", liste.length], ["bekliyor", "Ödemedi", t.bekliyor], ["kismi", "Eksik", t.kismi], ["odendi", "Ödendi", t.odendi]],
      durum.filtre, (k) => { durum.filtre = k; guncelle(); }));
    const g = liste.filter((o) => (durum.filtre === "hepsi" || o.durum === durum.filtre) && (!durum.yontem || o.odemeler.some((x) => x.yontem === durum.yontem)) && (!durum.arama || eslesir(`${o.ad} ${o.sinif} ${o.plaka}`, durum.arama)));
    sonuc.replaceChildren(g.length ? sayfalamali(g, ogrenciSatiri) : bosDurum("Bu filtreyle eşleşen öğrenci yok."));
  }

  const ozet = kart(
    h("p", { class: "kart-etiket" }, "Kalan tahsilat"),
    h("p", { class: "buyuk-sayi" }, para(t.kalan)),
    ilerleme(t.ucret ? t.odenen / t.ucret : 0),
    h("p", { class: "soluk" }, `${para(t.odenen)} tahsil edildi, toplam ${para(t.ucret)} · ${t.ogrenci} öğrenci`));

  const yt = yontemToplami(liste);
  const yontemKartlari = h("div", { class: "yontem-izgara" }, YONTEM_KARTLARI.map(([k, ad, anim, durak]) => {
    const dugme = h("button", { class: "yontem-kart", type: "button", "aria-pressed": String(durum.yontem === k), title: duz("tah_kpi_tikla"), onclick: () => {
      durum.yontem = durum.yontem === k ? "" : k;
      for (const d of yontemKartlari.children) d.setAttribute("aria-pressed", String(d.dataset.yontem === durum.yontem));
      guncelle();
    } },
      animasyon(anim, 72, durak), h("span", { class: "yontem-ad" }, duz(ad)), h("strong", { class: "yontem-tutar" }, para(yt[k].tutar)), h("span", { class: "yontem-sayi" }, doldur("tah_kpi_ogrenci", { n: yt[k].ogrenci })));
    dugme.dataset.yontem = k;
    return dugme;
  }));

  guncelle();
  const arama = aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, "Öğrenci, sınıf ya da plaka ara");
  const yeni = !tahsilat && veri.yazabilir("okul") && ekleDugmesi("Yeni öğrenci", () => ed.ogrenciFormu(null));
  if (!tahsilat) return h("div", { class: "sayfa" }, yeni, arama, cipAlani, sonuc);
  const aktar = aktarDugmesi(() => ["tahsilat", ["Öğrenci", "Sınıf", "Servis", "Ücret", "Ödenen", "Kalan", "Durum"],
    liste.map((o) => [o.ad, o.sinif, o.plaka, o.ucret, o.odenen, o.kalan, { bekliyor: "Ödemedi", kismi: "Eksik", odendi: "Ödendi" }[o.durum]])]);
  return h("div", { class: "sayfa" }, ozet, yontemKartlari, aktar, h("p", { class: "ipucu" }, duz("tah_kpi_not_tekil")), arama, cipAlani, sonuc);
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
        ? o.odemeler.map((g) => satir({ baslik: para(g.tutar), alt: [tarihYaz(g.tarih), YONTEM[g.yontem] || g.yontem, g.not].filter(Boolean).join(" · "), sagAlt: g.kisi ? `Telefon: ${g.kisi}` : "",
          onclick: yazabilir && g.id ? () => ed.odemeFormu(o.id, g.id) : undefined }))
        : bosDurum("Henüz ödeme yok.")),
    yazabilir && islemDugmeleri({ duzenle: () => ed.ogrenciFormu(o.id, { detaydan: true }) }));
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
