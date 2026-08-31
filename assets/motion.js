// Shared lightweight motion. Page snapping was removed: native scrolling is
// both more predictable and substantially cheaper in Safari.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const selector = '.wizard-card,.manage-row,.review-step,.review-item,.parse-item,.ref-link-card';
  let order = 0;
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
    if (el.dataset.motionSeen || reduce.matches || isSafari) return;
    el.dataset.motionSeen = '1';
    el.style.setProperty('--motion-order', Math.min(order++ % 10, 9));
    el.classList.add('motion-reveal');
    if (io) io.observe(el); else el.classList.add('motion-visible');
  }

  function scan(root) {
    if (root.matches && root.matches(selector)) reveal(root);
    if (root.querySelectorAll) root.querySelectorAll(selector).forEach(reveal);
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
    if (isSafari) document.documentElement.classList.add('is-safari');
    document.documentElement.classList.add('motion-ready');
    scan(document);
    new MutationObserver(records => requestAnimationFrame(() =>
      records.forEach(record => record.addedNodes.forEach(scan))))
      .observe(document.body, { childList: true, subtree: true });
    wireCardPress();
    document.addEventListener('visibilitychange', () =>
      document.documentElement.classList.toggle('motion-paused', document.hidden));
  }

  window.Motion = { scan, swap, prefersReducedMotion: () => reduce.matches };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
