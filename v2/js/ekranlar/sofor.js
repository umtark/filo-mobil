// Şoför ekranı: konum paylaşımı uygulama açılır açılmaz otomatik başlar; burada ayrı bir başlat/bitir denetimi yoktur.
import { h, kart, kartBasligi, satir, detayAc } from "../ui.js";
import * as konum from "../konum.js";
import * as personel from "../personel.js";
import * as veri from "../veri.js";

export async function ciz() {
  const ad = veri.baglam.uye.ad;
  const kap = h("div", { class: "sayfa" });
  const bilgi = h("p", { class: "hata-metin", role: "alert", hidden: true });

  function ciz() {
    const d = konum.durumOku();
    bilgi.textContent = d.izinYok ? "Uygulamanın düzgün çalışması için telefon ayarlarından konum iznini açın." : "";
    bilgi.hidden = !d.izinYok;
  }
  const iptal = konum.dinle(ciz);
  const izle = new MutationObserver(() => { if (!kap.isConnected) { iptal(); izle.disconnect(); } });
  requestAnimationFrame(() => izle.observe(document.body, { childList: true, subtree: true }));
  konum.surdur();
  ciz();

  kap.append(
    kart(kartBasligi("Şoför", ad), h("p", { class: "soluk" }, "İyi çalışmalar."), bilgi),
    kart(satir({ baslik: "Maaşım ve İzinlerim", onclick: () => detayAc("Maaşım ve İzinlerim", () => personel.calisanGorunumu(ad)) })));
  return kap;
}


