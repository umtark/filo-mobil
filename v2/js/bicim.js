// Biçimleme ve tarih yardımcıları (saf fonksiyonlar; testleri testler/ altında).

// Masaüstündeki format_currency gibi sembol rakamın sağında ve bitişik boşlukla: "15.000 ₺", "1.234,50 ₺" (satır sonunda ₺ tek kalmasın diye bölünmez boşluk).
const tamSayi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const kurusluSayi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const TL = "\u00a0₺";
const sayiBicimi = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

export const sayi = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[^\d,.\-]/g, "");
  if (!s) return 0;
  // "1.234,56" ve "1.500" (Türkçe binlik ayracı) ile "1234.56" biçimlerini okur
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", "."))
    : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s);
  return Number.isFinite(n) ? n : 0;
};

// Tam sayı tutarlar kuruşsuz (15.000 ₺), kuruşlu olanlar iki basamakla (1.234,50 ₺) yazılır.
export const para = (n) => {
  const v = sayi(n);
  return (Math.abs(v - Math.round(v)) < 0.005 ? tamSayi : kurusluSayi).format(v) + TL;
};
export const paraKesin = (n) => kurusluSayi.format(sayi(n)) + TL;
export const sayiYaz = (n) => sayiBicimi.format(sayi(n));

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export const ayAdi = (ay) => `${AYLAR[Number(ay.slice(5, 7)) - 1]} ${ay.slice(0, 4)}`;
export const ayKisa = (ay) => AYLAR[Number(ay.slice(5, 7)) - 1];

// "dd.mm.yyyy", "yyyy-mm-dd" ya da "yyyy-mm-ddThh:mm" -> yerel gece yarısı Date; okunamazsa null
export function tarihCoz(v) {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  let y, a, g;
  if (m) { g = +m[1]; a = +m[2]; y = +m[3]; }
  else if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) { y = +m[1]; a = +m[2]; g = +m[3]; }
  else return null;
  const d = new Date(y, a - 1, g);
  return d.getFullYear() === y && d.getMonth() === a - 1 && d.getDate() === g ? d : null;
}

export const ayAnahtari = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const gunAnahtari = (d) => `${ayAnahtari(d)}-${String(d.getDate()).padStart(2, "0")}`;
export const bugun = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

export const tarihYaz = (d) => (d ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(d) : "");
export const tarihKisa = (d) => (d ? new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" }).format(d) : "");
export const gunFarki = (d, referans = bugun()) => Math.round((d - referans) / 86400000);
export const isoTarih = (d) => gunAnahtari(d);

// Türkçe duyarlı küçük harf / arama normalizasyonu
export const kucuk = (s) => String(s ?? "").toLocaleLowerCase("tr");
export const eslesir = (metin, aranan) => kucuk(metin).includes(kucuk(aranan).trim());
// Masaüstündeki arama kuralı (_arama_norm / _arama_eslesir): büyük-küçük harf, Türkçe karakter ve noktalama farkı yok sayılır; yazılan her kelime kaydın herhangi bir yerinde geçmelidir.
// Telefon numaraları ayrıca yalnızca rakamlarla karşılaştırılır (başta 0 olsa da olmasa da, boşluk ve tireye bakmadan).
const TR_ARAMA = { "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i", "İ": "i", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u" };
export const aramaNorm = (s) => String(s ?? "").replace(/[çÇğĞıIİöÖşŞüÜ]/g, (c) => TR_ARAMA[c]).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^0-9a-z\s]/g, " ").replace(/\s+/g, " ").trim();
export const aramaHazirla = (alanlar, telefonlar = []) => ({ norm: aramaNorm(alanlar.join(" ")), tel: telefonlar.join(" ").replace(/\D/g, "") });
export function aramaEslesir(kayit, aranan) {
  const parcalar = aramaNorm(aranan).split(" ").filter(Boolean);
  if (!parcalar.length) return true;
  if (parcalar.every((p) => kayit.norm.includes(p))) return true;
  const rakam = String(aranan ?? "").replace(/\D/g, "");
  return Boolean(rakam) && (kayit.tel.includes(rakam) || (rakam.startsWith("0") && kayit.tel.includes(rakam.slice(1))));
}export const sirala = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "tr", { sensitivity: "base" });

export const ayEkle = (ay, n) => {
  const t = Number(ay.slice(0, 4)) * 12 + Number(ay.slice(5, 7)) - 1 + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

export function telefonTemizle(v) {
  let t = String(v ?? "").replace(/[^\d+]/g, "");
  if (!t) return "";
  if (t.startsWith("+")) return t;
  t = t.replace(/^0+/, "");
  return t.length === 10 ? "+90" + t : t;
}
