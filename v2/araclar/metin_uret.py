"""Masaüstü uygulamasının metinlerini (data/dil/tr.json) mobil uygulamaya aktarır: başlıklar ve etiketler iki yerde aynı kalsın diye.

  python mobilv2/araclar/metin_uret.py

Yalnızca aşağıdaki anahtarlar alınır; mobilv2/js/metin.js dosyasını yazar. Metin masaüstünde değişirse bu betik yeniden çalıştırılır
(testler/mobil_metin_test.py dosyanın güncel olup olmadığını denetler). Bir anahtar tr.json'da yoksa betik hata verir.
"""
import json
import sys
from pathlib import Path

KOK = Path(__file__).resolve().parents[2]
TR = KOK / "data" / "dil" / "tr.json"
HEDEF = KOK / "mobilv2" / "js" / "metin.js"

ANAHTARLAR = [
    "menu_dashboard", "menu_fatura", "menu_arac", "menu_esnaf", "menu_petrol", "menu_ic_hizmet", "menu_okul_servis", "menu_sirket_evrak", "menu_ayarlar",
    "settings_session_logout", "login_hatirla", "login_hata_sifre", "login_hata_sunucu", "kullanici_ad_placeholder", "kullanici_sifre_placeholder", "giris_yap",
    "sevrak_sayfa_baslik", "sevrak_sayfa_aciklama", "sevrak_ara_ph", "sevrak_arsiv_goster", "sevrak_tum_firmalar", "sevrak_tum_yillar",
    "tah_kpi_nakit", "tah_kpi_iban", "tah_kpi_kart", "tah_kpi_ogrenci", "tah_kpi_tikla", "tah_kpi_not_tekil",
    "sevrak_firma", "sevrak_kategori", "sevrak_baslik_lbl", "sevrak_yil", "sevrak_belge_tarihi", "sevrak_gecerlilik", "sevrak_etiketler", "sevrak_not",
]


def uret() -> str:
    tr = json.loads(TR.read_text(encoding="utf-8"))
    eksik = [k for k in ANAHTARLAR if k not in tr]
    if eksik:
        raise SystemExit(f"tr.json'da olmayan anahtarlar: {', '.join(eksik)}")
    govde = ",\n".join(f"  {json.dumps(k)}: {json.dumps(tr[k], ensure_ascii=False)}" for k in ANAHTARLAR)
    return ("// OTOMATİK ÜRETİLDİ: data/dil/tr.json -> python mobilv2/araclar/metin_uret.py. Elle değiştirmeyin; masaüstündeki metni değiştirip betiği çalıştırın.\n"
            f"const METIN = {{\n{govde},\n}};\n\n"
            "// Masaüstü metinlerinde satır sonu ve sondaki ':' olabilir; başlık ve etiket olarak kullanılırken sadeleştirilir.\n"
            "export const metin = (anahtar) => METIN[anahtar];\n"
            "export const baslik = (anahtar) => String(METIN[anahtar]).replace(/\\s*\\n\\s*/g, \" \");\n"
            "export const etiket = (anahtar) => baslik(anahtar).replace(/:$/, \"\");\n"
            "// Masaüstünde metnin başında emoji ya da sonunda ünlem olabilir; ekranda süs olmadan, düz cümle olarak gösterilir.\n"
            "export const duz = (anahtar) => baslik(anahtar).replace(/^[^\\p{L}\\p{N}]+/u, \"\").replace(/!+$/, \"\");\n"
            "export const doldur = (anahtar, degerler) => baslik(anahtar).replace(/\\{(\\w+)\\}/g, (_, k) => degerler[k]);\n")


if __name__ == "__main__":
    HEDEF.write_text(uret(), encoding="utf-8", newline="\n")
    print(f"{HEDEF} yazıldı ({len(ANAHTARLAR)} metin).")
    sys.exit(0)
