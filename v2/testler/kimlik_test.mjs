import test from "node:test";
import assert from "node:assert/strict";
import { kullaniciAdindanEposta, epostadanKullaniciAdi, sirketKodunuNormalle, altAlandanSirket, sirketKodunuBul } from "../js/kimlik.js";

test("kullanıcı adı işletmenin alan adıyla e-postaya çevrilir; Türkçe karakterler sadeleşir", () => {
  assert.equal(kullaniciAdindanEposta("Ümit Arik", "filo.local"), "umitarik@filo.local");
  assert.equal(kullaniciAdindanEposta("İlhan", "482915.filo.local"), "ilhan@482915.filo.local");
  assert.equal(kullaniciAdindanEposta(" Sara ", "x.filo.local"), "sara@x.filo.local");
});

test("aynı kullanıcı adı farklı işletmelerde farklı e-posta üretir (çakışma yok)", () => {
  assert.notEqual(kullaniciAdindanEposta("sara", "111111.filo.local"), kullaniciAdindanEposta("sara", "222222.filo.local"));
});

test("'@' içeren giriş olduğu gibi e-posta sayılır", () => {
  assert.equal(kullaniciAdindanEposta("Sara@Firma.com", "111111.filo.local"), "sara@firma.com");
});

test("e-postadan kullanıcı adı, alan adından bağımsız çıkarılır", () => {
  assert.equal(epostadanKullaniciAdi("sara@482915.filo.local"), "sara");
  assert.equal(epostadanKullaniciAdi("umitarik@filo.local"), "umitarik");
  assert.equal(epostadanKullaniciAdi(null), "");
});

test("şirket kodu 6 haneli rakamdır", () => {
  assert.equal(sirketKodunuNormalle("  482915 "), "482915");
  for (const kotu of ["", "12345", "1234567", "abc123", "olcaytur-turizm", "12 345", "12345a", "١٢٣٤٥٦", "<script>", null]) assert.equal(sirketKodunuNormalle(kotu), "", String(kotu));
});

test("alt alan adından şirket kodu: yalnızca tek etiket ve tanımlı kök", () => {
  assert.equal(altAlandanSirket("482915.filomuhasebe.com", "filomuhasebe.com"), "482915");
  assert.equal(altAlandanSirket("482915.filomuhasebe.com", ""), "");
  assert.equal(altAlandanSirket("filomuhasebe.com", "filomuhasebe.com"), "");
  assert.equal(altAlandanSirket("x.482915.filomuhasebe.com", "filomuhasebe.com"), "");
  assert.equal(altAlandanSirket("482915.baska.com", "filomuhasebe.com"), "");
  assert.equal(altAlandanSirket("abc.filomuhasebe.com", "filomuhasebe.com"), "");
});

test("şirket kodu önceliği: alt alan > adres > saklanan > varsayılan", () => {
  const ortak = { altAlanKoku: "filomuhasebe.com", varsayilan: "111111" };
  assert.deepEqual(sirketKodunuBul({ ...ortak, hostname: "482915.filomuhasebe.com", arama: "?i=222222", depolanan: "333333" }), { kod: "482915", kaynak: "altalan" });
  assert.deepEqual(sirketKodunuBul({ ...ortak, hostname: "github.io", arama: "?i=222222", depolanan: "333333" }), { kod: "222222", kaynak: "adres" });
  assert.deepEqual(sirketKodunuBul({ ...ortak, hostname: "github.io", depolanan: "333333" }), { kod: "333333", kaynak: "saklanan" });
  assert.deepEqual(sirketKodunuBul({ ...ortak, hostname: "github.io" }), { kod: "111111", kaynak: "varsayilan" });
  assert.deepEqual(sirketKodunuBul({}), { kod: "", kaynak: "yok" });
});

test("geçersiz adres parametresi ve eski (harfli) saklı kod yok sayılır; bir sonraki kaynağa geçilir", () => {
  assert.deepEqual(sirketKodunuBul({ arama: "?i=<script>", depolanan: "482915" }), { kod: "482915", kaynak: "saklanan" });
  assert.deepEqual(sirketKodunuBul({ depolanan: "olcaytur-turizm" }), { kod: "", kaynak: "yok" });
});
