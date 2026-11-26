// Ana sayfa (masaüstündeki "Sistem Genel Özeti"): dönem özeti kartları, filo özeti, gelir/gider grafikleri, okul tahsilatı, yaklaşan belgeler ve son hareketler.
// Her blok kendi verisini yükler; biri hata verirse diğerleri görünmeye devam eder.
import { h, kart, kartBasligi, satir, cipler, bosDurum, yukleniyor, hataGoster, sayfalamali } from "../ui.js";
import * as veri from "../veri.js";
import { aylikGelirGider, okulToplam } from "../hesap.js";
import { para, bugun, tarihYaz, ayAdi } from "../bicim.js";
import { durum as okulDurumu } from "./okul.js";
import { aracAc, aracDurumu } from "./filo.js";
import { ciktiDugmeleri } from "../cikti.js";
import { genelVeri, genelDurumPdf } from "../cikti_genel.js";
import { baslik, duz } from "../metin.js";
import { DONEMLER, VARSAYILAN_DONEM, donemAraligi, aylikSeri, kpiOzeti, filoOzeti, uyariOzeti, uyariOnceligi, hareketler, tutarYaz } from "../ozet.js";
import { trendGrafigi, dagilimCubugu, paraSayaci, adetSayaci, sayac, canlandir } from "../grafik.js";

// Tek dönem seçimi hem özet kartını hem grafiği yönetir; dinleyiciler her çizimde yeniden kurulur.
const durum = { donem: VARSAYILAN_DONEM };
let donemDinleyicileri = [];
const finansIzni = () => ["fatura", "petrol", "esnaf"].every(veri.izinVar);

export async function ciz(sekmeyeGit) {
  const d = bugun();
  donemDinleyicileri = [];
  const sayfa = h("div", { class: "sayfa" },
    h("div", { class: "karsilama" },
      h("p", { class: "soluk" }, new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(d)),
      h("h2", {}, veri.baglam.isletmeAdi || "Filo Muhasebe")));
  // Genel durum raporu düğmesi Dönem Özeti kartının başlığında durur (sayfa başında büyük gri kutu olarak değil).
  let rapor = null;
  if (["fatura", "petrol", "esnaf", "okul", "arac", "ic_hizmet"].every(veri.izinVar)) {
    rapor = ciktiDugmeleri({
      dosya: "genel_durum_raporu", donem: true,
      pdf: {
        ad: duz("btn_genel_rapor"), yatay: false, altSol: "Genel Durum Raporu",
        async uret(ctx) {
          const [faturalar, akaryakit, esnaflar, icHizmet, okul, araclar] = await Promise.all([veri.faturalar(), veri.akaryakit(), veri.esnaflar(), veri.icHizmet(), veri.okul(), veri.araclar()]);
          genelDurumPdf(ctx, genelVeri({ faturalar, akaryakit, esnaflar, icHizmet, okul, araclar }, ctx.donem));
        },
      },
    });
  }
  if (finansIzni() || veri.izinVar("arac")) sayfa.append(blok(() => donemOzeti(rapor)));
  if (finansIzni()) sayfa.append(blok(trendKarti));
  if (veri.izinVar("arac")) sayfa.append(blok(() => filoKarti(sekmeyeGit)));
  if (veri.izinVar("okul")) sayfa.append(blok(() => tahsilat(sekmeyeGit)));
  if (veri.izinVar("arac")) sayfa.append(blok(uyarilar));
  if (veri.izinVar("fatura") || veri.izinVar("arac")) sayfa.append(blok(sonHareketler));
  return sayfa;
}

// Bloğu hemen yer tutucuyla koyar, veri gelince doldurur.
function blok(olustur) {
  const kap = h("div", {}, kart(yukleniyor(2)));
  const calistir = () => olustur().then((d) => kap.replaceChildren(d), (e) => kap.replaceChildren(kart(hataGoster(e, () => { kap.replaceChildren(kart(yukleniyor(2))); calistir(); }))));
  calistir();
  return kap;
}

const donemCipleri = (secili, sec) => {
  const el = cipler(DONEMLER.map(([kod, anahtar]) => [kod, baslik(anahtar)]), secili, sec);
  // Seçili dönem yatay kaydırmada görünür kalsın (sayfayı dikeyde kaydırmadan)
  requestAnimationFrame(() => { const c = el.querySelector(".secili"); if (c) el.scrollLeft = c.offsetLeft - (el.clientWidth - c.offsetWidth) / 2; });
  return el;
};

async function aylikVeri() {
  const [faturalar, akaryakit, esnaflar] = await Promise.all([veri.faturalar(), veri.akaryakit(), veri.esnaflar()]);
  return aylikGelirGider(faturalar, akaryakit, esnaflar);
}

// ── Dönem özeti ─────────────────────────────────────────────────────────────
// Net büyük; gelir/gider yanında; araç sayısı ve kritik uyarı daha sessiz ikinci satırda.
function hucre(sinif, renk) {
  const ad = h("span", { class: "ozet-etiket" });
  const deger = h("strong", { class: "ozet-deger" });
  const ek = h("span", { class: "ozet-ek" });
  return { ad, deger, ek, el: h("div", { class: `ozet-hucre ${sinif}`, style: renk ? `--renk:${renk}` : null }, ad, h("div", { class: "ozet-deger-satir" }, deger, ek)) };
}

const sakin = (liste, durumNoktali = false) => { liste.classList.add("liste-sakin"); if (durumNoktali) liste.classList.add("liste-durum"); return liste; };   // dashboard listeleri: sakin satır başlığı; durum rengi küçük noktada

async function donemOzeti(rapor) {
  const arac = veri.izinVar("arac"), finans = finansIzni();
  const [aylik, araclar] = await Promise.all([finans ? aylikVeri() : new Map(), arac ? veri.araclar() : []]);
  const cipAlani = h("div", { class: "donem-segment" });
  const net = finans && hucre("net"), gelir = finans && hucre("gelir", "var(--yesil)"), gider = finans && hucre("gider", "var(--kirmizi)");
  const adet = arac && hucre("ikincil"), uyari = arac && hucre("ikincil");
  function guncelle() {
    const o = kpiOzeti(durum.donem, aylik);
    net.ad.textContent = baslik("dash_net_label");
    gelir.ad.textContent = o.gelirBaslik;
    gider.ad.textContent = o.giderBaslik;
    net.deger.className = `ozet-deger ${o.gelir - o.gider < 0 ? "kirmizi" : "yesil"}`;
    paraSayaci(net.deger, o.gelir - o.gider);
    paraSayaci(gelir.deger, o.gelir);
    paraSayaci(gider.deger, o.gider);
    cipAlani.replaceChildren(donemCipleri(durum.donem, (k) => { durum.donem = k; guncelle(); donemDinleyicileri.forEach((f) => f()); }));
  }
  if (finans) guncelle();
  if (arac) {
    adet.ad.textContent = baslik("kpi_toplam_arac");
    adetSayaci(adet.deger, filoOzeti(araclar).toplam, ` ${baslik("adet_birimi")}`);
    const u = uyariOzeti(araclar);
    uyari.ad.textContent = baslik("kpi_kritik_uyari");
    uyari.deger.classList.toggle("kirmizi", u.kritik > 0);
    sayac(uyari.deger, u.kritik, (v) => String(Math.round(v)), { sure: 1200 });
    uyari.ek.textContent = `${u.liste.length} takipte`;
  }
  return kart(kartBasligi(baslik("kpi_header_title"), rapor), finans && cipAlani,
    finans && h("div", { class: "ozet-ust" }, net.el, h("div", { class: "ozet-cift" }, gelir.el, gider.el)),
    arac && h("div", { class: "ozet-cift ozet-alt" }, adet.el, uyari.el));
}

// ── Filo özeti ──────────────────────────────────────────────────────────────
// Firmalar araç sayısına göre sıralı; ince çubuk en kalabalık firmaya oranı gösterir.
async function filoKarti(sekmeyeGit) {
  const { toplam, firmalar } = filoOzeti(await veri.araclar());
  if (!toplam) return kart(kartBasligi(baslik("filo_istatistikleri")), bosDurum(baslik("sistemde_arac_yok")));
  const adet = h("strong", { class: "buyuk-sayi" });
  adetSayaci(adet, toplam);
  const enCok = Math.max(...firmalar.map(([, n]) => n));
  const git = (firma) => { aracDurumu.firma = firma; aracDurumu.filtre = "hepsi"; aracDurumu.arama = ""; sekmeyeGit("arac", "liste"); };
  const liste = h("div", { class: "firma-siralama grafik" }, firmalar.map(([ad, sayi], i) =>
    h("button", { class: "firma-satir", type: "button", "aria-label": `${ad}: ${sayi} araç`, style: `--w:${(sayi / enCok).toFixed(3)};--i:${i}`, onclick: () => git(ad) },
      h("span", { class: "firma-ad", title: ad }, ad), h("strong", {}, sayi), h("span", { class: "firma-bar" }, h("i")))));
  canlandir(liste);
  return kart(kartBasligi(baslik("filo_istatistikleri"), `${firmalar.length} ${baslik("toplam_firma")}`),
    h("div", { class: "filo-ust" }, h("div", {}, h("span", { class: "kart-etiket" }, baslik("toplam_arac")), adet)),
    liste);
}

// ── Gelir / gider grafikleri ────────────────────────────────────────────────
async function trendKarti() {
  const aylik = await aylikVeri();
  const grafikAlani = h("div"), dagilimAlani = h("div", { class: "dagilim-alan" }), donemAdi = h("span", { class: "kart-meta" });
  let seri = [], secilenAy = null;   // secilenAy: grafikte dokunulan ay; yoksa tüm dönemin toplamı gösterilir
  const dagilimCiz = () => {
    const x = secilenAy && seri.find((s) => s.ay === secilenAy.ay);
    const gelir = x ? x.gelir : seri.reduce((t, s) => t + s.gelir, 0), gider = x ? x.gider : seri.reduce((t, s) => t + s.gider, 0);
    const donem = baslik((DONEMLER.find(([kod]) => kod === durum.donem) || DONEMLER[0])[1]);
    const baslikSatiri = h("div", { class: "dagilim-baslik" }, h("h4", {}, `${baslik("dash_pie_title")} · ${x ? ayAdi(x.ay) : donem}`),
      x && h("button", { class: "dagilim-sifirla", type: "button", onclick: () => { secilenAy = null; dagilimCiz(); } }, donem));
    dagilimAlani.replaceChildren(baslikSatiri, gelir + gider > 0 ? dagilimCubugu(gelir, gider) : bosDurum(baslik("dash_chart_no_data")));
  };
  function guncelle() {
    seri = aylikSeri(aylik, donemAraligi(durum.donem, aylik));
    secilenAy = null;
    const gelir = seri.reduce((t, x) => t + x.gelir, 0), gider = seri.reduce((t, x) => t + x.gider, 0);
    donemAdi.textContent = baslik((DONEMLER.find(([kod]) => kod === durum.donem) || DONEMLER[0])[1]);
    grafikAlani.replaceChildren(gelir + gider > 0 ? trendGrafigi(seri, (x) => { secilenAy = x; dagilimCiz(); }) : bosDurum(baslik("dash_chart_no_data")));
    dagilimCiz();
  }
  guncelle();
  donemDinleyicileri.push(guncelle);
  return kart(kartBasligi(baslik("dash_monthly_trend"), donemAdi), grafikAlani, dagilimAlani);
}

async function tahsilat(sekmeyeGit) {
  const liste = await veri.okul();
  const t = okulToplam(liste);
  const oran = t.ucret > 0 ? Math.min(100, (t.odenen / t.ucret) * 100) : 0;
  const git = (filtre) => { okulDurumu.filtre = filtre; sekmeyeGit("okul"); };
  return kart(
    kartBasligi("Okul tahsilatı", `%${Math.round(oran)} tahsil edildi`),
    h("div", {}, h("span", { class: "kart-etiket" }, baslik("tah_ozet_kalan")), h("p", { class: "buyuk-sayi" }, para(t.kalan))),
    h("div", { class: "ilerleme", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(oran)), "aria-label": "Tahsilat oranı" }, h("i", { style: `width:${oran.toFixed(1)}%` })),
    h("p", { class: "soluk" }, `${para(t.odenen)} / ${para(t.ucret)}`),
    sakin(h("div", { class: "liste" },
      satir({ baslik: baslik("tah_ozet_hic_odemeyen"), sag: `${t.bekliyor} öğrenci`, ton: t.bekliyor ? "kirmizi" : "", onclick: () => git("bekliyor") }),
      satir({ baslik: baslik("tah_ozet_kismi_odeyen"), sag: `${t.kismi} öğrenci`, ton: t.kismi ? "kehribar" : "", onclick: () => git("kismi") })), true));
}

// ── Yaklaşan belgeler ve son hareketler ─────────────────────────────────────
// Ana sayfada ilk 5 kayıt görünür; devamı "Daha fazla göster" ile açılır.
async function uyarilar() {
  const { liste, kritik, gecen } = uyariOzeti(await veri.araclar());
  const kalan = (gun) => (gun < 0 ? `${baslik("status_overdue")} (${-gun} ${baslik("day_short")})` : `${gun} ${baslik("day_short")}`);
  return kart(
    kartBasligi(baslik("dash_alerts")),
    liste.length ? h("p", { class: "soluk" }, `${liste.length} takip · ${baslik("dash_critical")} ${kritik} · ${baslik("dash_overdue")} ${gecen}`) : null,
    liste.length
      ? sakin(sayfalamali(liste, (u) => { const o = uyariOnceligi(u.gun); return satir({ baslik: u.plaka, alt: u.ad, sag: kalan(u.gun), sagAlt: o.ad, ton: o.ton, onclick: () => aracAc(u.aracId, u.plaka) }); }, 5), true)
      : bosDurum("30 gün içinde süresi dolacak belge yok."));
}

async function sonHareketler() {
  const [faturalar, araclar] = await Promise.all([veri.izinVar("fatura") ? veri.faturalar() : [], veri.izinVar("arac") ? veri.araclar() : []]);
  const liste = hareketler(faturalar, araclar);
  return kart(
    kartBasligi(baslik("dash_events"), liste.length ? `${liste.length} kayıt` : null),
    liste.length
      ? sakin(sayfalamali(liste, (e) => satir({ baslik: e.ilgili || "-", alt: `${tarihYaz(e.tarih)} · ${e.aciklama}`, sag: tutarYaz(e) === "-" ? "" : tutarYaz(e), ton: e.tutar > 0 ? (e.yon > 0 ? "yesil" : "kirmizi") : "" }), 5))
      : bosDurum("Hareket kaydı yok."));
}
