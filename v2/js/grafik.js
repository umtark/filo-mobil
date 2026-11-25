// Ana sayfa grafikleri (masaüstündeki trend ve dönem dağılımı grafiklerinin karşılığı) ve sayaç animasyonu.
// Çizim SVG ile yapılır; animasyonlar CSS geçişleridir (stil.css, .grafik / .halka) ve hareket azaltma tercihinde kapanır.
import { h } from "./ui.js";
import { para, sayiYaz } from "./bicim.js";
import { baslik } from "./metin.js";

const NS = "http://www.w3.org/2000/svg";
function s(ad, oz = {}, ...cocuk) {
  const e = document.createElementNS(NS, ad);
  for (const [k, v] of Object.entries(oz)) if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v);
  const ekle = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(ekle);
    else e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  cocuk.forEach(ekle);
  return e;
}

export const hareketAzaltildi = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Öğe ekranda göründüğünde bir kez çalıştırır (ekran dışındaki grafik, kaydırınca çizilir).
export function gorununce(el, calistir) {
  if (typeof IntersectionObserver === "undefined") { calistir(); return; }
  const gozcu = new IntersectionObserver((k) => { if (k.some((x) => x.isIntersecting)) { gozcu.disconnect(); requestAnimationFrame(calistir); } }, { threshold: 0.15 });
  gozcu.observe(el);
}

// Sayıyı önceki değerinden hedefe doğru sayarak gösterir. yaz(değer, bitti): metni üretir (bitti=true iken tam değer verilir).
export function sayac(el, hedef, yaz, { sure = 1500 } = {}) {
  const baslangic = el._son ?? 0;
  el._son = hedef;
  el._sayacNo = (el._sayacNo || 0) + 1;
  const no = el._sayacNo;
  if (hareketAzaltildi() || baslangic === hedef) { el.textContent = yaz(hedef, true); return; }
  el.textContent = yaz(baslangic, false);
  gorununce(el, () => {
    const t0 = performance.now();
    const adim = (t) => {
      if (el._sayacNo !== no) return;
      const p = Math.min(1, (t - t0) / sure);
      el.textContent = p < 1 ? yaz(baslangic + (hedef - baslangic) * (1 - (1 - p) ** 3), false) : yaz(hedef, true);
      if (p < 1) requestAnimationFrame(adim);
    };
    requestAnimationFrame(adim);
  });
}
const tl0 = (v) => para(Math.round(v));
export const paraSayaci = (el, hedef) => sayac(el, hedef, (v) => tl0(v));
export const adetSayaci = (el, hedef, ek = "") => sayac(el, hedef, (v) => `${sayiYaz(Math.round(v))}${ek}`, { sure: 1200 });

const kisa = (v) => {
  const m = Math.abs(v), kes = (x) => x.toFixed(1).replace(/\.0$/, "");
  const x = m >= 1e6 ? `${kes(m / 1e6)}M` : m >= 1e3 ? `${m >= 1e5 ? Math.round(m / 1e3) : kes(m / 1e3)}K` : String(Math.round(m));
  return v < 0 ? `-${x}` : x;
};
const guzelAdim = (x) => { const p = 10 ** Math.floor(Math.log10(Math.max(x, 1))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

const RENK = { gelir: "#22c55e", gider: "#f43f5e", net: "#38bdf8" };

// Aylık gelir/gider sütunları ve net çizgisi. seri: [{ etiket, gelir, gider, net }]
export function trendGrafigi(seri) {
  const n = seri.length;
  const G = Math.max(320, n * 50 + 48), Y = 250, SOL = 46, SAG = 10, UST = 44, ALT = 30;
  const enBuyuk = Math.max(1, ...seri.flatMap((x) => [x.gelir, x.gider]));
  const enKucuk = Math.min(0, ...seri.map((x) => x.net));
  const adim = guzelAdim((enBuyuk - enKucuk) / 4);
  const ust = Math.ceil(enBuyuk / adim) * adim, alt = enKucuk < 0 ? Math.floor(enKucuk / adim) * adim : 0;
  const y = (v) => UST + ((ust - v) / (ust - alt)) * (Y - UST - ALT);
  const gw = (G - SOL - SAG) / n, bw = Math.min(16, gw * 0.3);
  const cx = (i) => SOL + (i + 0.5) * gw;

  const izgara = [];
  for (let v = alt; v <= ust + adim / 2; v += adim) {
    izgara.push(s("line", { class: v === 0 ? "g-sifir" : "g-izgara", x1: SOL, x2: G - SAG, y1: y(v), y2: y(v) }), s("text", { class: "g-eksen", x: SOL - 6, y: y(v) + 3.5, "text-anchor": "end" }, kisa(v)));
  }
  const cubuklar = seri.map((x, i) => {
    const cubuk = (deger, sinif, x0) => deger > 0 && s("g", {}, s("rect", { class: `g-cubuk ${sinif}`, x: x0, y: y(deger), width: bw, height: Math.max(0, y(0) - y(deger)), rx: 2, style: `--i:${i}` }),
      s("text", { class: "g-deger", transform: `rotate(-90 ${x0 + bw / 2 + 3} ${y(deger) - 4})`, x: x0 + bw / 2 + 3, y: y(deger) - 4, style: `--i:${i}` }, kisa(deger)));
    return s("g", {}, s("title", {}, `${x.etiket}: ${baslik("dash_income_label")} ${para(x.gelir)}, ${baslik("dash_expense_label")} ${para(x.gider)}, ${baslik("dash_net_label")} ${para(x.net)}`),
      cubuk(x.gelir, "gelir", cx(i) - bw - 1), cubuk(x.gider, "gider", cx(i) + 1),
      s("text", { class: "g-eksen g-ay", x: cx(i), y: Y - 10, "text-anchor": "middle" }, x.etiket));
  });
  const noktalar = seri.map((x, i) => `${cx(i)},${y(x.net)}`);
  const cizgi = n > 1 ? `M${noktalar.join(" L")}` : null;
  const alan = n > 1 ? `M${cx(0)},${y(0)} L${noktalar.join(" L")} L${cx(n - 1)},${y(0)} Z` : null;
  const svg = s("svg", { viewBox: `0 0 ${G} ${Y}`, class: "grafik-svg", role: "img", "aria-label": baslik("dash_trend_title"), style: `min-width:${G}px` },
    izgara, alan && s("path", { class: "g-net-alan", d: alan }), cubuklar,
    cizgi && s("path", { class: "g-net", d: cizgi, pathLength: 1 }),
    seri.map((x, i) => s("circle", { class: "g-nokta", cx: cx(i), cy: y(x.net), r: 3.4, style: `--i:${i}` })));
  const kaydir = h("div", { class: "grafik-kaydir" }, svg);
  const kap = h("div", { class: "grafik" }, kaydir,
    h("div", { class: "grafik-lejant" },
      h("span", {}, h("i", { style: `background:${RENK.gelir}` }), baslik("dash_income_label")), h("span", {}, h("i", { style: `background:${RENK.gider}` }), baslik("dash_expense_label")),
      h("span", {}, h("i", { class: "yuvarlak", style: `background:${RENK.net}` }), baslik("dash_net_label"))));
  gorununce(kap, () => { kap.classList.add("calis"); kaydir.scrollLeft = kaydir.scrollWidth; });
  requestAnimationFrame(() => { kaydir.scrollLeft = kaydir.scrollWidth; });
  return kap;
}

// Dönem dağılımı: gelir/gider halkası, ortada net tutar, yanında tutar ve yüzdeler.
export function halkaGrafigi(gelir, gider) {
  const top = gelir + gider;
  const g = (gelir / top) * 100, d = 100 - g, ayrik = g > 0 && d > 0 ? 0.6 : 0;
  const dilim = (uzunluk, renk, baslangic, gec) => uzunluk > 0 && s("circle", { class: "g-dilim", cx: 80, cy: 80, r: 58, fill: "none", stroke: renk, "stroke-width": 22, pathLength: 100,
    "stroke-dasharray": `${Math.max(0, uzunluk - ayrik)} ${100 - Math.max(0, uzunluk - ayrik)}`, transform: `rotate(${-90 + baslangic * 3.6} 80 80)`, style: `--u:${uzunluk};--gec:${gec}s` });
  const net = gelir - gider;
  const yuzde = (v) => `%${((v / top) * 100).toFixed(1).replace(".", ",")}`;
  const kap = h("div", { class: "halka-satir" },
    h("div", { class: "halka" },
      s("svg", { viewBox: "0 0 160 160", role: "img", "aria-label": baslik("dash_pie_title") },
        s("circle", { cx: 80, cy: 80, r: 58, fill: "none", class: "g-halka-arka", "stroke-width": 22 }), dilim(g, "#16a34a", 0, 0), dilim(d, "#dc2626", g, 0.35)),
      h("div", { class: "halka-orta" }, h("span", { class: "soluk" }, baslik("dash_net_label")),       h("strong", { class: net < 0 ? "kirmizi" : "yesil" }, tl0(net)))),
    h("div", { class: "halka-lejant" },
            h("div", {}, h("i", { style: "background:#16a34a" }), h("span", {}, baslik("dash_income_label")), h("strong", {}, tl0(gelir)), h("small", {}, yuzde(gelir))),
            h("div", {}, h("i", { style: "background:#dc2626" }), h("span", {}, baslik("dash_expense_label")), h("strong", {}, tl0(gider)), h("small", {}, yuzde(gider)))));
  const halka = kap.firstChild;
  halka.classList.add("grafik");
  gorununce(halka, () => halka.classList.add("calis"));
  return kap;
}
