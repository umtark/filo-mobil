// Masaüstündeki ekle / düzenle / sil pencerelerinin telefon karşılığı. Kayıtlar masaüstüyle aynı biçimde yazılır (alan adları, tarih biçimi,
// hesaplamalar); masaüstü bu kayıtları senkronla aynen alır. Yazma yetkisini ekranlar denetler, sunucu ayrıca zorlar.
import { h, ikon, detayYenile, geri, panelAc, toast } from "./ui.js";
import * as veri from "./veri.js";
import { formAc, onayAc, trTarih, trdenIso, isodanTr, yuvarla } from "./form.js";
import { sayi, tarihCoz, sirala, ayAdi } from "./bicim.js";
import * as api from "./api.js";
import { baslik as mb, etiket as me, duz as md } from "./metin.js";

// Kayıt kaydedilince listeyi (ve açık detayı) yeniler; detaydan silinince önce bir adım geri dönülür.
export async function sonra(detaydan = false) {
  if (detaydan) { geri(); await new Promise((r) => setTimeout(r, 150)); }
  await detayYenile({ kok: true });
}

const tekil = (liste) => [...new Set(liste.map((x) => String(x || "").trim()).filter(Boolean))].sort(sirala);
const enSonTarih = (tarihler) => tarihler.map(tarihCoz).filter(Boolean).sort((a, b) => b - a)[0] || null;

// ── Fatura ──────────────────────────────────────────────────────────────────
const KDV_ORANLARI = [0, 1, 8, 10, 18, 20];
const TEVKIFAT = [[0, "Yok (0/10)"], [2, "2/10"], [3, "3/10"], [4, "4/10"], [5, "5/10"], [7, "7/10"], [9, "9/10"], [10, "Tam (10/10)"]];
const tevkifatAdi = (p) => (TEVKIFAT.find(([k]) => k === p) || TEVKIFAT[0])[1];

// Masaüstündeki hesapla_tutarlar ile aynı: KDV, tevkifat payı kadar KDV'den düşülür.
export function hesaplaTutarlar(matrah, kdvOrani, tevPayi) {
  const kdv = matrah * (kdvOrani / 100);
  const tev = kdv * (tevPayi / 10);
  const odenecek = kdv - tev;
  return { kdv: yuvarla(kdv), tev: yuvarla(tev), toplam: yuvarla(matrah + odenecek) };
}

function kalemAlani(ilk) {
  const satirlar = [];
  const kap = h("div", { class: "kalemler" });
  const ozet = h("p", { class: "kalem-ozet" });

  function guncelle() {
    let m = 0, t = 0;
    for (const s of satirlar) { const k = s.oku(); if (k) { m += k.matrah; t += k.toplam; } }
    ozet.textContent = `${me("fatura_form_toplam_matrah_lbl")} ${yuvarla(m).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} · ${me("fatura_form_genel_toplam_lbl")} ${yuvarla(t).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;
  }
  function ekle(k = {}) {
    const aciklama = h("input", { class: "girdi", type: "text", maxlength: "200", placeholder: "Kalem açıklaması", "aria-label": "Kalem açıklaması" });
    aciklama.value = k.aciklama || "";
    const matrah = h("input", { class: "girdi", type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Matrah", "aria-label": "Matrah", oninput: guncelle });
    matrah.value = k.matrah ? String(k.matrah).replace(".", ",") : "";
    const kdv = h("select", { class: "girdi", "aria-label": me("qlabel_kdv_orani"), onchange: guncelle }, KDV_ORANLARI.map((x) => h("option", { value: x }, `KDV %${x}`)));
    const oran = k.kdv_orani === undefined || k.kdv_orani === null || k.kdv_orani === "" ? 20 : sayi(k.kdv_orani);
    if (!KDV_ORANLARI.includes(oran)) kdv.append(h("option", { value: oran }, `KDV %${oran}`));
    kdv.value = String(oran);
    const tev = h("select", { class: "girdi", "aria-label": "Tevkifat", onchange: guncelle }, TEVKIFAT.map(([v, ad]) => h("option", { value: v }, `Tevkifat ${ad}`)));
    tev.value = String(Math.round(sayi(k.tev_oran)));
    const kok = h("div", { class: "kalem" }, aciklama, matrah, h("div", { class: "iki-sutun" }, kdv, tev),
      h("button", { class: "dugme ikincil kalem-sil", type: "button", onclick: () => { satirlar.splice(satirlar.indexOf(s), 1); kok.remove(); guncelle(); } }, "Kalemi kaldır"));
    const s = {
      kok,
      oku() {
        const m = sayi(matrah.value);
        if (!(m > 0)) return null;
        const kdvOrani = sayi(kdv.value), tevPayi = Number(tev.value);
        const x = hesaplaTutarlar(m, kdvOrani, tevPayi);
        return { aciklama: aciklama.value.trim(), matrah: m, kdv_orani: kdvOrani, tev_oran: tevPayi, kdv_tutar: x.kdv, tev_tutari: x.tev, toplam: x.toplam, tev_isim: tevkifatAdi(tevPayi) };
      },
    };
    satirlar.push(s);
    kap.append(kok);
    guncelle();
  }
  (ilk && ilk.length ? ilk : [{}]).forEach(ekle);
  const kok = h("div", { class: "alan" }, h("span", {}, me("kalemler_basligi")), kap, ozet,
    h("button", { class: "dugme ikincil", type: "button", onclick: () => ekle() }, ikon("arti", 18), "Kalem ekle"));
  return { kok, oku: () => satirlar.map((s) => s.oku()).filter(Boolean), bos: () => !satirlar.some((s) => s.oku()) };
}

export async function faturaFormu(id, { detaydan = false } = {}) {
  const k = id ? await veri.hamKayit("faturalar", id) : null;
  const firmalar = tekil((await veri.faturalar()).map((f) => f.firma));
  let kalemler = [];
  if (k) {
    if (Array.isArray(k.Kalemler) && k.Kalemler.length) kalemler = k.Kalemler;
    else {
      const t = String(k.Tevkifat || "").match(/(\d+)\s*\/\s*10/);
      kalemler = [{ aciklama: k.Aciklama || "", matrah: sayi(k.Matrah), kdv_orani: sayi(k["KDV %"]), tev_oran: t ? Number(t[1]) : 0 }];
    }
  }
  const baslangic = k ? { Tip: k.Tip, Tarih: k.Tarih, "Fatura No": k["Fatura No"], Firma: k.Firma, Aciklama: k.Aciklama, kalemler } : { Tip: "Gelen" };
  formAc({
    baslik: k ? mb("fatura_duzenle_baslik") : mb("fatura_ekle_baslik"), deger: baslangic,
    alanlar: [
      { ad: "Tip", etiket: me("qlabel_fatura_tipi"), tur: "segment", secenekler: [["Gelen", "Gelen"], ["Giden", "Giden"]] },
      { ad: "Tarih", etiket: "Tarih", tur: "tarih", zorunlu: true, bugun: true },
      { ad: "Fatura No", etiket: me("qlabel_fatura_no"), zorunlu: true, uzunluk: 40 },
      { ad: "Firma", etiket: "Firma", zorunlu: true, liste: firmalar },
      { ad: "Aciklama", etiket: "Açıklama" },
      { ad: "kalemler", etiket: me("kalemler_basligi"), tur: "ozel", zorunlu: true, kur: (ilk) => kalemAlani(ilk) },
    ],
    kaydet: async (g) => {
      const kl = g.kalemler;
      const toplam = (a) => yuvarla(kl.reduce((t, x) => t + x[a], 0));
      await veri.kayitKaydet("faturalar", id, (v) => ({
        ...v, Tarih: g.Tarih, Tip: g.Tip, "Fatura No": g["Fatura No"], Firma: g.Firma, Aciklama: g.Aciklama,
        Matrah: toplam("matrah"), "KDV %": kl.length === 1 ? kl[0].kdv_orani : "Çeşitli", "KDV Tutari": toplam("kdv_tutar"),
        Tevkifat: kl.length === 1 ? kl[0].tev_isim : `Çeşitli (${kl.length} Kalem)`, "Tev.Tutarı": toplam("tev_tutari"), Toplam: toplam("toplam"), Kalemler: kl,
      }));
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("faturalar", id); await sonra(detaydan); }),
    silMesaj: "Bu fatura silinsin mi?",
  });
}

// ── Araç ────────────────────────────────────────────────────────────────────
const BELGE_ALANLARI = [["muayene_tarihi", me("muayene_bitis_lbl")], ["trafik_tarihi", me("trafik_bitis_lbl")], ["kasko_tarihi", me("kasko_bitis_lbl")], ["koltuk_sigortasi", me("koltuk_sigortasi_lbl")],
  ["guzergah_tarihi", me("guzergah_tarihi_lbl")], ["yag_bakim_tarihi", me("yag_bakim_lbl")], ["genel_bakim_tarihi", me("genel_bakim_lbl")]];

export async function aracFormu(id, { detaydan = false } = {}) {
  const k = id ? await veri.hamKayit("araclar", id) : null;
  const tumu = await veri.araclar();
  const alanlar = [
    { ad: "plaka", etiket: "Plaka", zorunlu: true, buyuk: true, uzunluk: 20 },
    { ad: "firma", etiket: me("firma_sahibi_lbl"), liste: tekil(tumu.map((a) => a.firma)) },
    { yan: [{ ad: "marka", etiket: "Marka" }, { ad: "model", etiket: "Model" }] },
    { yan: [{ ad: "yil", etiket: me("model_yili_lbl"), uzunluk: 4 }, { ad: "km", etiket: me("hr_km"), uzunluk: 12 }] },
    { yan: [{ ad: "yakit", etiket: "Yakıt", tur: "secim", secenekler: ["Dizel", "Benzin", "LPG", "Elektrik", "Hibrit"] }, { ad: "vites", etiket: me("vites_tipi_lbl"), tur: "secim", secenekler: ["Manuel", "Otomatik", "Yarı Otomatik"] }] },
    { yan: [{ ad: "utts", etiket: me("utts_durumu_lbl"), tur: "secim", secenekler: ["Var", "Yok"], bos: false }, { ad: "hgs", etiket: me("hgs_durumu_lbl"), tur: "secim", secenekler: ["Var", "Yok"], bos: false }] },
    { ad: "sofor", etiket: me("sofor_lbl") },
    { ad: "sofor_tel", etiket: me("sofor_tel_lbl"), tur: "tel" },
    { ad: "kurum", etiket: me("kurum_lbl") },
    { yan: [{ ad: "vergi_no", etiket: me("vergi_tc_lbl") }, { ad: "ruhsat_no", etiket: me("ruhsat_belge_no_lbl") }] },
    { ad: "sasi", etiket: mb("hr_sasi"), buyuk: true },
    ...BELGE_ALANLARI.map(([ad, etiket]) => ({ ad, etiket, tur: "tarih", bosDeger: "-", ipucu: "Boş bırakırsanız belge yok sayılır." })),
  ];
  formAc({
    baslik: k ? mb("dlg_arac_duzenle") : mb("dlg_yeni_arac_ekle"), alanlar, deger: k || { utts: "Yok", hgs: "Yok", yakit: "Dizel", vites: "Manuel" },
    kaydet: async (g) => {
      if (tumu.some((a) => a.id !== id && a.plaka.replace(/\s+/g, "") === g.plaka.replace(/\s+/g, ""))) throw new Error("Bu plakayla başka bir araç kayıtlı.");
      await veri.kayitKaydet("araclar", id, (v) => ({ ek_soforler: [], ...v, ...g }));
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("araclar", id); await sonra(detaydan); }),
    silMesaj: "Bu araç ve tüm bakım/harcama kayıtları silinsin mi?",
  });
}

const KAYIT_TURLERI = { yag: ["yakit_kayitlari", "yag_bakim_tarihi", mb("tab_yakt_kaytlar")], bakim: ["bakim_kayitlari", "genel_bakim_tarihi", mb("tab_bakm__servis")], harcama: ["harcama_kayitlari", null, mb("tab_harcamalar")] };

// Yağ bakımı: tarih ve kilometre masaüstünde tek alanda tutulur ("gg.aa.yyyy / km").
function yagDegeri(k) {
  const [t, ...km] = String(k.tarih_km || "").split("/");
  return { ...k, tarih: t.trim().split(/\s+/)[0], km: km.join("/").trim() };
}

// aracId verilmezse formda araç seçtirilir (listelerdeki "yeni kayıt" düğmesi).
export async function aracKayitFormu(aracId, tur, kayitId, { detaydan = false } = {}) {
  const [dizi, bakimAlani, ad] = KAYIT_TURLERI[tur];
  const araclar = (await veri.araclar()).slice().sort((a, b) => sirala(a.plaka, b.plaka));
  const arac = aracId ? await veri.hamKayit("araclar", aracId) : null;
  const eski = kayitId && arac ? (arac[dizi] || []).find((x) => x.id === kayitId) : null;
  if (kayitId && !eski) throw new Error("Kayıt bulunamadı.");
  const tutarAlani = (ad2, etiket) => ({ ad: ad2, etiket, tur: "para" });
  const alanlar = [
    !aracId && { ad: "arac", etiket: me("qlabel_mevcut_arac"), tur: "secim", zorunlu: true, secenekler: araclar.map((a) => [a.id, a.plaka]) },
    { ad: "tarih", etiket: "Tarih", tur: "tarih", zorunlu: true, bugun: true },
    ...(tur === "yag" ? [
      { ad: "km", etiket: me("hr_km2"), uzunluk: 12 },
      { yan: [{ ad: "yag_cinsi", etiket: me("yag_cinsi_lbl"), liste: ["5/30", "10/40", "15/40"] }, { ad: "yag_lt", etiket: me("yag_lt_lbl") }] },
      { yan: [{ ad: "yag_filtresi", etiket: me("yag_filtresi_lbl"), liste: ["DEĞİŞTİ"] }, { ad: "mazot_filtresi", etiket: me("mazot_filtresi_lbl"), liste: ["DEĞİŞTİ"] }] },
      { yan: [{ ad: "hava_filtresi", etiket: me("hava_filtresi_lbl"), liste: ["DEĞİŞTİ"] }, { ad: "hava_kompresoru", etiket: me("hava_kompresoru_lbl"), liste: ["DEĞİŞTİ"] }] },
      { yan: [{ ad: "usta", etiket: me("usta_lbl") }, { ad: "yaptiran", etiket: mb("isi_yaptiran") }] },
      { ad: "notlar", etiket: "Not", tur: "uzun" },
    ] : [
      { ad: "aciklama", etiket: "Açıklama", zorunlu: true, tur: "uzun" },
      tutarAlani("tutar", "Tutar"),
      ...(tur === "bakim" ? [tutarAlani("iscilik", "İşçilik")] : []),
    ]),
  ].filter(Boolean);
  const deger = eski ? (tur === "yag" ? yagDegeri(eski) : eski) : {};
  formAc({
    baslik: eski ? `${mb("kayit_duzenle")} · ${ad}` : `${mb("yeni_kayit_ekle")} · ${ad}`, alanlar, deger,
    kaydet: async (g) => {
      const hedef = aracId || g.arac;
      await veri.kayitKaydet("araclar", hedef, (a) => {
        const liste = Array.isArray(a[dizi]) ? a[dizi] : (a[dizi] = []);
        let kayit;
        if (tur === "yag") {
          kayit = { usta: g.usta, notlar: g.notlar, yag_lt: g.yag_lt, tarih_km: g.km ? `${g.tarih} / ${g.km}` : g.tarih, yaptiran: g.yaptiran, yag_cinsi: g.yag_cinsi,
            yag_filtresi: g.yag_filtresi, hava_filtresi: g.hava_filtresi, mazot_filtresi: g.mazot_filtresi, hava_kompresoru: g.hava_kompresoru };
        } else if (tur === "bakim") kayit = { tarih: g.tarih, tutar: g.tutar, iscilik: g.iscilik, aciklama: g.aciklama };
        else kayit = { tarih: g.tarih, tutar: g.tutar, aciklama: g.aciklama };
        const i = eski ? liste.findIndex((x) => x.id === kayitId) : -1;
        if (i >= 0) liste[i] = { ...liste[i], ...kayit };
        else liste.push({ id: veri.yeniKimlik(), ...kayit });
        // "Son yağ bakımı / genel bakım" tarihi, kayıtların en yenisine çekilir (daha ileri tarihliyse dokunulmaz).
        if (bakimAlani) {
          const son = enSonTarih(liste.map((x) => (tur === "yag" ? yagDegeri(x).tarih : x.tarih)));
          const mevcut = tarihCoz(a[bakimAlani]);
          if (son && (!mevcut || son > mevcut)) a[bakimAlani] = trTarih(son);
        }
        return a;
      });
      await sonra();
    },
    sil: eski && (async () => {
      await veri.kayitKaydet("araclar", aracId, (a) => { a[dizi] = (a[dizi] || []).filter((x) => x.id !== kayitId); return a; });
      await sonra(detaydan);
    }),
    silMesaj: `Bu ${ad.toLocaleLowerCase("tr")} kaydı silinsin mi?`,
  });
}

// ── Esnaf ───────────────────────────────────────────────────────────────────
export async function esnafFormu(id, { detaydan = false } = {}) {
  const k = id ? await veri.hamKayit("esnaflar", id) : null;
  formAc({
    baslik: k ? mb("kayit_duzenle") : mb("esnaf_yeni_ekle"), deger: k || {},
    alanlar: [{ ad: "isim", etiket: me("esnaf_adi_gir"), zorunlu: true, buyuk: true }],
    kaydet: async (g) => {
      const tumu = await veri.esnaflar();
      if (tumu.some((e) => e.id !== id && e.isim.toLocaleLowerCase("tr") === g.isim.toLocaleLowerCase("tr"))) throw new Error("Bu isimde bir esnaf zaten var.");
      await veri.kayitKaydet("esnaflar", id, (v) => ({ islemler: [], ...v, isim: g.isim }));
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("esnaflar", id); await sonra(detaydan); }),
    silMesaj: "Bu esnaf ve tüm işlemleri silinsin mi?",
  });
}

// Masaüstüyle aynı: işlemde toplam = tutar + işçilik; ödemede tutar 0, toplam ödenen tutardır.
export async function esnafIslemFormu(esnafId, islemId, { odeme = false } = {}) {
  const e = await veri.hamKayit("esnaflar", esnafId);
  const eski = islemId ? (e.islemler || []).find((x) => x.id === islemId) : null;
  const odemeMi = eski ? Boolean(eski.is_odeme) : odeme;
  const araclar = tekil((await veri.araclar()).map((a) => a.plaka));
  const deger = eski ? { ...eski, tutar: odemeMi ? eski.toplam : eski.tutar, plaka: eski.plaka === "-" ? "" : eski.plaka } : {};
  formAc({
    baslik: `${eski ? mb("kayit_duzenle") : odemeMi ? mb("esnaf_odeme_yap") : mb("esnaf_islem_ekle")} · ${e.isim}`, deger,
    alanlar: [
      { ad: "tarih", etiket: "Tarih", tur: "tarih", zorunlu: true, bugun: true },
      ...(odemeMi ? [] : [{ ad: "plaka", etiket: "Plaka", buyuk: true, liste: araclar }]),
      { ad: "aciklama", etiket: "Açıklama", tur: "uzun", varsayilan: odemeMi ? "Nakit/EFT Ödeme" : "" },
      { ad: "tutar", etiket: odemeMi ? me("hr_odenen") : "Tutar", tur: "para", zorunlu: true, zorunluPozitif: true },
      ...(odemeMi ? [] : [{ ad: "iscilik", etiket: "İşçilik", tur: "para" }]),
    ],
    kaydet: async (g) => {
      const iscilik = odemeMi ? 0 : g.iscilik;
      const kayit = { plaka: odemeMi ? "-" : g.plaka || "-", tarih: g.tarih, tutar: odemeMi ? 0 : g.tutar, toplam: yuvarla(odemeMi ? g.tutar : g.tutar + iscilik),
        iscilik, aciklama: g.aciklama, is_odeme: odemeMi, islem_tipi: odemeMi ? "Ödeme" : "" };
      await veri.kayitKaydet("esnaflar", esnafId, (v) => {
        const liste = Array.isArray(v.islemler) ? v.islemler : (v.islemler = []);
        const i = eski ? liste.findIndex((x) => x.id === islemId) : -1;
        if (i >= 0) liste[i] = { ...liste[i], ...kayit };
        else liste.push({ id: veri.yeniKimlik(), ...kayit });
        return v;
      });
      await sonra();
    },
    sil: eski && (async () => {
      await veri.kayitKaydet("esnaflar", esnafId, (v) => { v.islemler = (v.islemler || []).filter((x) => x.id !== islemId); return v; });
      await sonra();
    }),
    silMesaj: "Bu işlem silinsin mi?",
  });
}

// ── Akaryakıt ───────────────────────────────────────────────────────────────
export async function akaryakitFormu(id, { detaydan = false } = {}) {
  const k = id ? await veri.hamKayit("akaryakit", id) : null;
  const [araclar, kayitlar] = await Promise.all([veri.araclar(), veri.akaryakit()]);
  const deger = k ? { ...k, tur: k.is_odeme ? "odeme" : "alim", plaka: k.arac_id || "" } : { tur: "alim" };
  formAc({
    baslik: k ? mb("kayit_duzenle") : mb("petrol_yeni_alim_ekle"), deger,
    alanlar: [
      { ad: "tur", etiket: "Kayıt türü", tur: "segment", secenekler: [["alim", mb("hr_yakit")], ["odeme", mb("hr_odeme")]] },
      { ad: "tarih", etiket: "Tarih", tur: "tarih", iso: true, zorunlu: true, bugun: true },
      { ad: "istasyon", etiket: "İstasyon", zorunlu: true, buyuk: true, liste: tekil(kayitlar.map((r) => r.istasyon)) },
      { ad: "plaka", etiket: me("qlabel_araç_seçimi"), tur: "secim", secenekler: araclar.slice().sort((a, b) => sirala(a.plaka, b.plaka)).map((a) => [a.id, a.plaka]) },
      { yan: [{ ad: "litre", etiket: me("qlabel_litre_l"), tur: "para" }, { ad: "fiyat", etiket: me("qlabel_birim_fiyat"), tur: "para" }] },
      { ad: "tutar", etiket: me("qlabel_toplam_tutar"), tur: "para", ipucu: "Boş bırakırsanız litre × fiyat alınır." },
      { yan: [{ ad: "fis_no", etiket: me("ic_col_fis_no") }, { ad: "aciklama", etiket: "Açıklama" }] },
    ],
    kaydet: async (g) => {
      const odeme = g.tur === "odeme";
      const tutar = g.tutar || (odeme ? 0 : yuvarla(g.litre * g.fiyat));
      if (!(tutar > 0)) throw new Error("Tutar girin (ya da litre ve fiyat).");
      const secili = araclar.find((a) => a.id === g.plaka);
      const kayit = { tarih: g.tarih, istasyon: g.istasyon, litre: odeme ? 0 : g.litre, fiyat: odeme ? 0 : g.fiyat, tutar, fis_no: g.fis_no, is_odeme: odeme,
        arac_id: odeme ? "" : g.plaka, aciklama: g.aciklama || (odeme ? "Nakit/EFT Ödeme" : "") };
      if (secili && !odeme) kayit.plaka_yedek = secili.plaka;
      await veri.kayitKaydet("akaryakit", id, (v) => ({ kaynak: "uygulama", ...v, ...kayit }));
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("akaryakit", id); await sonra(detaydan); }),
    silMesaj: "Bu akaryakıt kaydı silinsin mi?",
  });
}

// ── İç hizmet ───────────────────────────────────────────────────────────────
const buyukTr = (s) => String(s || "").trim().replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();

export async function icHizmetFormu(id, { detaydan = false } = {}) {
  const [k, liste, fiyatlar, yerler, soforler, araclar] = await Promise.all([
    id ? veri.hamKayit("ic_hizmetler", id) : null, veri.icHizmet(), veri.icFiyatlar(), veri.icYerler(), veri.icSoforler(), veri.araclar()]);
  const fiyat = new Map(fiyatlar.map((f) => [f.guzergah, sayi(f.birim_fiyat)]));
  formAc({
    baslik: k ? mb("ic_duzenle") : md("ic_yeni_sefer"), deger: k || {},
    alanlar: [
      { yan: [{ ad: "tarih", etiket: "Tarih", tur: "tarih", zorunlu: true, bugun: true }, { ad: "saat", etiket: me("ic_col_saat"), zorunlu: true, uzunluk: 5, yerTutucu: "10:50" }] },
      { ad: "plaka", etiket: "Plaka", zorunlu: true, buyuk: true, liste: tekil(araclar.map((a) => a.plaka)) },
      { ad: "sofor", etiket: mb("hr_sofor"), liste: tekil([...soforler.map((s) => s.tam_ad), ...liste.map((s) => s.sofor)]) },
      { ad: "guzergah", etiket: me("ic_guzergah"), zorunlu: true, liste: [...fiyat.keys()] },
      { ad: "gidilen_yer", etiket: me("ic_col_gidilen_yer"), zorunlu: true, liste: yerler.map((y) => y.yer) },
      { ad: "personel", etiket: me("ic_col_personel"), zorunlu: true, tur: "uzun", satir: 2 },
      { yan: [{ ad: "kisi_sayisi", etiket: me("ic_col_kisi"), tur: "sayi", tamSayi: true, varsayilan: 1 }, { ad: "fis_no", etiket: me("ic_col_fis_no"), zorunlu: true }] },
      { ad: "tutar", etiket: me("ic_col_sefer"), tur: "para", ipucu: "Boş bırakırsanız güzergahın birim fiyatı alınır." },
      { ad: "aciklama", etiket: "Açıklama" },
    ],
    kaydet: async (g) => {
      const kisi = Math.max(1, g.kisi_sayisi || 1);
      const tutar = g.tutar || fiyat.get(g.guzergah) || 0;
      if (!(tutar > 0)) throw new Error("Sefer ücretini girin.");
      const norm = (f) => { const n = Number(String(f).trim()); return Number.isFinite(n) ? String(Math.trunc(n)) : String(f).trim(); };
      const tekrar = liste.find((s) => s.id !== id && norm(s.fis) === norm(g.fis_no));
      if (tekrar && !(await onayAc("Mükerrer fiş", `Bu fiş numarası (${g.fis_no}) kayıtlı: ${tekrar.plaka} · ${tekrar.guzergah}. Yine de kaydedilsin mi?`, "Yine de kaydet"))) throw new Error("Vazgeçildi.");
      await veri.kayitKaydet("ic_hizmetler", id, (v) => ({
        bolum: "", bolum_dagilim: {}, sira_no: String(liste.length + 1), ...v,
        tarih: g.tarih, saat: g.saat, plaka: g.plaka, sofor: buyukTr(g.sofor), personel: buyukTr(g.personel), guzergah: g.guzergah,
        gidilen_yer: buyukTr(g.gidilen_yer), kisi_sayisi: kisi, tutar, fis_no: g.fis_no, aciklama: g.aciklama,
      }));
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("ic_hizmetler", id); await sonra(detaydan); }),
    silMesaj: "Bu sefer silinsin mi?",
  });
}

// ── Okul ────────────────────────────────────────────────────────────────────
// Masaüstü kuralı: odeme_kayitlari[ay] = { tarih: ayın son ödeme tarihi, odenen: ayın toplamı }; yalnızca değişen aylar yeniden yazılır.
function odemeKayitlariYenile(v, aylar) {
  const gecmis = Array.isArray(v.odeme_gecmisi) ? v.odeme_gecmisi : [];
  if (!v.odeme_kayitlari || typeof v.odeme_kayitlari !== "object") v.odeme_kayitlari = {};
  for (const ay of aylar) {
    const o = gecmis.filter((g) => g.ay === ay && String(g.donem_harici) !== "true");
    if (!o.length) { delete v.odeme_kayitlari[ay]; continue; }
    const son = enSonTarih(o.map((g) => g.tarih));
    v.odeme_kayitlari[ay] = { tarih: son ? trTarih(son) : "", odenen: yuvarla(o.reduce((t, g) => t + sayi(g.tutar), 0)) };
  }
}

export async function odemeFormu(ogrenciId, odemeId, { detaydan = false } = {}) {
  const o = await veri.hamKayit("okul_ogrenciler", ogrenciId);
  const eski = (o.odeme_gecmisi || []).find((x) => x.id === odemeId);
  if (!eski) throw new Error("Ödeme bulunamadı.");
  formAc({
    baslik: mb("petrol_odeme_duzenle"), deger: { ...eski, yontem: eski.yontem || "nakit" },
    alanlar: [
      { ad: "tutar", etiket: me("okul_tutar_lbl"), tur: "para", zorunlu: true, zorunluPozitif: true },
      { ad: "tarih", etiket: me("okul_odeme_tarih_lbl"), tur: "tarih", zorunlu: true },
      { ad: "yontem", etiket: me("tah_yontem_lbl"), tur: "segment", secenekler: [["nakit", mb("tah_yontem_nakit")], ["iban", mb("tah_yontem_iban")], ["kart", mb("tah_yontem_kart")]] },
      { ad: "not", etiket: mb("okul_gecmis_col_not") },
    ],
    kaydet: async (g) => {
      const t = tarihCoz(g.tarih);
      const ay = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
      await veri.kayitKaydet("okul_ogrenciler", ogrenciId, (v) => {
        const i = (v.odeme_gecmisi || []).findIndex((x) => x.id === odemeId);
        if (i < 0) throw new Error("Ödeme bulunamadı.");
        const eskiAy = v.odeme_gecmisi[i].ay;
        v.odeme_gecmisi[i] = { ...v.odeme_gecmisi[i], tutar: yuvarla(g.tutar), tarih: g.tarih, ay, yontem: g.yontem, not: g.not };
        odemeKayitlariYenile(v, new Set([eskiAy, ay]));
        return v;
      });
      await sonra();
    },
    sil: async () => {
      await veri.kayitKaydet("okul_ogrenciler", ogrenciId, (v) => {
        const hedef = (v.odeme_gecmisi || []).find((x) => x.id === odemeId);
        v.odeme_gecmisi = (v.odeme_gecmisi || []).filter((x) => x.id !== odemeId);
        if (hedef) odemeKayitlariYenile(v, new Set([hedef.ay]));
        return v;
      });
      await sonra();
    },
    silMesaj: "Bu ödeme silinsin mi? Öğrencinin kalan tutarı artar.",
  });
}

export async function ogrenciFormu(id, { detaydan = false } = {}) {
  const k = id ? await veri.hamKayit("okul_ogrenciler", id) : null;
  const [servisler, tumu] = await Promise.all([veri.okulServisler(), veri.hamListe("okul_ogrenciler")]);
  formAc({
    baslik: k ? mb("okul_duzenle_ogrenci") : md("okul_yeni_ogrenci"), deger: k || {},
    alanlar: [
      { ad: "ad_soyad", etiket: me("okul_col_adsoyad"), zorunlu: true, buyuk: true },
      { yan: [{ ad: "sinif", etiket: me("okul_col_sinif") }, { ad: "tc_kimlik", etiket: me("okul_col_tc"), uzunluk: 11 }] },
      { ad: "veli_adi", etiket: me("okul_col_veli_adi") },
      { ad: "veli_tel", etiket: me("okul_col_veli_tel"), tur: "tel" },
      { yan: [{ ad: "anne_tel", etiket: me("okul_col_anne_tel"), tur: "tel" }, { ad: "baba_tel", etiket: me("okul_col_baba_tel"), tur: "tel" }] },
      { ad: "ogrenci_tel", etiket: me("okul_col_ogrenci_tel"), tur: "tel" },
      { ad: "adres", etiket: me("okul_col_adres"), tur: "uzun" },
      { yan: [{ ad: "aylik_odeme", etiket: me("tah_col_donem"), tur: "para" }, { ad: "liste_ucreti", etiket: "Liste ücreti", tur: "para" }] },
      { ad: "servis_plaka", etiket: me("okul_col_servis"), tur: "secim", secenekler: servisler.map((s) => [s.plaka, `${s.plaka}${s.sofor ? " · " + s.sofor : ""}`]) },
      { ad: "servis_kullanmiyor", etiket: me("okul_servis_kullanmiyor_rozet"), tur: "onay" },
      { ad: "notlar", etiket: me("okul_col_notlar"), tur: "uzun" },
    ],
    kaydet: async (g) => {
      const sira = tumu.filter((x) => !String(x.id).startsWith("srv_")).reduce((m, x) => Math.max(m, sayi(x.sira_no)), 0);
      await veri.kayitKaydet("okul_ogrenciler", id, (v) => {
        const plakaDegisti = String(v.servis_plaka || "") !== String(g.servis_plaka || "");
        const yeni = { odeme_kayitlari: {}, odeme_gecmisi: [], sira_no: sira + 1, ...v, ...g, _ts: Date.now() / 1000 };
        if (g.servis_plaka && plakaDegisti) {
          yeni.servis_sira = tumu.filter((x) => String(x.servis_plaka || "").trim() === g.servis_plaka && x.id !== id).reduce((m, x) => Math.max(m, sayi(x.servis_sira)), 0) + 1;
        }
        return yeni;
      });
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("okul_ogrenciler", id); await sonra(detaydan); }),
    silMesaj: "Bu öğrenci ve ödeme geçmişi silinsin mi?",
  });
}

export async function servisFormu(id, { detaydan = false } = {}) {
  const k = id ? await veri.hamKayit("okul_ogrenciler", id) : null;
  const ay = await veri.ayarlar().catch(() => ({}));
  const kademeler = Object.entries(ay.okul_puantaj_kademe_etiket || {}).map(([kod, ad]) => [kod, ad]);
  const tumu = await veri.okulServisler();
  const belge = (ad, etiket) => ({ ad, etiket, tur: "tarih", bosDeger: "" });
  formAc({
    baslik: md("servis_araci_ekle_duzenle"), deger: k || {},
    alanlar: [
      { ad: "plaka", etiket: me("okul_srv_col_plaka"), zorunlu: true, buyuk: true },
      { yan: [{ ad: "arac_no", etiket: "Araç no" }, { ad: "arac_tipi", etiket: me("okul_srv_col_tip"), yerTutucu: "29+1" }] },
      { ad: "kademe", etiket: "Kademe", tur: "secim", secenekler: kademeler },
      { ad: "guzergah", etiket: me("okul_srv_col_guzergah") },
      { ad: "sofor_ad", etiket: me("okul_srv_col_sofor"), buyuk: true },
      { ad: "sofor_tel", etiket: me("okul_srv_col_tel"), tur: "tel" },
      { ad: "arac_sahibi", etiket: me("okul_srv_col_sahip"), buyuk: true },
      { ad: "aylik_ucret", etiket: me("okul_srv_col_ucret"), tur: "para" },
      belge("sigorta_bitis", me("okul_srv_col_sigorta")), belge("muayene_bitis", me("okul_srv_col_muayene")), belge("koltuk_bitis", me("okul_srv_col_koltuk")),
    ],
    kaydet: async (g) => {
      if (tumu.some((s) => s.id !== id && s.plaka.replace(/\s+/g, "") === g.plaka.replace(/\s+/g, ""))) throw new Error("Bu plakayla başka bir servis kayıtlı.");
      const sira = tumu.reduce((m, s) => Math.max(m, s.sira), 0);
      await veri.kayitKaydet("okul_ogrenciler", id, (v) => {
        const yeni = { id: v.id || veri.yeniKimlik("srv_"), puantaj: {}, odemeler: {}, sira_no: sira + 1, ...v, ...g };
        return yeni;
      });
      await sonra();
    },
    sil: k && (async () => { await veri.kayitSil("okul_ogrenciler", id); await sonra(detaydan); }),
    silMesaj: "Bu servis kaydı silinsin mi? Servise atanmış öğrencilerin plaka bilgisi kalır.",
  });
}

// ── Şirket evrakı ───────────────────────────────────────────────────────────
// Dosyanın kendisi masaüstünde Google Drive'a yüklenir; telefondan yalnızca bilgileri düzenlenir ve kayıt (dosya değil) silinir.
export async function evrakFormu(id, { detaydan = false } = {}) {
  const [k, tumu] = await Promise.all([veri.hamKayit("sirket_evraklari", id), veri.sirketEvraklari()]);
  if (!k) throw new Error("Evrak bulunamadı.");
  formAc({
    baslik: mb("sevrak_dlg_duzenle"), deger: k,
    alanlar: [
      { ad: "baslik", etiket: me("sevrak_baslik_lbl"), zorunlu: true },
      { ad: "firma", etiket: me("sevrak_firma"), liste: tekil(tumu.map((r) => r.firma)) },
      { ad: "kategori", etiket: me("sevrak_kategori"), liste: tekil(tumu.map((r) => r.kategori)) },
      { yan: [{ ad: "belge_tarihi", etiket: me("sevrak_belge_tarihi"), tur: "tarih", bosDeger: "" }, { ad: "gecerlilik", etiket: me("sevrak_gecerlilik"), tur: "tarih", bosDeger: "" }] },
      { ad: "etiketler", etiket: me("sevrak_etiketler") },
      { ad: "not", etiket: me("sevrak_not"), tur: "uzun" },
      { ad: "arsiv", etiket: "Arşivde", tur: "onay" },
    ],
    kaydet: async (g) => { await veri.kayitKaydet("sirket_evraklari", id, (v) => ({ ...v, ...g })); await sonra(); },
    sil: async () => { await veri.kayitSil("sirket_evraklari", id); await sonra(detaydan); },
    silMesaj: "Evrak kaydı silinsin mi? Dosya Google Drive'da kalır.",
  });
}

// Telefondan evrak yükleme: dosya Supabase fonksiyonu (evrak_drive) ile hemen Google Drive'a konur; masaüstü Drive senkronuyla kendi klasörüne indirir.
// Fonksiyon yayında değilse ya da ulaşılamıyorsa dosya yedek olarak Supabase'in özel "evrak_aktarim" kovasına konur, masaüstü sonra Drive'a taşır.
const EVRAK_KATEGORILERI = ["Vergi Levhası", "Ticaret Sicil Gazetesi", "Ana Sözleşme", "İmza Sirküleri", "Faaliyet Belgesi - Oda Kaydı", "Banka Evrakları", "SGK Evrakları", "Vekaletname",
  "Fatura Belgeleri", "Araç Satış Sözleşmeleri", "Araç Alış Sözleşmeleri", "Diğer Sözleşmeler", "Diğer"];
const EVRAK_BOYUT_SINIRI = 25 * 1024 * 1024;
// Masaüstündeki _sevrak_ad_temizle ile aynı: Windows ve Drive için güvenli klasör/dosya adı.
const evrakAdiTemizle = (ad, varsayilan = "Diger") => (String(ad || "").replace(/[<>:"/\\|?*'\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim().replace(/^[ .-]+|[ .-]+$/g, "").slice(0, 80) || varsayilan);
const yerelIso = (d = new Date()) => { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };

export async function evrakYukle() {
  const tumu = await veri.sirketEvraklari();
  let secili = null;
  const girdi = h("input", { type: "file", class: "girdi", accept: ".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,.xls,.xlsx,.txt,.csv", "aria-label": "Dosya" });
  girdi.addEventListener("change", () => { secili = girdi.files[0] || null; });
  formAc({
    baslik: mb("qpushbutton_evrak_yukle"), kaydetEtiket: "Yükle",
    alanlar: [
      { ad: "dosya", etiket: "Dosya", zorunlu: true, tur: "ozel", kur: () => ({ kok: h("label", { class: "alan" }, h("span", {}, "Dosya"), girdi), oku: () => secili, bos: () => !secili }) },
      { ad: "baslik", etiket: me("sevrak_baslik_lbl") },
      { ad: "firma", etiket: me("sevrak_firma"), zorunlu: true, liste: tekil(tumu.map((r) => r.firma)) },
      { ad: "kategori", etiket: me("sevrak_kategori"), zorunlu: true, liste: tekil([...EVRAK_KATEGORILERI, ...tumu.map((r) => r.kategori)]) },
      { yan: [{ ad: "belge_tarihi", etiket: me("sevrak_belge_tarihi"), tur: "tarih", bosDeger: "" }, { ad: "gecerlilik", etiket: me("sevrak_gecerlilik"), tur: "tarih", bosDeger: "" }] },
      { ad: "etiketler", etiket: me("sevrak_etiketler") },
      { ad: "not", etiket: me("sevrak_not"), tur: "uzun" },
    ],
    kaydet: async (g) => {
      const dosya = g.dosya;
      if (dosya.size > EVRAK_BOYUT_SINIRI) throw new Error("Dosya 25 MB'den büyük olamaz.");
      const m = /^(.*?)(\.[0-9A-Za-z]{1,10})?$/.exec(dosya.name) || [];
      const kok = m[1] || dosya.name, uzanti = String(m[2] || "").toLowerCase();
      const kimlik = veri.yeniKimlik();
      const depoYolu = `${veri.baglam.isletme}/${kimlik}${uzanti}`;
      const yil = (tarihCoz(g.belge_tarihi) || new Date()).getFullYear();
      let dosyaYolu = `Sirket_Evraklari/${evrakAdiTemizle(g.firma)}/${evrakAdiTemizle(g.kategori)}/${yil}/${evrakAdiTemizle(kok, "evrak")}${uzanti.replace(/[^0-9A-Za-z.]/g, "")}`;
      let drive = null;
      try {
        drive = await api.evrakDriveYukle(veri.baglam.isletme, dosyaYolu, dosya);
        dosyaYolu = drive.dosya || dosyaYolu;
      } catch (e) {
        if (e.durum === 401 || e.durum === 403 || e.durum === 413) throw e;   // yetki/boyut sorunu: yedek yolla geçilmez
        await api.depoYukle("evrak_aktarim", depoYolu, dosya);                // fonksiyon yok/erişilemiyor: masaüstü aktarır
      }
      await veri.kayitKaydet("sirket_evraklari", null, () => ({
        id: kimlik, baslik: g.baslik || kok, firma: g.firma, kategori: g.kategori, yil, belge_tarihi: g.belge_tarihi, gecerlilik: g.gecerlilik, etiketler: g.etiketler, not: g.not,
        dosya: dosyaYolu,
        dosya_adi: dosya.name, boyut: dosya.size, ekleyen: (veri.baglam.uye && veri.baglam.uye.ad) || "", eklenme: yerelIso(), arsiv: false, surum_grup: kimlik, metin: "",
        ...(drive ? { drive_id: drive.id } : { aktarim: { durum: "bekliyor", yol: depoYolu } }),
      }));
      await sonra();
    },
  });
}

// ── Servis puantajı ─────────────────────────────────────────────────────────
// puantaj: { "2026-09": [1, 2, 3] } servisin çalışmadığı günler (masaüstüyle aynı; kayıt yoksa her gün çalışılmış sayılır); odemeler: { "2026-09": "15.10.2026" } servis sahibine ödeme tarihi.
const HAFTA = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

export async function puantajPaneliAc(servisId, ay) {
  const k = await veri.hamKayit("okul_ogrenciler", servisId);
  if (!k) throw new Error("Servis bulunamadı.");
  const yil = Number(ay.slice(0, 4)), ayNo = Number(ay.slice(5, 7));
  const gunSayisi = new Date(yil, ayNo, 0).getDate();
  const yok = new Set(((k.puantaj || {})[ay] || []).map(Number));
  const secili = new Set(Array.from({ length: gunSayisi }, (_, i) => i + 1).filter((g) => !yok.has(g)));
  const sayac = h("strong", {});
  const izgara = h("div", { class: "gun-izgara" });
  const ciz = () => {
    izgara.replaceChildren(...Array.from({ length: gunSayisi }, (_, i) => i + 1).map((g) => h("button", {
      class: "gun" + (secili.has(g) ? " secili" : ""), type: "button", "aria-pressed": String(secili.has(g)),
      onclick: () => { if (secili.has(g)) secili.delete(g); else secili.add(g); ciz(); },
    }, h("b", {}, g), h("small", {}, HAFTA[new Date(yil, ayNo - 1, g).getDay()]))));
    sayac.textContent = `${secili.size} gün`;
  };
  ciz();
  const tarih = h("input", { class: "girdi", type: "date", "aria-label": "Servis sahibine ödeme tarihi", value: trdenIso((k.odemeler || {})[ay] || "") });
  const hata = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const kaydet = h("button", { class: "dugme birincil genis", type: "button" }, "Kaydet");
  const panel = panelAc(`${k.plaka} · ${ayAdi(ay)}`, h("div", { class: "form" },
    h("div", { class: "puantaj-ust" }, h("span", {}, k.guzergah || "Çalışılan günler"), sayac),
    izgara,
    h("div", { class: "iki-sutun" },
      h("button", { class: "dugme ikincil", type: "button", onclick: () => { for (let g = 1; g <= gunSayisi; g++) secili.add(g); ciz(); } }, "Tümü"),
      h("button", { class: "dugme ikincil", type: "button", onclick: () => { secili.clear(); ciz(); } }, "Temizle")),
    h("label", { class: "alan" }, h("span", {}, "Servis sahibine ödeme tarihi"), tarih),
    hata, kaydet));
  kaydet.onclick = async () => {
    kaydet.disabled = true; hata.hidden = true;
    try {
      const gunler = Array.from({ length: gunSayisi }, (_, i) => i + 1).filter((g) => !secili.has(g));
      const odeme = tarih.value ? isodanTr(tarih.value) : "";
      await veri.kayitKaydet("okul_ogrenciler", servisId, (v) => {
        v.puantaj = { ...(v.puantaj || {}) };
        v.odemeler = { ...(v.odemeler || {}) };
        if (gunler.length) v.puantaj[ay] = gunler; else delete v.puantaj[ay];
        if (odeme) v.odemeler[ay] = odeme; else delete v.odemeler[ay];
        return v;
      });
      panel.kapat();
      toast("Kaydedildi", "basari");
      await detayYenile({ kok: true });
    } catch (e) { kaydet.disabled = false; hata.textContent = e.message; hata.hidden = false; }
  };
}
