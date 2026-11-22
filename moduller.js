'use strict';
/* Okul ve evrak dışındaki modüller: Ana Sayfa, Fatura, Araç, Esnaf, Akaryakıt, İç Hizmet.
   uygulama.js'ten ÖNCE yüklenir; yardımcıları ($, TL, esc, sade, rpc, durum, toast, sayfa işlevleri) çağrı anında kullanır. */

const MODULLER = [
  { id: 'dashboard', izin: 'dashboard', ad: 'Ana Sayfa' }, { id: 'tahsilat', izin: 'okul', ad: 'Okul Yönetimi' },
  { id: 'evrak', izin: 'sirket_evrak', ad: 'Evraklar' }, { id: 'fatura', izin: 'fatura', ad: 'Faturalar' },
  { id: 'arac', izin: 'arac', ad: 'Araçlar' }, { id: 'esnaf', izin: 'esnaf', ad: 'Esnaflar' },
  { id: 'petrol', izin: 'petrol', ad: 'Akaryakıt' }, { id: 'ic_hizmet', izin: 'ic_hizmet', ad: 'İç Hizmetler' },
  { id: 'ayarlar', izin: 'ayarlar', ad: 'Ayarlar' },
];
// Görünüm kimliği ile veri modülü farklı olanlar: tahsilat -> okul, evrak -> sirket_evrak
const VERI_MODULU = { tahsilat: 'okul', evrak: 'sirket_evrak' };

/* ---------- tarih / biçim ---------- */
const p2 = n => String(n).padStart(2, '0');
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function trParse(s) {
  s = String(s || '');
  let m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
const trGoster = s => { const d = trParse(s); return d ? `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}` : String(s || ''); };
const ayAnahtar = s => { const d = trParse(s); return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}` : ''; };
const ayAdi = k => `${AYLAR[+k.slice(5) - 1]} ${k.slice(0, 4)}`;
const gunFarki = s => { const d = trParse(s); if (!d) return null; const b = new Date(); b.setHours(0, 0, 0, 0); return Math.round((d - b) / 864e5); };
const LT = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n) + ' lt';
const TLK = n => Math.abs(n) >= 100000 ? TL(Math.round(n)) : TL(n);   // büyük tutarlarda kuruş yazılmaz: kart satıra sığar
const SAYI = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
const topla = (l, f) => l.reduce((a, x) => a + (f(x) || 0), 0);
const modVeri = id => (durum.mod && durum.mod[VERI_MODULU[id] || id]) || null;

/* ---------- ortak: bekleyen kayıt şeridi ---------- */
function bekleyenHtml(modul) {
  const l = durum.bekleyen.filter(p => p.tur === 'kayit' && p.modul === modul && p.durum !== 'islendi');
  if (!l.length) return '';
  return `<ul class="bek-liste">${l.map(p => `<li class="${p.durum}"><span>${esc(p.ozet)}</span>
    <small>${p.durum === 'red' ? 'Reddedildi: ' + esc(p.neden || '') : p.gitti ? 'Masaüstü bekleniyor' : 'Bağlantı bekleniyor'}</small>
    ${p.durum === 'red' ? `<button class="kucuk" data-sil="${esc(p.id)}">Kapat</button>` : ''}</li>`).join('')}</ul>`;
}
function bekleyenleriGoster() {
  document.querySelectorAll('.gorunum[data-modul] .bek-yer').forEach(y => { y.innerHTML = bekleyenHtml(y.closest('.gorunum').dataset.modul); });
  const ok = $('#ok-bek'); if (ok) ok.innerHTML = bekleyenHtml('okul');
}
document.addEventListener('click', e => {
  const b = e.target.closest('.bek-yer [data-sil]'); if (!b) return;
  durum.bekleyen = durum.bekleyen.filter(p => p.id !== b.dataset.sil); bekleyenKaydet(); bekleyenleriGoster();
});

/* ---------- ortak: liste görünümü ---------- */
const durumlar = {};   // modül -> { ara, filtre, ay, adet }
const SAYFA_ADET = 60;
const adTemiz = v => String(v || 'Firma yok').replace(/\s+/g, ' ').trim();
const adAnahtar = v => adTemiz(v).toLocaleUpperCase('tr');   // 'ALC  Seyahat' ile 'ALC SEYAHAT' aynı firmadır

function bolumOlustur(cfg) {
  const s = document.createElement('section');
  s.id = 'v-' + cfg.id; s.className = 'gorunum'; s.hidden = true; s.dataset.modul = cfg.modul;
  s.innerHTML = `<div class="bek-yer"></div>
    <section class="ozet${cfg.ozetSinif ? ' ' + cfg.ozetSinif : ''}" aria-label="Özet"></section>
    <div class="ekstra"></div>
    <div class="arama"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" placeholder="${esc(cfg.araYazi)}" aria-label="${esc(cfg.araYazi)}" autocomplete="off" enterkeyhint="search"></div>
    <div class="filtre-satir"><nav class="filtreler"></nav><select class="ay-sec" aria-label="Dönem"></select></div>
    <div class="gruplar"></div>
    <ul class="liste"></ul><button class="daha" type="button" hidden></button><p class="bos" hidden>Eşleşen kayıt yok. Aramayı, filtreyi veya dönemi değiştir.</p>
    ${cfg.ekle ? '<button class="fab" aria-label="Yeni kayıt" type="button"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>' : ''}`;
  $('#ana').append(s);
  return s;
}

function listeKur(cfg) {
  const d = durumlar[cfg.id] = { ara: '', filtre: cfg.filtreler ? cfg.filtreler[0][0] : '', ay: 'son', adet: SAYFA_ADET };
  const s = bolumOlustur(cfg), ul = $('.liste', s), daha = $('.daha', s), sec = $('.ay-sec', s), nav = $('.filtreler', s);
  cfg.cizim = () => {
    const tum = cfg.veri() || [];
    const aylar = cfg.aySec ? [...new Set(tum.map(x => ayAnahtar(x.t)).filter(Boolean))].sort().reverse() : [];
    const seciliAy = d.ay === 'son' ? (aylar[0] || 'tumu') : d.ay;
    if (cfg.aySec) {
      const imza = aylar.join();
      if (sec.dataset.imza !== imza) {
        sec.innerHTML = `<option value="tumu">Tüm dönemler</option>` + aylar.map(a => `<option value="${esc(a)}">${ayAdi(a)}</option>`).join('');
        sec.dataset.imza = imza;
      }
      sec.value = seciliAy;
    }
    sec.hidden = !cfg.aySec;
    const q = sade(d.ara.trim());
    const donem = tum.filter(x => seciliAy === 'tumu' || ayAnahtar(x.t) === seciliAy);
    if (cfg.filtreler) {
      if (!nav.childElementCount) cfg.filtreler.forEach(([k, ad]) => {
        const b = document.createElement('button'); b.className = 'chip'; b.dataset.k = k; b.innerHTML = `${esc(ad)}<b>0</b>`;
        b.addEventListener('click', () => { d.filtre = k; d.adet = SAYFA_ADET; cfg.cizim(); }); nav.append(b);
      });
      nav.querySelectorAll('.chip').forEach(c => {
        const f = cfg.filtreler.find(x => x[0] === c.dataset.k)[2];
        c.classList.toggle('secili', c.dataset.k === d.filtre); c.setAttribute('aria-pressed', String(c.dataset.k === d.filtre)); c.querySelector('b').textContent = donem.filter(x => f(x)).length;
      });
    }
    if (!cfg.filtreler) nav.hidden = true;
    const f = cfg.filtreler ? cfg.filtreler.find(x => x[0] === d.filtre)[2] : () => true;
    const secili = donem.filter(x => f(x) && (!q || sade(cfg.ara(x)).includes(q)));
    modOzetCiz(s, cfg, secili, donem);
    if (cfg.ekstra) {   // açık/kapalı durumu yeniden çizimde korunur
      const yer = $('.ekstra', s), acik = [...yer.querySelectorAll('details')].map(x => x.open), html = cfg.ekstra(secili);
      if (yer.dataset.imza !== html) { yer.innerHTML = html; yer.dataset.imza = html; yer.querySelectorAll('details').forEach((x, i) => { x.open = !!acik[i]; }); }
    }
    let gorunen = secili, kartlarda = false;
    if (cfg.grup) {   // firma kartları: arama yokken ve "Tümü" seçiliyken önce firmalar, firmaya dokununca araçları
      const gYer = $('.gruplar', s), anah = x => adAnahtar(cfg.grup(x)), tumu = d.filtre === cfg.filtreler[0][0];
      kartlarda = !q && !d.grup && tumu;
      if (d.grup && !q) gorunen = secili.filter(x => anah(x) === d.grup);
      if (kartlarda) {
        const m = new Map();
        secili.forEach(x => { const k = anah(x); const g = m.get(k) || { k, ad: adTemiz(cfg.grup(x)), l: [] }; g.l.push(x); m.set(k, g); });
        gYer.innerHTML = `<div class="firma-izgara">${[...m.values()].sort((a, b) => b.l.length - a.l.length || a.ad.localeCompare(b.ad, 'tr')).map(g => {
          const o = cfg.grupOzet(g.l);
          return `<button type="button" class="firma-kart" data-grup="${esc(g.k)}" data-ad="${esc(g.ad)}"><b>${esc(g.ad)}</b><span>${esc(o.adet)}</span>${rozet(o.durum[0], o.durum[1])}</button>`;
        }).join('')}</div>`;
      } else if (d.grup && !q) {
        gYer.innerHTML = `<div class="grup-bar"><button type="button" class="geri-grup" data-grup-geri>‹ Tüm firmalar</button><b>${esc(d.grupAd)}</b><span>${gorunen.length}</span></div>`;
      } else gYer.innerHTML = '';
    }
    const goster = kartlarda ? [] : gorunen.slice(0, d.adet);
    ul.innerHTML = goster.map((x, i) => `<li><button type="button" class="kart ${cfg.sinif ? cfg.sinif(x) : ''}" data-i="${i}">${cfg.satir(x)}</button></li>`).join('');
    ul._liste = goster;
    daha.hidden = gorunen.length <= goster.length || kartlarda; daha.textContent = `Daha fazla göster (${gorunen.length - goster.length})`;
    $('.bos', s).hidden = gorunen.length > 0 || kartlarda;
    $('.bek-yer', s).innerHTML = bekleyenHtml(cfg.modul);
  };
  ul.addEventListener('click', e => {
    const b = e.target.closest('.kart'); if (!b || !cfg.detay) return;
    const x = ul._liste[+b.dataset.i]; if (x) detayAc(cfg, x);
  });
  daha.addEventListener('click', () => { d.adet += SAYFA_ADET; cfg.cizim(); });
  $('.gruplar', s).addEventListener('click', e => {
    const k = e.target.closest('.firma-kart'), geri = e.target.closest('[data-grup-geri]');
    if (!k && !geri) return;
    d.grup = k ? k.dataset.grup : ''; d.grupAd = k ? k.dataset.ad : ''; d.adet = SAYFA_ADET; cfg.cizim();
    window.scrollTo({ top: 0 });
  });
  sec.addEventListener('change', () => { d.ay = sec.value; d.adet = SAYFA_ADET; cfg.cizim(); });
  let z = 0;
  $('input', s).addEventListener('input', e => { clearTimeout(z); z = setTimeout(() => { d.ara = e.target.value; d.adet = SAYFA_ADET; cfg.cizim(); }, 120); });
  const fab = $('.fab', s); if (fab) fab.addEventListener('click', () => { durum.acik = { tur: 'm:' + cfg.id, form: true }; cfg.ekle(); sayfaAc(); });
  return cfg;
}

function modOzetCiz(s, cfg, secili, donem) {
  const kartlar = cfg.kartlar(secili, donem), yer = $('.ozet', s);
  if (yer.childElementCount !== kartlar.length) {
    yer.innerHTML = kartlar.map((k, i) => `<div class="ozet-kart" data-tone="${k.ton}"><small>${esc(k.ad)}</small><strong id="oz-${cfg.id}-${i}">—</strong></div>`).join('');
    Object.keys(sayilar).forEach(k => { if (k.startsWith('oz-' + cfg.id)) delete sayilar[k]; });
  }
  kartlar.forEach((k, i) => sayac($('#oz-' + cfg.id + '-' + i), k.deger, k.bicim === TL ? TLK : k.bicim));
}

function detayAc(cfg, x) {
  durum.acik = { tur: 'm:' + cfg.id, id: x.id, form: false };
  cfg.detayYaz = () => { $('#sayfa-icerik').innerHTML = cfg.detay(x); detayBagla(cfg, x); };
  cfg.detayYaz(); sayfaAc();
}
function detayBagla(cfg, x) { if (cfg.detayBagla) cfg.detayBagla(x, $('#sayfa-icerik')); }

const satirHtml = (baslik, alt, sag, sagAlt, ikon) => `<div class="k-ust">${ikon || ''}<div class="k-orta"><div class="k-ad">${baslik}</div><div class="k-alt">${alt}</div></div>
  <div class="k-sag"><div class="k-kalan">${sag}</div>${sagAlt ? `<div class="k-alt">${sagAlt}</div>` : ''}</div></div>`;
const rozet = (t, ton = '') => `<span class="rozet-d ${ton}">${esc(t)}</span>`;
const alanSatir = (ad, v) => v === '' || v == null ? '' : `<div class="d-satir"><span>${esc(ad)}</span><b>${v}</b></div>`;

/* ---------- ortak: form ---------- */
function alanHtml(a) {
  const id = 'fm-' + a.k, etiket = `<span>${esc(a.etiket)}${a.zorunlu ? ' *' : ''}</span>`;
  if (a.tur === 'segment') {
    const vars = a.varsayilan ?? a.secenekler[0][0];
    return `<div class="alan"><span id="${id}-ad">${esc(a.etiket)}${a.zorunlu ? ' *' : ''}</span><div class="segment" id="${id}" role="group" aria-labelledby="${id}-ad" style="--n:${a.secenekler.length};grid-template-columns:repeat(${a.secenekler.length},minmax(0,1fr))">${a.secenekler.map(([v, ad]) =>
      `<button type="button" data-v="${esc(v)}" class="${String(vars) === String(v) ? 'secili' : ''}" aria-pressed="${String(vars) === String(v)}">${esc(ad)}</button>`).join('')}</div></div>`;
  }
  if (a.tur === 'sec') {
    return `<label class="alan">${etiket}<select id="${id}">${a.secenekler.map(([v, ad]) => `<option value="${esc(v)}"${String(a.varsayilan ?? '') === String(v) ? ' selected' : ''}>${esc(ad)}</option>`).join('')}</select></label>`;
  }
  if (a.tur === 'onay') {
    const sec = new Set(a.varsayilan || []);
    return `<div class="onay-blok"><p class="onay-etiket">${esc(a.etiket)}</p><div class="onay-grup" id="${id}">${a.secenekler.map(([v, ad]) =>
      `<label class="onay"><input type="checkbox" value="${esc(v)}"${sec.has(v) ? ' checked' : ''}><span>${esc(ad)}</span></label>`).join('')}</div></div>`;
  }
  const tip = { tarih: 'date', saat: 'time', sifre: 'password' }[a.tur] || 'text', mod = { tutar: 'decimal', sayi: 'numeric' }[a.tur] || '';
  const liste = a.liste ? `<datalist id="${id}-l">${a.liste.map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : '';
  const ekstra = a.tur === 'sifre' ? 'autocomplete="new-password" autocapitalize="off" spellcheck="false"' : 'autocomplete="off"';
  return `<label class="alan">${etiket}<input id="${id}" type="${tip}" ${mod ? `inputmode="${mod}"` : ''} ${a.liste ? `list="${id}-l"` : ''} ${ekstra}
    ${a.zorunlu ? 'aria-required="true"' : ''} aria-describedby="fm-hata"
    ${a.tur === 'tarih' && !a.serbest ? `max="${bugunISO()}"` : ''} ${a.maks ? `maxlength="${a.maks}"` : ''} value="${esc(a.varsayilan ?? '')}" placeholder="${esc(a.ipucu || '')}">${liste}</label>`;
}

function formAc(cfg) {
  if (durum.ro) { toast('Salt okunur hesap: kayıt eklenemez.', 'uyari'); return; }
  durum.acik = { tur: 'm:' + cfg.modul, form: true };
  $('#sayfa-icerik').innerHTML = `
    <div class="d-baslik">${cfg.geri ? '<button class="geri" id="fm-geri" type="button" aria-label="Geri">‹</button>' : ''}<div><h2>${esc(cfg.baslik)}</h2><p>${esc(cfg.alt || '')}</p></div></div>
    <form id="modul-form" novalidate>${cfg.alanlar.map(alanHtml).join('')}
      <div id="fm-onizleme-hesap" class="hesap" hidden></div>
      ${cfg.foto ? `<div class="alan"><span>${esc(cfg.foto)}</span>
        <div class="foto-sec"><label class="eylem">${IKON_KAMERA}Fotoğraf çek<input id="fm-kamera" type="file" accept="image/*" capture="environment"></label>
        <label class="eylem">${IKON_GALERI}Galeriden seç<input id="fm-galeri" type="file" accept="image/*,application/pdf"></label></div>
        <div id="fm-onizleme" class="onizleme" hidden></div></div>` : ''}
      <p id="fm-hata" class="hata" role="alert"></p>
      <button class="btn-ana" id="fm-gonder" type="submit"><span>Gönder</span><i class="yukleniyor"></i></button>
      <p class="not-kucuk">Kayıt masaüstü uygulamasına iletilir ve orada işlenir; işlenince listede görünür.</p>
    </form>`;
  const deger = k => {
    const el = $('#fm-' + k);
    if (el.classList.contains('onay-grup')) return [...el.querySelectorAll('input:checked')].map(i => i.value);
    return el.classList.contains('segment') ? el.querySelector('.secili')?.dataset.v : el.value;
  };
  const ayarla = (k, v) => { const el = $('#fm-' + k); if (el) el.value = v; };
  let dosya = null;
  const hesapYaz = () => { const h = cfg.hesap && cfg.hesap(deger), y = $('#fm-onizleme-hesap'); y.hidden = !h; y.innerHTML = h || ''; };
  $('#modul-form').addEventListener('click', e => {
    const b = e.target.closest('.segment button'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach(x => { x.classList.toggle('secili', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    if (cfg.degisti) cfg.degisti(b.parentElement.id.slice(3), deger, ayarla); hesapYaz();
  });
  $('#modul-form').addEventListener('input', e => {
    e.target.removeAttribute('aria-invalid'); $('#fm-hata').textContent = '';
    if (cfg.degisti) cfg.degisti(e.target.id.slice(3), deger, ayarla); hesapYaz();
  });
  if (cfg.geri) $('#fm-geri').addEventListener('click', () => cfg.geri());
  if (cfg.foto) {
    const sec = async f => {
      if (!f) return; $('#fm-hata').textContent = '';
      try { dosya = await dosyaHazirla(f); } catch (err) { dosya = null; $('#fm-hata').textContent = err.message; }
      const on = $('#fm-onizleme'); on.hidden = !dosya;
      if (dosya) on.innerHTML = `${dosya.mime === 'application/pdf' ? '<div class="pdf">PDF</div>' : `<img alt="" src="data:${dosya.mime};base64,${dosya.b64}">`}<span>${esc(f.name || 'fotoğraf')}</span><button type="button" class="kucuk" id="fm-foto-sil">Kaldır</button>`;
      $('#fm-foto-sil')?.addEventListener('click', () => { dosya = null; on.hidden = true; $('#fm-kamera').value = ''; $('#fm-galeri').value = ''; });
    };
    $('#fm-kamera').addEventListener('change', e => sec(e.target.files[0])); $('#fm-galeri').addEventListener('change', e => sec(e.target.files[0]));
  }
  hesapYaz();
  $('#modul-form').addEventListener('submit', async e => {
    e.preventDefault(); const hata = $('#fm-hata'); hata.textContent = '';
    let veri;
    try { veri = cfg.hazirla(deger); } catch (err) {
      hata.textContent = err.message;
      const ilk = [...$('#modul-form').querySelectorAll('[aria-required=true]')].find(i => !i.value.trim());   // boş zorunlu alana odaklan
      if (ilk) { ilk.setAttribute('aria-invalid', 'true'); ilk.focus(); }
      return;
    }
    if (cfg.onay && !(await onay('Gönderilsin mi?', cfg.onay(veri), 'Gönder'))) return;
    const p = { id: yeniId(), tur: 'kayit', modul: cfg.modul, islem: cfg.islem, veri, ozet: cfg.ozet(veri),
                foto: dosya ? { mime: dosya.mime, b64: dosya.b64 } : null, gitti: false, durum: 'bekliyor' };
    durum.bekleyen.push(p); bekleyenKaydet();
    $('#fm-gonder').classList.add('bekle');
    await bekleyenleriIsle();
    $('#fm-gonder').classList.remove('bekle');
    kapat(); bekleyenleriGoster();
    toast(p.gitti ? 'Gönderildi, masaüstü işleyecek.' : 'Bağlantı yok; bağlanınca otomatik gönderilecek.', p.gitti ? 'ok' : 'uyari');
  });
}

const gerekli = (v, ad) => { if (!String(v || '').trim()) throw new Error(`${ad} gerekli.`); return String(v).trim(); };
const tutarAl = (v, ad, bos = false) => {
  if (bos && !String(v || '').trim()) return 0;
  const t = tutarCoz(v); if (!(t >= 0)) throw new Error(`${ad} geçersiz.`); return t;
};
const tarihAl = v => { if (!v || v > bugunISO()) throw new Error('Geçerli bir tarih seç (bugünden sonrası olamaz).'); return trTarih(v); };
const SIFIR_SEC = [['', 'Seçiniz…']];

/* ---------- düzenle / sil: yalnızca yönetici ya da kaydı telefondan giren kullanıcı (masaüstü de aynısını denetler) ---------- */
const sahibi = x => !!x && !durum.ro && (durum.izinler.includes('ayarlar') || (!!x.m && x.m === durum.kullanici));
const isoTarih = s => { const d = trParse(s); return d ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : bugunISO(); };
const virgul = v => String(v).replace('.', ',');
function detayGeri(cfg, x) { durum.acik = { tur: 'm:' + cfg.id, id: x.id, form: false }; cfg.detayYaz(); }
async function kayitGonder(modul, islem, veri, ozet) {
  if (durum.ro) { toast('Salt okunur hesap: değişiklik yapılamaz.', 'uyari'); return; }
  const p = { id: yeniId(), tur: 'kayit', modul, islem, veri, ozet, foto: null, gitti: false, durum: 'bekliyor' };
  durum.bekleyen.push(p); bekleyenKaydet();
  await bekleyenleriIsle(); bekleyenleriGoster();
  toast(p.gitti ? 'Gönderildi, masaüstü işleyecek.' : 'Bağlantı yok; bağlanınca otomatik gönderilecek.', p.gitti ? 'ok' : 'uyari');
}
async function kayitSil(modul, veri, ozet) {
  if (!(await onay('Kayıt silinsin mi?', `${ozet} silinecek. Bu işlem masaüstünde de uygulanır ve geri alınamaz.`, 'Sil', true))) return;
  kapat(); await kayitGonder(modul, 'sil', veri, 'Sil: ' + ozet);
}
const duzenleSilHtml = (x, duzenle = true) => sahibi(x) ? `<div class="d-eylem ${duzenle ? '' : 'tek'}">${duzenle ? '<button class="eylem" data-k-duzenle type="button">Düzenle</button>' : ''}<button class="eylem eylem-sil" data-k-sil type="button">Sil</button></div>` : '';
function duzenleSilBagla(kok, duzenle, sil) {
  $('[data-k-duzenle]', kok)?.addEventListener('click', duzenle);
  $('[data-k-sil]', kok)?.addEventListener('click', sil);
}

/* ---------- Fatura ---------- */
const TEVKIFAT = [['0', 'Yok'], ['2', '2/10'], ['3', '3/10'], ['4', '4/10'], ['5', '5/10'], ['7', '7/10'], ['9', '9/10'], ['10', 'Tam (10/10)']];
function faturaForm(x) {
  const m = modVeri('fatura') || {};
  const kdvSec = [['0', '%0'], ['1', '%1'], ['10', '%10'], ['20', '%20']], kdvVars = x ? String(x.kdvo) : '20';
  if (!kdvSec.some(s => s[0] === kdvVars)) kdvSec.push([kdvVars, '%' + kdvVars.replace('.', ',')]);
  const tutarMetin = v => String(v).replace('.', ',');
  formAc({
    modul: 'fatura', islem: x ? 'duzenle' : 'ekle', baslik: x ? 'Faturayı düzenle' : 'Yeni fatura', alt: 'Gelen = bize gelen (gider), Giden = bizim kestiğimiz (gelir)',
    foto: x ? '' : 'Fatura fotoğrafı (isteğe bağlı)', geri: x ? () => detayGeri(CFG.fatura, x) : null,
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: x ? isoTarih(x.t) : bugunISO() },
      { k: 'tip', etiket: 'Fatura tipi', tur: 'segment', secenekler: [['gelen', 'Gelen (gider)'], ['giden', 'Giden (gelir)']], varsayilan: x ? x.tip : 'gelen' },
      { k: 'no', etiket: 'Fatura no', tur: 'metin', zorunlu: true, maks: 64, varsayilan: x ? x.no : '' },
      { k: 'firma', etiket: 'Firma', tur: 'metin', zorunlu: true, maks: 120, liste: m.firmalar || [], varsayilan: x ? x.firma : '' },
      { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', maks: 200, varsayilan: x ? x.ac : '' },
      { k: 'matrah', etiket: 'Matrah (₺)', tur: 'tutar', zorunlu: true, ipucu: '0', varsayilan: x ? tutarMetin(x.mat) : '' },
      { k: 'kdv', etiket: 'KDV oranı', tur: 'segment', secenekler: kdvSec, varsayilan: kdvVars },
      { k: 'tevkifat', etiket: 'Tevkifat', tur: 'sec', secenekler: TEVKIFAT, varsayilan: x ? (TEVKIFAT.find(t => t[1] === x.tev) || ['0'])[0] : '0' }],
    hesap: d => {
      const t = tutarCoz(d('matrah')); if (!(t > 0)) return '';
      const kdv = t * (+d('kdv') / 100), tev = kdv * (+d('tevkifat') / 10);
      return `KDV ${TL(kdv)}${tev ? ` · Tevkifat ${TL(tev)}` : ''} · <b>Toplam ${TL(t + kdv - tev)}</b>`;
    },
    hazirla: d => ({ ...(x ? { kayit_id: x.id } : {}), tarih: tarihAl(d('tarih')), tip: d('tip'), no: gerekli(d('no'), 'Fatura no'), firma: gerekli(d('firma'), 'Firma'), aciklama: d('aciklama').trim(),
                     matrah: (() => { const t = tutarCoz(d('matrah')); if (!(t > 0)) throw new Error('Geçerli bir matrah gir.'); return t; })(), kdv: +d('kdv'), tevkifat: +d('tevkifat') }),
    ozet: v => `${x ? 'Fatura düzeltme' : 'Fatura'} ${v.no} · ${v.firma}`,
  });
}
const FATURA = {
  id: 'fatura', modul: 'fatura', araYazi: 'Firma, fatura no veya açıklama ara', aySec: true, ekle: faturaForm,
  veri: () => (modVeri('fatura') || {}).kayitlar, ara: x => `${x.firma} ${x.no} ${x.ac}`,
  filtreler: [['hepsi', 'Tümü', () => true], ['gelen', 'Gelen', x => x.tip === 'gelen'], ['giden', 'Giden', x => x.tip === 'giden']],
  kartlar: l => {
    const gelir = topla(l.filter(x => x.tip === 'giden'), x => x.top), gider = topla(l.filter(x => x.tip === 'gelen'), x => x.top);
    return [{ ad: 'Gelir (giden)', deger: gelir, bicim: TL, ton: 'yesil' }, { ad: 'Gider (gelen)', deger: gider, bicim: TL, ton: 'kehribar' },
            { ad: 'Fark', deger: gelir - gider, bicim: TL, ton: gelir - gider >= 0 ? 'yesil' : 'kirmizi' }, { ad: 'Fatura sayısı', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mavi' }];
  },
  satir: x => satirHtml(esc(x.firma || x.no), `${esc(trGoster(x.t))} · ${esc(x.no)}`, TL(x.top), rozet(x.tip === 'gelen' ? 'Gelen' : 'Giden', x.tip === 'gelen' ? 'bekliyor' : 'odendi')),
  detay: x => `<div class="d-baslik"><div><h2>${esc(x.firma)}</h2><p>${esc(trGoster(x.t))} · ${x.tip === 'gelen' ? 'Gelen' : 'Giden'} fatura</p></div></div>
    <div class="d-ucluk"><div><small>Matrah</small><strong>${TL(x.mat)}</strong></div><div class="k"><small>KDV %${SAYI(x.kdvo)}</small><strong>${TL(x.kdv)}</strong></div><div class="y"><small>Toplam</small><strong>${TL(x.top)}</strong></div></div>
    ${alanSatir('Fatura no', esc(x.no))}${alanSatir('Açıklama', esc(x.ac))}${alanSatir('Tevkifat', x.tevt ? `${esc(x.tev)} · ${TL(x.tevt)}` : '')}
    ${duzenleSilHtml(x)}`,
  detayBagla: (x, kok) => duzenleSilBagla(kok, () => faturaForm(x), () => kayitSil('fatura', { kayit_id: x.id }, `Fatura ${x.no} · ${x.firma}`)),
};

/* ---------- Araç ---------- */
const belgeDurum = b => { const g = gunFarki(b.son); return g === null ? null : { g, ton: g < 0 ? 'bekliyor' : g <= 30 ? 'kismi' : 'odendi' }; };
const gunYazi = g => g < 0 ? `${-g} gün geçti` : g === 0 ? 'bugün' : `${g} gün kaldı`;
function aracEnYakin(a) {
  return a.belgeler.map(b => ({ b, d: belgeDurum(b) })).filter(x => x.d).sort((p, q) => p.d.g - q.d.g)[0] || null;
}
function aracForm(a, k) {
  const geri = () => detayGeri(CFG.arac, a);
  const tur = d => k ? k.tur : d('tur');
  formAc({
    modul: 'arac', islem: k ? 'duzenle' : 'bakim', baslik: k ? 'Kaydı düzenle' : 'Bakım / harcama ekle', alt: a.plaka, geri, foto: k ? '' : 'Fiş / fatura fotoğrafı (isteğe bağlı)',
    alanlar: [...(k ? [] : [{ k: 'tur', etiket: 'Kayıt türü', tur: 'segment', secenekler: [['bakim', 'Tamir-bakım'], ['harcama', 'Diğer harcama']] }]),
      { k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: k ? isoTarih(k.t) : bugunISO() }, { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', zorunlu: true, maks: 200, varsayilan: k ? k.ac : '' },
      { k: 'tutar', etiket: 'Parça / tutar (₺)', tur: 'tutar', ipucu: '0', varsayilan: k ? virgul(k.tutar) : '' },
      ...(!k || k.tur === 'bakim' ? [{ k: 'iscilik', etiket: 'İşçilik (₺, yalnız bakımda)', tur: 'tutar', ipucu: '0', varsayilan: k && k.isc ? virgul(k.isc) : '' }] : [])],
    hazirla: d => ({ ...(k ? { kayit_id: k.id } : {}), arac_id: a.id, tur: tur(d), tarih: tarihAl(d('tarih')), aciklama: gerekli(d('aciklama'), 'Açıklama'),
                     tutar: tutarAl(d('tutar'), 'Tutar', true), iscilik: tur(d) === 'bakim' ? tutarAl(d('iscilik'), 'İşçilik', true) : 0 }),
    ozet: v => `${k ? 'Düzeltme · ' : ''}${a.plaka} · ${v.aciklama}`,
  });
}
function aracYagForm(a) {
  formAc({
    modul: 'arac', islem: 'yag', baslik: 'Yağ bakımı ekle', alt: a.plaka, geri: () => detayGeri(CFG.arac, a),
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() }, { k: 'km', etiket: 'Kilometre', tur: 'sayi', maks: 12, ipucu: 'Örn. 125000' },
      { k: 'yag', etiket: 'Yağ cinsi', tur: 'metin', zorunlu: true, maks: 80, ipucu: 'Örn. 5W-30' }, { k: 'lt', etiket: 'Yağ miktarı (lt)', tur: 'metin', maks: 20 },
      { k: 'usta', etiket: 'Usta / servis', tur: 'metin', maks: 80 }, { k: 'not', etiket: 'Not', tur: 'metin', maks: 200 }],
    hazirla: d => ({ arac_id: a.id, tarih: tarihAl(d('tarih')), km: d('km').replace(/\s/g, ''), yag: gerekli(d('yag'), 'Yağ cinsi'), lt: d('lt').trim(), usta: d('usta').trim(), not: d('not').trim() }),
    ozet: v => `${a.plaka} · yağ bakımı ${v.yag}`,
  });
}
const ARAC_BELGE_SEC = [['muayene', 'Muayene'], ['trafik', 'Trafik sigortası'], ['kasko', 'Kasko'], ['koltuk', 'Koltuk sigortası'], ['guzergah', 'Güzergah belgesi'],
  ['yag', 'Yağ bakımı (yapıldığı tarih)'], ['genel', 'Genel bakım (yapıldığı tarih)']];
const BELGE_YOK_OLABILIR = ['kasko', 'koltuk', 'guzergah', 'yag', 'genel'];
function aracBelgeForm(a, kod) {
  const tarihi = k => { const b = a.belgeler.find(x => x.k === k); return b ? isoTarih(b.bakim ? b.t : b.son) : bugunISO(); };
  formAc({
    modul: 'arac', islem: 'belge', baslik: 'Belge tarihi güncelle', alt: a.plaka, geri: () => detayGeri(CFG.arac, a),
    alanlar: [{ k: 'belge', etiket: 'Belge', tur: 'sec', secenekler: ARAC_BELGE_SEC, varsayilan: kod || 'muayene' },
      { k: 'durum', etiket: 'Durum', tur: 'segment', secenekler: [['var', 'Tarih gir'], ['yok', 'Belge yok']], varsayilan: 'var' },
      { k: 'tarih', etiket: 'Tarih (sigorta/muayene için bitiş, bakım için yapıldığı gün)', tur: 'tarih', serbest: true, varsayilan: tarihi(kod || 'muayene') }],
    degisti: (k, d, ayarla) => { if (k === 'belge') ayarla('tarih', tarihi(d('belge'))); },
    hazirla: d => {
      const belge = d('belge'), yok = d('durum') === 'yok';
      if (yok && !BELGE_YOK_OLABILIR.includes(belge)) throw new Error('Bu belge "yok" olarak işaretlenemez.');
      if (!yok && !d('tarih')) throw new Error('Tarih seç.');
      return { arac_id: a.id, belge, yok, tarih: yok ? '' : trTarih(d('tarih')) };
    },
    ozet: v => `${a.plaka} · ${(ARAC_BELGE_SEC.find(x => x[0] === v.belge) || [0, v.belge])[1]} ${v.yok ? 'yok' : v.tarih}`,
  });
}
function aracYeniForm() {
  const firmalar = [...new Set(((modVeri('arac') || {}).araclar || []).map(x => x.firma).filter(Boolean))];
  formAc({
    modul: 'arac', islem: 'yeni', baslik: 'Yeni araç', alt: 'Belge tarihleri sonradan araç sayfasından girilir', 
    alanlar: [{ k: 'plaka', etiket: 'Plaka', tur: 'metin', zorunlu: true, maks: 20, ipucu: 'Örn. 33 ABC 123' }, { k: 'firma', etiket: 'Firma', tur: 'metin', maks: 120, liste: firmalar },
      { k: 'marka', etiket: 'Marka', tur: 'metin', maks: 80 }, { k: 'model', etiket: 'Model', tur: 'metin', maks: 80 }, { k: 'yil', etiket: 'Model yılı', tur: 'sayi', maks: 4 },
      { k: 'km', etiket: 'Kilometre', tur: 'sayi', maks: 12 }, { k: 'yakit', etiket: 'Yakıt', tur: 'metin', maks: 20, liste: ['Dizel', 'Benzin', 'LPG', 'Elektrik', 'Hibrit'] },
      { k: 'sofor', etiket: 'Şoför', tur: 'metin', maks: 80 }, { k: 'sofor_tel', etiket: 'Şoför telefonu', tur: 'metin', maks: 30 }],
    hazirla: d => ({ plaka: gerekli(d('plaka'), 'Plaka'), firma: d('firma').trim(), marka: d('marka').trim(), model: d('model').trim(), yil: d('yil').trim(), km: d('km').replace(/\s/g, ''),
                     yakit: d('yakit').trim(), sofor: d('sofor').trim(), sofor_tel: d('sofor_tel').trim() }),
    ozet: v => `Yeni araç ${v.plaka}`,
  });
}
const plakaAnahtar = s => String(s || '').replace(/\s/g, '').toUpperCase();
// Liste satırının altındaki belge durumu çipleri: sorunlu belgeler tek tek, sorun yoksa tek yeşil çip
function aracChipleri(a) {
  const sorunlu = a.belgeler.map(b => ({ b, d: belgeDurum(b) })).filter(x => x.d && x.d.ton !== 'odendi').sort((p, q) => p.d.g - q.d.g);
  const cipler = sorunlu.slice(0, 3).map(x => `<span class="mc ${x.d.ton}">${esc(x.b.ad)} · ${esc(gunYazi(x.d.g))}</span>`);
  if (sorunlu.length > 3) cipler.push(`<span class="mc">+${sorunlu.length - 3}</span>`);
  if (!sorunlu.length) cipler.push(`<span class="mc odendi">${a.belgeler.length ? 'Belgeler güncel' : 'Belge girilmemiş'}</span>`);
  if ((a.evraklar || []).length) cipler.push(`<span class="mc">${a.evraklar.length} evrak</span>`);
  return `<div class="mc-sira">${cipler.join('')}</div>`;
}
// Belgeler: ilk bakışta yedisi birden, renkli kutular; yazma yetkisi varsa kutuya dokununca tarih güncellenir
const aracBelgeKutulari = a => {
  const yazma = durum.izinler.includes('arac') && !durum.ro;
  return `<h3 class="d-sec">Belgeler</h3><div class="belge-izgara">${ARAC_BELGE_SEC.map(([k, ad]) => {
    const b = a.belgeler.find(x => x.k === k), d = b && belgeDurum(b), adGoster = ad.replace(/ \(.*\)$/, '');
    const ic = `<b>${esc(adGoster)}</b><span>${d ? esc(gunYazi(d.g)) : 'Girilmemiş'}</span><small>${b ? (b.bakim ? 'Sonraki ' : 'Bitiş ') + esc(b.son) : (yazma ? 'Dokun ve gir' : '—')}</small>`;
    return yazma ? `<button type="button" class="bk ${d ? d.ton : 'yok'}" data-belge="${esc(k)}" aria-label="${esc(adGoster)} tarihini ${b ? 'güncelle' : 'gir'}">${ic}</button>` : `<div class="bk ${d ? d.ton : 'yok'}">${ic}</div>`;
  }).join('')}</div>${yazma ? '<p class="ipucu">Tarihi değiştirmek için belgeye dokun.</p>' : ''}`;
};
function aracEvrakHtml(a) {
  const l = a.evraklar || [];
  const grup = (tur, baslik, bos) => {
    const x = l.filter(e => e.tur === tur);
    return `<h3 class="d-sec">${baslik} <b class="sayi-rozet">${x.length}</b></h3>` + (x.length
      ? `<ul class="belge-liste">${x.map(e => `<li><div><b class="ev-ad">${esc(e.ad)}</b>${e.boyut ? `<small>${esc(boyutYazi(e.boyut))}</small>` : ''}</div><span class="b-sag"><button class="kucuk" type="button" data-evrak="${esc(e.id)}" aria-label="${esc(e.ad)} indir">İndir</button></span></li>`).join('')}</ul>`
      : `<p class="z-alt">${bos}</p>`);
  };
  return grup('arac', 'Araç evrakları', 'Masaüstünde bu aracın klasörüne yüklenen ruhsat, sigorta gibi evraklar burada görünür.')
    + (a.sofor && a.sofor !== '-' ? grup('sofor', 'Şoför evrakları', 'Şoförün klasöründeki ehliyet, SRC gibi evraklar burada görünür.') : '');
}
const boyutYazi = b => b >= 1048576 ? SAYI(Math.round(b / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
function aracOzetHtml(a) {
  const bakim = topla(a.bakimlar.filter(b => b.tur === 'bakim'), b => b.tutar + b.isc), harcama = topla(a.bakimlar.filter(b => b.tur === 'harcama'), b => b.tutar);
  return `<div class="d-ucluk"><div><small>Bakım</small><strong>${TLK(bakim)}</strong></div><div class="k"><small>Harcama</small><strong>${TLK(harcama)}</strong></div><div class="y"><small>Toplam</small><strong>${TLK(bakim + harcama)}</strong></div></div>`;
}
function aracYakitHtml(a) {
  const p = modVeri('petrol'); if (!p || !durum.izinler.includes('petrol')) return '';
  const k = plakaAnahtar(a.plaka), l = (p.kayitlar || []).filter(r => !r.od && plakaAnahtar(r.plaka) === k);
  if (!l.length) return '';
  return `<h3 class="d-sec">Akaryakıt <b class="sayi-rozet">${l.length}</b></h3>
    ${alanSatir('Toplam yakıt', `${LT(topla(l, r => r.litre))} · ${TL(topla(l, r => r.tutar))}`)}
    <ul class="zaman">${l.slice(0, 3).map(r => `<li><div class="z-ust"><span>${esc(r.ist)}${r.litre ? ' · ' + LT(r.litre) : ''}</span><span>${TL(r.tutar)}</span></div><div class="z-alt">${esc(trGoster(r.t))}${r.fis ? ' · Fiş ' + esc(r.fis) : ''}</div></li>`).join('')}</ul>`;
}
const yagAyrinti = y => [['Hava kompresörü', y.hk], ['Yağ filtresi', y.yf], ['Mazot filtresi', y.mf], ['Hava filtresi', y.hf], ['İşi yaptıran', y.yt]]
  .filter(x => x[1]).map(x => `${x[0]}: ${esc(x[1])}`).join(' · ');
const ARAC = {
  id: 'arac', modul: 'arac', araYazi: 'Plaka, marka, firma veya şoför ara', veri: () => (modVeri('arac') || {}).araclar, ara: a => `${a.plaka} ${a.marka} ${a.model} ${a.firma} ${a.sofor}`,
  filtreler: [['hepsi', 'Tümü', () => true], ['dolmus', 'Süresi geçmiş', a => a.belgeler.some(b => (belgeDurum(b) || {}).ton === 'bekliyor')],
              ['yakin', '30 gün içinde', a => a.belgeler.some(b => (belgeDurum(b) || {}).ton === 'kismi')]],
  ozetSinif: 'uc', grup: a => a.firma,
  grupOzet: l => {
    const say = ton => topla(l, a => a.belgeler.filter(b => (belgeDurum(b) || {}).ton === ton).length);
    const dol = say('bekliyor'), yak = say('kismi');
    return { adet: `${l.length} araç`, durum: dol ? [`${dol} belge geçmiş`, 'bekliyor'] : yak ? [`${yak} belge yakında`, 'kismi'] : ['Belgeler güncel', 'odendi'] };
  },
  kartlar: l => [{ ad: 'Araç', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mor' },
    { ad: 'Süresi geçmiş', deger: topla(l, a => a.belgeler.filter(b => (belgeDurum(b) || {}).ton === 'bekliyor').length), bicim: v => String(Math.round(v)), ton: 'kirmizi' },
    { ad: '30 gün içinde', deger: topla(l, a => a.belgeler.filter(b => (belgeDurum(b) || {}).ton === 'kismi').length), bicim: v => String(Math.round(v)), ton: 'kehribar' }],
  satir: a => satirHtml(esc(a.plaka), `${esc([a.marka, a.model, a.yil].filter(Boolean).join(' '))}${a.firma ? ' · ' + esc(a.firma) : ''}${a.sofor && a.sofor !== '-' ? ' · ' + esc(a.sofor) : ''}`, '', '') + aracChipleri(a),
  ekle: aracYeniForm,
  detay: a => `<div class="d-baslik"><div><h2>${esc(a.plaka)}</h2><p>${esc([a.marka, a.model, a.yil].filter(Boolean).join(' '))} · ${esc(a.firma)}</p></div></div>
    ${aracBelgeKutulari(a)}
    <div class="d-eylem" ${durum.izinler.includes('arac') ? '' : 'hidden'}><button class="eylem" id="ar-ekle" type="button">+ Bakım / harcama</button><button class="eylem" id="ar-yag" type="button">+ Yağ bakımı</button></div>
    ${alanSatir('Şoför', esc(a.sofor && a.sofor !== '-' ? a.sofor : ''))}${a.sofor_tel ? alanSatir('Şoför telefonu', `<a href="tel:${esc(a.sofor_tel.replace(/[^\d+]/g, ''))}">${esc(a.sofor_tel)}</a>`) : ''}
    ${alanSatir('Yakıt', esc(a.yakit))}${alanSatir('Kilometre', esc(a.km))}
    ${aracEvrakHtml(a)}
    ${aracOzetHtml(a)}
    ${aracYakitHtml(a)}
    <h3 class="d-sec">Tamir-bakım ve harcamalar</h3>
    ${a.bakimlar.length ? `<ul class="zaman">${a.bakimlar.map(b => `<li><div class="z-ust"><span>${esc(b.ac)}</span><span>${TL(b.tutar + b.isc)}</span></div>
      <div class="z-alt">${esc(trGoster(b.t))} · ${b.tur === 'bakim' ? 'Bakım' : 'Harcama'}${b.isc ? ` · İşçilik ${TL(b.isc)}` : ''}</div>${sahibi(b) ? `<div class="satir-eylem"><button class="kucuk" type="button" data-b-duzenle="${esc(b.id)}">Düzenle</button><button class="kucuk" type="button" data-b-sil="${esc(b.id)}">Sil</button></div>` : ''}</li>`).join('')}</ul>` : '<p class="z-alt">Kayıt yok.</p>'}
    ${a.yaglar.length ? `<h3 class="d-sec">Yağ bakımları</h3><ul class="zaman">${a.yaglar.map(y => `<li><div class="z-ust"><span>${esc(y.yag)}${y.lt ? ' · ' + esc(y.lt) + (/lt/i.test(y.lt) ? '' : ' lt') : ''}</span><span>${esc(y.t)}</span></div><div class="z-alt">${esc(y.usta)}${y.not ? ' · ' + esc(y.not) : ''}</div>${yagAyrinti(y) ? `<div class="z-alt">${yagAyrinti(y)}</div>` : ''}${sahibi(y) ? `<div class="satir-eylem"><button class="kucuk" type="button" data-y-sil="${esc(y.id)}">Sil</button></div>` : ''}</li>`).join('')}</ul>` : ''}`,
  detayBagla: (a, kok) => {
    $('#ar-ekle', kok)?.addEventListener('click', () => aracForm(a));
    $('#ar-yag', kok)?.addEventListener('click', () => aracYagForm(a));
    $('#ar-belge', kok)?.addEventListener('click', () => aracBelgeForm(a));
    kok.querySelectorAll('[data-belge]').forEach(b => b.addEventListener('click', () => aracBelgeForm(a, b.dataset.belge)));
    kok.querySelectorAll('[data-evrak]').forEach(b => b.addEventListener('click', () => evrakIndir(b, { kaynak: 'arac', arac_id: a.id, id: b.dataset.evrak })));
    kok.querySelectorAll('[data-b-duzenle]').forEach(b => b.addEventListener('click', () => aracForm(a, a.bakimlar.find(x => x.id === b.dataset.bDuzenle))));
    kok.querySelectorAll('[data-b-sil]').forEach(b => b.addEventListener('click', () => {
      const k = a.bakimlar.find(x => x.id === b.dataset.bSil); if (k) kayitSil('arac', { arac_id: a.id, tur: k.tur, kayit_id: k.id }, `${a.plaka} · ${k.ac}`);
    }));
    kok.querySelectorAll('[data-y-sil]').forEach(b => b.addEventListener('click', () => {
      const y = a.yaglar.find(x => x.id === b.dataset.ySil); if (y) kayitSil('arac', { arac_id: a.id, tur: 'yag', kayit_id: y.id }, `${a.plaka} · yağ bakımı ${y.yag}`);
    }));
  },
};

/* ---------- Esnaf ---------- */
function esnafForm(e, odeme, k) {
  const plakalar = (modVeri('esnaf') || {}).plakalar || [];
  const geri = () => detayGeri(CFG.esnaf, e);
  if (k) odeme = k.od;
  const alanlar = odeme ? [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: k ? isoTarih(k.t) : bugunISO() }, { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', maks: 200, varsayilan: k ? k.ac : 'Nakit/EFT Ödeme' },
    { k: 'tutar', etiket: 'Ödenen tutar (₺)', tur: 'tutar', zorunlu: true, ipucu: '0', varsayilan: k ? virgul(k.top) : '' }]
    : [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: k ? isoTarih(k.t) : bugunISO() }, { k: 'plaka', etiket: 'Araç plakası', tur: 'metin', maks: 20, liste: plakalar, varsayilan: k && k.plaka !== '-' ? k.plaka : '' },
      { k: 'aciklama', etiket: 'İşlem tipi / açıklama', tur: 'metin', zorunlu: true, maks: 200, varsayilan: k ? k.ac : '' }, { k: 'tutar', etiket: 'Parça / tutar (₺)', tur: 'tutar', ipucu: '0', varsayilan: k ? virgul(k.tutar) : '' },
      { k: 'iscilik', etiket: 'İşçilik (₺)', tur: 'tutar', ipucu: '0', varsayilan: k && k.isc ? virgul(k.isc) : '' }];
  const ek = k ? { kayit_id: k.id } : {};
  formAc({
    modul: 'esnaf', islem: k ? 'duzenle' : 'islem', baslik: k ? (odeme ? 'Ödemeyi düzenle' : 'İşlemi düzenle') : odeme ? 'Ödeme yap' : 'İşlem ekle', alt: e.isim, geri, alanlar, foto: k ? '' : 'Fiş / dekont fotoğrafı (isteğe bağlı)',
    hesap: odeme ? null : d => { const t = tutarCoz(d('tutar') || '0') + tutarCoz(d('iscilik') || '0'); return t > 0 ? `<b>Toplam ${TL(t)}</b>` : ''; },
    hazirla: d => odeme ? { ...ek, esnaf_id: e.id, odeme: true, tarih: tarihAl(d('tarih')), aciklama: d('aciklama').trim(), tutar: (() => { const t = tutarCoz(d('tutar')); if (!(t > 0)) throw new Error('Geçerli bir tutar gir.'); return t; })() }
      : { ...ek, esnaf_id: e.id, odeme: false, tarih: tarihAl(d('tarih')), plaka: d('plaka').trim(), aciklama: gerekli(d('aciklama'), 'Açıklama'), tutar: tutarAl(d('tutar'), 'Tutar', true), iscilik: tutarAl(d('iscilik'), 'İşçilik', true) },
    ozet: v => `${k ? 'Düzeltme · ' : ''}${e.isim} · ${v.odeme ? 'Ödeme ' + TL(v.tutar) : v.aciklama}`,
  });
}
function esnafYeniForm() {
  formAc({
    modul: 'esnaf', islem: 'yeni', baslik: 'Yeni esnaf', alt: 'Esnaf eklendikten sonra işlem ve ödeme girebilirsin',
    alanlar: [{ k: 'isim', etiket: 'Esnaf adı', tur: 'metin', zorunlu: true, maks: 80 }],
    hazirla: d => ({ isim: gerekli(d('isim'), 'Esnaf adı') }),
    ozet: v => `Yeni esnaf: ${v.isim}`,
  });
}
const ESNAF = {
  id: 'esnaf', modul: 'esnaf', araYazi: 'Esnaf ara', ekle: esnafYeniForm, veri: () => (modVeri('esnaf') || {}).esnaflar, ara: e => e.isim,
  filtreler: [['hepsi', 'Tümü', () => true], ['borclu', 'Borcu olan', e => e.bakiye > 0.01], ['kapali', 'Borcu yok', e => e.bakiye <= 0.01]],
  kartlar: l => [{ ad: 'Toplam borç', deger: topla(l, e => Math.max(0, e.bakiye)), bicim: TL, ton: 'kehribar' }, { ad: 'Toplam ödenen', deger: topla(l, e => e.odenen), bicim: TL, ton: 'yesil' },
    { ad: 'Toplam işlem', deger: topla(l, e => e.borc), bicim: TL, ton: 'mor' }, { ad: 'Esnaf', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mavi' }],
  satir: e => satirHtml(esc(e.isim), `${e.islemler.length} işlem`, e.bakiye > 0.01 ? TL(e.bakiye) : 'Borç yok', e.bakiye > 0.01 ? rozet('Borçlu', 'bekliyor') : rozet('Kapalı', 'odendi')),
  sinif: () => '',
  detay: e => `<div class="d-baslik"><div><h2>${esc(e.isim)}</h2><p>${e.islemler.length} işlem</p></div></div>
    <div class="d-ucluk"><div><small>Toplam işlem</small><strong>${TL(e.borc)}</strong></div><div class="y"><small>Ödenen</small><strong>${TL(e.odenen)}</strong></div><div class="k"><small>Kalan borç</small><strong>${TL(e.bakiye)}</strong></div></div>
    <div class="d-eylem" ${durum.izinler.includes('esnaf') ? '' : 'hidden'}><button class="eylem" id="es-islem" type="button">+ İşlem ekle</button><button class="eylem" id="es-odeme" type="button">+ Ödeme yap</button></div>
    <h3 class="d-sec">İşlemler</h3>
    ${e.islemler.length ? `<ul class="zaman">${e.islemler.map(i => `<li class="${i.od ? 'od' : ''}"><div class="z-ust"><span>${esc(i.ac || (i.od ? 'Ödeme' : 'İşlem'))}</span><span class="${i.od ? 'yesil-y' : ''}">${i.od ? '−' : ''}${TL(i.top)}</span></div>
      <div class="z-alt">${esc(trGoster(i.t))}${i.plaka && i.plaka !== '-' ? ' · ' + esc(i.plaka) : ''}${i.isc ? ` · İşçilik ${TL(i.isc)}` : ''}</div>${sahibi(i) ? `<div class="satir-eylem"><button class="kucuk" type="button" data-i-duzenle="${esc(i.id)}">Düzenle</button><button class="kucuk" type="button" data-i-sil="${esc(i.id)}">Sil</button></div>` : ''}</li>`).join('')}</ul>` : '<p class="z-alt">İşlem yok.</p>'}`,
  detayBagla: (e, kok) => {
    $('#es-islem', kok)?.addEventListener('click', () => esnafForm(e, false)); $('#es-odeme', kok)?.addEventListener('click', () => esnafForm(e, true));
    kok.querySelectorAll('[data-i-duzenle]').forEach(b => b.addEventListener('click', () => esnafForm(e, false, e.islemler.find(x => x.id === b.dataset.iDuzenle))));
    kok.querySelectorAll('[data-i-sil]').forEach(b => b.addEventListener('click', () => {
      const i = e.islemler.find(x => x.id === b.dataset.iSil); if (i) kayitSil('esnaf', { esnaf_id: e.id, kayit_id: i.id }, `${e.isim} · ${i.od ? 'Ödeme' : (i.ac || 'İşlem')} ${TL(i.top)}`);
    }));
  },
};

/* ---------- Akaryakıt ---------- */
function petrolForm(x) {
  const m = modVeri('petrol') || { araclar: [], istasyonlar: [] };
  formAc({
    modul: 'petrol', islem: x ? 'duzenle' : 'ekle', baslik: x ? 'Kaydı düzenle' : 'Akaryakıt kaydı', alt: 'Litre × birim fiyat = tutar (tutarı elle de girebilirsin)',
    foto: x ? '' : 'Fiş fotoğrafı (isteğe bağlı)', geri: x ? () => detayGeri(CFG.petrol, x) : null,
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: x ? isoTarih(x.t) : bugunISO() },
      { k: 'plaka', etiket: 'Araç plakası', tur: 'metin', zorunlu: true, maks: 20, liste: m.araclar.map(a => a.plaka), ipucu: 'Listeden seç ya da yaz', varsayilan: x ? x.plaka : '' },
      { k: 'istasyon', etiket: 'İstasyon', tur: 'metin', zorunlu: true, maks: 60, liste: m.istasyonlar.map(i => i.ad), varsayilan: x ? x.ist : '' },
      { k: 'litre', etiket: 'Litre', tur: 'tutar', ipucu: '0', varsayilan: x && x.litre ? virgul(x.litre) : '' }, { k: 'fiyat', etiket: 'Birim fiyat (₺)', tur: 'tutar', ipucu: '0', varsayilan: x && x.fiyat ? virgul(x.fiyat) : '' },
      { k: 'tutar', etiket: 'Tutar (₺)', tur: 'tutar', ipucu: '0', varsayilan: x ? virgul(x.tutar) : '' }, { k: 'fis_no', etiket: 'Fiş no (isteğe bağlı)', tur: 'metin', maks: 40, varsayilan: x ? x.fis : '' },
      { k: 'aciklama', etiket: 'Not (isteğe bağlı)', tur: 'metin', maks: 200, varsayilan: x ? x.ac : '' }],
    degisti: (k, d, ayarla) => {
      if (k === 'tutar') { $('#fm-tutar').dataset.elle = '1'; return; }
      if (k !== 'litre' && k !== 'fiyat') return;
      const t = tutarCoz(d('litre')) * tutarCoz(d('fiyat'));
      if (t > 0 && !$('#fm-tutar').dataset.elle) ayarla('tutar', String(Math.round(t * 100) / 100).replace('.', ','));
    },
    hazirla: d => {
      const plaka = gerekli(d('plaka'), 'Plaka'), arac = m.araclar.find(a => sade(a.plaka).replace(/\s/g, '') === sade(plaka).replace(/\s/g, ''));
      const litre = tutarAl(d('litre'), 'Litre', true), fiyat = tutarAl(d('fiyat'), 'Birim fiyat', true);
      let tutar = tutarAl(d('tutar'), 'Tutar', true); if (!(tutar > 0)) tutar = Math.round(litre * fiyat * 100) / 100;
      if (!(tutar > 0)) throw new Error('Tutar ya da litre × birim fiyat gir.');
      return { ...(x ? { kayit_id: x.id } : {}), tarih: tarihAl(d('tarih')), arac_id: arac ? arac.id : '', plaka, istasyon: gerekli(d('istasyon'), 'İstasyon'), litre, fiyat, tutar, fis_no: d('fis_no').trim(), aciklama: d('aciklama').trim() };
    },
    ozet: v => `${x ? 'Düzeltme · ' : ''}${v.plaka} · ${v.istasyon} · ${TL(v.tutar)}`,
  });
  if (x) $('#fm-tutar').dataset.elle = '1';   // düzenlemede kayıtlı tutar litre × fiyatla ezilmez
}
const PETROL = {
  id: 'petrol', modul: 'petrol', araYazi: 'Plaka, istasyon veya fiş no ara', aySec: true, ekle: petrolForm,
  veri: () => (modVeri('petrol') || {}).kayitlar, ara: x => `${x.plaka} ${x.ist} ${x.fis} ${x.ac}`,
  filtreler: [['hepsi', 'Tümü', () => true], ['alim', 'Yakıt alımı', x => !x.od], ['odeme', 'Ödemeler', x => x.od]],
  kartlar: l => { const al = l.filter(x => !x.od), tutar = topla(al, x => x.tutar), litre = topla(al, x => x.litre);
    return [{ ad: 'Tutar', deger: tutar, bicim: TL, ton: 'kehribar' }, { ad: 'Litre', deger: litre, bicim: LT, ton: 'mavi' },
            { ad: 'Ort. birim fiyat', deger: litre > 0 ? topla(al.filter(x => x.litre > 0), x => x.tutar) / topla(al.filter(x => x.litre > 0), x => x.litre) : 0, bicim: TL, ton: 'mor' },
            { ad: 'Kayıt', deger: l.length, bicim: v => String(Math.round(v)), ton: 'yesil' }]; },
  satir: x => satirHtml(esc(x.od ? 'Ödeme / tahsilat' : x.plaka || '—'), `${esc(trGoster(x.t))} · ${esc(x.ist)}`, TL(x.tutar), x.litre ? `${LT(x.litre)}` : ''),
  detay: x => `<div class="d-baslik"><div><h2>${esc(x.od ? 'Ödeme / tahsilat' : x.plaka)}</h2><p>${esc(trGoster(x.t))} · ${esc(x.ist)}</p></div></div>
    <div class="d-ucluk"><div><small>Litre</small><strong>${x.litre ? LT(x.litre) : '—'}</strong></div><div><small>Birim fiyat</small><strong>${x.fiyat ? TL(x.fiyat) : '—'}</strong></div><div class="k"><small>Tutar</small><strong>${TL(x.tutar)}</strong></div></div>
    ${alanSatir('Fiş no', esc(x.fis))}${alanSatir('Not', esc(x.ac))}
    ${duzenleSilHtml(x, !x.od)}`,
  detayBagla: (x, kok) => duzenleSilBagla(kok, () => petrolForm(x), () => kayitSil('petrol', { kayit_id: x.id }, `${x.od ? 'Akaryakıt ödemesi' : x.plaka} · ${x.ist} · ${TL(x.tutar)}`)),
};
// İstasyon bakiyeleri kart listesinin üstünde ayrı şerit olarak gösterilir
function petrolBakiyeCiz() {
  const s = $('#v-petrol'); if (!s) return;
  let y = $('.ist-bakiye', s);
  if (!y) { y = document.createElement('div'); y.className = 'ist-bakiye'; $('.ozet', s).after(y); }
  const l = (modVeri('petrol') || {}).istasyonlar || [];
  y.hidden = !l.length;
  y.innerHTML = `<h3 class="d-sec">İstasyon bakiyeleri</h3><div class="ist-sirasi">${l.map(i => `<div class="ist"><small>${esc(i.ad)}</small><strong class="${i.bakiye < 0 ? 'yesil-y' : ''}">${TL(i.bakiye)}</strong></div>`).join('')}</div>`;
}

/* ---------- İç hizmet ---------- */
function icForm(x) {
  const m = modVeri('ic_hizmet') || { guzergahlar: [], soforler: [], yerler: [], plakalar: [] };
  const guzSec = SIFIR_SEC.concat(m.guzergahlar.map(g => [g.ad, `${g.ad} · ${TL(g.fiyat)}`]));
  if (x && x.guz && !m.guzergahlar.some(g => g.ad === x.guz)) guzSec.push([x.guz, x.guz]);
  const bolumlu = !!x && Object.keys(x.bolum || {}).length > 0;
  formAc({
    modul: 'ic_hizmet', islem: x ? 'duzenle' : 'ekle', baslik: x ? 'Seferi düzenle' : 'Yeni sefer',
    alt: bolumlu ? 'Bölüm dağılımı olan seferin kişi sayısı telefondan değiştirilemez' : 'Sefer ücreti güzergah fiyatından alınır',
    foto: x ? '' : 'Fiş fotoğrafı (isteğe bağlı)', geri: x ? () => detayGeri(CFG.ic_hizmet, x) : null,
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: x ? isoTarih(x.t) : bugunISO() },
      { k: 'saat', etiket: 'Saat', tur: 'saat', varsayilan: x ? x.saat : `${p2(new Date().getHours())}:${p2(new Date().getMinutes())}` },
      { k: 'plaka', etiket: 'Plaka', tur: 'metin', zorunlu: true, maks: 20, liste: m.plakalar, varsayilan: x ? x.plaka : '' },
      { k: 'sofor', etiket: 'Şoför', tur: 'metin', maks: 80, liste: m.soforler, varsayilan: x ? x.sofor : '' },
      { k: 'personel', etiket: 'Personel', tur: 'metin', zorunlu: true, maks: 300, ipucu: 'Adlar virgülle ayrılır', varsayilan: x ? x.personel : '' },
      { k: 'guzergah', etiket: 'Güzergah', tur: 'sec', secenekler: guzSec, varsayilan: x ? x.guz : '' },
      { k: 'yer', etiket: 'Gidilen yer', tur: 'metin', zorunlu: true, maks: 80, liste: m.yerler, varsayilan: x ? x.yer : '' },
      { k: 'kisi', etiket: 'Kişi sayısı', tur: 'sayi', varsayilan: x ? String(x.kisi) : '1' }, { k: 'tutar', etiket: 'Sefer ücreti (₺)', tur: 'tutar', ipucu: 'Güzergahtan gelir', varsayilan: x ? virgul(x.tutar) : '' },
      { k: 'fis_no', etiket: 'Fiş no', tur: 'metin', zorunlu: true, maks: 40, varsayilan: x ? x.fis : '' }, { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', maks: 200, varsayilan: x ? x.ac : '' }],
    degisti: (k, d, ayarla) => { if (k === 'guzergah') { const g = m.guzergahlar.find(x => x.ad === d('guzergah')); if (g) ayarla('tutar', String(g.fiyat).replace('.', ',')); } },
    hazirla: d => {
      const g = gerekli(d('guzergah'), 'Güzergah'), kisi = parseInt(d('kisi'), 10);
      if (!(kisi >= 1)) throw new Error('Kişi sayısı geçersiz.');
      return { ...(x ? { kayit_id: x.id } : {}), tarih: tarihAl(d('tarih')), saat: d('saat'), plaka: gerekli(d('plaka'), 'Plaka'), sofor: d('sofor').trim(), personel: gerekli(d('personel'), 'Personel'),
               guzergah: g, yer: gerekli(d('yer'), 'Gidilen yer'), kisi, tutar: tutarAl(d('tutar'), 'Sefer ücreti', true), fis_no: gerekli(d('fis_no'), 'Fiş no'), aciklama: d('aciklama').trim() };
    },
    ozet: v => `${x ? 'Düzeltme · ' : ''}${v.plaka} · ${v.guzergah} · fiş ${v.fis_no}`,
  });
}
const IC = {
  id: 'ic_hizmet', modul: 'ic_hizmet', araYazi: 'Plaka, personel, güzergah veya fiş no ara', aySec: true, ekle: icForm,
  veri: () => (modVeri('ic_hizmet') || {}).seferler, ara: x => `${x.plaka} ${x.sofor} ${x.personel} ${x.guz} ${x.yer} ${x.fis} ${x.ac}`,
  kartlar: l => [{ ad: 'Sefer ücreti', deger: topla(l, x => x.tutar), bicim: TL, ton: 'kehribar' }, { ad: 'Sefer', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mor' },
    { ad: 'Kişi', deger: topla(l, x => x.kisi), bicim: v => String(Math.round(v)), ton: 'mavi' }, { ad: 'Araç', deger: new Set(l.map(x => x.plaka)).size, bicim: v => String(Math.round(v)), ton: 'yesil' }],
  ekstra: l => {   // şoför özeti ve bölüm dağılımı: telefonda seçili dönemin seferlerinden türetilir
    const sofor = {}, bolum = {};
    l.forEach(x => {
      const s = sofor[x.sofor || 'Şoför yok'] ||= { sefer: 0, kisi: 0, tutar: 0 };
      s.sefer++; s.kisi += +x.kisi || 0; s.tutar += x.tutar || 0;
      Object.entries(x.bolum || {}).forEach(([b, n]) => { bolum[b] = (bolum[b] || 0) + n; });
    });
    const sl = Object.entries(sofor).sort((a, b) => b[1].tutar - a[1].tutar), bl = Object.entries(bolum).sort((a, b) => b[1] - a[1]), bmaks = Math.max(1, ...bl.map(b => b[1]));
    if (!sl.length) return '';
    return `<details class="ekstra-kutu"><summary>Şoför özeti <b class="sayi-rozet">${sl.length}</b></summary>
      <ul class="belge-liste">${sl.map(([ad, s]) => `<li><div><b>${esc(ad)}</b><small>${s.sefer} sefer · ${SAYI(s.kisi)} kişi</small></div><b>${TL(s.tutar)}</b></li>`).join('')}</ul></details>
      ${bl.length ? `<details class="ekstra-kutu"><summary>Bölüm dağılımı <b class="sayi-rozet">${bl.length}</b></summary>
      <ul class="bolum-liste">${bl.map(([ad, n]) => `<li><span>${esc(ad)}</span><span class="b-cubuk"><i style="width:${(n / bmaks * 100).toFixed(1)}%"></i></span><b>${SAYI(n)} kişi</b></li>`).join('')}</ul></details>` : ''}`;
  },
  satir: x => satirHtml(esc(x.guz || x.yer), `${esc(trGoster(x.t))} ${esc(x.saat)} · ${esc(x.plaka)}`, TL(x.tutar), `${SAYI(+x.kisi || 0)} kişi · fiş ${esc(x.fis)}`),
  detay: x => `<div class="d-baslik"><div><h2>${esc(x.guz)}</h2><p>${esc(trGoster(x.t))} ${esc(x.saat)} · ${esc(x.yer)}</p></div></div>
    <div class="d-ucluk"><div><small>Plaka</small><strong>${esc(x.plaka)}</strong></div><div><small>Kişi</small><strong>${SAYI(+x.kisi || 0)}</strong></div><div class="k"><small>Ücret</small><strong>${TL(x.tutar)}</strong></div></div>
    ${alanSatir('Şoför', esc(x.sofor))}${alanSatir('Personel', esc(x.personel))}${alanSatir('Fiş no', esc(x.fis))}${alanSatir('Sıra no', esc(x.sira))}${alanSatir('Açıklama', esc(x.ac))}
    ${Object.keys(x.bolum || {}).length ? `<h3 class="d-sec">Bölüm dağılımı</h3><ul class="belge-liste">${Object.entries(x.bolum).map(([b, n]) => `<li><div><b>${esc(b)}</b></div><b>${SAYI(n)} kişi</b></li>`).join('')}</ul>` : ''}
    ${duzenleSilHtml(x)}`,
  detayBagla: (x, kok) => duzenleSilBagla(kok, () => icForm(x), () => kayitSil('ic_hizmet', { kayit_id: x.id }, `${x.plaka} · ${x.guz} · fiş ${x.fis}`)),
};

/* ---------- Ana Sayfa ---------- */
const anaDurum = { hepsi: false, sec: null, aylik: [] };
// Üstteki ay kartı: seçili ayın gelir/gider/net değerleri (ay listesinden ya da grafikten seçilir)
const buAyHtml = a => { const net = a.gelir - a.gider;
  return `<div><small>Gelir</small><strong class="yesil">${TLK(a.gelir)}</strong></div><div><small>Gider</small><strong class="kehribar">${TLK(a.gider)}</strong></div><div><small>Net</small><strong class="${net >= 0 ? 'yesil' : 'kirmizi'}">${TLK(net)}</strong></div>`; };
function buAyYaz(i) {
  const a = anaDurum.aylik[i], sel = $('#bu-ay-sec'); if (!a || !sel) return;
  sel.value = String(i);
  $('#bu-ay-etiket').textContent = i === anaDurum.aylik.length - 1 ? 'Bu ay' : '';
  $('#bu-ay-satir').innerHTML = buAyHtml(a);
}
function grafikSec(g) {
  const a = anaDurum.aylik[+g.dataset.i]; if (!a) return;
  anaDurum.sec = +g.dataset.i;
  document.querySelectorAll('.b-grup').forEach(x => { const s = x === g; x.classList.toggle('secili', s); x.setAttribute('aria-pressed', String(s)); });
  buAyYaz(anaDurum.sec);
}
document.addEventListener('change', e => {
  if (e.target.id !== 'bu-ay-sec') return;
  const g = document.querySelector(`.b-grup[data-i="${+e.target.value}"]`); if (g) grafikSec(g);
});
document.addEventListener('click', e => {
  if (e.target.closest('#dik-daha')) { anaDurum.hepsi = !anaDurum.hepsi; anaCiz(); return; }
  const g = e.target.closest('.b-grup'); if (g) grafikSec(g);
});
// Parmağı grafik üzerinde kaydırınca ay ay seçilir: 12 dar sütuna tek tek isabet etmek gerekmez
document.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse' && !e.buttons) return;
  const gr = e.target.closest && e.target.closest('.grafik'); if (!gr) return;
  const r = gr.getBoundingClientRect();
  const g = document.elementFromPoint(Math.min(Math.max(e.clientX, r.left + 1), r.right - 1), r.top + r.height / 2)?.closest('.b-grup');
  if (g && !g.classList.contains('secili')) grafikSec(g);
});
function anaCiz() {
  const s = $('#v-dashboard'); if (!s) return;
  const v = modVeri('dashboard');
  if (!v) { s.innerHTML = '<div class="iskelet-kart" aria-hidden="true"></div>'; return; }
  const maks = Math.max(1, ...v.aylik.map(a => Math.max(a.gelir, a.gider, 0)));
  anaDurum.aylik = v.aylik;
  const sec = Math.min(anaDurum.sec ?? v.aylik.length - 1, v.aylik.length - 1);
  const belgeler = v.belgeler.map(b => ({ ...b, g: gunFarki(b.son) })).filter(b => b.g !== null && b.g <= 30).sort((a, b) => a.g - b.g);
  const ilkCizim = !anaDurum.cizildi; anaDurum.cizildi = true;   // çubuklar yalnızca ilk çizimde büyür; veri tazelenince yeniden oynamaz
  const bar = (a, i) => { const h1 = Math.max(0, a.gelir) / maks * 100, h2 = Math.max(0, a.gider) / maks * 100;
    return `<button type="button" class="b-grup${i === sec ? ' secili' : ''}" data-i="${i}" aria-pressed="${i === sec}" aria-label="${esc(ayAdi(a.ay))}: gelir ${TL(a.gelir)}, gider ${TL(a.gider)}"><div class="b-cift"><i class="gelir" style="height:${h1}%;animation-delay:${i * 15}ms"></i><i class="gider" style="height:${h2}%;animation-delay:${i * 15 + 10}ms"></i></div><small>${AYLAR[+a.ay.slice(5) - 1].slice(0, 3)}</small></button>`; };
  s.innerHTML = `<section class="bu-ay" aria-label="Aylık özet">
      <div class="bu-ay-ust"><label class="gizli" for="bu-ay-sec">Ay seç</label>
        <select id="bu-ay-sec" class="bu-ay-sec">${v.aylik.map((a, i) => `<option value="${i}">${esc(ayAdi(a.ay))}</option>`).reverse().join('')}</select>
        <small id="bu-ay-etiket">${sec === v.aylik.length - 1 ? 'Bu ay' : ''}</small></div>
      <div class="bu-ay-satir" id="bu-ay-satir">${buAyHtml(v.aylik[sec])}</div>
      <p class="bu-ay-not">Net = gelir − gider. Gelir: giden faturalar. Gider: gelen faturalar, akaryakıt, esnaf işlemleri.</p></section>
    <h3 class="d-sec">Son 12 ay <small class="d-ipucu">Aya dokun, üstteki özet değişir</small></h3><div class="grafik sec${ilkCizim ? ' ilk-cizim' : ''}">${v.aylik.map(bar).join('')}</div>
    <div class="lejant"><span><i class="gelir"></i>Gelir</span><span><i class="gider"></i>Gider</span></div>
    <h3 class="d-sec">Dikkat edilmesi gerekenler <b class="sayi-rozet">${belgeler.length}</b></h3>
    ${belgeler.length ? `<ul class="belge-liste">${(anaDurum.hepsi ? belgeler : belgeler.slice(0, 4)).map(b => `<li><div><b>${esc(b.plaka)} · ${esc(b.ad)}</b><small>${esc(b.firma)} · ${esc(b.son)}</small></div>${rozet(gunYazi(b.g), b.g < 0 ? 'bekliyor' : 'kismi')}</li>`).join('')}</ul>
      ${belgeler.length > 4 ? `<button class="daha" id="dik-daha" type="button">${anaDurum.hepsi ? 'Daha az göster' : `Tümünü göster (${belgeler.length - 4} daha)`}</button>` : ''}` : '<p class="z-alt">Süresi dolan ya da 30 gün içinde dolacak belge yok.</p>'}
    ${v.istasyonlar.length ? `<h3 class="d-sec">İstasyon bakiyeleri</h3><div class="ist-sirasi">${v.istasyonlar.map(i => `<div class="ist"><small>${esc(i.ad)}</small><strong>${TL(i.bakiye)}</strong></div>`).join('')}</div>` : ''}
    ${(v.firmalar || []).length ? `<h3 class="d-sec">Filo (firmaya göre) <b class="sayi-rozet">${SAYI(+v.arac_sayisi || 0)}</b></h3><ul class="belge-liste">${v.firmalar.map(f => `<li><div><b>${esc(f.ad)}</b></div><b>${SAYI(f.adet)} araç</b></li>`).join('')}</ul>` : ''}
    ${(v.hareketler || []).length ? `<h3 class="d-sec">Son hareketler</h3><ul class="hareket-liste">${v.hareketler.map(h => `<li><div><b>${esc(h.ad)}</b><small>${esc(trGoster(h.t))}${h.ac ? ' · ' + esc(h.ac) : ''}</small></div><span class="h-tutar ${h.yon}">${!h.tutar ? '—' : (h.yon === 'gelir' ? '+' : h.yon === 'odeme' ? '' : '−') + TL(h.tutar)}</span></li>`).join('')}</ul>` : ''}`;
}

/* ---------- Ayarlar: kullanıcı yönetimi (yalnızca yönetici) ---------- */
// Masaüstündeki Kullanıcı Yönetimi ile aynı yetki listesi. Değişiklik masaüstüne iletilir, orada uygulanır;
// liste Drive'daki kullanıcı özetinden okunur (parola özeti bile telefona gelmez).
const KUL_IZINLERI = [['dashboard', 'Ana Sayfa'], ['fatura', 'Fatura Yönetimi'], ['arac', 'Araç Yönetimi'], ['esnaf', 'Esnaf Defteri'], ['petrol', 'Akaryakıt'],
  ['ic_hizmet', 'İç Hizmetler'], ['okul', 'Okul Yönetimi'], ['sirket_evrak', 'Şirket Evrakları'], ['ayarlar', 'Ayarlar']];
const kulIzinAd = k => (KUL_IZINLERI.find(x => x[0] === k) || [k, k])[1];
const ayarDurum = { liste: null, hata: '', mesgul: false };

async function ayarlarYenile() {
  if (ayarDurum.mesgul || !durum.token || !durum.izinler.includes('ayarlar')) return;
  ayarDurum.mesgul = true;
  try {
    const j = await rpc('kullanicilar');
    if (j.ok) { ayarDurum.liste = j.kullanicilar; ayarDurum.hata = ''; }
    else ayarDurum.hata = j.hata === 'veri_yok' ? 'Sunucuda veri klasörü bulunamadı.' : 'Kullanıcı listesi alınamadı.';
  } catch (e) {
    ayarDurum.mesgul = false;
    if (e.message === 'oturum') return;
    ayarDurum.hata = 'Bağlantı yok; kullanıcı listesi alınamadı.'; ayarlarCiz(); return;
  }
  ayarDurum.mesgul = false; ayarlarCiz();
}

function ayarlarCiz() {
  const s = $('#v-ayarlar'); if (!s) return;
  const l = ayarDurum.liste, ul = $('.liste', s);
  $('.bek-yer', s).innerHTML = bekleyenHtml('ayarlar');
  ul._liste = l || [];
  ul.innerHTML = (l || []).map((u, i) => `<li><button type="button" class="kart" data-i="${i}">${satirHtml(esc(u.ad),
    esc((u.ro ? 'Salt okunur · ' : '') + (u.izinler.map(kulIzinAd).join(' · ') || 'Hiçbir sayfaya erişemez')), `${u.izinler.length} sayfa`, '')}</button></li>`).join('');
  $('.ay-durum', s).textContent = ayarDurum.hata || (l ? '' : 'Yükleniyor…');
  $('.bos', s).hidden = !l || l.length > 0;
}

async function ayarGonder(veri, ozet) {
  const p = { id: yeniId(), tur: 'kayit', modul: 'ayarlar', islem: 'kullanici', veri, ozet, foto: null, gitti: false, durum: 'bekliyor' };
  durum.bekleyen.push(p); bekleyenKaydet();
  await bekleyenleriIsle(); bekleyenleriGoster();
  toast(p.gitti ? 'Gönderildi, masaüstü işleyecek.' : 'Bağlantı yok; bağlanınca otomatik gönderilecek.', p.gitti ? 'ok' : 'uyari');
}

function kullaniciDetay(u) {
  durum.acik = { tur: 'kul', id: u.ad, form: false };
  const var_ = k => u.izinler.includes(k);
  $('#sayfa-icerik').innerHTML = `<div class="d-baslik"><div><h2>${esc(u.ad)}</h2><p>${u.izinler.length ? `${u.izinler.length} sayfaya erişebilir` : 'Hiçbir sayfaya erişemez'}${u.ro ? ' · salt okunur' : ''}</p></div></div>
    <h3 class="d-sec">Erişebildiği sayfalar</h3>
    <ul class="izin-liste">${KUL_IZINLERI.map(([k, ad]) => `<li class="${var_(k) ? 'var' : ''}"><i aria-hidden="true">${var_(k) ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>' : '–'}</i>${esc(ad)}<span class="gizli">${var_(k) ? ': erişebilir' : ': erişemez'}</span></li>`).join('')}</ul>
    <button class="btn-ana" id="ku-duzenle" type="button">Düzenle</button>
    <button class="btn-tehlike" id="ku-sil" type="button">Kullanıcıyı sil</button>`;
  $('#ku-duzenle').addEventListener('click', () => kullaniciForm(u));
  $('#ku-sil').addEventListener('click', async () => {
    if (!(await onay('Kullanıcı silinsin mi?', `"${u.ad}" silinirse telefondan ve masaüstünden girişi kapanır.`, 'Sil', true))) return;
    kapat(); await ayarGonder({ eylem: 'sil', ad: u.ad }, `Kullanıcıyı sil: ${u.ad}`);
  });
  sayfaAc();
}

function kullaniciForm(u) {
  const yeni = !u;
  formAc({
    modul: 'ayarlar', islem: 'kullanici', baslik: yeni ? 'Yeni kullanıcı' : u.ad,
    alt: yeni ? 'Bu bilgilerle telefona ve masaüstüne giriş yapar' : 'Şifre alanını boş bırakırsan şifre değişmez',
    geri: yeni ? null : () => kullaniciDetay(u),
    alanlar: [{ k: 'ad', etiket: 'Kullanıcı adı', tur: 'metin', zorunlu: true, maks: 64, varsayilan: yeni ? '' : u.ad },
      { k: 'sifre', etiket: yeni ? 'Şifre' : 'Yeni şifre (isteğe bağlı)', tur: 'sifre', zorunlu: yeni, maks: 64, ipucu: 'En az 4 karakter' },
      { k: 'izinler', etiket: 'Erişebileceği sayfalar', tur: 'onay', secenekler: KUL_IZINLERI, varsayilan: yeni ? [] : u.izinler },
      { k: 'ro', etiket: 'Erişim türü', tur: 'segment', secenekler: [['0', 'Okuma ve yazma'], ['1', 'Salt okunur']], varsayilan: (u && u.ro) ? '1' : '0' }],
    hazirla: d => {
      const ad = gerekli(d('ad'), 'Kullanıcı adı'), sifre = yeni ? gerekli(d('sifre'), 'Şifre') : d('sifre').trim();
      if (sifre && (sifre.length < 4 || sifre.length > 64)) throw new Error('Şifre 4 ile 64 karakter arasında olmalı.');
      const kendi = u ? u.ad.toLowerCase() : '';
      if (ad.toLowerCase() !== kendi && (ayarDurum.liste || []).some(x => x.ad.toLowerCase() === ad.toLowerCase())) throw new Error('Bu kullanıcı adı zaten var.');
      const ro = d('ro') === '1';
      return yeni ? { eylem: 'ekle', ad, sifre, izinler: d('izinler'), salt_okunur: ro }
        : { eylem: 'guncelle', ad: u.ad, yeni_ad: ad !== u.ad ? ad : '', sifre, izinler: d('izinler'), salt_okunur: ro };
    },
    ozet: v => `${v.eylem === 'ekle' ? 'Yeni kullanıcı' : 'Kullanıcıyı güncelle'}: ${v.yeni_ad || v.ad}`,
  });
}

function ayarlarKur() {
  const s = document.createElement('section');
  s.id = 'v-ayarlar'; s.className = 'gorunum'; s.hidden = true; s.dataset.modul = 'ayarlar';
  s.innerHTML = `<div class="bek-yer"></div>
    <h3 class="d-sec">Kullanıcılar</h3>
    <p class="z-alt ay-not">Kimin hangi sayfaları görebileceğini buradan belirlersin. Değişiklikler masaüstü uygulamasına iletilir ve orada işlenir; yönetici hesabı telefondan değiştirilemez.</p>
    <p class="z-alt ay-durum" role="status"></p>
    <ul class="liste"></ul><p class="bos" hidden>Henüz kullanıcı eklenmemiş.</p>
    <button class="fab" aria-label="Kullanıcı ekle" type="button"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>`;
  $('#ana').append(s);
  $('.liste', s).addEventListener('click', e => {
    const b = e.target.closest('.kart'); if (!b) return;
    const u = $('.liste', s)._liste[+b.dataset.i]; if (u) kullaniciDetay(u);
  });
  $('.fab', s).addEventListener('click', () => { kullaniciForm(null); sayfaAc(); });
}

const CFG = { fatura: FATURA, arac: ARAC, esnaf: ESNAF, petrol: PETROL, ic_hizmet: IC };

// uygulama.js başlarken bir kez: modül sayfalarını oluşturur
function modulleriKur() {
  const a = document.createElement('section');
  a.id = 'v-dashboard'; a.className = 'gorunum'; a.hidden = true; a.dataset.modul = 'dashboard';
  $('#ana').append(a);
  a.addEventListener('click', e => { const b = e.target.closest('[data-git]'); if (b) gorunumGoster(b.dataset.git, true); });
  Object.values(CFG).forEach(listeKur);
  ayarlarKur();
}

function modullerCiz(degisen) {
  const var_ = m => !degisen || degisen.includes(m);
  if (var_('dashboard')) anaCiz();
  Object.entries(CFG).forEach(([m, c]) => { if (var_(m) && durum.izinler.includes(m)) c.cizim(); });
  if (var_('petrol')) petrolBakiyeCiz();
  if (durum.acik && String(durum.acik.tur).startsWith('m:') && !durum.acik.form) {
    const c = CFG[durum.acik.tur.slice(2)], kayit = c && (c.veri() || []).find(x => x.id === durum.acik.id);
    if (kayit) { c.detayYaz = () => { $('#sayfa-icerik').innerHTML = c.detay(kayit); detayBagla(c, kayit); }; c.detayYaz(); }
  }
}
