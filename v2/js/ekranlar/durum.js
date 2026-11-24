// Tam ekran durum sayfası: şirket bloke edilmişse "Bloke edildi", platform bakımdaysa "Bakım modu", kullanıcıya hiçbir sekme izni verilmemişse "Erişim kısıtlandı".
import { h } from "../ui.js";

const RESIM = { bloke: "ikon/bloke.png", bakim: "ikon/bakim-modu.png", erisim: "ikon/bloke.png" };
const ERISIM_BASLIK = "Hesabınızın erişimi kısıtlandı";
const ERISIM_METIN = "Bu hesap için hiçbir sekmeye erişim izni tanımlanmamış. Yöneticinizle iletişime geçin.";
const BAKIM_VARSAYILAN = "Sistem güncelleniyor. Lütfen daha sonra tekrar deneyin.";

export function durumEkrani({ tur, mesaj = "", yenile, cikis }) {
  const bakim = tur === "bakim", erisim = tur === "erisim";
  return h("main", { class: "tam-ekran durum-ekrani", role: "alert" },
    h("img", { class: "durum-resim", src: RESIM[tur], alt: bakim ? "Bakım modu" : "Hesabınız bloke edildi", width: "280", height: "280", draggable: "false" }),
    bakim && h("h1", {}, "Bakım modu"),
    erisim && h("h1", {}, ERISIM_BASLIK),
    h("p", { class: "durum-metin" }, bakim ? (mesaj || BAKIM_VARSAYILAN) : erisim ? ERISIM_METIN : "Hesabınıza erişim kapatıldı. Ayrıntı için yöneticinizle iletişime geçin."),
    h("div", { class: "durum-dugmeler" },
      h("button", { class: "dugme birincil genis", type: "button", onclick: yenile }, "Yenile"),
      h("button", { class: "dugme ikincil genis", type: "button", onclick: cikis }, "Çıkış yap")));
}
