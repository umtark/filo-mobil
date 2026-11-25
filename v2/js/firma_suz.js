// Araç çıktılarında firma seçimi: masaüstündeki _normalize_firma_adi / _firma_ayni_mi / _filter_araclar_by_firma kurallarının aynısı
// ("Olcay Tur Ltd" ile "Olcaytur" aynı firma sayılır, "Olcay Başer" ayrı kalır).
const TIP_KELIMELERI = new Set(["ltd", "sti", "şti", "as", "aş", "llc", "inc", "corp", "limited", "sirketi", "şirketi", "anonim", "kollektif", "komandit", "turizm", "tur", "seyahat", "nakliyat", "nakliye",
  "ticaret", "tic", "sanayi", "san", "otomotiv", "tasimacilik", "taşımacılık", "gida", "gıda", "insaat", "inşaat", "ve", "hizmetleri", "hizmet", "pazarlama", "paz", "dis", "dış", "ith", "ihr", "ihracat", "ithalat", "grup", "group"]);
const YASAL_KELIMELER = new Set(["ltd", "sti", "şti", "as", "aş", "llc", "inc", "corp", "limited", "sirketi", "şirketi", "anonim"]);
const SON_EK = /\s+(ltd\.?\s?şti\.?|a\.?ş\.?|ltd\.?|llc\.?|inc\.?|corp\.?|turizm|seyahat|nakliyat|nakliye|tur(?:izm)?)\s*$/i;

const kelimeler = (ad) => String(ad ?? "").normalize("NFKC").toLowerCase().replace(/[^0-9a-zçğıöşü ]+/g, " ").split(/\s+/).filter(Boolean);
const yasalCekirdek = (ad) => kelimeler(ad).filter((t) => !YASAL_KELIMELER.has(t)).join("").normalize("NFKD").replace(/[^\x00-\x7f]/g, "");

export function normalizeFirmaAdi(ham) {
  let s = String(ham ?? "").split(/\s+/).filter(Boolean).join(" ");
  for (let i = 0; i < 3; i++) {
    const yeni = s.replace(SON_EK, "");
    if (yeni === s) break;
    s = yeni.replace(/^[ .,]+|[ .,]+$/g, "");
  }
  return s.replace(/^[ .,]+|[ .,]+$/g, "").normalize("NFKC").toLowerCase();
}

// Python difflib.SequenceMatcher(None, a, b).ratio() karşılığı (kısa adlar için; otomatik "junk" yok).
function benzerlik(x, y) {
  const a = Array.from(x), b = Array.from(y);
  if (!a.length && !b.length) return 1;
  const b2j = new Map();
  b.forEach((c, j) => { if (!b2j.has(c)) b2j.set(c, []); b2j.get(c).push(j); });
  const enUzun = (alo, ahi, blo, bhi) => {
    let besti = alo, bestj = blo, boyut = 0, onceki = new Map();
    for (let i = alo; i < ahi; i++) {
      const yeni = new Map();
      for (const j of b2j.get(a[i]) || []) {
        if (j < blo) continue;
        if (j >= bhi) break;
        const k = (onceki.get(j - 1) || 0) + 1;
        yeni.set(j, k);
        if (k > boyut) { besti = i - k + 1; bestj = j - k + 1; boyut = k; }
      }
      onceki = yeni;
    }
    return [besti, bestj, boyut];
  };
  let eslesen = 0;
  const kuyruk = [[0, a.length, 0, b.length]];
  while (kuyruk.length) {
    const [alo, ahi, blo, bhi] = kuyruk.pop();
    const [i, j, k] = enUzun(alo, ahi, blo, bhi);
    if (!k) continue;
    eslesen += k;
    if (alo < i && blo < j) kuyruk.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) kuyruk.push([i + k, ahi, j + k, bhi]);
  }
  return (2 * eslesen) / (a.length + b.length);
}

export function firmaAyniMi(a, b, esik = 0.92) {
  const ca = yasalCekirdek(a);
  if (ca && ca === yasalCekirdek(b)) return true;
  const ta = new Set(kelimeler(a)), tb = new Set(kelimeler(b));
  if (ta.size && tb.size) {
    const ortak = [...ta].filter((t) => tb.has(t));
    const fark = [...ta, ...tb].filter((t) => ta.has(t) !== tb.has(t));
    if (ortak.length && ortak.some((t) => !TIP_KELIMELERI.has(t)) && (!fark.length || fark.every((t) => TIP_KELIMELERI.has(t)))) return true;
  }
  const na = normalizeFirmaAdi(a), nb = normalizeFirmaAdi(b);
  return Boolean(na && nb && benzerlik(na, nb) >= esik);
}

const aracFirmasi = (a) => String(a.firma ?? "").trim() || String(a.kurum ?? "").trim();

// Seçim listesindeki benzersiz firma adları (firma yoksa kurum).
export function aracFirmaSecenekleri(araclar) {
  const gorulen = new Set(), sonuc = [];
  for (const a of araclar) {
    const ad = aracFirmasi(a);
    if (!ad) continue;
    const anahtar = normalizeFirmaAdi(ad);
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push(ad);
  }
  return sonuc.sort((x, y) => x.toLowerCase().localeCompare(y.toLowerCase(), "tr"));
}

// secili boşsa tüm araçlar; doluysa seçilen firmalara ait olanlar.
export function aracFirmaSuz(araclar, secili) {
  const secililer = (secili || []).map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!secililer.length) return [...araclar];
  const sonuc = araclar.filter((a) => {
    const ad = aracFirmasi(a);
    return ad && secililer.some((s) => firmaAyniMi(ad, s) || normalizeFirmaAdi(ad) === normalizeFirmaAdi(s));
  });
  if (!sonuc.length) throw new Error("Seçilen firmaya ait araç kaydı bulunamadı.");
  return sonuc;
}
