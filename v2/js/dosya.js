// Dosyayı telefonda yeni sekmede göstermek ya da indirmek için ortak yardımcılar (evrak, dekont ve rapor PDF'leri).
import { h, toast } from "./ui.js";

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

// Sekme tıklama anında (beklemeden önce) açılmalıdır; telefon tarayıcıları beklemeden sonra açılan pencereyi engeller.
export function sekmeAc() {
  const sekme = window.open("", "_blank");
  if (sekme) { try { sekme.document.title = "Dosya açılıyor"; } catch { /* çapraz kaynak */ } }
  return sekme;
}

export function blobIndir(blob, ad) {
  const adres = URL.createObjectURL(blob);
  const a = h("a", { href: adres, download: ad || "dosya", hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(adres), 60000);
}

// Sekme açılamadıysa (engellendiyse) uygulamadan çıkmamak için dosya indirilir.
export function sekmedeGoster(sekme, blob, ad) {
  if (!sekme) { toast("Açılır pencere engellendi; dosya indiriliyor", "hata"); blobIndir(blob, ad); return; }
  const adres = URL.createObjectURL(blob);
  sekme.location.href = adres;
  setTimeout(() => URL.revokeObjectURL(adres), 300000);
}

export const sekmeKapat = (sekme) => { if (sekme) { try { sekme.close(); } catch { /* kapalı */ } } };

// blobAl: Promise<Blob> döndüren işlev.
export function goruntule(dugme, blobAl, ad) {
  const sekme = sekmeAc();
  return dugmeIsi(dugme, "Açılıyor", async () => {
    try { sekmedeGoster(sekme, turlu(await blobAl(), ad), ad); }
    catch (e) { sekmeKapat(sekme); toast(e.message || "Dosya açılamadı", "hata"); }
  });
}

export function indir(dugme, blobAl, ad) {
  return dugmeIsi(dugme, "İndiriliyor", async () => {
    try { blobIndir(turlu(await blobAl(), ad), ad); toast("Dosya indirildi"); }
    catch (e) { toast(e.message || "Dosya indirilemedi", "hata"); }
  });
}
