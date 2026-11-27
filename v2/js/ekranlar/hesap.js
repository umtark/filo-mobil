// Hesap: kim giriş yapmış, lisans durumu, çıkış.
import { h, kart, satir, bilgiSatiri, toast, detayAc } from "../ui.js";
import * as kullanicilar from "./kullanicilar.js";
import * as personel from "../personel.js";
import { metin, baslik } from "../metin.js";
import { UYGULAMA_SURUMU } from "../surum.js";
import * as veri from "../veri.js";
import * as api from "../api.js";
import * as profil from "../profil.js";
import { tarihCoz, tarihYaz } from "../bicim.js";

const ROL = { sahip: "Üst Yönetici", yonetici: "Yönetici", kullanici: "Personel" };
const MODUL = { okul: baslik("menu_okul_servis"), sirket_evrak: baslik("menu_sirket_evrak"), fatura: baslik("menu_fatura"), arac: baslik("menu_arac"), esnaf: baslik("menu_esnaf"), petrol: baslik("menu_petrol"), ic_hizmet: baslik("menu_ic_hizmet") };

export async function ciz({ cikis, yenile }) {
  const u = veri.baglam.uye;
  const l = veri.baglam.lisans;
  const kullanici = api.kullanici();
  let lisansMetni = "Bilinmiyor", lisansTon = "";
  if (l) {
    if (l.omur_boyu) lisansMetni = "Süresiz";
    else if (l.acik === false) { lisansMetni = "Süresi doldu"; lisansTon = "kirmizi"; }
    else { lisansMetni = `${tarihYaz(tarihCoz(l.lisans_bitis))} tarihine kadar (${l.kalan_gun} gün)`; lisansTon = l.kalan_gun <= 30 ? "kehribar" : "yesil"; }
  }
  const yetkiler = ["sahip", "yonetici"].includes(u.rol) ? "Tümü" : (u.izinler || []).map((m) => MODUL[m] || m).join(", ") || "Yok";
  // Uygulama sürümü (js/surum.js); servis işçisinin önbellek adı (sw.js) yalnızca önbellek yenilemek içindir, kullanıcıya gösterilmez.
  const surum = h("p", { class: "soluk" }, `Sürüm ${UYGULAMA_SURUMU}`);
  return h("div", { class: "sayfa" },
    kart(h("h3", {}, "Hesap"), profil.fotoBolumu(profil.gorunenAd()), bilgiSatiri("Kullanıcı", profil.gorunenAd()), bilgiSatiri("İşletme", veri.baglam.isletmeAdi),
      bilgiSatiri("Rol", u.sofor ? "Şoför" : u.unvan === "muhasebeci" ? "Muhasebeci" : ROL[u.rol] || u.rol), bilgiSatiri("Yetkiler", yetkiler), bilgiSatiri("Erişim", u.salt_okunur ? "Yalnızca görüntüleme" : "Görüntüleme ve ödeme girişi"),
      bilgiSatiri("Lisans", lisansMetni, lisansTon)),
    ["sahip", "yonetici"].includes(u.rol) && kart(satir({ baslik: "Kullanıcılar", onclick: () => detayAc("Kullanıcılar", () => kullanicilar.ciz()) })),
    kart(satir({ baslik: "Maaşım ve İzinlerim", onclick: () => detayAc("Maaşım ve İzinlerim", () => personel.calisanGorunumu(u.ad)) })),
    kart(h("button", { class: "dugme ikincil genis", onclick: () => { yenile(); toast("Veriler yenilendi"); } }, "Verileri yenile"),
      h("button", { class: "dugme tehlike genis", onclick: cikis }, metin("settings_session_logout")), surum));
}
