/* Okul Yönetimi: masaüstündeki sekmeler, sütun başlıkları, filtreler ve özetlerle aynı.
   uygulama.js'ten önce yüklenir; ortak yardımcıları (esc, sade, TL, formAc, ...) yalnızca çağrı anında kullanır. */
const OK = { sekme: 'ogr', tah: 'rapor', q: { ogr: '', yok: '', srv: '', tah: '', ind: '' }, sinif: '', servis: '', tServis: '', goster: 'hepsi', iGoster: 'hepsi', yontem: 'hepsi', acik: new Set(),
  ay: '', pAy: '', pDonem: 1, pDuzen: false, pTaslak: {}, pGecici: {}, siraModu: false, siraIds: [] };
const OK_SEKMELER = [['ogr', 'Öğrenciler'], ['yok', 'Servis Kullanmayanlar'], ['srv', 'Servisler'], ['tah', 'Tahsilat Raporu'], ['pua', 'Servis Puantajları']];
const OK_TUM_YIL = '__tum__';
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
// Elle sıralama (sürükle-bırak) varsa o, yoksa soyad sırası; masaüstüyle aynı
const okSiraKarsilastir = (a, b) => ((a.manuel ?? 1e12) - (b.manuel ?? 1e12)) || okSirala(a, b);
const okAyAnahtari = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
// Masaüstü 'Ay' filtresi: ödeme kaydı olan aylar (yeniden eskiye); hiç yoksa son 12 ay. Varsayılan en yeni ay
function okAyListesi() {
  const l = durum.veri.odeme_aylari || [];
  if (l.length) return l;
  const d = new Date(), r = [];
  for (let i = 0; i < 12; i++) r.push(okAyAnahtari(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  return r;
}
const okSecAy = () => { const l = okAyListesi(); return OK.ay === OK_TUM_YIL || l.includes(OK.ay) ? OK.ay : l[0]; };

// Masaüstü 'ÖDEME DURUMU' sütunu: seçili ayda ya da başka ayda ödeme yapan 'ödendi' sayılır
function okOdemeDurum(o, ay) {
  const a = o.aylar || {}, ks = Object.keys(a), dolu = ks.filter(k => a[k]);
  if (ay === OK_TUM_YIL) return { odendi: dolu.length > 0, metin: ks.length ? `${dolu.length}/${ks.length} ay` : '—', tahsil: 0 };
  const bu = a[ay];
  if (bu) return { odendi: true, metin: dolu.length > 1 ? `${dolu.length} ay · ${bu[0]}` : bu[0], tahsil: bu[1] || 0 };
  if (dolu.length) {
    const son = dolu.map(k => a[k][0]).filter(Boolean).sort((x, y) => okTarihMs(y) - okTarihMs(x))[0] || '';
    return { odendi: true, metin: `${dolu.length} ay · ${son}`, tahsil: 0 };
  }
  return { odendi: false, metin: 'Bekliyor', tahsil: 0 };
}

function okOgrListe() {
  return okTum().filter(o => (!OK.sinif || o.sinif === OK.sinif)
    && (!OK.servis || (OK.servis === OK_ATANMAMIS ? !o.plaka : okPlaka(o.plaka) === okPlaka(OK.servis)))
    && okAra(OK.q.ogr, `${o.ad} ${o.veli} ${o.sinif} ${o.plaka} ${okPlaka(o.plaka)} ${o.adres}`, [...okTelleri(o), o.tc])).sort(okSiraKarsilastir);
}

function okOgrTablo() {
  const l = okOgrListe(), ay = okSecAy(), d = new Map(l.map(o => [o.id, okOdemeDurum(o, ay)]));
  const odeyen = l.filter(o => d.get(o.id).odendi);
  return {
    baslik: 'Öğrenciler', dosya: 'ogrenciler', ad: 1, tel: [2, 5, 6, 7], ac: true, ogr: true,
    renk: j => (j === 12 ? (x => (x === 'Bekliyor' ? 'tarih-kehribar' : 'ok-yesil')) : null),
    kol: ['S.NO', 'ADI SOYADI', 'ÖĞ. TEL', 'VELİ ADI/MESLEK', 'VELİ TC KİMLİĞİ', 'VELİ TEL', 'BABA TEL', 'ANNE TEL', 'SINIFI', 'SERVİS (PLAKA)', 'ADRES', 'DÖNEM ÜCRETİ (₺)', 'ÖDEME DURUMU'],
    sat: l.map((o, i) => ({ id: o.id, h: [i + 1, o.ad, o.ogr_tel, o.veli, o.tc, o.veli_tel, o.baba_tel, o.anne_tel, o.sinif, o.plaka, o.adres, TL(o.ucret), d.get(o.id).metin] })),
    ozet: [[[`Toplam: ${l.length} Öğrenci`, 'kalin'], [`Ödendi: ${odeyen.length}`, 'yesil'], [`Bekliyor: ${l.length - odeyen.length}`, 'kehribar']],
      [[`Bu Ay Tahsilat: ${TL(topla(l, o => d.get(o.id).tahsil))}`, 'mor'], [`Ödeyenlerin Dönem Ücreti: ${TL(topla(odeyen, o => o.ucret))}`, 'soluk']]],
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
    baslik: 'Servisler', dosya: 'servisler', ad: 4, tel: [3], avatarsiz: true, srv: true, renk: j => (j >= 9 && j <= 11 ? okTarihSinif : null),
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
  // Masaüstündeki İndirim / Kayıp Analizi ile aynı hesap: normal fiyat girilmemişse dönemlik ücret alınır; indirim = normal − dönemlik
  const sat = durum.veri.ogrenciler.filter(o => okAra(OK.q.ind, `${o.ad} ${o.adres}`, okTelleri(o)))
    .map(o => { const normal = o.normal > 0 ? o.normal : o.ucret; return { o, normal, indirim: Math.max(0, normal - o.ucret) }; })
    .sort((a, b) => b.indirim - a.indirim || okSirala(a.o, b.o));
  const ind = sat.filter(s => s.indirim > 0.01);
  const kart = (ton, ad, d) => `<div class="ozet-kart" data-tone="${ton}"><small>${esc(ad)}</small><strong>${d}</strong></div>`;
  const ek = `<section class="ozet vurgulu" aria-label="Özet">${kart('kirmizi', 'Toplam İndirim', TL(topla(sat, s => s.indirim)))}${kart('kehribar', 'İndirim Yapılan Öğrenci', `${ind.length} / ${sat.length}`)}
    ${kart('mavi', 'Liste Fiyatı Toplamı', TLK(topla(sat, s => s.normal)))}${kart('mor', 'Dönemlik Ücret Toplamı', TLK(topla(sat, s => s.o.ucret)))}${kart('yesil', 'Tahsilat Toplamı', TLK(topla(sat, s => s.o.odenen)))}</section>`;
  return {
    baslik: 'İndirim / Kayıp Analizi', dosya: 'indirim_kayip_analizi', ad: 0, ac: true, ek, ozetGizli: true,
    kol: ['Adı Soyadı', 'Sınıf', 'Servis (Plaka)', 'Tahsil Edilen', 'Dönemlik Ücret', 'Normal Fiyat', 'İndirim Tutarı'],
    sat: sat.map(({ o, normal, indirim }) => ({ id: o.id, h: [o.ad, o.sinif, o.plaka, TL(o.odenen), TL(o.ucret), TL(normal), TL(indirim)] })),
    ozet: [[[`Toplam İndirim: ${TL(topla(sat, s => s.indirim))}`, 'kalin'], [`İndirim yapılan: ${ind.length} / ${sat.length} öğrenci`, 'soluk']]],
  };
}

/* ---------- Servis Puantajları: masaüstü sekmesiyle aynı hesap (ay, gün tikleri, ödenecek, ödendi işareti, toplamlar) ---------- */
const okAdmin = () => durum.izinler.includes('ayarlar') && !durum.ro;   // masaüstünde puantaj düzenleme yalnızca yöneticidir
const okPuAy = () => OK.pAy || okAyAnahtari();
const okGunSayisi = ay => new Date(+ay.slice(0, 4), +ay.slice(5), 0).getDate();
const okAyKaydir = (ay, n) => okAyAnahtari(new Date(+ay.slice(0, 4), +ay.slice(5) - 1 + n, 1));
// Servis o ayda var mıydı: aracın kendi başlama tarihi, yoksa genel servis dönemi başlangıcı; ikisi de boşsa her zaman geçerli
function okPuGecerli(s, ay) {
  const d = trParse(s.bas || durum.veri.puantaj_bas || '');
  return d ? okAyAnahtari(d) <= ay : true;
}
const okPuAnahtar = (s, ay) => `${s.id}|${ay}`;
function okPuYok(s, ay) {
  const k = okPuAnahtar(s, ay), t = OK.pTaslak[k];
  if (t) return t;
  const g = (s.puantaj || {})[ay] || [], o = OK.pGecici[k];
  if (o) { if (JSON.stringify(o) === JSON.stringify(g)) delete OK.pGecici[k]; else return o; }
  return g;
}
// Ücret o ay en az 1 gün geldiyse tam ödenir; şirket aracı ve servisin olmadığı ay ödenmez
const okPuOdenecek = (s, ay) => (s.sirket || !okPuGecerli(s, ay) || okPuYok(s, ay).length >= okGunSayisi(ay) ? 0 : (s.aylik || 0));
const okPuServisler = () => durum.veri.servisler.filter(s => !s.gizli);
function okPuToplam() {
  const ay = okPuAy(), aylar = Array.from({ length: OK.pDonem }, (_, i) => okAyKaydir(ay, -i)), l = okPuServisler();
  let odenecek = 0, odenen = 0;
  for (const k of aylar) for (const s of l) { const t = okPuOdenecek(s, k); odenecek += t; if ((s.odemeler || {})[k]) odenen += t; }
  const tahsilat = topla(aylar, k => (durum.veri.tahsilat_aylik || {})[k]);
  return { ay, aylar, odenecek, odenen, bekleyen: Math.max(0, odenecek - odenen), tahsilat, kalan: tahsilat - odenen, kalanTum: tahsilat - odenecek };
}

function okPuTablo() {
  const v = durum.veri, ay = okPuAy(), gun = okGunSayisi(ay), t = okPuToplam(), sat = [];
  (v.kademeler || []).forEach(({ k, ad }) => okPuServisler().filter(s => s.k === k).forEach(s => {
    const yok = new Set(okPuYok(s, ay)), gec = okPuGecerli(s, ay);
    sat.push({ id: s.id, h: [ad, s.plaka, s.sofor, s.sirket ? 'Şirket Aracı' : TL(s.aylik), ...Array.from({ length: gun }, (_, i) => (gec && !yok.has(i + 1) ? '✓' : '✗')),
      s.sirket ? 'Şirket Aracı' : TL(okPuOdenecek(s, ay))] });
  }));
  return { baslik: `Servis Puantajları  ${ayAdi(ay)}`, dosya: 'servis_puantaj', kol: ['Kategori', 'Plaka', 'Şoför Adı Soyadı', 'Aylık Ücret', ...Array.from({ length: gun }, (_, i) => String(i + 1)), 'Ödenecek'],
    sat, ozet: [[[`Toplam Tutar: ${TL(t.odenecek)}`, 'kalin']]] };
}

function okPuKartHtml(s, ay, gun) {
  const yok = new Set(okPuYok(s, ay)), gec = okPuGecerli(s, ay), od = okPuOdenecek(s, ay), odendi = !!(s.odemeler || {})[ay] && od > 0;
  const sag = s.sirket ? '<span class="ok-od-sirket">Şirket Aracı</span>' : `<span class="${odendi ? 'ok-od-ode' : od > 0 ? 'ok-od-bek' : 'ok-od-yok'}">${odendi ? '✓ ' : ''}${esc(TL(od))}</span>`;
  const gunler = Array.from({ length: gun }, (_, i) => {
    const d = i + 1, geldi = gec && !yok.has(d), sinif = `ok-gun ${gec ? (geldi ? 'var' : 'yok') : 'pasif'}`;
    return OK.pDuzen && gec ? `<button type="button" class="${sinif}" data-gun="${esc(s.id)}|${d}" aria-pressed="${geldi}" aria-label="${d}. gün ${geldi ? 'geldi' : 'gelmedi'}">${d}</button>` : `<span class="${sinif}">${d}</span>`;
  }).join('');
  const islem = okAdmin() ? `<div class="d-eylem"><button type="button" class="eylem" data-pu-ucret="${esc(s.id)}">Ücreti Güncelle</button>${s.sirket ? ''
    : `<button type="button" class="eylem" data-pu-odeme="${esc(s.id)}">${(s.odemeler || {})[ay] ? 'Ödemeyi Geri Al' : 'Ödendi İşaretle'}</button>`}</div>` : '';
  return `<li><div class="kart sabit"><div class="k-ust"><div class="k-orta"><div class="k-ad">${esc(s.plaka)}</div><div class="k-alt">${esc(s.sofor)}${gec ? '' : ' · bu ay servis yok'}</div></div>
    <div class="k-sag"><div class="k-kalan">${sag}</div><div class="k-alt">${s.sirket ? '' : 'Aylık ' + esc(TL(s.aylik))}</div></div></div><div class="ok-gunler">${gunler}</div>${islem}</div></li>`;
}

function okPuHtml() {
  const v = durum.veri, ay = okPuAy(), gun = okGunSayisi(ay), t = okPuToplam();
  const kart = (ton, ad, d, ek = '') => `<div class="ozet-kart" data-tone="${ton}"><small>${esc(ad)}</small><strong>${d}</strong>${ek}</div>`;
  const tekAy = OK.pDonem <= 1, etiket = tekAy ? `${AYLAR[(+ay.slice(5)) % 12]} Ayının 14'ü Ödemesi (${AYLAR[+ay.slice(5) - 1]} Puantajına Göre)` : `Servislere Ödenecek [${ayAdi(t.aylar[t.aylar.length - 1])} → ${ayAdi(ay)}]`;
  const ozet = `<section class="ozet" aria-label="Puantaj özeti">${kart('mavi', 'Tahsil Edilen', TL(t.tahsilat))}${kart('kehribar', etiket, TL(t.odenecek))}
    ${kart('yesil', 'Ödenen', TL(t.odenen), `<span class="ok-alt-not">Bekleyen: ${esc(TL(t.bekleyen))}</span>`)}${kart(t.kalan >= 0 ? 'yesil' : 'kirmizi', 'Kalan', TL(t.kalan), `<span class="ok-alt-not">Tümü ödenince: ${esc(TL(t.kalanTum))}</span>`)}</section>`;
  const bekleyen = Object.keys(OK.pTaslak).length;
  const arac = `<div class="ok-arac"><button type="button" class="eylem" data-ok-excel>Excel'e Aktar</button><button type="button" class="eylem" data-ok-pdf>PDF'e Aktar</button></div>`;
  const duzen = okAdmin() ? `<div class="ok-arac">${OK.pDuzen ? `<button type="button" class="eylem" data-pu-kaydet>Kaydet${bekleyen ? ` (${bekleyen})` : ''}</button><button type="button" class="eylem" data-pu-vazgec>Vazgeç</button>`
    : '<button type="button" class="eylem" data-pu-duzen>Düzenle</button>'}</div>` : '';
  const gruplar = (v.kademeler || []).map(({ k, ad }) => {
    const l = okPuServisler().filter(s => s.k === k);
    return `<h3 class="d-sec">${esc(ad)} <small>${l.length} araç</small></h3>${l.length ? `<ul class="liste">${l.map(s => okPuKartHtml(s, ay, gun)).join('')}</ul>` : '<p class="bos">Bu grupta servis aracı yok.</p>'}`;
  }).join('');
  return `${ozet}${arac}${duzen}${gruplar}`;
}

async function okPuKaydet() {
  const gonder = [];
  for (const [k, yok] of Object.entries(OK.pTaslak)) {
    const [sid, ay] = k.split('|'), s = durum.veri.servisler.find(x => x.id === sid);
    if (s && JSON.stringify(yok) !== JSON.stringify((s.puantaj || {})[ay] || [])) gonder.push({ s, ay, yok, k });
  }
  OK.pDuzen = false; OK.pTaslak = {};
  if (!gonder.length) { okCiz(); toast('Değişiklik yok.'); return; }
  for (const { s, ay, yok, k } of gonder) {
    OK.pGecici[k] = yok;
    durum.bekleyen.push({ id: yeniId(), tur: 'kayit', modul: 'okul', islem: 'puantaj', veri: { tur: 'gun', servis: s.id, ay, yok }, ozet: `Puantaj: ${s.plaka} ${ayAdi(ay)}`, foto: null, gitti: false, durum: 'bekliyor' });
  }
  bekleyenKaydet(); await bekleyenleriIsle(); bekleyenleriGoster(); okCiz();
  toast('Puantaj gönderildi, masaüstü işleyecek.');
}

function okPuUcretForm(id) {
  const s = durum.veri.servisler.find(x => x.id === id); if (!s) return;
  const kat = ((durum.veri.kademeler || []).find(x => x.k === s.k) || {}).ad || 'Bu';
  formAc({
    modul: 'okul', islem: 'puantaj', baslik: 'Aylık Ücreti Güncelle', alt: `${s.plaka} — ${s.sofor}`,
    alanlar: [{ k: 'ucret', etiket: 'Aylık Ücret (₺)', tur: 'tutar', zorunlu: true, varsayilan: s.aylik ? virgul(s.aylik) : '' },
      { k: 'kat', etiket: 'Uygula', tur: 'segment', secenekler: [['0', 'Yalnız bu araç'], ['1', `${kat} grubundaki tüm araçlar`]], varsayilan: '0' }],
    hazirla: d => ({ tur: 'ucret', servis: id, ucret: tutarAl(d('ucret'), 'Aylık ücret'), kategori: d('kat') === '1' }),
    ozet: () => `Aylık ücret: ${s.plaka}`,
  });
  sayfaAc();
}

async function okPuOdeme(id) {
  const s = durum.veri.servisler.find(x => x.id === id), ay = okPuAy(); if (!s) return;
  if ((s.odemeler || {})[ay]) {
    if (await onay('Ödeme geri alınsın mı?', `${s.plaka} — ${ayAdi(ay)} ödemesi geri alınacak.`, 'Geri Al', true)) await kayitGonder('okul', 'puantaj', { tur: 'odeme', servis: id, ay, tarih: '', kategori: false }, `Ödeme geri al: ${s.plaka}`);
    return;
  }
  const kat = ((durum.veri.kademeler || []).find(x => x.k === s.k) || {}).ad || 'Bu';
  formAc({
    modul: 'okul', islem: 'puantaj', baslik: 'Ödendi İşaretle', alt: `${s.plaka} — ${s.sofor} · ${ayAdi(ay)}`,
    alanlar: [{ k: 'tarih', etiket: 'Ödeme tarihi', tur: 'tarih', serbest: true, varsayilan: bugunISO() },
      { k: 'kat', etiket: 'Uygula', tur: 'segment', secenekler: [['0', 'Yalnız bu araç'], ['1', `${kat} grubundaki tüm araçlar`]], varsayilan: '0' }],
    hazirla: d => { if (!d('tarih')) throw new Error('Ödeme tarihi gerekli.'); return { tur: 'odeme', servis: id, ay, tarih: trTarih(d('tarih')), kategori: d('kat') === '1' }; },
    ozet: () => `Ödendi: ${s.plaka} ${ayAdi(ay)}`,
  });
  sayfaAc();
}

const okTablo = () => OK.sekme === 'ogr' ? okOgrTablo() : OK.sekme === 'yok' ? okYokTablo() : OK.sekme === 'srv' ? okSrvTablo() : OK.sekme === 'pua' ? okPuTablo() : OK.tah === 'rapor' ? okTahTablo() : okIndTablo();

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
  const dugme = t.yok && !durum.ro ? `<div class="d-eylem"><button type="button" class="eylem" data-ok-duz="${esc(s.id)}">Bilgileri Düzenle</button><button type="button" class="eylem" data-ok-geri="${esc(s.id)}">Listeye Geri Ekle</button></div>`
    : t.srv && !durum.ro ? `<div class="d-eylem tek"><button type="button" class="eylem" data-ok-srvduz="${esc(s.id)}">Servisi Düzenle</button></div>` : '';
  const ic = `${ust}<div class="ok-alanlar">${satirlar}</div>${s.ek || ''}${dugme}`;
  return t.ac ? `<div class="kart" role="button" tabindex="0" data-ogr="${esc(s.id)}">${ic}</div>` : `<div class="kart sabit">${ic}</div>`;
}

// Öğrenci sırasını elle düzenleme (masaüstündeki sürükle-bırakın karşılığı): ▲▼ ile taşı, Kaydet ile masaüstüne gönder
function okSiraHtml() {
  const l = OK.siraIds.map(okOgr).filter(Boolean);
  return `<div class="ok-arac"><button type="button" class="eylem" data-ok-sira-kaydet>Sırayı Kaydet</button><button type="button" class="eylem" data-ok-sira-vazgec>Vazgeç</button></div>
    <ul class="liste">${l.map((o, i) => `<li><div class="kart sabit"><div class="k-ust"><div class="k-orta"><div class="k-ad">${i + 1}. ${esc(o.ad)}</div><div class="k-alt">${esc([o.sinif, o.plaka].filter(Boolean).join(' · '))}</div></div>
      <div class="ok-oklar"><button type="button" data-ok-yukari="${i}" aria-label="Yukarı taşı"${i ? '' : ' disabled'}>▲</button><button type="button" data-ok-asagi="${i}" aria-label="Aşağı taşı"${i < l.length - 1 ? '' : ' disabled'}>▼</button></div></div></div></li>`).join('')}</ul>`;
}

function okEylemHtml() {
  if (durum.ro || !durum.izinler.includes('okul')) return '';
  const b = (a, ad) => `<button type="button" class="eylem" ${a}>${esc(ad)}</button>`;
  if (OK.sekme === 'ogr') return `<div class="ok-arac">${b('data-ok-yeni-ogr', '+ Yeni Öğrenci')}${b('data-ok-toplu', 'Toplu Ödeme')}${b('data-ok-soyad', 'Soyada Göre Sırala')}${b('data-ok-sira', 'Sırayı Düzenle')}</div>`;
  if (OK.sekme === 'srv') return `<div class="ok-arac tek">${b('data-ok-yeni-srv', '+ Yeni Servis')}</div>`;
  return '';
}

function okIcerik() {
  const dyn = document.querySelector('#ok-dyn'); if (!dyn || !durum.veri) return;
  let html;
  if (OK.sekme === 'ogr' && OK.siraModu) html = okSiraHtml();
  else if (OK.sekme === 'pua') html = okPuHtml();
  else {
    const t = okTablo();
    const arac = t.sat.length ? `<div class="ok-arac"><button type="button" class="eylem" data-ok-excel>Excel'e Aktar</button><button type="button" class="eylem" data-ok-pdf>PDF'e Aktar</button></div>` : '';
    html = `${t.ek || ''}${t.ozetGizli ? '' : okOzetHtml(t.ozet)}${okEylemHtml()}${arac}${t.sat.length ? `<ul class="liste">${t.sat.map(s => `<li>${okKart(t, s)}</li>`).join('')}</ul>` : '<p class="bos">Kayıt yok.</p>'}`;
  }
  if (dyn.dataset.h === html) return;   // yoklamada değişen bir şey yoksa sayfa yeniden yazılmaz
  dyn.dataset.h = html; dyn.innerHTML = html;
}

const okSec = (id, etiket, secenekler, deger) => `<label class="alan"><span>${esc(etiket)}</span><select id="${id}">${secenekler.map(([v, a]) =>
  `<option value="${esc(v)}"${String(v) === String(deger) ? ' selected' : ''}>${esc(a)}</option>`).join('')}</select></label>`;

function okKontrolHtml() {
  const v = durum.veri, k = okKey();
  if (OK.sekme === 'ogr' && OK.siraModu) return '<div id="ok-dyn"></div>';
  if (OK.sekme === 'pua') {
    const ay = okPuAy(), yil = +ay.slice(0, 4), yillar = [...new Set([yil, ...[-2, -1, 0, 1].map(d => new Date().getFullYear() + d)])].sort();
    return `<div class="ok-kontrol">${okSec('ok-pay', 'Ay', AYLAR.map((a, i) => [String(i + 1).padStart(2, '0'), a]), ay.slice(5))}${okSec('ok-pyil', 'Yıl', yillar.map(y => [String(y), String(y)]), String(yil))}
      ${okSec('ok-pdonem', 'Toplu Hesaplama', [1, 2, 3, 4, 5, 6, 12].map(n => [String(n), n === 1 ? 'Tek ay' : `Son ${n} ay`]), String(OK.pDonem))}</div><div id="ok-dyn"></div>`;
  }
  const servisSec = [['', 'Tüm Servisler'], ...v.servisler.map(s => [s.plaka, s.plaka]), [OK_ATANMAMIS, 'Araça Atanmamış']];
  const siniflar = [...new Set(okTum().map(o => o.sinif).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
  const alt = OK.sekme === 'tah' ? `<nav class="filtreler" aria-label="Tahsilat bölümleri">${OK_ALT.map(([a, ad]) =>
    `<button type="button" class="chip${OK.tah === a ? ' secili' : ''}" data-ok-alt="${a}" aria-pressed="${OK.tah === a}">${esc(ad)}</button>`).join('')}</nav>` : '';
  const ara = `<div class="arama"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="ok-ara" type="search" aria-label="${esc(OK_IPUCU[k])}" placeholder="${esc(OK_IPUCU[k])}" autocomplete="off" enterkeyhint="search" value="${esc(OK.q[k])}"></div>`;
  let sec = '';
  if (OK.sekme === 'ogr') sec = okSec('ok-sinif', 'Sınıf', [['', 'Tüm Sınıflar'], ...siniflar.map(s => [s, s])], OK.sinif) + okSec('ok-servis', 'Servis', servisSec, OK.servis)
    + okSec('ok-ay', 'Ay', [[OK_TUM_YIL, 'Tüm Yıl'], ...okAyListesi().map(a => [a, ayAdi(a)])], okSecAy());
  else if (OK.sekme === 'tah' && OK.tah === 'rapor') sec = okSec('ok-tservis', 'Öğrenci Servisi', servisSec, OK.tServis) + okSec('ok-goster', 'Göster', OK_GOSTER, OK.goster) + okSec('ok-yontem', 'Ödeme Yöntemi', OK_YONTEM, OK.yontem);
  return `${alt}${ara}${sec ? `<div class="ok-kontrol">${sec}</div>` : ''}<div id="ok-dyn"></div>`;
}

function okSekmeCiz() {
  const nav = document.querySelector('#ok-sekme');
  if (!nav.childElementCount) OK_SEKMELER.forEach(([k, ad]) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.k = k; b.textContent = ad;
    b.addEventListener('click', () => { OK.sekme = k; OK.siraModu = false; okCiz(); });
    nav.append(b);
  });
  nav.querySelectorAll('.chip').forEach(c => { const s = c.dataset.k === OK.sekme; c.classList.toggle('secili', s); c.setAttribute('aria-pressed', String(s)); });
}

function okCiz() {
  if (!durum.veri || !durum.izinler.includes('okul')) return;
  iskeletKaldir(); okSekmeCiz();
  const v = durum.veri, g = document.querySelector('#ok-govde');
  const imza = [OK.sekme, OK.tah, OK.siraModu, v.servisler.map(s => s.plaka).join('|'), [...new Set(okTum().map(o => o.sinif))].join('|'), (v.odeme_aylari || []).join('|')].join('#');
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

// Masaüstü 'PDF Çıktı Ayarları' ile aynı: firma logosu göster/gizle, konum (sol/sağ üst), boyut (küçük/orta/büyük). Seçim telefonda saklanır; ilk değer masaüstü ayarıdır.
const OK_LOGO_BOYUT = { small: [34, 22], medium: [42, 27], large: [50, 32] };
function okMarka() { try { return JSON.parse(localStorage.getItem('marka') || '{}') || {}; } catch { return {}; } }
function okPdfAyar() {
  const m = okMarka();
  let s = {}; try { s = JSON.parse(localStorage.getItem('pdfAyar') || '{}') || {}; } catch { s = {}; }
  return { logo: s.logo !== undefined ? !!s.logo : !!m.logo, konum: s.konum || m.konum || 'left', boyut: s.boyut || m.boyut || 'small' };
}
function okPdfAyarSor() {
  const m = okMarka(), a = okPdfAyar();
  const sec = (id, ad, l, v) => `<label class="alan"><span>${esc(ad)}</span><select id="${id}">${l.map(([x, y]) => `<option value="${x}"${x === v ? ' selected' : ''}>${esc(y)}</option>`).join('')}</select></label>`;
  return new Promise(coz => {
    const d = document.createElement('dialog');
    d.className = 'soru-kutu'; d.setAttribute('aria-labelledby', 'pdf-b');
    d.innerHTML = `<form method="dialog"><h2 id="pdf-b">PDF Çıktı Ayarları</h2>
      ${m.ad ? `<p class="ok-pdf-firma">${esc(m.ad)}</p>` : ''}
      ${m.logo ? sec('pdf-logo', 'Firma logosu', [['1', 'Göster'], ['0', 'Gösterme']], a.logo ? '1' : '0') : '<p>Masaüstünde firma logosu tanımlı değil.</p>'}
      ${m.logo ? sec('pdf-konum', 'Logo konumu', [['left', 'Sol Üst'], ['right', 'Sağ Üst']], a.konum) + sec('pdf-boyut', 'Logo boyutu', [['small', 'Küçük'], ['medium', 'Orta'], ['large', 'Büyük']], a.boyut) : ''}
      <div class="soru-dugme"><button type="submit" value="iptal" class="eylem">Vazgeç</button><button type="submit" value="tamam" class="btn-ana">PDF Oluştur</button></div></form>`;
    d.addEventListener('close', () => {
      const s = { logo: !!m.logo && d.querySelector('#pdf-logo')?.value === '1', konum: d.querySelector('#pdf-konum')?.value || a.konum, boyut: d.querySelector('#pdf-boyut')?.value || a.boyut };
      const tamam = d.returnValue === 'tamam';
      if (tamam) try { localStorage.setItem('pdfAyar', JSON.stringify(s)); } catch { /* yoksay */ }
      coz(tamam ? s : null); d.remove();
    });
    document.body.append(d); d.showModal();
  });
}

async function okPdf(t) {
  const ayar = await okPdfAyarSor(); if (!ayar) return;
  const m = okMarka(), logo = ayar.logo && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(m.logo || '') ? m.logo : '';
  const [lw, lh] = OK_LOGO_BOYUT[ayar.boyut] || OK_LOGO_BOYUT.small;
  const baslik = `<div class="b">${m.ad ? `<div class="f">${esc(m.ad)}</div>` : ''}<h1>${esc(t.baslik)}  ${esc(durum.veri.donem_ad || '')}</h1></div>`;
  const img = logo ? `<img src="${logo}" alt="" style="max-width:${lw / 10}cm;max-height:${lh / 10}cm">` : '';
  const ust = logo ? `<div class="u">${ayar.konum === 'right' ? baslik + img : img + baslik}</div>` : `<div class="u">${baslik}</div>`;
  const dar = t.kol.length > 20;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(t.baslik)}</title><style>
    @page{size:A4 landscape;margin:10mm}body{font:${dar ? 8 : 11}px Arial,sans-serif;color:#111}h1{font-size:16px;margin:0 0 4px}p{margin:0 0 4px}
    .u{display:flex;align-items:center;gap:12px}.u img{object-fit:contain}.b{flex:1;text-align:${logo ? (ayar.konum === 'right' ? 'left' : 'right') : 'center'}}.f{font-size:12px;color:#444;margin-bottom:2px}
    table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#e8eef5}tr{break-inside:avoid}</style></head>
    <body>${ust}${okOzetMetin(t).map(s => `<p>${esc(s)}</p>`).join('')}
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
    const m = { 'ok-sinif': 'sinif', 'ok-servis': 'servis', 'ok-tservis': 'tServis', 'ok-goster': 'goster', 'ok-yontem': 'yontem', 'ok-igoster': 'iGoster', 'ok-ay': 'ay' }[e.target.id];
    if (m) { OK[m] = e.target.value; okIcerik(); return; }
    if (e.target.id === 'ok-pay' || e.target.id === 'ok-pyil') { OK.pAy = `${document.querySelector('#ok-pyil').value}-${document.querySelector('#ok-pay').value}`; okIcerik(); return; }
    if (e.target.id === 'ok-pdonem') { OK.pDonem = +e.target.value || 1; okIcerik(); }
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
    if (e.target.closest('[data-ok-yeni-ogr]')) { yeniOgrenciForm(); sayfaAc(); return; }
    if (e.target.closest('[data-ok-toplu]')) { okTopluOdeme(); return; }
    if (e.target.closest('[data-ok-soyad]')) { okSoyadaGore(); return; }
    if (e.target.closest('[data-ok-sira]')) { okSiraBaslat(); return; }
    if (e.target.closest('[data-ok-sira-kaydet]')) { okSiraKaydet(); return; }
    if (e.target.closest('[data-ok-sira-vazgec]')) { OK.siraModu = false; okCiz(); return; }
    const yk = e.target.closest('[data-ok-yukari]'), as = e.target.closest('[data-ok-asagi]');
    if (yk || as) { const i = +(yk || as).dataset[yk ? 'okYukari' : 'okAsagi'], j = yk ? i - 1 : i + 1, l = OK.siraIds; if (j >= 0 && j < l.length) { [l[i], l[j]] = [l[j], l[i]]; okIcerik(); } return; }
    if (e.target.closest('[data-ok-yeni-srv]')) { servisForm(null); sayfaAc(); return; }
    const sd = e.target.closest('[data-ok-srvduz]');
    if (sd) { const s = durum.veri.servisler.find(x => x.id === sd.dataset.okSrvduz); if (s) { servisForm(s); sayfaAc(); } return; }
    const gun = e.target.closest('[data-gun]');
    if (gun && OK.pDuzen) {
      const [sid, d] = gun.dataset.gun.split('|'), s = durum.veri.servisler.find(x => x.id === sid), ay = okPuAy(); if (!s) return;
      const yok = new Set(okPuYok(s, ay)); if (yok.has(+d)) yok.delete(+d); else yok.add(+d);
      OK.pTaslak[okPuAnahtar(s, ay)] = [...yok].sort((a, b) => a - b); okIcerik(); return;
    }
    if (e.target.closest('[data-pu-duzen]')) { OK.pDuzen = true; okIcerik(); return; }
    if (e.target.closest('[data-pu-vazgec]')) { OK.pDuzen = false; OK.pTaslak = {}; okIcerik(); return; }
    if (e.target.closest('[data-pu-kaydet]')) { okPuKaydet(); return; }
    const pu = e.target.closest('[data-pu-ucret]'); if (pu) { okPuUcretForm(pu.dataset.puUcret); return; }
    const po = e.target.closest('[data-pu-odeme]'); if (po) { okPuOdeme(po.dataset.puOdeme); return; }
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
    const not = [YONTEM[g.yontem] || g.yontem, g.not, g.dekont && !g.dk ? 'Dekont var' : ''].filter(Boolean).join(' · ');
    const dekont = g.dk ? `<button type="button" class="kucuk ok-dekont" data-dk="${esc(g.dk)}">Dekontu Görüntüle</button>` : '';
    return `<tr><td>${n + 1}</td><td>${esc(g.tarih)}</td><td>${okPara(g.tutar)}</td><td>${okPara(kalan)}</td><td>${esc(not)}${dekont}</td></tr>`;
  }).join('')}</tbody></table>`;
}

// Masaüstündeki öğrenci 'Arşiv' sekmesi: geçmiş dönemler (servis, dönem ücreti, ödemeler, kalan)
function okArsivHtml(o) {
  if (!(o.arsiv || []).length) return '';
  return `<h3 class="d-sec">Dönem Arşivi</h3>${o.arsiv.map(a => {
    const odenen = topla(a.odemeler, g => g.tutar);
    let kalan = a.ucret;
    return `<details class="ok-arsiv"><summary>${esc(a.donem)}<small>${esc(a.plaka ? 'Servis: ' + a.plaka + ' · ' : '')}Dönem Ücreti: ${esc(TL(a.ucret))} · Toplam Ödenen: ${esc(TL(odenen))} · Kalan: ${esc(TL(Math.max(0, a.ucret - odenen)))}</small></summary>
      ${a.odemeler.length ? `<table class="ok-tablo"><thead><tr><th>Tarih</th><th>Tutar</th><th>Kalan</th><th>Not</th></tr></thead><tbody>${a.odemeler.map(g => {
        kalan = Math.max(0, kalan - g.tutar);
        return `<tr><td>${esc(g.tarih)}</td><td>${okPara(g.tutar)}</td><td>${okPara(kalan)}</td><td>${esc(g.not)}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="z-alt">Bu dönemde ödeme yok.</p>'}</details>`;
  }).join('')}`;
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

/* ---------- yeni öğrenci / yeni servis / servis düzenle ---------- */
const okTarihTr = v => (v ? trTarih(v) : '');
const okTarihIso = t => (trParse(t) ? isoTarih(t) : '');

// Masaüstü 'Yeni Öğrenci' ile aynı alanlar
function yeniOgrenciForm() {
  const metin = (a, etiket, maks) => ({ k: a, etiket, tur: 'metin', maks, varsayilan: '' });
  formAc({
    modul: 'okul', islem: 'yeni_ogrenci', baslik: 'Yeni Öğrenci', alt: 'Öğrenci bilgilerini gir',
    alanlar: [{ k: 'ad', etiket: 'Adı Soyadı', tur: 'metin', zorunlu: true, maks: 120, varsayilan: '' }, metin('sinif', 'Sınıfı', 40),
      { k: 'servis', etiket: 'Servis (Plaka)', tur: 'sec', secenekler: [['', 'Servis seçilmedi'], ...durum.veri.servisler.map(s => [s.plaka, s.plaka + (s.sofor ? ' · ' + s.sofor : '')])], varsayilan: '' },
      metin('veli', 'Veli Adı/Mesleği', 80), { k: 'tc', etiket: 'Veli TC Kimliği', tur: 'sayi', maks: 11, varsayilan: '' },
      metin('veli_tel', 'Veli Tel', 30), metin('ogr_tel', 'Öğrenci Tel', 30), metin('baba_tel', 'Baba Tel', 30), metin('anne_tel', 'Anne Tel', 30),
      { k: 'ucret', etiket: 'Dönem Ücreti (₺)', tur: 'tutar', varsayilan: '' }, metin('adres', 'Adres', 200)],
    hazirla: d => {
      const v = { ad: gerekli(d('ad'), 'Adı Soyadı'), ucret: tutarAl(d('ucret'), 'Dönem ücreti', true), servis: d('servis') };
      ['sinif', 'veli', 'tc', 'veli_tel', 'ogr_tel', 'baba_tel', 'anne_tel', 'adres'].forEach(a => { v[a] = d(a).trim(); });
      return v;
    },
    ozet: v => `Yeni öğrenci: ${v.ad}`,
  });
}

function servisForm(s) {
  const kd = durum.veri.kademeler || [], ham = (s && s.ham) || {};
  const metin = (a, etiket, maks, vars) => ({ k: a, etiket, tur: 'metin', maks, varsayilan: vars || '' });
  const tarih = (a, etiket, vars) => ({ k: a, etiket, tur: 'tarih', serbest: true, varsayilan: okTarihIso(vars) });
  formAc({
    modul: 'okul', islem: s ? 'servis' : 'yeni_servis', baslik: s ? 'Servisi Düzenle' : 'Yeni Servis', alt: s ? `${s.plaka} — ${s.sofor}` : 'Servis aracı bilgilerini gir',
    alanlar: [{ k: 'sofor', etiket: 'Şoför Adı Soyadı', tur: 'metin', zorunlu: true, maks: 80, varsayilan: s ? s.sofor : '' }, metin('sofor_tel', 'Şoför Tel', 30, s && s.tel),
      metin('arac_no', 'Araç No', 20, s && s.no), { k: 'plaka', etiket: 'Plaka', tur: 'metin', zorunlu: true, maks: 20, varsayilan: s ? s.plaka : '' },
      metin('arac_tipi', 'Araç Tipi/Kapasitesi', 40, s && s.tip),
      { k: 'kademe', etiket: 'Sınıf Grubu', tur: 'sec', secenekler: kd.map(x => [x.k, x.ad]), varsayilan: s ? s.k : (kd.some(x => x.k === 'ortaokul') ? 'ortaokul' : (kd[0] || {}).k) },
      metin('guzergah', 'Güzergah / Bölge', 120, s && s.guz), metin('sahip', 'Araç Sahibi', 80, s && s.sahip),
      { k: 'ucret', etiket: 'Aylık Ücret (Puantaj) (₺)', tur: 'tutar', varsayilan: s && s.aylik ? virgul(s.aylik) : '' },
      { k: 'sirket', etiket: 'Şirket Aracı', tur: 'segment', secenekler: [['0', 'Hayır'], ['1', 'Evet']], varsayilan: s && s.sirket ? '1' : '0' },
      tarih('bas', 'Servise Başlama Tarihi', s && s.bas), tarih('sigorta', 'Sigorta Bitiş', ham.sigorta), tarih('muayene', 'Muayene Bitiş', ham.muayene), tarih('koltuk', 'Koltuk Sig. Bitiş', ham.koltuk)],
    hazirla: d => {
      const v = { servis: s ? s.id : '', sofor: gerekli(d('sofor'), 'Şoför adı'), sofor_tel: d('sofor_tel').trim(), arac_no: d('arac_no').trim(), plaka: gerekli(d('plaka'), 'Plaka'),
        arac_tipi: d('arac_tipi').trim(), kademe: d('kademe'), guzergah: d('guzergah').trim(), sahip: d('sahip').trim(), ucret: tutarAl(d('ucret'), 'Aylık ücret', true), sirket: d('sirket') === '1' };
      // tarihler yalnızca değiştiyse gönderilir
      [['bas', s && s.bas], ['sigorta', ham.sigorta], ['muayene', ham.muayene], ['koltuk', ham.koltuk]].forEach(([a, eski]) => { const y = okTarihTr(d(a)); if (!s ? y : y !== (eski || '')) v[a] = y; });
      return v;
    },
    ozet: v => `${s ? 'Servis' : 'Yeni servis'}: ${v.plaka}`,
  });
}

/* ---------- toplu ödeme ve sıralama ---------- */
// Masaüstü 'Toplu Ödeme': filtredeki tüm öğrenciler için seçilen ay, verilen tarihle ödenmiş işaretlenir
function okTopluOdeme() {
  const ids = okOgrListe().map(o => o.id);
  if (!ids.length) { toast('Listede öğrenci yok.', 'uyari'); return; }
  if (ids.length > 400) { toast('Tek seferde en fazla 400 öğrenci işaretlenir; filtreyi daralt.', 'uyari'); return; }
  const bugun = new Date(), aylar = Array.from({ length: 12 }, (_, i) => okAyAnahtari(new Date(bugun.getFullYear(), bugun.getMonth() - i, 1)));
  const sec = okSecAy();
  formAc({
    modul: 'okul', islem: 'toplu_odeme', baslik: 'Toplu Ödeme', alt: `${ids.length} öğrenci için ödeme kaydedilecek`,
    alanlar: [{ k: 'ay', etiket: 'Hangi ay', tur: 'sec', secenekler: aylar.map(a => [a, ayAdi(a)]), varsayilan: aylar.includes(sec) ? sec : aylar[0] },
      { k: 'tarih', etiket: 'Tahsilat tarihi', tur: 'tarih', serbest: true, varsayilan: bugunISO() }],
    hazirla: d => { if (!d('tarih')) throw new Error('Tahsilat tarihi gerekli.'); return { ogrenciler: ids, ay: d('ay'), tarih: trTarih(d('tarih')) }; },
    onay: v => `${ids.length} öğrenci için ${ayAdi(v.ay)} ayı ${v.tarih} tarihi ile ödenmiş işaretlenecek.`,
    ozet: v => `Toplu ödeme: ${ids.length} öğrenci, ${ayAdi(v.ay)}`,
  });
  sayfaAc();
}

async function okSoyadaGore() {
  if (!(await onay('Soyada göre sıralansın mı?', 'Elle verilen sıra silinir, liste soyada göre sıralanır. Bu işlem masaüstünde de uygulanır.', 'Sırala'))) return;
  await kayitGonder('okul', 'sira', { tur: 'soyad' }, 'Soyada göre sırala');
}

function okSiraBaslat() {
  if (OK.sinif || OK.servis || OK.q.ogr) { toast('Sırayı değiştirmek için önce arama ve filtreleri temizle.', 'uyari'); return; }
  OK.siraIds = okOgrListe().map(o => o.id); OK.siraModu = true; okCiz();
}

async function okSiraKaydet() {
  const ids = OK.siraIds.slice(); OK.siraModu = false; okCiz();
  if (ids.length > 1500) { toast('Çok fazla öğrenci var; sıra kaydedilemedi.', 'hata'); return; }
  await kayitGonder('okul', 'sira', { tur: 'sirala', ids }, 'Öğrenci sırası');
}
