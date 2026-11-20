'use strict';
/* Okul ve evrak dışındaki modüller: Ana Sayfa, Fatura, Araç, Esnaf, Akaryakıt, İç Hizmet.
   uygulama.js'ten ÖNCE yüklenir; yardımcıları ($, TL, esc, sade, rpc, durum, toast, sayfa işlevleri) çağrı anında kullanır. */

const MODULLER = [
  { id: 'dashboard', izin: 'dashboard', ad: 'Ana Sayfa' }, { id: 'tahsilat', izin: 'okul', ad: 'Okul Yönetimi' },
  { id: 'evrak', izin: 'sirket_evrak', ad: 'Evraklar' }, { id: 'fatura', izin: 'fatura', ad: 'Faturalar' },
  { id: 'arac', izin: 'arac', ad: 'Araçlar' }, { id: 'esnaf', izin: 'esnaf', ad: 'Esnaflar' },
  { id: 'petrol', izin: 'petrol', ad: 'Akaryakıt' }, { id: 'ic_hizmet', izin: 'ic_hizmet', ad: 'İç Hizmetler' },
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
  return `<ul class="bek-liste">${l.map(p => `<li class="${p.durum}"><span>${p.durum === 'red' ? '✖' : p.gitti ? '⏳' : '📡'} ${esc(p.ozet)}</span>
    <small>${p.durum === 'red' ? 'Reddedildi: ' + esc(p.neden || '') : p.gitti ? 'Masaüstü bekleniyor' : 'Bağlantı bekleniyor'}</small>
    ${p.durum === 'red' ? `<button class="kucuk" data-sil="${p.id}">Kapat</button>` : ''}</li>`).join('')}</ul>`;
}
function bekleyenleriGoster() {
  document.querySelectorAll('.gorunum[data-modul] .bek-yer').forEach(y => { y.innerHTML = bekleyenHtml(y.closest('.gorunum').dataset.modul); });
}
document.addEventListener('click', e => {
  const b = e.target.closest('.bek-yer [data-sil]'); if (!b) return;
  durum.bekleyen = durum.bekleyen.filter(p => p.id !== b.dataset.sil); bekleyenKaydet(); bekleyenleriGoster();
});

/* ---------- ortak: liste görünümü ---------- */
const durumlar = {};   // modül -> { ara, filtre, ay, adet }
const SAYFA_ADET = 60;

function bolumOlustur(cfg) {
  const s = document.createElement('section');
  s.id = 'v-' + cfg.id; s.className = 'gorunum'; s.hidden = true; s.dataset.modul = cfg.modul;
  s.innerHTML = `<div class="bek-yer"></div>
    <section class="ozet" aria-label="Özet"></section>
    <div class="arama"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" placeholder="${esc(cfg.araYazi)}" autocomplete="off" enterkeyhint="search"></div>
    <div class="filtre-satir"><nav class="filtreler"></nav><select class="ay-sec" aria-label="Dönem"></select></div>
    <ul class="liste"></ul><button class="daha" hidden></button><p class="bos" hidden>Kayıt bulunamadı.</p>
    ${cfg.ekle ? '<button class="fab" aria-label="Yeni kayıt" type="button"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>' : ''}`;
  $('#ana').insertBefore(s, null);
  return s;
}

function listeKur(cfg) {
  const d = durumlar[cfg.id] = { ara: '', filtre: cfg.filtreler ? cfg.filtreler[0][0] : '', ay: 'son', adet: SAYFA_ADET };
  const s = bolumOlustur(cfg), ul = $('.liste', s), daha = $('.daha', s), sec = $('.ay-sec', s), nav = $('.filtreler', s);
  const kartlar = [];
  cfg.cizim = () => {
    const tum = cfg.veri() || [];
    const aylar = cfg.aySec ? [...new Set(tum.map(x => ayAnahtar(x.t)).filter(Boolean))].sort().reverse() : [];
    const seciliAy = d.ay === 'son' ? (aylar[0] || 'tumu') : d.ay;
    if (cfg.aySec) {
      const imza = aylar.join();
      if (sec.dataset.imza !== imza) {
        sec.innerHTML = `<option value="tumu">Tüm dönemler</option>` + aylar.map(a => `<option value="${a}">${ayAdi(a)}</option>`).join('');
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
        c.classList.toggle('secili', c.dataset.k === d.filtre); c.querySelector('b').textContent = donem.filter(x => f(x)).length;
      });
    }
    if (!cfg.filtreler) nav.hidden = true;
    const f = cfg.filtreler ? cfg.filtreler.find(x => x[0] === d.filtre)[2] : () => true;
    const secili = donem.filter(x => f(x) && (!q || sade(cfg.ara(x)).includes(q)));
    modOzetCiz(s, cfg, secili, donem);
    const goster = secili.slice(0, d.adet);
    ul.innerHTML = goster.map((x, i) => `<li><button type="button" class="kart ${cfg.sinif ? cfg.sinif(x) : ''}" data-i="${i}">${cfg.satir(x)}</button></li>`).join('');
    ul._liste = goster;
    daha.hidden = secili.length <= goster.length; daha.textContent = `Daha fazla göster (${secili.length - goster.length})`;
    $('.bos', s).hidden = secili.length > 0;
    $('.bek-yer', s).innerHTML = bekleyenHtml(cfg.modul);
  };
  ul.addEventListener('click', e => {
    const b = e.target.closest('.kart'); if (!b || !cfg.detay) return;
    const x = ul._liste[+b.dataset.i]; if (x) detayAc(cfg, x);
  });
  daha.addEventListener('click', () => { d.adet += SAYFA_ADET; cfg.cizim(); });
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
    return `<div class="alan">${etiket}<div class="segment" id="${id}" style="grid-template-columns:repeat(${a.secenekler.length},minmax(0,1fr))">${a.secenekler.map(([v, ad]) =>
      `<button type="button" data-v="${esc(v)}" class="${String(vars) === String(v) ? 'secili' : ''}">${esc(ad)}</button>`).join('')}</div></div>`;
  }
  if (a.tur === 'sec') {
    return `<label class="alan">${etiket}<select id="${id}">${a.secenekler.map(([v, ad]) => `<option value="${esc(v)}"${String(a.varsayilan ?? '') === String(v) ? ' selected' : ''}>${esc(ad)}</option>`).join('')}</select></label>`;
  }
  const tip = { tarih: 'date', saat: 'time' }[a.tur] || 'text', mod = { tutar: 'decimal', sayi: 'numeric' }[a.tur] || '';
  const liste = a.liste ? `<datalist id="${id}-l">${a.liste.map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : '';
  return `<label class="alan">${etiket}<input id="${id}" type="${tip}" ${mod ? `inputmode="${mod}"` : ''} ${a.liste ? `list="${id}-l"` : ''} autocomplete="off"
    ${a.tur === 'tarih' ? `max="${bugunISO()}"` : ''} ${a.maks ? `maxlength="${a.maks}"` : ''} value="${esc(a.varsayilan ?? '')}" placeholder="${esc(a.ipucu || '')}">${liste}</label>`;
}

function formAc(cfg) {
  durum.acik = { tur: 'm:' + cfg.modul, form: true };
  $('#sayfa-icerik').innerHTML = `
    <div class="d-baslik">${cfg.geri ? '<button class="geri" id="fm-geri" type="button" aria-label="Geri">‹</button>' : ''}<div><h2>${esc(cfg.baslik)}</h2><p>${esc(cfg.alt || '')}</p></div></div>
    <form id="modul-form" novalidate>${cfg.alanlar.map(alanHtml).join('')}
      <div id="fm-onizleme-hesap" class="hesap" hidden></div>
      ${cfg.foto ? `<div class="alan"><span>${esc(cfg.foto)}</span>
        <div class="foto-sec"><label class="eylem">📷 Fotoğraf çek<input id="fm-kamera" type="file" accept="image/*" capture="environment" hidden></label>
        <label class="eylem">🖼 Galeriden seç<input id="fm-galeri" type="file" accept="image/*,application/pdf" hidden></label></div>
        <div id="fm-onizleme" class="onizleme" hidden></div></div>` : ''}
      <p id="fm-hata" class="hata" role="alert"></p>
      <button class="btn-ana" id="fm-gonder" type="submit"><span>Gönder</span><i class="yukleniyor"></i></button>
      <p class="not-kucuk">Kayıt masaüstü uygulamasına iletilir ve orada işlenir; işlenince listede görünür.</p>
    </form>`;
  const deger = k => { const el = $('#fm-' + k); return el.classList.contains('segment') ? el.querySelector('.secili')?.dataset.v : el.value; };
  const ayarla = (k, v) => { const el = $('#fm-' + k); if (el) el.value = v; };
  let dosya = null;
  const hesapYaz = () => { const h = cfg.hesap && cfg.hesap(deger), y = $('#fm-onizleme-hesap'); y.hidden = !h; y.innerHTML = h || ''; };
  $('#modul-form').addEventListener('click', e => {
    const b = e.target.closest('.segment button'); if (!b) return;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('secili', x === b));
    if (cfg.degisti) cfg.degisti(b.parentElement.id.slice(3), deger, ayarla); hesapYaz();
  });
  $('#modul-form').addEventListener('input', e => { if (cfg.degisti) cfg.degisti(e.target.id.slice(3), deger, ayarla); hesapYaz(); });
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
    try { veri = cfg.hazirla(deger); } catch (err) { hata.textContent = err.message; return; }
    if (cfg.onay && !confirm(cfg.onay(veri))) return;
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

/* ---------- Fatura ---------- */
const TEVKIFAT = [['0', 'Yok'], ['2', '2/10'], ['3', '3/10'], ['4', '4/10'], ['5', '5/10'], ['7', '7/10'], ['9', '9/10'], ['10', 'Tam (10/10)']];
function faturaForm() {
  const m = modVeri('fatura') || {};
  formAc({
    modul: 'fatura', islem: 'ekle', baslik: 'Yeni fatura', alt: 'Gelen = bize gelen (gider), Giden = bizim kestiğimiz (gelir)', foto: 'Fatura fotoğrafı (isteğe bağlı)',
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() }, { k: 'tip', etiket: 'Fatura tipi', tur: 'segment', secenekler: [['gelen', 'Gelen (gider)'], ['giden', 'Giden (gelir)']] },
      { k: 'no', etiket: 'Fatura no', tur: 'metin', zorunlu: true, maks: 64 }, { k: 'firma', etiket: 'Firma', tur: 'metin', zorunlu: true, maks: 120, liste: m.firmalar || [] },
      { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', maks: 200 }, { k: 'matrah', etiket: 'Matrah (₺)', tur: 'tutar', zorunlu: true, ipucu: '0' },
      { k: 'kdv', etiket: 'KDV oranı', tur: 'segment', secenekler: [['0', '%0'], ['1', '%1'], ['10', '%10'], ['20', '%20']], varsayilan: '20' },
      { k: 'tevkifat', etiket: 'Tevkifat', tur: 'sec', secenekler: TEVKIFAT, varsayilan: '0' }],
    hesap: d => {
      const t = tutarCoz(d('matrah')); if (!(t > 0)) return '';
      const kdv = t * (+d('kdv') / 100), tev = kdv * (+d('tevkifat') / 10);
      return `KDV ${TL(kdv)}${tev ? ` · Tevkifat ${TL(tev)}` : ''} · <b>Toplam ${TL(t + kdv - tev)}</b>`;
    },
    hazirla: d => ({ tarih: tarihAl(d('tarih')), tip: d('tip'), no: gerekli(d('no'), 'Fatura no'), firma: gerekli(d('firma'), 'Firma'), aciklama: d('aciklama').trim(),
                     matrah: (() => { const t = tutarCoz(d('matrah')); if (!(t > 0)) throw new Error('Geçerli bir matrah gir.'); return t; })(), kdv: +d('kdv'), tevkifat: +d('tevkifat') }),
    ozet: v => `Fatura ${v.no} · ${v.firma}`,
  });
}
const FATURA = {
  id: 'fatura', modul: 'fatura', araYazi: 'Firma, fatura no veya açıklama ara', aySec: true, ekle: faturaForm,
  veri: () => (modVeri('fatura') || {}).kayitlar, ara: x => `${x.firma} ${x.no} ${x.ac}`,
  filtreler: [['hepsi', 'Tümü', () => true], ['gelen', 'Gelen', x => x.tip === 'gelen'], ['giden', 'Giden', x => x.tip === 'giden']],
  kartlar: l => {
    const gelir = topla(l.filter(x => x.tip === 'giden'), x => x.top), gider = topla(l.filter(x => x.tip === 'gelen'), x => x.top);
    return [{ ad: 'Gelir (giden)', deger: gelir, bicim: TL, ton: 'yesil' }, { ad: 'Gider (gelen)', deger: gider, bicim: TL, ton: 'kehribar' },
            { ad: 'Fark', deger: gelir - gider, bicim: TL, ton: 'mor' }, { ad: 'Fatura sayısı', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mavi' }];
  },
  satir: x => satirHtml(esc(x.firma || x.no), `${esc(trGoster(x.t))} · ${esc(x.no)}`, TL(x.top), rozet(x.tip === 'gelen' ? 'Gelen' : 'Giden', x.tip === 'gelen' ? 'bekliyor' : 'odendi')),
  detay: x => `<div class="d-baslik"><div><h2>${esc(x.firma)}</h2><p>${esc(trGoster(x.t))} · ${x.tip === 'gelen' ? 'Gelen' : 'Giden'} fatura</p></div></div>
    <div class="d-ucluk"><div><small>Matrah</small><strong>${TL(x.mat)}</strong></div><div class="k"><small>KDV %${SAYI(x.kdvo)}</small><strong>${TL(x.kdv)}</strong></div><div class="y"><small>Toplam</small><strong>${TL(x.top)}</strong></div></div>
    ${alanSatir('Fatura no', esc(x.no))}${alanSatir('Açıklama', esc(x.ac))}${alanSatir('Tevkifat', x.tevt ? `${esc(x.tev)} · ${TL(x.tevt)}` : '')}`,
};

/* ---------- Araç ---------- */
const belgeDurum = b => { const g = gunFarki(b.son); return g === null ? null : { g, ton: g < 0 ? 'bekliyor' : g <= 30 ? 'kismi' : 'odendi' }; };
const gunYazi = g => g < 0 ? `${-g} gün geçti` : g === 0 ? 'bugün' : `${g} gün kaldı`;
function aracEnYakin(a) {
  return a.belgeler.map(b => ({ b, d: belgeDurum(b) })).filter(x => x.d).sort((p, q) => p.d.g - q.d.g)[0] || null;
}
function aracForm(a) {
  const geri = () => { durum.acik = { tur: 'm:arac', id: a.id, form: false }; CFG.arac.detayYaz(); };
  formAc({
    modul: 'arac', islem: 'bakim', baslik: 'Bakım / harcama ekle', alt: a.plaka, geri, foto: 'Fiş / fatura fotoğrafı (isteğe bağlı)',
    alanlar: [{ k: 'tur', etiket: 'Kayıt türü', tur: 'segment', secenekler: [['bakim', 'Tamir-bakım'], ['harcama', 'Diğer harcama']] },
      { k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() }, { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', zorunlu: true, maks: 200 },
      { k: 'tutar', etiket: 'Parça / tutar (₺)', tur: 'tutar', ipucu: '0' }, { k: 'iscilik', etiket: 'İşçilik (₺, yalnız bakımda)', tur: 'tutar', ipucu: '0' }],
    hazirla: d => ({ arac_id: a.id, tur: d('tur'), tarih: tarihAl(d('tarih')), aciklama: gerekli(d('aciklama'), 'Açıklama'),
                     tutar: tutarAl(d('tutar'), 'Tutar', true), iscilik: d('tur') === 'bakim' ? tutarAl(d('iscilik'), 'İşçilik', true) : 0 }),
    ozet: v => `${a.plaka} · ${v.aciklama}`,
  });
}
const ARAC = {
  id: 'arac', modul: 'arac', araYazi: 'Plaka, marka, firma veya şoför ara', veri: () => (modVeri('arac') || {}).araclar, ara: a => `${a.plaka} ${a.marka} ${a.model} ${a.firma} ${a.sofor}`,
  filtreler: [['hepsi', 'Tümü', () => true], ['dolmus', 'Süresi geçmiş', a => a.belgeler.some(b => (belgeDurum(b) || {}).ton === 'bekliyor')],
              ['yakin', '30 gün içinde', a => a.belgeler.some(b => (belgeDurum(b) || {}).ton === 'kismi')]],
  kartlar: l => [{ ad: 'Araç', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mor' },
    { ad: 'Firma', deger: new Set(l.map(a => a.firma)).size, bicim: v => String(Math.round(v)), ton: 'mavi' },
    { ad: 'Süresi geçmiş belge', deger: topla(l, a => a.belgeler.filter(b => (belgeDurum(b) || {}).ton === 'bekliyor').length), bicim: v => String(Math.round(v)), ton: 'kehribar' },
    { ad: '30 gün içinde', deger: topla(l, a => a.belgeler.filter(b => (belgeDurum(b) || {}).ton === 'kismi').length), bicim: v => String(Math.round(v)), ton: 'yesil' }],
  satir: a => { const e = aracEnYakin(a); return satirHtml(esc(a.plaka), `${esc([a.marka, a.model, a.yil].filter(Boolean).join(' '))}${a.firma ? ' · ' + esc(a.firma) : ''}`,
    e ? esc(gunYazi(e.d.g)) : '—', e ? rozet(e.b.ad, e.d.ton) : ''); },
  ekle: null,
  detay: a => `<div class="d-baslik"><div><h2>${esc(a.plaka)}</h2><p>${esc([a.marka, a.model, a.yil].filter(Boolean).join(' '))} · ${esc(a.firma)}</p></div></div>
    <button class="btn-ana" id="ar-ekle" type="button" ${durum.izinler.includes('arac') ? '' : 'hidden'}>+ Bakım / harcama ekle</button>
    ${alanSatir('Şoför', esc(a.sofor && a.sofor !== '-' ? a.sofor : ''))}${a.sofor_tel ? alanSatir('Şoför telefonu', `<a href="tel:${esc(a.sofor_tel.replace(/[^\d+]/g, ''))}">${esc(a.sofor_tel)}</a>`) : ''}
    ${alanSatir('Yakıt', esc(a.yakit))}${alanSatir('Kilometre', esc(a.km))}
    <h3 class="d-sec">Belgeler ve bakım</h3>
    ${a.belgeler.length ? `<ul class="belge-liste">${a.belgeler.map(b => { const d = belgeDurum(b); return `<li><div><b>${esc(b.ad)}</b><small>${b.bakim ? 'Son: ' + esc(b.t) + ' · Sonraki: ' : 'Bitiş: '}${esc(b.son)}</small></div>${d ? rozet(gunYazi(d.g), d.ton) : ''}</li>`; }).join('')}</ul>` : '<p class="z-alt">Kayıtlı belge yok.</p>'}
    <h3 class="d-sec">Tamir-bakım ve harcamalar</h3>
    ${a.bakimlar.length ? `<ul class="zaman">${a.bakimlar.map(b => `<li><div class="z-ust"><span>${esc(b.ac)}</span><span>${TL(b.tutar + b.isc)}</span></div>
      <div class="z-alt">${esc(trGoster(b.t))} · ${b.tur === 'bakim' ? 'Bakım' : 'Harcama'}${b.isc ? ` · İşçilik ${TL(b.isc)}` : ''}</div></li>`).join('')}</ul>` : '<p class="z-alt">Kayıt yok.</p>'}
    ${a.yaglar.length ? `<h3 class="d-sec">Yağ bakımları</h3><ul class="zaman">${a.yaglar.map(y => `<li><div class="z-ust"><span>${esc(y.yag)}${y.lt ? ' · ' + esc(y.lt) + (/lt/i.test(y.lt) ? '' : ' lt') : ''}</span><span>${esc(y.t)}</span></div><div class="z-alt">${esc(y.usta)}${y.not ? ' · ' + esc(y.not) : ''}</div></li>`).join('')}</ul>` : ''}`,
  detayBagla: (a, kok) => { const b = $('#ar-ekle', kok); if (b) b.addEventListener('click', () => aracForm(a)); },
};

/* ---------- Esnaf ---------- */
function esnafForm(e, odeme) {
  const plakalar = (modVeri('esnaf') || {}).plakalar || [];
  const geri = () => { durum.acik = { tur: 'm:esnaf', id: e.id, form: false }; CFG.esnaf.detayYaz(); };
  const alanlar = odeme ? [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() }, { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', maks: 200, varsayilan: 'Nakit/EFT Ödeme' },
    { k: 'tutar', etiket: 'Ödenen tutar (₺)', tur: 'tutar', zorunlu: true, ipucu: '0' }]
    : [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() }, { k: 'plaka', etiket: 'Araç plakası', tur: 'metin', maks: 20, liste: plakalar },
      { k: 'aciklama', etiket: 'İşlem tipi / açıklama', tur: 'metin', zorunlu: true, maks: 200 }, { k: 'tutar', etiket: 'Parça / tutar (₺)', tur: 'tutar', ipucu: '0' },
      { k: 'iscilik', etiket: 'İşçilik (₺)', tur: 'tutar', ipucu: '0' }];
  formAc({
    modul: 'esnaf', islem: 'islem', baslik: odeme ? 'Ödeme yap' : 'İşlem ekle', alt: e.isim, geri, alanlar, foto: 'Fiş / dekont fotoğrafı (isteğe bağlı)',
    hesap: odeme ? null : d => { const t = tutarCoz(d('tutar') || '0') + tutarCoz(d('iscilik') || '0'); return t > 0 ? `<b>Toplam ${TL(t)}</b>` : ''; },
    hazirla: d => odeme ? { esnaf_id: e.id, odeme: true, tarih: tarihAl(d('tarih')), aciklama: d('aciklama').trim(), tutar: (() => { const t = tutarCoz(d('tutar')); if (!(t > 0)) throw new Error('Geçerli bir tutar gir.'); return t; })() }
      : { esnaf_id: e.id, odeme: false, tarih: tarihAl(d('tarih')), plaka: d('plaka').trim(), aciklama: gerekli(d('aciklama'), 'Açıklama'), tutar: tutarAl(d('tutar'), 'Tutar', true), iscilik: tutarAl(d('iscilik'), 'İşçilik', true) },
    ozet: v => `${e.isim} · ${v.odeme ? 'Ödeme ' + TL(v.tutar) : v.aciklama}`,
  });
}
const ESNAF = {
  id: 'esnaf', modul: 'esnaf', araYazi: 'Esnaf ara', veri: () => (modVeri('esnaf') || {}).esnaflar, ara: e => e.isim,
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
      <div class="z-alt">${esc(trGoster(i.t))}${i.plaka && i.plaka !== '-' ? ' · ' + esc(i.plaka) : ''}${i.isc ? ` · İşçilik ${TL(i.isc)}` : ''}</div></li>`).join('')}</ul>` : '<p class="z-alt">İşlem yok.</p>'}`,
  detayBagla: (e, kok) => { $('#es-islem', kok)?.addEventListener('click', () => esnafForm(e, false)); $('#es-odeme', kok)?.addEventListener('click', () => esnafForm(e, true)); },
};

/* ---------- Akaryakıt ---------- */
function petrolForm() {
  const m = modVeri('petrol') || { araclar: [], istasyonlar: [] };
  formAc({
    modul: 'petrol', islem: 'ekle', baslik: 'Akaryakıt kaydı', alt: 'Litre × birim fiyat = tutar (tutarı elle de girebilirsin)', foto: 'Fiş fotoğrafı (isteğe bağlı)',
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() },
      { k: 'plaka', etiket: 'Araç plakası', tur: 'metin', zorunlu: true, maks: 20, liste: m.araclar.map(a => a.plaka), ipucu: 'Listeden seç ya da yaz' },
      { k: 'istasyon', etiket: 'İstasyon', tur: 'metin', zorunlu: true, maks: 60, liste: m.istasyonlar.map(i => i.ad) },
      { k: 'litre', etiket: 'Litre', tur: 'tutar', ipucu: '0' }, { k: 'fiyat', etiket: 'Birim fiyat (₺)', tur: 'tutar', ipucu: '0' },
      { k: 'tutar', etiket: 'Tutar (₺)', tur: 'tutar', ipucu: '0' }, { k: 'fis_no', etiket: 'Fiş no (isteğe bağlı)', tur: 'metin', maks: 40 },
      { k: 'aciklama', etiket: 'Not (isteğe bağlı)', tur: 'metin', maks: 200 }],
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
      return { tarih: tarihAl(d('tarih')), arac_id: arac ? arac.id : '', plaka, istasyon: gerekli(d('istasyon'), 'İstasyon'), litre, fiyat, tutar, fis_no: d('fis_no').trim(), aciklama: d('aciklama').trim() };
    },
    ozet: v => `${v.plaka} · ${v.istasyon} · ${TL(v.tutar)}`,
  });
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
    ${alanSatir('Fiş no', esc(x.fis))}${alanSatir('Not', esc(x.ac))}`,
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
function icForm() {
  const m = modVeri('ic_hizmet') || { guzergahlar: [], soforler: [], yerler: [], plakalar: [] };
  formAc({
    modul: 'ic_hizmet', islem: 'ekle', baslik: 'Yeni sefer', alt: 'Sefer ücreti güzergah fiyatından alınır', foto: 'Fiş fotoğrafı (isteğe bağlı)',
    alanlar: [{ k: 'tarih', etiket: 'Tarih', tur: 'tarih', varsayilan: bugunISO() }, { k: 'saat', etiket: 'Saat', tur: 'saat', varsayilan: `${p2(new Date().getHours())}:${p2(new Date().getMinutes())}` },
      { k: 'plaka', etiket: 'Plaka', tur: 'metin', zorunlu: true, maks: 20, liste: m.plakalar },
      { k: 'sofor', etiket: 'Şoför', tur: 'metin', maks: 80, liste: m.soforler },
      { k: 'personel', etiket: 'Personel', tur: 'metin', zorunlu: true, maks: 300, ipucu: 'Adlar virgülle ayrılır' },
      { k: 'guzergah', etiket: 'Güzergah', tur: 'sec', secenekler: SIFIR_SEC.concat(m.guzergahlar.map(g => [g.ad, `${g.ad} · ${TL(g.fiyat)}`])) },
      { k: 'yer', etiket: 'Gidilen yer', tur: 'metin', zorunlu: true, maks: 80, liste: m.yerler },
      { k: 'kisi', etiket: 'Kişi sayısı', tur: 'sayi', varsayilan: '1' }, { k: 'tutar', etiket: 'Sefer ücreti (₺)', tur: 'tutar', ipucu: 'Güzergahtan gelir' },
      { k: 'fis_no', etiket: 'Fiş no', tur: 'metin', zorunlu: true, maks: 40 }, { k: 'aciklama', etiket: 'Açıklama', tur: 'metin', maks: 200 }],
    degisti: (k, d, ayarla) => { if (k === 'guzergah') { const g = m.guzergahlar.find(x => x.ad === d('guzergah')); if (g) ayarla('tutar', String(g.fiyat).replace('.', ',')); } },
    hazirla: d => {
      const g = gerekli(d('guzergah'), 'Güzergah'), kisi = parseInt(d('kisi'), 10);
      if (!(kisi >= 1)) throw new Error('Kişi sayısı geçersiz.');
      return { tarih: tarihAl(d('tarih')), saat: d('saat'), plaka: gerekli(d('plaka'), 'Plaka'), sofor: d('sofor').trim(), personel: gerekli(d('personel'), 'Personel'),
               guzergah: g, yer: gerekli(d('yer'), 'Gidilen yer'), kisi, tutar: tutarAl(d('tutar'), 'Sefer ücreti', true), fis_no: gerekli(d('fis_no'), 'Fiş no'), aciklama: d('aciklama').trim() };
    },
    ozet: v => `${v.plaka} · ${v.guzergah} · fiş ${v.fis_no}`,
  });
}
const IC = {
  id: 'ic_hizmet', modul: 'ic_hizmet', araYazi: 'Plaka, personel, güzergah veya fiş no ara', aySec: true, ekle: icForm,
  veri: () => (modVeri('ic_hizmet') || {}).seferler, ara: x => `${x.plaka} ${x.sofor} ${x.personel} ${x.guz} ${x.yer} ${x.fis} ${x.ac}`,
  kartlar: l => [{ ad: 'Sefer ücreti', deger: topla(l, x => x.tutar), bicim: TL, ton: 'kehribar' }, { ad: 'Sefer', deger: l.length, bicim: v => String(Math.round(v)), ton: 'mor' },
    { ad: 'Kişi', deger: topla(l, x => x.kisi), bicim: v => String(Math.round(v)), ton: 'mavi' }, { ad: 'Araç', deger: new Set(l.map(x => x.plaka)).size, bicim: v => String(Math.round(v)), ton: 'yesil' }],
  satir: x => satirHtml(esc(x.guz || x.yer), `${esc(trGoster(x.t))} ${esc(x.saat)} · ${esc(x.plaka)}`, TL(x.tutar), `${x.kisi} kişi · fiş ${esc(x.fis)}`),
  detay: x => `<div class="d-baslik"><div><h2>${esc(x.guz)}</h2><p>${esc(trGoster(x.t))} ${esc(x.saat)} · ${esc(x.yer)}</p></div></div>
    <div class="d-ucluk"><div><small>Plaka</small><strong>${esc(x.plaka)}</strong></div><div><small>Kişi</small><strong>${x.kisi}</strong></div><div class="k"><small>Ücret</small><strong>${TL(x.tutar)}</strong></div></div>
    ${alanSatir('Şoför', esc(x.sofor))}${alanSatir('Personel', esc(x.personel))}${alanSatir('Fiş no', esc(x.fis))}${alanSatir('Sıra no', esc(x.sira))}${alanSatir('Açıklama', esc(x.ac))}`,
    };

/* ---------- Ana Sayfa ---------- */
const anaDurum = { hepsi: false };
document.addEventListener('click', e => { if (e.target.closest('#dik-daha')) { anaDurum.hepsi = !anaDurum.hepsi; anaCiz(); } });
function anaCiz() {
  const s = $('#v-dashboard'); if (!s) return;
  const v = modVeri('dashboard');
  if (!v) { s.innerHTML = '<p class="bos">Veri bekleniyor…</p>'; return; }
  const bu = v.bu_ay, maks = Math.max(1, ...v.aylik.map(a => Math.max(a.gelir, a.gider, 0)));
  const belgeler = v.belgeler.map(b => ({ ...b, g: gunFarki(b.son) })).filter(b => b.g !== null && b.g <= 30).sort((a, b) => a.g - b.g);
  const bar = (a, i) => { const h1 = Math.max(0, a.gelir) / maks * 100, h2 = Math.max(0, a.gider) / maks * 100;
    return `<div class="b-grup" title="${esc(ayAdi(a.ay))}: gelir ${TL(a.gelir)}, gider ${TL(a.gider)}"><div class="b-cift"><i class="gelir" style="height:${h1}%;animation-delay:${i * 40}ms"></i><i class="gider" style="height:${h2}%;animation-delay:${i * 40 + 20}ms"></i></div><small>${AYLAR[+a.ay.slice(5) - 1].slice(0, 3)}</small></div>`; };
  s.innerHTML = `<section class="ozet"><div class="ozet-kart" data-tone="yesil"><small>${esc(ayAdi(bu.ay))} gelir</small><strong>${TLK(bu.gelir)}</strong></div>
    <div class="ozet-kart" data-tone="kehribar"><small>${esc(ayAdi(bu.ay))} gider</small><strong>${TLK(bu.gider)}</strong></div>
    <div class="ozet-kart" data-tone="mor"><small>Fark</small><strong>${TLK(bu.gelir - bu.gider)}</strong></div>
    <div class="ozet-kart" data-tone="mavi"><small>Esnaf borcu</small><strong>${TLK(v.esnaf_borc)}</strong></div>
    <div class="ozet-kart" data-tone="mor"><small>Araç sayısı</small><strong>${v.arac_sayisi}</strong></div>
    <div class="ozet-kart" data-tone="${belgeler.length ? 'kehribar' : 'yesil'}"><small>Dikkat gerektiren belge</small><strong>${belgeler.length}</strong></div></section>
    <h3 class="d-sec">Son 12 ay</h3><div class="grafik">${v.aylik.map(bar).join('')}</div>
    <div class="lejant"><span><i class="gelir"></i>Gelir</span><span><i class="gider"></i>Gider</span></div>
    <h3 class="d-sec">Dikkat edilmesi gerekenler <b class="sayi-rozet">${belgeler.length}</b></h3>
    ${belgeler.length ? `<ul class="belge-liste">${(anaDurum.hepsi ? belgeler : belgeler.slice(0, 6)).map(b => `<li><div><b>${esc(b.plaka)} · ${esc(b.ad)}</b><small>${esc(b.firma)} · ${esc(b.son)}</small></div>${rozet(gunYazi(b.g), b.g < 0 ? 'bekliyor' : 'kismi')}</li>`).join('')}</ul>
      ${belgeler.length > 6 ? `<button class="daha" id="dik-daha" type="button">${anaDurum.hepsi ? 'Daha az göster' : `Tümünü göster (${belgeler.length - 6} daha)`}</button>` : ''}` : '<p class="z-alt">Süresi dolan ya da 30 gün içinde dolacak belge yok. 🎉</p>'}
    ${v.istasyonlar.length ? `<h3 class="d-sec">İstasyon bakiyeleri</h3><div class="ist-sirasi">${v.istasyonlar.map(i => `<div class="ist"><small>${esc(i.ad)}</small><strong>${TL(i.bakiye)}</strong></div>`).join('')}</div>` : ''}`;
}

const CFG = { fatura: FATURA, arac: ARAC, esnaf: ESNAF, petrol: PETROL, ic_hizmet: IC };

// uygulama.js başlarken bir kez: modül sayfalarını oluşturur
function modulleriKur() {
  const a = document.createElement('section');
  a.id = 'v-dashboard'; a.className = 'gorunum'; a.hidden = true; a.dataset.modul = 'dashboard';
  $('#ana').append(a);
  Object.values(CFG).forEach(listeKur);
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
