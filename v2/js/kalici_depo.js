// Tablo verisinin cihazdaki kalıcı kopyası (IndexedDB): uygulama yeniden açılınca tablolar baştan indirilmez, yalnızca değişen satırlar çekilir.
// Anahtar "kullanıcı|işletme|tablo"; IndexedDB yoksa ya da hata verirse hiçbir şey yapılmaz (uygulama kopyasız çalışır).
const AD = "filo2.veri", DEPO = "tablolar", SURUM = 1;

let baglanti = null;
function ac() {
  if (!baglanti) {
    baglanti = new Promise((coz, red) => {
      if (typeof indexedDB === "undefined") return red(new Error("indexedDB yok"));
      const i = indexedDB.open(AD, 1);
      i.onupgradeneeded = () => i.result.createObjectStore(DEPO, { keyPath: "k" });
      i.onsuccess = () => coz(i.result);
      i.onerror = () => red(i.error);
    });
    baglanti.catch(() => { baglanti = null; });
  }
  return baglanti;
}

const istek = (r) => new Promise((coz, red) => { r.onsuccess = () => coz(r.result); r.onerror = () => red(r.error); });

export async function oku(k) {
  try {
    const s = await istek((await ac()).transaction(DEPO).objectStore(DEPO).get(k));
    return s && s.s === SURUM ? s : null;
  } catch { return null; }
}

export async function yaz(k, { liste, imlec, tam }) {
  try { await istek((await ac()).transaction(DEPO, "readwrite").objectStore(DEPO).put({ k, s: SURUM, liste, imlec, tam })); } catch { /* kopya yazılamadı: sonraki açılışta baştan inilir */ }
}

// Önek ("kullanıcı|") ile başlayan tüm kopyaları siler.
export async function sil(onek) {
  try {
    const depo = (await ac()).transaction(DEPO, "readwrite").objectStore(DEPO);
    await new Promise((coz, red) => {
      const c = depo.openKeyCursor(IDBKeyRange.bound(onek, onek + "\uffff"));
      c.onsuccess = () => { const i = c.result; if (i) { depo.delete(i.primaryKey); i.continue(); } else coz(); };
      c.onerror = () => red(c.error);
    });
  } catch { /* yok sayılır */ }
}
