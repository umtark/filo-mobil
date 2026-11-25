// Ana sayfa (Sistem Genel Özeti) hesapları: masaüstündeki update_dashboard ile aynı kurallar; arayüz bugun.js'dedir.
import { ayAnahtari, ayEkle, bugun, para } from "./bicim.js";
import { firmaAyniMi } from "./firma_suz.js";
import { baslik } from "./metin.js";

export const DONEMLER = [["this_month", "dash_period_this_month"], ["last_month", "dash_period_last_month"], ["6m", "dash_period_last_6"], ["12m", "dash_period_last_12"], ["ytd", "dash_period_this_year"], ["all", "dash_period_all"]];
export const VARSAYILAN_DONEM = "12m";

export const ayEtiketi = (ay) => `${baslik(`mon_${ay.slice(5, 7)}`)} ${ay.slice(2, 4)}`;

// [ilk ay, son ay] ('YYYY-MM'); 'tümü' veride görülen en eski ve en yeni ay.
export function donemAraligi(secim, aylik, simdi = bugun()) {
  const bu = ayAnahtari(simdi);
  const anahtarlar = [...aylik.keys()].sort();
  switch (secim) {
    case "this_month": return [bu, bu];
    case "last_month": return [ayEkle(bu, -1), ayEkle(bu, -1)];
    case "6m": return [ayEkle(bu, -5), bu];
    case "ytd": return [`${bu.slice(0, 4)}-01`, bu];
    case "all": return anahtarlar.length ? [anahtarlar[0], anahtarlar[anahtarlar.length - 1]] : [bu, bu];
    default: return [ayEkle(bu, -11), bu];
  }
}

export function aylikSeri(aylik, [ilk, son]) {
  const seri = [];
  for (let ay = ilk; ay <= son; ay = ayEkle(ay, 1)) {
    const k = aylik.get(ay) || { gelir: 0, gider: 0 };
    seri.push({ ay, etiket: ayEtiketi(ay), gelir: k.gelir, gider: k.gider, net: k.gelir - k.gider });
  }
  return seri;
}

// Dönem Özeti kartları: toplam gelir/gider ve başlıkları. 'Bu ay' seçili ve bu ay hiç veri yoksa en son veri olan aya geçilir.
export function kpiOzeti(secim, aylik, simdi = bugun()) {
  const bu = ayAnahtari(simdi);
  const [ilk, son] = donemAraligi(secim, aylik, simdi);
  let gelir = 0, gider = 0;
  for (const [ay, k] of aylik) if (ay >= ilk && ay <= son) { gelir += k.gelir; gider += k.gider; }
  let ayAdi = null;
  if (secim === "this_month" && gelir === 0 && gider === 0) {
    const gecmis = [...aylik.keys()].filter((a) => a < bu).sort().reverse()[0];
    if (gecmis) { gelir = aylik.get(gecmis).gelir; gider = aylik.get(gecmis).gider; ayAdi = ayEtiketi(gecmis); }
  }
  const onEk = ayAdi || (secim === "last_month" ? ayEtiketi(ayEkle(bu, -1)) : null)
    || (secim === "this_month" ? null : baslik(DONEMLER.find(([k]) => k === secim)?.[1] || "dash_period_last_12"));
  return {
    gelir, gider,
    gelirBaslik: onEk ? `${onEk} ${baslik("gelir_lbl")}` : baslik("kpi_aylik_gelir"),
    giderBaslik: onEk ? `${onEk} ${baslik("gider_lbl")}` : baslik("kpi_aylik_gider"),
  };
}

// Python str.title(): her harf grubunun ilk harfi büyük, kalanı küçük.
const baslikYaz = (s) => String(s).toLocaleLowerCase("tr").replace(/(^|[^\p{L}])(\p{L})/gu, (_, once, harf) => once + harf.toLocaleUpperCase("tr"));

const FIRMA_ONCELIK = ["Olcay Tur Ltd", "Olcay Başer", "Erkul Seyahat", "Alc Seyahat"];

// Filo Özeti: benzersiz araç sayısı ve (benzer yazımlar birleştirilmiş) firma başına araç sayısı.
export function filoOzeti(araclar) {
  const gruplar = new Map(), plakalar = new Set();
  for (const a of araclar) {
    const plaka = String(a.plaka || "").trim().toUpperCase().replace(/\s+/g, "") || String(a.id || "");
    const firma = baslikYaz((a.firma || a.kurum || baslik("belirtilmemis")).split(/\s+/).join(" ").trim());
    plakalar.add(plaka);
    if (!gruplar.has(firma)) gruplar.set(firma, new Set());
    gruplar.get(firma).add(plaka);
  }
  const birlesik = new Map(), ad = new Map();
  for (const [firma, set] of gruplar) {
    const var_ = [...birlesik.keys()].find((k) => firmaAyniMi(firma, k));
    if (var_ === undefined) { birlesik.set(firma, new Set(set)); ad.set(firma, firma); continue; }
    const mevcut = birlesik.get(var_).size;
    for (const p of set) birlesik.get(var_).add(p);
    ad.set(var_, set.size > mevcut ? firma : set.size < mevcut ? var_ : firma.length >= var_.length ? firma : var_);
  }
  const sonuc = new Map();
  for (const [k, set] of birlesik) { const a = ad.get(k) || k; if (!sonuc.has(a)) sonuc.set(a, new Set()); for (const p of set) sonuc.get(a).add(p); }
  const firmalar = [...sonuc].map(([k, v]) => [k, v.size]).sort((x, y) => {
    const i = FIRMA_ONCELIK.indexOf(x[0]), j = FIRMA_ONCELIK.indexOf(y[0]);
    return (i < 0 ? FIRMA_ONCELIK.length : i) - (j < 0 ? FIRMA_ONCELIK.length : j) || (i < 0 && j < 0 ? y[1] - x[1] : 0) || x[0].localeCompare(y[0], "tr");
  });
  return { toplam: plakalar.size, firmalar };
}

// Süresi 30 gün içinde dolan ya da geçmiş belgeler/bakımlar (en acil önce). Kritik: 15 gün ve altı (geçenler dahil).
export function uyariOzeti(araclar) {
  const liste = araclar.flatMap((a) => a.belgeler.filter((b) => b.gun <= 30).map((b) => ({ aracId: a.id, plaka: a.plaka, ad: b.ad, gun: b.gun }))).sort((x, y) => x.gun - y.gun);
  return { liste, kritik: liste.filter((u) => u.gun <= 15).length, gecen: liste.filter((u) => u.gun < 0).length };
}

export const uyariOnceligi = (gun) => (gun < 0 ? { ad: baslik("status_very_urgent"), ton: "kirmizi" } : gun <= 15 ? { ad: baslik("status_urgent"), ton: "kirmizi" } : { ad: baslik("status_approaching"), ton: "kehribar" });

// Son hareketler: faturalar ile araç olayları, yağ/bakım/harcama kayıtları; yeniden eskiye.
export function hareketler(faturalar, araclar) {
  const liste = [];
  for (const f of faturalar) if (f.tarih) liste.push({ tarih: f.tarih, ilgili: f.firma || f.no, aciklama: [f.no, f.plaka].filter(Boolean).join("  ·  ") || "-", tutar: f.toplam, yon: f.giden ? 1 : -1 });
  for (const a of araclar) {
    for (const o of a.olaylar) if (o.tarih) liste.push({ tarih: o.tarih, ilgili: a.plaka, aciklama: o.mesaj || [o.tip.replace(/_/g, " ").trim(), o.p1.trim(), o.p2.trim()].filter(Boolean).join(" ") || "Araç olayı", tutar: o.tutar, yon: -1 });
    for (const k of a.yagKayitlari) if (k.tarih) liste.push({ tarih: k.tarih, ilgili: a.plaka, aciklama: baslik("dash_yakit_kayit_desc").replace("{}", k.tarihKm) + (k.yag ? ` - Yağ: ${k.yag}` : ""), tutar: 0, yon: -1 });
    for (const k of a.bakimKayitlari) if (k.tarih) liste.push({ tarih: k.tarih, ilgili: a.plaka, aciklama: baslik("dash_servis_kayit_desc").replace("{}", k.aciklama), tutar: k.tutar, yon: -1 });
    for (const k of a.harcamaKayitlari) if (k.tarih) liste.push({ tarih: k.tarih, ilgili: a.plaka, aciklama: `Harcama: ${k.aciklama}`, tutar: k.tutar, yon: -1 });
  }
  return liste.sort((x, y) => y.tarih - x.tarih);
}

export const tutarYaz = (h) => (h.tutar > 0 ? `${h.yon > 0 ? "+" : "-"} ${para(h.tutar)}` : "-");
