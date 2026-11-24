// Tam ekran durum sayfası: şirket bloke edilmişse "Bloke edildi", platform bakımdaysa "Bakım modu".
import { h } from "../ui.js";

const RESIM = { bloke: "ikon/bloke.png", bakim: "ikon/bakim-modu.png" };
const BAKIM_VARSAYILAN = "Sistem güncelleniyor. Lütfen daha sonra tekrar deneyin.";

export function durumEkrani({ tur, mesaj = "", yenile, cikis }) {
  const bakim = tur === "bakim";
  return h("main", { class: "tam-ekran durum-ekrani", role: "alert" },
    h("img", { class: "durum-resim", src: RESIM[tur], alt: bakim ? "Bakım modu" : "Hesabınız bloke edildi", width: "280", height: "280", draggable: "false" }),
    bakim && h("h1", {}, "Bakım modu"),
    h("p", { class: "durum-metin" }, bakim ? (mesaj || BAKIM_VARSAYILAN) : "Hesabınıza erişim kapatıldı. Ayrıntı için yöneticinizle iletişime geçin."),
    h("div", { class: "durum-dugmeler" },
      h("button", { class: "dugme birincil genis", type: "button", onclick: yenile }, "Yenile"),
      h("button", { class: "dugme ikincil genis", type: "button", onclick: cikis }, "Çıkış yap")));
}
