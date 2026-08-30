// header.js
// The persistent app header — injected into #appHeaderMount on both
// index.html and wizard.html so the markup lives in one place instead
// of being duplicated across two HTML files. Owns:
//   - the sticky utility bar (home, mark, search, paintbrush, gear)
//   - the hero + specs bar beneath it, which disappear instantly (no
//     transition) once the page scrolls, while the mini mark/specs in
//     the utility bar take over — see the .scrolled rules in styles.css
//   - the paintbrush popover: style/theme/mode/corners + customize +
//     font overrides, everything that used to live in the settings
//     modal, now reachable from every screen
//   - the search-to-dropdown wizard switcher
// The gear icon just opens the existing settings modal (assets/settings.js).

// Static specs for one real machine — no longer a per-browser editable
// form (see assets/profile.js for why). Change these two lines if the
// hardware changes.
const HEADER_SPECS = [
  { icon: '\u{1F5A5}\uFE0F', label: 'ASRock B650E PG Riptide WiFi' },
  { icon: '\u{1F3AE}', label: 'RTX 4070' },
  { icon: '\u{1F4BE}', label: '32GB' },
  { icon: '\u{1F427}', label: 'SteamOS' }
];

const CUSTOMIZE_ROWS = [
  { key: 'bg', label: 'Background', pairKey: 'tx', floor: 4.5, neutral: true },
  { key: 'panel', label: 'Panel', pairKey: 'tx', floor: 4.5, neutral: true },
  { key: 'surf', label: 'Surface', pairKey: 'surft', floor: 4.5, neutral: true },
  { key: 'border', label: 'Border', pairKey: null, floor: null, neutral: true },
  { key: 'a1', label: 'Accent 1', pairKey: 'a1t', floor: 3, neutral: false },
  { key: 'a2', label: 'Accent 2', pairKey: 'a2t', floor: 3, neutral: false },
  { key: 'a3', label: 'Accent 3', pairKey: 'a3t', floor: 3, neutral: false },
  { key: 'card', label: 'Card', pairKey: 'cardt', floor: 3, neutral: false }
];

function presetValue(row, familyId, mode) {
  const fam = FAMILIES[familyId];
  if (row.neutral) return fam[mode][row.key];
  if (row.key === 'card') return fam.card || fam.a2;
  return fam[row.key];
}

// ---------------------------------------------------------------------
// WCAG contrast check (used only to warn on a manual customize edit,
// never to block a save).
// ---------------------------------------------------------------------
function hexToRgb01(hex) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16) || 0;
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}
function relLuminance(hex) {
  const rgb = hexToRgb01(hex);
  const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}
function contrastRatio(hexA, hexB) {
  const l1 = relLuminance(hexA), l2 = relLuminance(hexB);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------
// Header markup
// ---------------------------------------------------------------------
// Split into two pieces, mounted separately:
//   - buildUtilityHTML(): the persistent sticky top bar (icons, search,
//     mini brand/specs once scrolled). Always mounted at #appHeaderMount,
//     full width, but its own content is capped to --shell-max-width
//     (see .utility-inner in styles.css) so it lines up with the
//     sidebar+content grid beneath it.
//   - buildHeroHTML(): the big mark/title/tagline + specs bar. Mounted at
//     #appHeroMount, which each page places *inside* its content column
//     (to the right of the sidebar rail) instead of full-width above the
//     grid — that's what lets the sidebar sit beside the hero and
//     connect visually to the top bar, instead of only starting below
//     the whole hero block.
function buildUtilityHTML() {
  const onGuide = document.body.classList.contains('guide-page');
  const miniSpecsHtml = HEADER_SPECS.map(s => '<span class="mini-spec" title="' + s.label + '" aria-label="' + s.label + '">' + s.icon + '</span>').join('');

  return '' +
  '<header class="app-header">' +
    '<div class="utility">' +
      '<div class="utility-inner">' +
        (onGuide ? '<button class="home-btn" id="hdrHomeBtn" title="Back" aria-label="Back">\u2190</button>' : '') +
        '<div class="mini-brand"><span class="mark">\u{1F9F0}</span><span class="word">loewtorials</span></div>' +
        '<div class="mini-specs" id="hdrMiniSpecs">' + miniSpecsHtml + '</div>' +
        '<div class="header-spacer"></div>' +
        '<div class="hsearch" id="hdrSearch">' +
          '<button class="hsearch-btn" id="hdrSearchOpenBtn" title="Jump to a wizard">\u{1F50D}</button>' +
          '<div class="hsearch-box">' +
            '<input type="text" id="hdrSearchInput" placeholder="Jump to a wizard\u2026">' +
            '<button class="hsearch-close" id="hdrSearchCloseBtn" type="button">\u2715</button>' +
          '</div>' +
          '<div class="hsearch-drop" id="hdrSearchDrop"></div>' +
        '</div>' +
        '<div class="theme-pop-anchor" id="hdrPaintAnchor">' +
          '<button class="header-icon-btn" id="hdrPaintBtn" title="Theme">\u{1F58C}\uFE0F</button>' +
          '<div class="theme-pop" id="hdrThemePop"></div>' +
        '</div>' +
        '<button class="header-icon-btn" id="hdrGearBtn" title="Settings">\u2699\uFE0F</button>' +
      '</div>' +
    '</div>' +
    '<div class="a3-stripe"></div>' +
  '</header>';
}

function buildHeroHTML() {
  const tagline = document.body.classList.contains('guide-page')
    ? 'Guides for my gaming PC, web projects, and whatever I build next.'
    : 'Interactive step-by-step guides for your own Bazzite/SteamOS setup \u2014 built to grow.';
  const specsHtml = HEADER_SPECS.map(s =>
    '<span class="spec-item"><span class="spec-icon">' + s.icon + '</span><b>' + s.label + '</b></span>').join('');

  return '' +
    '<section class="app-hero">' +
      '<div class="mark">\u{1F9F0}</div>' +
      '<h1>loewtorials</h1>' +
      '<p class="tagline">' + tagline + '</p>' +
    '</section>' +
    '<div class="specs-bar-wrap">' +
      '<div class="specs-bar" id="hdrSpecsBar">' + specsHtml + '</div>' +
    '</div>';
}

// ---------------------------------------------------------------------
// Theme popover markup + wiring
// ---------------------------------------------------------------------
function buildThemePopHTML() {
  const themeSwatches = Object.keys(FAMILIES).map(id => {
    const fam = FAMILIES[id];
    return '<button class="theme-swatch" data-theme-id="' + id + '" title="' + fam.label + '" ' +
      'style="--sw-a1:' + fam.a1 + '; --sw-a2:' + fam.a2 + '; --sw-a3:' + fam.a3 + ';"></button>';
  }).join('');

  const customizeRows = CUSTOMIZE_ROWS.map(row => {
    const presets = Object.keys(FAMILIES).map(id =>
      '<button class="preset-dot" data-preset-key="' + row.key + '" title="' + FAMILIES[id].label + '"></button>').join('');
    return '' +
      '<div class="swatch-row" data-swatch-row="' + row.key + '">' +
        '<span class="swatch-label">' + row.label + '</span>' +
        '<div class="swatch-presets">' + presets + '</div>' +
        '<button class="swatch-custom-btn" data-custom-for="' + row.key + '" title="Custom color" type="button">\u{1F3A8}</button>' +
        '<input type="color" data-swatch-input="' + row.key + '" style="display:none;">' +
        '<span class="swatch-warn" data-swatch-warn="' + row.key + '"></span>' +
      '</div>';
  }).join('');

  function fontSelect(kind) {
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    const opts = FONT_ALTERNATES[kind].map(f =>
      '<option value="' + encodeURIComponent(f.value) + '">' + f.label + '</option>').join('');
    return '' +
      '<div class="font-override-row">' +
        '<label>' + label + ' font</label>' +
        '<select data-font-slot="' + kind + '"><option value="">Default</option>' + opts + '</select>' +
      '</div>';
  }

  return '' +
    '<h5>Style</h5>' +
    '<div class="switch-2" id="popStyleSwitch" data-toggle="style"><button data-value="brutal">Neo-brutalism</button><button data-value="dopamine">Dopamine</button></div>' +
    '<h5>Color theme</h5>' +
    '<div class="theme-swatches" id="popThemeSwatches">' + themeSwatches + '</div>' +
    '<h5>Mode</h5>' +
    '<div class="switch-2" id="popModeSwitch" data-toggle="mode"><button data-value="light">Light</button><button data-value="dark">Dark</button></div>' +
    '<h5>Corners</h5>' +
    '<div class="switch-2" id="popCornersSwitch" data-toggle="corners"><button data-value="square">Square</button><button data-value="rounded">Rounded</button></div>' +
    '<h5>Background pattern</h5>' +
    '<div class="background-previews" id="popBackgroundPreviews">' + BACKGROUND_OPTIONS.map(b => '<button type="button" class="background-preview bg-preview-' + b.id + '" data-background="' + b.id + '"><span></span><b>' + b.label.replace(' (default)', '') + '</b></button>').join('') + '</div>' +
    '<input type="file" id="popBackgroundFile" accept="image/*" hidden>' +
    '<h5>Customize</h5>' +
    '<div class="customize-grid" id="popCustomizeGrid">' + customizeRows + '</div>' +
    '<button class="btn btn-ghost btn-sm" id="popCustomizeReset" type="button" style="margin-top:6px;">Reset customization</button>' +
    '<h5>Fonts</h5>' +
    fontSelect('display') + fontSelect('body') + fontSelect('mono');
}

let _themePrefs = null;

function currentThemePrefs() {
  return Object.assign({}, DEFAULT_THEME_PREFS, Storage.getThemePrefs());
}

function refreshCustomizeUI() {
  const tokens = resolveTokens(_themePrefs);
  CUSTOMIZE_ROWS.forEach(row => {
    const input = document.querySelector('[data-swatch-input="' + row.key + '"]');
    if (input) input.value = /^#/.test(tokens[row.key]) ? tokens[row.key] : '#000000';
    const warn = document.querySelector('[data-swatch-warn="' + row.key + '"]');
    if (warn) {
      if (row.pairKey && tokens[row.key] && tokens[row.pairKey]) {
        const ratio = contrastRatio(tokens[row.key], tokens[row.pairKey]);
        warn.textContent = ratio < row.floor ? '\u26A0' : '';
        warn.title = ratio < row.floor ? ('Low contrast (' + ratio.toFixed(1) + ':1)') : '';
      } else {
        warn.textContent = '';
      }
    }
  });
}

function syncSwitchUI(elId, value) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.getAttribute('data-value') === value));
}

function refreshPresetDots() {
  CUSTOMIZE_ROWS.forEach(row => {
    Object.keys(FAMILIES).forEach(id => {
      const dot = document.querySelector(
        '.preset-dot[data-preset-key="' + row.key + '"][title="' + FAMILIES[id].label + '"]'
      );
      if (!dot) return;
      const val = presetValue(row, id, _themePrefs.mode);
      dot.style.background = val;
      dot.dataset.actualValue = val;
    });
  });
}

function syncThemePopUI() {
  syncSwitchUI('popStyleSwitch', _themePrefs.style);
  syncSwitchUI('popModeSwitch', _themePrefs.mode);
  syncSwitchUI('popCornersSwitch', _themePrefs.corners);
  document.querySelectorAll('#popThemeSwatches button').forEach(b =>
    b.classList.toggle('on', b.getAttribute('data-theme-id') === _themePrefs.theme));
  const currentBackground = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings()).background;
  document.querySelectorAll('#popBackgroundPreviews button').forEach(b => b.classList.toggle('on', b.dataset.background === currentBackground));
  refreshPresetDots(); // neutral-token presets (bg/panel/surf/border) depend on mode, so these must be redone on every state change, not just once at init
  refreshCustomizeUI();
  ['display', 'body', 'mono'].forEach(kind => {
    const sel = document.querySelector('[data-font-slot="' + kind + '"]');
    if (sel) sel.value = (_themePrefs.fontOverrides && _themePrefs.fontOverrides[kind]) ? encodeURIComponent(_themePrefs.fontOverrides[kind]) : '';
  });
}

function setThemePrefs(patch) {
  _themePrefs = Object.assign({}, _themePrefs, patch);
  applyTheme(_themePrefs);
  Storage.setThemePrefs(_themePrefs);
  syncThemePopUI();
}

function wireThemePop() {
  document.getElementById('popStyleSwitch').addEventListener('click', e => {
    const b = e.target.closest('button[data-value]'); if (!b) return;
    setThemePrefs({ style: b.getAttribute('data-value') });
  });
  document.getElementById('popModeSwitch').addEventListener('click', e => {
    const b = e.target.closest('button[data-value]'); if (!b) return;
    // light/dark carry different neutral values — a customization made
    // in one mode isn't meaningful in the other.
    setThemePrefs({ mode: b.getAttribute('data-value'), customPalette: null });
  });
  document.getElementById('popCornersSwitch').addEventListener('click', e => {
    const b = e.target.closest('button[data-value]'); if (!b) return;
    setThemePrefs({ corners: b.getAttribute('data-value') });
  });
  document.getElementById('popBackgroundPreviews').addEventListener('click', e => {
    const button = e.target.closest('button[data-background]');
    if (!button) return;
    if (button.dataset.background === 'custom') { document.getElementById('popBackgroundFile').click(); return; }
    const settings = Storage.setSettings({ background: button.dataset.background });
    applyAppearance(settings);
    syncThemePopUI();
  });
  document.getElementById('popBackgroundFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = event => {
      const img = new Image();
      img.onload = () => {
        const max = 1920;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const settings = Storage.setSettings({ background:'custom', backgroundImage:canvas.toDataURL('image/jpeg', .82) });
        applyAppearance(settings); syncThemePopUI();
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  document.getElementById('popThemeSwatches').addEventListener('click', e => {
    const b = e.target.closest('button[data-theme-id]'); if (!b) return;
    // switching color families invalidates any per-token diff from the
    // previous family — a cream customization doesn't mean anything
    // applied to mono's tokens.
    setThemePrefs({ theme: b.getAttribute('data-theme-id'), customPalette: null });
  });

  function editCustom(key, value) {
    const patch = {};
    patch[key] = value;
    _themePrefs.customPalette = Object.assign({}, _themePrefs.customPalette || {}, patch);
    applyTheme(_themePrefs);
    Storage.setThemePrefs(_themePrefs);
    refreshCustomizeUI();
  }

  document.getElementById('popCustomizeGrid').addEventListener('click', e => {
    const preset = e.target.closest('.preset-dot');
    if (preset) { editCustom(preset.getAttribute('data-preset-key'), preset.dataset.actualValue); return; }
    const customBtn = e.target.closest('.swatch-custom-btn');
    if (customBtn) {
      const key = customBtn.getAttribute('data-custom-for');
      document.querySelector('[data-swatch-input="' + key + '"]').click();
    }
  });
  CUSTOMIZE_ROWS.forEach(row => {
    const input = document.querySelector('[data-swatch-input="' + row.key + '"]');
    if (input) input.addEventListener('input', () => editCustom(row.key, input.value));
  });
  document.getElementById('popCustomizeReset').addEventListener('click', () => setThemePrefs({ customPalette: null }));

  ['display', 'body', 'mono'].forEach(kind => {
    const sel = document.querySelector('[data-font-slot="' + kind + '"]');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const raw = sel.value ? decodeURIComponent(sel.value) : null;
      const overrides = Object.assign({}, _themePrefs.fontOverrides || {});
      if (raw) overrides[kind] = raw; else delete overrides[kind];
      setThemePrefs({ fontOverrides: Object.keys(overrides).length ? overrides : null });
    });
  });
}

// ---------------------------------------------------------------------
// Search-to-dropdown wizard switcher
// ---------------------------------------------------------------------
let _wizardListCache = null;
function loadWizardList() {
  if (_wizardListCache) return Promise.resolve(_wizardListCache);
  return fetch('wizards/manifest.json')
    .then(r => r.json())
    .then(manifest => {
      const all = Storage.getAllWizardMeta(manifest.wizards || []);
      _wizardListCache = all.filter(w => w.status !== 'archived');
      return _wizardListCache;
    })
    .catch(() => []);
}

function renderSearchDrop(list, query) {
  const drop = document.getElementById('hdrSearchDrop');
  const q = (query || '').toLowerCase();
  const matches = list.filter(w => (w.title || '').toLowerCase().includes(q)).slice(0, 8);
  drop.innerHTML = matches.length
    ? matches.map(w => '<div class="hsearch-item" data-wizard-id="' + w.id + '"><span>' + (w.title || w.id) + '</span><span class="search-category">' + (w.category || 'Uncategorized') + '</span></div>').join('')
    : '<div class="hsearch-empty">No matching wizards</div>';
  drop.querySelectorAll('.hsearch-item').forEach(item => {
    item.addEventListener('click', () => { location.href = 'wizard.html?id=' + encodeURIComponent(item.getAttribute('data-wizard-id')); });
  });
}

function wireSearch() {
  const search = document.getElementById('hdrSearch');
  const input = document.getElementById('hdrSearchInput');
  document.getElementById('hdrSearchOpenBtn').addEventListener('click', () => {
    search.classList.add('open');
    loadWizardList().then(list => renderSearchDrop(list, ''));
    setTimeout(() => input.focus(), 30);
  });
  document.getElementById('hdrSearchCloseBtn').addEventListener('click', () => {
    search.classList.remove('open');
    input.value = '';
  });
  input.addEventListener('input', () => loadWizardList().then(list => renderSearchDrop(list, input.value)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') search.classList.remove('open'); });

  const railSearch = document.getElementById('railSearchInput');
  const railDrop = document.getElementById('railSearchDrop');
  if (railSearch && railDrop) {
    const renderRailResults = query => loadWizardList().then(list => {
      const q = String(query || '').toLowerCase();
      const matches = list.filter(w => [w.title, w.category, ...(w.tags || [])].join(' ').toLowerCase().includes(q)).slice(0, 8);
      railDrop.innerHTML = matches.map(w => '<button type="button" data-wizard-id="' + w.id + '"><span>' + (w.title || w.id) + '</span><span class="search-category">' + (w.category || 'Uncategorized') + '</span></button>').join('') || '<p>No matches</p>';
      railDrop.querySelectorAll('[data-wizard-id]').forEach(item => item.addEventListener('click', () => { location.href = 'wizard.html?id=' + encodeURIComponent(item.dataset.wizardId); }));
    });
    railSearch.addEventListener('focus', () => renderRailResults(railSearch.value));
    railSearch.addEventListener('input', () => renderRailResults(railSearch.value));
  }
}

// ---------------------------------------------------------------------
// Popover open/close + gear + home + scroll
// ---------------------------------------------------------------------
function wireIconButtons() {
  const paintAnchor = document.getElementById('hdrPaintAnchor');
  document.getElementById('hdrPaintBtn').addEventListener('click', e => {
    e.stopPropagation();
    paintAnchor.classList.toggle('open');
  });
  document.addEventListener('click', e => {
    if (!paintAnchor.contains(e.target)) paintAnchor.classList.remove('open');
    const search = document.getElementById('hdrSearch');
    if (!search.contains(e.target)) search.classList.remove('open');
  });
  document.getElementById('hdrThemePop').addEventListener('click', e => e.stopPropagation());

  let settingsModal = null;
  document.getElementById('hdrGearBtn').addEventListener('click', () => {
    if (!settingsModal) settingsModal = initSettingsModal();
    settingsModal.open();
  });

  const homeBtn = document.getElementById('hdrHomeBtn');
  if (homeBtn) homeBtn.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.href = 'index.html';
  });

  // Threshold uses hysteresis (collapse past 70, only re-expand at the
  // true page top) rather than one fixed number — a single threshold fights
  // with CSS scroll anchoring: collapsing .app-hero/.specs-bar-wrap
  // removes ~260px of content above .stage-top, and on a wizard step
  // short enough that 70px of scroll is close to the page's entire
  // scroll range, the browser's anchoring compensates for that shrink by
  // adjusting scrollY back down past 70, which re-expands the hero,
  // regrows the page, and lets scrollY drift past 70 again — an infinite
  // collapse/expand/collapse loop that made goTo()'s scrollIntoView never
  // settle (see wizard-engine.js). The gap between the two numbers is
  // the fix: once collapsed, even a large layout change (for example,
  // switching from a long Article to a short Guided step) cannot re-open
  // the hero mid-page and restart the loop. Belt-and-suspenders with
  // the `overflow-anchor:none` on .app-hero/.specs-bar-wrap in
  // styles.css, which stops anchoring from compensating for their
  // resize at all.
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > 70) document.body.classList.add('scrolled');
    else if (y < 4) document.body.classList.remove('scrolled');
    const topButton = document.getElementById('backToTop');
    if (topButton) topButton.classList.toggle('show', y > Math.max(500, innerHeight * .75));
  }, { passive: true });

  let topButton = document.getElementById('backToTop');
  if (!topButton) {
    topButton = document.createElement('button'); topButton.id = 'backToTop'; topButton.className = 'back-to-top'; topButton.innerHTML = '&uarr; Back to top'; document.body.appendChild(topButton);
  }
  topButton.addEventListener('click', () => window.scrollTo({ top:0, behavior:'smooth' }));

  let pull = document.getElementById('pullRefresh');
  if (!pull) {
    pull = document.createElement('div'); pull.id = 'pullRefresh'; pull.className = 'pull-refresh'; pull.innerHTML = '<span>&#8635;</span> Pull to refresh'; document.body.appendChild(pull);
  }
  let pullStart = null, pullDistance = 0;
  window.addEventListener('touchstart', e => { if (scrollY === 0 && e.touches.length === 1) pullStart = e.touches[0].clientY; }, { passive:true });
  window.addEventListener('touchmove', e => {
    if (pullStart == null) return;
    pullDistance = Math.max(0, Math.min(130, e.touches[0].clientY - pullStart));
    pull.classList.toggle('show', pullDistance > 18);
    pull.classList.toggle('ready', pullDistance > 82);
    pull.innerHTML = '<span>&#8635;</span> ' + (pullDistance > 82 ? 'Release to refresh' : 'Pull to refresh');
  }, { passive:true });
  window.addEventListener('touchend', () => {
    const shouldRefresh = pullDistance > 82;
    pullStart = null; pullDistance = 0;
    if (shouldRefresh) { pull.innerHTML = '<span>&#8635;</span> Refreshing…'; setTimeout(() => location.reload(), 120); }
    else pull.classList.remove('show', 'ready');
  }, { passive:true });
}

function initHeader() {
  const mount = document.getElementById('appHeaderMount');
  if (!mount) return;
  mount.innerHTML = buildUtilityHTML();

  const heroMount = document.getElementById('appHeroMount');
  const railHeroMount = document.getElementById('railHeroMount');
  if (document.body.classList.contains('guide-page') && railHeroMount && heroMount) {
    const holder = document.createElement('div');
    holder.innerHTML = buildHeroHTML();
    railHeroMount.appendChild(holder.querySelector('.app-hero'));
    heroMount.appendChild(holder.querySelector('.specs-bar-wrap'));
  } else if (heroMount) heroMount.innerHTML = buildHeroHTML();

  _themePrefs = currentThemePrefs();
  document.getElementById('hdrThemePop').innerHTML = buildThemePopHTML();
  wireThemePop();
  syncThemePopUI();

  wireSearch();
  wireIconButtons();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHeader);
else initHeader();
