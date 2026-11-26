// iPhone/iPad (Safari) için "Ana Ekrana Ekle" ipucu: iOS'ta kurulum penceresi çıkmaz, kullanıcı Paylaş menüsünden kendisi eklemelidir.
// Yalnızca iOS'ta, uygulama henüz ana ekrandan açılmamışken ve ipucu kapatılmamışsa gösterilir.
import { h, ikon } from "./ui.js";

const ANAHTAR = "filo2.kurulumIpucu";
const oku = () => { try { return localStorage.getItem(ANAHTAR) === "1"; } catch { return false; } };
const yaz = () => { try { localStorage.setItem(ANAHTAR, "1"); } catch { /* depolama kapalı */ } };

export const iosMu = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const anaEkrandanAcildi = () => navigator.standalone === true || (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches);

export function kurulumIpucu() {
  if (!iosMu() || anaEkrandanAcildi() || oku()) return null;
  const kap = h("section", { class: "kurulum-ipucu", role: "note" },
    h("span", { class: "kurulum-ikon" }, ikon("paylas", 22)),
    h("div", { class: "kurulum-metin" },
      h("strong", {}, "Ana ekrana ekleyin"),
      h("p", {}, "Alttaki Paylaş düğmesine dokunun, sonra \"Ana Ekrana Ekle\"yi seçin.")),
    h("button", { class: "dugme ikincil kucuk", type: "button", onclick: () => { yaz(); kap.remove(); } }, "Tamam"));
  return kap;
}
