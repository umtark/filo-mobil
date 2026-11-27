// Kullanıcı lisans süresi: birimli süre verme (dakika, saat, gün, hafta, ay, yıl) ve kalan sürenin okunur yazımı. Saf fonksiyonlar (testler/sure_test.mjs).
export const BIRIMLER = [["minutes", "Dakika"], ["hours", "Saat"], ["days", "Gün"], ["weeks", "Hafta"], ["months", "Ay"], ["years", "Yıl"]];

// Sunucudaki platform_uye_ayarla(p_ekle interval) için "3 hours" gibi metin üretir; ay ve yıl takvime göre sunucuda hesaplanır.
export function aralik(adet, birim) {
  const n = Number(adet);
  if (!Number.isInteger(n) || n < 1) throw new Error("Süre 1 ya da daha büyük bir tam sayı olmalı.");
  if (!BIRIMLER.some(([k]) => k === birim)) throw new Error("Birim geçersiz.");
  return `${n} ${birim}`;
}

// Süreyi en büyük iki birimle yazar: "1 yıl 2 ay", "3 gün 4 sa", "25 dk".
export function sureYaz(ms) {
  if (Math.abs(ms) < 60000) return "1 dakikadan az";
  const dk = Math.round(Math.abs(ms) / 60000);
  const gun = Math.floor(dk / 1440), sa = Math.floor((dk % 1440) / 60), d = dk % 60;
  const yil = Math.floor(gun / 365), ay = Math.floor((gun % 365) / 30), g = (gun % 365) % 30;
  const parcalar = yil ? [[yil, "yıl"], [ay, "ay"]] : ay ? [[ay, "ay"], [g, "gün"]] : gun ? [[gun, "gün"], [sa, "sa"]] : sa ? [[sa, "sa"], [d, "dk"]] : [[d, "dk"]];
  return parcalar.filter(([n]) => n > 0).map(([n, b]) => `${n} ${b}`).join(" ");
}

export function anMetni(iso) {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? "" : new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(t);
}

export const uyeSuresiDoldu = (bitis, simdi = Date.now()) => Boolean(bitis) && Date.parse(bitis) <= simdi;

export function uyeSuresi(bitis, simdi = Date.now()) {
  if (!bitis) return "süresiz";
  const kalan = Date.parse(bitis) - simdi;
  return kalan <= 0 ? `süresi ${sureYaz(kalan)} önce doldu` : `${anMetni(bitis)} (${sureYaz(kalan)} kaldı)`;
}
