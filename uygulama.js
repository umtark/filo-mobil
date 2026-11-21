'use strict';

const $ = (s, r = document) => r.querySelector(s);
const TL = n => {
  const kurus = Math.abs(n - Math.round(n)) > 0.004;
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: kurus ? 2 : 0, maximumFractionDigits: kurus ? 2 : 0 }).format(Math.round(n * 100) / 100) + ' ₺';
};
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const sade = s => String(s ?? '').toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const YONTEM = { nakit: 'Nakit', iban: 'IBAN / Havale', kart: 'Kredi Kartı' };
const FILTRELER = [['hepsi', 'Tümü'], ['bekliyor', 'Ödemeyen'], ['kismi', 'Kısmi'], ['odendi', 'Ödenmiş'], ['pesin', 'Peşin']];
const API = (window.AYAR && window.AYAR.API) || '/api';
const YOKLAMA_MS = ((window.AYAR && window.AYAR.YOKLAMA_SN) || 30) * 1000;

const durum = {
  token: localStorage.getItem('token') || '', kullanici: localStorage.getItem('kullanici') || '',
  izinler: JSON.parse(localStorage.getItem('izinler') || '[]'),
  veri: null, mod: {}, bilinen: {}, filtre: 'hepsi', ara: '', evAra: '', gorunum: localStorage.getItem('gorunum') || 'dashboard', kuruldu: false,
  sonGuncelleme: 0, bagli: true, acik: null, zamanlayici: 0, bekleyen: [],
};
const kartlar = new Map();
const sayilar = {};

/* ---------- bekleyen (gönderilmemiş / işlenmemiş) ödemeler ---------- */
try { durum.bekleyen = JSON.parse(localStorage.getItem('bekleyen') || '[]'); } catch { durum.bekleyen = []; }
const bekleyenKaydet = () => {
  // Fotoğraf verisi büyük olabilir; kota dolarsa yalnızca bellekte kalır
  try { localStorage.setItem('bekleyen', JSON.stringify(durum.bekleyen)); } catch { /* yoksay */ }
};

/* ---------- parola özeti: WebCrypto, yoksa saf JS (yalnızca güvenli olmayan yerel ön gösterim için) ---------- */
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

const SHA_K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const SHA_IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

// Tek SHA-256 bloğu: h (8 sözcük) yerinde güncellenir, w'nin ilk 16 sözcüğü blok verisidir. Ayrılan bellek yok, döngü içi yardımcı çağrı yok.
function sikistir(h, w) {
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15], b = w[i - 2];
    w[i] = (w[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) | 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
  for (let i = 0; i < 64; i++) {
    const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
    const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
}

function sha256(msg) {
  const K = SHA_K;
  const h = new Uint32Array(SHA_IV);
  const n = msg.length, blok = ((n + 9 + 63) >> 6) << 6, p = new Uint8Array(blok);
  p.set(msg); p[n] = 0x80;
  const dv = new DataView(p.buffer); dv.setUint32(blok - 4, n * 8 >>> 0); dv.setUint32(blok - 8, Math.floor(n / 0x20000000));
  const w = new Uint32Array(64);
  for (let o = 0; o < blok; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)) + w[i - 7] + (((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32), ov = new DataView(out.buffer);
  h.forEach((x, i) => ov.setUint32(i * 4, x));
  return out;
}

// PBKDF2-HMAC-SHA256. HMAC'in anahtara bağlı iki sabit bloğu (ipad/opad) bir kez sıkıştırılır; her yineleme yalnızca
// 2 sıkıştırma yapar (eskiden 4) ve bellek ayırmaz.
function pbkdf2Js(sifre, tuz, tur) {
  const anahtar = sifre.length > 64 ? sha256(sifre) : sifre;
  const kb = new Uint8Array(64); kb.set(anahtar);
  const kdv = new DataView(kb.buffer), ik = new Uint32Array(64), ok = new Uint32Array(64);
  for (let i = 0; i < 16; i++) { const x = kdv.getUint32(i * 4); ik[i] = x ^ 0x36363636; ok[i] = x ^ 0x5c5c5c5c; }
  const istate = new Uint32Array(SHA_IV), ostate = new Uint32Array(SHA_IV);
  sikistir(istate, ik); sikistir(ostate, ok);

  // U1 = HMAC(sifre, tuz || INT(1)) — bir kez, genel (yavaş) yolla
  const ikb = new Uint8Array(64).fill(0x36), okb = new Uint8Array(64).fill(0x5c);
  kb.forEach((x, i) => { ikb[i] ^= x; okb[i] ^= x; });
  const s = new Uint8Array(64 + tuz.length + 4); s.set(ikb); s.set(tuz, 64); s[s.length - 1] = 1;
  const ic = sha256(s), d2 = new Uint8Array(96); d2.set(okb); d2.set(ic, 64);
  const u1 = sha256(d2), u1dv = new DataView(u1.buffer);

  const u = new Uint32Array(8), t = new Uint32Array(8), st = new Uint32Array(8), w = new Uint32Array(64);
  for (let j = 0; j < 8; j++) { u[j] = t[j] = u1dv.getUint32(j * 4) | 0; }
  w[8] = 0x80000000 | 0; w[15] = (64 + 32) * 8;   // 32 baytlık mesajın sabit dolgusu
  for (let i = 1; i < tur; i++) {
    st.set(istate); w.set(u, 0); sikistir(st, w);        // iç özet
    w.set(st, 0); st.set(ostate); sikistir(st, w);       // dış özet = yeni U
    for (let j = 0; j < 8; j++) { u[j] = st[j]; t[j] ^= st[j]; }
  }
  const out = new Uint8Array(32), odv = new DataView(out.buffer);
  for (let j = 0; j < 8; j++) odv.setUint32(j * 4, t[j] >>> 0);
  return out;
}

async function parolaOzeti(sifre, tuz, tur) {
  if (window.crypto && crypto.subtle) {
    const anahtar = await crypto.subtle.importKey('raw', enc.encode(sifre), 'PBKDF2', false, ['deriveBits']);
    return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(tuz), iterations: tur }, anahtar, 256));
  }
  await new Promise(r => setTimeout(r, 30));   // yük göstergesi çizilsin
  return hex(pbkdf2Js(enc.encode(sifre), enc.encode(tuz), tur));
}

/* ---------- ağ ---------- */
async function rpc(a, govde = {}) {
  let r;
  try {
    // text/plain: tarayıcı ön kontrol (preflight) yapmasın; Apps Script bunu kabul eder
    r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ a, ...(durum.token ? { t: durum.token } : {}), ...govde }) });
    if (!r.ok) throw new Error('ag');
    const j = await r.json();
    if (!j.ok && j.hata === 'oturum') { cikis(true); throw new Error('oturum'); }
    return j;
  } catch (e) {
    throw e.message === 'oturum' ? e : new Error('ag');
  }
}

const gorunumModulu = g => VERI_MODULU[g] || g;

function veriKur() {
  const o = durum.mod.okul || {};
  durum.veri = { donem_ad: o.donem_ad || '', ogrenciler: o.ogrenciler || [], evraklar: (durum.mod.sirket_evrak || {}).evraklar || [] };
}

function modulleriUygula(j) {
  if (j.kimlik) izinleriUygula(j.kimlik.izinler);
  if (j.surumler) {
    Object.keys(durum.mod).forEach(k => { if (!(k in j.surumler)) { delete durum.mod[k]; delete durum.bilinen[k]; cacheSil(k); } });   // yetkisi alınan modülün verisi silinir
  }
  if (j.moduller) {
    const ilk = !durum.veri;
    Object.entries(j.moduller).forEach(([k, v]) => { durum.mod[k] = v; durum.bilinen[k] = v.surum; cacheYaz(k, v); });
    veriKur(); ciz(ilk, Object.keys(j.moduller));
  }
}

let cekMesgul = false;
async function cek() {
  if (!durum.token || document.hidden || cekMesgul) return;
  cekMesgul = true;
  try {
    // Önce açık olan ekranın verisi (hızlı açılış), diğer değişen modüller arkadan paralel gelir
    const oncelik = [gorunumModulu(durum.gorunum)];
    const j = await rpc('veri', { v: durum.bilinen, m: oncelik });
    durum.bagli = true; durum.sonGuncelleme = Date.now();
    modulleriUygula(j);
    if (!j.ok && j.hata === 'veri_yok') durum.bagli = false;
    else if (j.surumler) {
      const eksik = Object.keys(j.surumler).filter(m => !oncelik.includes(m) && durum.bilinen[m] !== j.surumler[m]);
      await Promise.all(eksik.map(async m => {
        try { modulleriUygula(await rpc('veri', { v: durum.bilinen, m: [m] })); } catch (e) { if (e.message === 'oturum') throw e; }
      }));
    }
    await bekleyenleriIsle();
  } catch (e) { if (e.message !== 'oturum') durum.bagli = false; }
  cekMesgul = false;
  canliGuncelle();
  if (durum.gorunum === 'ayarlar') ayarlarYenile();
}

/* ---------- telefonda saklanan veri (IndexedDB): uygulama açılınca eski hâl anında görünür, yalnızca değişenler iner ---------- */
const cacheIs = (kip, fn) => new Promise((res, rej) => {
  const a = indexedDB.open('filo-cache', 1);
  a.onupgradeneeded = () => a.result.createObjectStore('k');
  a.onerror = () => rej(a.error);
  a.onsuccess = () => { const t = a.result.transaction('k', kip), r = fn(t.objectStore('k')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); };
}).catch(() => null);
const cacheYaz = (k, v) => cacheIs('readwrite', o => o.put(v, 'm:' + k));
const cacheSil = k => cacheIs('readwrite', o => o.delete('m:' + k));
async function cacheYukle() {
  const kul = await cacheIs('readonly', o => o.get('kullanici'));
  if (kul !== durum.kullanici) { await cacheIs('readwrite', o => { o.clear(); o.put(durum.kullanici, 'kullanici'); }); return; }   // başka kullanıcının verisi kullanılmaz
  const anahtarlar = (await cacheIs('readonly', o => o.getAllKeys())) || [], degerler = (await cacheIs('readonly', o => o.getAll())) || [];
  const yuklenen = [];
  anahtarlar.forEach((a, i) => {
    const k = String(a).startsWith('m:') ? a.slice(2) : '';
    if (k && durum.izinler.includes(k) && degerler[i] && degerler[i].surum) { durum.mod[k] = degerler[i]; durum.bilinen[k] = degerler[i].surum; yuklenen.push(k); }
  });
  if (yuklenen.length) { veriKur(); ciz(true, yuklenen); }
}

function yoklamaBaslat() { clearInterval(durum.zamanlayici); durum.zamanlayici = setInterval(cek, YOKLAMA_MS); }

/* ---------- giriş / çıkış ---------- */
function girisGoster() {
  $('#ana').hidden = true; $('#alt-nav').hidden = true; $('#giris').hidden = false;
  $('#g-kullanici').value = durum.kullanici;
  setTimeout(() => ($('#g-kullanici').value ? $('#g-pin') : $('#g-kullanici')).focus(), 50);
}

async function anaGoster() {
  $('#giris').hidden = true; $('#ana').hidden = false;
  if (!durum.kuruldu) { modulleriKur(); durum.kuruldu = true; }
  filtreleriKur(); izinleriUygula(durum.izinler, true);
  await cacheYukle();   // önceki veri anında görünür, ağ yanıtı gelince güncellenir
  cek(); yoklamaBaslat();
}

function cikis(sessiz) {
  clearInterval(durum.zamanlayici);
  durum.token = ''; durum.veri = null; durum.mod = {}; durum.bilinen = {}; durum._onceki = null; durum.navImza = '';
  ayarDurum.liste = null; ayarDurum.hata = '';
  if (!sessiz) cacheIs('readwrite', o => o.clear());   // oturum süresi dolduğunda veri kalır (aynı kullanıcı girerse hızlı açılır); çıkışta silinir
  ['token', 'izinler', 'bekleyen'].forEach(k => localStorage.removeItem(k)); durum.bekleyen = [];
  kartlar.forEach(k => k.li.remove()); kartlar.clear(); $('#ev-liste').innerHTML = '';
  document.querySelectorAll('.gorunum[data-modul]').forEach(s => s.remove()); durum.kuruldu = false;
  kapat(); $('#sayfa-icerik').innerHTML = ''; girisGoster();
  if (sessiz) $('#g-hata').textContent = 'Oturum süresi doldu, tekrar giriş yap.';
}

$('#giris-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('.btn-ana'), kart = $('.giris-kart'), hata = $('#g-hata');
  hata.textContent = ''; btn.classList.add('bekle');
  const sal = () => { kart.classList.remove('salla'); void kart.offsetWidth; kart.classList.add('salla'); };
  try {
    const k = $('#g-kullanici').value.trim(), anahtar = 'tuz:' + k.toLowerCase();
    // Tuz gizli değildir; bir kez alınıp saklanır, sonraki girişler tek istekle olur
    let t = null, saklidan = false;
    try { t = JSON.parse(localStorage.getItem(anahtar) || 'null'); saklidan = !!t; } catch { t = null; }
    if (!t) t = await rpc('tuz', { k });
    let h = await parolaOzeti($('#g-pin').value, t.tuz, t.tur || 150000);
    let g = await rpc('giris', { k, h });
    if (!g.ok && g.hata === 'giris' && saklidan) {   // şifre değişmiş olabilir (tuz yenilenir); aynı tuzsa gerçekten hatalıdır, tekrar denenmez
      const y = await rpc('tuz', { k });
      if (y.tuz !== t.tuz) { t = y; h = await parolaOzeti($('#g-pin').value, t.tuz, t.tur || 150000); g = await rpc('giris', { k, h }); }
    }
    if (g.ok) {
      localStorage.setItem(anahtar, JSON.stringify({ tuz: t.tuz, tur: t.tur }));
      durum.token = g.token; durum.kullanici = g.kullanici; durum.izinler = g.izinler;
      localStorage.setItem('token', g.token); localStorage.setItem('kullanici', g.kullanici);
      localStorage.setItem('izinler', JSON.stringify(g.izinler));
      $('#g-pin').value = ''; anaGoster();
    } else {
      hata.textContent = g.hata === 'cok_deneme' ? 'Çok fazla hatalı deneme. On dakika sonra tekrar dene.' : 'Kullanıcı adı ya da şifre hatalı.';
      sal();
    }
  } catch (err) { hata.textContent = 'Sunucuya ulaşılamıyor.'; }
  btn.classList.remove('bekle');
});
$('#cikis').addEventListener('click', () => cikis(false));

/* ---------- yetkiye göre sekmeler ---------- */
function izinleriUygula(izinler, zorla) {
  durum.izinler = izinler; localStorage.setItem('izinler', JSON.stringify(izinler));
  const acik = MODULLER.filter(m => izinler.includes(m.izin)), nav = $('#alt-nav'), imza = acik.map(m => m.id).join();
  if (zorla || durum.navImza !== imza) {   // yoklama her turda geldiği için yalnızca yetki değişince yeniden kurulur
    durum.navImza = imza;
    nav.innerHTML = acik.map(m => `<button data-g="${m.id}"><img src="ikon/${m.id}.png" alt="" width="34" height="34" draggable="false"><span>${m.ad}</span></button>`).join('');
  }
  nav.hidden = acik.length < 2;
  document.body.classList.toggle('altnavli', acik.length > 1);
  if (!acik.length) { document.querySelectorAll('.gorunum').forEach(s => { s.hidden = true; }); $('#baslik').textContent = 'Yetki yok'; $('#donem').hidden = true; return; }
  if (!acik.some(m => m.id === durum.gorunum)) durum.gorunum = acik[0].id;
  gorunumGoster(durum.gorunum);
}

function gorunumGoster(g, kaydir) {
  durum.gorunum = g; localStorage.setItem('gorunum', g);
  document.querySelectorAll('.gorunum').forEach(s => { s.hidden = s.id !== 'v-' + g; });
  $('#baslik').textContent = (MODULLER.find(m => m.id === g) || {}).ad || '';
  $('#donem').hidden = g !== 'tahsilat';
  document.querySelectorAll('#alt-nav button').forEach(b => b.classList.toggle('secili', b.dataset.g === g));
  if (g === 'ayarlar') ayarlarYenile();
  if (kaydir) window.scrollTo({ top: 0 });
}
$('#alt-nav').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  kapat(); gorunumGoster(b.dataset.g, true);
  const nav = $('#alt-nav'); nav.scrollTo({ left: b.offsetLeft - (nav.clientWidth - b.clientWidth) / 2, behavior: 'smooth' });
});

/* ---------- tahsilat listesi ---------- */
const filtreUygun = (o, f) => f === 'hepsi' ? true : f === 'pesin' ? o.pesin : o.durum === f;
const aramaUygun = (o, q) => !q || sade(`${o.ad} ${o.sinif} ${o.plaka}`).includes(q);

function filtreleriKur() {
  const nav = $('#filtreler');
  if (nav.childElementCount) return;
  FILTRELER.forEach(([k, ad]) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.k = k; b.innerHTML = `${ad}<b>0</b>`;
    b.addEventListener('click', () => { durum.filtre = k; listeyiCiz(false); filtreSayilari(); });
    nav.append(b);
  });
}

function filtreSayilari() {
  const liste = durum.veri ? durum.veri.ogrenciler : [];
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('secili', c.dataset.k === durum.filtre);
    c.querySelector('b').textContent = liste.filter(o => filtreUygun(o, c.dataset.k)).length;
  });
}

function sayac(el, hedef, bicim) {
  const bas = sayilar[el.id] ?? 0; sayilar[el.id] = hedef;
  if (bas === hedef) { el.textContent = bicim(hedef); return; }
  const t0 = performance.now(), sure = 900;
  const adim = t => {
    const p = Math.min(1, (t - t0) / sure), e = 1 - Math.pow(1 - p, 3);
    el.textContent = bicim(bas + (hedef - bas) * e);
    if (p < 1) requestAnimationFrame(adim);
  };
  requestAnimationFrame(adim);
}

function ozetCiz() {
  const l = durum.veri.ogrenciler;
  const ucret = l.reduce((a, o) => a + o.ucret, 0), odenen = l.reduce((a, o) => a + o.odenen, 0);
  const kalan = l.reduce((a, o) => a + o.kalan, 0), oran = ucret ? odenen / ucret * 100 : 0;
  sayac($('#o-ucret'), ucret, TL); sayac($('#o-odenen'), odenen, TL); sayac($('#o-kalan'), kalan, TL);
  sayac($('#o-oran'), oran, v => '%' + v.toFixed(1).replace('.', ','));
  requestAnimationFrame(() => { $('#o-bar').style.width = Math.min(100, oran) + '%'; });
}

const RENKLER = [['#8b5cf6', '#6d28d9'], ['#38bdf8', '#2563eb'], ['#f472b6', '#be185d'], ['#34d399', '#047857'], ['#fbbf24', '#b45309'], ['#fb7185', '#be123c']];
const bas = ad => ad.trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toLocaleUpperCase('tr');
const renk = ad => RENKLER[[...ad].reduce((a, c) => a + c.charCodeAt(0), 0) % RENKLER.length];
const yuzde = o => o.ucret > 0 ? Math.min(100, o.odenen / o.ucret * 100) : (o.odenen > 0 ? 100 : 0);
const DURUM_AD = { odendi: 'Ödendi', kismi: 'Kısmi', bekliyor: 'Ödemedi' };

function kartHtml(o) {
  const [a1, a2] = renk(o.ad);
  const bek = durum.bekleyen.filter(p => p.ogrenci === o.id && p.durum !== 'islendi').length;
  return `<div class="k-ust">
    <div class="avatar" style="--a1:${a1};--a2:${a2}">${esc(bas(o.ad))}</div>
    <div class="k-orta"><div class="k-ad">${esc(o.ad)}</div><div class="k-alt">${esc(o.sinif)} · ${esc(o.plaka)}</div></div>
    <div class="k-sag"><div class="k-kalan ${o.kalan <= 0.01 ? 'sifir' : ''}">${o.kalan <= 0.01 ? 'Borç yok' : TL(o.kalan)}</div>
      <span class="rozet-d ${o.durum}">${DURUM_AD[o.durum]}</span>${o.pesin ? '<span class="rozet-d pesin">Peşin</span>' : ''}${bek ? '<span class="rozet-d bek">⏳ ' + bek + '</span>' : ''}</div>
  </div>
  <div class="k-bar"><i class="${o.durum}" data-w="${yuzde(o).toFixed(1)}"></i></div>`;
}

function listeyiCiz(ilk, degisenler = new Set()) {
  const q = sade(durum.ara.trim());
  const secili = durum.veri.ogrenciler.filter(o => filtreUygun(o, durum.filtre) && aramaUygun(o, q));
  const ul = $('#liste'), gor = new Set(secili.map(o => o.id));
  kartlar.forEach((k, id) => { if (!gor.has(id)) { k.li.remove(); kartlar.delete(id); } });
  const parca = document.createDocumentFragment();
  secili.forEach((o, i) => {
    const bek = durum.bekleyen.filter(p => p.ogrenci === o.id && p.durum !== 'islendi').length;
    const imza = JSON.stringify([o.durum, o.odenen, o.ucret, o.pesin, o.ad, o.plaka, o.sinif, bek]);
    let k = kartlar.get(o.id);
    if (!k) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.className = 'kart yeni'; b.style.animationDelay = Math.min(i, 12) * 35 + 'ms';
      b.addEventListener('click', () => ac(o.id));
      li.append(b); k = { li, el: b, imza: '' }; kartlar.set(o.id, k);
      b.addEventListener('animationend', ev => { if (ev.animationName === 'yuksel') b.classList.remove('yeni'); });
    }
    if (k.imza !== imza) {
      k.el.innerHTML = kartHtml(o);
      if (k.imza && degisenler.has(o.id)) { k.el.classList.remove('degisti'); void k.el.offsetWidth; k.el.classList.add('degisti'); }
      k.imza = imza;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const bar = k.el.querySelector('.k-bar i'); if (bar) bar.style.width = bar.dataset.w + '%';
      }));
    }
    parca.append(k.li);
  });
  ul.append(parca);
  $('#bos').hidden = secili.length > 0;
}

/* ---------- evraklar ---------- */
function evrakCiz() {
  const q = sade(durum.evAra.trim());
  const liste = (durum.veri?.evraklar || []).filter(e => !q || sade(`${e.baslik} ${e.firma} ${e.kategori} ${e.dosya_adi}`).includes(q));
  const gruplar = {};
  liste.forEach(e => (gruplar[e.kategori || 'Diğer'] ||= []).push(e));
  $('#ev-liste').innerHTML = Object.entries(gruplar).map(([kat, l]) => `
    <h3 class="d-sec">${esc(kat)} <b>${l.length}</b></h3>
    <ul class="liste">${l.map(e => `<li><button class="kart ev" data-id="${esc(e.id)}">
      <div class="k-ust"><div class="avatar ev-ikon">${esc((e.dosya_adi.split('.').pop() || '').slice(0, 4).toUpperCase())}</div>
      <div class="k-orta"><div class="k-ad">${esc(e.baslik)}</div><div class="k-alt">${esc(e.firma)}${e.yil ? ' · ' + esc(e.yil) : ''}${e.gecerlilik ? ' · Geçerlilik ' + esc(e.gecerlilik) : ''}</div></div>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg></div></button></li>`).join('')}</ul>`).join('');
  $('#ev-bos').hidden = liste.length > 0;
}

$('#ev-liste').addEventListener('click', async e => {
  const b = e.target.closest('.kart.ev'); if (!b || b.classList.contains('yukleniyor-k')) return;
  b.classList.add('yukleniyor-k');
  try {
    const r = await rpc('evrak', { id: b.dataset.id });
    if (!r.ok) throw new Error(r.hata);
    if (r.link) {   // çok büyük dosya: Drive'da açılır
      window.open(r.link, '_blank', 'noopener');
      toast('Büyük dosya Drive\'da açılıyor: ' + r.ad); b.classList.remove('yukleniyor-k'); return;
    }
    const bayt = Uint8Array.from(atob(r.b64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bayt], { type: r.mime }));
    const a = document.createElement('a'); a.href = url; a.download = r.ad; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast('Evrak indirildi: ' + r.ad);
  } catch (err) {
    toast(err.message === 'buyuk' ? 'Dosya telefona indirilemeyecek kadar büyük.' : err.message === 'ag' ? 'Bağlantı hatası.' : 'Evrak indirilemedi.', 'hata');
  }
  b.classList.remove('yukleniyor-k');
});
let evAraZ = 0;
$('#ev-ara').addEventListener('input', e => { clearTimeout(evAraZ); evAraZ = setTimeout(() => { durum.evAra = e.target.value; evrakCiz(); }, 120); });

/* ---------- ortak çizim ---------- */
function ciz(ilk, degisen = []) {
  const onceki = durum._onceki || new Map(), degisenler = new Set();
  durum.veri.ogrenciler.forEach(o => { const p = onceki.get(o.id); if (p && p.odenen !== o.odenen) degisenler.add(o.id); });
  durum._onceki = new Map(durum.veri.ogrenciler.map(o => [o.id, { odenen: o.odenen }]));
  $('#donem').textContent = durum.veri.donem_ad;
  if (durum.izinler.includes('okul') && degisen.includes('okul')) { ozetCiz(); filtreSayilari(); listeyiCiz(ilk, degisenler); }
  if (durum.izinler.includes('sirket_evrak') && degisen.includes('sirket_evrak')) evrakCiz();
  modullerCiz(degisen);
  if (durum.acik?.tur === 'ogrenci') { const o = durum.veri.ogrenciler.find(x => x.id === durum.acik.id); if (o && !durum.acik.form) detayDoldur(o, false); }
}

function canliGuncelle() {
  const sn = Math.max(0, Math.round((Date.now() - durum.sonGuncelleme) / 1000));
  const bagli = durum.bagli && sn < YOKLAMA_MS / 1000 * 2.5;
  $('#canli').classList.toggle('kopuk', !bagli);
  $('#canli b').textContent = !bagli ? 'Bağlantı yok' : (sn < 45 ? 'Canlı' : `${sn} sn önce`);
}
setInterval(canliGuncelle, 1000);

let aramaZ = 0;
$('#ara').addEventListener('input', e => {
  clearTimeout(aramaZ);
  aramaZ = setTimeout(() => { durum.ara = e.target.value; if (durum.veri) listeyiCiz(false); }, 120);
});

let toastZ = 0;
function toast(m, tip = 'ok') {
  const t = $('#toast'); t.textContent = m; t.className = 'toast goster ' + tip;
  clearTimeout(toastZ); toastZ = setTimeout(() => t.classList.remove('goster'), 3200);
}

/* ---------- alt sayfa (ayrıntı ve ödeme formu) ---------- */
const sayfa = $('#sayfa'), perde = $('#perde');

function waNumara(tel) {
  const d = tel.replace(/\D/g, '');
  if (d.startsWith('90') && d.length >= 12) return d;
  if (d.startsWith('0')) return '90' + d.slice(1);
  return d.length === 10 ? '90' + d : d;
}

const BEK_AD = { bekliyor: 'Masaüstü bekleniyor', islendi: 'İşlendi', red: 'Reddedildi' };

function detayDoldur(o, anim) {
  const [a1, a2] = renk(o.ad);
  const tel = o.tel.replace(/[^\d+]/g, '');
  const bek = durum.bekleyen.filter(p => p.ogrenci === o.id && p.durum !== 'islendi');
  $('#sayfa-icerik').innerHTML = `
    <div class="d-baslik"><div class="avatar" style="--a1:${a1};--a2:${a2}">${esc(bas(o.ad))}</div>
      <div><h2>${esc(o.ad)}</h2><p>${esc(o.sinif)} · ${esc(o.plaka)}${o.pesin ? ' · Peşin ödeyen' : ''}</p></div></div>
    <div class="d-ucluk"><div><small>Ücret</small><strong>${TL(o.ucret)}</strong></div>
      <div class="y"><small>Ödenen</small><strong>${TL(o.odenen)}</strong></div>
      <div class="k"><small>Kalan</small><strong>${TL(o.kalan)}</strong></div></div>
    <button class="btn-ana" id="d-odeme-ekle" type="button">+ Ödeme ekle</button>
    <div class="d-eylem">
      <a class="eylem ${tel ? '' : 'devre'}" href="${tel ? 'tel:' + esc(tel) : '#'}">Ara</a>
      <a class="eylem ${tel ? '' : 'devre'}" href="${tel ? 'https://wa.me/' + waNumara(tel) : '#'}" target="_blank" rel="noopener">WhatsApp</a>
    </div>
    ${bek.length ? `<h3 class="d-sec">Gönderilen ödemeler</h3><ul class="zaman bekleyen">${bek.map(p => `
      <li class="${p.durum}"><div class="z-ust"><span>${TL(p.tutar)}</span><span>${esc(p.tarih)}</span></div>
      <div class="z-alt">${p.durum === 'red' ? '✖ Reddedildi: ' + esc(p.neden || '') : p.gitti ? '⏳ ' + BEK_AD.bekliyor : '📡 Gönderilmeyi bekliyor (bağlantı yok)'}
      ${p.durum === 'red' ? `<button class="kucuk" data-sil="${p.id}">Kapat</button>` : ''}</div></li>`).join('')}</ul>` : ''}
    <h3 class="d-sec">Ödemeler</h3>
    ${o.odemeler.length ? `<ul class="zaman">${o.odemeler.map((g, i) => `
      <li style="animation-delay:${anim ? 80 + i * 60 : 0}ms"><div class="z-ust"><span>${TL(g.tutar)}</span><span>${esc(g.tarih)}</span></div>
      <div class="z-alt">${esc(YONTEM[g.yontem] || g.yontem)}${g.not ? ' · ' + esc(g.not) : ''}${g.dekont ? ' · 📎' : ''}</div></li>`).join('')}</ul>`
      : '<p class="z-alt">Henüz ödeme yok.</p>'}`;
  const ekle = $('#d-odeme-ekle');
  ekle.hidden = !durum.izinler.includes('okul');
  ekle.addEventListener('click', () => odemeFormu(o));
  $('#sayfa-icerik').querySelectorAll('[data-sil]').forEach(b => b.addEventListener('click', () => {
    durum.bekleyen = durum.bekleyen.filter(p => p.id !== b.dataset.sil); bekleyenKaydet(); detayDoldur(o, false); listeyiCiz(false);
  }));
}

function ac(id) {
  const o = durum.veri.ogrenciler.find(x => x.id === id); if (!o) return;
  durum.acik = { tur: 'ogrenci', id, form: false }; detayDoldur(o, true); sayfaAc();
}

function sayfaAc() {
  perde.hidden = false; sayfa.setAttribute('aria-hidden', 'false'); sayfa.scrollTop = 0;
  requestAnimationFrame(() => { perde.classList.add('acik'); sayfa.classList.add('acik'); });
  document.body.style.overflow = 'hidden';
}

function kapat() {
  if (!durum.acik) return;
  durum.acik = null; perde.classList.remove('acik'); sayfa.classList.remove('acik'); sayfa.style.transform = '';
  sayfa.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
  setTimeout(() => { if (!durum.acik) perde.hidden = true; }, 320);
}
perde.addEventListener('click', kapat);
document.addEventListener('keydown', e => { if (e.key === 'Escape') kapat(); });

(() => {
  let y0 = null, dy = 0;
  const t = $('#tutamac');
  t.addEventListener('pointerdown', e => { y0 = e.clientY; dy = 0; t.setPointerCapture(e.pointerId); sayfa.classList.add('surukleniyor'); });
  t.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sayfa.style.transform = `translateY(${dy}px)`; });
  const bitir = () => { if (y0 === null) return; y0 = null; sayfa.classList.remove('surukleniyor'); if (dy > 110) kapat(); else sayfa.style.transform = ''; };
  t.addEventListener('pointerup', bitir); t.addEventListener('pointercancel', bitir);
})();

/* ---------- ödeme formu ---------- */
const bugunISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const trTarih = iso => iso.split('-').reverse().join('.');
const yeniId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');

function tutarCoz(s) {
  s = String(s).trim().replace(/\s|₺/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^\d+(\.\d{1,2})?$/.test(s) ? parseFloat(s) : NaN;
}

function odemeFormu(o) {
  durum.acik.form = true;
  $('#sayfa-icerik').innerHTML = `
    <div class="d-baslik"><button class="geri" id="f-geri" type="button" aria-label="Geri">‹</button>
      <div><h2>Ödeme ekle</h2><p>${esc(o.ad)} · Kalan ${TL(o.kalan)}</p></div></div>
    <form id="odeme-form" novalidate>
      <label class="alan"><span>Tutar (₺)</span><input id="f-tutar" inputmode="decimal" autocomplete="off" placeholder="0" required></label>
      <div class="hizli">${o.kalan > 0.01 ? `<button type="button" data-t="${Math.round(o.kalan * 100) / 100}">Kalanı öde · ${TL(o.kalan)}</button>` : ''}</div>
      <label class="alan"><span>Tarih</span><input id="f-tarih" type="date" value="${bugunISO()}" max="${bugunISO()}" required></label>
      <div class="alan"><span>Ödeme yöntemi</span><div class="segment" id="f-yontem">
        ${Object.entries(YONTEM).map(([k, ad], i) => `<button type="button" data-y="${k}" class="${i ? '' : 'secili'}">${ad}</button>`).join('')}</div></div>
      <label class="alan"><span>Not (isteğe bağlı)</span><input id="f-not" maxlength="200" autocomplete="off"></label>
      <div class="alan"><span>Dekont / fiş fotoğrafı (isteğe bağlı)</span>
        <div class="foto-sec"><label class="eylem">📷 Fotoğraf çek<input id="f-kamera" type="file" accept="image/*" capture="environment" hidden></label>
        <label class="eylem">🖼 Galeriden seç<input id="f-galeri" type="file" accept="image/*,application/pdf" hidden></label></div>
        <div id="f-onizleme" class="onizleme" hidden></div></div>
      <p id="f-hata" class="hata" role="alert"></p>
      <button class="btn-ana" id="f-gonder" type="submit"><span>Gönder</span><i class="yukleniyor"></i></button>
      <p class="not-kucuk">Ödeme masaüstü uygulamasına iletilir ve orada işlenir; işlenince listede görünür.</p>
    </form>`;
  let yontem = 'nakit', dosya = null;
  $('#f-geri').addEventListener('click', () => { durum.acik.form = false; detayDoldur(o, false); });
  $('#f-yontem').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; yontem = b.dataset.y;
    $('#f-yontem').querySelectorAll('button').forEach(x => x.classList.toggle('secili', x === b));
  });
  $('.hizli').addEventListener('click', e => { const b = e.target.closest('button'); if (b) $('#f-tutar').value = String(b.dataset.t).replace('.', ','); });
  const dosyaSec = async f => {
    if (!f) return;
    const hata = $('#f-hata'); hata.textContent = '';
    try { dosya = await dosyaHazirla(f); } catch (err) { dosya = null; hata.textContent = err.message; }
    const on = $('#f-onizleme'); on.hidden = !dosya;
    if (dosya) on.innerHTML = `${dosya.mime === 'application/pdf' ? '<div class="pdf">PDF</div>' : `<img alt="" src="data:${dosya.mime};base64,${dosya.b64}">`}<span>${esc(f.name || 'fotoğraf')} · ${Math.round(dosya.b64.length * 0.75 / 1024)} KB</span><button type="button" class="kucuk" id="f-foto-sil">Kaldır</button>`;
    $('#f-foto-sil')?.addEventListener('click', () => { dosya = null; on.hidden = true; $('#f-kamera').value = ''; $('#f-galeri').value = ''; });
  };
  $('#f-kamera').addEventListener('change', e => dosyaSec(e.target.files[0]));
  $('#f-galeri').addEventListener('change', e => dosyaSec(e.target.files[0]));
  $('#odeme-form').addEventListener('submit', async e => {
    e.preventDefault();
    const hata = $('#f-hata'), tutar = tutarCoz($('#f-tutar').value), tarih = $('#f-tarih').value;
    hata.textContent = '';
    if (!(tutar > 0) || tutar > 10000000) { hata.textContent = 'Geçerli bir tutar gir.'; $('#f-tutar').focus(); return; }
    if (!tarih || tarih > bugunISO()) { hata.textContent = 'Geçerli bir tarih seç (bugünden sonrası olamaz).'; return; }
    if (o.ucret > 0 && tutar > o.kalan + 0.01 &&
        !confirm(`Girilen tutar (${TL(tutar)}) kalan borçtan (${TL(o.kalan)}) fazla. Yine de gönderilsin mi?`)) return;
    const p = { id: yeniId(), ogrenci: o.id, tutar, tarih: trTarih(tarih), yontem, not: $('#f-not').value.trim(),
                foto: dosya ? { mime: dosya.mime, b64: dosya.b64 } : null, gitti: false, durum: 'bekliyor' };
    durum.bekleyen.push(p); bekleyenKaydet();
    $('#f-gonder').classList.add('bekle');
    await bekleyenleriIsle();
    $('#f-gonder').classList.remove('bekle');
    durum.acik.form = false; detayDoldur(o, false); listeyiCiz(false);
    toast(p.gitti ? 'Ödeme gönderildi, masaüstü işleyecek.' : 'Bağlantı yok; bağlanınca otomatik gönderilecek.', p.gitti ? 'ok' : 'uyari');
  });
}

// Fotoğrafı yükleme öncesi küçültür (en uzun kenar 1600 px, JPEG): hızlı ve az veri
async function dosyaHazirla(f) {
  if (f.type === 'application/pdf') {
    if (f.size > 20 * 1024 * 1024) throw new Error('PDF en fazla 20 MB olabilir.');
    return { mime: 'application/pdf', b64: await blobB64(f) };
  }
  if (!f.type.startsWith('image/')) throw new Error('Yalnızca fotoğraf veya PDF eklenebilir.');
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) throw new Error('Fotoğraf okunamadı.');
  const olcek = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * olcek); c.height = Math.round(bmp.height * olcek);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  return { mime: 'image/jpeg', b64: await blobB64(blob) };
}
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); });

/* ---------- gönderim kuyruğu ve işlenme durumu ---------- */
let kuyrukMesgul = false;
async function bekleyenleriIsle() {
  if (kuyrukMesgul || !durum.token) return;
  kuyrukMesgul = true;
  let yenileGerek = false;
  try {
    for (const p of durum.bekleyen.filter(x => !x.gitti && x.durum === 'bekliyor')) {
      try {
        if (p.foto && !p.fotoGitti) { const f = await rpc('foto', { id: p.id, m: p.modul || 'okul', mime: p.foto.mime, b64: p.foto.b64 }); if (!f.ok) throw Object.assign(new Error(f.hata), { sunucu: true }); p.fotoGitti = true; }
        const r = p.tur === 'kayit' ? await rpc('kayit', { id: p.id, m: p.modul, i: p.islem, veri: p.veri, foto: !!p.foto })
          : await rpc('odeme', { id: p.id, ogrenci: p.ogrenci, tutar: p.tutar, tarih: p.tarih, yontem: p.yontem, not: p.not, foto: !!p.foto });
        if (!r.ok) throw Object.assign(new Error(r.hata), { sunucu: true });
        p.gitti = true; p.foto = null;
        if (p.modul === 'ayarlar' && p.veri) p.veri = { ...p.veri, sifre: '' };   // düz şifre telefonda gönderimden sonra tutulmaz
      } catch (e) {
        if (e.sunucu) { p.durum = 'red'; p.neden = HATA_AD[e.message] || 'sunucu reddetti'; if (p.modul === 'ayarlar' && p.veri) p.veri = { ...p.veri, sifre: '' }; }
        else break;   // bağlantı yok: sonra tekrar denenecek
      }
    }
    const izle = durum.bekleyen.filter(x => x.gitti && x.durum === 'bekliyor').map(x => x.id);
    if (izle.length) {
      const d = await rpc('durum', { ids: izle });
      if (d.ok) durum.bekleyen.forEach(p => {
        const s = d.durumlar[p.id]; if (!s || s.d === 'bekliyor') return;
        p.durum = s.d === 'islendi' ? 'islendi' : 'red'; p.neden = s.m;
        if (p.durum === 'islendi') { toast(p.tur === 'kayit' ? 'Kayıt işlendi ✔' : 'Ödeme işlendi ✔'); yenileGerek = true; }
      });
    }
  } catch (e) { /* ağ hatası: bir sonraki turda */ }
  durum.bekleyen = durum.bekleyen.filter(p => p.durum !== 'islendi' || Date.now() - (p.islendiZ ||= Date.now()) < 120000);
  bekleyenKaydet(); kuyrukMesgul = false;
  // İşlenen ödeme listeye hemen yansısın (özet masaüstünde birkaç saniye içinde güncellenir)
  if (yenileGerek) { setTimeout(cek, 600); setTimeout(cek, 8000); setTimeout(ayarlarYenile, 800); setTimeout(ayarlarYenile, 8000); }
  if (durum.veri && durum.izinler.includes('okul')) listeyiCiz(false);
  bekleyenleriGoster();
  if (durum.acik?.tur === 'ogrenci' && !durum.acik.form) { const o = durum.veri?.ogrenciler.find(x => x.id === durum.acik.id); if (o) detayDoldur(o, false); }
}
const HATA_AD = { yetki: 'Bu işlem için yetkin yok', tutar: 'Tutar geçersiz', tarih: 'Tarih geçersiz', yontem: 'Yöntem geçersiz', buyuk: 'Fotoğraf çok büyük', tur: 'Dosya türü desteklenmiyor', cok_istek: 'Çok fazla istek, biraz bekle', veri_yok: 'Sunucuda veri klasörü bulunamadı', istek: 'Geçersiz istek' };
setInterval(() => { if (durum.token && durum.bekleyen.some(p => p.durum === 'bekliyor')) bekleyenleriIsle(); }, 8000);

/* ---------- başlangıç ---------- */
document.addEventListener('visibilitychange', () => { if (!document.hidden) cek(); });
window.addEventListener('online', cek);
if (durum.token) anaGoster(); else girisGoster();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
