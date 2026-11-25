// Ana sayfa (masaüstündeki "Sistem Genel Özeti"): dönem özeti kartları, filo özeti, gelir/gider grafikleri, okul tahsilatı, yaklaşan belgeler ve son hareketler.
// Her blok kendi verisini yükler; biri hata verirse diğerleri görünmeye devam eder.
import { h, kart, satir, cipler, bosDurum, yukleniyor, hataGoster, sayfalamali } from "../ui.js";
import * as veri from "../veri.js";
import { aylikGelirGider, okulToplam } from "../hesap.js";
import { para, bugun, tarihYaz } from "../bicim.js";
import { durum as okulDurumu } from "./okul.js";
import { aracAc } from "./filo.js";
import { ciktiDugmeleri } from "../cikti.js";
import { genelVeri, genelDurumPdf } from "../cikti_genel.js";
import { baslik } from "../metin.js";
import { DONEMLER, VARSAYILAN_DONEM, donemAraligi, aylikSeri, kpiOzeti, filoOzeti, uyariOzeti, uyariOnceligi, hareketler, tutarYaz } from "../ozet.js";
import { trendGrafigi, halkaGrafigi, paraSayaci, adetSayaci, sayac } from "../grafik.js";

const durum = { kpi: VARSAYILAN_DONEM, grafik: VARSAYILAN_DONEM };
const FIRMA_RENKLERI = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#14b8a6"];
const finansIzni = () => ["fatura", "petrol", "esnaf"].every(veri.izinVar);

export async function ciz(sekmeyeGit) {
  const d = bugun();
  const sayfa = h("div", { class: "sayfa" },
    h("div", { class: "karsilama" },
      h("p", { class: "soluk" }, new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(d)),
      h("h2", {}, veri.baglam.isletmeAdi || "Filo Muhasebe"),
      h("p", { class: "soluk" }, baslik("dashboard_subtitle"))));
  if (["fatura", "petrol", "esnaf", "okul", "arac", "ic_hizmet"].every(veri.izinVar)) {
    sayfa.append(ciktiDugmeleri({
      dosya: "genel_durum_raporu", donem: true,
      pdf: {
        ad: "Genel Durum Raporu", yatay: false, altSol: "Genel Durum Raporu",
        async uret(ctx) {
          const [faturalar, akaryakit, esnaflar, icHizmet, okul, araclar] = await Promise.all([veri.faturalar(), veri.akaryakit(), veri.esnaflar(), veri.icHizmet(), veri.okul(), veri.araclar()]);
          genelDurumPdf(ctx, genelVeri({ faturalar, akaryakit, esnaflar, icHizmet, okul, araclar }, ctx.donem));
        },
      },
    }));
  }
  if (finansIzni() || veri.izinVar("arac")) sayfa.append(blok(donemOzeti));
  if (veri.izinVar("arac")) sayfa.append(blok(filoKarti));
  if (finansIzni()) sayfa.append(blok(trendKarti));
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
function kpiKarti(sira, renk) {
  const ad = h("span", { class: "kpi-baslik" });
  const deger = h("strong", { class: "kpi-deger" });
  return { el: h("div", { class: "kpi-kart", style: `--renk:var(--${renk});--i:${sira}` }, ad, deger), ad, deger };
}

async function donemOzeti() {
  const arac = veri.izinVar("arac"), finans = finansIzni();
  const [aylik, araclar] = await Promise.all([finans ? aylikVeri() : new Map(), arac ? veri.araclar() : []]);
  const kartlar = {
    arac: arac && kpiKarti(0, "ana"), gelir: finans && kpiKarti(1, "yesil"), gider: finans && kpiKarti(2, "kirmizi"), uyari: arac && kpiKarti(3, "kehribar"),
  };
  const cipAlani = h("div");
  function guncelle() {
    if (!finans) return;
    const o = kpiOzeti(durum.kpi, aylik);
    kartlar.gelir.ad.textContent = o.gelirBaslik;
    kartlar.gider.ad.textContent = o.giderBaslik;
    paraSayaci(kartlar.gelir.deger, o.gelir);
    paraSayaci(kartlar.gider.deger, o.gider);
    cipAlani.replaceChildren(donemCipleri(durum.kpi, (k) => { durum.kpi = k; guncelle(); }));
  }
  if (arac) {
    kartlar.arac.ad.textContent = baslik("kpi_toplam_arac");
    adetSayaci(kartlar.arac.deger, filoOzeti(araclar).toplam, ` ${baslik("adet_birimi")}`);
    const u = uyariOzeti(araclar);
    kartlar.uyari.ad.textContent = baslik("kpi_kritik_uyari");
    sayac(kartlar.uyari.deger, u.liste.length, (v) => `${u.liste.length ? Math.min(u.kritik, Math.round((v * u.kritik) / u.liste.length)) : 0} / ${Math.round(v)}`, { sure: 1200 });
  }
  guncelle();
  return kart(h("h3", {}, baslik("kpi_header_title")), cipAlani, h("div", { class: "kpi-izgara" }, [kartlar.arac, kartlar.gelir, kartlar.gider, kartlar.uyari].filter(Boolean).map((k) => k.el)));
}

// ── Filo özeti ──────────────────────────────────────────────────────────────
async function filoKarti() {
  const { toplam, firmalar } = filoOzeti(await veri.araclar());
  if (!toplam) return kart(h("h3", {}, baslik("filo_istatistikleri")), bosDurum(baslik("sistemde_arac_yok")));
  const adet = h("strong", { class: "buyuk-sayi" });
  adetSayaci(adet, toplam);
  return kart(h("h3", {}, baslik("filo_istatistikleri")),
    h("div", { class: "filo-ust" }, h("div", {}, h("span", { class: "kart-etiket" }, baslik("toplam_arac")), adet), h("p", { class: "soluk" }, `${firmalar.length} ${baslik("toplam_firma")}`)),
    h("div", { class: "firma-izgara" }, firmalar.map(([ad, sayi], i) => h("div", { class: "firma-kart", style: `--renk:${FIRMA_RENKLERI[i % FIRMA_RENKLERI.length]};--i:${i}` }, h("span", { class: "firma-ad", title: ad }, ad), h("strong", {}, sayi)))));
}

// ── Gelir / gider grafikleri ────────────────────────────────────────────────
async function trendKarti() {
  const aylik = await aylikVeri();
  const cipAlani = h("div"), grafikAlani = h("div"), halkaAlani = h("div");
  function guncelle() {
    const seri = aylikSeri(aylik, donemAraligi(durum.grafik, aylik));
    const gelir = seri.reduce((t, x) => t + x.gelir, 0), gider = seri.reduce((t, x) => t + x.gider, 0);
    cipAlani.replaceChildren(donemCipleri(durum.grafik, (k) => { durum.grafik = k; guncelle(); }));
    grafikAlani.replaceChildren(gelir + gider > 0 ? trendGrafigi(seri) : bosDurum(baslik("dash_chart_no_data")));
    halkaAlani.replaceChildren(h("h3", {}, baslik("dash_pie_title")), gelir + gider > 0 ? halkaGrafigi(gelir, gider) : bosDurum(baslik("dash_chart_no_data")));
  }
  guncelle();
  return kart(h("h3", {}, baslik("dash_monthly_trend")), cipAlani, grafikAlani, halkaAlani);
}

async function tahsilat(sekmeyeGit) {
  const liste = await veri.okul();
  const t = okulToplam(liste);
  const git = (filtre) => { okulDurumu.filtre = filtre; sekmeyeGit("okul"); };
  return kart(
    h("h3", {}, "Okul tahsilatı"),
    h("p", { class: "buyuk-sayi" }, para(t.kalan)),
    h("p", { class: "soluk" }, `Kalan · ${para(t.odenen)} / ${para(t.ucret)} tahsil edildi`),
    h("div", { class: "liste" },
      satir({ baslik: baslik("tah_ozet_hic_odemeyen"), sag: `${t.bekliyor} öğrenci`, ton: t.bekliyor ? "kirmizi" : "", onclick: () => git("bekliyor") }),
      satir({ baslik: baslik("tah_ozet_kismi_odeyen"), sag: `${t.kismi} öğrenci`, ton: t.kismi ? "kehribar" : "", onclick: () => git("kismi") })));
}

// ── Yaklaşan belgeler ve son hareketler ─────────────────────────────────────
async function uyarilar() {
  const { liste, kritik, gecen } = uyariOzeti(await veri.araclar());
  const kalan = (gun) => (gun < 0 ? `${baslik("status_overdue")} (${-gun} ${baslik("day_short")})` : `${gun} ${baslik("day_short")}`);
  return kart(
    h("h3", {}, baslik("dash_alerts")),
    liste.length ? h("p", { class: "soluk" }, `${baslik("dash_tracking_summary")}: ${liste.length} (${baslik("dash_critical")}: ${kritik}, ${baslik("dash_overdue")}: ${gecen})`) : null,
    liste.length
      ? sayfalamali(liste, (u) => { const o = uyariOnceligi(u.gun); return satir({ baslik: u.plaka, alt: u.ad, sag: kalan(u.gun), sagAlt: o.ad, ton: o.ton, onclick: () => aracAc(u.aracId, u.plaka) }); })
      : bosDurum("30 gün içinde süresi dolacak belge yok."));
}

async function sonHareketler() {
  const [faturalar, araclar] = await Promise.all([veri.izinVar("fatura") ? veri.faturalar() : [], veri.izinVar("arac") ? veri.araclar() : []]);
  const liste = hareketler(faturalar, araclar);
  return kart(
    h("h3", {}, baslik("dash_events")),
    liste.length ? h("p", { class: "soluk" }, `${baslik("dash_event_records")}: ${liste.length}`) : null,
    liste.length
      ? sayfalamali(liste, (e) => satir({ baslik: e.ilgili || "-", alt: `${tarihYaz(e.tarih)} · ${e.aciklama}`, sag: tutarYaz(e), ton: e.tutar > 0 ? (e.yon > 0 ? "yesil" : "kirmizi") : "" }))
      : bosDurum("Hareket kaydı yok."));
}
