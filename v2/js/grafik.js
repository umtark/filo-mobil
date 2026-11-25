// Ana sayfa grafikleri ve sayaç animasyonu. shadcn/ui Charts ve Tremor kurallarıyla: seri renkleri belirteçlerden (--g-gelir, --g-gider, --g-net),
// dokununca ayrıntı okuması (tooltip karşılığı), lejant, ince ızgara, alan dolgusu. Çizim SVG; animasyonlar CSS geçişi ve hareket azaltmada kapanır.
import { h } from "./ui.js";
import { para, sayiYaz, ayAdi } from "./bicim.js";
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

// Öğeye .calis sınıfını görününce ekler; CSS geçişleri bu sınıfla başlar.
export const canlandir = (el) => gorununce(el, () => el.classList.add("calis"));

// Sayıyı önceki değerinden hedefe doğru sayarak gösterir. yaz(değer, bitti): metni üretir.
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
      el.textContent = p < 1 ? yaz(baslangic + (hedef - baslangic) * (1 - (1 - p) ** 4), false) : yaz(hedef, true);
      if (p < 1) requestAnimationFrame(adim);
    };
    requestAnimationFrame(adim);
  });
}
export const tl0 = (v) => para(Math.round(v));
export const paraSayaci = (el, hedef) => sayac(el, hedef, (v) => tl0(v));
export const adetSayaci = (el, hedef, ek = "") => sayac(el, hedef, (v) => `${sayiYaz(Math.round(v))}${ek}`, { sure: 1200 });

export const kisa = (v) => {
  const m = Math.abs(v), kes = (x) => x.toFixed(1).replace(/\.0$/, "");
  const x = m >= 1e6 ? `${kes(m / 1e6)}M` : m >= 1e3 ? `${m >= 1e5 ? Math.round(m / 1e3) : kes(m / 1e3)}K` : String(Math.round(m));
  return v < 0 ? `-${x}` : x;
};
const guzelAdim = (x) => { const p = 10 ** Math.floor(Math.log10(Math.max(x, 1))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

let sayi = 0;

// Aylık gelir/gider sütunları (üstünde değer), net çizgisi ve altında gradyan alan dolgusu. Bir aya dokununca ayın tutarları üstte okunur.
// seri: [{ ay, etiket, gelir, gider, net }]
export function trendGrafigi(seri) {
  const n = seri.length;
  const KOL = 46, G = Math.max(320, n * KOL + 44), Y = 244, SOL = 38, SAG = 6, UST = 34, ALT = 38;
  const enBuyuk = Math.max(1, ...seri.flatMap((x) => [x.gelir, x.gider]));
  const enKucuk = Math.min(0, ...seri.map((x) => x.net));
  const adim = guzelAdim((enBuyuk - enKucuk) / 3);
  const ust = Math.ceil(enBuyuk / adim) * adim, alt = enKucuk < 0 ? Math.floor(enKucuk / adim) * adim : 0;
  const y = (v) => UST + ((ust - v) / (ust - alt)) * (Y - UST - ALT);
  const gw = (G - SOL - SAG) / n, bw = Math.min(13, gw * 0.3);
  const cx = (i) => SOL + (i + 0.5) * gw;
  const kimlik = `g-alan-${++sayi}`;
  let secili = seri.reduce((son, x, i) => (x.gelir || x.gider ? i : son), n - 1);

  const izgara = [];
  for (let v = alt; v <= ust + adim / 2; v += adim) {
    izgara.push(s("line", { class: v === 0 ? "g-sifir" : "g-izgara", x1: SOL, x2: G - SAG, y1: y(v), y2: y(v) }), s("text", { class: "g-eksen", x: SOL - 8, y: y(v) + 3.5, "text-anchor": "end" }, kisa(v)));
  }
  const cubuk = (deger, sinif, x0, i) => {
    if (deger <= 0) return null;
    const ust0 = y(deger), yuk = Math.max(0, y(0) - ust0);
    // üstü yuvarlak, tabanı düz sütun
    const r = Math.min(4, bw / 2, yuk);
    const yol = `M${x0},${y(0)} V${ust0 + r} Q${x0},${ust0} ${x0 + r},${ust0} H${x0 + bw - r} Q${x0 + bw},${ust0} ${x0 + bw},${ust0 + r} V${y(0)} Z`;
    return s("g", {}, s("path", { class: `g-cubuk ${sinif}`, d: yol, style: `--i:${i}` }),
      s("text", { class: "g-deger", transform: `rotate(-90 ${x0 + bw / 2 + 3.2} ${ust0 - 5})`, x: x0 + bw / 2 + 3.2, y: ust0 - 5 }, kisa(deger)));
  };
  const kolonlar = seri.map((x, i) => {
    const yil = i === 0 || x.ay.endsWith("-01") ? `'${x.ay.slice(2, 4)}` : null;
    return s("g", { class: "g-kolon", role: "button", tabindex: 0, "aria-label": `${ayAdi(x.ay)}: ${baslik("dash_income_label")} ${tl0(x.gelir)}, ${baslik("dash_expense_label")} ${tl0(x.gider)}, ${baslik("dash_net_label")} ${tl0(x.net)}` },
      s("rect", { class: "g-bant", x: cx(i) - gw / 2 + 1, y: 4, width: gw - 2, height: Y - 8, rx: 8 }),
      cubuk(x.gelir, "gelir", cx(i) - bw - 1.5, i), cubuk(x.gider, "gider", cx(i) + 1.5, i),
      s("text", { class: "g-eksen g-ay", x: cx(i), y: Y - 20, "text-anchor": "middle" }, x.etiket.slice(0, 3)),
      yil && s("text", { class: "g-eksen g-yil", x: cx(i), y: Y - 7, "text-anchor": "middle" }, yil),
      s("rect", { class: "g-hedef", x: cx(i) - gw / 2, y: 0, width: gw, height: Y }));
  });
  const noktalar = seri.map((x, i) => `${cx(i)},${y(x.net)}`);
  const alan = n > 1 && `M${cx(0)},${y(0)} L${noktalar.join(" L")} L${cx(n - 1)},${y(0)} Z`;
  const svg = s("svg", { viewBox: `0 0 ${G} ${Y}`, class: "grafik-svg", role: "group", "aria-label": baslik("dash_trend_title"), style: `min-width:${G}px` },
    s("defs", {}, s("linearGradient", { id: kimlik, x1: 0, y1: 0, x2: 0, y2: 1 }, s("stop", { offset: "0%", class: "g-alan-baslangic" }), s("stop", { offset: "100%", class: "g-alan-bitis" }))),
    izgara, alan && s("path", { class: "g-net-alan", d: alan, fill: `url(#${kimlik})` }), kolonlar,
    n > 1 && s("path", { class: "g-net", d: `M${noktalar.join(" L")}`, pathLength: 1 }),
    seri.map((x, i) => s("circle", { class: "g-nokta", cx: cx(i), cy: y(x.net), r: 3.6 })));

  const hucre = (ad, sinif) => { const deger = h("strong", {}); return { deger, el: h("div", { class: `g-okuma-hucre ${sinif}` }, h("span", {}, ad), deger) }; };
  const gelir = hucre(baslik("dash_income_label"), "gelir"), gider = hucre(baslik("dash_expense_label"), "gider"), net = hucre(baslik("dash_net_label"), "net");
  const donem = h("span", { class: "g-okuma-ay" });
  const okuma = h("div", { class: "g-okuma", "aria-live": "polite" }, donem, h("div", { class: "g-okuma-izgara" }, gelir.el, gider.el, net.el));
  const kolonEl = [...svg.querySelectorAll(".g-kolon")], noktaEl = [...svg.querySelectorAll(".g-nokta")];
  function sec(i) {
    secili = i;
    const x = seri[i];
    donem.textContent = ayAdi(x.ay);
    gelir.deger.textContent = tl0(x.gelir);
    gider.deger.textContent = tl0(x.gider);
    net.deger.textContent = tl0(x.net);
    kolonEl.forEach((k, j) => k.classList.toggle("secili", j === i));
    noktaEl.forEach((k, j) => k.classList.toggle("secili", j === i));
  }
  kolonEl.forEach((k, i) => {
    k.addEventListener("click", () => sec(i));
    k.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sec(i); } });
  });
  sec(secili);

  const kaydir = h("div", { class: "grafik-kaydir" }, svg);
  const lejant = h("div", { class: "grafik-lejant" },
    h("span", {}, h("i", { class: "gelir" }), baslik("dash_income_label")), h("span", {}, h("i", { class: "gider" }), baslik("dash_expense_label")), h("span", {}, h("i", { class: "net" }), baslik("dash_net_label")));
  const kap = h("div", { class: "grafik" }, okuma, kaydir, lejant);
  gorununce(kap, () => { kap.classList.add("calis"); kaydir.scrollLeft = kaydir.scrollWidth; });
  requestAnimationFrame(() => { kaydir.scrollLeft = kaydir.scrollWidth; });
  return kap;
}

// Dönem dağılımı: gelir/gider halkası, ortada net tutar, yanında tutar ve yüzde (Tremor DonutChart düzeni).
export function halkaGrafigi(gelir, gider) {
  const top = gelir + gider;
  const g = (gelir / top) * 100, d = 100 - g, ayrik = g > 0 && d > 0 ? 1 : 0;
  const yuzde = (v) => `%${((v / top) * 100).toFixed(1).replace(".", ",")}`;
  const R = 56;
  const dilim = (uzunluk, sinif, baslangic, gec) => uzunluk > 0 && s("circle", { class: `g-dilim ${sinif}`, cx: 80, cy: 80, r: R, fill: "none", "stroke-width": 20, pathLength: 100,
    "stroke-dasharray": `${Math.max(0, uzunluk - ayrik)} ${100 - Math.max(0, uzunluk - ayrik)}`, transform: `rotate(${-90 + baslangic * 3.6} 80 80)`, style: `--u:${uzunluk};--gec:${gec}s` });
  const net = gelir - gider;
  const satir = (ad, sinif, deger) => h("div", { class: `halka-satir ${sinif}` }, h("i"), h("span", {}, ad), h("strong", {}, tl0(deger)), h("small", {}, yuzde(deger)));
  const kap = h("div", { class: "halka-kap grafik" },
    h("div", { class: "halka", role: "img", "aria-label": `${baslik("dash_pie_title")}: ${baslik("dash_income_label")} ${yuzde(gelir)}, ${baslik("dash_expense_label")} ${yuzde(gider)}` },
      s("svg", { viewBox: "0 0 160 160", "aria-hidden": "true" }, s("circle", { class: "g-halka-arka", cx: 80, cy: 80, r: R, fill: "none", "stroke-width": 20 }), dilim(g, "gelir", 0, 0), dilim(d, "gider", g, 0.3)),
      h("div", { class: "halka-orta" }, h("span", {}, baslik("dash_net_label")), h("strong", { class: net < 0 ? "kirmizi" : "yesil", title: tl0(net) }, `${net < 0 ? "-" : ""}₺${kisa(Math.abs(net))}`))),
    h("div", { class: "halka-lejant" }, satir(baslik("dash_income_label"), "gelir", gelir), satir(baslik("dash_expense_label"), "gider", gider)));
  canlandir(kap);
  return kap;
}
