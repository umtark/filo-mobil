// Masaüstündeki Lottie ikonlarını (data/anim/*.json) oynatır. Kütüphane ve dosyalar ancak ekranda gerekince indirilir; bir kez oynar,
// dokununca yeniden oynar. Hareket azaltma açıksa son karede durur.
import { h } from "./ui.js";

let kutuphane = null;
const yukle = () => (kutuphane = kutuphane || new Promise((coz, red) => {
  const s = h("script", { src: "lib/lottie.min.js" });
  s.onload = () => coz(window.lottie);
  s.onerror = () => red(new Error("lottie yüklenemedi"));
  document.head.append(s);
}));

const azalt = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// dinlenme: animasyonun hangi noktasında (0-1) ikonun tam göründüğü; sonu bu üç ikonda boş/koyu kalıyor, bu yüzden orada durulur.
export function animasyon(ad, boyut = 44, dinlenme = 0.6) {
  const kap = h("span", { class: "anim", "aria-hidden": "true", style: `width:${boyut}px;height:${boyut}px` });
  Promise.all([yukle(), fetch(`anim/${ad}.json`).then((r) => r.json())]).then(([lottie, veri]) => {
    const an = lottie.loadAnimation({ container: kap, renderer: "svg", loop: false, autoplay: false, animationData: veri });
    const durak = Math.floor(veri.op * dinlenme);
    const oynat = () => (azalt() ? an.goToAndStop(durak, true) : an.playSegments([0, durak], true));
    an.addEventListener("DOMLoaded", () => {
      an.goToAndStop(durak, true);   // oynamadan önce de tam ikon görünür
      const gozcu = new IntersectionObserver((kayitlar) => {
        if (!kap.isConnected) { an.destroy(); gozcu.disconnect(); return; }
        if (kayitlar.some((k) => k.isIntersecting) && !kap.dataset.oynadi) { kap.dataset.oynadi = "1"; oynat(); }
      });
      gozcu.observe(kap);
      kap.parentElement && kap.parentElement.addEventListener("click", () => oynat());
    });
  }).catch(() => { /* ağ yoksa ikon boş kalır; kart yine okunur */ });
  return kap;
}
