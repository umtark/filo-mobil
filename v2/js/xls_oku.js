// Eski .xls (Excel 97-2003, OLE2 + BIFF8) okuyucu; ek kütüphane yok. xlsx_oku.js ile aynı sonucu verir:
// ilk sayfa satır dizileri; tarih biçimli hücreler Date, sayılar number, metinler string, boş hücre null.
import { xlsxOku, seriTarih, tarihFormatiMi } from "./xlsx_oku.js";

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const i32 = (b, i) => u32(b, i) | 0;
const SON = 0xFFFFFFFE;

// ── OLE2 kapsayıcı: "Workbook" akışını çıkarır ──────────────────────────────
function akisCikar(b) {
  const ims = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (b.length < 512 || ims.some((x, i) => b[i] !== x)) throw new Error("Bu dosya geçerli bir .xls değil.");
  const sek = 1 << u16(b, 0x1E), mini = 1 << u16(b, 0x20);
  const sekBaslangic = (n) => (n + 1) * sek;
  const sektor = (n) => b.subarray(sekBaslangic(n), sekBaslangic(n) + sek);

  const fatSektorleri = [];
  for (let i = 0; i < 109; i++) { const n = u32(b, 0x4C + i * 4); if (n < SON) fatSektorleri.push(n); }
  let difat = u32(b, 0x44);
  for (let k = u32(b, 0x48); k > 0 && difat < SON; k--) {
    const s = sektor(difat);
    for (let i = 0; i < sek / 4 - 1; i++) { const n = u32(s, i * 4); if (n < SON) fatSektorleri.push(n); }
    difat = u32(s, sek - 4);
  }
  const fat = [];
  for (const n of fatSektorleri) { const s = sektor(n); for (let i = 0; i < sek / 4; i++) fat.push(u32(s, i * 4)); }

  const zincir = (ilk) => { const l = []; for (let n = ilk, g = 0; n < SON && g < 1e6; n = fat[n], g++) l.push(n); return l; };
  const birlestir = (parcalar) => {
    const cikti = new Uint8Array(parcalar.reduce((t, p) => t + p.length, 0));
    let k = 0;
    for (const p of parcalar) { cikti.set(p, k); k += p.length; }
    return cikti;
  };
  const oku = (ilk) => birlestir(zincir(ilk).map(sektor));

  const dizin = oku(u32(b, 0x30));
  const girdiler = [];
  for (let i = 0; i + 128 <= dizin.length; i += 128) {
    const uz = u16(dizin, i + 64);
    const ad = new TextDecoder("utf-16le").decode(dizin.subarray(i, i + Math.max(0, uz - 2)));
    girdiler.push({ ad, tur: dizin[i + 66], ilk: u32(dizin, i + 116), boyut: u32(dizin, i + 120) });
  }
  const kitap = girdiler.find((g) => g.tur === 2 && /^(Workbook|Book)$/i.test(g.ad));
  if (!kitap) throw new Error("Excel sayfası bulunamadı (şifreli ya da bozuk .xls).");
  if (kitap.boyut >= u32(b, 0x38)) return oku(kitap.ilk).subarray(0, kitap.boyut);

  const kok = girdiler[0];
  const miniAkis = oku(kok.ilk);
  const miniFat = [];
  const mf = oku(u32(b, 0x3C));
  for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i));
  const parcalar = [];
  for (let n = kitap.ilk, g = 0; n < SON && g < 1e6; n = miniFat[n], g++) parcalar.push(miniAkis.subarray(n * mini, n * mini + mini));
  return birlestir(parcalar).subarray(0, kitap.boyut);
}

// ── BIFF8 kayıtları ─────────────────────────────────────────────────────────
function kayitlar(w) {
  const l = [];
  for (let i = 0; i + 4 <= w.length;) {
    const id = u16(w, i), n = u16(w, i + 2);
    l.push({ id, konum: i, veri: w.subarray(i + 4, i + 4 + n) });
    i += 4 + n;
  }
  return l;
}

// Kayıt ardışık parçalara (CONTINUE) bölünmüş olabilir; dizge devam parçasında 1 baytlık kodlama bayrağı yeniden başlar.
class Okuyucu {
  constructor(parcalar) { this.p = parcalar; this.i = 0; this.k = 0; }
  bitti() { return this.i >= this.p.length; }
  kalan() { return this.p[this.i].length - this.k; }
  sonraki() { this.i++; this.k = 0; }
  bayt() { if (this.kalan() <= 0) this.sonraki(); return this.p[this.i][this.k++]; }
  u16() { const a = this.bayt(); return a | (this.bayt() << 8); }
  u32() { const a = this.u16(); return (a | (this.u16() << 16)) >>> 0; }
  atla(n) {
    while (n > 0 && !this.bitti()) {
      const t = Math.min(n, this.kalan());
      if (t <= 0) { this.sonraki(); continue; }
      this.k += t; n -= t;
    }
  }
  dizge() {
    const cch = this.u16(), bayrak = this.bayt();
    return this.dizgeGovdesi(cch, bayrak);
  }
  dizgeGovdesi(cch, bayrak) {
    let genis = bayrak & 1;
    const zengin = bayrak & 8, uzun = bayrak & 4;
    const calisma = zengin ? this.u16() : 0;
    const ek = uzun ? this.u32() : 0;
    let s = "";
    let kalanKarakter = cch;
    while (kalanKarakter > 0) {
      if (this.kalan() <= 0) { this.sonraki(); if (this.bitti()) break; genis = this.p[this.i][this.k++] & 1; continue; }
      const bayt = genis ? 2 : 1;
      const sigan = Math.min(kalanKarakter, Math.floor(this.kalan() / bayt));
      if (sigan <= 0) { this.sonraki(); if (this.bitti()) break; genis = this.p[this.i][this.k++] & 1; continue; }
      const d = this.p[this.i].subarray(this.k, this.k + sigan * bayt);
      s += genis ? new TextDecoder("utf-16le").decode(d) : Array.from(d, (c) => String.fromCharCode(c)).join("");
      this.k += sigan * bayt; kalanKarakter -= sigan;
    }
    this.atla(calisma * 4 + ek);
    return s;
  }
}

// Düz (tek parçalı) kayıttaki dizge: cch u16, bayrak u8, ...
const kayitDizgesi = (veri, konum) => {
  const o = new Okuyucu([veri.subarray(konum)]);
  return o.dizge();
};

function rkDeger(rk) {
  let d;
  if (rk & 2) d = rk >> 2;
  else { const t = new DataView(new ArrayBuffer(8)); t.setUint32(4, rk & 0xFFFFFFFC, true); d = t.getFloat64(0, true); }
  return rk & 1 ? d / 100 : d;
}

function sstOku(kay, i) {
  const parcalar = [kay[i].veri];
  for (let j = i + 1; j < kay.length && kay[j].id === 0x3C; j++) parcalar.push(kay[j].veri);
  const o = new Okuyucu(parcalar);
  o.u32();
  const adet = o.u32();
  const liste = [];
  for (let n = 0; n < adet && !o.bitti(); n++) liste.push(o.dizge());
  return liste;
}

export async function xlsOku(dosya) {
  const w = akisCikar(new Uint8Array(await dosya.arrayBuffer()));
  const kay = kayitlar(w);

  // BIFF5/7 (Excel 5/95/97 öncesi): dizgeler 8 bitlik ve kod sayfası kaydına (CODEPAGE) göre çözülür; ortak dizge tablosu yoktur.
  const biff8 = !(kay[0] && kay[0].id === 0x0809 && u16(kay[0].veri, 0) < 0x0600);
  let kodSayfasi = 1254;
  const sekizli = (d) => {
    try { return new TextDecoder(`windows-${kodSayfasi}`).decode(d); } catch { return Array.from(d, (c) => String.fromCharCode(c)).join(""); }
  };
  const bicimDizgesi = (veri) => (biff8 ? kayitDizgesi(veri, 2) : sekizli(veri.subarray(3, 3 + veri[2])));
  const etiketDizgesi = (veri) => (biff8 ? kayitDizgesi(veri, 6) : sekizli(veri.subarray(8, 8 + u16(veri, 6))));
  const formulDizgesi = (veri) => (biff8 ? kayitDizgesi(veri, 0) : sekizli(veri.subarray(2, 2 + u16(veri, 0))));

  let sst = [], tarih1904 = false;
  const biciler = new Map(), xf = [], sayfalar = [];
  for (let i = 0; i < kay.length; i++) {
    const { id, veri } = kay[i];
    if (id === 0x0809 && i > 0 && sayfalar.length) break;   // ilk sayfa bölümünden önceki "globals" bitti
    if (id === 0x0022) tarih1904 = u16(veri, 0) === 1;
    else if (id === 0x0042) kodSayfasi = u16(veri, 0);
    else if (id === 0x041E) biciler.set(u16(veri, 0), bicimDizgesi(veri));
    else if (id === 0x00E0) xf.push(u16(veri, 2));
    else if (id === 0x00FC) sst = sstOku(kay, i);
    else if (id === 0x0085) sayfalar.push({ konum: u32(veri, 0), gorunur: veri[4], tur: veri[5] });
  }
  const sayfa = sayfalar.find((s) => s.tur === 0 && s.gorunur === 0) || sayfalar.find((s) => s.tur === 0);
  if (!sayfa) throw new Error("Dosyada sayfa yok.");
  const tarihliXf = xf.map((f) => tarihFormatiMi(f, biciler.get(f)));
  const deger = (xfNo, d) => (tarihliXf[xfNo] && Number.isFinite(d) ? seriTarih(tarih1904 ? d + 1462 : d) : d);

  const satirlar = [];
  const koy = (r, c, v) => { (satirlar[r] ||= [])[c] = v; };
  const baslangic = kay.findIndex((k) => k.konum === sayfa.konum);
  if (baslangic < 0) throw new Error("Sayfa okunamadı.");
  for (let i = baslangic + 1; i < kay.length; i++) {
    const { id, veri } = kay[i];
    if (id === 0x000A) break;
    if (id === 0x00FD) koy(u16(veri, 0), u16(veri, 2), sst[u32(veri, 6)] ?? "");
    else if (id === 0x0204) koy(u16(veri, 0), u16(veri, 2), etiketDizgesi(veri));
    else if (id === 0x0203) koy(u16(veri, 0), u16(veri, 2), deger(u16(veri, 4), new DataView(veri.buffer, veri.byteOffset + 6, 8).getFloat64(0, true)));
    else if (id === 0x027E) koy(u16(veri, 0), u16(veri, 2), deger(u16(veri, 4), rkDeger(i32(veri, 6))));
    else if (id === 0x00BD) {
      const r = u16(veri, 0), ilk = u16(veri, 2), son = u16(veri, veri.length - 2);
      for (let c = ilk; c <= son; c++) { const o = 4 + (c - ilk) * 6; koy(r, c, deger(u16(veri, o), rkDeger(i32(veri, o + 2)))); }
    } else if (id === 0x0205) {
      if (veri[7] === 0) koy(u16(veri, 0), u16(veri, 2), veri[6] === 1);
    } else if (id === 0x0006) {
      const r = u16(veri, 0), c = u16(veri, 2);
      if (veri[12] === 0xFF && veri[13] === 0xFF) {
        if (veri[6] === 0 && kay[i + 1] && kay[i + 1].id === 0x0207) koy(r, c, formulDizgesi(kay[i + 1].veri));
        else if (veri[6] === 1) koy(r, c, veri[8] === 1);
      } else koy(r, c, deger(u16(veri, 4), new DataView(veri.buffer, veri.byteOffset + 6, 8).getFloat64(0, true)));
    }
  }
  const sonuc = [];
  for (let r = 0; r < satirlar.length; r++) {
    const dizi = satirlar[r] || [];
    for (let c = 0; c < dizi.length; c++) if (dizi[c] === undefined) dizi[c] = null;
    sonuc[r] = dizi;
  }
  return sonuc;
}

// .xlsx (zip) ya da .xls (OLE2) dosyasını içeriğine bakarak açar.
export async function excelOku(dosya) {
  const ilk = new Uint8Array(await dosya.slice(0, 4).arrayBuffer());
  if (ilk[0] === 0xD0 && ilk[1] === 0xCF && ilk[2] === 0x11 && ilk[3] === 0xE0) return xlsOku(dosya);
  if (ilk[0] === 0x50 && ilk[1] === 0x4B) return xlsxOku(dosya);
  throw new Error("Bu dosya Excel (.xls / .xlsx) biçiminde değil.");
}
