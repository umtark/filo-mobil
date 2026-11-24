// Kullanıcılar (sahip ve yönetici): işletmeye kullanıcı ekler, izinlerini ve parolasını değiştirir, siler.
// Yetki sunucuda zorlanır (uye_kaydet / uye_sil); bu ekran yalnızca sahip ve yöneticiye gösterilir.
import * as api from "../api.js";
import * as veri from "../veri.js";
import { h, kart, satir, bosDurum, panelAc, toast, animOnay, parolaAlani, segment } from "../ui.js";

const IZINLER = [
  ["dashboard", "Gösterge paneli"], ["okul", "Okul"], ["sirket_evrak", "Şirket evrakları"], ["fatura", "Faturalar"], ["arac", "Araçlar"],
  ["esnaf", "Esnaf"], ["petrol", "Akaryakıt"], ["ic_hizmet", "İç hizmet"], ["ayarlar", "Ayarlar"],
];
const ETIKET = Object.fromEntries(IZINLER);
const ROL = { sahip: "Sahip", yonetici: "Yönetici", kullanici: "Kullanıcı" };

const ben = () => veri.baglam.uye;
const sahipMi = () => ben().rol === "sahip";
// Sahip her şeyi, yönetici yalnızca 'kullanici' rolündekileri yönetir; sahip satırı kimse tarafından değiştirilemez.
const yonetilebilir = (u) => u.rol !== "sahip" && (sahipMi() || u.rol === "kullanici");

async function yap(dugme, mesaj, is) {
  dugme.disabled = true; mesaj.hidden = true;
  try { await is(); }
  catch (e) { mesaj.textContent = e.message; mesaj.hidden = false; }
  finally { dugme.disabled = false; }
}

function formPaneli(uye, yenile) {
  const yeni = !uye;
  const ad = h("input", { class: "girdi", type: "text", autocapitalize: "words", autocomplete: "off", spellcheck: "false", required: true, maxlength: "30", value: yeni ? "" : uye.ad, "aria-label": "Kullanıcı adı" });
  const parola = h("input", { class: "girdi", type: "password", autocomplete: "new-password", autocapitalize: "none", spellcheck: "false", maxlength: "72", placeholder: yeni ? "" : "Yeni şifre (boşsa değişmez)", "aria-label": "Şifre" });
  let rol = yeni ? "kullanici" : uye.rol;
  const secili = new Set(yeni ? [] : uye.izinler || []);
  const izinKutulari = IZINLER.map(([kod, etiket]) => animOnay({ etiket, isaretli: secili.has(kod), degisti: (a) => { if (a) secili.add(kod); else secili.delete(kod); } }));
  const izinKap = h("div", { class: "kart" }, izinKutulari);
  const salt = animOnay({ etiket: "Yalnızca görüntüleme", isaretli: !yeni && Boolean(uye.salt_okunur) });
  const rolAlani = h("div", {});
  const izinAlani = h("div", {}, izinKap, salt);
  const rolCiz = () => {
    izinAlani.hidden = rol === "yonetici";
    if (!sahipMi()) return;
    rolAlani.replaceChildren(segment([["kullanici", "Kullanıcı"], ["yonetici", "Yönetici"]], rol, (k) => { rol = k; rolCiz(); }));
  };
  rolCiz();
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const kaydet = h("button", { class: "dugme birincil genis", type: "submit" }, yeni ? "Kullanıcı ekle" : "Kaydet");
  const sil = !yeni && h("button", { class: "dugme tehlike genis", type: "button", onclick: () => {
    if (sil.dataset.onay !== "1") { sil.dataset.onay = "1"; sil.textContent = "Silmek için tekrar dokunun"; return; }
    yap(sil, mesaj, async () => {
      await api.rpc("uye_sil", { p_isletme: veri.baglam.isletme, p_ad: uye.ad });
      panel.kapat();
      toast("Kullanıcı silindi");
      yenile();
    });
  } }, "Kullanıcıyı sil");
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    yap(kaydet, mesaj, async () => {
      await api.rpc("uye_kaydet", {
        p_isletme: veri.baglam.isletme, p_ad: ad.value.trim(), p_parola: parola.value, p_rol: rol,
        p_izinler: rol === "yonetici" ? [] : IZINLER.map(([k]) => k).filter((k) => secili.has(k)),
        p_salt_okunur: rol === "yonetici" ? false : salt.deger(), p_eski_ad: yeni ? null : uye.ad,
      });
      panel.kapat();
      toast(yeni ? "Kullanıcı eklendi" : "Kullanıcı güncellendi");
      yenile();
    });
  } },
    h("label", { class: "alan" }, h("span", {}, "Kullanıcı adı"), ad),
    h("label", { class: "alan" }, h("span", {}, "Şifre"), parolaAlani(parola)),
    rolAlani, izinAlani, mesaj, kaydet, sil);
  const panel = panelAc(yeni ? "Yeni kullanıcı" : uye.ad, form);
}

export async function ciz() {
  const liste = await api.sorgu(`uyelikler?select=ad,rol,izinler,salt_okunur&isletme_id=eq.${veri.baglam.isletme}&aktif=eq.true&order=olusturma`);
  const kap = h("div", { class: "sayfa" });
  const yenile = async () => {
    const t = await ciz();
    kap.replaceWith(t);
  };
  const ozet = (u) => {
    if (u.rol !== "kullanici") return ROL[u.rol] || u.rol;
    const izin = (u.izinler || []).map((m) => ETIKET[m] || m).join(", ") || "İzin yok";
    return u.salt_okunur ? `${izin} · yalnızca görüntüleme` : izin;
  };
  kap.append(
    kart(h("button", { class: "dugme birincil genis", onclick: () => formPaneli(null, yenile) }, "Kullanıcı ekle")),
    liste.length
      ? kart(liste.map((u) => satir({ baslik: u.ad, alt: ozet(u), sag: u.rol === "kullanici" ? "" : ROL[u.rol], onclick: yonetilebilir(u) ? () => formPaneli(u, yenile) : undefined })))
      : bosDurum("Kullanıcı yok"));
  return kap;
}
