// Sahip bildirimleri: masaüstündeki kullanıcı hareketleri zil listesinde ve (açıksa) anlık bildirim olarak görünür.
// Yalnızca işletmenin sahibine gösterilir; sunucu da yalnızca sahibe okuma izni verir (supabase/bildirim.sql).
import * as api from "./api.js";
import * as veri from "./veri.js";
import { VAPID_ANAHTARI } from "./config.js";
import { h, ikon, kart, satir, panelAc, toast, bosDurum } from "./ui.js";

const SAYFA = 50;
let rozet = null;
let sonZaman = null;      // bu oturumda görülen en yeni bildirimin zamanı (yeni gelen için toast)
let sonSorgu = 0;
let tabloYok = false;

export const sahipMi = () => Boolean(veri.baglam.uye) && veri.baglam.uye.rol === "sahip";

function rozetYaz(adet) {
  if (!rozet) return;
  rozet.hidden = adet <= 0;
  rozet.textContent = adet >= SAYFA ? `${SAYFA}+` : String(adet);
}

function zamanMetni(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const iki = (n) => String(n).padStart(2, "0");
  return `${iki(t.getDate())}.${iki(t.getMonth() + 1)}.${t.getFullYear()} ${iki(t.getHours())}:${iki(t.getMinutes())}`;
}

async function okumaZamani() {
  const k = api.kullanici();
  const o = await api.sorgu(`bildirim_okuma?select=son_okuma&isletme_id=eq.${veri.baglam.isletme}&kullanici_id=eq.${encodeURIComponent(k.id)}`);
  return (o[0] && o[0].son_okuma) || null;
}

const bildirimSorgusu = (filtre = "") =>
  api.sorgu(`bildirimler?select=id,kullanici_ad,kategori,mesaj,olusturma&isletme_id=eq.${veri.baglam.isletme}${filtre}&order=olusturma.desc&limit=${SAYFA}`);

// Okunmamış sayısını günceller; oturum açıkken yeni bir bildirim gelirse kısa bir uyarı gösterir. Çağıran en sık 20 saniyede bir çağırabilir.
export async function okunmamisTazele() {
  if (!sahipMi() || tabloYok || !rozet || Date.now() - sonSorgu < 20000) return;
  sonSorgu = Date.now();
  try {
    const son = await okumaZamani();
    const l = await bildirimSorgusu(son ? `&olusturma=gt.${encodeURIComponent(son)}` : "");
    rozetYaz(l.length);
    if (l.length && sonZaman && Date.parse(l[0].olusturma) > Date.parse(sonZaman)) toast(`${l[0].kullanici_ad}: ${l[0].mesaj}`);
    if (l.length) sonZaman = l[0].olusturma;
    else if (!sonZaman) sonZaman = new Date().toISOString();
  } catch (e) {
    if (e.durum === 404 || e.durum === 400) tabloYok = true;   // bildirim.sql uygulanmamış: zil sessiz kalır
  }
}

// ── Anlık bildirim (Web Push) ───────────────────────────────────────────────
const pushDestekli = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function anahtarCevir(b64) {
  const dolgu = "=".repeat((4 - (b64.length % 4)) % 4);
  const ham = atob((b64 + dolgu).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(ham, (c) => c.charCodeAt(0));
}

const cihazAdi = () => {
  const u = navigator.userAgent || "";
  return (/iPhone|iPad/.test(u) ? "iPhone" : /Android/.test(u) ? "Android" : /Windows/.test(u) ? "Windows" : /Mac/.test(u) ? "Mac" : "Diğer").slice(0, 40);
};

async function mevcutAbonelik() {
  const kayit = await navigator.serviceWorker.ready;
  return kayit.pushManager.getSubscription();
}

async function aboneyiKaydet(ab) {
  const j = ab.toJSON();
  await api.rpc("push_kaydet", { p_isletme: veri.baglam.isletme, p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_cihaz: cihazAdi() });
}

async function pushAc() {
  const izin = await Notification.requestPermission();
  if (izin !== "granted") throw new Error("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verin.");
  const kayit = await navigator.serviceWorker.ready;
  const ab = (await kayit.pushManager.getSubscription()) || (await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarCevir(VAPID_ANAHTARI) }));
  await aboneyiKaydet(ab);
}

async function pushKapat() {
  const ab = await mevcutAbonelik();
  if (!ab) return;
  await api.rpc("push_sil", { p_endpoint: ab.endpoint }).catch(() => {});
  await ab.unsubscribe();
}

// Önceden izin verilmişse abonelik oturum başında sunucuyla eşitlenir (cihaz başka kullanıcıyla kullanıldıysa bildirim doğru kişiye gider).
async function pushEsitle() {
  if (!pushDestekli() || Notification.permission !== "granted") return;
  try { const ab = await mevcutAbonelik(); if (ab) await aboneyiKaydet(ab); } catch { /* sessiz */ }
}

// ── Arayüz ──────────────────────────────────────────────────────────────────
function pushDugmesi() {
  if (!pushDestekli()) return h("p", { class: "soluk" }, "Anlık bildirim için uygulamayı ana ekrana ekleyin.");
  const dugme = h("button", { class: "dugme ikincil genis", type: "button" });
  const mesaj = h("p", { class: "hata-metin", role: "alert", hidden: true });
  const ciz = async () => {
    const acik = Notification.permission === "granted" && Boolean(await mevcutAbonelik().catch(() => null));
    dugme.textContent = acik ? "Anlık bildirimi kapat" : "Anlık bildirimi aç";
    dugme.dataset.acik = acik ? "1" : "0";
  };
  dugme.addEventListener("click", async () => {
    dugme.disabled = true; mesaj.hidden = true;
    try { if (dugme.dataset.acik === "1") await pushKapat(); else await pushAc(); }
    catch (e) { mesaj.textContent = e.message; mesaj.hidden = false; }
    finally { dugme.disabled = false; ciz(); }
  });
  ciz();
  return h("div", { class: "form" }, dugme, mesaj);
}

async function listePaneli() {
  const icerik = h("div", { class: "form" }, h("p", { class: "soluk" }, "Yükleniyor"));
  panelAc("Bildirimler", icerik);
  try {
    const son = await okumaZamani().catch(() => null);
    const l = await bildirimSorgusu();
    const yeniMi = (b) => !son || Date.parse(b.olusturma) > Date.parse(son);
    icerik.replaceChildren(
      pushDugmesi(),
      l.length
        ? kart(l.map((b) => satir({ baslik: b.kullanici_ad || "Kullanıcı", alt: b.kategori ? `${b.kategori}: ${b.mesaj}` : b.mesaj, sag: zamanMetni(b.olusturma), ton: yeniMi(b) ? "yesil" : "" })))
        : bosDurum("Bildirim yok"));
    rozetYaz(0);
    if (l.length) sonZaman = l[0].olusturma;
    await api.rpc("bildirim_okundu", { p_isletme: veri.baglam.isletme }).catch(() => {});
  } catch (e) {
    icerik.replaceChildren(h("p", { class: "hata-metin", role: "alert" }, e.message));
  }
}

// Başlık çubuğundaki zil düğmesi; yalnızca sahipte vardır (başkasında null).
export function zilDugmesi() {
  if (!sahipMi() || tabloYok) return null;
  rozet = h("span", { class: "zil-rozet", hidden: true });
  const dugme = h("button", { class: "ikon-dugme zil-dugme", type: "button", "aria-label": "Bildirimler", onclick: listePaneli }, ikon("zil", 24), rozet);
  sonSorgu = 0;
  okunmamisTazele();
  pushEsitle();
  return dugme;
}
