// Yeni şirket başvurusu (giriş ekranından, herkese açık). Başvuran parolasını kendisi seçer; parola sunucuda yalnızca bcrypt özeti olarak saklanır
// ve platform yöneticisi onaylayınca hesaba aynen aktarılır. Şirket kodu (6 haneli rakam) başvuru anında sunucu tarafından üretilir ve gösterilir.
import * as api from "../api.js";
import { h, parolaAlani } from "../ui.js";

const NEDENLER = {
  ad: "Şirket adını yazın (2-80 karakter).",
  yetkili: "Yetkili adını ve soyadını yazın.",
  eposta: "E-posta adresi geçersiz.",
  telefon: "Telefon numarası çok uzun.",
  kullanici: "Kullanıcı adı 2-30 karakter olmalı; yalnızca harf (a-z), rakam, nokta, tire ve alt çizgi.",
  parola: "Şifre 8-72 karakter olmalı.",
  not: "Not en fazla 500 karakter olabilir.",
  cok_basvuru: "Bu e-posta adresiyle bekleyen başvurularınız var. Lütfen onaylanmasını bekleyin.",
};

export function basvuruEkrani({ geri }) {
  const alan = (etiket, girdi, ipucu) => h("label", { class: "alan" }, h("span", {}, etiket), girdi, ipucu && h("span", { class: "ipucu" }, ipucu));
  const girdi = (ozellik) => h("input", { class: "girdi", type: "text", autocapitalize: "none", spellcheck: "false", ...ozellik });

  const sirketAdi = girdi({ autocapitalize: "words", autocomplete: "organization", required: true, maxlength: "80" });
  const yetkili = girdi({ autocapitalize: "words", autocomplete: "name", required: true, maxlength: "80" });
  const eposta = girdi({ type: "email", autocomplete: "email", required: true, maxlength: "120" });
  const telefon = girdi({ type: "tel", autocomplete: "tel", maxlength: "30" });
  const kullanici = girdi({ autocomplete: "username", required: true, maxlength: "30" });
  const parola = girdi({ type: "password", autocomplete: "new-password", required: true, maxlength: "72", minlength: "8" });
  const parola2 = girdi({ type: "password", autocomplete: "new-password", required: true, maxlength: "72" });
  const not = h("textarea", { class: "girdi metin-alani", rows: "3", maxlength: "500", placeholder: "İsteğe bağlı" });
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const gonder = h("button", { class: "dugme birincil genis", type: "submit" }, "Başvuruyu gönder");

  const hataYaz = (m) => { mesaj.textContent = m; mesaj.hidden = false; gonder.disabled = false; gonder.textContent = "Başvuruyu gönder"; };

  const form = h("form", { class: "form", onsubmit: async (e) => {
    e.preventDefault();
    mesaj.hidden = true;
    if (parola.value !== parola2.value) return hataYaz("Şifreler aynı değil.");
    gonder.disabled = true; gonder.textContent = "Gönderiliyor";
    try {
      const r = await api.rpc("sirket_basvur", {
        p_ad: sirketAdi.value, p_yetkili: yetkili.value, p_eposta: eposta.value, p_telefon: telefon.value,
        p_kullanici: kullanici.value, p_parola: parola.value, p_not: not.value,
      });
      if (!r || r.ok !== true) return hataYaz(NEDENLER[r && r.neden] || "Başvuru gönderilemedi. Bilgileri kontrol edin.");
      basariGoster(r.kod);
    } catch (err) { hataYaz(err.message); }
  } },
    alan("Şirket adı", sirketAdi),
    alan("Yetkili adı soyadı", yetkili),
    alan("E-posta", eposta),
    alan("Telefon", telefon),
    alan("Yönetici kullanıcı adınız", kullanici, "Onaylandığında bu adla giriş yaparsınız."),
    alan("Şifre", parolaAlani(parola), "En az 8 karakter. Onaylandığında bu şifreyle giriş yaparsınız."),
    alan("Şifre (tekrar)", parolaAlani(parola2)),
    alan("Not", not),
    mesaj, gonder);

  const kap = h("main", { class: "tam-ekran giris basvuru" },
    h("h1", {}, "Yeni şirket başvurusu"),
    h("p", { class: "soluk" }, "Başvurunuz incelendikten sonra şirketiniz açılır. Şirket kodunuz başvuru sonrası size verilir."),
    form,
    h("button", { class: "dugme ikincil genis", type: "button", onclick: geri }, "Giriş ekranına dön"));

  function basariGoster(kod) {
    kap.replaceChildren(
      h("h1", {}, "Başvurunuz alındı"),
      h("div", { class: "kart" },
        h("p", {}, "Şirket kodunuz:"),
        h("p", { class: "kod-buyuk", "aria-label": `Şirket kodu ${String(kod).split("").join(" ")}` }, kod),
        h("p", { class: "soluk" }, "Bu kodu not edin. Onaylandığında giriş ekranında şirket kodu, kullanıcı adınız (" + kullanici.value.trim().toLowerCase() + ") ve başvuruda seçtiğiniz şifreyle giriş yaparsınız."),
        h("p", { class: "soluk" }, "Kodu giriş ekranında yazdığınızda başvurunuzun durumu görünür.")),
      h("button", { class: "dugme birincil genis", type: "button", onclick: geri }, "Giriş ekranına dön"));
  }
  return kap;
}
