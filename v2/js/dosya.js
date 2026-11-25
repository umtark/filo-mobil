// Dosyayı uygulama içinde göstermek ya da indirmek için ortak yardımcılar (evrak, dekont ve rapor PDF'leri).
import { h, toast } from "./ui.js";
import { goruntuleyiciAc } from "./goruntuleyici.js";

const TUR = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", txt: "text/plain" };

// Tarayıcının dosyayı sayfada gösterebilmesi için doğru MIME türü gerekir; sunucu genel tür dönerse uzantıdan çıkarılır.
export function turlu(blob, dosyaAdi) {
  const tur = TUR[String(dosyaAdi || "").split(".").pop().toLowerCase()];
  return tur && (!blob.type || blob.type === "application/octet-stream") ? new Blob([blob], { type: tur }) : blob;
}

// Düğme çalışırken dönen halka ve yazı gösterir.
export async function dugmeIsi(dugme, yazi, is) {
  const eski = [...dugme.childNodes];
  dugme.disabled = true; dugme.classList.add("mesgul");
  dugme.replaceChildren(h("span", { class: "doner", "aria-hidden": "true" }), yazi);
  try { await is(); } finally { dugme.replaceChildren(...eski); dugme.classList.remove("mesgul"); dugme.disabled = false; }
}

export function blobIndir(blob, ad) {
  const adres = URL.createObjectURL(blob);
  const a = h("a", { href: adres, download: ad || "dosya", hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(adres), 60000);
}

// Dosyayı uygulamanın içinde tam ekran görüntüleyicide açar (PDF, resim, metin); desteklenmeyen türde (Word, Excel...) indirir.
// blobAl: Promise<Blob> döndüren işlev.
export function goruntule(dugme, blobAl, ad) {
  return dugmeIsi(dugme, "Açılıyor", async () => {
    try {
      const blob = turlu(await blobAl(), ad);
      if (!goruntuleyiciAc(blob, ad, () => blobIndir(blob, ad))) { toast("Bu dosya türü uygulamada gösterilemiyor; indiriliyor"); blobIndir(blob, ad); }
    } catch (e) { toast(e.message || "Dosya açılamadı", "hata"); }
  });
}
export function indir(dugme, blobAl, ad) {
  return dugmeIsi(dugme, "İndiriliyor", async () => {
    try { blobIndir(turlu(await blobAl(), ad), ad); toast("Dosya indirildi"); }
    catch (e) { toast(e.message || "Dosya indirilemedi", "hata"); }
  });
}
