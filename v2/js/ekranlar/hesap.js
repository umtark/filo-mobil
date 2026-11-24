// Hesap: kim giriş yapmış, lisans durumu, çıkış.
import { h, kart, satir, bilgiSatiri, toast, detayAc } from "../ui.js";
import * as kullanicilar from "./kullanicilar.js";
import { metin } from "../metin.js";
import * as veri from "../veri.js";
import * as api from "../api.js";
import { tarihCoz, tarihYaz } from "../bicim.js";

const ROL = { sahip: "Sahip", yonetici: "Yönetici", kullanici: "Kullanıcı" };
const MODUL = { okul: "Okul", sirket_evrak: "Şirket evrakları", fatura: "Faturalar", arac: "Araçlar", esnaf: "Esnaf", petrol: "Akaryakıt", ic_hizmet: "İç hizmet" };

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
  return h("div", { class: "sayfa" },
    kart(h("h3", {}, "Hesap"), bilgiSatiri("Kullanıcı", kullanici && api.epostadanKullaniciAdi(kullanici.email)), bilgiSatiri("İşletme", veri.baglam.isletmeAdi),
      bilgiSatiri("Rol", ROL[u.rol] || u.rol), bilgiSatiri("Yetkiler", yetkiler), bilgiSatiri("Erişim", u.salt_okunur ? "Yalnızca görüntüleme" : "Görüntüleme ve ödeme girişi"),
      bilgiSatiri("Lisans", lisansMetni, lisansTon)),
    ["sahip", "yonetici"].includes(u.rol) && kart(satir({ baslik: "Kullanıcılar", onclick: () => detayAc("Kullanıcılar", () => kullanicilar.ciz()) })),
    kart(h("button", { class: "dugme ikincil genis", onclick: () => { yenile(); toast("Veriler yenilendi"); } }, "Verileri yenile"),
      h("button", { class: "dugme tehlike genis", onclick: cikis }, metin("settings_session_logout"))));
}
