// Excel içe aktarma (telefon): akaryakıt ekstresi, EDM faturaları, iç hizmet seferleri. Kurallar masaüstüyle aynıdır
// (extract_petrol_data + _PetrolDataProcessor, cmd_import_edm_excel, ic_hizmet_excel_import); masaüstü gibi .xls ve .xlsx okunur.
import * as veri from "./veri.js";
import { excelOku } from "./xls_oku.js";
import { seriTarih } from "./xlsx_oku.js";
import { h, panelAc, toast } from "./ui.js";
import { sayi, tarihCoz, isoTarih, sirala } from "./bicim.js";
import { trTarih, yuvarla } from "./form.js";
import { sonra } from "./duzenle.js";
import { duz } from "./metin.js";

const trBuyuk = (s) => String(s ?? "").toLocaleUpperCase("tr");
const trKucuk = (s) => String(s ?? "").toLocaleLowerCase("tr");
const bosMu = (v) => v === null || v === undefined || v === "";
const metin = (v) => (bosMu(v) ? "" : v instanceof Date ? trTarih(v) : String(v).trim());
const pandasMetin = (v) => (bosMu(v) ? "nan" : v instanceof Date ? trTarih(v) : String(v));
const num = (v) => {
  if (bosMu(v) || v instanceof Date) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  return !s || s.toLowerCase() === "nan" ? 0 : sayi(s);
};
const sayiMi = (v) => typeof v === "number" && Number.isFinite(v);
const ODEME_KELIMELERI = ["ÖDEME", "ODEME", "HAVALE", "NAKİT", "NAKIT", "TAHSİLAT", "TAHSILAT", "KREDİ", "KREDI", "EFT", "ÇEK", "CEK"];
const odemeKelimesiVar = (...metinler) => ODEME_KELIMELERI.some((k) => metinler.some((m) => m.includes(k)));
const plakaAnahtari = (p) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const tamSayiMetni = (f) => { const n = Number(String(f).trim()); return String(f).trim() !== "" && Number.isFinite(n) ? String(Math.trunc(n)) : String(f).trim(); };

// Hücre değerinden yerel gün: Date, Excel seri numarası ya da "gg.aa.yyyy" / "gg/aa/yyyy" / "yyyy-aa-gg" metni
function tarihAl(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (sayiMi(v)) { if (v < 20000 || v > 80000) return null; const d = seriTarih(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  const s = String(v ?? "").trim().replace(/\s+\d{1,2}:\d{2}.*$/, "");
  return s ? tarihCoz(s) : null;
}

// ── difflib.SequenceMatcher.ratio karşılığı (bulanık plaka eşleştirme) ──────────────────────────────
function ortakToplam(a, alo, ahi, b, blo, bhi) {
  let bi = alo, bj = blo, bk = 0;
  for (let i = alo; i < ahi; i++) {
    for (let j = blo; j < bhi; j++) {
      let k = 0;
      while (i + k < ahi && j + k < bhi && a[i + k] === b[j + k]) k++;
      if (k > bk) { bi = i; bj = j; bk = k; }
    }
  }
  return bk ? bk + ortakToplam(a, alo, bi, b, blo, bj) + ortakToplam(a, bi + bk, ahi, b, bj + bk, bhi) : 0;
}
const oran = (a, b) => (!a.length && !b.length ? 1 : (2 * ortakToplam(a, 0, a.length, b, 0, b.length)) / (a.length + b.length));
function yakinlar(kelime, liste, n, kesim) {
  return liste.map((x) => [oran(kelime, x), x]).filter(([s]) => s >= kesim).sort((p, q) => q[0] - p[0] || (q[1] > p[1] ? 1 : -1)).slice(0, n).map(([, x]) => x);
}

// ── Tablo: pandas.read_excel karşılığı (ilk satır başlık, boş başlık "Unnamed: i") ───────────────────
function tabloYap(satirlar, baslikSatiri) {
  const bas = baslikSatiri;
  const baslik = satirlar[bas] || [];
  const veriSatirlari = satirlar.slice(bas + 1);
  const genislik = Math.max(baslik.length, ...veriSatirlari.map((r) => r.length), 0);
  const kolonlar = Array.from({ length: genislik }, (_, i) => (bosMu(baslik[i]) || !String(baslik[i]).trim() ? `Unnamed: ${i}` : String(baslik[i])));
  const kayitlar = veriSatirlari.map((r) => Object.fromEntries(kolonlar.map((k, i) => [k, bosMu(r[i]) ? null : r[i]])));
  return { kolonlar, kayitlar };
}

// ── Akaryakıt ───────────────────────────────────────────────────────────────────────────────────────
const PLAKA_DUZELT = /\b(\d{2})(\d)\s*([a-zA-ZçğıöşüÇĞİÖŞÜ]+)\s*(\d{1,3})\b/g;
const PLAKA_TEK = /(\d{2}\s*[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,3}\s*\d{2,4})(?!\d)/;
const PLAKA_COK = /\d{2}\s*[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,3}\s*\d{2,4}/g;

function akaryakitCoz(satirlar, araclar) {
  let bas = 0;
  const ilk = satirlar[1] || [];
  const anahtarlar = new Set(["TARİH", "BORÇ", "ALACAK", "BAKİYE", "FİŞ TÜRÜ"]);
  if (new Set(ilk.map((v) => trBuyuk(metin(v))).filter((v) => anahtarlar.has(v))).size >= 2) bas = 1;
  const { kolonlar, kayitlar: tumu } = tabloYap(satirlar, bas);
  const dropCol = kolonlar.includes("Unnamed: 1") ? "Unnamed: 1" : kolonlar[1] ?? kolonlar[0];
  const kayitlar = tumu.filter((r) => !bosMu(r[dropCol]));
  const kolSet = new Set(kolonlar.map((c) => c.trim()));
  const kurklu = ["Plaka", "Borç", "Alacak", "Bakiye", "Belge No"].filter((c) => kolSet.has(c)).length >= 4;
  const petrolOfisi = !kurklu && ["Plaka", "Miktar", "Tarih", "Distribütör", "Net Tutar", "Brüt Tutar"].filter((c) => kolSet.has(c)).length >= 3;
  const hucreler = (r) => Object.values(r).map((v) => trBuyuk(pandasMetin(v)));
  const atesler = !petrolOfisi && !kurklu && (kolonlar.some((c) => trBuyuk(c).includes("FİŞ TÜRÜ")) || kayitlar.slice(0, 5).some((r) => hucreler(r).some((v) => v.includes("FİŞ TÜRÜ"))));
  const bul = (...kelimeler) => { for (const k of kelimeler) for (const c of kolonlar) if (trBuyuk(c).includes(trBuyuk(k))) return c; return null; };
  const colFis = bul("FİŞ TÜRÜ") || kolonlar[1] || null;
  const colAciklama = bul("AÇIKLAMA") || (kolonlar.includes("Unnamed: 2") ? "Unnamed: 2" : kolonlar[2] || null);
  const colBorc = bul("BORÇ") || (kolonlar.includes("Unnamed: 5") ? "Unnamed: 5" : null);
  const colAlacak = bul("ALACAK") || (kolonlar.includes("Unnamed: 6") ? "Unnamed: 6" : null);
  const colMiktar = bul("MİKTAR", "MIKTAR") || (kolonlar.includes("Unnamed: 3") ? "Unnamed: 3" : null);
  const colOzpet = kolonlar.find((c) => trBuyuk(c).includes("CAR") && trBuyuk(c).includes("HESAP")) || kolonlar[2] || "CARİ HESAP EKSTRESİ";

  const veriler = [];
  let tarihsiz = 0;
  for (const r of kayitlar) {
    let tarih, fisNo = "", plaka = "", plakaTam = "", miktar = 0, fiyat = 0, borc = 0, alacak = 0, odemeKw = false;
    if (petrolOfisi) {
      tarih = r["Tarih"] !== undefined ? r["Tarih"] : r["Fatura Tarihi"] ?? "";
      plakaTam = plaka = metin(r["Plaka"]);
      fisNo = metin(r["Fiş Numarası"] !== undefined ? r["Fiş Numarası"] : r["Fatura Numarası"]);
      borc = num(!bosMu(r["Net Tutar"]) ? r["Net Tutar"] : r["Brüt Tutar"]);
      if (borc === 0) continue;
      if (bosMu(tarih)) continue;
      miktar = num(r["Miktar"]);
      fiyat = num(r["Birim Fiyatı"]);
      if (fiyat === 0 && miktar > 0 && borc > 0) fiyat = borc / miktar;
    } else if (kurklu) {
      tarih = r["Tarih"];
      fisNo = metin(r["Belge No"]);
      plakaTam = plaka = metin(r["Plaka"]);
      if (plakaTam.toLowerCase() === "nan") plakaTam = plaka = "";
      const islemTuru = metin(r["İşlem Türü"]), islem = metin(r["İşlem"]), aciklama = metin(r["Açıklama"]);
      if (trBuyuk(fisNo) === "DEVİR" || trBuyuk(aciklama).includes("DEVİR BAKİYESİ")) continue;
      borc = num(r["Borç"]); alacak = num(r["Alacak"]);
      odemeKw = odemeKelimesiVar(trBuyuk(`${islemTuru} ${islem} ${aciklama}`), trBuyuk(plakaTam));
      if (borc === 0 && alacak === 0 && !odemeKw) continue;
      if (bosMu(tarih) || String(tarih).trim().toLowerCase() === "nan") continue;
      if (!plakaTam && !odemeKw) continue;
      if (!plakaTam) plakaTam = plaka = islemTuru || aciklama || "Bilinmiyor";
      miktar = num(r["Miktar"]);
      fiyat = num(r["B.Fiyat"]);
      if (fiyat === 0 && miktar > 0 && borc > 0) fiyat = borc / miktar;
    } else if (atesler) {
      tarih = r[kolonlar[0]];
      plakaTam = pandasMetin(colAciklama ? r[colAciklama] : null);
      const fisTuru = pandasMetin(colFis ? r[colFis] : null);
      const adaylar = [plakaTam.includes("-") ? plakaTam.split("-")[0].trim() : "", fisTuru.trim()];
      for (let c of adaylar) {
        c = c.trim();
        if (!c || c.toLowerCase() === "nan") continue;
        if (/^\d+\.0+$/.test(c)) c = c.split(".")[0];
        if (/^\d+$/.test(c)) { fisNo = c; break; }
        const rakam = c.replace(/\D/g, "");
        if (rakam) { fisNo = rakam; break; }
      }
      const borcHam = colBorc ? r[colBorc] : 0, alacakHam = colAlacak ? r[colAlacak] : 0;
      const borcM = trBuyuk(metin(borcHam)).trim(), alacakM = trBuyuk(metin(alacakHam)).trim();
      if (["BORÇ", "BORC", "BAKİYE", "BAKIYE"].includes(borcM) || ["ALACAK", "BAKİYE", "BAKIYE"].includes(alacakM)) continue;
      borc = num(borcHam); alacak = num(alacakHam);
      const plakaKontrol = trBuyuk(plakaTam);
      odemeKw = odemeKelimesiVar(plakaKontrol, trBuyuk(fisTuru));
      const odemeSatiri = (borc === 0 && alacak > 0) || odemeKw;
      if (!odemeSatiri) {
        if (plakaTam.toLowerCase() === "nan" || bosMu(colAciklama ? r[colAciklama] : null)) continue;
        if (bosMu(tarih) || plakaKontrol.includes("AÇIKLAMA")) continue;
      } else {
        if (bosMu(tarih)) continue;
        if (plakaTam.toLowerCase() === "nan" || bosMu(r["Unnamed: 2"]) || !plakaTam.trim()) plakaTam = fisTuru;
      }
      plakaTam = plakaTam.replace(PLAKA_DUZELT, "$1 $3 $2$4");
      plaka = plakaTam.split("-").pop().trim();
      const eslesme = plaka.match(PLAKA_TEK);
      if (eslesme) plaka = eslesme[1].trim();
      miktar = colMiktar ? num(r[colMiktar]) : 0;
      if (miktar > 0 && borc > 0) fiyat = borc / miktar;
    } else {
      tarih = r["Unnamed: 0"];
      const u1 = metin(r["Unnamed: 1"]);
      fisNo = /^\d+$/.test(u1.replace(".0", "")) ? u1.replace(".0", "") : u1;
      plakaTam = metin(r[colOzpet]);
      const plakaKontrol = trBuyuk(plakaTam);
      odemeKw = odemeKelimesiVar(plakaKontrol, trBuyuk(u1));
      borc = num(r["Unnamed: 5"]); alacak = num(r["Unnamed: 6"]);
      if (borc === 0 && alacak === 0 && !odemeKw) continue;
      if (bosMu(tarih) || String(tarih).trim().toLowerCase() === "nan") continue;
      if (plakaKontrol.includes("AÇIKLAMA") || plakaKontrol.includes("İLK TARİH") || plakaKontrol.trim() === "TARİH") continue;
      plaka = plakaTam ? plakaTam.split("-").pop().trim() : "";
      const bulunan = (plakaTam.match(PLAKA_COK) || []).map((p) => p.trim()).filter((p) => p.replace(/\s/g, "").length >= 5);
      const miktarHam = num(r["Unnamed: 3"]), fiyatHam = num(r["Unnamed: 4"]);
      const gun = tarihAl(tarih);
      if (bulunan.length >= 2) {
        for (const p of bulunan) veriler.push({ tarih: gun, fisNo, plaka: p, plakaTam: p, miktar: yuvarla(miktarHam / bulunan.length), fiyat: fiyatHam, borc: borc ? yuvarla(borc / bulunan.length) : 0, odeme: false });
        continue;
      }
      if (bulunan.length === 1) plaka = bulunan[0];
      else { const e = plakaTam.match(/(\d{2}\s*[a-zA-ZçğıöşüÇĞİÖŞÜ]{1,3}\s*\d{2,4})/); if (e) plaka = e[1].trim(); }
      miktar = miktarHam; fiyat = fiyatHam;
    }

    let odeme = false;
    if (borc === 0 && alacak > 0) { borc = -alacak; odeme = true; }
    else if (odemeKw) { if (borc > 0 && alacak === 0) borc = -borc; else if (alacak > 0) borc = -alacak; odeme = true; }

    if (araclar.length) {
      const temiz = plakaAnahtari(String(plaka).trim() ? plaka : plakaTam);
      if (temiz) {
        const tam = araclar.find((a) => plakaAnahtari(a.plaka).includes(temiz));
        if (tam) { plakaTam = plaka = tam.plaka; }
        else {
          const sozluk = new Map(araclar.map((a) => [plakaAnahtari(a.plaka), a.plaka]));
          const olasi = yakinlar(temiz, [...sozluk.keys()], 1, 0.85);
          if (olasi.length) plakaTam = plaka = sozluk.get(olasi[0]);
        }
      }
    }
    const gun = tarihAl(tarih);
    if (!gun) { tarihsiz++; continue; }
    veriler.push({ tarih: gun, fisNo, plaka, plakaTam, miktar, fiyat, borc, odeme });
  }
  return { veriler, tarihsiz };
}

// Plakayı kayıtlı araca bağlar: tam eşleşme (tek araç) ya da çok yakın (0,92) tek aday; olmazsa araç kimliği boş kalır.
function aracBul(plaka, araclar) {
  const anahtar = plakaAnahtari(plaka);
  if (!anahtar) return { id: "", plaka: String(plaka || "Bilinmiyor") };
  const tam = araclar.filter((a) => plakaAnahtari(a.plaka) === anahtar);
  if (tam.length === 1) return { id: tam[0].id, plaka: tam[0].plaka };
  if (tam.length > 1) return { id: "", plaka: String(plaka || "Bilinmiyor") };
  const harita = new Map(), tekrar = new Set();
  for (const a of araclar) { const k = plakaAnahtari(a.plaka); if (!k) continue; if (harita.has(k)) tekrar.add(k); else harita.set(k, a); }
  for (const k of tekrar) harita.delete(k);
  const ms = yakinlar(anahtar, [...harita.keys()], 2, 0.92);
  if (ms.length !== 1) return { id: "", plaka: String(plaka || "Bilinmiyor") };
  const a = harita.get(ms[0]);
  return { id: a.id, plaka: a.plaka };
}

async function akaryakitHazirla(satirlar) {
  const [araclar, mevcutHam] = await Promise.all([veri.araclar(), veri.hamListe("akaryakit")]);
  const { veriler, tarihsiz } = akaryakitCoz(satirlar, araclar);
  if (!veriler.length) throw new Error("Dosyada uygun akaryakıt kaydı bulunamadı. Biçimi kontrol edin.");
  const mevcut = mevcutHam.map((r) => {
    const t = tarihCoz(r.tarih);
    return { id: r.id, tarih: t ? isoTarih(t) : "", tutar: Math.abs(num(r.tutar)), odeme: Boolean(r.is_odeme), fis: String(r.fis_no || "").trim(), plaka: plakaAnahtari(r.plaka_yedek) };
  });
  const istasyonlar = [...new Set(mevcutHam.map((r) => String(r.istasyon || "").trim()).filter(Boolean))].sort(sirala);
  const ist = h("input", { class: "girdi", type: "text", list: "dl-ice-ist", maxlength: "60", autocomplete: "off", autocapitalize: "characters", "aria-label": "İstasyon", placeholder: "İstasyon adı" });
  const liste = h("datalist", { id: "dl-ice-ist" }, istasyonlar.map((x) => h("option", { value: x })));
  const odemeSayisi = veriler.filter((d) => d.odeme).length;
  const tarihler = veriler.map((d) => d.tarih.getTime());
  const aralik = `${trTarih(new Date(Math.min(...tarihler)))} - ${trTarih(new Date(Math.max(...tarihler)))}`;
  return {
    bilgi: [["Okunan işlem", String(veriler.length)], ["Yakıt alımı", String(veriler.length - odemeSayisi)], ["Ödeme", String(odemeSayisi)], ["Tarih aralığı", aralik], tarihsiz ? ["Tarihi okunamayan", String(tarihsiz)] : null],
    alanlar: [h("label", { class: "alan" }, h("span", {}, "İstasyon"), ist, liste)],
    async uygula(ilerle) {
      const istasyon = trBuyuk(ist.value.trim());
      if (!istasyon) throw new Error("İstasyon adını yazın.");
      const yeniler = [], fisGuncel = new Map();
      for (const d of veriler) {
        const tarihIso = isoTarih(d.tarih);
        const odemeBayrak = d.odeme, tutarMutlak = Math.abs(d.borc), fis = String(d.fisNo || "").trim();
        const yeniFis = Boolean(fis && fis !== "-");
        let tekrar = false;
        for (const e of mevcut) {
          if (e.tarih !== tarihIso || Math.abs(e.tutar - tutarMutlak) >= 0.01 || e.odeme !== odemeBayrak) continue;
          const fisBos = !e.fis || e.fis === "-";
          const ayniPlaka = e.plaka && plakaAnahtari(d.plaka) && e.plaka === plakaAnahtari(d.plaka);
          if (odemeBayrak) { if (yeniFis && fisBos) fisGuncel.set(e.id, fis); tekrar = true; break; }
          if (yeniFis && e.fis && e.fis !== "-") {
            if (e.fis === fis || ayniPlaka) { tekrar = true; break; }
          } else if (ayniPlaka) { if (yeniFis && fisBos) fisGuncel.set(e.id, fis); tekrar = true; break; }
        }
        if (tekrar) continue;
        const arac = aracBul(d.plaka, araclar);
        yeniler.push({
          id: veri.yeniKimlik(), tarih: tarihIso, arac_id: odemeBayrak ? "" : arac.id, plaka_yedek: odemeBayrak ? "ÖDEME / TAHSİLAT" : arac.plaka, istasyon,
          litre: d.miktar, fiyat: d.fiyat, tutar: d.borc, fis_no: fis, is_odeme: odemeBayrak, kaynak: "excel",
        });
      }
      await veri.topluEkle("akaryakit", yeniler, ilerle);
      for (const [id, fis] of fisGuncel) await veri.kayitKaydet("akaryakit", id, (v) => ({ ...v, fis_no: fis }));
      const atlanan = veriler.length - yeniler.length;
      return `${yeniler.length} kayıt eklendi${atlanan ? `, ${atlanan} kayıt zaten vardı` : ""}${fisGuncel.size ? `, ${fisGuncel.size} boş fiş no güncellendi` : ""}.`;
    },
  };
}

// ── EDM faturaları ──────────────────────────────────────────────────────────────────────────────────
const KDV_STANDART = [0, 1, 10, 20];

function faturaUret(kayitlar, kolonlar, { tip, tevPayi }) {
  const faturalar = new Map();
  kayitlar.forEach((row, sira) => {
    const faturaNo = metin(row["Fatura No"]);
    const matrah = num(row["Vergiler Hariç Toplam Tutar"]);
    let toplam = 0;
    if (kolonlar.includes("Tutar") && !bosMu(row["Tutar"])) toplam = num(row["Tutar"]);
    else if (kolonlar.includes("Vergiler Dahil Toplam Tutar") && !bosMu(row["Vergiler Dahil Toplam Tutar"])) toplam = num(row["Vergiler Dahil Toplam Tutar"]);
    if (matrah === 0 && toplam === 0) return;
    const gibTur = trKucuk(metin(row["GİB Fatura Türü"]));
    let tevOrani = 0, tevTutari = 0, tevIsim = "Yok";
    const odenecekKdv = toplam - matrah;
    let kdvOrani = 0, gercekKdv = odenecekKdv;
    if (gibTur.includes("tevkifat") && tevPayi > 0) {
      tevOrani = tevPayi / 10;
      tevIsim = `${tevPayi}/10`;
      if (tevOrani < 1) gercekKdv = odenecekKdv / (1 - tevOrani);
      else gercekKdv = !bosMu(row["Hesaplanan KDV"]) ? num(row["Hesaplanan KDV"]) : matrah * 0.2;
      tevTutari = gercekKdv * tevOrani;
    }
    if (matrah > 0) {
      const hesap = Math.round((gercekKdv / matrah) * 100);
      const std = KDV_STANDART.find((x) => Math.abs(hesap - x) <= 1);
      if (std !== undefined) kdvOrani = std;
    }
    toplam = matrah + (gercekKdv - tevTutari);
    const kalem = { aciklama: "EDM İçe Aktarım", matrah: yuvarla(matrah), kdv_orani: kdvOrani, tev_oran: tevPayi && gibTur.includes("tevkifat") ? tevPayi : 0, kdv_tutar: yuvarla(gercekKdv), tev_tutari: yuvarla(tevTutari), toplam: yuvarla(toplam), tev_isim: tevIsim };
    const anahtar = faturaNo || `#${sira}`;
    const f = faturalar.get(anahtar);
    if (f) {
      f.Kalemler.push(kalem);
      f.Matrah = yuvarla(f.Matrah + matrah);
      f["KDV Tutari"] = yuvarla(f["KDV Tutari"] + gercekKdv);
      f["Tev.Tutarı"] = yuvarla(f["Tev.Tutarı"] + tevTutari);
      f.Toplam = yuvarla(f.Toplam + toplam);
      if (f["KDV %"] !== `%${kdvOrani}` && f["KDV %"] !== "Çeşitli") f["KDV %"] = "Çeşitli";
      if (tevIsim !== "Yok" && f.Tevkifat === "Yok") f.Tevkifat = tevIsim;
    } else {
      const gun = tarihAl(row["Fatura Tarihi"]);
      faturalar.set(anahtar, {
        id: veri.yeniKimlik(), Tarih: gun ? trTarih(gun) : bosMu(row["Fatura Tarihi"]) ? trTarih(new Date()) : metin(row["Fatura Tarihi"]), Tip: tip, "Fatura No": faturaNo, Firma: metin(row["Müşteri"]),
        Aciklama: "EDM İçe Aktarım", Matrah: yuvarla(matrah), "KDV %": `%${kdvOrani}`, "KDV Tutari": yuvarla(gercekKdv), Tevkifat: tevIsim, "Tev.Tutarı": yuvarla(tevTutari), Toplam: yuvarla(toplam), Kalemler: [kalem],
      });
    }
  });
  return [...faturalar.values()];
}

const secim = (secenekler, varsayilan, etiket) => {
  const s = h("select", { class: "girdi", "aria-label": etiket }, secenekler.map(([k, ad]) => h("option", { value: k }, ad)));
  s.value = String(varsayilan);
  return s;
};

async function faturaHazirla(satirlar, dosyaAdi) {
  const mevcutHam = await veri.hamListe("faturalar");
  const { kolonlar, kayitlar } = tabloYap(satirlar, 0);
  const eksik = ["Fatura Tarihi", "Fatura No", "Müşteri", "Vergiler Hariç Toplam Tutar"].filter((c) => !kolonlar.includes(c));
  if (eksik.length) throw new Error(`Gerekli sütunlar eksik: ${eksik.join(", ")}`);
  const mevcut = new Map();
  for (const r of mevcutHam) { const no = String(r["Fatura No"] ?? "").trim(); if (no && !mevcut.has(no)) mevcut.set(no, r.id); }
  const tevVar = kayitlar.some((r) => trKucuk(metin(r["GİB Fatura Türü"])).includes("tevkifat"));
  const tip = secim([["Gelen", "Gelen fatura"], ["Giden", "Giden fatura"]], /gelen/i.test(dosyaAdi) ? "Gelen" : "Giden", "Fatura türü");
  const tev = secim([[0, "Yok (0/10)"], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, `${n}/10`])], 5, "Tevkifat");
  const mukerrer = secim([["atla", "Atla"], ["guncelle", "Güncelle"]], "atla", "Kayıtlı faturalar");
  const onizleme = faturaUret(kayitlar, kolonlar, { tip: tip.value, tevPayi: Number(tev.value) });
  if (!onizleme.length) throw new Error("İçe aktarılacak geçerli fatura bulunamadı.");
  const kayitli = onizleme.filter((f) => mevcut.has(f["Fatura No"])).length;
  return {
    bilgi: [["Fatura", String(onizleme.length)], ["Yeni", String(onizleme.length - kayitli)], ["Zaten kayıtlı", String(kayitli)]],
    alanlar: [
      h("label", { class: "alan" }, h("span", {}, "Fatura türü"), tip),
      tevVar && h("label", { class: "alan" }, h("span", {}, "Tevkifatlı faturalara uygulanacak oran"), tev),
      kayitli > 0 && h("label", { class: "alan" }, h("span", {}, "Zaten kayıtlı faturalar"), mukerrer),
    ],
    async uygula(ilerle) {
      const liste = faturaUret(kayitlar, kolonlar, { tip: tip.value, tevPayi: Number(tev.value) });
      const yeniler = [], guncellenecek = [];
      for (const f of liste) {
        const eski = mevcut.get(f["Fatura No"]);
        if (!eski) yeniler.push(f);
        else if (mukerrer.value === "guncelle") guncellenecek.push([eski, f]);
      }
      await veri.topluEkle("faturalar", yeniler, ilerle);
      for (const [eski, f] of guncellenecek) await veri.kayitKaydet("faturalar", eski, () => ({ ...f, id: eski }));
      const atlanan = kayitli - guncellenecek.length;
      return `${yeniler.length} fatura eklendi${guncellenecek.length ? `, ${guncellenecek.length} güncellendi` : ""}${atlanan ? `, ${atlanan} zaten kayıtlı olduğu için atlandı` : ""}.`;
    },
  };
}

// ── İç hizmet seferleri ─────────────────────────────────────────────────────────────────────────────
const ASCII = (s) => trBuyuk(String(s ?? "").trim()).replace(/İ/g, "I").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ş/g, "S").replace(/Ö/g, "O").replace(/Ç/g, "C");
const BOLUMLER = ["ÜRETİM", "GÜVENLİK", "IK", "BAKIM", "LOJİSTİK", "KALİTE", "CISG", "IT", "AGRO", "PROJE", "SATIN ALMA"];
const BOLUM_ARAMA = {
  "ÜRETİM": ["ÜRETİM", "URETİM", "URETIM", "ÜRETIM", "ÜRTİM", "URTIM", "ÜRTIM"], "GÜVENLİK": ["GÜVENLİK", "GUVENLIK", "GÜVENLİ", "GÜVEN", "GÜVLK", "GUVLK"],
  IK: ["İK", "IK", "İNSAN KAYNAK", "INSAN KAYNAK"], BAKIM: ["BAKIM"], "LOJİSTİK": ["LOJİSTİK", "LOJISTIK", "LOJİSTİ", "LOJISTI", "SEVKİYAT", "SEVKIYAT", "LOJTK", "LOJTK."],
  "KALİTE": ["KALİTE", "KALITE"], CISG: ["CISG", "CİSG"], IT: ["BİLGİ İŞLEM", "BILGI ISLEM", "IT"], AGRO: ["AGRO", "TARIM"], PROJE: ["PROJE"], "SATIN ALMA": ["SATIN ALMA", "SATINALMA", "SATIN\nALMA"],
};
const duzBosluk = (s) => String(s).toUpperCase().replace(/\n/g, " ").trim();

function icHizmetCoz(satirlar, araclar) {
  let baslikSatiri = -1;
  for (let ri = 0; ri < Math.min(10, satirlar.length); ri++) {
    const degerler = (satirlar[ri] || []).map((v) => ASCII(metin(v)));
    if (degerler.some((v) => v.includes("SAYI") || v.includes("NO")) && degerler.some((v) => v.includes("TARIH") || v.includes("DATE"))) { baslikSatiri = ri; break; }
  }
  if (baslikSatiri < 0) throw new Error("Excel biçimi tanınamadı: 'SAYI' ve 'TARİH' sütunları bulunamadı.");
  const basliklar = (satirlar[baslikSatiri] || []).map((v) => (bosMu(v) ? "nan" : metin(v)));
  const sutun = (...adlar) => { for (let i = 0; i < basliklar.length; i++) for (const ad of adlar) if (ad && ASCII(basliklar[i]).includes(ASCII(ad))) return i; return null; };
  const tam = (...adlar) => { for (let i = 0; i < basliklar.length; i++) for (const ad of adlar) if (ad && ASCII(basliklar[i]) === ASCII(ad)) return i; return sutun(...adlar); };
  const bolumSutunu = (bolum) => {
    const aramalar = BOLUM_ARAMA[bolum] || [bolum];
    for (let i = 0; i < basliklar.length; i++) {
      const b = duzBosluk(basliklar[i]);
      for (const a of aramalar) if (b === duzBosluk(a) || b === duzBosluk(bolum)) return i;
      for (const a of aramalar) if (duzBosluk(a).length >= 4 && b.includes(duzBosluk(a))) return i;
    }
    return null;
  };
  const iSayi = tam("SAYI", "No", "NO"), iTarih = tam("TARİH", "Tarih", "TARIH", "DATE"), iSaat = tam("SAAT", "Saat", "TIME"), iPlaka = tam("PLAKA", "Plaka", "PLATE");
  const iPersonel = sutun("ADI SOYADI", "PERSONEL", "Personel");
  const gidilenler = basliklar.map((b, i) => (/GİDİLEN|GIDILEN/.test(b.toUpperCase()) || b.includes("Gidilen") ? i : -1)).filter((i) => i >= 0);
  const iGidilen = gidilenler.length ? gidilenler[gidilenler.length - 1] : null;
  const iBolum = sutun("BÖLÜM", "Bölüm"), iKisi = tam("KİŞİ SAYISI", "KISI SAYISI", "Kişi Sayısı", "KİŞİ", "Kişi", "KISI", "PERSON COUNT", "PERSON");
  const iTutar = tam("TUTAR", "Tutar", "AMOUNT", "PRICE"), iFis = tam("FİŞ NO", "Fiş No", "FIS NO", "FİŞ", "RECEIPT", "DOC"), iAciklama = tam("AÇIKLAMA", "Açıklama", "DESC");
  const guzergahlar = basliklar.filter((b) => ["+1", "MERSİN", "TARSUS", "ADANA", "FABR"].some((x) => b.toUpperCase().includes(x)));
  const bolumIndeksleri = BOLUMLER.map((b) => [b, bolumSutunu(b)]).filter(([, i]) => i !== null);
  const soforHaritasi = new Map(araclar.filter((a) => a.sofor).map((a) => [plakaAnahtari(a.plaka), a.sofor]));
  const kayitlar = [];
  for (let ri = baslikSatiri + 1; ri < satirlar.length; ri++) {
    const row = satirlar[ri] || [];
    const sira = iSayi !== null ? row[iSayi] : null;
    if (bosMu(sira) || ["nan", "none"].includes(String(sira).trim().toLowerCase())) continue;
    const tarihHam = iTarih !== null ? row[iTarih] : null;
    if (bosMu(tarihHam) || /nan|nat/i.test(String(tarihHam instanceof Date ? "" : tarihHam))) continue;
    let tarihStr;
    const gun = tarihHam instanceof Date || sayiMi(tarihHam) ? tarihAl(tarihHam) : null;
    if (gun) tarihStr = trTarih(gun);
    else {
      const s = String(tarihHam).trim();
      const iso = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/), dmy = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
      if (iso) tarihStr = `${iso[3].padStart(2, "0")}.${iso[2].padStart(2, "0")}.${iso[1]}`;
      else if (dmy) tarihStr = `${dmy[1].padStart(2, "0")}.${dmy[2].padStart(2, "0")}.${dmy[3].length === 2 ? "20" + dmy[3] : dmy[3]}`;
      else tarihStr = s.slice(0, 10);
    }
    const saatHam = iSaat !== null ? row[iSaat] : null;
    let saat = "";
    if (saatHam instanceof Date) saat = `${String(saatHam.getHours()).padStart(2, "0")}:${String(saatHam.getMinutes()).padStart(2, "0")}`;
    else if (sayiMi(saatHam) && saatHam >= 0 && saatHam < 1) { const dk = Math.round(saatHam * 1440); saat = `${String(Math.floor(dk / 60) % 24).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`; }
    else { const m = String(saatHam ?? "").match(/(\d{1,2}):(\d{2})/); if (m) saat = `${m[1].padStart(2, "0")}:${m[2]}`; }
    let fis = iFis !== null ? metin(row[iFis]) : "";
    if (["nan", "None"].includes(fis)) fis = "";
    if (fis) fis = tamSayiMetni(fis);
    let guzergah = "", tutar = 0;
    for (const g of guzergahlar) {
      const gi = basliklar.indexOf(g);
      const v = Number(row[gi]);
      if (gi >= 0 && Number.isFinite(v) && v > 0 && !bosMu(row[gi])) { guzergah = g; tutar = v; break; }
    }
    if (iTutar !== null) { const v = Number(row[iTutar]); if (Number.isFinite(v) && v > 0 && !bosMu(row[iTutar])) tutar = v; }
    const dagilim = {};
    for (const [b, bi] of bolumIndeksleri) {
      const v = bi - 1 >= 0 ? Math.trunc(Number(row[bi - 1] || 0)) : 0;
      if (Number.isFinite(v) && v > 0) dagilim[b] = v;
    }
    const deger = (i) => (i === null ? "" : metin(row[i]) === "nan" || metin(row[i]) === "None" ? "" : metin(row[i]));
    const kisiMetni = deger(iKisi);
    const plaka = deger(iPlaka);
    const kayit = {
      id: veri.yeniKimlik(), sira_no: String(tamSayiMetni(sira)), tarih: tarihStr, saat, plaka, personel: deger(iPersonel), guzergah, gidilen_yer: deger(iGidilen),
      kisi_sayisi: kisiMetni && /^\d+(\.\d+)?$/.test(kisiMetni) ? Math.trunc(Number(kisiMetni)) : 1, tutar, fis_no: fis, bolum: deger(iBolum), bolum_dagilim: dagilim, aciklama: deger(iAciklama),
    };
    const sofor = soforHaritasi.get(plakaAnahtari(plaka));
    if (sofor) kayit.sofor = sofor;
    kayitlar.push(kayit);
  }
  return kayitlar;
}

async function icHizmetHazirla(satirlar) {
  const [araclar, mevcutHam] = await Promise.all([veri.araclar(), veri.hamListe("ic_hizmetler")]);
  const kayitlar = icHizmetCoz(satirlar, araclar);
  if (!kayitlar.length) throw new Error("Aktarılacak sefer kaydı bulunamadı.");
  const mevcut = new Map();
  for (const r of mevcutHam) { const f = tamSayiMetni(r.fis_no ?? ""); if (f && !mevcut.has(f)) mevcut.set(f, r.id); }
  const kayitli = kayitlar.filter((k) => k.fis_no && mevcut.has(k.fis_no));
  const mukerrer = secim([["atla", "Atla"], ["guncelle", "Güncelle"]], "atla", "Kayıtlı seferler");
  return {
    bilgi: [["Sefer", String(kayitlar.length)], ["Yeni", String(kayitlar.length - kayitli.length)], ["Fiş no zaten kayıtlı", String(kayitli.length)]],
    alanlar: [kayitli.length > 0 && h("label", { class: "alan" }, h("span", {}, "Fiş no zaten kayıtlı olan seferler"), mukerrer)],
    async uygula(ilerle) {
      const yeniler = kayitlar.filter((k) => !(k.fis_no && mevcut.has(k.fis_no)));
      await veri.topluEkle("ic_hizmetler", yeniler, ilerle);
      let guncel = 0;
      if (mukerrer.value === "guncelle") {
        for (const k of kayitli) { const eski = mevcut.get(k.fis_no); await veri.kayitKaydet("ic_hizmetler", eski, (v) => ({ ...v, ...k, id: eski })); guncel++; }
      }
      const atlanan = kayitli.length - guncel;
      return `${yeniler.length} sefer eklendi${guncel ? `, ${guncel} güncellendi` : ""}${atlanan ? `, ${atlanan} mükerrer atlandı` : ""}.`;
    },
  };
}

// ── Arayüz ──────────────────────────────────────────────────────────────────────────────────────────
const TURLER = {
  akaryakit: { baslik: "Akaryakıt Excel içe aktar", modul: "petrol", hazirla: akaryakitHazirla },
  fatura: { baslik: "EDM fatura Excel içe aktar", modul: "fatura", hazirla: faturaHazirla },
  ic_hizmet: { baslik: "İç hizmet Excel içe aktar", modul: "ic_hizmet", hazirla: icHizmetHazirla },
};

export function iceAktarAc(tur, bitti = sonra) {
  const T = TURLER[tur];
  const dosya = h("input", { class: "girdi", type: "file", accept: ".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "aria-label": "Excel dosyası" });
  const hata = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const alan = h("div", {});
  const kok = h("div", { class: "form" }, h("label", { class: "alan" }, h("span", {}, "Excel dosyası (.xls, .xlsx)"), dosya), hata, alan);
  const panel = panelAc(T.baslik, kok);
  const hataYaz = (m) => { hata.textContent = m; hata.hidden = !m; };
  dosya.addEventListener("change", async () => {
    const f = dosya.files && dosya.files[0];
    alan.replaceChildren();
    hataYaz("");
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) return hataYaz("Yalnızca .xls ya da .xlsx dosyası seçin.");
    alan.replaceChildren(h("p", { class: "soluk" }, "Okunuyor"));
    try {
      const hazir = await T.hazirla(await excelOku(f), f.name);
      const dugme = h("button", { class: "dugme birincil genis", type: "button" }, "İçe aktar");
      dugme.addEventListener("click", async () => {
        hataYaz(""); dugme.disabled = true; dosya.disabled = true;
        try {
          const sonuc = await hazir.uygula((n, t) => { dugme.textContent = `Aktarılıyor ${n} / ${t}`; });
          panel.kapat();
          toast(sonuc, "basari");
          await bitti();
        } catch (e) {
          dugme.disabled = false; dosya.disabled = false; dugme.textContent = "İçe aktar";
          hataYaz(e.message);
        }
      });
      alan.replaceChildren(h("div", { class: "form" },
        h("div", { class: "kart" }, hazir.bilgi.filter(Boolean).map(([e, d]) => h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, e), h("span", { class: "bilgi-deger" }, d)))),
        hazir.alanlar, dugme));
    } catch (e) {
      alan.replaceChildren();
      hataYaz(e.message);
    }
  });
}

// Ekranların listesinin başına konan düğme; yalnızca yazma yetkisi olanda görünür (yoksa null).
export function iceAktarDugmesi(tur, bitti = sonra) {
  if (!veri.yazabilir(TURLER[tur].modul)) return null;
  return h("button", { class: "dugme ikincil genis", type: "button", onclick: () => iceAktarAc(tur, bitti) }, duz("excel_ice_aktar_menu"));
}
