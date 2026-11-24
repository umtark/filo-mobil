// Gerçek PDF üretir (bağımlılık yok): Nunito TrueType yazı tipi gömülür (Türkçe karakterler), tablolar sayfalara bölünür, başlık satırı her sayfada tekrarlanır.
// Masaüstündeki ReportLab raporlarının düzeni: A4 yatay/dikey, 14 mm kenar, koyu başlık satırı, ince ızgara, altta başlık · © · sayfa no.
const PT = 72 / 25.4;
const mm = (v) => v * PT;
const ascii = (s) => { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; };
const birlestir = (parcalar) => { const o = new Uint8Array(parcalar.reduce((t, p) => t + p.length, 0)); let k = 0; for (const p of parcalar) { o.set(p, k); k += p.length; } return o; };
const fmt = (n) => (Math.round(n * 100) / 100).toString();

// ── TrueType okuyucu: karakter -> glif eşlemesi ve glif genişlikleri ─────────────────────────────
export function ttfOku(bayt, ad = "Font") {
  const dv = new DataView(bayt.buffer, bayt.byteOffset, bayt.byteLength);
  const etiket = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  const tablolar = {};
  for (let i = 0, n = dv.getUint16(4); i < n; i++) { const o = 12 + i * 16; tablolar[etiket(o)] = { o: dv.getUint32(o + 8), u: dv.getUint32(o + 12) }; }
  const head = tablolar.head.o, hhea = tablolar.hhea.o, upem = dv.getUint16(head + 18);
  const sayi = dv.getUint16(tablolar.maxp.o + 4), hm = dv.getUint16(hhea + 34), hmtx = tablolar.hmtx.o;
  const genislik = (g) => dv.getUint16(hmtx + (g < hm ? g : hm - 1) * 4);
  const cmap = new Map();
  const cm = tablolar.cmap.o;
  let secilen = null;
  for (let i = 0, n = dv.getUint16(cm + 2); i < n; i++) {
    const p = dv.getUint16(cm + 4 + i * 8), e = dv.getUint16(cm + 6 + i * 8), o = cm + dv.getUint32(cm + 8 + i * 8), f = dv.getUint16(o);
    if ((p === 3 && e === 10 && f === 12) || (!secilen || secilen.f !== 12) && ((p === 3 && e === 1) || p === 0) && (f === 4 || f === 12)) secilen = { o, f };
  }
  if (!secilen) throw new Error("Yazı tipinde Unicode eşlemesi yok");
  const o = secilen.o;
  if (secilen.f === 4) {
    const sx = dv.getUint16(o + 6) / 2, bitis = o + 14, baslangic = bitis + sx * 2 + 2, delta = baslangic + sx * 2, aralik = delta + sx * 2;
    for (let s = 0; s < sx; s++) {
      const son = dv.getUint16(bitis + s * 2), ilk = dv.getUint16(baslangic + s * 2), d = dv.getInt16(delta + s * 2), ra = dv.getUint16(aralik + s * 2);
      for (let c = ilk; c <= son && c !== 0xffff; c++) {
        let g = 0;
        if (ra === 0) g = (c + d) & 0xffff;
        else { const p = aralik + s * 2 + ra + (c - ilk) * 2; g = dv.getUint16(p); if (g) g = (g + d) & 0xffff; }
        if (g) cmap.set(c, g);
      }
    }
  } else {
    for (let i = 0, n = dv.getUint32(o + 12); i < n; i++) {
      const b = o + 16 + i * 12, ilk = dv.getUint32(b), son = dv.getUint32(b + 4), g0 = dv.getUint32(b + 8);
      for (let c = ilk; c <= son; c++) cmap.set(c, g0 + c - ilk);
    }
  }
  const os2 = tablolar["OS/2"] ? tablolar["OS/2"].o : 0;
  const olcek = 1000 / upem;
  return {
    ad, bayt, upem, sayi, genislik, cmap,
    ascent: Math.round(dv.getInt16(hhea + 4) * olcek), descent: Math.round(dv.getInt16(hhea + 6) * olcek),
    cap: os2 && dv.getUint16(os2) >= 2 ? Math.round(dv.getInt16(os2 + 88) * olcek) : 700,
    kutu: [dv.getInt16(head + 36), dv.getInt16(head + 38), dv.getInt16(head + 40), dv.getInt16(head + 42)].map((v) => Math.round(v * olcek)),
  };
}

// Belgeye bağlı yazı tipi: kullanılan glifleri izler, metni gömülü hex dizisine çevirir.
function yaziTipi(ttf) {
  const kullanilan = new Map();   // glif -> karakter kodu
  const gifOf = (c) => ttf.cmap.get(c) ?? ttf.cmap.get(63) ?? 0;
  const metinGlifleri = (metin) => {
    const g = [];
    for (const ch of String(metin)) {
      let c = ch.codePointAt(0);
      if (c === 0xa0) c = 32;
      if (c < 32 || c > 0xffff) c = c > 0xffff ? 63 : 32;
      const id = gifOf(c);
      kullanilan.set(id, ttf.cmap.has(c) ? c : 63);
      g.push(id);
    }
    return g;
  };
  return {
    ttf, kullanilan,
    olc: (metin, boyut) => metinGlifleri(metin).reduce((t, g) => t + ttf.genislik(g), 0) * boyut / ttf.upem,
    hex: (metin) => metinGlifleri(metin).map((g) => g.toString(16).padStart(4, "0")).join(""),
  };
}

const renkOps = (hex, ek) => {
  const h = String(hex || "#000000").replace("#", "").padStart(6, "0");
  return `${fmt(parseInt(h.slice(0, 2), 16) / 255)} ${fmt(parseInt(h.slice(2, 4), 16) / 255)} ${fmt(parseInt(h.slice(4, 6), 16) / 255)} ${ek}`;
};

async function sikistir(bayt) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const akim = new Blob([bayt]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(akim).arrayBuffer());
  } catch { return null; }
}

export class Belge {
  // secenek: { yatay, regular: Uint8Array, bold: Uint8Array, altSol: "alt bilgi sol metni", sahip }
  constructor({ yatay = true, regular, bold, altSol = "", sahip = "Ümit Arik" }) {
    this.yatay = yatay;
    this.W = mm(yatay ? 297 : 210); this.H = mm(yatay ? 210 : 297);
    this.kenar = mm(14);
    this.f = { n: yaziTipi(ttfOku(regular, "Nunito")), b: yaziTipi(ttfOku(bold || regular, "Nunito-Bold")) };
    this.altSol = altSol; this.sahip = sahip;
    this.sayfalar = []; this.resimler = [];
    this.yeniSayfa();
  }

  get genislik() { return this.W - 2 * this.kenar; }
  get altSinir() { return this.H - this.kenar - mm(2); }

  yeniSayfa() { this.s = { ops: [] }; this.sayfalar.push(this.s); this.y = this.kenar; }
  sigar(yukseklik) { return this.y + yukseklik <= this.altSinir; }
  kosulluSayfaSonu(milim) { if (!this.sigar(mm(milim))) this.yeniSayfa(); }
  bosluk(pt) { this.y += pt; }

  // y: sayfa üstünden aşağı ölçülür; PDF koordinatına çevrilir.
  metin(x, ySatirTabani, metin, { boyut = 10, kalin = false, renk = "#000000", hiza = "sol", genislik = 0 } = {}) {
    if (metin === "" || metin === null || metin === undefined) return;
    const f = kalin ? this.f.b : this.f.n;
    const w = f.olc(metin, boyut);
    const px = hiza === "orta" ? x + (genislik - w) / 2 : hiza === "sag" ? x + genislik - w : x;
    this.s.ops.push(`BT ${renkOps(renk, "rg")} /${kalin ? "F2" : "F1"} ${fmt(boyut)} Tf ${fmt(px)} ${fmt(this.H - ySatirTabani)} Td <${f.hex(metin)}> Tj ET`);
  }
  dikdortgen(x, y, w, h, { dolgu, cizgi, kalinlik = 0.35 } = {}) {
    const ops = [];
    if (dolgu) ops.push(renkOps(dolgu, "rg"));
    if (cizgi) ops.push(renkOps(cizgi, "RG"), `${fmt(kalinlik)} w`);
    ops.push(`${fmt(x)} ${fmt(this.H - y - h)} ${fmt(w)} ${fmt(h)} re ${dolgu && cizgi ? "B" : dolgu ? "f" : "S"}`);
    this.s.ops.push(ops.join(" "));
  }
  cizgi(x1, y1, x2, y2, renk = "#cbd5e1", kalinlik = 0.5) {
    this.s.ops.push(`${renkOps(renk, "RG")} ${fmt(kalinlik)} w ${fmt(x1)} ${fmt(this.H - y1)} m ${fmt(x2)} ${fmt(this.H - y2)} l S`);
  }

  // Pasta dilimi: açılar radyan, 12 yönünden saat yönünde; (cx, cy) sayfa üstünden ölçülür.
  dilim(cx, cy, r, a0, a1, dolgu) {
    const adim = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 24)));
    const nok = [`${fmt(cx)} ${fmt(this.H - cy)} m`];
    for (let i = 0; i <= adim; i++) {
      const a = a0 + (a1 - a0) * i / adim;
      nok.push(`${fmt(cx + r * Math.sin(a))} ${fmt(this.H - cy + r * Math.cos(a))} l`);
    }
    this.s.ops.push(`${renkOps(dolgu, "rg")} ${renkOps("#ffffff", "RG")} 0.8 w ${nok.join(" ")} h B`);
  }
  resim(logo, x, y, w, h) {
    this.resimler.push({ ...logo, sayfa: this.s });
    this.s.ops.push(`q ${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(this.H - y - h)} cm /Im${this.resimler.length} Do Q`);
  }

  satirlaraBol(metin, boyut, kalin, genislik) {
    const f = kalin ? this.f.b : this.f.n;
    const cikti = [];
    for (const parca of String(metin ?? "").split(/\r?\n/)) {
      let satir = "";
      for (const kelime of parca.split(/\s+/).filter(Boolean)) {
        const dene = satir ? `${satir} ${kelime}` : kelime;
        if (f.olc(dene, boyut) <= genislik) { satir = dene; continue; }
        if (satir) { cikti.push(satir); satir = ""; }
        if (f.olc(kelime, boyut) <= genislik) { satir = kelime; continue; }
        let parcaSatir = "";   // genişliğe sığmayan uzun sözcük: karakter karakter böl
        for (const ch of kelime) {
          if (f.olc(parcaSatir + ch, boyut) > genislik && parcaSatir) { cikti.push(parcaSatir); parcaSatir = ""; }
          parcaSatir += ch;
        }
        satir = parcaSatir;
      }
      cikti.push(satir);
    }
    return cikti;
  }

  paragraf(metin, { boyut = 10, kalin = false, renk = "#000000", hiza = "sol", sonrasi = 6 } = {}) {
    const satirlar = this.satirlaraBol(metin, boyut, kalin, this.genislik);
    const aralik = boyut * 1.25;
    for (const s of satirlar) {
      if (!this.sigar(aralik)) this.yeniSayfa();
      this.metin(this.kenar, this.y + boyut, s, { boyut, kalin, renk, hiza, genislik: this.genislik });
      this.y += aralik;
    }
    this.y += sonrasi;
  }
  baslik(metin, boyut = 14) { this.kosulluSayfaSonu(40); this.paragraf(metin, { boyut, kalin: true, sonrasi: 6 }); }

  // Rapor başlığı: logo (sol/sağ, üç boyut) + başlık; ardından firma, dönem, rapor tarihi.
  ustBilgi({ baslik, firma = "", donem = "", logo = null, logoKonum = "sol", logoBoyut = "kucuk", tarih = new Date() }) {
    const kutu = { kucuk: [34, 22], orta: [42, 27], buyuk: [50, 32] }[logoBoyut] || [34, 22];
    const baslikBoyut = logoBoyut === "buyuk" ? 17 : 18;
    const bw = this.genislik, kolon = logo ? mm({ kucuk: 42, orta: 50, buyuk: 58 }[logoBoyut] || 42) : 0;
    const baslikX = logo && logoKonum !== "sag" ? this.kenar + kolon : this.kenar;
    const baslikW = bw - kolon;
    const satirlar = this.satirlaraBol(baslik, baslikBoyut, true, baslikW);
    const yukseklik = Math.max(satirlar.length * baslikBoyut * 1.25, logo ? mm(kutu[1]) : 0);
    const hiza = logoKonum === "sag" ? "sol" : "sag";   // masaüstündeki gibi: logo sağdaysa başlık solda, aksi halde sağa dayalı
    if (logo) {
      const oran = Math.min(mm(kutu[0]) / logo.g, mm(kutu[1]) / logo.y);
      const w = logo.g * oran, h = logo.y * oran;
      const x = logoKonum === "sag" ? this.kenar + bw - w : this.kenar;
      const y = this.y + (yukseklik - h) / 2;
      this.resimler.push({ ...logo, sayfa: this.s });
      this.s.ops.push(`q ${fmt(w)} 0 0 ${fmt(h)} ${fmt(x)} ${fmt(this.H - y - h)} cm /Im${this.resimler.length} Do Q`);
    }
    let y = this.y + (yukseklik - satirlar.length * baslikBoyut * 1.25) / 2;
    for (const s of satirlar) { this.metin(baslikX, y + baslikBoyut, s, { boyut: baslikBoyut, kalin: true, hiza, genislik: baslikW }); y += baslikBoyut * 1.25; }
    this.y += yukseklik + 10;
    if (firma) this.paragraf(`Firma: ${firma}`);
    if (donem) { this.bosluk(6); this.paragraf(`Dönem: ${donem}`); }
    this.bosluk(2);
    const t = tarih, p = (n) => String(n).padStart(2, "0");
    this.paragraf(`Rapor Tarihi: ${p(t.getDate())}.${p(t.getMonth() + 1)}.${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}`, { sonrasi: 8 });
  }

  // sutunlar: [{ b: başlık, g: sabit genişlik (mm) | a: esneklik ağırlığı, hiza: "sol"|"orta"|"sag" }]
  // hücre: metin | { m, renk, kalin, arka, hiza, boyut, span (yan hücreleri birleştirir), kenarRenk, kenarKalinlik, solKalin, altKalin }
  // zebra: ["#fff", "#f1f5f9"] (hücrede arka yoksa satır sırasına göre), baslikBoyut: başlık yazı boyutu, baslikYok: başlık satırı çizilmez
  tablo({ sutunlar, satirlar, baslikArka = "#334155", baslikRenk = "#ffffff", boyut = 9, baslikBoyut = 0, genislikMm = 0, toplam = null, toplamArka = "#f1f5f9", hizala = "sol", ortala = true, zebra = null, baslikYok = false, grid = "#cbd5e1", padXmm = 1.6, padYmm = 1.2, cift = 1 }) {
    const sayi = sutunlar.length;
    const toplamGenislik = genislikMm ? mm(genislikMm) : this.genislik;
    const sabit = sutunlar.reduce((t, c) => t + (c.g ? mm(c.g) : 0), 0);
    const esnekToplam = sutunlar.reduce((t, c) => t + (c.g ? 0 : (c.a || 1)), 0) || 1;
    const kalan = Math.max(mm(20) * sayi * 0.3, toplamGenislik - sabit);
    const w = sutunlar.map((c) => (c.g ? mm(c.g) : kalan * (c.a || 1) / esnekToplam));
    const olcek = toplamGenislik / w.reduce((t, x) => t + x, 0);
    for (let i = 0; i < w.length; i++) w[i] *= olcek;
    const padX = mm(padXmm), padY = mm(padYmm);
    const x0 = hizala === "sol" ? this.kenar : this.kenar + (this.genislik - toplamGenislik) / 2;
    const bBoyut = baslikBoyut || boyut;
    // Birleştirilen hücre ilk hücrenin üzerine yazılır; kapsadığı hücreler satırdan çıkarılır.
    const satirHazirla = (hucreler, baslikMi, sira = 0) => {
      const sonuc = [];
      for (let i = 0; i < hucreler.length; i++) {
        const h = hucreler[i];
        const o = h !== null && typeof h === "object" ? h : { m: h };
        const kapsam = Math.max(1, Math.min(o.span || 1, hucreler.length - i));
        const genis = w.slice(i, i + kapsam).reduce((t, x) => t + x, 0);
        const metin = o.m === null || o.m === undefined ? "" : String(o.m);
        const kalin = baslikMi || Boolean(o.kalin);
        const yb = baslikMi ? bBoyut : o.boyut || boyut;
        const arka = baslikMi ? baslikArka : o.arka || (zebra && sira >= 0 ? zebra[sira % zebra.length] : null);
        sonuc.push({ ...o, metin, kalin, arka, yb, kolon: i, w: genis, satirlar: this.satirlaraBol(metin, yb, kalin, genis - 2 * padX) });
        i += kapsam - 1;
      }
      return sonuc;
    };
    const yukseklik = (r) => Math.max(...r.map((c) => c.satirlar.length * c.yb * 1.25)) + 2 * padY;
    const ciz = (r, baslikMi) => {
      const yk = yukseklik(r);
      let x = x0;
      for (const c of r) {
        if (c.altYok || c.ustYok) {   // iki satıra yayılmış hücre görünümü: aradaki yatay çizgi çizilmez
          const kr = c.kenarRenk || grid, kk = c.kenarKalinlik || 0.35;
          this.dikdortgen(x, this.y, c.w, yk, { dolgu: c.arka || null });
          this.cizgi(x, this.y, x, this.y + yk, kr, kk); this.cizgi(x + c.w, this.y, x + c.w, this.y + yk, kr, kk);
          if (!c.ustYok) this.cizgi(x, this.y, x + c.w, this.y, kr, kk);
          if (!c.altYok) this.cizgi(x, this.y + yk, x + c.w, this.y + yk, kr, kk);
        } else this.dikdortgen(x, this.y, c.w, yk, { dolgu: c.arka || null, cizgi: c.kenarRenk || grid, kalinlik: c.kenarKalinlik || 0.35 });
        const hiza = c.hiza || sutunlar[c.kolon].hiza || (ortala ? "orta" : "sol");
        const arl = c.yb * 1.25, blok = c.satirlar.length * arl;
        let yy = this.y + (yk - blok) / 2;
        for (const s of c.satirlar) {
          this.metin(x + padX, yy + arl * 0.5 + c.yb * 0.35, s, { boyut: c.yb, kalin: c.kalin, renk: baslikMi ? baslikRenk : c.renk || "#000000", hiza, genislik: c.w - 2 * padX });
          yy += arl;
        }
        if (c.solKalin) this.cizgi(x, this.y, x, this.y + yk, "#1e293b", 1.2);
        if (c.altKalin) this.cizgi(x, this.y + yk, x + c.w, this.y + yk, "#000000", 1.5);
        x += c.w;
      }
      this.y += yk;
    };
    const baslikSatiri = baslikYok ? null : satirHazirla(sutunlar.map((c) => c.b), true);
    const govde = satirlar.map((r, i) => satirHazirla(r, false, i));
    if (toplam) govde.push(satirHazirla(toplam.map((h) => (h !== null && typeof h === "object" ? { arka: toplamArka, ...h, kalin: true } : { m: h, arka: toplamArka, kalin: true })), false, -1));
    if (!this.sigar((baslikSatiri ? yukseklik(baslikSatiri) : 0) + (govde[0] ? yukseklik(govde[0]) : 0))) this.yeniSayfa();
    if (baslikSatiri) ciz(baslikSatiri, true);
    for (let i = 0; i < govde.length; i += cift) {   // cift: birlikte sayfalanacak satır sayısı (iki satırlı kayıtlar)
      const grup = govde.slice(i, i + cift);
      if (!this.sigar(grup.reduce((t, r) => t + yukseklik(r), 0))) { this.yeniSayfa(); if (baslikSatiri) ciz(baslikSatiri, true); }
      for (const r of grup) ciz(r, false);
    }
    this.y += 6;
  }

  // İki sütunlu özet tablosu (masaüstündeki "Genel Finansal Durum" kutusu).
  ozet({ baslik, sagBaslik = "Tutar", satirlar, baslikArka = "#0f766e", genislikMm = 165 }) {
    this.kosulluSayfaSonu(40);
    this.tablo({ sutunlar: [{ b: baslik, g: genislikMm * 0.67, hiza: "sol" }, { b: sagBaslik, g: genislikMm * 0.33, hiza: "sag" }], satirlar, baslikArka, genislikMm, ortala: false });
  }

  async bitir() {
    const toplam = this.sayfalar.length;
    const yil = new Date().getFullYear();
    this.sayfalar.forEach((s, i) => {
      this.s = s;
      const y = this.H - mm(8) + 8 * 0;   // taban çizgisi: alttan 8 mm
      const koy = (x, txt, hiza, w) => this.metin(x, this.H - mm(8), txt, { boyut: 8, renk: "#64748b", hiza, genislik: w });
      koy(this.kenar, this.altSol, "sol", this.genislik);
      koy(this.kenar, `© ${yil <= 2026 ? "2026" : "2026 - " + yil} ${this.sahip}`, "orta", this.genislik);
      koy(this.kenar, `Sayfa ${i + 1} / ${toplam}`, "sag", this.genislik);
      void y;
    });

    const nesneler = [];   // her biri Uint8Array (nesnenin gövdesi)
    const ekle = (govde) => { nesneler.push(typeof govde === "string" ? ascii(govde) : govde); return nesneler.length; };
    const akim = async (sozluk, bayt, sikistirilsin = true) => {
      const z = sikistirilsin ? await sikistir(bayt) : null;
      const veri = z || bayt;
      return ekle(birlestir([ascii(`<< ${sozluk}${z ? " /Filter /FlateDecode" : ""} /Length ${veri.length} >>\nstream\n`), veri, ascii("\nendstream")]));
    };
    const katalog = ekle("");   // 1: yer tutucu
    const sayfaAgaci = ekle("");   // 2: yer tutucu

    async function fontNesnesi(f, ad) {
      const t = f.ttf, olcek = 1000 / t.upem;
      const dosya = await akim(`/Length1 ${t.bayt.length}`, t.bayt);
      const tanimlayici = ekle(`<< /Type /FontDescriptor /FontName /${ad} /Flags 4 /FontBBox [${t.kutu.join(" ")}] /ItalicAngle 0 /Ascent ${t.ascent} /Descent ${t.descent} /CapHeight ${t.cap} /StemV 80 /FontFile2 ${dosya} 0 R >>`);
      const glifler = [...f.kullanilan.keys()].sort((a, b) => a - b);
      const gen = glifler.map((g) => `${g} [${Math.round(t.genislik(g) * olcek)}]`).join(" ");
      const cid = ekle(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${ad} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${tanimlayici} 0 R /DW 1000 /W [${gen}] /CIDToGIDMap /Identity >>`);
      let bf = "";
      for (let i = 0; i < glifler.length; i += 100) {
        const dilim = glifler.slice(i, i + 100);
        bf += `${dilim.length} beginbfchar\n${dilim.map((g) => `<${g.toString(16).padStart(4, "0")}> <${f.kullanilan.get(g).toString(16).padStart(4, "0")}>`).join("\n")}\nendbfchar\n`;
      }
      const cmap = await akim("", ascii(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${bf}endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`));
      return ekle(`<< /Type /Font /Subtype /Type0 /BaseFont /${ad} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${cmap} 0 R >>`);
    }
    const f1 = await fontNesnesi(this.f.n, "Nunito");
    const f2 = await fontNesnesi(this.f.b, "Nunito-Bold");
    const resimNo = [];
    for (const r of this.resimler) resimNo.push(await akim(`/Type /XObject /Subtype /Image /Width ${r.g} /Height ${r.y} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, r.jpeg, false));
    const sayfaNo = [];
    for (const s of this.sayfalar) {
      const icerik = await akim("", ascii(s.ops.join("\n")));
      const kullanilan = this.resimler.map((r, i) => (r.sayfa === s ? `/Im${i + 1} ${resimNo[i]} 0 R` : "")).filter(Boolean).join(" ");
      sayfaNo.push(ekle(`<< /Type /Page /Parent ${sayfaAgaci} 0 R /MediaBox [0 0 ${fmt(this.W)} ${fmt(this.H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${kullanilan ? ` /XObject << ${kullanilan} >>` : ""} >> /Contents ${icerik} 0 R >>`));
    }
    nesneler[katalog - 1] = ascii(`<< /Type /Catalog /Pages ${sayfaAgaci} 0 R >>`);
    nesneler[sayfaAgaci - 1] = ascii(`<< /Type /Pages /Kids [${sayfaNo.map((n) => `${n} 0 R`).join(" ")}] /Count ${sayfaNo.length} >>`);

    const parcalar = [ascii("%PDF-1.5\n%\xe2\xe3\xcf\xd3\n")];
    let konum = parcalar[0].length;
    const konumlar = [];
    nesneler.forEach((g, i) => {
      const p = [ascii(`${i + 1} 0 obj\n`), g, ascii("\nendobj\n")];
      konumlar.push(konum);
      for (const x of p) { parcalar.push(x); konum += x.length; }
    });
    const xref = `xref\n0 ${nesneler.length + 1}\n0000000000 65535 f \n${konumlar.map((k) => `${String(k).padStart(10, "0")} 00000 n \n`).join("")}`;
    parcalar.push(ascii(`${xref}trailer\n<< /Size ${nesneler.length + 1} /Root ${katalog} 0 R >>\nstartxref\n${konum}\n%%EOF`));
    return birlestir(parcalar);
  }
}
