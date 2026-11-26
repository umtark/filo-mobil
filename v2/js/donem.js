// Okul dönem yönetimi: masaüstündeki dönem düzeninin (fatura_masaustu.py: _okul_donem_*) karşılığı; fark: hangi dönemin GÖSTERİLECEĞİ cihaz başınadır.
// Dönem anahtarı "YYYY-N": YYYY eğitim yılının başladığı yıl, N dönem (MEB takvimi: 1. Dönem Eylül–Ocak, 2. Dönem Şubat–Ağustos).
// Depolama: öğrenci kaydının üst düzey alanları o öğrencinin "asıl" döneminindir (aktif_donem ya da işletme ayarı okul_aktif_donem); diğer dönemler
// donem_veri[anahtar] altında saklanır. Telefon istediği dönemi gösterir/yazar: kayıt o dönemin gözüyle okunur (gorunumListesi), yazılırken asıl yerine konur
// (gorunumdenDon). Böylece biri 1. dönemde, başkası 2. dönemde ödeme girebilir; masaüstünün genel dönem geçişi de bozulmaz.
// Bu dosya yalnızca hesaplar (ağ ve ekran yok).
import { baslik as mb, doldur } from "./metin.js";

export const ALANLAR = ["aylik_odeme", "odeme_gecmisi", "odeme_kayitlari", "servis_plaka", "servis_kullanmiyor", "liste_ucreti"];
const IKI_DONEM_ORAN = 1.5;

const sayiya = (v) => Number(v) || 0;
const nesneMi = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const harici = (g) => g.donem_harici === true || String(g.donem_harici).toLowerCase() === "true";
const klon = (o) => JSON.parse(JSON.stringify(o));
const yuvarla2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// Python round(): yarımlar çifte yuvarlanır (masaüstüyle aynı pay çıksın).
const ciftYuvarla = (n) => { const f = Math.floor(n), fark = n - f; return fark < 0.5 ? f : fark > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1; };
const tarihAnahtari = (s) => { const p = String(s || "").split("."); return p.length === 3 ? `${p[2]}${p[1].padStart(2, "0")}${p[0].padStart(2, "0")}` : String(s || ""); };

export const donemGecerliMi = (a) => typeof a === "string" && /^\d{4}-[12]$/.test(a);

export function guncelDonemAnahtari(bugun = new Date()) {
  const ay = bugun.getMonth() + 1, yil = bugun.getFullYear();
  if (ay >= 9) return `${yil}-1`;
  if (ay === 1) return `${yil - 1}-1`;
  return `${yil - 1}-2`;
}

export const aktifDonem = (ayar) => (donemGecerliMi(ayar && ayar.okul_aktif_donem) ? ayar.okul_aktif_donem : guncelDonemAnahtari());

// "2026-1" -> "2026-2027 · 1. Dönem"
export function donemAdi(anahtar) {
  if (!donemGecerliMi(anahtar)) return String(anahtar);
  const yil = Number(anahtar.slice(0, 4));
  return `${yil}-${yil + 1} · ${mb("okul_donem_" + anahtar[5])}`;
}

export const ogrencilerSuz = (ham) => ham.filter((o) => !String(o.id).startsWith("srv_"));
const gecerliDonem = (o, layout) => o.aktif_donem || layout;

// Dönem herhangi bir öğrencide açık mı: ya o dönem öğrencinin üst düzey kaydıdır ya da donem_veri altında saklanıyordur.
export const donemAcikMi = (ogrenciler, layout, anahtar) => ogrenciler.some((o) => gecerliDonem(o, layout) === anahtar || (nesneMi(o.donem_veri) && anahtar in o.donem_veri));

// Veride kaydı olan dönem anahtarları.
export function kayitliDonemler(ogrenciler, layout) {
  const kume = new Set([layout]);
  for (const o of ogrenciler) {
    kume.add(gecerliDonem(o, layout));
    if (nesneMi(o.donem_veri)) for (const k of Object.keys(o.donem_veri)) if (donemGecerliMi(k)) kume.add(k);
  }
  return kume;
}

// ── 2. dönemi de 1. dönemde ödeyenler ───────────────────────────────────────
const kok = (s) => String(s ?? "").toLowerCase().replace(/ı/g, "i").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const NOT_RX = new RegExp([
  "1\\s*\\.?\\s*(donem)?\\s*(ve|\\+|&|-|/|,)\\s*2\\s*\\.?\\s*(donem|d\\b)",
  "iki\\s*d[o]?nem|ikisini|ikisi\\s+(odendi|tamam|alindi)",
  "pesin|yillik|senelik|toptan|komple|yil\\s+sonu",
  "(hepsi|tamam[ia]?|butun\\w*|tum\\w*)\\s+(ucret\\w*\\s+|bedel\\w*\\s+)?(odendi|odedi|alindi|yatti|verildi|odeme)",
  "(borc|alacak|bakiye)\\w*\\s+(kalmad|yok|sifir|bitt|kapand)",
  "2\\s*\\.?\\s*d[o]?nem\\w*(\\s+\\w+){0,3}?\\s+(odeme|odendi|tamam|alindi|dahil|kapandi|yatti|verildi)",
  "d[o]?nem\\w*\\s+dahil",
].join("|"));
const OLUMSUZ_RX = /odenmedi|odemedi|odenmemis|odenmeyecek|odemeyecek|odenecek|bekliyor|borc\s+var/;

// Notta 2. dönemin de ödendiğini düşündüren bir ifade varsa o notu döndürür; olumsuz cümleler ve yalnızca 1. dönemden söz eden notlar elenir.
function notEslesme(metin) {
  const k = kok(metin);
  if (!k || OLUMSUZ_RX.test(k) || !NOT_RX.test(k)) return null;
  if (/\b1\s*\.?\s*(donem|odeme|taksit)/.test(k) && !/\b2\b|iki/.test(k)) return null;
  return String(metin).trim();
}

const medyan = (d) => { const s = [...d].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const ucretiOf = (o) => sayiya(o.aylik_odeme);
const odemeler = (o) => (Array.isArray(o.odeme_gecmisi) ? o.odeme_gecmisi : []).filter((g) => !harici(g));

// Güçlü: ücret sınıfın normalinin 1,5 katı+ ve normal bir dönemi aşan ödeme yapılmış. Zayıf: yalnızca ödeme notu 2. dönemden/peşinden bahsediyor.
export function ikiDonemAdaylari(ogrenciler) {
  const ucretler = ogrenciler.map(ucretiOf).filter((u) => u > 0);
  if (!ucretler.length) return [];
  const genel = medyan(ucretler);
  const siniflar = new Map();
  for (const o of ogrenciler) if (ucretiOf(o) > 0) (siniflar.get(o.sinif || "") || siniflar.set(o.sinif || "", []).get(o.sinif || "")).push(ucretiOf(o));
  const sonuc = [];
  for (const o of ogrenciler) {
    const f = ucretiOf(o), gecmis = odemeler(o);
    const odenen = gecmis.reduce((t, g) => t + sayiya(g.tutar), 0);
    if (f <= 0 || odenen <= 0) continue;
    const s = siniflar.get(o.sinif || "") || [];
    const ref = s.length >= 3 ? Math.min(medyan(s), genel) : genel;
    const oran = ref ? f / ref : 0;
    const guclu = oran >= IKI_DONEM_ORAN && odenen > f / 2 + 0.01;
    const bulunan = [...gecmis.map((g) => g.not), o.notlar].filter(Boolean).map(notEslesme).find(Boolean);
    if (!(guclu || bulunan)) continue;
    const kisa = (bulunan || "").replace(/\n/g, " ");
    sonuc.push({
      ogrenci: o, ucret: f, odenen, pay: Math.min(ciftYuvarla(f / 2), odenen), guclu,
      neden: guclu ? doldur("okul_iki_donem_neden_ucret", { oran: oran.toFixed(1) }) : doldur("okul_iki_donem_neden_not", { metin: kisa.length <= 45 ? kisa : kisa.slice(0, 44) + "…" }),
    });
  }
  sonuc.sort((a, b) => Number(!a.guclu) - Number(!b.guclu) || (String(a.ogrenci.ad_soyad || "") < String(b.ogrenci.ad_soyad || "") ? -1 : String(a.ogrenci.ad_soyad || "") > String(b.ogrenci.ad_soyad || "") ? 1 : 0));
  return sonuc;
}

// 2. dönemi peşin ödemiş öğrencilerin kimlikleri: 'pesin' işaretli ödemeler (hangi dönem açık olursa olsun) + 1. dönem açıkken henüz aktarılmamış adaylar.
export function pesinIdleri(ogrenciler, aktif) {
  const idler = new Set();
  for (const o of ogrenciler) {
    const listeler = [o.odeme_gecmisi, ...(nesneMi(o.donem_veri) ? Object.values(o.donem_veri).map((v) => (v || {}).odeme_gecmisi) : [])];
    if (listeler.some((l) => Array.isArray(l) && l.some((g) => g && g.pesin))) idler.add(o.id);
  }
  if (String(aktif).endsWith("-1")) for (const a of ikiDonemAdaylari(ogrenciler)) idler.add(a.ogrenci.id);
  return idler;
}

// ── Geçiş ───────────────────────────────────────────────────────────────────
function odemeKayitlariTazele(o, aylar) {
  const kayit = nesneMi(o.odeme_kayitlari) ? o.odeme_kayitlari : {};
  for (const ay of aylar) {
    const g = odemeler(o).filter((x) => x.ay === ay);
    if (g.length) kayit[ay] = { tarih: g.map((x) => x.tarih || "").reduce((a, b) => (tarihAnahtari(b) > tarihAnahtari(a) ? b : a)), odenen: g.reduce((t, x) => t + sayiya(x.tutar), 0) };
    else delete kayit[ay];
  }
  o.odeme_kayitlari = kayit;
}

const yeniKimlikVarsayilan = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

// Açık (1.) dönem kaydından `pay` kadar ödemeyi en yeni ödemeden başlayarak ayırır, dönem ücretini aynı tutar kadar düşürür ve ayrılan ödemeleri döndürür.
// Kısmen ayrılan ödemenin dekontu orijinalde kalır.
function ikiDonemAyir(o, pay, kimlik) {
  let kalan = Number(pay);
  let gecmis = Array.isArray(o.odeme_gecmisi) ? [...o.odeme_gecmisi] : [];
  const tasinan = [];
  const yeniOnce = [...gecmis].sort((a, b) => (tarihAnahtari(b.tarih) > tarihAnahtari(a.tarih) ? 1 : tarihAnahtari(b.tarih) < tarihAnahtari(a.tarih) ? -1 : 0));
  for (const g of yeniOnce) {
    const t = sayiya(g.tutar);
    if (kalan <= 0.005) break;
    if (harici(g) || t <= 0) continue;
    const al = Math.min(t, kalan);
    let kopya;
    if (al >= t - 0.005) {
      gecmis = gecmis.filter((x) => x !== g);
      kopya = { ...g };
    } else {
      g.tutar = yuvarla2(t - al);
      kopya = Object.fromEntries(Object.entries(g).filter(([k]) => k !== "dekont"));
      kopya.id = kimlik();
      kopya.tutar = al;
    }
    kopya.pesin = true;
    kopya.not = `${g.not || ""} ${mb("okul_iki_donem_pesin_not")}`.trim();
    tasinan.push(kopya);
    kalan -= al;
  }
  o.odeme_gecmisi = gecmis;
  o.aylik_odeme = Math.max(0, sayiya(o.aylik_odeme) - (Number(pay) - kalan));
  odemeKayitlariTazele(o, new Set(tasinan.map((k) => k.ay)));
  return tasinan;
}

// Tek öğrenciyi `hedef` dönemin gözüyle döndürür (kopya): hedef dönemin alanları üst düzeye çıkar, o anki üst düzey alanlar donem_veri altına iner.
// Hedef dönemde kaydı yoksa ücret ve servis bilgisi taşınır, ödemeler boş başlar (masaüstündeki "ilk açılış" ile aynı). İşlem tersine çevrilebilir:
// aynı çağrıyla eski döneme dönülür (kayıt yazarken değişen görünüm bu yolla asıl yerine konur).
export function ogrenciDonemeGetir(kaynak, hedef, layout) {
  const o = klon(kaynak);
  const cur = o.aktif_donem || layout;
  if (cur === hedef) return o;
  const dv = nesneMi(o.donem_veri) ? o.donem_veri : {};
  dv[cur] = Object.fromEntries(ALANLAR.filter((k) => k in o).map((k) => [k, o[k]]));
  if (hedef in dv) {
    const snap = dv[hedef];
    delete dv[hedef];
    for (const k of ALANLAR) { if (k in snap) o[k] = snap[k]; else delete o[k]; }
  } else {
    o.odeme_gecmisi = [];
    o.odeme_kayitlari = {};
  }
  o.donem_veri = dv;
  o.aktif_donem = hedef;
  return o;
}

// Cihazın seçtiği dönemin görünümü: öğrenciler `hedef` dönemin gözüyle gelir (servis kayıtlarına dokunulmaz). Hiçbiri değişmeyecekse listenin kendisi döner.
export function gorunumListesi(ham, hedef, layout) {
  if (!hedef || !ham.some((o) => !String(o.id).startsWith("srv_") && gecerliDonem(o, layout) !== hedef)) return ham;
  return ham.map((o) => (String(o.id).startsWith("srv_") ? o : ogrenciDonemeGetir(o, hedef, layout)));
}

// Seçili dönemin görünümünde değiştirilen kaydı asıl düzenine (dönem verisi donem_veri altında) geri koyar. orijinal: sunucudaki kayıt (yeni kayıtta null).
export function gorunumdenDon(v, orijinal, secili, layout) {
  const asil = (orijinal && orijinal.aktif_donem) || layout;
  if (secili === asil) return v;
  return ogrenciDonemeGetir({ ...v, aktif_donem: secili }, asil, layout);
}

// Hiçbir öğrencide açık olmayan bir dönemi açar: her öğrenciye ücret ve servis bilgisiyle boş ödemeli dönem kaydı yazılır (kaynak dönemden taşınır),
// ikiDonem: { öğrenci_id: pay } varsa kaynak dönemdeki peşin ödemeden pay ayrılıp yeni döneme ödenmiş yazılır. Girdi değişmez; yazılacak kayıtlar döner.
// Cihazların hangi dönemi gösterdiğine dokunmaz.
export function donemAc(ogrenciler, layout, kaynak, hedef, ikiDonem = {}, kimlik = yeniKimlikVarsayilan) {
  const guncel = [];
  for (const s of ogrenciler) {
    const asil = gecerliDonem(s, layout);
    const v = ogrenciDonemeGetir(s, kaynak, layout);
    const tasinan = sayiya(ikiDonem[s.id]) > 0 ? ikiDonemAyir(v, ikiDonem[s.id], kimlik) : [];   // kaynak dönem kaydı yeni dönem anlık görüntüsünden ÖNCE düşülür
    const yeni = Object.fromEntries(ALANLAR.filter((k) => k in v).map((k) => [k, v[k]]));
    yeni.odeme_gecmisi = tasinan;
    yeni.odeme_kayitlari = {};
    if (tasinan.length) {
      yeni.aylik_odeme = tasinan.reduce((t, k) => t + sayiya(k.tutar), 0);
      odemeKayitlariTazele(yeni, new Set(tasinan.map((k) => k.ay)));
    }
    const o = ogrenciDonemeGetir(v, asil, layout);
    o.donem_veri = { ...(nesneMi(o.donem_veri) ? o.donem_veri : {}), [hedef]: yeni };
    guncel.push(o);
  }
  return guncel;
}

// Dönem görünümüne bir ödeme ekler (tekrarlı gönderim mobil_id ile engellenir). Yeni eklendiyse true.
export function odemeEkleGorunume(o, { id, tarih, tutar, yontem, not, mobilId, kisi }) {
  const gecmis = Array.isArray(o.odeme_gecmisi) ? o.odeme_gecmisi : [];
  if (mobilId && gecmis.some((g) => g.mobil_id === mobilId)) return false;
  const [y, a, g] = String(tarih).split("-");
  const ay = `${y}-${a}`;
  o.odeme_gecmisi = [...gecmis, { id, ay, tarih: `${g}.${a}.${y}`, tutar: yuvarla2(Number(tutar)), not: String(not || "").trim() || "Mobil ödeme", yontem, mobil_id: mobilId || null, mobil_kullanici: kisi || "" }];
  odemeKayitlariTazele(o, [ay]);
  return true;
}

// Seçili dönem dışındaki dönemlerden kalan borçlar (yalnızca bilgi): ["2026-2027 · 1. Dönem'den kalan borç: 1.500 ₺", ...]
export function oncekiDonemBorclari(o, tutarYaz) {
  const sonuc = [];
  for (const [anahtar, dv] of Object.entries(nesneMi(o.donem_veri) ? o.donem_veri : {})) {
    const ucret = sayiya((dv || {}).aylik_odeme);
    const odenen = odemeler(dv || {}).reduce((t, g) => t + sayiya(g.tutar), 0);
    if (ucret - odenen > 0.01) sonuc.push(doldur("okul_onceki_donem_borc", { donem: donemAdi(anahtar), tutar: tutarYaz(ucret - odenen) }));
  }
  return sonuc;
}
