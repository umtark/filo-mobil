// Çıktı raporlarının ortak, tarayıcıdan bağımsız yardımcıları (sayı/tarih biçimi, dönem süzgeci, Excel matris yardımcıları).
import { ayAnahtari, ayEkle, bugun } from "./bicim.js";

const p2 = (n) => String(n).padStart(2, "0");

// Masaüstündeki format_number / format_currency ile aynı çıktı: "1.234,56" ve "1.234,56 ₺".
export function sayiTr(v, ondalik = 2) {
  const n = Number(v) || 0;
  const [tam, kesir] = Math.abs(n).toFixed(ondalik).split(".");
  const grup = tam.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const eksi = n < 0 && Number(Math.abs(n).toFixed(ondalik)) !== 0 ? "-" : "";
  return eksi + grup + (ondalik ? "," + kesir : "");
}
export const tl = (v, ondalik = 2) => `${sayiTr(v, ondalik)} ₺`;
export const gg = (d) => (d ? `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}` : "");
export const ggSaat = (d = new Date()) => `${gg(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;

// Dönem seçimi: Tüm Kayıtlar / Bu Ay / Geçen Ay / Ay Seç (masaüstündeki dışa aktarma penceresiyle aynı).
export function donemCoz({ tur = "tumu", ay = "" } = {}) {
  const simdi = ayAnahtari(bugun());
  const hedef = tur === "bu" ? simdi : tur === "gecen" ? ayEkle(simdi, -1) : tur === "ay" && /^\d{4}-\d{2}$/.test(ay) ? ay : "";
  return {
    ay: hedef,
    etiket: hedef ? `${hedef.slice(5)}.${hedef.slice(0, 4)}` : "Tüm Kayıtlar",
    icinde: (tarih) => !hedef || Boolean(tarih && ayAnahtari(tarih) === hedef),
  };
}

// Excel matrisi: 1 tabanlı (satır, sütun) ile hücre yazılır; boşluklar "" olur.
export function matris() {
  const sat = [];
  return {
    koy(r, c, v) { (sat[r - 1] ||= [])[c - 1] = v; },
    satirlar() { return Array.from({ length: sat.length }, (_, i) => (sat[i] ? Array.from(sat[i], (x) => x ?? "") : [])); },
    sonSatir() { return sat.length; },
  };
}

// Sütun genişliği: içeriğin en uzun değeri + 2 (alt/üst sınırlı); birleştirilmiş başlıklar hesaba katılmaz.
export function genislikler(satirlar, { atla = [], alt = 6, ust = 40, ek = 2 } = {}) {
  const w = [];
  satirlar.forEach((satir, ri) => {
    if (atla.includes(ri + 1)) return;
    satir.forEach((h, ci) => {
      const v = h !== null && typeof h === "object" ? h.v : h;
      const u = String(v ?? "").length;
      w[ci] = Math.max(w[ci] || 0, u);
    });
  });
  return Array.from(w, (x) => Math.min(ust, Math.max(alt, (x || 0) + ek)));
}

export const toplamla = (liste, f) => liste.reduce((t, x) => t + (Number(f(x)) || 0), 0);
export const tarihSirasi = (a, b) => (a.tarih ? a.tarih.getTime() : 0) - (b.tarih ? b.tarih.getTime() : 0);
