// Shared motion and context-aware page snapping.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const selector = '.wizard-card,.manage-row,.review-step,.review-item,.parse-item,.article-step,.ref-link-card';
  let order = 0;
  let snapIndex = -1;
  let settledY = 0;
  let snapLock = false;
  let scrollTimer = 0;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      entry.target.classList.add('motion-visible');
      entry.target.addEventListener('animationend', () => {
        entry.target.classList.remove('motion-reveal', 'motion-visible');
        entry.target.style.removeProperty('--motion-order');
      }, { once: true });
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' }) : null;

  function reveal(el) {
    if (el.dataset.motionSeen || reduce.matches) return;
    el.dataset.motionSeen = '1';
    el.style.setProperty('--motion-order', Math.min(order++ % 10, 9));
    el.classList.add('motion-reveal');
    if (io) io.observe(el); else el.classList.add('motion-visible');
  }

  function updatePageSnap() {
    const article = document.querySelector('#wizardRoot[data-view-mode="article"]');
    const grid = document.querySelector('.wizard-grid');
    const oneColumn = grid && getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1;
    const enabled = !!article || !!oneColumn;
    document.documentElement.classList.toggle('motion-page-snap', enabled);
    document.body.classList.toggle('motion-page-snap', enabled);
    document.querySelectorAll('.snap-target').forEach(el => el.classList.remove('snap-target'));
    const targets = article ? article.querySelectorAll('.article-step')
      : oneColumn ? grid.querySelectorAll('.wizard-card') : [];
    targets.forEach(el => el.classList.add('snap-target'));
    if (!enabled) snapIndex = -1;
  }

  function snapOffset() {
    return Number(getComputedStyle(document.documentElement).scrollPaddingTop.replace('px', '')) || 0;
  }

  function settlePageSnap() {
    if (snapLock || reduce.matches || !document.documentElement.classList.contains('motion-page-snap')) return;
    const targets = [...document.querySelectorAll('.snap-target')];
    const delta = scrollY - settledY;
    if (!targets.length || Math.abs(delta) < 18) return;
    const direction = delta > 0 ? 1 : -1;
    const offset = snapOffset();

    if (snapIndex >= 0 && targets[snapIndex]) {
      const activeRect = targets[snapIndex].getBoundingClientRect();
      const available = innerHeight - offset - 20;
      if (activeRect.height > available) {
        if (direction > 0 && activeRect.bottom > innerHeight - 24) { settledY = scrollY; return; }
        if (direction < 0 && activeRect.top < offset - 24) { settledY = scrollY; return; }
      }
    }

    if (snapIndex < 0) {
      snapIndex = targets.reduce((best, el, index) =>
        Math.abs(el.getBoundingClientRect().top - offset) < Math.abs(targets[best].getBoundingClientRect().top - offset) ? index : best, 0);
    } else {
      snapIndex = Math.max(0, Math.min(targets.length - 1, snapIndex + direction));
    }

    snapLock = true;
    targets[snapIndex].scrollIntoView({ block: 'start', behavior: 'smooth' });
    setTimeout(() => { settledY = scrollY; snapLock = false; }, 460);
  }

  function scan(root) {
    if (root.matches && root.matches(selector)) reveal(root);
    if (root.querySelectorAll) root.querySelectorAll(selector).forEach(reveal);
    updatePageSnap();
  }

  function swap(el) {
    if (!el || reduce.matches) return;
    el.classList.remove('motion-swap');
    requestAnimationFrame(() => {
      el.classList.add('motion-swap');
      el.addEventListener('animationend', () => el.classList.remove('motion-swap'), { once: true });
    });
  }

  function wireCardPress() {
    let card = null, x = 0, y = 0;
    document.addEventListener('pointerdown', event => {
      const next = event.target.closest && event.target.closest('.wizard-card');
      if (!next || event.target.closest('button,a,input,select,textarea')) return;
      card = next; x = event.clientX; y = event.clientY;
      card.classList.add('is-pressed');
    }, { passive: true });
    document.addEventListener('pointermove', event => {
      if (!card || Math.hypot(event.clientX - x, event.clientY - y) <= 8) return;
      card.classList.remove('is-pressed'); card = null;
    }, { passive: true });
    const release = () => { if (card) card.classList.remove('is-pressed'); card = null; };
    document.addEventListener('pointerup', release, { passive: true });
    document.addEventListener('pointercancel', release, { passive: true });
  }

  function init() {
    document.documentElement.classList.add('motion-ready');
    scan(document);
    new MutationObserver(records => requestAnimationFrame(() =>
      records.forEach(record => record.addedNodes.forEach(scan))))
      .observe(document.body, { childList: true, subtree: true });
    wireCardPress();
    let queued = false;
    addEventListener('resize', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; updatePageSnap(); });
    }, { passive: true });
    if ('onscrollend' in window) addEventListener('scrollend', settlePageSnap, { passive: true });
    else addEventListener('scroll', () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(settlePageSnap, 140);
    }, { passive: true });
    addEventListener('hashchange', () => {
      const targets = [...document.querySelectorAll('.snap-target')];
      const match = targets.findIndex(el => '#' + el.id === location.hash);
      if (match >= 0) { snapIndex = match; settledY = scrollY; }
    });
    document.addEventListener('visibilitychange', () =>
      document.documentElement.classList.toggle('motion-paused', document.hidden));
  }

  window.Motion = { scan, swap, updatePageSnap, prefersReducedMotion: () => reduce.matches };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
