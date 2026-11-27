// Yönetim (yalnızca platform yöneticisi): şirket başvurularını onaylar/reddeder, doğrudan şirket açar, lisans uzatır, şirketi blokeler/açar, şirketin kullanıcılarına bitiş tarihi verir/kapatır, tüm şirketleri bakım moduna alır.
// Yetki sunucuda zorlanır (platform_* fonksiyonları); bu ekran yalnızca yöneticiye gösterilir.
import * as api from "../api.js";
import * as sure from "../sure.js";
import { tarihCoz, tarihYaz } from "../bicim.js";
import { h, kart, satir, bosDurum, panelAc, toast, animOnay } from "../ui.js";

const PAROLA_ALFABESI = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";   // karışan karakterler (0/O, 1/l/I) yok

export function rastgeleParola(uzunluk = 14) {
  const b = new Uint32Array(uzunluk);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => PAROLA_ALFABESI[x % PAROLA_ALFABESI.length]).join("");
}

const baglanti = (kod) => `${location.origin}${location.pathname}?i=${kod}`;
const tarihMetni = (iso) => (iso ? tarihYaz(tarihCoz(String(iso).slice(0, 10))) : "");
// Son bağlantı zamanı: gün.ay.yıl ss:dd (cihazın saatine göre); 2 dakikadan yakınsa "Çevrimiçi".
const baglantiMetni = (iso) => {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  if (Date.now() - t.getTime() < 120000) return "Çevrimiçi";
  const iki = (n) => String(n).padStart(2, "0");
  return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`;
};
const lisansMetni = (s) => {
  if (s.omur_boyu) return "süresiz";
  const kalan = Math.round((new Date(s.lisans_bitis + "T00:00:00") - new Date(new Date().toDateString())) / 86400000);
  return kalan < 0 ? `süresi ${-kalan} gün önce doldu` : `${tarihMetni(s.lisans_bitis)} (${kalan} gün)`;
};

// Bir düğmeyi işlem boyunca kilitler; hata olursa mesaj alanına yazar.
async function yap(dugme, mesaj, is) {
  const eski = dugme.textContent;
  dugme.disabled = true; mesaj.hidden = true;
  try { await is(); }
  catch (e) { mesaj.textContent = e.message; mesaj.hidden = false; }
  finally { dugme.disabled = false; dugme.textContent = eski; }
}

function sayi(girdi) {
  const t = String(girdi.value).trim();
  return t === "" ? null : Number.parseInt(t, 10);
}

function lisansAlanlari(varsayilanGun = 30) {
  const gun = h("input", { class: "girdi", type: "number", inputmode: "numeric", min: "0", value: String(varsayilanGun), "aria-label": "Lisans süresi (gün)" });
  const omur = animOnay({ etiket: "Süresiz lisans", degisti: (acik) => { gun.disabled = acik; } });
  const sinir = h("input", { class: "girdi", type: "number", inputmode: "numeric", min: "1", placeholder: "Sınırsız", "aria-label": "Kullanıcı sınırı" });
  const dugumler = [
    h("label", { class: "alan" }, h("span", {}, "Lisans süresi (gün)"), gun),
    omur,
    h("label", { class: "alan" }, h("span", {}, "Kullanıcı sınırı"), sinir),
  ];
  return { dugumler, oku: () => ({ p_gun: omur.deger() ? 0 : (sayi(gun) ?? 0), p_omur_boyu: omur.deger(), p_kullanici_siniri: sayi(sinir) }) };
}

// Müşteriye iletilecek bilgiler: tek seferlik gösterilir, kopyalanabilir.
function sonucPaneli(baslik, satirlar, notMetni) {
  const metin = satirlar.map(([e, d]) => `${e}: ${d}`).join("\n");
  const kopyala = h("button", { class: "dugme ikincil genis", type: "button", onclick: async () => {
    try { await navigator.clipboard.writeText(metin); toast("Kopyalandı"); } catch { toast("Kopyalanamadı; metni elle seçin", "hata"); }
  } }, "Bilgileri kopyala");
  const p = panelAc(baslik, h("div", { class: "form" },
    h("div", { class: "kart" }, satirlar.map(([e, d]) => h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, e), h("strong", { class: "kopyalanabilir" }, d)))),
    h("p", { class: "soluk" }, notMetni), kopyala,
    h("button", { class: "dugme birincil genis", type: "button", onclick: () => p.kapat() }, "Tamam")));
}

function yeniSirketPaneli(yenile) {
  const ad = h("input", { class: "girdi", type: "text", autocapitalize: "words", required: true, maxlength: "80", "aria-label": "Şirket adı" });
  const kullanici = h("input", { class: "girdi", type: "text", autocapitalize: "none", spellcheck: "false", required: true, maxlength: "30", value: "yonetici", "aria-label": "Yönetici kullanıcı adı" });
  const parola = h("input", { class: "girdi", type: "text", autocapitalize: "none", spellcheck: "false", required: true, minlength: "8", maxlength: "72", value: rastgeleParola(), "aria-label": "Şifre" });
  const lisans = lisansAlanlari(30);
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const gonder = h("button", { class: "dugme birincil genis", type: "submit" }, "Şirketi aç");
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    yap(gonder, mesaj, async () => {
      gonder.textContent = "Açılıyor";
      const r = await api.rpc("platform_sirket_ac", { p_ad: ad.value, p_kullanici: kullanici.value, p_parola: parola.value, ...lisans.oku() });
      panel.kapat();
      sonucPaneli("Şirket açıldı", [["Şirket", ad.value.trim()], ["Şirket kodu", r.kod], ["Kullanıcı adı", r.kullanici], ["Şifre", parola.value], ["Bağlantı", baglanti(r.kod)]],
        "Şifre bir daha gösterilmez; müşteriye güvenli bir yolla iletin ve ilk girişte değiştirmesini söyleyin.");
      yenile();
    });
  } },
    h("label", { class: "alan" }, h("span", {}, "Şirket adı"), ad),
    h("label", { class: "alan" }, h("span", {}, "Yönetici kullanıcı adı"), kullanici),
    h("label", { class: "alan" }, h("span", {}, "Şifre"), parola,
      h("button", { class: "dugme ikincil", type: "button", onclick: () => { parola.value = rastgeleParola(); } }, "Yeni şifre üret")),
    lisans.dugumler, mesaj, gonder);
  const panel = panelAc("Yeni şirket aç", form);
}

function basvuruPaneli(b, yenile) {
  const lisans = lisansAlanlari(30);
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const onayla = h("button", { class: "dugme birincil genis", type: "button", onclick: () => yap(onayla, mesaj, async () => {
    onayla.textContent = "Onaylanıyor";
    const r = await api.rpc("platform_basvuru_onayla", { p_id: b.id, ...lisans.oku() });
    panel.kapat();
    sonucPaneli("Şirket açıldı", [["Şirket", b.ad], ["Şirket kodu", r.kod], ["Kullanıcı adı", r.kullanici], ["Bağlantı", baglanti(r.kod)]],
      `Şifreyi başvuran kendi seçti; size gelmez. Şirket kodunu ve bağlantıyı ${r.eposta} adresine iletin.`);
    yenile();
  }) }, "Onayla ve şirketi aç");
  const neden = h("input", { class: "girdi", type: "text", maxlength: "200", placeholder: "Ret nedeni (isteğe bağlı)", "aria-label": "Ret nedeni" });
  const reddet = h("button", { class: "dugme tehlike genis", type: "button", onclick: () => yap(reddet, mesaj, async () => {
    await api.rpc("platform_basvuru_reddet", { p_id: b.id, p_neden: neden.value });
    panel.kapat();
    toast("Başvuru reddedildi");
    yenile();
  }) }, "Reddet");
  const bilgi = (e, d) => d && h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, e), h("span", { class: "bilgi-deger" }, d));
  const panel = panelAc(b.ad, h("div", { class: "form" },
    h("div", { class: "kart" }, bilgi("Şirket kodu", b.kod), bilgi("Yetkili", b.yetkili), bilgi("E-posta", b.eposta), bilgi("Telefon", b.telefon),
      bilgi("Kullanıcı adı", b.kullanici), bilgi("Not", b.not_metni), bilgi("Başvuru", tarihMetni(b.olusturma))),
    lisans.dugumler, mesaj, onayla, neden, reddet));
}

const ROL = { sahip: "Üst Yönetici", yonetici: "Yönetici", kullanici: "Personel" };
const uyeSuresi = (u) => sure.uyeSuresi(u.bitis);
const uyeSuresiDoldu = (u) => sure.uyeSuresiDoldu(u.bitis);
const yerelSaatIso = (v) => new Date(v).toISOString();

function uyePaneli(s, u, listeyiYenile, yenile) {
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const uygula = (dugme, govde, bildirim) => yap(dugme, mesaj, async () => {
    await api.rpc("platform_uye_ayarla", { p_isletme: s.id, p_kullanici: u.id, ...govde });
    toast(bildirim);
    panel.kapat();
    listeyiYenile();
    yenile();
  });
  const suredugme = (yazi, govde, bildirim) => {
    const d = h("button", { class: "dugme ikincil", type: "button", disabled: u.benim }, yazi);
    d.onclick = () => uygula(d, govde, bildirim);
    return d;
  };
  const adet = h("input", { class: "girdi", type: "number", inputmode: "numeric", min: "1", value: "1", "aria-label": "Süre miktarı", disabled: u.benim });
  const birim = h("select", { class: "girdi", "aria-label": "Süre birimi", disabled: u.benim },
    ...sure.BIRIMLER.map(([k, y]) => h("option", { value: k, selected: k === "days" }, y)));
  const bastan = animOnay({ etiket: "Şimdiden başlat (kalan süre silinir)" });
  const ekleDugme = h("button", { class: "dugme birincil", type: "button", disabled: u.benim }, "Süre ver");
  ekleDugme.onclick = () => {
    let aralikMetni;
    try { aralikMetni = sure.aralik(adet.value, birim.value); }
    catch (e) { mesaj.textContent = e.message; mesaj.hidden = false; return; }
    const ad = sure.BIRIMLER.find(([k]) => k === birim.value)[1].toLowerCase();
    uygula(ekleDugme, { p_ekle: aralikMetni, p_bastan: bastan.deger() }, `${adet.value} ${ad} ${bastan.deger() ? "verildi" : "eklendi"}`);
  };
  const ozel = h("input", { class: "girdi", type: "datetime-local", "aria-label": "Kesin bitiş zamanı", disabled: u.benim });
  const ozelDugme = h("button", { class: "dugme ikincil", type: "button", disabled: u.benim }, "Bu zamana ayarla");
  ozelDugme.onclick = () => {
    if (!ozel.value || Number.isNaN(Date.parse(ozel.value))) { mesaj.textContent = "Bir bitiş zamanı seçin."; mesaj.hidden = false; return; }
    uygula(ozelDugme, { p_bitis: yerelSaatIso(ozel.value) }, `Erişim ${sure.anMetni(ozel.value)} zamanına kadar`);
  };
  const durumDugmesi = h("button", { class: u.aktif ? "dugme tehlike genis" : "dugme birincil genis", type: "button", disabled: u.benim && u.aktif }, u.aktif ? "Kullanıcıyı kapat" : "Kullanıcıyı aç");
  durumDugmesi.onclick = () => uygula(durumDugmesi, { p_aktif: !u.aktif }, u.aktif ? "Kullanıcı kapatıldı" : "Kullanıcı açıldı");
  const bilgi = (e, d) => h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, e), h("span", { class: "bilgi-deger" }, d));
  const panel = panelAc(u.ad, h("div", { class: "form" },
    h("div", { class: "kart" }, bilgi("Kullanıcı adı", u.giris), bilgi("Rol", ROL[u.rol] || u.rol), bilgi("Durum", u.aktif ? "Açık" : "Kapalı"), bilgi("Erişim süresi", uyeSuresi(u)),
      u.masaustu_id && bilgi("Masaüstü PC ID", u.masaustu_id), u.son_masaustu && bilgi("Son masaüstü", baglantiMetni(u.son_masaustu)),
      u.son_mobil && bilgi("Son mobil", baglantiMetni(u.son_mobil) + (u.mobil_cihaz ? ` · ${u.mobil_cihaz}` : ""))),
    h("div", { class: "alan" }, h("span", {}, "Erişim süresi ver"), h("div", { class: "dugme-sirasi" }, adet, birim)),
    bastan, ekleDugme,
    h("div", { class: "alan" }, h("span", {}, "Ya da kesin bitiş zamanı"), h("div", { class: "dugme-sirasi" }, ozel, ozelDugme)),
    suredugme("Süresiz yap", { p_sure_kaldir: true }, "Süre sınırı kaldırıldı"),
    mesaj, durumDugmesi, u.benim && h("p", { class: "soluk" }, "Kendi hesabınızı kapatamaz ya da süreye bağlayamazsınız.")));
}

async function kullanicilarPaneli(s, yenile) {
  const icerik = h("div", { class: "form" }, h("p", { class: "soluk" }, "Yükleniyor"));
  panelAc(`${s.ad} · Kullanıcılar`, icerik);
  const doldur = async () => {
    try {
      const liste = await api.rpc("platform_uyeler", { p_isletme: s.id });
      icerik.replaceChildren(liste.length
        ? kart(liste.map((u) => satir({
          baslik: u.ad, alt: `${ROL[u.rol] || u.rol} · ${u.giris}${u.masaustu_id ? ` · PC ID ${u.masaustu_id}` : ""}`, sag: u.aktif ? (uyeSuresiDoldu(u) ? "Süresi doldu" : "") : "Kapalı", sagAlt: u.aktif ? uyeSuresi(u) : "",
          ton: !u.aktif || uyeSuresiDoldu(u) ? "kirmizi" : "", onclick: () => uyePaneli(s, u, doldur, yenile),
        })))
        : bosDurum("Kullanıcı yok."));
    } catch (e) { icerik.replaceChildren(h("p", { class: "hata-metin", role: "alert" }, /platform_uyeler/.test(e.message) ? "Kullanılamıyor: supabase/uye_sure.sql henüz çalıştırılmamış." : e.message)); }
  };
  doldur();
}

function sirketPaneli(s, yenile) {
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const uzat = (gun, omur = false) => {
    const d = h("button", { class: "dugme ikincil", type: "button" }, omur ? "Süresiz yap" : `+${gun} gün`);
    d.onclick = () => yap(d, mesaj, async () => {
      const r = await api.rpc("platform_lisans_uzat", { p_isletme: s.id, p_gun: gun, p_omur_boyu: omur });
      toast(r.omur_boyu ? "Lisans süresiz" : `Lisans ${tarihMetni(r.lisans_bitis)} tarihine kadar`);
      panel.kapat();
      yenile();
    });
    return d;
  };
  const ozelGun = h("input", { class: "girdi", type: "number", inputmode: "numeric", min: "1", placeholder: "Gün", "aria-label": "Özel gün sayısı" });
  const ozelDugme = h("button", { class: "dugme ikincil", type: "button" }, "Uzat");
  ozelDugme.onclick = () => {
    const g = sayi(ozelGun);
    if (!g || g < 1) { mesaj.textContent = "Gün sayısı 1 ya da daha büyük olmalı."; mesaj.hidden = false; return; }
    yap(ozelDugme, mesaj, async () => {
      const r = await api.rpc("platform_lisans_uzat", { p_isletme: s.id, p_gun: g, p_omur_boyu: false });
      toast(`Lisans ${tarihMetni(r.lisans_bitis)} tarihine kadar`);
      panel.kapat();
      yenile();
    });
  };
  const durumDugmesi = h("button", { class: s.aktif ? "dugme tehlike genis" : "dugme birincil genis", type: "button", disabled: s.benim && s.aktif }, s.aktif ? "Şirketi blokele" : "Blokeyi kaldır");
  durumDugmesi.onclick = () => yap(durumDugmesi, mesaj, async () => {
    await api.rpc("platform_isletme_aktif", { p_isletme: s.id, p_aktif: !s.aktif });
    toast(s.aktif ? "Şirket bloke edildi" : "Bloke kaldırıldı");
    panel.kapat();
    yenile();
  });
  const bilgi = (e, d) => h("div", { class: "bilgi" }, h("span", { class: "bilgi-etiket" }, e), h("span", { class: "bilgi-deger" }, d));
  const panel = panelAc(s.ad, h("div", { class: "form" },
    h("div", { class: "kart" }, bilgi("Şirket kodu", s.kod), bilgi("Durum", s.aktif ? "Açık" : "Bloke"), bilgi("Lisans", lisansMetni(s)),
      bilgi("Kullanıcı", `${s.kullanici_sayisi}${s.kullanici_siniri ? " / " + s.kullanici_siniri : ""}`), bilgi("Bağlantı", baglanti(s.kod))),
    h("div", { class: "alan" }, h("span", {}, "Lisansı uzat"), h("div", { class: "dugme-sirasi" }, uzat(30), uzat(90), uzat(365), uzat(0, true))),
    h("div", { class: "dugme-sirasi" }, ozelGun, ozelDugme),
    h("button", { class: "dugme ikincil genis", type: "button", onclick: () => kullanicilarPaneli(s, yenile) }, `Kullanıcılar (${s.kullanici_sayisi})`),
    mesaj, durumDugmesi, s.benim && s.aktif && h("p", { class: "soluk" }, "Kendi şirketinizi blokeleyemezsiniz.")));
}

// Bakım modu: açıkken platform yöneticisi dışındaki herkes (tüm şirketler) Bakım ekranını görür.
function bakimKarti(durum, yenile) {
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const metin = h("input", { class: "girdi", type: "text", maxlength: "300", placeholder: "Ekranda görünecek mesaj (isteğe bağlı)", "aria-label": "Bakım mesajı", value: (durum && durum.mesaj) || "" });
  const acik = Boolean(durum && durum.acik);
  const dugme = h("button", { class: acik ? "dugme birincil genis" : "dugme tehlike genis", type: "button" }, acik ? "Bakım modunu kapat" : "Bakım moduna al");
  dugme.onclick = () => yap(dugme, mesaj, async () => {
    await api.rpc("platform_bakim_ayarla", { p_acik: !acik, p_mesaj: metin.value });
    toast(acik ? "Bakım modu kapatıldı" : "Tüm şirketler bakım modunda");
    yenile();
  });
  if (!durum) return kart(h("h3", {}, "Bakım modu"), h("p", { class: "soluk" }, "Kullanılamıyor: supabase/bakim.sql henüz çalıştırılmamış."));
  return kart(h("h3", {}, acik ? "Bakım modu: açık" : "Bakım modu: kapalı"),
    h("p", { class: "soluk" }, "Açıkken sizin dışınızdaki tüm kullanıcılar Bakım ekranını görür."), metin, mesaj, dugme);
}

// Duyuru: platform yöneticisi tüm şirketlere ya da seçtiği şirkete telefon bildirimi ve duyuru gönderir (yeni sürüm, bakım vb.).
// Başka bir şirketin verisi asla gönderilmez; yalnızca burada yazdığınız metin gider.
function duyuruKarti(sirketler) {
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const baslikGirdisi = h("input", { class: "girdi", type: "text", maxlength: "80", placeholder: "Başlık (örn. Yeni sürüm yayında)", "aria-label": "Duyuru başlığı" });
  const metin = h("textarea", { class: "girdi metin-alani", rows: "3", maxlength: "300", placeholder: "Duyuru metni", "aria-label": "Duyuru metni" });
  const hedef = h("select", { class: "girdi", "aria-label": "Duyurunun gideceği şirket" }, [["", "Tüm şirketler"], ...sirketler.map((s) => [s.kod, `${s.ad} (${s.kod})`])].map(([k, ad]) => h("option", { value: k }, ad)));
  const dugme = h("button", { class: "dugme birincil genis", type: "button" }, "Duyuruyu gönder");
  dugme.onclick = () => {
    if (!metin.value.trim()) { mesaj.textContent = "Duyuru metnini yazın."; mesaj.hidden = false; return; }
    mesaj.hidden = true;
    if (dugme.dataset.onay !== "1") { dugme.dataset.onay = "1"; dugme.textContent = hedef.value ? "Göndermek için tekrar dokunun" : "Tüm şirketlere göndermek için tekrar dokunun"; return; }
    dugme.dataset.onay = "";
    dugme.textContent = "Duyuruyu gönder";
    yap(dugme, mesaj, async () => {
      const s = await api.fonksiyon("duyuru", { baslik: baslikGirdisi.value.trim(), mesaj: metin.value.trim(), kod: hedef.value });
      metin.value = ""; baslikGirdisi.value = "";
      toast(`Duyuru gönderildi (${s.gonderilen || 0} cihaza bildirim)`, "basari");
    });
  };
  return kart(h("h3", {}, "Duyuru gönder"), h("p", { class: "soluk" }, "Seçtiğiniz şirketlerin tüm kullanıcılarının zil listesine eklenir; bildirimi açık telefonlara anlık bildirim gider."),
    hedef, baslikGirdisi, metin, mesaj, dugme);
}

export async function ciz({ yenile }) {
  const [basvurular, sirketler, bakim] = await Promise.all([api.rpc("platform_basvurular"), api.rpc("platform_isletmeler"), api.rpc("bakim_durumu").catch(() => null)]);
  const bekleyen = basvurular.filter((b) => b.durum === "bekliyor");
  const gecmis = basvurular.filter((b) => b.durum !== "bekliyor");
  const DURUM = { onaylandi: "Onaylandı", reddedildi: "Reddedildi" };
  return h("div", { class: "sayfa" },
    bakimKarti(bakim, yenile),
    duyuruKarti(sirketler),
    kart(h("button", { class: "dugme birincil genis", onclick: () => yeniSirketPaneli(yenile) }, "Yeni şirket aç")),
    kart(h("h3", {}, `Bekleyen başvurular (${bekleyen.length})`),
      bekleyen.length ? bekleyen.map((b) => satir({ baslik: b.ad, alt: `${b.yetkili} · ${b.kod}`, sag: tarihMetni(b.olusturma), onclick: () => basvuruPaneli(b, yenile) }))
        : bosDurum("Bekleyen başvuru yok.")),
    kart(h("h3", {}, `Şirketler (${sirketler.length})`),
      sirketler.map((s) => satir({ baslik: s.ad, alt: `${s.kod} · ${s.kullanici_sayisi} kullanıcı`, sag: s.aktif ? "" : "Bloke", sagAlt: lisansMetni(s),
        ton: !s.aktif || (!s.omur_boyu && new Date(s.lisans_bitis + "T23:59:59") < new Date()) ? "kirmizi" : "", onclick: () => sirketPaneli(s, yenile) }))),
    gecmis.length > 0 && kart(h("h3", {}, "Karara bağlanan başvurular"),
      gecmis.map((b) => satir({ baslik: b.ad, alt: `${b.kod} · ${tarihMetni(b.karar_zamani)}`, sag: DURUM[b.durum] || b.durum, ton: b.durum === "onaylandi" ? "yesil" : "kirmizi" }))));
}
