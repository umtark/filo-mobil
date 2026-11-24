// Gerçek .xlsx dosyası üretir (bağımlılık yok): hücre biçimleri, kenarlıklar, birleştirme, sütun genişliği, sabit başlık, süzgeç.
// sayfa = { ad, genislik: [karakter], satirlar: [[hucre]], birlestir: [[satir1, sutun1, satir2, sutun2]], dondur: satirSayisi, filtre: [s1, c1, s2, c2], yatay }
// hucre = deger | { v, f (formül, "=" olmadan), b (kalın), renk, arka, kenar, fmt, hiza, dikey, sar, boyut, i (italik) }   (satır/sütun numaraları 1'den başlar)
// sayfa ayrıca: yukseklik { satırNo: punto }, sekmeRenk
const FONT = "Nunito";
const FORMATLAR = { para: "#,##0.00", sayi: "#,##0", ondalik: "0.00", yuzde: "0.00%", metin: "@" };

const kodla = (s) => new TextEncoder().encode(s);
const kacis = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sutunHarfi(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
const adres = (r, c) => sutunHarfi(c) + r;

const CRC_TABLO = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLO[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

// Sıkıştırmasız (store) ZIP: Excel bunu sorunsuz açar.
function zip(dosyalar) {
  const parcalar = [], merkez = [];
  let konum = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const [ad, veri] of dosyalar) {
    const adB = kodla(ad), crc = crc32(veri);
    const ust = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(veri.length), ...u32(veri.length), ...u16(adB.length), ...u16(0)]);
    parcalar.push(ust, adB, veri);
    merkez.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(veri.length), ...u32(veri.length), ...u16(adB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(konum)]), adB);
    konum += ust.length + adB.length + veri.length;
  }
  const merkezBoyut = merkez.reduce((t, p) => t + p.length, 0);
  const son = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(dosyalar.length), ...u16(dosyalar.length), ...u32(merkezBoyut), ...u32(konum), ...u16(0)]);
  const tum = [...parcalar, ...merkez, son];
  const cikti = new Uint8Array(tum.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of tum) { cikti.set(p, o); o += p.length; }
  return cikti;
}

// Stil kayıt defteri: aynı biçim tek kez yazılır.
function stilDefteri() {
  const yazilar = [], dolgular = [], kenarlar = [], formatlar = [], xfler = [];
  const indeks = (liste, anahtar, xml) => {
    let i = liste.findIndex((x) => x.k === anahtar);
    if (i < 0) { liste.push({ k: anahtar, xml }); i = liste.length - 1; }
    return i;
  };
  indeks(yazilar, "0", `<font><sz val="11"/><name val="${FONT}"/></font>`);
  indeks(dolgular, "0", `<fill><patternFill patternType="none"/></fill>`);
  indeks(dolgular, "1", `<fill><patternFill patternType="gray125"/></fill>`);
  indeks(kenarlar, "0", `<border><left/><right/><top/><bottom/><diagonal/></border>`);
  indeks(xfler, "varsayilan", `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`);
  const renk = (r) => String(r).replace("#", "").toUpperCase().padStart(6, "0");
  function stil(o) {
    if (!o) return 0;
    const f = indeks(yazilar, [o.b, o.i, o.renk, o.boyut].join("|"),
      `<font>${o.b ? "<b/>" : ""}${o.i ? "<i/>" : ""}<sz val="${o.boyut || 11}"/>${o.renk ? `<color rgb="FF${renk(o.renk)}"/>` : ""}<name val="${FONT}"/></font>`);
    const d = o.arka ? indeks(dolgular, "d" + o.arka, `<fill><patternFill patternType="solid"><fgColor rgb="FF${renk(o.arka)}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const k = o.kenar ? indeks(kenarlar, "k", `<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>`) : 0;
    const kod = o.fmt ? (FORMATLAR[o.fmt] || o.fmt) : "";
    let fid = 0;
    if (kod) {
      const yerlesik = { "0": 1, "0.00": 2, "#,##0": 3, "#,##0.00": 4, "0.00%": 10, "@": 49 }[kod];
      if (yerlesik) fid = yerlesik;
      else { fid = 164 + indeks(formatlar, kod, `<numFmt numFmtId="${164 + formatlar.length}" formatCode="${kacis(kod)}"/>`); }
    }
    const hiza = o.hiza || o.dikey || o.sar
      ? `<alignment${o.hiza ? ` horizontal="${{ sol: "left", orta: "center", sag: "right" }[o.hiza] || o.hiza}"` : ""} vertical="${o.dikey || "center"}"${o.sar ? ' wrapText="1"' : ""}/>` : "";
    const xml = `<xf numFmtId="${fid}" fontId="${f}" fillId="${d}" borderId="${k}" xfId="0"${fid ? ' applyNumberFormat="1"' : ""} applyFont="1"${d ? ' applyFill="1"' : ""}${k ? ' applyBorder="1"' : ""}${hiza ? ' applyAlignment="1">' + hiza + "</xf>" : "/>"}`;
    return indeks(xfler, xml, xml);
  }
  const xml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + (formatlar.length ? `<numFmts count="${formatlar.length}">${formatlar.map((x) => x.xml).join("")}</numFmts>` : "")
    + `<fonts count="${yazilar.length}">${yazilar.map((x) => x.xml).join("")}</fonts><fills count="${dolgular.length}">${dolgular.map((x) => x.xml).join("")}</fills>`
    + `<borders count="${kenarlar.length}">${kenarlar.map((x) => x.xml).join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="${xfler.length}">${xfler.map((x) => x.xml).join("")}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return { stil, xml };
}

function sayfaXml(sayfa, stil) {
  const satirlar = sayfa.satirlar || [];
  let enGenis = 1;
  const veri = satirlar.map((satir, ri) => {
    enGenis = Math.max(enGenis, satir.length);
    const hucreler = satir.map((h, ci) => {
      if (h === null || h === undefined || h === "") return "";
      const o = typeof h === "object" && !(h instanceof Date) ? h : { v: h };
      const s = stil(o);
      const a = adres(ri + 1, ci + 1), sa = s ? ` s="${s}"` : "";
      if (o.f) return `<c r="${a}"${sa}><f>${kacis(o.f)}</f>${typeof o.v === "number" && Number.isFinite(o.v) ? `<v>${o.v}</v>` : ""}</c>`;
      if (o.v === null || o.v === undefined || o.v === "") return s ? `<c r="${a}"${sa}/>` : "";
      if (typeof o.v === "number" && Number.isFinite(o.v)) return `<c r="${a}"${sa}><v>${o.v}</v></c>`;
      return `<c r="${a}"${sa} t="inlineStr"><is><t xml:space="preserve">${kacis(o.v)}</t></is></c>`;
    }).join("");
    const ht = (sayfa.yukseklik || {})[ri + 1];
    return hucreler || ht ? `<row r="${ri + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${hucreler}</row>` : "";
  }).join("");
  const genislik = sayfa.genislik || [];
  const cols = genislik.length ? `<cols>${genislik.map((g, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(6, g))}" customWidth="1"/>`).join("")}</cols>` : "";
  const dondur = sayfa.dondur ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sayfa.dondur}" topLeftCell="A${sayfa.dondur + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const f = sayfa.filtre;
  const filtre = f ? `<autoFilter ref="${adres(f[0], f[1])}:${adres(f[2], f[3])}"/>` : "";
  const bir = (sayfa.birlestir || []).filter((b) => b[0] !== b[2] || b[1] !== b[3]);
  const birlestir = bir.length ? `<mergeCells count="${bir.length}">${bir.map((b) => `<mergeCell ref="${adres(b[0], b[1])}:${adres(b[2], b[3])}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr>${sayfa.sekmeRenk ? `<tabColor rgb="FF${String(sayfa.sekmeRenk).replace("#", "").toUpperCase()}"/>` : ""}<pageSetUpPr fitToPage="1"/></sheetPr>`
    + `<dimension ref="A1:${adres(Math.max(1, satirlar.length), enGenis)}"/>${dondur}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${veri}</sheetData>${filtre}${birlestir}`
    + `<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sayfa.yatay === false ? "portrait" : "landscape"}" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const sayfaAdi = (ad, i, kullanilan) => {
  let s = String(ad || `Sayfa${i + 1}`).replace(/[\[\]:*?/\\]/g, "-").slice(0, 31) || `Sayfa${i + 1}`;
  let n = 2;
  while (kullanilan.has(s.toLowerCase())) s = `${s.slice(0, 28)}_${n++}`;
  kullanilan.add(s.toLowerCase());
  return s;
};

export function xlsxUret(sayfalar) {
  const def = stilDefteri();
  const kullanilan = new Set();
  const adlar = sayfalar.map((s, i) => sayfaAdi(s.ad, i, kullanilan));
  const dosyalar = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${adlar.map((a, i) => `<sheet name="${kacis(a)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ];
  const sayfaDosyalari = sayfalar.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sayfaXml(s, def.stil)]);
  dosyalar.push(["xl/styles.xml", def.xml()], ...sayfaDosyalari);   // stiller sayfalar yazıldıktan sonra tamamlanır
  return zip(dosyalar.map(([ad, x]) => [ad, kodla(x)]));
}
