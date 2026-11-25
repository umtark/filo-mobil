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
// Ekranda göründüğü sürece kısa aralıklarla sürekli oynar; ekrandan çıkınca durur, hareket azaltma açıksa son karede durur. Dokununca hemen oynar.
const ARA_MS = 1200;
export function animasyon(ad, boyut = 44, dinlenme = 0.6) {
  const kap = h("span", { class: "anim", "aria-hidden": "true", style: `width:${boyut}px;height:${boyut}px` });
  Promise.all([yukle(), fetch(`anim/${ad}.json`).then((r) => r.json())]).then(([lottie, veri]) => {
    const an = lottie.loadAnimation({ container: kap, renderer: "svg", loop: false, autoplay: false, animationData: veri });
    const durak = Math.floor(veri.op * dinlenme);
    let gorunur = false, caliyor = false, zaman = null;
    const oynat = () => {
      clearTimeout(zaman);
      if (azalt()) return an.goToAndStop(durak, true);
      caliyor = true;
      an.playSegments([0, durak], true);
    };
    an.addEventListener("complete", () => {
      caliyor = false;
      clearTimeout(zaman);
      if (gorunur && kap.isConnected && !azalt()) zaman = setTimeout(oynat, ARA_MS);
    });
    an.addEventListener("DOMLoaded", () => {
      an.goToAndStop(durak, true);   // oynamadan önce de tam ikon görünür
      const gozcu = new IntersectionObserver((kayitlar) => {
        if (!kap.isConnected) { clearTimeout(zaman); an.destroy(); gozcu.disconnect(); return; }
        gorunur = kayitlar.some((k) => k.isIntersecting);
        if (gorunur && !caliyor) oynat();
        if (!gorunur) { clearTimeout(zaman); }
      });
      gozcu.observe(kap);
      kap.parentElement && kap.parentElement.addEventListener("click", () => { if (!caliyor) oynat(); });
    });
  }).catch(() => { /* ağ yoksa ikon boş kalır; kart yine okunur */ });
  return kap;
}