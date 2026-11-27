// Personel: maaş (banka + elden, ödeme durumu, belge) ve izin (tarih aralığı, gün sayısı) kayıtları.
// Yönetici (sahip/ilgili yönetici) gerçek verileri kendi girer; çalışan yalnızca kendi kaydını salt okunur görür (RLS kişi bazlıdır).
import { h, kart, kartBasligi, satir, bilgiSatiri, bosDurum } from "./ui.js";
import { formAc, ekleDugmesi, yuvarla } from "./form.js";
import { goruntule } from "./dosya.js";
import { para, tarihCoz, tarihKisa, ayAdi, isoTarih } from "./bicim.js";
import * as api from "./api.js";
import * as veri from "./veri.js";

// Dönem seçimi: bu ay dahil geriye 24 ay (yeniden eskiye).
function ayListesi(adet = 24) {
  const simdi = new Date();
  return Array.from({ length: adet }, (_, i) => {
    const d = new Date(simdi.getFullYear(), simdi.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return [k, ayAdi(k)];
  });
}

function belgeSecici(mevcutVar) {
  let dosya = null, kaldir = false;
  const girdi = h("input", { type: "file", class: "girdi", accept: ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*", "aria-label": "Belge ekle" });
  const durum = h("p", { class: "soluk" }, mevcutVar ? "Belge var" : "(Belge eklenmedi)");
  const kaldirDugmesi = mevcutVar && h("button", { class: "dugme ikincil kucuk", type: "button" }, "Belgeyi kaldır");
  girdi.addEventListener("change", () => { dosya = girdi.files[0] || null; kaldir = false; durum.textContent = dosya ? dosya.name : mevcutVar ? "Belge var" : "(Belge eklenmedi)"; });
  if (kaldirDugmesi) kaldirDugmesi.addEventListener("click", () => { dosya = null; kaldir = true; girdi.value = ""; durum.textContent = "(Belge eklenmedi)"; });
  return { kok: h("div", { class: "alan" }, h("span", {}, "Belge (bordro/dekont):"), girdi, durum, kaldirDugmesi), oku: () => ({ dosya, kaldir }), bos: () => false };
}

async function belgeYukle(ad, dosya) {
  if (dosya.size > 25 * 1024 * 1024) throw new Error("Dosya 25 MB'den büyük olamaz.");
  const r = await api.personelBelgeDriveYukle(veri.baglam.isletme, ad, dosya);
  if (!r || !r.yol) throw new Error("Belge yüklenemedi.");
  return r.yol;
}

function maasFormu(ad, mevcut, yenile) {
  const secici = belgeSecici(Boolean(mevcut && mevcut.belge));
  formAc({
    baslik: mevcut ? "Maaş kaydını düzenle" : "Maaş kaydı ekle",
    deger: mevcut || { donem: ayListesi(1)[0][0] },
    alanlar: [
      { ad: "donem", etiket: "Dönem", tur: "secim", bos: false, secenekler: ayListesi(), zorunlu: true },
      { yan: [{ ad: "banka", etiket: "Banka", tur: "para" }, { ad: "elden", etiket: "Elden", tur: "para" }] },
      { ad: "odendi", etiket: "Ödendi", tur: "onay" },
      { ad: "not", etiket: "Not" },
      { ad: "belge_alan", etiket: "Belge", tur: "ozel", kur: () => secici },
    ],
    kaydet: async (g) => {
      const { dosya, kaldir } = g.belge_alan;
      const yeniYol = dosya ? await belgeYukle(ad, dosya) : null;
      await veri.kayitKaydet("personel_maas", mevcut ? mevcut.id : null, (v) => {
        const oncedenOdendi = Boolean(v.odendi);
        v.ad = ad; v.donem = g.donem; v.banka = yuvarla(g.banka); v.elden = yuvarla(g.elden); v.not = g.not; v.odendi = g.odendi;
        v.odeme_tarihi = g.odendi ? (v.odeme_tarihi && oncedenOdendi ? v.odeme_tarihi : isoTarih(new Date())) : "";
        if (yeniYol) v.belge = yeniYol; else if (kaldir) v.belge = "";
        return v;
      }, { bildirimsiz: true });
      yenile();
    },
    sil: mevcut ? async () => { await veri.kayitSil("personel_maas", mevcut.id); yenile(); } : undefined,
  });
}

function izinFormu(ad, mevcut, yenile) {
  formAc({
    baslik: mevcut ? "İzin kaydını düzenle" : "İzin kaydı ekle",
    deger: mevcut || {},
    alanlar: [
      { yan: [{ ad: "baslangic", etiket: "Başlangıç", tur: "tarih", iso: true, zorunlu: true }, { ad: "bitis", etiket: "Bitiş", tur: "tarih", iso: true, zorunlu: true }] },
      { ad: "gun", etiket: "Gün sayısı", tur: "sayi", tamSayi: true, zorunlu: true, zorunluPozitif: true },
      { ad: "aciklama", etiket: "Açıklama" },
    ],
    kaydet: async (g) => {
      if (g.bitis < g.baslangic) throw new Error("Bitiş tarihi başlangıçtan önce olamaz.");
      await veri.kayitKaydet("personel_izin", mevcut ? mevcut.id : null, (v) => {
        v.ad = ad; v.baslangic = g.baslangic; v.bitis = g.bitis; v.gun = Math.round(g.gun); v.aciklama = g.aciklama;
        return v;
      }, { bildirimsiz: true });
      yenile();
    },
    sil: mevcut ? async () => { await veri.kayitSil("personel_izin", mevcut.id); yenile(); } : undefined,
  });
}

function izinHakkiFormu(ad, hak, yenile) {
  formAc({
    baslik: "Yıllık izin hakkı",
    deger: { gun: hak },
    alanlar: [{ ad: "gun", etiket: "Yıllık izin hakkı (gün)", tur: "sayi", tamSayi: true, zorunlu: true, zorunluPozitif: true, ipucu: "İş Kanunu gereği en az 14 gündür (kıdeme göre 20-26 gün olabilir)." }],
    kaydet: async (g) => { await veri.izinHakkiYaz(ad, Math.round(g.gun)); yenile(); },
  });
}

async function belgeGor(e, ad, yol) {
  await goruntule(e.currentTarget, () => api.personelBelgeDriveIndir(veri.baglam.isletme, ad, yol), yol.split("/").pop().replace(/^[0-9a-f]{12}_/, ""));
}

function maasSatiri(k, ad, yazilabilir, yenile) {
  const odendi = Boolean(k.odendi);
  const onclick = yazilabilir ? () => maasFormu(ad, k, yenile) : k.belge ? (e) => belgeGor(e, ad, k.belge) : undefined;
  return satir({
    baslik: ayAdi(k.donem), alt: k.belge ? "Belge var · dokunup görüntüleyin" : (k.not || ""),
    sag: odendi ? para(Number(k.banka || 0) + Number(k.elden || 0)) : "Bekliyor",
    sagAlt: odendi ? `Ödendi${k.odeme_tarihi ? " · " + tarihKisa(tarihCoz(k.odeme_tarihi)) : ""}` : para(Number(k.banka || 0) + Number(k.elden || 0)),
    ton: odendi ? "" : "yesil",
    onclick,
  });
}

function izinSatiri(k, ad, yazilabilir, yenile) {
  return satir({
    baslik: `${tarihKisa(tarihCoz(k.baslangic))} – ${tarihKisa(tarihCoz(k.bitis))}`, alt: k.aciklama || "",
    sag: `${k.gun} gün`, onclick: yazilabilir ? () => izinFormu(ad, k, yenile) : undefined,
  });
}

// yazilabilir: true (yönetici) kayıt ekler/düzenler/siler ve izin hakkını değiştirir; false (çalışan) yalnızca görüntüler (belgeye dokunup açabilir).
async function goster(ad, yazilabilir) {
  const kap = h("div", { class: "sayfa" });
  async function ciz() {
    const [maaslar, izinler, hak] = await Promise.all([veri.personelMaaslari(ad), veri.personelIzinleri(ad), veri.izinHakkiOku(ad).catch(() => null)]);
    const yenile = async () => { const t = await goster(ad, yazilabilir); kap.replaceWith(t); };
    const yil = new Date().getFullYear();
    const kullanilan = izinler.filter((k) => Number(String(k.baslangic).slice(0, 4)) === yil).reduce((t, k) => t + Number(k.gun || 0), 0);
    const hakSayi = hak ?? 14;
    kap.replaceChildren(
      kart(kartBasligi("Maaş", ad),
        maaslar.length ? maaslar.map((k) => maasSatiri(k, ad, yazilabilir, yenile)) : bosDurum("Kayıt yok"),
        yazilabilir ? ekleDugmesi("Maaş kaydı ekle", () => maasFormu(ad, null, yenile)) : null),
      kart(kartBasligi("İzin", ad),
        bilgiSatiri("Yıllık izin hakkı", `${hakSayi} gün`), bilgiSatiri(`${yil} yılında kullanılan`, `${kullanilan} gün`), bilgiSatiri("Kalan", `${hakSayi - kullanilan} gün`),
        yazilabilir ? h("button", { class: "dugme ikincil genis", type: "button", onclick: () => izinHakkiFormu(ad, hakSayi, yenile) }, "İzin hakkını düzenle") : null,
        izinler.length ? izinler.map((k) => izinSatiri(k, ad, yazilabilir, yenile)) : bosDurum("İzin kaydı yok"),
        yazilabilir ? ekleDugmesi("İzin kaydı ekle", () => izinFormu(ad, null, yenile)) : null),
    );
  }
  await ciz();
  return kap;
}

export const yoneticiPaneli = (ad) => goster(ad, true);
export const calisanGorunumu = (ad) => goster(ad, false);
