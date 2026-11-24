// Giriş kimliği yardımcıları (saf fonksiyonlar; testleri testler/kimlik_test.mjs altında).
// Dönüşüm supabase/kullanici_aktar.py ve bulut_istemci.py içindeki kullanici_eposta ile aynı kalmalıdır.

const TR_HARITA = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const KOD_DESENI = /^[0-9]{6}$/;

// "Sara" + "482915.filo.local" -> sara@482915.filo.local. '@' içeren giriş e-posta olarak olduğu gibi kullanılır.
export function kullaniciAdindanEposta(ad, alan) {
  const t = String(ad).trim();
  if (t.includes("@")) return t.toLowerCase();
  const sade = t.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().replace(/[çğıöşüâîû]/g, (c) => TR_HARITA[c]).replace(/[^a-z0-9._-]/g, "");
  return `${sade}@${alan}`;
}

// Oturumdaki e-postadan yalnızca kullanıcı adı kısmı (işletmenin alan adından bağımsız).
export function epostadanKullaniciAdi(e) {
  const t = String(e || "");
  const i = t.indexOf("@");
  return i > 0 ? t.slice(0, i) : t;
}

// Şirket kodu: 6 haneli rakam (örn. 482915; sistem üretir). Geçersizse boş metin.
export function sirketKodunuNormalle(ham) {
  const k = String(ham || "").trim();
  return KOD_DESENI.test(k) ? k : "";
}

// "482915.filomuhasebe.com" + kök "filomuhasebe.com" -> "482915". Kök boşsa ya da adres uymuyorsa boş metin.
export function altAlandanSirket(hostname, kok) {
  const k = String(kok || "").trim().toLowerCase().replace(/^\./, "");
  const h = String(hostname || "").trim().toLowerCase();
  if (!k || !h.endsWith("." + k)) return "";
  const etiket = h.slice(0, -(k.length + 1));
  return etiket.includes(".") ? "" : sirketKodunuNormalle(etiket);
}

// Şirket kodunun kaynağı, öncelik sırasıyla: alt alan adı > adres satırındaki ?i= > cihazda saklı > varsayılan.
// Dönüş: { kod, kaynak } ; kaynak: "altalan" | "adres" | "saklanan" | "varsayilan" | "yok"
export function sirketKodunuBul({ arama = "", depolanan = "", hostname = "", altAlanKoku = "", varsayilan = "" } = {}) {
  const altalan = altAlandanSirket(hostname, altAlanKoku);
  if (altalan) return { kod: altalan, kaynak: "altalan" };
  let adres = "";
  try { adres = sirketKodunuNormalle(new URLSearchParams(arama).get("i")); } catch { adres = ""; }
  if (adres) return { kod: adres, kaynak: "adres" };
  const saklanan = sirketKodunuNormalle(depolanan);
  if (saklanan) return { kod: saklanan, kaynak: "saklanan" };
  const ilk = sirketKodunuNormalle(varsayilan);
  return ilk ? { kod: ilk, kaynak: "varsayilan" } : { kod: "", kaynak: "yok" };
}
