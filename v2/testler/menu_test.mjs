import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { MENU, ALT_CUBUK_SIRASI } from "../js/menu.js";

const kok = new URL("../", import.meta.url);

test("menü masaüstündeki yan menüyle aynı sırada ve başlıklarda", () => {
  assert.deepEqual(MENU.map((m) => m.ad), ["Ana Sayfa", "Şirket Evrakları", "Fatura Yönetimi", "Araç Yönetimi", "Esnaf Defteri", "Akaryakıt", "İç Hizmetler", "Okul Yönetimi", "Ayarlar"]);
});

test("her menü ögesinin ikon dosyası var ve kimlikler benzersiz", () => {
  for (const m of MENU) assert.ok(existsSync(new URL(m.resim, kok)), m.resim);
  assert.equal(new Set(MENU.map((m) => m.id)).size, MENU.length);
});

test("alt çubuk sırası yalnızca bilinen modülleri içerir", () => {
  for (const id of ALT_CUBUK_SIRASI) assert.ok(MENU.some((m) => m.id === id), id);
});
