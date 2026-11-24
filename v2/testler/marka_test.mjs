import test from "node:test";
import assert from "node:assert/strict";
import { markaNormalle, VARSAYILAN_MARKA } from "../js/marka_normal.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";

test("geçerli ad ve png logo olduğu gibi kabul edilir", () => {
  assert.deepEqual(markaNormalle({ ad: "  Olcaytur Turizm ", logo: PNG }), { ad: "Olcaytur Turizm", logo: PNG });
});

test("logo yoksa ya da ad boşsa varsayılan kalır", () => {
  assert.deepEqual(markaNormalle({ ad: "", logo: null }), VARSAYILAN_MARKA);
  assert.deepEqual(markaNormalle(null), VARSAYILAN_MARKA);
  assert.deepEqual(markaNormalle({ ad: "Firma" }), { ad: "Firma", logo: VARSAYILAN_MARKA.logo });
});

test("svg, javascript: ve başka şemalar logo olarak reddedilir", () => {
  for (const kotu of ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "javascript:alert(1)", "https://kotu.example/x.png",
    "data:text/html;base64,PGgxPg==", 'data:image/png;base64,AAAA" onerror="alert(1)']) {
    assert.equal(markaNormalle({ ad: "Firma", logo: kotu }).logo, VARSAYILAN_MARKA.logo, kotu);
  }
});

test("çok uzun ad kısaltılır, çok büyük logo reddedilir, tür doğrulanır", () => {
  assert.equal(markaNormalle({ ad: "A".repeat(200) }).ad.length, 80);
  assert.equal(markaNormalle({ ad: "F", logo: "data:image/png;base64," + "A".repeat(130000) }).logo, VARSAYILAN_MARKA.logo);
  assert.equal(markaNormalle({ ad: 42, logo: 7 }).ad, VARSAYILAN_MARKA.ad);
});
