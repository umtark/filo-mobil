// Giriş kimliği yardımcıları (saf fonksiyonlar; testleri testler/kimlik_test.mjs altında).
// Dönüşüm supabase/kullanici_aktar.py ve bulut_istemci.py içindeki kullanici_eposta ile aynı kalmalıdır.

const TR_HARITA = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
const KOD_DESENI = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// "Sara" + "abc-turizm.filo.local" -> sara@abc-turizm.filo.local. '@' içeren giriş e-posta olarak olduğu gibi kullanılır.
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

// Şirket kodu: 3-40 karakter, küçük harf/rakam/tire. Geçersizse boş metin.
export function sirketKodunuNormalle(ham) {
  const k = String(ham || "").trim().toLowerCase();
  return KOD_DESENI.test(k) ? k : "";
}

// "ABC Turizm Ltd. Şti." -> "abc-turizm-ltd-sti". Geçerli bir kod çıkmazsa boş metin (başvuru formunda kod önerisi için).
export function sirketKoduOner(ad) {
  const sade = String(ad || "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().replace(/[çğıöşüâîû]/g, (c) => TR_HARITA[c])
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 40).replace(/-+$/, "");
  return sirketKodunuNormalle(sade);
}

// "abc.filomuhasebe.com" + kök "filomuhasebe.com" -> "abc". Kök boşsa ya da adres uymuyorsa boş metin.
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
