/* Okul Yönetimi: masaüstündeki sekmeler, sütun başlıkları, filtreler ve özetlerle aynı.
   uygulama.js'ten önce yüklenir; ortak yardımcıları (esc, sade, TL, formAc, ...) yalnızca çağrı anında kullanır. */
const OK = { sekme: 'ogr', tah: 'rapor', q: { ogr: '', yok: '', srv: '', tah: '', ind: '' }, sinif: '', servis: '', tServis: '', goster: 'hepsi', iGoster: 'hepsi', yontem: 'hepsi', acik: new Set() };
const OK_SEKMELER = [['ogr', 'Öğrenciler'], ['yok', 'Servis Kullanmayanlar'], ['srv', 'Servisler'], ['tah', 'Tahsilat Raporu']];
const OK_ALT = [['rapor', 'Tahsilat Raporu'], ['ind', 'İndirim / Kayıp Analizi']];
const OK_GOSTER = [['hepsi', 'Ödeyenler + Ödemeyenler'], ['tam', 'Tam Ödeyenler'], ['kismi', 'Kısmi Ödeyenler'], ['hic', 'Hiç Ödemeyenler']];
const OK_GOSTER_DURUM = { tam: 'odendi', kismi: 'kismi', hic: 'bekliyor' };
const OK_YONTEM = [['hepsi', 'Tüm Yöntemler'], ['nakit', 'Nakit'], ['iban', 'IBAN'], ['havale', 'Havale'], ['kart', 'Kredi Kartı'], ['coklu', 'Birden Fazla Yöntem'], ['pesin', 'Peşin Ödeyenler (2. dönem dahil)']];
const OK_ATANMAMIS = '__atanmamis__';
const OK_IPUCU = { ogr: 'Ad, Tel, Sınıf ara...', yok: 'Ad, sınıf, tel, adres ara...', srv: 'Şoför, plaka, güzergah ara...', tah: 'Ad, tel, adres ara...', ind: 'Ad, tel, adres ara...' };

/* ---------- ortak yardımcılar ---------- */
const okTum = () => [...durum.veri.ogrenciler, ...durum.veri.atanmamis];
const okOgr = id => okTum().find(x => x.id === id);
const okPlaka = p => String(p || '').replace(/\s/g, '').toUpperCase();
// Masaüstü sıralaması: son sözcük soyad; önce soyad, sonra ad
const okSoyad = ad => { const p = sade(ad).trim().split(/\s+/); const s = p.pop() || ''; return s + ' ' + p.join(' '); };
const okSirala = (a, b) => okSoyad(a.ad).localeCompare(okSoyad(b.ad), 'tr');
// Masaüstü aramasıyla aynı kural: kelimeler sıra bağımsız ve hepsi geçmeli; rakamlar baştaki 0 olsun olmasın telefonlarda aranır
const okAra = (q, metin, teller = []) => {
  q = sade(String(q || '').trim()); if (!q) return true;
  const temiz = s => s.replace(/[^0-9a-z\s]/g, ' ');
  const hay = temiz(sade(metin));
  if (temiz(q).split(/\s+/).filter(Boolean).every(p => hay.includes(p))) return true;
  const r = q.replace(/\D/g, ''), tel = teller.join(' ').replace(/\D/g, '');
  return r.length >= 3 && (tel.includes(r) || (r[0] === '0' && tel.includes(r.slice(1))));
};
const okTel = t => { const d = String(t || '').replace(/[^\d+]/g, ''); return d ? `<a href="tel:${esc(d)}">${esc(t)}</a>` : ''; };
const okPara = n => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const okTelleri = o => [o.tel, o.ogr_tel, o.veli_tel, o.baba_tel, o.anne_tel];
const okTarihMs = s => { const d = trParse(s); return d ? d.getTime() : 0; };
const okSonOdeme = o => { let en = null, t = -1; for (const g of o.odemeler || []) { if (!(g.tutar > 0)) continue; const n = okTarihMs(g.tarih); if (n > t) { t = n; en = g; } } return en; };
const okGoreceli = s => { const g = gunFarki(s); return g === null ? '' : g === 0 ? 'Bugün' : g === -1 ? 'Dün' : g < 0 ? `${-g} gün önce` : `${g} gün sonra`; };
const okYontemAnahtar = y => { const s = sade(y); return s.includes('nakit') ? 'nakit' : s.includes('iban') ? 'iban' : s.includes('havale') ? 'havale' : s.includes('kart') ? 'kart' : 'diger'; };
const okTarihSinif = s => { const g = gunFarki(s); return g === null ? '' : g < 0 ? 'tarih-koyu' : g <= 7 ? 'tarih-kirmizi' : g <= 30 ? 'tarih-kehribar' : ''; };
const okKey = () => OK.sekme === 'tah' ? (OK.tah === 'rapor' ? 'tah' : 'ind') : OK.sekme;

/* ---------- tablolar: her sekme için sütunlar + satırlar + özet (ekran, Excel ve PDF aynı veriyi kullanır) ---------- */
function okOgrTablo() {
  const l = okTum().filter(o => (!OK.sinif || o.sinif === OK.sinif)
    && (!OK.servis || (OK.servis === OK_ATANMAMIS ? !o.plaka : okPlaka(o.plaka) === okPlaka(OK.servis)))
    && okAra(OK.q.ogr, `${o.ad} ${o.veli} ${o.sinif} ${o.plaka} ${okPlaka(o.plaka)} ${o.adres}`, [...okTelleri(o), o.tc])).sort(okSirala);
  const odeyen = l.filter(o => o.odenen > 0);
  return {
    baslik: 'Öğrenciler', dosya: 'ogrenciler', ad: 1, tel: [2, 5, 6, 7], ac: true,
    kol: ['S.NO', 'ADI SOYADI', 'ÖĞ. TEL', 'VELİ ADI/MESLEK', 'VELİ TC KİMLİĞİ', 'VELİ TEL', 'BABA TEL', 'ANNE TEL', 'SINIFI', 'SERVİS (PLAKA)', 'ADRES', 'DÖNEM ÜCRETİ (₺)', 'ÖDEME DURUMU'],
    sat: l.map((o, i) => { const s = okSonOdeme(o); return { id: o.id, h: [i + 1, o.ad, o.ogr_tel, o.veli, o.tc, o.veli_tel, o.baba_tel, o.anne_tel, o.sinif, o.plaka, o.adres, TL(o.ucret), s ? s.tarih : 'Bekliyor'] }; }),
    ozet: [[[`Toplam: ${l.length} Öğrenci`, 'kalin'], [`Ödendi: ${odeyen.length}`, 'yesil'], [`Bekliyor: ${l.length - odeyen.length}`, 'kehribar']],
      [[`Bu Ay Tahsilat: ${TL(topla(l, o => o.odenen))}`, 'mor'], [`Ödeyenlerin Dönem Ücreti: ${TL(topla(odeyen, o => o.ucret))}`, 'soluk']]],
  };
}

function okYokTablo() {
  const l = durum.veri.servis_yok.filter(o => okAra(OK.q.yok, `${o.ad} ${o.sinif} ${o.adres}`, okTelleri(o))).sort(okSirala);
  return {
    baslik: 'Servis Kullanmayanlar', dosya: 'servis_kullanmayanlar', ad: 1, tel: [3, 5], yok: true,
    kol: ['S.NO', 'ADI SOYADI', 'SINIF', 'ÖĞ. TEL', 'VELİ ADI', 'VELİ TEL', 'ADRES'],
    sat: l.map((o, i) => ({ id: o.id, h: [i + 1, o.ad, o.sinif, o.ogr_tel, o.veli, o.veli_tel, o.adres] })),
    ozet: [[[`Toplam: ${l.length} öğrenci servis kullanmıyor`, 'kalin']]],
  };
}

function okSrvTablo() {
  const v = durum.veri;
  const l = v.servisler.filter(s => okAra(OK.q.srv, `${s.sofor} ${s.plaka} ${okPlaka(s.plaka)} ${s.guz} ${s.no} ${s.tip} ${s.sahip}`, [s.tel]));
  const bel = (s, ad) => (s.belgeler.find(b => b.ad === ad) || {}).son || '';
  return {
    baslik: 'Servisler', dosya: 'servisler', ad: 4, tel: [3], avatarsiz: true, renk: j => (j >= 9 && j <= 11 ? okTarihSinif : null),
    kol: ['S.NO', 'ARAÇ NO', 'ŞOFÖR ADI SOYADI', 'ŞOFÖR TEL', 'PLAKA', 'ARAÇ TİPİ/KAPASİTESİ', 'GÜZERGAH/BÖLGE', 'ÖĞ. SAYISI', 'ARAÇ SAHİBİ', 'SİGORTA BİT.', 'MUAYENE BİT.', 'KOLTUK SİG. BİT.', 'SINIF GRUBU'],
    sat: l.map((s, i) => {
      const og = v.ogrenciler.filter(o => okPlaka(o.plaka) === okPlaka(s.plaka)).sort((a, b) => (a.servis_sira - b.servis_sira) || okSirala(a, b));
      const anahtar = s.id || s.plaka;
      const ek = `<details class="ok-ogrler" data-srv="${esc(anahtar)}"${OK.acik.has(anahtar) ? ' open' : ''}><summary>${og.length} öğrenci</summary>${og.length
        ? `<ul>${og.map(o => `<li>${esc(o.ad)}  |  ${esc(o.sinif)}  |  ${esc(String(o.adres || '').length > 28 ? o.adres.slice(0, 28) + '...' : o.adres || '')}</li>`).join('')}</ul>` : ''}</details>`;
      return { id: anahtar, ek, h: [i + 1, s.no, s.sofor, s.tel, s.plaka, s.tip, s.guz, SAYI(s.ogr), s.sahip, bel(s, 'Sigorta'), bel(s, 'Muayene'), bel(s, 'Koltuk sigortası'), s.kademe] };
    }),
    ozet: [[[`Toplam: ${l.length} araç`, 'kalin'], [`Servis Kullanan: ${v.ogrenciler.length} öğrenci`, 'yesil'], [`Araca Atanmamış: ${v.atanmamis.length} öğrenci`, 'kehribar'], [`Servis Kullanmayan: ${v.servis_yok.length} öğrenci`, 'soluk']]],
  };
}

function okTahTablo() {
  const v = durum.veri;
  let taban = OK.tServis === OK_ATANMAMIS ? v.atanmamis : OK.tServis ? v.ogrenciler.filter(o => okPlaka(o.plaka) === okPlaka(OK.tServis)) : v.ogrenciler;
  const gd = OK_GOSTER_DURUM[OK.goster];
  taban = taban.filter(o => (!gd || o.durum === gd) && okAra(OK.q.tah, `${o.ad} ${o.adres}`, okTelleri(o)));
  const yon = new Map(taban.map(o => {
    const m = {}; (o.odemeler || []).forEach(g => { if (g.tutar > 0) { const k = okYontemAnahtar(g.yontem); m[k] = (m[k] || 0) + g.tutar; } });
    return [o.id, m];
  }));
  const kpi = ['nakit', 'iban', 'havale', 'kart'].map(k => {
    const ogr = taban.filter(o => yon.get(o.id)[k] !== undefined);
    return { k, ad: OK_YONTEM.find(y => y[0] === k)[1], n: ogr.length, tutar: topla(ogr, o => yon.get(o.id)[k]) };
  });
  const coklu = taban.filter(o => Object.keys(yon.get(o.id)).length > 1).length;
  const l = taban.filter(o => OK.yontem === 'hepsi' || (OK.yontem === 'coklu' ? Object.keys(yon.get(o.id)).length > 1
    : OK.yontem === 'pesin' ? o.pesin : yon.get(o.id)[OK.yontem] !== undefined))
    .sort((a, b) => { const ta = okSonOdeme(a), tb = okSonOdeme(b); return (tb ? okTarihMs(tb.tarih) : -1) - (ta ? okTarihMs(ta.tarih) : -1) || okSirala(a, b); });
  const say = d => l.filter(o => o.durum === d).length;
  const kart = (ton, ad, d) => `<div class="ozet-kart" data-tone="${ton}"><small>${esc(ad)}</small><strong>${esc(d)}</strong></div>`;
  const ek = `<section class="ozet" aria-label="Özet">${kart('mavi', 'Servis Öğrencisi', String(l.length))}${kart('yesil', 'Tahsil Edilen', TL(topla(l, o => o.odenen)))}
    ${kart('yesil', 'Tam Ödeyen', String(say('odendi')))}${kart('kehribar', 'Kısmi Ödeyen', String(say('kismi')))}${kart('kirmizi', 'Hiç Ödemeyen', String(say('bekliyor')))}
    ${kart('mor', 'Tahsil Edilenlerden Kalan Alacak', TL(topla(l, o => o.kalan)))}</section>
    <section class="ozet" aria-label="Ödeme yöntemleri">${kpi.map(x => `<button type="button" class="ozet-kart ok-kpi${OK.yontem === x.k ? ' secili' : ''}" data-y="${x.k}" aria-pressed="${OK.yontem === x.k}">
      <small>${esc(x.ad)}</small><strong>${TL(x.tutar)}</strong><span>${x.n} öğrenci</span></button>`).join('')}</section>
    ${coklu ? `<button type="button" class="ok-not-btn" data-y="coklu">${coklu} öğrenci birden fazla yöntemle ödeme yaptı, bu yüzden her kartta ayrı sayıldı. Karta tıkla → o yöntemle ödeyenleri gör. Buraya tıkla → bu ${coklu} öğrenciyi gör.</button>`
      : '<p class="z-alt ok-not">Karta tıkla → o yöntemle ödeyen öğrencileri gör.</p>'}`;
  return {
    baslik: 'Tahsilat Raporu', dosya: 'tahsilat_raporu', ad: 1, ac: true, ek,
    kol: ['S.No', 'Adı Soyadı', 'Sınıf', 'Servis (Plaka)', 'Son Ödeme', 'Ödenen Tutar'],
    sat: l.map((o, i) => { const s = okSonOdeme(o); return { id: o.id, h: [i + 1, o.ad, o.sinif, o.plaka, s ? `${s.tarih}  (${okGoreceli(s.tarih)})` : '', s ? TL(s.tutar) : '—'] }; }),
    ozet: [[[`Servis Öğrencisi: ${l.length}`, 'kalin'], [`Tam Ödeyen: ${say('odendi')}`, 'yesil'], [`Kısmi Ödeyen: ${say('kismi')}`, 'kehribar'], [`Hiç Ödemeyen: ${say('bekliyor')}`, 'kirmizi'],
      [`Tahsil Edilen: ${TL(topla(l, o => o.odenen))}`, 'mor'], [`Tahsil Edilenlerden Kalan Alacak: ${TL(topla(l, o => o.kalan))}`, 'soluk']]],
    ozetGizli: true,
  };
}

function okIndTablo() {
  const gd = OK_GOSTER_DURUM[OK.iGoster];
  // Masaüstündeki İndirim / Kayıp Analizi ile aynı hesap: normal fiyat girilmemişse dönemlik ücret alınır; indirim = normal − dönemlik
  const sat = durum.veri.ogrenciler.filter(o => (!gd || o.durum === gd) && okAra(OK.q.ind, `${o.ad} ${o.adres}`, okTelleri(o)))
    .map(o => { const normal = o.normal > 0 ? o.normal : o.ucret; return { o, normal, indirim: Math.max(0, normal - o.ucret) }; })
    .sort((a, b) => b.indirim - a.indirim || okSirala(a.o, b.o));
  const ind = sat.filter(s => s.indirim > 0.01);
  const kart = (ton, ad, d) => `<div class="ozet-kart" data-tone="${ton}"><small>${esc(ad)}</small><strong>${d}</strong></div>`;
  const ek = `<section class="ozet vurgulu" aria-label="Özet">${kart('kirmizi', 'Toplam İndirim', TL(topla(sat, s => s.indirim)))}${kart('kehribar', 'İndirim yapılan', `${ind.length} / ${sat.length} öğrenci`)}
    ${kart('mavi', 'Liste Fiyatı Toplamı', TLK(topla(sat, s => s.normal)))}${kart('mor', 'Dönemlik Ücret Toplamı', TLK(topla(sat, s => s.o.ucret)))}${kart('yesil', 'Tahsilat Toplamı', TLK(topla(sat, s => s.o.odenen)))}</section>`;
  return {
    baslik: 'İndirim / Kayıp Analizi', dosya: 'indirim_kayip_analizi', ad: 0, ac: true, ek, ozetGizli: true,
    kol: ['Adı Soyadı', 'Sınıf', 'Servis (Plaka)', 'Tahsil Edilen', 'Dönemlik Ücret', 'Normal Fiyat', 'İndirim Tutarı'],
    sat: sat.map(({ o, normal, indirim }) => ({ id: o.id, h: [o.ad, o.sinif, o.plaka, TL(o.odenen), TL(o.ucret), TL(normal), TL(indirim)] })),
    ozet: [[[`Toplam İndirim: ${TL(topla(sat, s => s.indirim))}`, 'kalin'], [`İndirim yapılan: ${ind.length} / ${sat.length} öğrenci`, 'soluk']]],
  };
}

const okTablo = () => OK.sekme === 'ogr' ? okOgrTablo() : OK.sekme === 'yok' ? okYokTablo() : OK.sekme === 'srv' ? okSrvTablo() : OK.tah === 'rapor' ? okTahTablo() : okIndTablo();

/* ---------- çizim ---------- */
const okOzetHtml = l => l.map(s => `<p class="ok-ozet">${s.map(([m, c]) => `<span class="${c || ''}">${esc(m)}</span>`).join(' | ')}</p>`).join('');

function okKart(t, s) {
  const satirlar = t.kol.map((k, j) => {
    if (j === t.ad) return '';
    const ham = s.h[j], renk = t.renk && t.renk(j);
    const h = t.tel && t.tel.includes(j) ? okTel(ham) : (ham === '' || ham == null ? '' : `<span class="${renk ? renk(ham) : ''}">${esc(ham)}</span>`);
    return alanSatir(k, h);
  }).join('');
  const ad = String(s.h[t.ad] ?? '');
  const ust = t.avatarsiz
    ? `<div class="k-ust"><div class="k-orta"><div class="k-ad">${esc(ad)}</div><div class="k-alt">${esc(s.h[2] || '')}</div></div></div>`
    : `<div class="k-ust"><div class="avatar" style="--h:${avatarTon(ad)}">${esc(bas(ad))}</div><div class="k-orta"><div class="k-ad">${esc(ad)}</div></div></div>`;
  const dugme = t.yok && !durum.ro ? `<div class="d-eylem"><button type="button" class="eylem" data-ok-duz="${esc(s.id)}">Bilgileri Düzenle</button><button type="button" class="eylem" data-ok-geri="${esc(s.id)}">Listeye Geri Ekle</button></div>` : '';
  const ic = `${ust}<div class="ok-alanlar">${satirlar}</div>${s.ek || ''}${dugme}`;
  return t.ac ? `<div class="kart" role="button" tabindex="0" data-ogr="${esc(s.id)}">${ic}</div>` : `<div class="kart sabit">${ic}</div>`;
}

function okIcerik() {
  const dyn = document.querySelector('#ok-dyn'); if (!dyn || !durum.veri) return;
  const t = okTablo();
  const arac = t.sat.length ? `<div class="ok-arac"><button type="button" class="eylem" data-ok-excel>Excel'e Aktar</button><button type="button" class="eylem" data-ok-pdf>PDF'e Aktar</button></div>` : '';
  const html = `${t.ek || ''}${t.ozetGizli ? '' : okOzetHtml(t.ozet)}${arac}${t.sat.length ? `<ul class="liste">${t.sat.map(s => `<li>${okKart(t, s)}</li>`).join('')}</ul>` : '<p class="bos">Kayıt yok.</p>'}`;
  if (dyn.dataset.h === html) return;   // yoklamada değişen bir şey yoksa sayfa yeniden yazılmaz
  dyn.dataset.h = html; dyn.innerHTML = html;
}

const okSec = (id, etiket, secenekler, deger) => `<label class="alan"><span>${esc(etiket)}</span><select id="${id}">${secenekler.map(([v, a]) =>
  `<option value="${esc(v)}"${String(v) === String(deger) ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>`;

function okKontrolHtml() {
  const v = durum.veri, k = okKey();
  const servisSec = [['', 'Tüm Servisler'], ...v.servisler.map(s => [s.plaka, s.plaka]), [OK_ATANMAMIS, 'Araça Atanmamış']];
  const siniflar = [...new Set(okTum().map(o => o.sinif).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  const alt = OK.sekme === 'tah' ? `<nav class="filtreler" aria-label="Tahsilat bölümleri">${OK_ALT.map(([a, ad]) =>
    `<button type="button" class="chip${OK.tah === a ? ' secili' : ''}" data-ok-alt="${a}" aria-pressed="${OK.tah === a}">${esc(ad)}</button>`).join('')}</nav>` : '';
  const ara = `<div class="arama"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="ok-ara" type="search" aria-label="${esc(OK_IPUCU[k])}" placeholder="${esc(OK_IPUCU[k])}" autocomplete="off" enterkeyhint="search" value="${esc(OK.q[k])}"></div>`;
  let sec = '';
  if (OK.sekme === 'ogr') sec = okSec('ok-sinif', 'Sınıf', [['', 'Tüm Sınıflar'], ...siniflar.map(s => [s, s])], OK.sinif) + okSec('ok-servis', 'Servis', servisSec, OK.servis);
  else if (OK.sekme === 'tah' && OK.tah === 'rapor') sec = okSec('ok-tservis', 'Öğrenci Servisi', servisSec, OK.tServis) + okSec('ok-goster', 'Göster', OK_GOSTER, OK.goster) + okSec('ok-yontem', 'Ödeme Yöntemi', OK_YONTEM, OK.yontem);
  else if (OK.sekme === 'tah') sec = okSec('ok-igoster', 'Göster', OK_GOSTER, OK.iGoster);
  return `${alt}${ara}${sec ? `<div class="ok-kontrol">${sec}</div>` : ''}<div id="ok-dyn"></div>`;
}

function okSekmeCiz() {
  const nav = document.querySelector('#ok-sekme');
  if (!nav.childElementCount) OK_SEKMELER.forEach(([k, ad]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = ad;
    b.addEventListener('click', () => { OK.sekme = k; okCiz(); });
    nav.append(b);
  });
  nav.querySelectorAll('.chip').forEach(c => { const s = c.dataset.k === OK.sekme; c.classList.toggle('secili', s); c.setAttribute('aria-pressed', String(s)); });
}

function okCiz() {
  if (!durum.veri || !durum.izinler.includes('okul')) return;
  iskeletKaldir(); okSekmeCiz();
  const v = durum.veri, g = document.querySelector('#ok-govde');
  const imza = [OK.sekme, OK.tah, v.servisler.map(s => s.plaka).join('|'), [...new Set(okTum().map(o => o.sinif))].join('|')].join('#');
  if (g.dataset.imza !== imza) { g.dataset.imza = imza; g.innerHTML = okKontrolHtml(); }
  okIcerik();
}

/* ---------- Excel ve PDF ---------- */
function okDosyaIndir(blob, ad) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = ad; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const okDosyaAdi = t => `${t.dosya}_${new Date().toISOString().slice(0, 10)}`;
const okOzetMetin = t => t.ozet.map(s => s.map(p => p[0]).join(' | '));

function okExcel(t) {
  const n = t.kol.length, hucre = x => `<td style="mso-number-format:'\\@'">${esc(x)}</td>`;
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body><table border="1">
    <tr><th colspan="${n}">${esc(t.baslik)}  ${esc(durum.veri.donem_ad || '')}</th></tr>${okOzetMetin(t).map(s => `<tr><td colspan="${n}">${esc(s)}</td></tr>`).join('')}
    <tr>${t.kol.map(k => `<th>${esc(k)}</th>`).join('')}</tr>${t.sat.map(s => `<tr>${s.h.map(hucre).join('')}</tr>`).join('')}</table></body></html>`;
  okDosyaIndir(new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8' }), okDosyaAdi(t) + '.xls');
  toast('Excel dosyası indirildi.');
}

function okPdf(t) {
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(t.baslik)}</title><style>
    @page{size:A4 landscape;margin:10mm}body{font:11px Arial,sans-serif;color:#111}h1{font-size:16px;margin:0 0 6px}p{margin:0 0 4px}
    table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#e8eef5}tr{break-inside:avoid}</style></head>
    <body><h1>${esc(t.baslik)}  ${esc(durum.veri.donem_ad || '')}</h1>${okOzetMetin(t).map(s => `<p>${esc(s)}</p>`).join('')}
    <table><thead><tr>${t.kol.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead><tbody>${t.sat.map(s => `<tr>${s.h.map(x => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 300); return; }
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0'; document.body.append(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300);
}

/* ---------- etkileşim ---------- */
async function okGeriEkle(id) {
  const k = durum.veri.servis_yok.find(x => x.id === id); if (!k) return;
  if (!(await onay('Listeye geri eklensin mi?', `${k.ad} servis kullananlar listesine geri eklenecek.`, 'Geri Ekle'))) return;
  await kayitGonder('okul', 'ogrenci', { ogrenci: id, servis: 'GERI' }, 'Listeye geri ekle: ' + k.ad);
}

(function okBagla() {
  const g = document.querySelector('#ok-govde'); if (!g) return;
  let zaman = 0;
  g.addEventListener('input', e => {
    if (e.target.id !== 'ok-ara') return;
    clearTimeout(zaman); zaman = setTimeout(() => { OK.q[okKey()] = e.target.value; okIcerik(); }, 120);
  });
  g.addEventListener('change', e => {
    const m = { 'ok-sinif': 'sinif', 'ok-servis': 'servis', 'ok-tservis': 'tServis', 'ok-goster': 'goster', 'ok-yontem': 'yontem', 'ok-igoster': 'iGoster' }[e.target.id];
    if (m) { OK[m] = e.target.value; okIcerik(); }
  });
  g.addEventListener('toggle', e => {
    const d = e.target; if (!d.matches || !d.matches('details[data-srv]')) return;
    if (d.open) OK.acik.add(d.dataset.srv); else OK.acik.delete(d.dataset.srv);
  }, true);
  g.addEventListener('click', e => {
    const alt = e.target.closest('[data-ok-alt]');
    if (alt) { OK.tah = alt.dataset.okAlt; okCiz(); return; }
    const y = e.target.closest('[data-y]');
    if (y) { OK.yontem = OK.yontem === y.dataset.y ? 'hepsi' : y.dataset.y; const s = document.querySelector('#ok-yontem'); if (s) s.value = OK.yontem; okIcerik(); return; }
    if (e.target.closest('[data-ok-excel]')) { okExcel(okTablo()); return; }
    if (e.target.closest('[data-ok-pdf]')) { okPdf(okTablo()); return; }
    const geri = e.target.closest('[data-ok-geri]');
    if (geri) { okGeriEkle(geri.dataset.okGeri); return; }
    const duz = e.target.closest('[data-ok-duz]');
    if (duz) { const k = durum.veri.servis_yok.find(x => x.id === duz.dataset.okDuz); if (k) { ogrenciForm(k, false); sayfaAc(); } return; }
    if (e.target.closest('a')) return;
    const kart = e.target.closest('[data-ogr]'); if (kart) ac(kart.dataset.ogr);
  });
  g.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.closest('a, button, input, select')) return;
    const kart = e.target.closest('[data-ogr]'); if (kart) ac(kart.dataset.ogr);
  });
})();

/* ---------- öğrenci ayrıntısı ve düzenleme formu ---------- */
function okBilgiHtml(o) {
  const t = x => okTel(x);
  return [['Öğrenci Tel', t(o.ogr_tel)], ['Veli Adı/Mesleği', esc(o.veli)], ['Veli TC Kimliği', esc(o.tc)], ['Veli Tel', t(o.veli_tel)], ['Baba Tel', t(o.baba_tel)], ['Anne Tel', t(o.anne_tel)],
    ['Sınıfı', esc(o.sinif)], ['Servis (Plaka)', esc(o.plaka)], ['Adres', esc(o.adres)]].map(([a, v]) => alanSatir(a, v)).join('');
}

function okGecmisHtml(o) {
  if (!o.odemeler.length) return '<p class="z-alt">Henüz ödeme yok.</p>';
  const sirali = o.odemeler.map((g, i) => ({ g, i })).sort((a, b) => (okTarihMs(a.g.tarih) - okTarihMs(b.g.tarih)) || (b.i - a.i));
  let kalan = o.ucret;
  return `<table class="ok-tablo"><thead><tr><th>No</th><th>Tarih</th><th>Ödenen (₺)</th><th>Kalan (₺)</th><th>Not</th></tr></thead><tbody>${sirali.map(({ g }, n) => {
    kalan = Math.max(0, kalan - g.tutar);
    const not = [YONTEM[g.yontem] || g.yontem, g.not, g.dekont ? 'Dekont var' : ''].filter(Boolean).join(' · ');
    return `<tr><td>${n + 1}</td><td>${esc(g.tarih)}</td><td>${okPara(g.tutar)}</td><td>${okPara(kalan)}</td><td>${esc(not)}</td></tr>`;
  }).join('')}</tbody></table>`;
}

// Masaüstü 'Bilgileri Düzenle' ile aynı alanlar; yalnızca değişenler gönderilir
function ogrenciForm(k, detaydan) {
  const mevcut = k.plaka || '', servisYok = durum.veri.servis_yok.some(x => x.id === k.id);
  const metin = (a, etiket, maks) => ({ k: a, etiket, tur: 'metin', maks, varsayilan: k[a] || '' });
  formAc({
    modul: 'okul', islem: 'ogrenci', baslik: 'Bilgileri Düzenle', alt: k.ad,
    geri: detaydan ? () => { durum.acik = { tur: 'ogrenci', id: k.id, form: false }; detayDoldur(okOgr(k.id) || k, false); } : null,
    alanlar: [{ k: 'ad', etiket: 'Adı Soyadı', tur: 'metin', zorunlu: true, maks: 120, varsayilan: k.ad }, metin('sinif', 'Sınıfı', 40),
      { k: 'tc', etiket: 'Veli TC Kimliği', tur: 'sayi', maks: 11, varsayilan: k.tc || '' },
      { k: 'servis', etiket: 'Servis (Plaka)', tur: 'sec', secenekler: [['', mevcut ? `Değiştirme (${mevcut})` : 'Değiştirme'], ...(servisYok ? [['GERI', 'Servis kullanıyor (listeye geri ekle)']] : []), ['YOK', 'Servis kullanmıyor'],
        ...durum.veri.servisler.map(s => [s.plaka, s.plaka + (s.sofor ? ' · ' + s.sofor : '')])], varsayilan: '' },
      metin('veli', 'Veli Adı/Mesleği', 80), metin('veli_tel', 'Veli Tel', 30), metin('ogr_tel', 'Öğrenci Tel', 30), metin('baba_tel', 'Baba Tel', 30), metin('anne_tel', 'Anne Tel', 30),
      { k: 'ucret', etiket: 'Dönem Ücreti (₺)', tur: 'tutar', varsayilan: k.ucret ? String(k.ucret).replace('.', ',') : '' }, metin('adres', 'Adres', 200)],
    hazirla: d => {
      const v = { ogrenci: k.id }, ad = gerekli(d('ad'), 'Adı Soyadı'), sinif = d('sinif').trim(), servis = d('servis');
      if (ad !== k.ad) v.ad = ad;
      if (sinif && sinif !== (k.sinif || '')) v.sinif = sinif;
      ['tc', 'veli', 'veli_tel', 'ogr_tel', 'baba_tel', 'anne_tel', 'adres'].forEach(a => { const x = d(a).trim(); if (x !== (k[a] || '')) v[a] = x; });
      const u = tutarAl(d('ucret'), 'Dönem ücreti', true);
      if (u !== (k.ucret || 0)) v.ucret = u;
      if (servis) v.servis = servis;
      if (Object.keys(v).length === 1) throw new Error('Değiştirilmiş bir bilgi yok.');
      return v;
    },
    ozet: () => `Öğrenci bilgisi: ${k.ad}`,
  });
}
