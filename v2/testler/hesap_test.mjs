import test from "node:test";
import assert from "node:assert/strict";
import { sayi, tarihCoz, para, ayEkle, telefonTemizle, eslesir } from "../js/bicim.js";
import { ogrenciKaydi, okulListesi, okulToplam, esnafKaydi, faturaKaydi, aracBelgeleri, belgeDurumu, aylikGelirGider, akaryakitListesi, yontemToplami } from "../js/hesap.js";

test("sayi: Türkçe ve düz biçimleri okur", () => {
  assert.equal(sayi("1.234,56"), 1234.56);
  assert.equal(sayi("1.500"), 1500);
  assert.equal(sayi("15000,5"), 15000.5);
  assert.equal(sayi("73000.0"), 73000);
  assert.equal(sayi("abc"), 0);
  assert.equal(sayi(null), 0);
  assert.equal(sayi(12.5), 12.5);
});

test("tarihCoz: iki biçim ve geçersiz tarih", () => {
  assert.equal(tarihCoz("16.09.2026").getMonth(), 8);
  assert.equal(tarihCoz("2026-05-01").getDate(), 1);
  assert.equal(tarihCoz("31.02.2026"), null);
  assert.equal(tarihCoz("-"), null);
  assert.equal(tarihCoz(""), null);
});

test("para ve ay yardımcıları", () => {
  assert.equal(para(15000), "₺15.000");
  assert.equal(para(1234.5), "₺1.234,50");
  assert.equal(ayEkle("2026-12", 1), "2027-01");
  assert.equal(ayEkle("2026-01", -1), "2025-12");
  assert.equal(telefonTemizle("0532 467 65 70"), "+905324676570");
  assert.equal(telefonTemizle("5369163150 EROL"), "+905369163150");
  assert.ok(eslesir("MUHAMMET MUSTAFA TÜYSÜZ", "tüysüz"));
  assert.ok(eslesir("IŞIK", "ışık"));
});

const ogr = (extra) => ({ id: "1", ad_soyad: "A", aylik_odeme: 30000, servis_plaka: "33 S 1", odeme_gecmisi: [], ...extra });

test("öğrenci durumu: bekliyor / kısmi / ödendi", () => {
  assert.equal(ogrenciKaydi(ogr({})).durum, "bekliyor");
  const kismi = ogrenciKaydi(ogr({ odeme_gecmisi: [{ tarih: "16.09.2026", ay: "2026-09", tutar: 15000, yontem: "kart" }] }));
  assert.equal(kismi.durum, "kismi");
  assert.equal(kismi.kalan, 15000);
  const tam = ogrenciKaydi(ogr({ odeme_gecmisi: [{ tarih: "16.09.2026", tutar: 20000 }, { tarih: "16.11.2026", tutar: 10000 }] }));
  assert.equal(tam.durum, "odendi");
  assert.equal(tam.kalan, 0);
  assert.equal(tam.odemeler[0].ay, "2026-11");
});

test("tahsilat listesi: servis kullanmayan, plakasız ve servis kaydı dışarıda", () => {
  const l = okulListesi([ogr({ id: "a" }), ogr({ id: "b", servis_kullanmiyor: true }), ogr({ id: "c", servis_plaka: "" }), ogr({ id: "srv_1" })]);
  assert.deepEqual(l.map((o) => o.id), ["a"]);
  const t = okulToplam([ogrenciKaydi(ogr({ odeme_gecmisi: [{ tarih: "16.11.2026", ay: "2026-11", tutar: 10000 }] }))], "2026-11");
  assert.equal(t.buAy, 10000);
  assert.equal(t.kalan, 20000);
});

test("esnaf: borç, ödenen, bakiye", () => {
  const e = esnafKaydi({ id: "e", isim: "X", islemler: [{ toplam: 73000, is_odeme: false, tarih: "27.04.2026" }, { toplam: 70000, is_odeme: true, tarih: "28.04.2026" }, { toplam: 6000, tarih: "01.06.2026" }] });
  assert.equal(e.borc, 79000);
  assert.equal(e.odenen, 70000);
  assert.equal(e.bakiye, 9000);
});

test("fatura: iki farklı alan adı biçimi", () => {
  const a = faturaKaydi({ id: "1", Tarih: "31.05.2026", Tip: "Giden", "Fatura No": "F1", Firma: "ACME", Toplam: 730493.28 });
  assert.equal(a.giden, true);
  assert.equal(a.toplam, 730493.28);
  const b = faturaKaydi({ id: "2", tarih: "2026-05-02", tip: "Gelen", fatura_no: "F2", firma: "B", toplam: 100 });
  assert.equal(b.giden, false);
  assert.equal(b.no, "F2");
});

test("belge durumu ve bakım periyodu", () => {
  const ref = new Date(2026, 4, 1);
  assert.equal(belgeDurumu(new Date(2026, 3, 30), ref).seviye, "gecmis");
  assert.equal(belgeDurumu(new Date(2026, 4, 20), ref).seviye, "yakin");
  assert.equal(belgeDurumu(new Date(2026, 8, 1), ref).seviye, "iyi");
  const b = aracBelgeleri({ muayene_tarihi: "06.08.2027", yag_bakim_tarihi: "01.01.2026", genel_bakim_tarihi: "-" }, { yag: 90 });
  assert.equal(b.length, 2);
  const yag = b.find((x) => x.kod === "yag");
  assert.equal(yag.son.getMonth(), 3);   // 1 Ocak + 90 gün = 1 Nisan
  assert.equal(yag.son.getDate(), 1);
});

test("gelir-gider: giden fatura gelir; istasyon ödemesi gider sayılmaz", () => {
  const f = [faturaKaydi({ id: "1", Tarih: "10.05.2026", Tip: "Giden", Toplam: 1000 }), faturaKaydi({ id: "2", Tarih: "11.05.2026", Tip: "Gelen", Toplam: 300 })];
  const y = akaryakitListesi([{ id: "y1", tarih: "2026-05-02", tutar: 200, plaka_yedek: "P" }, { id: "y2", tarih: "2026-05-03", tutar: 5000, is_odeme: true }], []);
  const e = [esnafKaydi({ id: "e", isim: "X", islemler: [{ toplam: 50, tarih: "04.05.2026" }, { toplam: 40, is_odeme: true, tarih: "05.05.2026" }] })];
  const k = aylikGelirGider(f, y, e).get("2026-05");
  assert.deepEqual(k, { gelir: 1000, gider: 550 });
});

test("ödeme yöntemi kartları: yöntem başına öğrenci sayısı ve tutar; çok yöntemli öğrenci her kartta sayılır", () => {
  const liste = [
    { odemeler: [{ yontem: "nakit", tutar: 100 }, { yontem: "nakit", tutar: 50 }, { yontem: "iban", tutar: 200 }] },
    { odemeler: [{ yontem: "kart", tutar: 75 }, { yontem: "bilinmeyen", tutar: 999 }] },
    { odemeler: [] },
  ];
  const t = yontemToplami(liste);
  assert.deepEqual(t.nakit, { ogrenci: 1, tutar: 150 });
  assert.deepEqual(t.iban, { ogrenci: 1, tutar: 200 });
  assert.deepEqual(t.kart, { ogrenci: 1, tutar: 75 });
});