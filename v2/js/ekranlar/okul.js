// Okul: servis kullanan öğrencilerin tahsilat takibi. Telefondan yapılabilen tek yazma işlemi ödeme eklemektir.
import { h, ikon, havuz, kart, satir, bilgiSatiri, cipler, aramaKutusu, ayCubugu, sayfalamali, bosDurum, panelAc, detayAc, detayYenile, toast, segment } from "../ui.js";
import * as veri from "../veri.js";
import * as api from "../api.js";
import { goruntule, indir } from "../dosya.js";
import { okulToplam, yontemToplami } from "../hesap.js";
import { animasyon } from "../lottie.js";
import { duz, doldur, baslik as mb, etiket as me } from "../metin.js";
import { para, paraKesin, sayi, tarihYaz, tarihCoz, ayAdi, ayAnahtari, ayEkle, eslesir, aramaEslesir, aramaHazirla, sirala, isoTarih, bugun, telefonTemizle } from "../bicim.js";
import { ekleDugmesi, islemDugmeleri } from "../form.js";
import * as ed from "../duzenle.js";
import { ciktiDugmeleri } from "../cikti.js";
import { ogrenciListesiXlsx, kullanmayanXlsx, servislerPdf, servislerXlsx, servisOgrenciPdf, servisOgrenciXlsx, puantajPdf, tahsilatOzetPdf, tahsilatDetayPdf, tahsilatXlsx, ogrenciOdemePdf, indirimPdf } from "../cikti_okul.js";
import { gelenGunSayisi, gelmeyenGunler, odenecekTutar } from "../puantaj.js";
import { kalanYaz, belgeTonu } from "./filo.js";

export const durum = { arama: "", filtre: "hepsi", yontem: "", kullanmayan: "", servis: "", puantajAy: null, puantaj: "" };

const TON = { bekliyor: "kirmizi", kismi: "kehribar", odendi: "yesil" };
const YONTEM = { nakit: mb("tah_yontem_nakit"), iban: mb("tah_yontem_iban"), kart: mb("tah_yontem_kart") };
// Masaüstündeki tahsilat kartları: aynı ad, aynı Lottie ikonu, dokununca o yöntemle ödeyenleri süzer (tekrar dokununca kalkar).
const YONTEM_KARTLARI = [["nakit", "tah_kpi_nakit", "nakit_payment", 0.7], ["iban", "tah_kpi_iban", "iban_payment", 0.5], ["kart", "tah_kpi_kart", "Card_payment", 0.5]];

const okulHam = () => veri.hamListe("okul_ogrenciler");

function tahsilatCiktilari(liste) {
  // Masaüstündeki düğmelerle aynı ad ve sıra; telefonda tek şerit halinde yan yana durur (kaydırılabilir).
  return h("div", { class: "cikti-grup" },
    ciktiDugmeleri({ dosya: "tahsilat_ozet", xlsx: { ad: duz("tah_excel_btn"), uret: (c) => tahsilatXlsx(c, liste) } }),
    ciktiDugmeleri({ dosya: "tahsilat_ozet", pdf: { ad: duz("pdf_aktar"), yatay: true, altSol: "Tahsilat Raporu — Dönem Özeti", uret: (c) => tahsilatOzetPdf(c, liste) } }),
    ciktiDugmeleri({ dosya: "tahsilat_detay", pdf: { ad: mb("tah_pdf_detay_btn"), yatay: false, altSol: "Tahsilat Raporu — Detaylı Döküm", uret: (c) => tahsilatDetayPdf(c, liste) } }),
    ciktiDugmeleri({ dosya: "indirim_analizi", pdf: { ad: mb("tah_ic_kayip"), yatay: false, altSol: "İndirim Analizi", uret: async (c) => indirimPdf(c, await okulHam()) } }));
}

// Masaüstündeki Okul sekmeleri: Öğrenciler, Servis Kullanmayanlar, Servisler, Tahsilat Raporu.
export async function ciz(alt = "ogrenciler") {
  if (alt === "kullanmayan") return h("div", { class: "sayfa" }, await kullanmayanEkrani());
  if (alt === "servisler") return h("div", { class: "sayfa" }, await servislerEkrani());
  if (alt === "puantaj") return h("div", { class: "sayfa" }, await puantajEkrani());
  return ogrencilerEkrani(alt === "tahsilat");
}

async function kullanmayanEkrani() {
  const liste = await veri.okulServisKullanmayan();
  const yeni = veri.yazabilir("okul") && ekleDugmesi(duz("okul_yeni_ogrenci"), () => ed.ogrenciFormu(null));
  if (!liste.length) return h("div", {}, yeni, bosDurum("Servis kullanmayan öğrenci yok."));
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  function guncelle() {
    const g = liste.filter((o) => !durum.kullanmayan || aramaEslesir(o.arama, durum.kullanmayan));
    ozet.textContent = doldur("okul_toplam", { sayi: g.length });
    sonuc.replaceChildren(g.length ? sayfalamali(g, (o) => satir({ baslik: o.ad, alt: [o.sinif, o.veli].filter(Boolean).join(" · "), sag: o.neden, onclick: () => detayAc(o.ad, () => kullanmayanDetay(o.id)) })) : bosDurum("Öğrenci bulunamadı."));
  }
  guncelle();
  return h("div", {}, yeni, ciktiDugmeleri({ dosya: "servis_kullanmayanlar", xlsx: { uret: async (c) => kullanmayanXlsx(c, await okulHam()) } }), aramaKutusu(durum.kullanmayan, (v) => { durum.kullanmayan = v; guncelle(); }, mb("okul_skul_ara_ph")), ozet, sonuc);
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
  const yeni = veri.yazabilir("okul") && ekleDugmesi(duz("okul_yeni_servis"), () => ed.servisFormu(null));
  if (!liste.length) return h("div", {}, yeni, bosDurum("Servis kaydı yok."));
  const sonuc = h("div");
  const ozet = h("p", { class: "soluk ozet-satir" });
  function guncelle() {
    const g = liste.filter((s) => !durum.servis || aramaEslesir(s.arama, durum.servis));
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
  return h("div", {}, yeni, ciktiDugmeleri({ dosya: "servis_araclari",
    pdf: { yatay: true, altSol: "Servis Araçları Listesi", uret: async (c) => servislerPdf(c, await okulHam()) },
    xlsx: { uret: async (c) => servislerXlsx(c, await okulHam()) } }), aramaKutusu(durum.servis, (v) => { durum.servis = v; guncelle(); }, mb("okul_srv_ara_ph")), ozet, sonuc);
}

async function servisDetay(id) {
  const s = (await veri.okulServisler()).find((x) => x.id === id);
  if (!s) return bosDurum("Servis bulunamadı.");
  const temiz = telefonTemizle(s.tel);
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, [s.tip, s.sahip].filter(Boolean).join(" · ")), h("p", { class: "buyuk-sayi baslik" }, s.plaka),
      h("div", { class: "bilgi-grid" }, bilgiSatiri(mb("okul_srv_col_sayi"), String(s.ogrenci)), bilgiSatiri(mb("okul_srv_col_ucret"), s.ucret ? para(s.ucret) : ""), bilgiSatiri(mb("okul_srv_col_guzergah"), s.guzergah))),
    s.sofor && kart(h("h3", {}, mb("okul_srv_col_sofor")), h("div", { class: "telefon" },
      h("span", { class: "satir-metin" }, h("span", { class: "satir-baslik" }, s.sofor), h("span", { class: "satir-alt" }, s.tel)),
      temiz && h("a", { class: "ikon-dugme dolu", href: "tel:" + temiz, "aria-label": "Şoförü ara" }, ikon("telefon", 20)))),
    kart(h("h3", {}, "Belgeler"), s.belgeler.length
      ? h("div", { class: "liste" }, s.belgeler.map((b) => satir({ baslik: b.ad, alt: `Bitiş: ${tarihYaz(b.son)}`, sag: kalanYaz(b.gun), ton: belgeTonu(b.seviye) })))
      : bosDurum("Belge tarihi girilmemiş.")),
    ciktiDugmeleri({ dosya: `servis_ogrencileri_${s.plaka}`.replace(/\s+/g, "_"),
      pdf: { ad: "Öğrenci listesi PDF", yatay: true, altSol: s.plaka, uret: async (c) => servisOgrenciPdf(c, await okulHam(), (await okulHam()).find((x) => x.id === id)) },
      xlsx: { ad: "Öğrenci listesi Excel", uret: async (c) => servisOgrenciXlsx(c, await okulHam(), (await okulHam()).find((x) => x.id === id)) } }),
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
    const g = servisler.filter((s) => !durum.puantaj || aramaEslesir(aramaHazirla([s.plaka, String(s.plaka || "").replace(/\s+/g, ""), s.guzergah, s.sofor_ad, s.sofor_tel, s.arac_sahibi], [s.sofor_tel]), durum.puantaj));
    const gunler = (s) => gelenGunSayisi(s, ay, ayar);
    const gruplar = new Map();
    for (const s of g) { const k = String(s.kademe || ""); (gruplar.get(k) || gruplar.set(k, []).get(k)).push(s); }
    const kademeler = [...gruplar.keys()].sort((a, b) => (sira.indexOf(a) < 0 ? 99 : sira.indexOf(a)) - (sira.indexOf(b) < 0 ? 99 : sira.indexOf(b)));
    kap.replaceChildren(
      ayCubugu([...aylar].reverse(), ay, (a) => { durum.puantajAy = a; guncelle(); }, ayAdi),
      kart(h("p", { class: "kart-etiket" }, `${ayAdi(ay)} · ödenecek`), h("p", { class: "buyuk-sayi" }, para(servisler.reduce((t, s) => t + odenecekTutar(s, ay, ayar), 0))),
        h("p", { class: "soluk" }, `${servisler.filter((s) => gelmeyenGunler(s, ay).size).length} serviste gelmeyen gün var`)),
      aramaKutusu(durum.puantaj, (v) => { durum.puantaj = v; guncelle(); }, mb("okul_srv_ara_ph")),
      ciktiDugmeleri({ dosya: `servis_puantaj_${ay}`, pdf: { yatay: true, altSol: "Servis Puantaj Listesi", uret: (c) => puantajPdf(c, ham, ayar, durum.puantajAy) } }),
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
    cipAlani.replaceChildren(cipler([["hepsi", mb("okul_tum_odemeler"), liste.length], ["bekliyor", mb("okul_bekliyor"), t.bekliyor], ["kismi", mb("okul_kismi_odendi"), t.kismi], ["odendi", mb("okul_odendi"), t.odendi]],
      durum.filtre, (k) => { durum.filtre = k; guncelle(); }));
    const g = liste.filter((o) => (durum.filtre === "hepsi" || o.durum === durum.filtre) && (!durum.yontem || o.odemeler.some((x) => x.yontem === durum.yontem)) && (!durum.arama || aramaEslesir(o.arama, durum.arama)));
    sonuc.replaceChildren(g.length ? sayfalamali(g, ogrenciSatiri) : bosDurum("Bu filtreyle eşleşen öğrenci yok."));
  }

  const ozet = kart(
    h("p", { class: "kart-etiket" }, "Kalan tahsilat"),
    h("div", { class: "havuz-satir" },
      h("div", {}, h("p", { class: "buyuk-sayi" }, para(t.kalan)), h("p", { class: "soluk" }, `${para(t.odenen)} tahsil edildi, toplam ${para(t.ucret)} · ${t.ogrenci} öğrenci`)),
      t.ucret > 0 && havuz(t.odenen / t.ucret, { boyut: 96 })));

  const yt = yontemToplami(liste);
  const yontemKartlari = h("div", { class: "yontem-izgara" }, YONTEM_KARTLARI.map(([k, ad, anim, durak]) => {
    const dugme = h("button", { class: "yontem-kart", type: "button", "aria-pressed": String(durum.yontem === k), title: duz("tah_kpi_tikla"), onclick: () => {
      durum.yontem = durum.yontem === k ? "" : k;
      for (const d of yontemKartlari.children) d.setAttribute("aria-pressed", String(d.dataset.yontem === durum.yontem));
      guncelle();
    } },
      animasyon(anim, 96, durak), h("span", { class: "yontem-ad" }, duz(ad)), h("strong", { class: "yontem-tutar" }, para(yt[k].tutar)), h("span", { class: "yontem-sayi" }, doldur("tah_kpi_ogrenci", { n: yt[k].ogrenci })));
    dugme.dataset.yontem = k;
    return dugme;
  }));

  guncelle();
  const arama = aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, mb("okul_arama_placeholder"));
  const yeni = !tahsilat && veri.yazabilir("okul") && ekleDugmesi(duz("okul_yeni_ogrenci"), () => ed.ogrenciFormu(null));
  if (!tahsilat) return h("div", { class: "sayfa" }, yeni, ciktiDugmeleri({ dosya: "ogrenci_listesi", xlsx: { uret: async (c) => ogrenciListesiXlsx(c, await okulHam()) } }), arama, cipAlani, sonuc);
  const aktar = tahsilatCiktilari(liste);
  return h("div", { class: "sayfa" }, ozet, yontemKartlari, aktar, h("p", { class: "ipucu" }, duz("tah_kpi_not_tekil")), arama, cipAlani, sonuc);
}

function ogrenciSatiri(o) {
  const ucretYok = o.ucret <= 0;
  return satir({
    baslik: o.ad, alt: [o.sinif, o.plaka].filter(Boolean).join(" · "), ton: ucretYok ? "" : TON[o.durum],
    sag: ucretYok ? "Ücret yok" : o.durum === "odendi" ? mb("okul_odendi") : para(o.kalan), sagAlt: ucretYok ? (o.odenen ? `${para(o.odenen)} ödendi` : "") : `${para(o.odenen)} / ${para(o.ucret)}`,
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
      h("p", { class: "kart-etiket" }, ucretYok || o.durum === "odendi" ? mb("okul_odeme_durum") : me("okul_kalan_lbl")),
      h("p", { class: "buyuk-sayi " + (ucretYok ? "" : TON[o.durum]) }, ucretYok ? "Ücret girilmemiş" : o.durum === "odendi" ? mb("okul_odendi") : para(o.kalan)),
      !ucretYok && h("div", { class: "havuz-ortala" }, havuz(o.odenen / o.ucret, { boyut: 144 })),
      h("div", { class: "bilgi-grid" }, bilgiSatiri(mb("tah_col_donem"), para(o.ucret)), bilgiSatiri(mb("tah_col_odenen"), para(o.odenen))),
      yazabilir && h("button", { class: "dugme birincil genis", onclick: () => odemePaneli(o) }, ikon("arti", 18), "Ödeme ekle")),
    o.telefonlar.length > 0 && kart(h("h3", {}, o.veli ? `Ulaş · ${o.veli}` : "Ulaş"), o.telefonlar.map(([kim, tel]) => telefonSatiri(kim, tel))),
    ciktiDugmeleri({ dosya: "odeme_gecmisi", pdf: { ad: "Ödeme geçmişi PDF", yatay: false, altSol: "Ödeme Geçmişi Raporu", uret: (c) => ogrenciOdemePdf(c, o) } }),
    kart(h("h3", {}, mb("tah_panel_odeme_gecmisi")),
      o.odemeler.length
        ? o.odemeler.map((g) => satir({ baslik: para(g.tutar), alt: [tarihYaz(g.tarih), YONTEM[g.yontem] || g.yontem, g.not, g.dekont && "Dekont var"].filter(Boolean).join(" · "), sagAlt: g.kisi ? `Telefon: ${g.kisi}` : "",
          onclick: g.dekont ? () => odemeDetayPaneli(o, g, yazabilir) : yazabilir && g.id ? () => ed.odemeFormu(o.id, g.id) : undefined }))
        : bosDurum("Henüz ödeme yok.")),
    yazabilir && islemDugmeleri({ duzenle: () => ed.ogrenciFormu(o.id, { detaydan: true }) }));
}

// Dekontu olan ödeme: bilgi + dekontu yeni sekmede görüntüle / telefona indir (dosya Drive'dadır; sunucu fonksiyonu yetkiyi denetleyip getirir).
function odemeDetayPaneli(o, g, yazabilir) {
  const dosyaAdi = g.dekontYolu.split("/").pop();
  const blobAl = () => api.dekontDriveIndir(veri.baglam.isletme, o.id, g.dekontYolu);
  const panel = panelAc(para(g.tutar), h("div", { class: "form" },
    h("div", { class: "kart" }, bilgiSatiri("Öğrenci", o.ad), bilgiSatiri("Tarih", tarihYaz(g.tarih)), bilgiSatiri("Yöntem", YONTEM[g.yontem] || g.yontem), g.not && bilgiSatiri("Not", g.not)),
    h("button", { class: "dugme birincil genis", type: "button", onclick: (e) => goruntule(e.currentTarget, blobAl, dosyaAdi) }, ikon("goz", 18), "Dekontu görüntüle"),
    h("button", { class: "dugme ikincil genis", type: "button", onclick: (e) => indir(e.currentTarget, blobAl, dosyaAdi) }, ikon("indir", 18), "Telefona indir"),
    yazabilir && g.id && h("button", { class: "dugme ikincil genis", type: "button", onclick: () => { panel.kapat(); ed.odemeFormu(o.id, g.id); } }, "Ödemeyi düzenle")));
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
