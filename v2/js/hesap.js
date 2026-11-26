// İş kuralları: ham kayıtlardan (masaüstündeki alan adlarıyla) ekranların ihtiyaç duyduğu özetleri üretir. Saf fonksiyonlar.
// Kurallar masaüstü ve eski telefon köprüsüyle (mobil_koprusu.py) birebir aynıdır.
import { etiket, baslik } from "./metin.js";
import { sayi, tarihCoz, ayAnahtari, bugun, gunFarki, kucuk, sirala, aramaHazirla } from "./bicim.js";

const AY_RX = /^\d{4}-\d{2}$/;
const al = (r, ...anahtarlar) => {
  for (const a of anahtarlar) if (r[a] !== undefined && r[a] !== null && r[a] !== "") return r[a];
  return "";
};

// ── Okul ────────────────────────────────────────────────────────────────────
// Tahsilat listesi: servis kullanan ve bir araca atanmış öğrenciler. Ücret dönemin toplamıdır; kalan = ücret - yapılan ödemelerin toplamı.
// Masaüstündeki öğrenci aramasıyla aynı alanlar: ad, T.C., veli adı, tüm telefonlar, sınıf, servis plakası (boşluklu ve boşluksuz), adres.
const ogrenciArama = (o) => { const plaka = String(o.servis_plaka || ""); return aramaHazirla([o.ad_soyad, o.tc_kimlik, o.veli_adi, o.sinif, plaka, plaka.replace(/\s+/g, ""), o.adres, o.ogrenci_tel, o.veli_tel, o.anne_tel, o.baba_tel], [o.ogrenci_tel, o.veli_tel, o.baba_tel, o.anne_tel]); };

export function ogrenciKaydi(o) {
  const ucret = sayi(o.aylik_odeme);
  const odemeler = (Array.isArray(o.odeme_gecmisi) ? o.odeme_gecmisi : []).map((g) => {
    const tarih = tarihCoz(g.tarih);
    const ay = AY_RX.test(String(g.ay || "")) ? g.ay : tarih ? ayAnahtari(tarih) : "";
    return { id: g.id, tarih, ay, tutar: sayi(g.tutar), yontem: g.yontem || "nakit", not: g.not || "", kisi: g.mobil_kullanici || "", dekont: Boolean(g.dekont), dekontYolu: String(g.dekont || "") };
  }).sort((a, b) => (b.tarih ? b.tarih.getTime() : 0) - (a.tarih ? a.tarih.getTime() : 0));
  const odenen = odemeler.reduce((t, g) => t + g.tutar, 0);
  const sonOdeme = odemeler.reduce((m, g) => (g.tarih ? Math.max(m, g.tarih.getTime()) : m), 0);
  const kalan = Math.max(0, ucret - odenen);
  const durum = odenen <= 0 ? "bekliyor" : ucret > 0 && kalan > 0.01 ? "kismi" : "odendi";
  const tel = ["veli_tel", "anne_tel", "baba_tel", "ogrenci_tel"].map((k) => o[k]).find((t) => String(t || "").trim()) || "";
  return {
    id: o.id, ad: o.ad_soyad || "", sinif: o.sinif || "", plaka: (o.servis_plaka || "").trim(), sira: sayi(o.sira_no),
    ucret, odenen, kalan, durum, odemeler, sonOdeme, tel: String(tel).trim(), veli: o.veli_adi || "",
    telefonlar: [[etiket("okul_col_veli_tel"), o.veli_tel], [etiket("okul_col_anne_tel"), o.anne_tel], [etiket("okul_col_baba_tel"), o.baba_tel], [etiket("okul_col_ogrenci_tel"), o.ogrenci_tel]].filter(([, t]) => String(t || "").trim()),
    servisVar: !o.servis_kullanmiyor && Boolean((o.servis_plaka || "").trim()),
    arama: ogrenciArama(o),
  };
}

// Masaüstündeki Tahsilat Raporu sırası: ödeme yapanlar önce, son ödeme tarihi yeni olan üstte; hiç ödemeyenler sonda (kendi sıra numarasıyla).
export const tahsilatSirasi = (a, b) => (b.odenen > 0) - (a.odenen > 0) || (a.odenen > 0 ? b.sonOdeme - a.sonOdeme : 0) || a.sira - b.sira;

export function okulListesi(satirlar) {
  return satirlar
    .filter((o) => !String(o.id).startsWith("srv_"))
    .map(ogrenciKaydi)
    .filter((o) => o.servisVar)
    .sort((a, b) => a.sira - b.sira || sirala(a.ad, b.ad));
}

// Servis kullanmayan (ya da servise atanmamış) öğrenciler: masaüstündeki "Servis Kullanmayanlar" sekmesi.
export function servisKullanmayanListesi(satirlar) {
  return satirlar
    .filter((o) => !String(o.id).startsWith("srv_") && !ogrenciKaydi(o).servisVar)
    .map((o) => {
      const k = ogrenciKaydi(o);
      return { id: o.id, ad: k.ad, sinif: k.sinif, veli: k.veli, tel: k.tel, telefonlar: k.telefonlar, arama: k.arama, neden: o.servis_kullanmiyor ? baslik("okul_servis_kullanmiyor_rozet") : "Servise atanmamış" };
    })
    .sort((a, b) => sirala(a.ad, b.ad));
}

// Servisler sekmesi: id'si "srv_" ile başlayan araç kayıtları; her servisteki öğrenci sayısı plakadan hesaplanır.
export function servisListesi(satirlar) {
  const adet = new Map();
  for (const o of satirlar) {
    if (String(o.id).startsWith("srv_") || o.servis_kullanmiyor) continue;
    const p = String(o.servis_plaka || "").trim().toUpperCase();
    if (p) adet.set(p, (adet.get(p) || 0) + 1);
  }
  return satirlar.filter((s) => String(s.id).startsWith("srv_")).map((s) => {
    const plaka = String(s.plaka || "").trim();
    const belgeler = [["Sigorta", s.sigorta_bitis], [baslik("doc_inspection"), s.muayene_bitis], [baslik("doc_seat_insurance"), s.koltuk_bitis]]
      .map(([ad, d]) => ({ ad, son: tarihCoz(d) })).filter((b) => b.son).map((b) => ({ ...b, ...belgeDurumu(b.son) })).sort((x, y) => x.gun - y.gun);
    return {
      id: s.id, sira: sayi(s.sira_no), plaka, sofor: s.sofor_ad || "", tel: String(s.sofor_tel || "").trim(), guzergah: s.guzergah || "", tip: s.arac_tipi || "",
      sahip: s.arac_sahibi || "", ucret: sayi(s.aylik_ucret), ogrenci: adet.get(plaka.toUpperCase()) || 0, belgeler,
      arama: aramaHazirla([plaka, plaka.replace(/\s+/g, ""), s.sofor_ad, s.sofor_tel, s.guzergah, s.arac_tipi, s.arac_sahibi], [s.sofor_tel]),
    };
  }).sort((a, b) => a.sira - b.sira || sirala(a.plaka, b.plaka));
}

export function okulToplam(liste, ay = ayAnahtari(bugun())) {
  const t = { ogrenci: liste.length, ucret: 0, odenen: 0, kalan: 0, bekliyor: 0, kismi: 0, odendi: 0, buAy: 0 };
  for (const o of liste) {
    t.ucret += o.ucret; t.odenen += o.odenen; t.kalan += o.kalan; t[o.durum] += 1;
    for (const g of o.odemeler) if (g.ay === ay) t.buAy += g.tutar;
  }
  return t;
}

// Masaüstündeki Nakit / IBAN-Havale / Kredi Kartı kartları: yöntem başına ödeme yapan öğrenci sayısı ve toplam tutar.
// Bir öğrenci birden fazla yöntemle ödediyse her kartta ayrı sayılır.
export const ODEME_YONTEMLERI = ["nakit", "iban", "kart"];
export function yontemToplami(liste) {
  const t = Object.fromEntries(ODEME_YONTEMLERI.map((y) => [y, { ogrenci: 0, tutar: 0 }]));
  for (const o of liste) {
    const gorulen = new Set();
    for (const g of o.odemeler) {
      if (!t[g.yontem]) continue;
      t[g.yontem].tutar += g.tutar;
      if (!gorulen.has(g.yontem)) { gorulen.add(g.yontem); t[g.yontem].ogrenci += 1; }
    }
  }
  return t;
}

// ── Faturalar ───────────────────────────────────────────────────────────────
export function faturaKaydi(r) {
  return {
    id: r.id, tarih: tarihCoz(al(r, "Tarih", "tarih")), giden: kucuk(al(r, "Tip", "tip")).includes("giden"),
    no: String(al(r, "Fatura No", "fatura_no")), firma: String(al(r, "Firma", "firma")), plaka: String(al(r, "Plaka", "plaka")), aciklama: String(al(r, "Aciklama", "aciklama")),
    matrah: sayi(al(r, "Matrah", "matrah")), kdvOrani: String(al(r, "KDV %", "kdv_orani")), kdv: sayi(al(r, "KDV Tutari", "kdv_tutari")),
    tevkifat: String(al(r, "Tevkifat", "tevkifat") || "Yok"), tevTutar: sayi(al(r, "Tev.Tutarı", "tev_tutari")), toplam: sayi(al(r, "Toplam", "toplam")),
  };
}

// ── Esnaf ───────────────────────────────────────────────────────────────────
export function esnafKaydi(e) {
  let borc = 0, odenen = 0;
  const islemler = (Array.isArray(e.islemler) ? e.islemler : []).map((i) => {
    const toplam = sayi(i.toplam);
    if (i.is_odeme) odenen += toplam; else borc += toplam;
    return { id: i.id, tarih: tarihCoz(i.tarih), plaka: i.plaka && i.plaka !== "-" ? i.plaka : "", aciklama: i.aciklama || "", toplam, odeme: Boolean(i.is_odeme), tip: i.islem_tipi || "", parca: sayi(i.tutar), iscilik: sayi(i.iscilik) };
  }).sort((a, b) => (b.tarih ? b.tarih.getTime() : 0) - (a.tarih ? a.tarih.getTime() : 0));
  return { id: e.id, isim: e.isim || "", borc, odenen, bakiye: borc - odenen, islemler };
}

// ── Araçlar ve belge bitişleri ──────────────────────────────────────────────
const ARAC_BELGELERI = [
  ["muayene", "muayene_tarihi", baslik("doc_inspection"), null], ["trafik", "trafik_tarihi", baslik("doc_traffic_insurance"), null], ["kasko", "kasko_tarihi", baslik("doc_casco"), null],
  ["koltuk", "koltuk_sigortasi", baslik("doc_seat_insurance"), null], ["guzergah", "guzergah_tarihi", baslik("doc_route"), null],
  ["yag", "yag_bakim_tarihi", baslik("doc_oil"), "yag"], ["genel", "genel_bakim_tarihi", baslik("doc_maint"), "genel"],
];

export function belgeDurumu(son, referans = bugun()) {
  const gun = gunFarki(son, referans);
  return { gun, seviye: gun < 0 ? "gecmis" : gun <= 30 ? "yakin" : "iyi" };
}

export function aracBelgeleri(a, periyot = {}) {
  const sonuc = [];
  for (const [kod, alan, ad, per] of ARAC_BELGELERI) {
    const t = tarihCoz(a[alan]);
    if (!t) continue;
    const son = per ? new Date(t.getFullYear(), t.getMonth(), t.getDate() + Math.round(sayi((periyot || {})[per]))) : t;
    sonuc.push({ kod, ad, son, bakim: Boolean(per), ...belgeDurumu(son) });
  }
  return sonuc.sort((x, y) => x.gun - y.gun);
}

export function aracKaydi(a, periyot) {
  const belgeler = aracBelgeleri(a, periyot);
  const yeniden = (x, y) => (y.tarih ? y.tarih.getTime() : 0) - (x.tarih ? x.tarih.getTime() : 0);
  const bakimKayitlari = (a.bakim_kayitlari || []).map((b) => ({ id: b.id, tur: "Bakım", tarih: tarihCoz(b.tarih), aciklama: b.aciklama || "", tutar: sayi(b.tutar) + sayi(b.iscilik) })).sort(yeniden);
  const harcamaKayitlari = (a.harcama_kayitlari || []).map((b) => ({ id: b.id, tur: "Harcama", tarih: tarihCoz(b.tarih), aciklama: b.aciklama || "", tutar: sayi(b.tutar) })).sort(yeniden);
  // Masaüstündeki "Yağ Bakımı" sekmesi: tarih_km alanı "21.04.2026 / 150.000" biçimindedir.
  const yagKayitlari = (a.yakit_kayitlari || []).map((b) => {
    const [tarihMetni, ...km] = String(b.tarih_km || "").split("/");
    return { id: b.id, tur: baslik("tab_yakt_kaytlar"), tarihKm: String(b.tarih_km || ""), tarih: tarihCoz(tarihMetni.trim().split(/\s+/)[0]), km: km.join("/").trim(), yag: b.yag_cinsi || "", litre: b.yag_lt || "", usta: b.usta || "", yaptiran: b.yaptiran || "", not: b.notlar || "",
      degisenler: [[baslik("hava_kompresoru_hdr"), b.hava_kompresoru], [baslik("yag_filtre"), b.yag_filtresi], [baslik("mazot_filtre"), b.mazot_filtresi], [baslik("hava_filtre"), b.hava_filtresi]].filter(([, d]) => String(d || "").trim()).map(([ad, d]) => `${ad}: ${d}`) };
  }).sort(yeniden);
  const kayitlar = [...bakimKayitlari, ...harcamaKayitlari].sort(yeniden);
  return {
    id: a.id, plaka: a.plaka || "", firma: String(a.firma || "").split(/\s+/).join(" "), kurum: String(a.kurum || "").trim(), marka: a.marka || "", model: a.model || "", yil: String(a.yil || ""),
    yakit: a.yakit || "", sofor: a.sofor && a.sofor !== "-" ? a.sofor : "", soforTel: String(a.sofor_tel || "").trim(), km: String(a.km || ""), belgeler, kayitlar, bakimKayitlari, harcamaKayitlari, yagKayitlari,
    vites: a.vites || "", utts: a.utts || "", hgs: a.hgs || "", vergiNo: String(a.vergi_no || ""), ruhsatNo: String(a.ruhsat_no || ""), sasi: String(a.sasi || ""),
    belgeTarihleri: { muayene: a.muayene_tarihi, trafik: a.trafik_tarihi, kasko: a.kasko_tarihi, koltuk: a.koltuk_sigortasi, guzergah: a.guzergah_tarihi },
    ekSoforler: (Array.isArray(a.ek_soforler) ? a.ek_soforler : []).map((e) => ({ ad: String(e.sofor || "").trim(), tel: String(e.tel || "").trim(), not: String(e.not || "").trim() })).filter((e) => e.ad),
    olaylar: (Array.isArray(a.olaylar) ? a.olaylar : []).map((o) => ({ tarih: tarihCoz(o.tarih), mesaj: String(o.mesaj || "").trim(), tip: String(o.tip || ""), p1: String(o.p1 || ""), p2: String(o.p2 || ""), tutar: sayi(o.tutar) })),
    enYakin: belgeler.filter((b) => !b.bakim)[0] || belgeler[0] || null,
  };
}

// ── Akaryakıt ve iç hizmet ──────────────────────────────────────────────────
export function akaryakitListesi(satirlar, araclar) {
  const plaka = new Map(araclar.map((a) => [a.id, a.plaka]));
  return satirlar.map((r) => ({
    id: r.id, tarih: tarihCoz(r.tarih), plaka: plaka.get(r.arac_id) || r.plaka_yedek || "", istasyon: r.istasyon || "",
    litre: sayi(r.litre), fiyat: sayi(r.fiyat), tutar: r.is_odeme ? Math.abs(sayi(r.tutar)) : sayi(r.tutar), fis: String(r.fis_no || ""), odeme: Boolean(r.is_odeme),
  })).filter((r) => r.tarih).sort((a, b) => b.tarih - a.tarih || sirala(b.id, a.id));
}

export function icHizmetListesi(satirlar) {
  return satirlar.map((s) => ({
    id: s.id, tarih: tarihCoz(s.tarih), saat: s.saat || "", plaka: s.plaka || "", sofor: s.sofor || "", personel: s.personel || "",
    guzergah: s.guzergah || "", yer: s.gidilen_yer || "", kisi: Math.round(sayi(s.kisi_sayisi)), tutar: sayi(s.tutar), fis: String(s.fis_no || ""), aciklama: s.aciklama || "", bolumDagilim: s.bolum_dagilim && typeof s.bolum_dagilim === "object" ? s.bolum_dagilim : {},
  })).filter((s) => s.tarih).sort((a, b) => b.tarih - a.tarih || sirala(b.saat, a.saat));
}

export const aylaraGore = (liste, anahtar = (r) => r.tarih) => {
  const m = new Map();
  for (const r of liste) {
    const t = anahtar(r);
    if (t) { const ay = ayAnahtari(t); (m.get(ay) || m.set(ay, []).get(ay)).push(r); }
  }
  return m;
};

// ── Ana sayfa özeti ─────────────────────────────────────────────────────────
// Giden fatura gelir; gelen fatura, akaryakıt alımı (istasyona yapılan ödeme hariç) ve esnaf işlemleri gider.
export function aylikGelirGider(faturalar, akaryakit, esnaflar) {
  const aylik = new Map();
  const ekle = (t, anahtar, tutar) => {
    if (!t) return;
    const ay = ayAnahtari(t);
    const k = aylik.get(ay) || aylik.set(ay, { gelir: 0, gider: 0 }).get(ay);
    k[anahtar] += tutar;
  };
  for (const f of faturalar) ekle(f.tarih, f.giden ? "gelir" : "gider", f.toplam);
  for (const r of akaryakit) if (!r.odeme) ekle(r.tarih, "gider", r.tutar);
  for (const e of esnaflar) for (const i of e.islemler) if (!i.odeme) ekle(i.tarih, "gider", i.toplam);
  return aylik;
}
