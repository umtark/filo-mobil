// OTOMATİK ÜRETİLDİ: data/dil/tr.json -> python mobilv2/araclar/metin_uret.py. Elle değiştirmeyin; masaüstündeki metni değiştirip betiği çalıştırın.
const METIN = {
  "menu_dashboard": "Ana Sayfa",
  "menu_fatura": "Fatura Yönetimi",
  "menu_arac": "Araç Yönetimi",
  "menu_esnaf": "Esnaf Defteri",
  "menu_petrol": "Akaryakıt",
  "menu_ic_hizmet": "İç Hizmetler",
  "menu_okul_servis": "Okul Yönetimi",
  "menu_sirket_evrak": "Şirket Evrakları",
  "menu_ayarlar": "Ayarlar",
  "settings_session_logout": "Çıkış Yap",
  "login_hatirla": "Beni hatırla",
  "login_hata_sifre": "❌ Kullanıcı adı veya şifre hatalı!",
  "login_hata_sunucu": "❌ Sunucuya ulaşılamadı. Daha sonra tekrar deneyin.",
  "kullanici_ad_placeholder": "Kullanıcı adı",
  "kullanici_sifre_placeholder": "Şifre",
  "giris_yap": "Giriş Yap",
  "sevrak_sayfa_baslik": "Şirket Evrakları",
  "sevrak_sayfa_aciklama": "Vergi levhası, ticaret sicil gazetesi, ana sözleşme, imza sirküleri, banka evrakları, faturalar ve araç sözleşmeleri tek yerde. Dosyalar Google Drive ile tüm bilgisayarlara senkronlanır.",
  "sevrak_ara_ph": "Ara: başlık, etiket, not, dosya adı veya PDF içindeki yazı…",
  "sevrak_arsiv_goster": "Eski sürümleri göster",
  "sevrak_tum_firmalar": "Tüm Firmalar",
  "sevrak_tum_yillar": "Tüm Yıllar",
  "tah_kpi_nakit": "Nakit",
  "tah_kpi_iban": "IBAN / Havale",
  "tah_kpi_kart": "Kredi Kartı",
  "tah_kpi_ogrenci": "{n} öğrenci",
  "tah_kpi_tikla": "Bu yöntemle ödeme yapan öğrencileri filtrelemek için tıklayın (tekrar tıkla: kaldır)",
  "tah_kpi_not_tekil": "💡 Karta tıkla → o yöntemle ödeyen öğrencileri gör.",
  "sevrak_firma": "Firma:",
  "sevrak_kategori": "Kategori:",
  "sevrak_baslik_lbl": "Başlık:",
  "sevrak_yil": "Yıl:",
  "sevrak_belge_tarihi": "Belge Tarihi:",
  "sevrak_gecerlilik": "Geçerlilik Bitişi:",
  "sevrak_etiketler": "Etiketler:",
  "sevrak_not": "Not:",
};

// Masaüstü metinlerinde satır sonu ve sondaki ':' olabilir; başlık ve etiket olarak kullanılırken sadeleştirilir.
export const metin = (anahtar) => METIN[anahtar];
export const baslik = (anahtar) => String(METIN[anahtar]).replace(/\s*\n\s*/g, " ");
export const etiket = (anahtar) => baslik(anahtar).replace(/:$/, "");
// Masaüstünde metnin başında emoji ya da sonunda ünlem olabilir; ekranda süs olmadan, düz cümle olarak gösterilir.
export const duz = (anahtar) => baslik(anahtar).replace(/^[^\p{L}\p{N}]+/u, "").replace(/!+$/, "");
export const doldur = (anahtar, degerler) => baslik(anahtar).replace(/\{(\w+)\}/g, (_, k) => degerler[k]);
