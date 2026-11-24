// Servis puantajı: masaüstüyle aynı model. puantaj[ay] = servisin ÇALIŞMADIĞI (gelmediği) günler.
// Kayıt yoksa ay boyunca her gün çalışılmış sayılır; ücret ayda en az 1 gün çalışıldıysa tam ödenir.
import { tarihCoz, ayAnahtari, sayi } from "./bicim.js";

export const ayGunSayisi = (ay) => new Date(Number(ay.slice(0, 4)), Number(ay.slice(5, 7)), 0).getDate();

export function servisAyGecerli(s, ay, ayar) {
  const bas = tarihCoz(s.servis_baslangic_tarihi) || tarihCoz((ayar || {}).okul_puantaj_donem_baslangic);
  return !bas || ayAnahtari(bas) <= ay;
}

export const gelmeyenGunler = (s, ay) => new Set(((s.puantaj || {})[ay] || []).map(Number));

export function gelenGunSayisi(s, ay, ayar) {
  if (!servisAyGecerli(s, ay, ayar)) return 0;
  const yok = gelmeyenGunler(s, ay);
  let n = 0;
  for (let g = 1; g <= ayGunSayisi(ay); g++) if (!yok.has(g)) n++;
  return n;
}

export const odenecekTutar = (s, ay, ayar) => (s.sirket_araci ? 0 : gelenGunSayisi(s, ay, ayar) > 0 ? sayi(s.aylik_ucret) : 0);
