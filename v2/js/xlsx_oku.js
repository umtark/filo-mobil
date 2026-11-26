// .xlsx okuyucu (ek kütüphane yok): zip merkez dizini + DecompressionStream("deflate-raw"). İlk sayfayı satır dizileri olarak döndürür.
// Tarih biçimli hücreler Date, sayılar number, metinler string olur; boş hücre null. (Eski .xls için xls_oku.js; şifreli dosyalar desteklenmez.)

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const metinCoz = (b) => new TextDecoder("utf-8").decode(b);

async function ac(veri, yontem) {
  if (yontem === 0) return veri;
  if (yontem !== 8) throw new Error("Dosya sıkıştırma yöntemi desteklenmiyor.");
  if (typeof DecompressionStream === "undefined") throw new Error("Bu tarayıcı Excel dosyasını açamıyor. Tarayıcıyı güncelleyin.");
  const akis = new Blob([veri]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(akis).arrayBuffer());
}

function zipDizini(b) {
  let son = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (u32(b, i) === 0x06054b50) { son = i; break; }
  if (son < 0) throw new Error("Bu dosya geçerli bir .xlsx değil.");
  const adet = u16(b, son + 10);
  let konum = u32(b, son + 16);
  const dizin = new Map();
  for (let n = 0; n < adet; n++) {
    if (u32(b, konum) !== 0x02014b50) break;
    const yontem = u16(b, konum + 10), boyut = u32(b, konum + 20), ad = u16(b, konum + 28), ek = u16(b, konum + 30), yorum = u16(b, konum + 32), yerel = u32(b, konum + 42);
    dizin.set(metinCoz(b.subarray(konum + 46, konum + 46 + ad)), { yontem, boyut, yerel });
    konum += 46 + ad + ek + yorum;
  }
  return dizin;
}

async function oku(b, dizin, ad) {
  const e = dizin.get(ad);
  if (!e) return null;
  const n = u16(b, e.yerel + 26), m = u16(b, e.yerel + 28);
  const bas = e.yerel + 30 + n + m;
  return ac(b.subarray(bas, bas + e.boyut), e.yontem);
}

const xml = (bayt) => new DOMParser().parseFromString(metinCoz(bayt), "application/xml");
const etiketler = (kok, ad) => Array.from(kok.getElementsByTagName(ad));

function ortakMetinler(d) {
  return etiketler(d, "si").map((si) => etiketler(si, "t").filter((t) => !t.parentNode || t.parentNode.nodeName !== "rPh").map((t) => t.textContent).join(""));
}

const YERLESIK_TARIH = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
// Biçim numarası ve (özel biçimse) biçim kodu tarih/saat gösteriyorsa true.
export function tarihFormatiMi(id, kod = "") {
  if (YERLESIK_TARIH.has(id)) return true;
  const temiz = String(kod || "").replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(temiz) && !/^(general|genel)$/i.test(temiz.trim());
}
function tarihStilleri(d) {
  const ozel = new Map();
  for (const f of etiketler(d, "numFmt")) ozel.set(Number(f.getAttribute("numFmtId")), f.getAttribute("formatCode") || "");
  const tarihMi = (id) => tarihFormatiMi(id, ozel.get(id));
  const xfler = d.getElementsByTagName("cellXfs")[0];
  return xfler ? Array.from(xfler.getElementsByTagName("xf")).map((x) => tarihMi(Number(x.getAttribute("numFmtId") || 0))) : [];
}

// Excel seri numarası -> yerel Date (gün + saat)
export function seriTarih(seri) {
  const ms = Math.round((seri - 25569) * 86400) * 1000;
  const u = new Date(ms);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

const sutunNo = (ref) => {
  let n = 0;
  for (const c of ref.replace(/[^A-Z]/gi, "").toUpperCase()) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
};

export async function xlsxOku(dosya) {
  const b = new Uint8Array(await dosya.arrayBuffer());
  const dizin = zipDizini(b);
  const calisma = await oku(b, dizin, "xl/workbook.xml");
  if (!calisma) throw new Error("Bu dosya geçerli bir .xlsx değil.");
  const kitap = xml(calisma);
  const ilk = etiketler(kitap, "sheet")[0];
  if (!ilk) throw new Error("Dosyada sayfa yok.");
  const rid = ilk.getAttribute("r:id");
  let yol = "xl/worksheets/sheet1.xml";
  const bag = await oku(b, dizin, "xl/_rels/workbook.xml.rels");
  if (bag && rid) {
    const hedef = etiketler(xml(bag), "Relationship").find((r) => r.getAttribute("Id") === rid);
    if (hedef) { const t = hedef.getAttribute("Target") || ""; yol = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, ""); }
  }
  const sayfa = await oku(b, dizin, yol);
  if (!sayfa) throw new Error("Sayfa okunamadı.");
  const ortak = await oku(b, dizin, "xl/sharedStrings.xml");
  const stil = await oku(b, dizin, "xl/styles.xml");
  const metinler = ortak ? ortakMetinler(xml(ortak)) : [];
  const tarihli = stil ? tarihStilleri(xml(stil)) : [];

  const satirlar = [];
  for (const satir of etiketler(xml(sayfa), "row")) {
    const no = Number(satir.getAttribute("r")) - 1;
    const dizi = [];
    for (const h of Array.from(satir.children)) {
      if (h.nodeName !== "c") continue;
      const ref = h.getAttribute("r") || "";
      const s = ref ? sutunNo(ref) : dizi.length;
      const tur = h.getAttribute("t") || "";
      const v = h.getElementsByTagName("v")[0];
      let deger = null;
      if (tur === "inlineStr") deger = etiketler(h, "t").map((t) => t.textContent).join("");
      else if (v && v.textContent !== "") {
        const ham = v.textContent;
        if (tur === "s") deger = metinler[Number(ham)] ?? "";
        else if (tur === "str") deger = ham;
        else if (tur === "b") deger = ham === "1";
        else if (tur === "e") deger = null;
        else { const n = Number(ham); deger = tarihli[Number(h.getAttribute("s") || 0)] && Number.isFinite(n) ? seriTarih(n) : n; }
      }
      dizi[s] = deger;
    }
    for (let i = 0; i < dizi.length; i++) if (dizi[i] === undefined) dizi[i] = null;
    satirlar[no] = dizi;
  }
  for (let i = 0; i < satirlar.length; i++) if (!satirlar[i]) satirlar[i] = [];
  return satirlar;
}
