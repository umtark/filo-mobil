// Masaüstündeki yan menünün (fatura_masaustu.py: btn_menu_*) aynısı: aynı sıra, aynı ikonlar, aynı başlıklar (metin.js masaüstü metinlerinden üretilir).
// "izin": masaüstündeki yetki adı; "ikon": mobilv2/ikon/menu/<ad>.png (data/anim içindeki masaüstü ikonlarından küçültülmüştür).
import { baslik } from "./metin.js";

// Masaüstündeki her sayfanın sekmeleri (QTabWidget başlıkları); soldan açılan menüde modülün altında listelenir.
const ALT = {
  fatura: [["tum", "Tüm Kayıtlar"], ["gelen", "Gelen Faturalar"], ["giden", "Giden Faturalar"], ["ozet", "Aylık Özet"]],
  arac: [["liste", "Araç Listesi"], ["yag", "Yağ Bakımı"], ["bakim", "Genel Tamir-Bakım"], ["harcama", "Harcamalar"]],
  okul: [["ogrenciler", "Öğrenciler"], ["kullanmayan", "Servis Kullanmayanlar"], ["servisler", "Servisler"], ["puantaj", "Servis Puantajları"], ["tahsilat", "Tahsilat Raporu"]],
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
