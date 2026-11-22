'use strict';
/* Hareket katmanı: dokunma dalgası, kayan sekme göstergesi, sırayla giriş, çekerek yenile.
   uygulama.js'ten sonra yüklenir; ona yalnızca küresel `cek()` ile bağlanır. Dokunulan hiçbir davranışı değiştirmez. */
(() => {
  const q = (s, r = document) => r.querySelector(s);
  const AZ = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- dokunma dalgası ---------- */
  const DALGA = '.btn-ana, .eylem, .kart, .chip, .ikon-btn, .daha, .hizli button, .segment button, .alt-nav button, .kucuk, .geri';
  document.addEventListener('pointerdown', e => {
    if (e.button > 0 || !(e.target instanceof Element)) return;
    const h = e.target.closest(DALGA);
    if (!h || h.disabled || h.matches('[aria-disabled=true], .devre, .sabit, .ev-yok, .yukleniyor-k')) return;
    if (AZ.matches) return;
    const r = h.getBoundingClientRect(), boy = Math.max(r.width, r.height) * 2;
    const d = document.createElement('span');
    d.className = 'dalga'; d.setAttribute('aria-hidden', 'true');
    d.style.cssText = `width:${boy}px;height:${boy}px;left:${e.clientX - r.left - boy / 2}px;top:${e.clientY - r.top - boy / 2}px`;
    h.append(d);
    d.addEventListener('animationend', () => d.remove(), { once: true });
  }, { passive: true });

  /* ---------- alt gezinme: seçili hap ---------- */
  const nav = q('#alt-nav');
  let iz = null, sonSecili = null;
  function izKonumla() {
    const b = nav.querySelector('button.secili');
    if (!b || nav.hidden || !b.offsetWidth) return;
    let ilk = false;
    if (!iz || !iz.isConnected) {
      iz = document.createElement('i'); iz.className = 'nav-iz'; iz.setAttribute('aria-hidden', 'true');
      nav.prepend(iz); ilk = true;
    }
    if (ilk) iz.style.transition = 'none';
    iz.style.setProperty('--x', b.offsetLeft + 'px'); iz.style.setProperty('--y', b.offsetTop + 'px');
    iz.style.setProperty('--w', b.offsetWidth + 'px'); iz.style.setProperty('--h', b.offsetHeight + 'px');
    if (ilk) { void iz.offsetWidth; iz.style.transition = ''; }
    if (b !== sonSecili) { sonSecili = b; b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: AZ.matches ? 'auto' : 'smooth' }); }
  }
  const sadeceDalga = r => r.type === 'childList' && r.addedNodes.length + r.removedNodes.length > 0
    && [...r.addedNodes, ...r.removedNodes].every(n => n.nodeType === 1 && n.classList.contains('dalga'));
  new MutationObserver(m => { if (!m.every(sadeceDalga)) requestAnimationFrame(izKonumla); })
    .observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
  addEventListener('resize', izKonumla);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(izKonumla);
  requestAnimationFrame(izKonumla);

  // Sekme geçiş yönü: sağdaki sekmeye geçerken ekran sağdan, soldakine geçerken soldan gelir
  nav.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.diger) return;
    const dizi = [...nav.querySelectorAll('button:not([data-diger])')];
    const eski = dizi.findIndex(x => x.classList.contains('secili')), yeni = dizi.indexOf(b);
    document.documentElement.style.setProperty('--yon', yeni > eski ? 1 : yeni < eski ? -1 : 0);
  }, true);

  /* ---------- sırayla giriş: ekran görünür olunca bir kez ---------- */
  const goruldu = new WeakMap();
  function girisAn(s) {
    s.classList.add('giris-an'); clearTimeout(s._gz);
    s._gz = setTimeout(() => s.classList.remove('giris-an'), 1100);
  }
  const ana = q('#ana');
  new MutationObserver(m => m.forEach(r => {
    const t = r.target;
    if (t === ana && !ana.hidden) { const s = q('.gorunum:not([hidden])', ana); if (s) { goruldu.set(s, true); girisAn(s); } return; }
    if (!t.classList || !t.classList.contains('gorunum')) return;
    const gor = !t.hidden;
    if (gor && !goruldu.get(t)) girisAn(t);
    goruldu.set(t, gor);
  })).observe(ana, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.querySelectorAll('.gorunum').forEach(s => goruldu.set(s, !s.hidden));

  /* ---------- alt sayfa: sürüklerken perde de açılır ---------- */
  const tut = q('#tutamac'), sayfa = q('#sayfa'), perde = q('#perde');
  tut.addEventListener('pointerdown', () => { perde.style.transition = 'none'; });
  tut.addEventListener('pointermove', () => {
    const m = /translateY\(([\d.]+)px/.exec(sayfa.style.transform || '');
    if (m) perde.style.opacity = String(Math.max(0, 1 - parseFloat(m[1]) / (sayfa.offsetHeight || 400)));
  });
  const perdeBirak = () => { perde.style.transition = ''; perde.style.opacity = ''; };
  tut.addEventListener('pointerup', perdeBirak); tut.addEventListener('pointercancel', perdeBirak);

  /* ---------- çekerek yenile ---------- */
  const ESIK = 56;
  const gost = document.createElement('div');
  gost.className = 'cek-gost'; gost.setAttribute('aria-hidden', 'true');
  gost.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>';
  document.body.append(gost);
  let y0 = null, x0 = 0, p = 0, surukle = false, esikGecildi = false, mesgul = false;
  const gostGoster = (deger, op) => { gost.style.setProperty('--p', String(deger)); gost.style.opacity = String(op); };
  addEventListener('touchstart', e => {
    y0 = null; surukle = false;
    if (mesgul || e.touches.length !== 1 || window.scrollY > 0 || ana.hidden || document.body.style.overflow === 'hidden') return;
    if (e.target instanceof Element && e.target.closest('.sayfa, dialog, .grafik, .filtreler, .alt-nav, input, select, textarea')) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; p = 0; esikGecildi = false;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 === null) return;
    const dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
    if (!surukle) {
      if (Math.abs(dx) > 10 || dy < -6) { y0 = null; return; }   // yatay kaydırma ya da yukarı hareket: çekme değil
      if (dy > 8 && dy > Math.abs(dx) * 1.5) { surukle = true; gost.classList.add('surukle'); } else return;
    }
    p = Math.min(96, dy * 0.5);
    gostGoster(p, Math.min(1, p / ESIK));
    if (p >= ESIK && !esikGecildi) esikGecildi = true;
    if (p < ESIK) esikGecildi = false;
  }, { passive: true });
  const birak = async () => {
    if (y0 === null) return;
    y0 = null;
    if (!surukle) return;
    surukle = false; gost.classList.remove('surukle');
    if (p < ESIK) { gostGoster(0, 0); return; }
    mesgul = true; gost.classList.add('yukle'); gostGoster(ESIK - 8, 1);
    const basla = Date.now();
    try { if (typeof cek === 'function') await cek(); } catch { /* ağ hatası: göstergeler zaten bağlantıyı bildirir */ }
    setTimeout(() => { gost.classList.remove('yukle'); gostGoster(0, 0); mesgul = false; }, Math.max(0, 700 - (Date.now() - basla)));
  };
  addEventListener('touchend', birak, { passive: true });
  addEventListener('touchcancel', birak, { passive: true });
})();
