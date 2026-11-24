// Excel'de açılan CSV dışa aktarımı (Türkçe Excel için ";" ayırıcı ve BOM) ve rapor ekranlarının ortak parçaları.
import { h, ikon, toast } from "./ui.js";
import { trTarih } from "./form.js";

const kacis = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  if (v instanceof Date) return trTarih(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // Excel'in hücreyi formül sanmasını engeller
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function csvIndir(dosyaAdi, sutunlar, satirlar) {
  const icerik = "\ufeff" + [sutunlar, ...satirlar].map((r) => r.map(kacis).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([icerik], { type: "text/csv;charset=utf-8" }));
  const a = h("a", { href: url, download: `${dosyaAdi}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast("Dosya indirildi", "basari");
}

// Listenin üstündeki "Excel'e aktar" düğmesi; veriyi tıklanma anında üretir (süzgeç değişse de güncel liste çıkar).
export const aktarDugmesi = (uret) => h("button", { class: "dugme ikincil kucuk", type: "button", onclick: () => { const [ad, sutunlar, satirlar] = uret(); csvIndir(ad, sutunlar, satirlar); } },
  ikon("indir", 16), "Excel'e aktar");
