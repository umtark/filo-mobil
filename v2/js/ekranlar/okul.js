// Okul: servis kullanan öğrencilerin tahsilat takibi. Telefondan yapılabilen tek yazma işlemi ödeme eklemektir.
import { h, ikon, havuz, kart, satir, bilgiSatiri, cipler, aramaKutusu, ayCubugu, sayfalamali, bosDurum, panelAc, detayAc, detayYenile, toast, segment, animOnay } from "../ui.js";
import * as veri from "../veri.js";
import * as api from "../api.js";
import * as dn from "../donem.js";
import { goruntule, indir } from "../dosya.js";
import { okulToplam, yontemToplami, tahsilatSirasi } from "../hesap.js";
import { animasyon } from "../lottie.js";
import { duz, doldur, metin, baslik as mb, etiket as me } from "../metin.js";
import { para, paraKesin, sayi, sayiYaz, tarihYaz, tarihCoz, ayAdi, ayAnahtari, ayEkle, eslesir, aramaEslesir, aramaHazirla, sirala, isoTarih, bugun, telefonTemizle } from "../bicim.js";
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

// Masaüstündeki Okul sekmeleri: Öğrenciler, Servis Kullanmayanlar, Servisler, Tahsilat Raporu. Üstte masaüstündeki gibi seçili dönem ve dönem geçişi durur.
export async function ciz(alt = "ogrenciler") {
  const [sayfa, serit] = await Promise.all([sayfaCiz(alt), donemSeridi()]);
  sayfa.prepend(serit);
  return sayfa;
}

async function sayfaCiz(alt) {
  if (alt === "kullanmayan") return h("div", { class: "sayfa" }, await kullanmayanEkrani());
  if (alt === "servisler") return h("div", { class: "sayfa" }, await servislerEkrani());
  if (alt === "puantaj") return h("div", { class: "sayfa" }, await puantajEkrani());
  return ogrencilerEkrani(alt === "tahsilat");
}

// ── Dönem (masaüstündeki üst Dönem seçicisi) ────────────────────────────────
// Hangi dönemin gösterileceği bu telefona özeldir (veri.okulDonemi); başkasının ekranı ve ödeme girişi etkilenmez. Hiçbir öğrencide açık olmayan bir dönem
// seçilirse önce açılır (okul_donem_uygula); hesap donem.js'dedir.
async function donemSeridi() {
  const [ham, { secili }] = await Promise.all([okulHam(), veri.okulDonemi()]);
  return h("div", { class: "donem-serit" },
    h("span", { class: "donem-serit-metin" }, doldur("okul_donem_gosterilen", { donem: dn.donemAdi(secili) })),
    h("button", { class: "dugme ikincil", type: "button", onclick: () => donemPaneli(dn.ogrencilerSuz(ham), secili) }, "Dönemi değiştir"));
}

// Bir karar paneli açar; kullanıcı arka plana dokunup kapatırsa da (null) çözülür.
function kararPaneli(baslik, govdeKur) {
  return new Promise((coz) => {
    let bitti = false;
    const bitir = (deger) => { if (bitti) return; bitti = true; gozlem.disconnect(); panel.kapat(); coz(deger); };
    const panel = panelAc(baslik, govdeKur(bitir));
    const gozlem = new MutationObserver(() => { if (!panel.arka.isConnected) bitir(null); });
    gozlem.observe(document.body, { childList: true });
  });
}

function donemPaneli(ogrenciler, aktif) {
  const kayitli = dn.kayitliDonemler(ogrenciler, aktif);
  const yillar = new Set([...kayitli].map((k) => Number(k.slice(0, 4))));
  let yil = Number(aktif.slice(0, 4)), no = aktif[5];
  const kok = h("div", { class: "form" });
  const hata = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const panel = panelAc(me("okul_donem_label"), kok);

  function yeniYilSor() {
    const girdi = h("input", { class: "girdi", type: "text", inputmode: "numeric", maxlength: "4", value: String(yil - 1), "aria-label": mb("okul_donem_baska_yil_baslik") });
    const uyari = h("p", { class: "hata-metin", role: "alert", hidden: true });
    kok.replaceChildren(
      h("label", { class: "alan" }, h("span", {}, mb("okul_donem_baska_yil_soru")), girdi), uyari,
      h("button", { class: "dugme birincil genis", type: "button", onclick: () => {
        if (!/^\d{4}$/.test(girdi.value.trim())) { uyari.textContent = mb("okul_donem_baska_yil_soru"); uyari.hidden = false; return; }
        yil = Number(girdi.value.trim());
        yillar.add(yil);
        ciz();
      } }, mb("okul_donem_baska_yil_baslik")),
      h("button", { class: "dugme ikincil genis", type: "button", onclick: ciz }, mb("iptal_btn")));
    girdi.focus();
  }

  function ciz() {
    const hedef = `${yil}-${no}`;
    const ayni = hedef === aktif;
    const yilSecimi = h("select", { class: "girdi", "aria-label": me("okul_donem_label") },
      [...yillar].sort((a, b) => b - a).map((y) => h("option", { value: String(y) }, `${y}-${y + 1}`)), h("option", { value: "yeni" }, mb("okul_donem_baska_yil")));
    yilSecimi.value = String(yil);
    yilSecimi.addEventListener("change", () => { if (yilSecimi.value === "yeni") yeniYilSor(); else { yil = Number(yilSecimi.value); ciz(); } });
    const donemSecimi = h("select", { class: "girdi", "aria-label": me("okul_donem_label") }, ["1", "2"].map((n) => h("option", { value: n }, mb("okul_donem_" + n))));
    donemSecimi.value = no;
    donemSecimi.addEventListener("change", () => { no = donemSecimi.value; ciz(); });
    const etiket = ayni ? mb("okul_donem_gec_pasif") : doldur(kayitli.has(hedef) ? "okul_donem_gec_btn" : "okul_donem_yeni_btn", { donem: dn.donemAdi(hedef) });
    const gec = h("button", { class: "dugme birincil genis", type: "button", disabled: ayni, onclick: () => donemGec(hedef, gec, hata, panel.kapat) }, etiket);
    hata.hidden = true;
    kok.replaceChildren(
      h("p", { class: "soluk" }, doldur("okul_donem_gosterilen", { donem: dn.donemAdi(aktif) })),
      h("div", { class: "iki-sutun" }, yilSecimi, donemSecimi), gec, hata,
      h("p", { class: "ipucu" }, mb("okul_donem_gec_tt")), h("p", { class: "ipucu" }, "Seçim yalnızca bu telefonu etkiler; başka kullanıcılar kendi seçtikleri dönemde çalışmaya devam eder."));
  }
  ciz();
}

async function donemGec(hedef, dugme, hata, kapat) {
  dugme.disabled = true;
  hata.hidden = true;
  try {
    veri.ayarTazele();
    const { secili, layout } = await veri.okulDonemi();
    const satirlar = await veri.okulSatirlariTaze();
    const ogrenciler = satirlar.map((s) => s.data);
    if (!dn.donemAcikMi(ogrenciler, layout, hedef)) {
      if (!veri.yazabilir("okul")) throw new Error("Yeni bir dönemi yalnızca yazma yetkisi olan kullanıcılar açabilir.");
      if (!(await ilkAcilisOnayi(secili, hedef))) { dugme.disabled = false; return; }
      // 1. dönemden aynı eğitim yılının 2. dönemine ilk geçiş: 2. dönemi de peşin ödeyenler bulunup onaylatılır
      let ikiDonem = {};
      if (secili.slice(0, 4) === hedef.slice(0, 4) && secili[5] === "1" && hedef[5] === "2") {
        const adaylar = dn.ikiDonemAdaylari(dn.gorunumListesi(ogrenciler, secili, layout));
        if (adaylar.length) {
          ikiDonem = await ikiDonemDiyalogu(adaylar);
          if (ikiDonem === null) { dugme.disabled = false; return; }
        }
      }
      const guncel = dn.donemAc(ogrenciler, layout, secili, hedef, ikiDonem);
      const surumler = new Map(satirlar.map((s) => [s.id, s.surum]));
      await veri.donemUygula({ eski: layout, hedef, kayitlar: guncel.map((o) => ({ id: o.id, surum: surumler.get(o.id), data: o })), sayi: satirlar.length, yedek: true });
      veri.sahibeBildir("Okul", `${dn.donemAdi(hedef)} dönemini açtı`);
    }
    veri.okulDonemiSec(hedef);
    kapat();
    toast(doldur("okul_donem_gecildi", { donem: dn.donemAdi(hedef) }));
  } catch (e) {
    hata.textContent = doldur("okul_donem_gecis_hata", { e: String(e.message).replace(/^cakisma: /, "") });
    hata.hidden = false;
    dugme.disabled = false;
  }
  await detayYenile({ kok: true });
}

function ilkAcilisOnayi(eski, hedef) {
  const satirlar = metin("okul_donem_ilk_acilis_detay").split("\n").map((s) => s.trim()).filter(Boolean);
  const maddeler = satirlar.filter((s) => s.startsWith("•")), soru = satirlar.filter((s) => !s.startsWith("•")).pop() || "";
  return kararPaneli(mb("okul_donem_gecis_baslik"), (bitir) => h("div", { class: "form" },
    h("p", {}, h("strong", {}, doldur("okul_donem_ilk_acilis_baslik", { hedef: dn.donemAdi(hedef) }))),
    h("ul", { class: "donem-maddeler" }, maddeler.map((s) => h("li", {}, s.replace(/^•\s*/, "").replace("{eski}", dn.donemAdi(eski))))),
    h("p", {}, soru),
    h("button", { class: "dugme birincil genis", type: "button", onclick: () => bitir(true) }, "Devam et"),
    h("button", { class: "dugme ikincil genis", type: "button", onclick: () => bitir(false) }, mb("iptal_btn")))).then(Boolean);
}

// Dönüş: { öğrenci_id: 2. dönem payı }; "Aktarmadan devam" -> {}; kapatılırsa null.
function ikiDonemDiyalogu(adaylar) {
  return kararPaneli(mb("okul_iki_donem_baslik"), (bitir) => {
    const satirlar = adaylar.map((a) => {
      const onay = animOnay({ etiket: a.ogrenci.ad_soyad || "", isaretli: a.guclu });
      const pay = h("input", { class: "girdi", type: "text", inputmode: "numeric", value: String(Math.round(a.pay)), "aria-label": mb("okul_iki_donem_col_pay") });
      return { a, onay, pay, kok: h("section", { class: "kart" }, onay,
        h("p", { class: "soluk" }, `${me("okul_iki_donem_col_ucret")}: ${para(a.ucret)} · ${me("okul_iki_donem_col_odenen")}: ${para(a.odenen)}`), h("p", { class: "soluk" }, a.neden),
        h("label", { class: "alan" }, h("span", {}, me("okul_iki_donem_col_pay")), pay)) };
    });
    const secilen = () => Object.fromEntries(satirlar.filter((s) => s.onay.deger() && sayi(s.pay.value) > 0).map((s) => [s.a.ogrenci.id, Math.min(sayi(s.pay.value), s.a.odenen)]));
    return h("div", { class: "form" }, h("p", { class: "soluk" }, mb("okul_iki_donem_aciklama")), satirlar.map((s) => s.kok),
      h("button", { class: "dugme birincil genis", type: "button", onclick: () => bitir(secilen()) }, mb("okul_iki_donem_aktar")),
      h("button", { class: "dugme ikincil genis", type: "button", onclick: () => bitir({}) }, mb("okul_iki_donem_aktarma")),
      h("button", { class: "dugme ikincil genis", type: "button", onclick: () => bitir(null) }, mb("iptal_btn")));
  });
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
  const r = (await okulHam()).find((x) => x.id === id) || {};
  return h("div", { class: "sayfa" },
    kart(h("p", { class: "soluk" }, o.sinif), h("p", { class: "kart-etiket" }, "Durum"), h("p", { class: "buyuk-sayi" }, o.neden)),
    o.telefonlar.length > 0 && kart(h("h3", {}, o.veli ? `Ulaş · ${o.veli}` : "Ulaş"), o.telefonlar.map(([kim, tel]) => telefonSatiri(kim, tel))),
    bilgiKarti(r),
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

// Masaüstündeki gibi açılır filtre (Sınıf, Servis, Ödeme Yöntemi): etiket + seçim kutusu.
function secimAlani(etiket, secenekler, deger, degisti) {
  const s = h("select", { class: "girdi", "aria-label": etiket }, secenekler.map(([k, ad]) => h("option", { value: k }, ad)));
  s.value = deger;
  if (s.selectedIndex < 0) s.selectedIndex = 0;
  s.addEventListener("change", () => degisti(s.value));
  return { kok: h("label", { class: "alan" }, h("span", {}, etiket), s), sec: (v) => { s.value = v; if (s.selectedIndex < 0) s.selectedIndex = 0; } };
}
const tekil = (liste) => [...new Set(liste.filter(Boolean))].sort(sirala);

// Masaüstündeki "Ödeme Yöntemi" filtresi: yöntem, birden fazla yöntem (pozitif tutarlı ödemelerde 2+ farklı yöntem) ve 2. dönemi peşin ödeyenler (donem.js: pesinIdleri).
const yontemUyar = (o, y, pesin = new Set()) => !y || (y === "coklu" ? new Set(o.odemeler.filter((x) => x.tutar > 0).map((x) => x.yontem)).size > 1
  : y === "pesin" ? pesin.has(o.id) : o.odemeler.some((x) => x.yontem === y));

async function ogrencilerEkrani(tahsilat) {
  const liste = await veri.okul();
  const pesin = tahsilat ? dn.pesinIdleri(dn.ogrencilerSuz(await okulHam()), (await veri.okulDonemi()).secili) : new Set();
  const t = okulToplam(liste);
  const sonuc = h("div");
  const cipAlani = h("div");
  const servisSecenekleri = [["", mb("okul_tum_servisler")], ...tekil(liste.map((o) => o.plaka)).map((p) => [p, p])];
  const sinifSecenekleri = [["", mb("okul_tum_siniflar")], ...tekil(liste.map((o) => o.sinif)).map((s) => [s, s])];
  const gecerli = (secenekler, v) => (secenekler.some(([k]) => k === v) ? v : "");
  const servisAnahtar = tahsilat ? "tahServis" : "ogrServis";
  durum[servisAnahtar] = gecerli(servisSecenekleri, durum[servisAnahtar] || "");
  durum.ogrSinif = gecerli(sinifSecenekleri, durum.ogrSinif || "");
  const servisKutusu = secimAlani(mb(tahsilat ? "tah_servis_lbl" : "okul_servis_label"), servisSecenekleri, durum[servisAnahtar], (v) => { durum[servisAnahtar] = v; guncelle(); });
  const sinifKutusu = !tahsilat && secimAlani(me("okul_sinif_label"), sinifSecenekleri, durum.ogrSinif, (v) => { durum.ogrSinif = v; guncelle(); });
  const yontemKutusu = tahsilat && secimAlani(mb("tah_yontem_lbl"), [["", mb("tah_yontem_hepsi")], ["nakit", mb("tah_yontem_nakit")], ["iban", mb("tah_yontem_iban")], ["kart", mb("tah_yontem_kart")], ["coklu", mb("tah_yontem_coklu")], ["pesin", mb("tah_yontem_pesin")]],
    durum.yontem, (v) => { durum.yontem = v; yontemKartlariniEsitle(); guncelle(); });
  let yontemKartlari = null;
  const yontemKartlariniEsitle = () => {
    if (yontemKartlari) for (const d of yontemKartlari.children) d.setAttribute("aria-pressed", String(d.dataset.yontem === durum.yontem));
  };

  function guncelle() {
    // Durum çiplerinin sayıları, diğer filtrelerle (servis, sınıf, yöntem, arama) daraltılmış listeye göredir.
    const temel = liste.filter((o) => (!durum.arama || aramaEslesir(o.arama, durum.arama))
      && (tahsilat ? yontemUyar(o, durum.yontem, pesin) && (!durum.tahServis || o.plaka === durum.tahServis) : (!durum.ogrServis || o.plaka === durum.ogrServis) && (!durum.ogrSinif || o.sinif === durum.ogrSinif)));
    const tt = okulToplam(temel);
    cipAlani.replaceChildren(cipler([["hepsi", mb("tah_ozet_servis_ogrenci"), temel.length], ["odendi", mb("tah_ozet_tam_odeyen"), tt.odendi], ["kismi", mb("tah_ozet_kismi_odeyen"), tt.kismi], ["bekliyor", mb("tah_ozet_hic_odemeyen"), tt.bekliyor]],
      durum.filtre, (k) => { durum.filtre = k; guncelle(); }));
    const g = temel.filter((o) => durum.filtre === "hepsi" || o.durum === durum.filtre);
    if (tahsilat) g.sort(tahsilatSirasi);
    sonuc.replaceChildren(g.length ? sayfalamali(g, (o) => ogrenciSatiri(o, tahsilat)) : bosDurum("Bu filtreyle eşleşen öğrenci yok."));
  }

  const ozet = kart(
    h("p", { class: "kart-etiket" }, me("tah_ozet_kalan")),
    h("div", { class: "havuz-satir" },
      h("div", {}, h("p", { class: "buyuk-sayi" }, para(t.kalan)), h("p", { class: "soluk" }, `${para(t.odenen)} tahsil edildi, toplam ${para(t.ucret)} · ${t.ogrenci} öğrenci`)),
      t.ucret > 0 && havuz(t.odenen / t.ucret, { boyut: 96 })));

  const yt = yontemToplami(liste);
  yontemKartlari = h("div", { class: "yontem-izgara" }, YONTEM_KARTLARI.map(([k, ad, anim, durak]) => {
    const dugme = h("button", { class: "yontem-kart", type: "button", "aria-pressed": String(durum.yontem === k), title: duz("tah_kpi_tikla"), onclick: () => {
      durum.yontem = durum.yontem === k ? "" : k;
      yontemKartlariniEsitle();
      if (yontemKutusu) yontemKutusu.sec(durum.yontem);
      guncelle();
    } },
      animasyon(anim, 96, durak), h("span", { class: "yontem-ad" }, duz(ad)), h("strong", { class: "yontem-tutar" }, para(yt[k].tutar)), h("span", { class: "yontem-sayi" }, doldur("tah_kpi_ogrenci", { n: yt[k].ogrenci })));
    dugme.dataset.yontem = k;
    return dugme;
  }));

  guncelle();
  const arama = aramaKutusu(durum.arama, (v) => { durum.arama = v; guncelle(); }, mb("okul_arama_placeholder"));
  const yeni = !tahsilat && veri.yazabilir("okul") && ekleDugmesi(duz("okul_yeni_ogrenci"), () => ed.ogrenciFormu(null));
  if (!tahsilat) return h("div", { class: "sayfa" }, yeni, ciktiDugmeleri({ dosya: "ogrenci_listesi", xlsx: { uret: async (c) => ogrenciListesiXlsx(c, await okulHam()) } }), arama,
    h("div", { class: "iki-sutun" }, sinifKutusu.kok, servisKutusu.kok), cipAlani, sonuc);
  const aktar = tahsilatCiktilari(liste);
  return h("div", { class: "sayfa" }, ozet, yontemKartlari, aktar, h("p", { class: "ipucu" }, duz("tah_kpi_not_tekil")), arama,
    h("div", { class: "iki-sutun" }, servisKutusu.kok, yontemKutusu.kok), cipAlani, sonuc);
}

function ogrenciSatiri(o, tahsilat = false) {
  const ucretYok = o.ucret <= 0;
  const sonOdeme = tahsilat && o.sonOdeme > 0 ? `${me("tah_col_son_odeme")}: ${tarihYaz(new Date(o.sonOdeme))}` : "";
  return satir({
    baslik: o.ad, alt: [o.sinif, o.plaka, sonOdeme].filter(Boolean).join(" · "), ton: ucretYok ? "" : TON[o.durum],
    sag: ucretYok ? "Ücret yok" : o.durum === "odendi" ? mb("okul_odendi") : para(o.kalan), sagAlt: ucretYok ? (o.odenen ? `${para(o.odenen)} ödendi` : "") : `${para(o.odenen)} / ${para(o.ucret)}`,
    onclick: () => ogrenciAc(o.id, o.ad), kayit: `okul_ogrenciler/${o.id}`,
  });
}

export async function kayitAc(id) {
  const r = (await okulHam()).find((x) => x.id === id && !String(x.id).startsWith("srv_"));
  if (r) ogrenciAc(id, r.ad_soyad || "Öğrenci");
  return Boolean(r);
}

export function ogrenciAc(id, ad) {
  detayAc(ad, async () => {
    const [liste, ham] = await Promise.all([veri.okul(), okulHam()]);
    const o = liste.find((x) => x.id === id);
    return o ? detay(o, dn.oncekiDonemBorclari(ham.find((x) => x.id === id) || {}, sayiYaz), ham.find((x) => x.id === id) || {}) : bosDurum("Öğrenci bulunamadı.");
  });
}

// Öğrencinin kayıtlı bilgileri (düzenleme formu açılmadan): boş olanlar gösterilmez.
function bilgiKarti(r) {
  const satirlar = [
    bilgiSatiri(me("okul_col_sinif"), r.sinif), bilgiSatiri(me("okul_col_tc"), r.tc_kimlik), bilgiSatiri(me("okul_col_veli_adi"), r.veli_adi),
    bilgiSatiri(me("okul_col_servis"), r.servis_kullanmiyor ? mb("okul_servis_kullanmiyor_rozet") : String(r.servis_plaka || "").trim()),
    sayi(r.liste_ucreti) > 0 ? bilgiSatiri("Liste ücreti", para(r.liste_ucreti)) : null,
    bilgiSatiri(me("okul_col_adres"), String(r.adres || "").trim()), bilgiSatiri(me("okul_col_notlar"), String(r.notlar || "").trim()),
  ].filter(Boolean);
  return satirlar.length ? kart(h("h3", {}, "Bilgiler"), satirlar) : null;
}

function detay(o, oncekiBorclar = [], r = {}) {
  const yazabilir = veri.yazabilir("okul");
  const ucretYok = o.ucret <= 0;
  return h("div", { class: "sayfa" },
    kart(
      h("p", { class: "soluk" }, [o.sinif, o.plaka].filter(Boolean).join(" · ")),
      h("p", { class: "kart-etiket" }, ucretYok || o.durum === "odendi" ? mb("okul_odeme_durum") : me("okul_kalan_lbl")),
      h("p", { class: "buyuk-sayi " + (ucretYok ? "" : TON[o.durum]) }, ucretYok ? "Ücret girilmemiş" : o.durum === "odendi" ? mb("okul_odendi") : para(o.kalan)),
      !ucretYok && h("div", { class: "havuz-ortala" }, havuz(o.odenen / o.ucret, { boyut: 144 })),
      h("div", { class: "bilgi-grid" }, bilgiSatiri(mb("tah_col_donem"), para(o.ucret)), bilgiSatiri(mb("tah_col_odenen"), para(o.odenen))),
      yazabilir && h("button", { class: "dugme ekle genis", onclick: () => odemePaneli(o) }, ikon("arti", 18), "Ödeme ekle")),
    oncekiBorclar.length > 0 && kart(h("p", { class: "donem-borc" }, oncekiBorclar.join(" · ")), h("p", { class: "ipucu" }, mb("okul_onceki_donem_borc_tt"))),
    o.telefonlar.length > 0 && kart(h("h3", {}, o.veli ? `Ulaş · ${o.veli}` : "Ulaş"), o.telefonlar.map(([kim, tel]) => telefonSatiri(kim, tel))),
    bilgiKarti(r),
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
    h("div", { class: "kart" }, bilgiSatiri("Öğrenci", o.ad), bilgiSatiri(me("okul_odeme_tarih_lbl"), tarihYaz(g.tarih)), bilgiSatiri(me("tah_yontem_lbl"), YONTEM[g.yontem] || g.yontem), g.not && bilgiSatiri(mb("okul_gecmis_col_not"), g.not)),
    h("button", { class: "dugme birincil genis", type: "button", onclick: (e) => goruntule(e.currentTarget, blobAl, dosyaAdi) }, ikon("goz", 18), mb("okul_dekontu_goruntule")),
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
  let tur = o.kalan > 0 ? "kalan" : "serbest";   // kalan: tam ödeyen · iki: iki dönemi birden ödeyen (peşin) · serbest: elle tutar
  const tutar = h("input", { class: "girdi", type: "text", inputmode: "decimal", autocomplete: "off", value: o.kalan > 0 ? String(o.kalan).replace(".", ",") : "", "aria-label": "Tutar", oninput: etiketle });
  const tarih = h("input", { class: "girdi", type: "date", value: isoTarih(bugun()), max: isoTarih(bugun()), "aria-label": "Tarih", oninput: etiketle });
  const not = h("input", { class: "girdi", type: "text", maxlength: "120", placeholder: "Not (isteğe bağlı)", "aria-label": "Not" });
  const hata = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const secici = ed.dekontSecici(false);
  const kaydet = h("button", { class: "dugme birincil genis", onclick: gonder }, "");
  const yontemAlani = h("div");
  const turAlani = h("div");
  const ipucu = h("p", { class: "ipucu", hidden: true });

  function turCiz() {
    const secenekler = [["serbest", "Tutar gir"]];
    if (o.kalan > 0) secenekler.unshift(["kalan", "Kalanı öde"]);
    if (o.ucret > 0) secenekler.push(["iki", "2 dönemi birden"]);
    turAlani.replaceChildren(segment(secenekler, tur, (k) => {
      tur = k;
      if (k === "kalan") tutar.value = String(o.kalan).replace(".", ",");
      else if (k === "iki") tutar.value = String(Math.round((o.kalan + o.ucret) * 100) / 100).replace(".", ",");
      turCiz(); etiketle();
    }));
  }
  function yontemCiz() {
    yontemAlani.replaceChildren(segment(Object.entries(YONTEM), yontem, (k) => { yontem = k; yontemCiz(); }));
  }
  function etiketle() {
    const n = sayi(tutar.value);
    kaydet.textContent = n > 0 ? `${paraKesin(n)} kaydet` : "Kaydet";
    ipucu.hidden = tur !== "iki" || !(n > 0);
    if (!ipucu.hidden) ipucu.textContent = `Dönem ücreti ${para(Math.max(o.ucret, o.odenen + n))} olarak güncellenir. 2. dönem açılırken ödeme iki döneme otomatik bölünür.`;
  }
  async function gonder() {
    const n = sayi(tutar.value);
    hata.hidden = true;
    if (!(n > 0)) return hataYaz("Tutarı girin.");
    if (!tarih.value) return hataYaz("Tarihi seçin.");
    kaydet.disabled = true;
    kaydet.textContent = "Kaydediliyor";
    try {
      await veri.odemeEkle({ ogrenci: o.id, ad: o.ad, tutar: n, tarih: tarih.value, yontem, not: not.value, mobilId, pesin: tur === "iki" });
    } catch (e) {
      kaydet.disabled = false;
      etiketle();
      return hataYaz(e.message);
    }
    // Ödeme kaydedildi; dekont ayrıca yüklenir. Yüklenemezse ödeme kalır, dekont ödemenin düzenleme ekranından eklenebilir.
    let dekontHatasi = "";
    const { dosya } = secici.oku();
    if (dosya) {
      try {
        const yol = await ed.dekontYukle(o.id, dosya);
        await veri.kayitKaydet("okul_ogrenciler", o.id, (v) => {
          const g = (v.odeme_gecmisi || []).find((x) => x.mobil_id === mobilId);
          if (!g) throw new Error("Ödeme bulunamadı.");
          g.dekont = yol;
          return v;
        });
      } catch (e) { dekontHatasi = e.message || "Dekont eklenemedi."; }
    }
    try { await veri.ogrenciTazele(o.id); } catch { /* liste bir sonraki açılışta tazelenir */ }
    panel.kapat();
    if (dekontHatasi) toast(`Ödeme kaydedildi, dekont eklenemedi: ${dekontHatasi}`, "hata");
    else toast("Ödeme kaydedildi", "basari");
    await detayYenile({ kok: true });
  }
  function hataYaz(m) { hata.textContent = m; hata.hidden = false; }

  const form = h("form", { class: "form", onsubmit: (e) => { e.preventDefault(); gonder(); } },
    o.ucret > 0 && h("div", { class: "alan" }, h("span", {}, "Ödeme türü"), turAlani),
    h("label", { class: "alan" }, h("span", {}, me("okul_tutar_lbl")), tutar, ipucu),
    h("label", { class: "alan" }, h("span", {}, me("okul_odeme_tarih_lbl")), tarih),
    h("div", { class: "alan" }, h("span", {}, me("tah_yontem_lbl")), yontemAlani),
    h("label", { class: "alan" }, h("span", {}, mb("okul_gecmis_col_not")), not),
    secici.kok,
    hata, kaydet);
  turCiz();
  yontemCiz();
  etiketle();
  const panel = panelAc(`Ödeme ekle · ${o.ad}`, form);
}
