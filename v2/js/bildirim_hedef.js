// Bildirim metninden ilgili kaydı bulur: masaüstü bildirimleri kayıt kimliği taşımaz, yalnızca "Olcay Başer / Gelir vergisi: 1 evrak ekledi",
// "ALİ YILMAZ öğrencisinin ödemesini aldı", "33 S 0800 plakalı araca ..." gibi metin gönderir. Kimlikli bildirimlerde (mobil) bu kullanılmaz.
import { aramaNorm, tarihCoz } from "./bicim.js";

const norm = (s) => aramaNorm(s);
const bitisitiz = (s) => norm(s).replace(/\s+/g, "");

// tablo -> kayıtta metinde aranacak alanlar ve "yeni" sıralamasının tarih alanı
const KURAL = {
  okul_ogrenciler: { alanlar: ["ad_soyad"], atla: (r) => String(r.id).startsWith("srv_") },
  araclar: { alanlar: ["plaka"], bosluksuz: true },
  esnaflar: { alanlar: ["isim"] },
  faturalar: { alanlar: ["Firma", "firma"], tarih: ["Tarih", "tarih"], tutar: ["Toplam", "toplam"] },
  ic_hizmetler: { alanlar: ["gidilen_yer"], tarih: ["tarih"], tutar: ["tutar"] },
};
const SERVIS_KURALI = { alanlar: ["plaka"], bosluksuz: true };
const ilkDeger = (r, adlar) => adlar.map((a) => r[a]).find((v) => v !== undefined && v !== null && String(v).trim() !== "") ?? "";
const zaman = (r, adlar) => { const t = tarihCoz(ilkDeger(r, adlar)); return t ? t.getTime() : 0; };
// Mesajdaki "(1500 ₺)" tutarı; aynı firma/yere ait birçok kayıttan doğrusunu seçmek için.
const mesajTutari = (mesaj) => { const t = String(mesaj).match(/\(\s*(-?[\d.,]+)\s*₺\s*\)/); return t ? Math.round(Number(t[1].replace(/\./g, "").replace(",", "."))) : null; };

function evrakBul(mesaj, kayitlar) {
  const aktif = kayitlar.filter((r) => !r.arsiv);
  const yeniden = (a, b) => (Date.parse(b.eklenme) || 0) - (Date.parse(a.eklenme) || 0);
  // "Firma / Kategori: N evrak ekledi" -> o firmanın o kategorideki en son eklenen N evrakı
  const ekleme = String(mesaj).match(/^\s*(.+?)\s*\/\s*(.+?)\s*:\s*(\d+)\s+evrak/i);
  if (ekleme) {
    const [, firma, kategori, adet] = ekleme;
    const g = aktif.filter((r) => norm(r.firma) === norm(firma) && norm(r.kategori) === norm(kategori)).sort(yeniden).slice(0, Number(adet));
    if (g.length) return g.map((r) => r.id);
  }
  const tirnakli = String(mesaj).match(/'([^']+)'/);
  if (tirnakli) {
    const g = aktif.filter((r) => norm(r.baslik) === norm(tirnakli[1]));
    if (g.length) return [g.sort(yeniden)[0].id];
  }
  const m = norm(mesaj);
  const adaylar = aktif.filter((r) => norm(r.baslik).length >= 4 && m.includes(norm(r.baslik))).sort((a, b) => norm(b.baslik).length - norm(a.baslik).length);
  return adaylar.length ? [adaylar[0].id] : [];
}

// Dönen: bulunan kayıtların kimlikleri ("tablo/kimlik" değil, yalın kimlik); bulunamazsa boş.
export function mesajdanKayitlar(tablo, mesaj, kayitlar) {
  if (!mesaj || !kayitlar || !kayitlar.length) return [];
  if (tablo === "sirket_evraklari") return evrakBul(mesaj, kayitlar);
  const servisMesaji = tablo === "okul_ogrenciler" && /servis ara[cç]/i.test(norm(mesaj) + " " + mesaj);
  const kural = servisMesaji ? SERVIS_KURALI : KURAL[tablo];
  if (!kural) return [];
  const m = norm(mesaj), mb = bitisitiz(mesaj);
  let enUzun = 0, bulunan = [];
  for (const r of kayitlar) {
    if (servisMesaji ? !String(r.id).startsWith("srv_") : kural.atla && kural.atla(r)) continue;
    const ad = String(ilkDeger(r, kural.alanlar)).trim();
    if (ad.length < 3) continue;
    const eslesir = kural.bosluksuz ? mb.includes(bitisitiz(ad)) : (` ${m} `).includes(` ${norm(ad)} `);
    if (!eslesir) continue;
    const uzunluk = norm(ad).length;
    if (uzunluk > enUzun) { enUzun = uzunluk; bulunan = [r]; } else if (uzunluk === enUzun) bulunan.push(r);
  }
  if (!bulunan.length) return [];
  const tutar = kural.tutar ? mesajTutari(mesaj) : null;
  if (tutar !== null) {
    const ayni = bulunan.filter((r) => Math.round(Number(ilkDeger(r, kural.tutar)) || 0) === tutar);
    if (ayni.length) bulunan = ayni;
  }
  if (kural.tarih) bulunan.sort((a, b) => zaman(b, kural.tarih) - zaman(a, kural.tarih));
  return [bulunan[0].id];
}
