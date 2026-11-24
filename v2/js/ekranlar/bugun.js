// Bugün: işletmenin tek bakışta durumu. Her blok kendi verisini yükler; biri hata verirse diğerleri görünmeye devam eder.
import { h, kart, satir, ayCubugu, bosDurum, yukleniyor, hataGoster } from "../ui.js";
import * as veri from "../veri.js";
import { aylikGelirGider, okulToplam } from "../hesap.js";
import { para, ayAdi, ayAnahtari, bugun } from "../bicim.js";
import { durum as okulDurumu } from "./okul.js";
import { aracAc, kalanYaz, belgeTonu } from "./filo.js";

const durum = { ay: null };

export async function ciz(sekmeyeGit) {
  const d = bugun();
  const sayfa = h("div", { class: "sayfa" },
    h("div", { class: "karsilama" },
      h("p", { class: "soluk" }, new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long" }).format(d)),
      h("h2", {}, veri.baglam.isletmeAdi || "Filo Muhasebe")));
  if (["fatura", "petrol", "esnaf"].every(veri.izinVar)) sayfa.append(blok(gelirGider));
  if (veri.izinVar("okul")) sayfa.append(blok(() => tahsilat(sekmeyeGit)));
  if (veri.izinVar("arac")) sayfa.append(blok(belgeler));
  return sayfa;
}

// Bloğu hemen yer tutucuyla koyar, veri gelince doldurur.
function blok(olustur) {
  const kap = h("div", {}, kart(yukleniyor(2)));
  const calistir = () => olustur().then((d) => kap.replaceChildren(d), (e) => kap.replaceChildren(kart(hataGoster(e, () => { kap.replaceChildren(kart(yukleniyor(2))); calistir(); }))));
  calistir();
  return kap;
}

async function gelirGider() {
  const [faturalar, akaryakit, esnaflar] = await Promise.all([veri.faturalar(), veri.akaryakit(), veri.esnaflar()]);
  const aylik = aylikGelirGider(faturalar, akaryakit, esnaflar);
  const bu = ayAnahtari(bugun());
  const aylar = [...new Set([...aylik.keys(), bu])].filter((a) => a <= bu).sort().reverse();
  if (!aylar.includes(durum.ay)) durum.ay = bu;
  const kap = h("div");
  function guncelle() {
    const k = aylik.get(durum.ay) || { gelir: 0, gider: 0 };
    const net = k.gelir - k.gider;
    kap.replaceChildren(
      ayCubugu(aylar, durum.ay, (a) => { durum.ay = a; guncelle(); }, ayAdi),
      kart(
        h("p", { class: "kart-etiket" }, "Net"),
        h("p", { class: "buyuk-sayi " + (net < 0 ? "kirmizi" : "yesil") }, para(net)),
        h("div", { class: "bilgi-grid" },
          h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, "Gelir"), h("span", { class: "bilgi-deger yesil" }, para(k.gelir))),
          h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, "Gider"), h("span", { class: "bilgi-deger" }, para(k.gider))))));
  }
  guncelle();
  return kap;
}

async function tahsilat(sekmeyeGit) {
  const liste = await veri.okul();
  const t = okulToplam(liste);
  const git = (filtre) => { okulDurumu.filtre = filtre; sekmeyeGit("okul"); };
  return kart(
    h("h3", {}, "Okul tahsilatı"),
    h("p", { class: "buyuk-sayi" }, para(t.kalan)),
    h("p", { class: "soluk" }, `Kalan · ${para(t.odenen)} / ${para(t.ucret)} tahsil edildi`),
    h("div", { class: "liste" },
      satir({ baslik: "Hiç ödemeyen", sag: `${t.bekliyor} öğrenci`, ton: t.bekliyor ? "kirmizi" : "", onclick: () => git("bekliyor") }),
      satir({ baslik: "Eksik ödeyen", sag: `${t.kismi} öğrenci`, ton: t.kismi ? "kehribar" : "", onclick: () => git("kismi") })));
}

async function belgeler() {
  const araclar = await veri.araclar();
  const yaklasan = araclar.flatMap((a) => a.belgeler.filter((b) => b.seviye !== "iyi").map((b) => ({ ...b, arac: a })))
    .sort((x, y) => x.gun - y.gun);
  const SINIR = 8;
  return kart(
    h("h3", {}, "Yaklaşan belgeler"),
    yaklasan.length
      ? h("div", { class: "liste" },
        yaklasan.slice(0, SINIR).map((b) => satir({ baslik: b.arac.plaka, alt: b.ad, sag: kalanYaz(b.gun), ton: belgeTonu(b.seviye), onclick: () => aracAc(b.arac.id, b.arac.plaka) })),
        yaklasan.length > SINIR && h("p", { class: "soluk orta" }, `${yaklasan.length - SINIR} belge daha var (Araç Yönetimi, Süresi yaklaşan)`))
      : bosDurum("30 gün içinde süresi dolacak belge yok."));
}
