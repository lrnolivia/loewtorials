// Shared accessibility behavior for the site's existing modal overlays.
// Keeps background controls out of the keyboard/accessibility tree, moves
// focus into the dialog, restores it on close, and lets Escape close dialogs
// that already have a normal close action.
(function () {
  const stack = [];

  function resolveFocus(target, root) {
    if (target && typeof target.focus === 'function') return target;
    if (typeof target === 'string') return (root || document).querySelector(target);
    return null;
  }

  function activate(backdrop, options) {
    if (!backdrop || stack.some(entry => entry.backdrop === backdrop)) return;
    const opts = options || {};
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(document.body.children)
      .filter(element => element !== backdrop)
      .map(element => ({ element, wasInert: element.hasAttribute('inert') }));
    siblings.forEach(item => { item.element.setAttribute('inert', ''); });
    backdrop.removeAttribute('inert');

    const entry = { backdrop, trigger, returnFocus: opts.returnFocus, siblings, onKeydown: null };
    entry.onKeydown = event => {
      if (stack[stack.length - 1] !== entry || event.key !== 'Escape' || !opts.onEscape) return;
      event.preventDefault();
      opts.onEscape();
    };
    stack.push(entry);
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', entry.onKeydown);

    requestAnimationFrame(() => {
      const initial = resolveFocus(opts.initialFocus, backdrop)
        || backdrop.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (initial) initial.focus();
    });
  }

  function deactivate(backdrop) {
    const index = stack.findIndex(entry => entry.backdrop === backdrop);
    if (index === -1) return;
    const entry = stack[index];
    stack.splice(index, 1);
    document.removeEventListener('keydown', entry.onKeydown);
    entry.siblings.forEach(item => {
      if (item.wasInert) item.element.setAttribute('inert', '');
      else item.element.removeAttribute('inert');
    });
    if (!stack.length) document.body.classList.remove('modal-open');

    requestAnimationFrame(() => {
      const fallback = resolveFocus(entry.returnFocus, document);
      const target = entry.trigger && entry.trigger.isConnected && !entry.trigger.closest('[inert]') ? entry.trigger : fallback;
      if (target && target.isConnected && !target.closest('[inert]')) target.focus();
    });
  }

  window.ModalFocus = { activate, deactivate };
})();
