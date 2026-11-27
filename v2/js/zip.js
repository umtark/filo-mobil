// Sıkıştırmasız (store) ZIP üretici: telefonda seçilen evrakları tek dosyada toplamak için. Kütüphane gerektirmez; ad UTF-8 yazılır.
const TABLO = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

export function crc32(bayt) {
  let c = 0xffffffff;
  for (let i = 0; i < bayt.length; i++) c = TABLO[(c ^ bayt[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosZamani(d) {
  const yil = Math.max(1980, d.getFullYear());
  return { tarih: ((yil - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), saat: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1) };
}

// Aynı ad iki kez gelirse ikincisine " (2)" eklenir.
export function tekilAdlar(adlar) {
  const gorulen = new Map();
  return adlar.map((ad) => {
    const n = (gorulen.get(ad) || 0) + 1;
    gorulen.set(ad, n);
    if (n === 1) return ad;
    const nokta = ad.lastIndexOf(".");
    return nokta > 0 ? `${ad.slice(0, nokta)} (${n})${ad.slice(nokta)}` : `${ad} (${n})`;
  });
}

// dosyalar: [{ ad, veri: Uint8Array }] -> Blob (application/zip)
export function zipYap(dosyalar, zaman = new Date()) {
  const kodla = new TextEncoder();
  const { tarih, saat } = dosZamani(zaman);
  const adlar = tekilAdlar(dosyalar.map((d) => d.ad));
  const parcalar = [], merkez = [];
  let ofset = 0;
  dosyalar.forEach((d, i) => {
    const ad = kodla.encode(adlar[i]), crc = crc32(d.veri), boyut = d.veri.length;
    const yerel = new DataView(new ArrayBuffer(30));
    yerel.setUint32(0, 0x04034b50, true); yerel.setUint16(4, 20, true); yerel.setUint16(6, 0x0800, true); yerel.setUint16(8, 0, true);
    yerel.setUint16(10, saat, true); yerel.setUint16(12, tarih, true); yerel.setUint32(14, crc, true); yerel.setUint32(18, boyut, true); yerel.setUint32(22, boyut, true);
    yerel.setUint16(26, ad.length, true); yerel.setUint16(28, 0, true);
    parcalar.push(new Uint8Array(yerel.buffer), ad, d.veri);
    const m = new DataView(new ArrayBuffer(46));
    m.setUint32(0, 0x02014b50, true); m.setUint16(4, 20, true); m.setUint16(6, 20, true); m.setUint16(8, 0x0800, true); m.setUint16(10, 0, true);
    m.setUint16(12, saat, true); m.setUint16(14, tarih, true); m.setUint32(16, crc, true); m.setUint32(20, boyut, true); m.setUint32(24, boyut, true);
    m.setUint16(28, ad.length, true); m.setUint32(42, ofset, true);
    merkez.push(new Uint8Array(m.buffer), ad);
    ofset += 30 + ad.length + boyut;
  });
  const merkezBoyut = merkez.reduce((t, p) => t + p.length, 0);
  const son = new DataView(new ArrayBuffer(22));
  son.setUint32(0, 0x06054b50, true); son.setUint16(8, dosyalar.length, true); son.setUint16(10, dosyalar.length, true);
  son.setUint32(12, merkezBoyut, true); son.setUint32(16, ofset, true);
  return new Blob([...parcalar, ...merkez, new Uint8Array(son.buffer)], { type: "application/zip" });
}
