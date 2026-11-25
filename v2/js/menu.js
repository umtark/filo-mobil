// Masaüstündeki yan menünün (fatura_masaustu.py: btn_menu_*) aynısı: aynı sıra, aynı ikonlar, aynı başlıklar (metin.js masaüstü metinlerinden üretilir).
// "izin": masaüstündeki yetki adı; "ikon": mobilv2/ikon/menu/<ad>.png (data/anim içindeki masaüstü ikonlarından küçültülmüştür).
import { baslik } from "./metin.js";

// Masaüstündeki her sayfanın sekmeleri (QTabWidget başlıkları); soldan açılan menüde modülün altında listelenir.
const ALT = {
  fatura: [["tum", baslik("tab_tm_kaytlar")], ["gelen", baslik("tab_gelen_faturalar")], ["giden", baslik("tab_giden_faturalar")], ["ozet", "Aylık Özet"]],
  arac: [["liste", "Araç Listesi"], ["yag", baslik("tab_yakt_kaytlar")], ["bakim", baslik("tab_bakm__servis")], ["harcama", baslik("tab_harcamalar")]],
  okul: [["ogrenciler", baslik("okul_tab_ogrenciler")], ["kullanmayan", baslik("okul_tab_srv_kullanmayan")], ["servisler", baslik("okul_tab_servisler")], ["tahsilat", baslik("okul_tab_tahsilat")], ["puantaj", baslik("okul_tab_puantaj")]],
  ayarlar: [["hesap", "Hesap"], ["kullanicilar", "Kullanıcılar"]],
};

export const MENU = [
  { id: "dashboard", izin: "dashboard", ikon: "ana-sayfa", metin: "menu_dashboard" },
  { id: "sirket_evrak", izin: "sirket_evrak", ikon: "sirket-evrak", metin: "menu_sirket_evrak" },
  { id: "fatura", izin: "fatura", ikon: "fatura", metin: "menu_fatura" },
  { id: "arac", izin: "arac", ikon: "arac", metin: "menu_arac" },
  { id: "esnaf", izin: "esnaf", ikon: "esnaf", metin: "menu_esnaf" },
  { id: "petrol", izin: "petrol", ikon: "akaryakit", metin: "menu_petrol" },
  { id: "ic_hizmet", izin: "ic_hizmet", ikon: "ic-hizmet", metin: "menu_ic_hizmet" },
  { id: "okul", izin: "okul", ikon: "okul", metin: "menu_okul_servis" },
  { id: "ayarlar", izin: "ayarlar", ikon: "ayarlar", metin: "menu_ayarlar" },
].map((m) => ({ ...m, ad: baslik(m.metin), resim: `ikon/menu/${m.ikon}.png`, alt: ALT[m.id] || [] }));

// Alt çubukta sık kullanılanlar durur (en çok 3); gerisi "Menü"dedir. Sıra: Ana Sayfa, Okul Yönetimi, Fatura Yönetimi, Araç Yönetimi...
export const ALT_CUBUK_SIRASI = ["dashboard", "okul", "fatura", "arac", "petrol", "esnaf", "ic_hizmet", "sirket_evrak", "ayarlar"];
