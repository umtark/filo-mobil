// Kayıt formları: alan tanımından alt panel üretir (ekle / düzenle / sil). Tüm ekranlar aynı formu kullanır.
import { h, ikon, panelAc, toast, animOnay, segment } from "./ui.js";
import { sayi, tarihCoz, isoTarih } from "./bicim.js";

const iki = (n) => String(n).padStart(2, "0");
// Masaüstü kayıtları tarihi "gg.aa.yyyy" tutar; tarih girişi ISO ("yyyy-aa-gg") çalışır.
export const trTarih = (d) => (d ? `${iki(d.getDate())}.${iki(d.getMonth() + 1)}.${d.getFullYear()}` : "");
export const trdenIso = (s) => { const d = tarihCoz(s); return d ? isoTarih(d) : ""; };
export const isodanTr = (s) => { const d = tarihCoz(s); return d ? trTarih(d) : ""; };
export const yuvarla = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Yeni veri girişi düğmeleri her ekranda aynı: yeşil zemin, beyaz yazı.
export const ekleDugmesi = (etiket, tikla) => h("button", { class: "dugme ekle genis", type: "button", onclick: tikla }, ikon("arti", 18), etiket);

// Detay ekranının altındaki Düzenle / Sil düğmeleri; yazma yetkisi yoksa hiç gösterilmez.
export function islemDugmeleri({ duzenle, sil }) {
  const d = [];
  if (duzenle) d.push(h("button", { class: "dugme ikincil", type: "button", onclick: duzenle }, "Düzenle"));
  if (sil) d.push(h("button", { class: "dugme tehlike", type: "button", onclick: sil }, "Sil"));
  return d.length ? h("div", { class: "iki-sutun" }, d) : null;
}

export function onayAc(baslik, mesaj, etiket = "Sil") {
  return new Promise((coz) => {
    let bitti = false;
    const bitir = (v) => { if (bitti) return; bitti = true; panel.kapat(); coz(v); };
    const panel = panelAc(baslik, h("div", { class: "form" }, h("p", {}, mesaj),
      h("button", { class: "dugme tehlike genis", type: "button", onclick: () => bitir(true) }, etiket),
      h("button", { class: "dugme ikincil genis", type: "button", onclick: () => bitir(false) }, "Vazgeç")));
  });
}

function alanKur(a, deger) {
  const ilk = deger[a.ad] !== undefined && deger[a.ad] !== null ? deger[a.ad] : a.varsayilan !== undefined ? a.varsayilan : "";
  if (a.tur === "ozel") return a.kur(ilk, deger);
  const etiketle = (govde) => h("label", { class: "alan" }, h("span", {}, a.etiket), govde, a.ipucu && h("span", { class: "ipucu" }, a.ipucu));
  if (a.tur === "onay") {
    const o = animOnay({ etiket: a.etiket, isaretli: Boolean(ilk) });
    return { kok: o, oku: () => o.deger(), bos: () => false };
  }
  if (a.tur === "segment") {
    let secili = ilk || a.secenekler[0][0];
    const kap = h("div", { class: "alan" }, h("span", {}, a.etiket));
    const ciz = () => kap.querySelector(".segment")?.remove() || null;
    const kur = () => { ciz(); kap.append(segment(a.secenekler, secili, (k) => { secili = k; kur(); })); };
    kur();
    return { kok: kap, oku: () => secili, bos: () => false };
  }
  if (a.tur === "secim") {
    const s = h("select", { class: "girdi", "aria-label": a.etiket }, (a.bos !== false ? [["", "Seçiniz"]] : []).concat(a.secenekler.map((x) => (Array.isArray(x) ? x : [x, x])))
      .map(([k, ad]) => h("option", { value: k }, ad)));
    s.value = String(ilk);
    if (s.value !== String(ilk) && ilk !== "") s.append(h("option", { value: ilk }, ilk)), s.value = String(ilk);
    return { kok: etiketle(s), oku: () => s.value, bos: () => s.value === "" };
  }
  if (a.tur === "uzun") {
    const t = h("textarea", { class: "girdi metin-alani", rows: String(a.satir || 3), "aria-label": a.etiket, maxlength: String(a.uzunluk || 2000) });
    t.value = ilk;
    return { kok: etiketle(t), oku: () => t.value.trim(), bos: () => !t.value.trim() };
  }
  if (a.tur === "tarih") {
    const g = h("input", { class: "girdi", type: "date", value: trdenIso(ilk) || (a.bugun ? isoTarih(new Date()) : ""), "aria-label": a.etiket });
    const cikti = a.iso ? (v) => v : isodanTr;
    return { kok: etiketle(g), oku: () => (g.value ? cikti(g.value) : (a.bosDeger ?? "")), bos: () => !g.value };
  }
  if (a.tur === "para" || a.tur === "sayi") {
    const g = h("input", { class: "girdi", type: "text", inputmode: "decimal", autocomplete: "off", "aria-label": a.etiket, placeholder: a.yerTutucu || "" });
    g.value = ilk === "" || ilk === 0 && !a.sifirGoster ? "" : String(ilk).replace(".", ",");
    if (a.degisti) g.addEventListener("input", () => a.degisti(sayi(g.value)));
    const kok = etiketle(g);
    return { kok, girdi: g, oku: () => (a.tamSayi ? Math.round(sayi(g.value)) : sayi(g.value)), bos: () => !g.value.trim() || (a.zorunluPozitif && !(sayi(g.value) > 0)) };
  }
  const liste = a.liste ? h("datalist", { id: "dl-" + a.ad }, a.liste.map((x) => h("option", { value: x }))) : null;
  const g = h("input", { class: "girdi", type: a.tur === "tel" ? "tel" : "text", inputmode: a.tur === "tel" ? "tel" : undefined, autocomplete: "off", list: liste ? "dl-" + a.ad : undefined,
    maxlength: String(a.uzunluk || 200), "aria-label": a.etiket, placeholder: a.yerTutucu || "", autocapitalize: a.buyuk ? "characters" : undefined });
  g.value = ilk;
  const oku = () => { const v = g.value.trim(); return a.buyuk ? v.toLocaleUpperCase("tr") : v; };
  return { kok: etiketle(liste ? [g, liste] : g), girdi: g, oku, bos: () => !g.value.trim() };
}

// alanlar: [{ ad, etiket, tur: metin|tel|para|sayi|tarih|secim|uzun|onay|segment|ozel, zorunlu, secenekler, varsayilan, ... }]
// yan: iki alanı yan yana koymak için { yan: [alan, alan] }
export function formAc({ baslik, alanlar, deger = {}, kaydet, sil, silMesaj = "Bu kayıt silinsin mi?", kaydetEtiket = "Kaydet" }) {
  const duz = alanlar.flatMap((a) => (a.yan ? a.yan : [a]));
  const kurulu = new Map(duz.map((a) => [a.ad, alanKur(a, deger)]));
  const hata = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const dugme = h("button", { class: "dugme birincil genis", type: "submit" }, kaydetEtiket);
  const silDugmesi = sil && h("button", { class: "dugme tehlike genis", type: "button", onclick: silTikla }, "Sil");
  const hataYaz = (m) => { hata.textContent = m; hata.hidden = false; };
  const govde = alanlar.map((a) => (a.yan ? h("div", { class: "iki-sutun" }, a.yan.map((x) => kurulu.get(x.ad).kok)) : kurulu.get(a.ad).kok));
  const form = h("form", { class: "form", onsubmit: (e) => { e.preventDefault(); gonder(); } }, govde, hata, dugme, silDugmesi);
  const panel = panelAc(baslik, form);

  async function gonder() {
    hata.hidden = true;
    const sonuc = {};
    for (const a of duz) {
      const k = kurulu.get(a.ad);
      if (a.zorunlu && k.bos()) return hataYaz(`${a.etiket} zorunlu.`);
      sonuc[a.ad] = k.oku();
    }
    dugme.disabled = true; dugme.textContent = "Kaydediliyor";
    try {
      await kaydet(sonuc);
      panel.kapat();
      toast("Kaydedildi", "basari");
    } catch (e) {
      dugme.disabled = false; dugme.textContent = kaydetEtiket;
      hataYaz(e.message);
    }
  }

  async function silTikla() {
    if (!(await onayAc("Silinsin mi?", silMesaj))) return;
    silDugmesi.disabled = true;
    try {
      await sil();
      panel.kapat();
      toast("Silindi", "basari");
    } catch (e) {
      silDugmesi.disabled = false;
      hataYaz(e.message);
    }
  }
  return panel;
}
