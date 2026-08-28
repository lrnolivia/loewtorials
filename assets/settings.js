// settings.js
// Two independent settings surfaces sharing one modal:
//   1) Theme (style / color theme / mode + optional customize + font
//      overrides) — persisted via Storage.getThemePrefs()/setThemePrefs(),
//      applied via assets/theme.js's applyTheme(). See theme.js for the
//      FAMILIES data this section reads from.
//   2) Layout/background (shell width, sidebar gap, text scale,
//      background variant) — persisted via Storage.getSettings()/
//      setSettings(), applied via applyAppearance() below. Unrelated to
//      color/fonts, kept separate on purpose so switching a color theme
//      never touches someone's layout tweaks or vice versa.

const BACKGROUND_OPTIONS = [
  { id: 'grid', label: 'Dot grid (default)' },
  { id: 'solid', label: 'Solid' },
  { id: 'none', label: 'None' },
  { id: 'custom', label: 'Custom image' }
];

const DEFAULT_SETTINGS = {
  background: 'grid',
  backgroundImage: null,  // data URL, only used when background === 'custom'
  layoutWidth: 1180,      // px, feeds --shell-max-width
  sidebarGap: 22,         // px, feeds --sidebar-gap
  textScale: 1
};

function applyBackground(settings) {
  const body = document.body;
  if (!body) return;
  if (settings.background === 'solid') {
    body.style.backgroundImage = 'none';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'none') {
    body.style.backgroundImage = 'none';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'custom' && settings.backgroundImage) {
    body.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url(' + settings.backgroundImage + ')';
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'fixed';
  } else {
    // grid (default) — clear inline overrides so the CSS default shows.
    body.style.backgroundImage = '';
    body.style.backgroundSize = '';
    body.style.backgroundPosition = '';
    body.style.backgroundRepeat = '';
    body.style.backgroundColor = '';
    body.style.backgroundAttachment = '';
  }
}

// Layout/background only — color and fonts are applyTheme()'s job now
// (assets/theme.js). Safe to call repeatedly (e.g. live-preview while
// the modal is open).
function applyAppearance(rawSettings) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, rawSettings || {});
  const root = document.documentElement.style;

  root.setProperty('--shell-max-width', settings.layoutWidth + 'px');
  root.setProperty('--sidebar-gap', settings.sidebarGap + 'px');
  root.setProperty('--text-scale', String(settings.textScale));

  if (document.body) applyBackground(settings);
  else document.addEventListener('DOMContentLoaded', () => applyBackground(settings));

  return settings;
}

// Called once, very early (see the <head> snippet in index.html /
// wizard.html) so layout/background don't flash to default before the
// full script loads. Theme (color/font) boot is handled separately by
// theme.js's bootTheme() — see the same <head> snippet.
function bootAppearance() {
  try { applyAppearance(Storage.getSettings()); }
  catch (e) { /* ignore, defaults already in CSS */ }
}

// ---------------------------------------------------------------------
// WCAG contrast check (spec §5) — used only to warn on a manual
// customize-swatch edit, never to block a save.
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
// Theme editor (style / color theme / mode / customize / fonts)
// ---------------------------------------------------------------------

// Which primitive tokens are user-customizable (§8: "a full token diff
// against the selected family"), each paired with the *safe-text*
// variable it's checked against and the contrast floor that pairing
// needs (body text 4.5:1, bold/badge-scale text 3:1 — see §5).
const CUSTOMIZE_ROWS = [
  { key: 'bg', label: 'Background', pairKey: 'tx', floor: 4.5 },
  { key: 'panel', label: 'Panel', pairKey: 'tx', floor: 4.5 },
  { key: 'surf', label: 'Surface', pairKey: 'surft', floor: 4.5 },
  { key: 'border', label: 'Border', pairKey: null, floor: null },
  { key: 'a1', label: 'Accent 1', pairKey: 'a1t', floor: 3 },
  { key: 'a2', label: 'Accent 2', pairKey: 'a2t', floor: 3 },
  { key: 'a3', label: 'Accent 3', pairKey: 'a3t', floor: 3 }
];

function currentThemePrefs() {
  return Object.assign({}, DEFAULT_THEME_PREFS, Storage.getThemePrefs());
}

function buildStyleToggleHTML() {
  return '' +
    '<div class="toggle-group" id="style-toggle" data-toggle="style">' +
      '<button data-value="brutal">Neo-brutalism</button>' +
      '<button data-value="dopamine">Dopamine</button>' +
    '</div>';
}
function buildThemeToggleHTML() {
  const buttons = Object.keys(FAMILIES).map(id => '<button data-value="' + id + '">' + FAMILIES[id].label + '</button>').join('');
  return '<div class="toggle-group" id="theme-toggle" data-toggle="theme">' + buttons + '</div>';
}
function buildModeToggleHTML() {
  return '' +
    '<div class="toggle-group" id="mode-toggle" data-toggle="mode">' +
      '<button data-value="light">Light</button>' +
      '<button data-value="dark">Dark</button>' +
    '</div>';
}

function buildFontOverrideHTML() {
  function slot(kind) {
    const label = kind.charAt(0).toUpperCase() + kind.slice(1);
    const opts = FONT_ALTERNATES[kind].map(f =>
      '<option value="' + encodeURIComponent(f.value) + '">' + f.label + '</option>').join('');
    return '' +
      '<div class="field">' +
        '<label>' + label + ' font</label>' +
        '<select data-font-slot="' + kind + '">' +
          '<option value="">Match theme</option>' + opts +
        '</select>' +
      '</div>';
  }
  return '<div class="font-override-grid">' + slot('display') + slot('body') + slot('mono') + '</div>';
}

function buildCustomizeHTML() {
  const rows = CUSTOMIZE_ROWS.map(row => '' +
    '<div class="swatch-row" data-swatch-row="' + row.key + '">' +
      '<span class="swatch-label">' + row.label + '</span>' +
      '<input type="color" data-swatch-input="' + row.key + '">' +
      '<span class="swatch-warn" data-swatch-warn="' + row.key + '" title="Low contrast against its paired text color"></span>' +
    '</div>').join('');
  return '' +
    '<div class="customize-grid" id="customize-grid">' + rows + '</div>' +
    '<div id="card-swatch-row"></div>' +
    '<button class="btn btn-ghost btn-sm" id="customize-reset" type="button">Reset customization</button>';
}

function buildLivePreviewHTML() {
  // Reuses real component classes/markup so the preview is exactly what
  // the rest of the app will look like — no separate preview-only CSS,
  // no risk of it drifting from the real rules in styles.css/*.css.
  return '' +
    '<div class="theme-live-preview">' +
      '<div class="spec-card" style="margin-top:0;">' +
        '<span class="spec-item"><span class="spec-ico">\uD83D\uDDA5\uFE0F</span> Model <strong>ROG Ally</strong></span>' +
        '<span class="spec-item"><span class="spec-ico">\uD83C\uDFAE</span> GPU <strong>RDNA3</strong></span>' +
      '</div>' +
      '<div class="wizard-card" style="margin-top:12px;">' +
        '<div class="card-top">' +
          '<h3>Fix dirty NTFS partition</h3>' +
          '<span class="badge">Storage</span>' +
        '</div>' +
        '<p class="card-sub">A short wizard preview</p>' +
        '<div class="tag-row"><span class="tag">ntfs</span><span class="tag">dual-boot</span></div>' +
        '<div class="card-bottom">' +
          '<button class="btn btn-primary btn-sm">Next step \u2192</button>' +
          '<button class="btn btn-ghost btn-sm">\u2190 Back</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function refreshSwatchesFromResolved(prefs) {
  const tokens = resolveTokens(prefs);
  CUSTOMIZE_ROWS.forEach(row => {
    const input = document.querySelector('[data-swatch-input="' + row.key + '"]');
    if (input) input.value = /^#/.test(tokens[row.key]) ? tokens[row.key] : '#000000';
    const warn = document.querySelector('[data-swatch-warn="' + row.key + '"]');
    if (warn) {
      if (row.pairKey && tokens[row.key] && tokens[row.pairKey]) {
        const ratio = contrastRatio(tokens[row.key], tokens[row.pairKey]);
        warn.textContent = ratio < row.floor ? ('\u26A0 low contrast (' + ratio.toFixed(1) + ':1)') : '';
      } else {
        warn.textContent = '';
      }
    }
  });
  // "card" swatch only shown when this family overrides it away from a2
  // (per spec §8) — otherwise there's nothing distinct to customize.
  const fam = FAMILIES[prefs.theme] || FAMILIES.cream;
  const cardRow = document.getElementById('card-swatch-row');
  if (cardRow) {
    if (fam.card) {
      cardRow.innerHTML = '' +
        '<div class="swatch-row" data-swatch-row="card">' +
          '<span class="swatch-label">Card</span>' +
          '<input type="color" data-swatch-input="card">' +
          '<span class="swatch-warn" data-swatch-warn="card"></span>' +
        '</div>';
      const input = cardRow.querySelector('[data-swatch-input="card"]');
      const val = tokens.card;
      if (input) input.value = /^#/.test(val) ? val : '#000000';
      const warn = cardRow.querySelector('[data-swatch-warn="card"]');
      if (warn) {
        const ratio = contrastRatio(tokens.card, tokens.cardt);
        warn.textContent = ratio < 3 ? ('\u26A0 low contrast (' + ratio.toFixed(1) + ':1)') : '';
      }
      if (input) input.addEventListener('input', () => onCustomizeEdit('card', input.value));
    } else {
      cardRow.innerHTML = '';
    }
  }
}

function syncToggleUI(groupId, value) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-value') === value);
  });
}

function syncThemeFormFromPrefs(prefs) {
  syncToggleUI('style-toggle', prefs.style);
  syncToggleUI('theme-toggle', prefs.theme);
  syncToggleUI('mode-toggle', prefs.mode);
  refreshSwatchesFromResolved(prefs);
  ['display', 'body', 'mono'].forEach(kind => {
    const sel = document.querySelector('[data-font-slot="' + kind + '"]');
    if (sel) sel.value = (prefs.fontOverrides && prefs.fontOverrides[kind]) ? encodeURIComponent(prefs.fontOverrides[kind]) : '';
  });
}

let _themePrefs = null;

function onCustomizeEdit(key, value) {
  const patch = {};
  patch[key] = value;
  _themePrefs.customPalette = Object.assign({}, _themePrefs.customPalette || {}, patch);
  applyTheme(_themePrefs);
  Storage.setThemePrefs(_themePrefs);
  refreshSwatchesFromResolved(_themePrefs);
}

function wireThemeEditor() {
  _themePrefs = currentThemePrefs();

  function setAndApply(patch) {
    _themePrefs = Object.assign({}, _themePrefs, patch);
    applyTheme(_themePrefs);
    Storage.setThemePrefs(_themePrefs);
    syncThemeFormFromPrefs(_themePrefs);
  }

  document.getElementById('style-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    setAndApply({ style: btn.getAttribute('data-value') });
  });
  document.getElementById('theme-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    // switching color families invalidates any per-token diff from the
    // previous family (§8) — a cream customization doesn't mean
    // anything applied to mono's tokens.
    setAndApply({ theme: btn.getAttribute('data-value'), customPalette: null });
  });
  document.getElementById('mode-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-value]');
    if (!btn) return;
    // light/dark carry entirely different neutral values, so a
    // customization made in one mode isn't meaningful in the other.
    setAndApply({ mode: btn.getAttribute('data-value'), customPalette: null });
  });

  CUSTOMIZE_ROWS.forEach(row => {
    const input = document.querySelector('[data-swatch-input="' + row.key + '"]');
    if (input) input.addEventListener('input', () => onCustomizeEdit(row.key, input.value));
  });

  document.getElementById('customize-reset').addEventListener('click', () => {
    setAndApply({ customPalette: null });
  });

  ['display', 'body', 'mono'].forEach(kind => {
    const sel = document.querySelector('[data-font-slot="' + kind + '"]');
    if (!sel) return;
    sel.addEventListener('change', () => {
      const raw = sel.value ? decodeURIComponent(sel.value) : null;
      const overrides = Object.assign({}, _themePrefs.fontOverrides || {});
      if (raw) overrides[kind] = raw; else delete overrides[kind];
      setAndApply({ fontOverrides: Object.keys(overrides).length ? overrides : null });
    });
  });

  syncThemeFormFromPrefs(_themePrefs);
}

// ---------------------------------------------------------------------
// Settings modal (theme editor + layout/background + backup)
// ---------------------------------------------------------------------
function buildSettingsModalHTML() {
  const bgOpts = BACKGROUND_OPTIONS.map(b => '<option value="' + b.id + '">' + b.label + '</option>').join('');

  return '' +
  '<div class="modal-backdrop hidden" id="settings-backdrop">' +
    '<div class="modal settings-modal">' +
      '<button class="modal-close" id="settings-close" aria-label="Close">&times;</button>' +
      '<h2>Appearance &amp; layout</h2>' +
      '<p class="hint">Changes apply live. Everything here is saved to this browser.</p>' +

      '<div class="field"><label>Style</label>' + buildStyleToggleHTML() + '</div>' +
      '<div class="field"><label>Color theme</label>' + buildThemeToggleHTML() + '</div>' +
      '<div class="field"><label>Mode</label>' + buildModeToggleHTML() + '</div>' +

      buildLivePreviewHTML() +

      '<div class="divider">customize</div>' +
      buildCustomizeHTML() +

      '<div class="divider">fonts</div>' +
      buildFontOverrideHTML() +

      '<div class="divider">layout</div>' +
      '<div class="settings-grid">' +
        '<div class="field">' +
          '<label>Background</label>' +
          '<select id="set-background">' + bgOpts + '</select>' +
        '</div>' +
        '<div class="field" id="bg-upload-field" style="display:none">' +
          '<label>Background image</label>' +
          '<div class="dropzone" id="bg-dropzone">' +
            '<strong>Click to upload</strong> or drag an image here. Large images are resized before saving.' +
          '</div>' +
          '<input type="file" id="bg-file-input" accept="image/*" style="display:none">' +
        '</div>' +

        '<div class="field">' +
          '<label>Content width — <span id="layout-width-val"></span></label>' +
          '<input type="range" id="set-layout-width" min="860" max="1800" step="20">' +
        '</div>' +
        '<div class="field">' +
          '<label>Sidebar gap — <span id="sidebar-gap-val"></span></label>' +
          '<input type="range" id="set-sidebar-gap" min="8" max="48" step="2">' +
        '</div>' +
        '<div class="field">' +
          '<label>Text size — <span id="text-scale-val"></span></label>' +
          '<input type="range" id="set-text-scale" min="0.85" max="1.3" step="0.05">' +
        '</div>' +
      '</div>' +

      '<div class="divider">backup</div>' +
      '<div class="spec-actions">' +
        '<button class="btn btn-ghost btn-sm" id="settings-export">Export everything (.json)</button>' +
        '<label class="btn btn-ghost btn-sm" id="settings-import-label">' +
          'Import backup' +
          '<input type="file" id="settings-import-input" accept="application/json" style="display:none">' +
        '</label>' +
      '</div>' +

      '<div class="divider"></div>' +
      '<div class="spec-actions">' +
        '<button class="btn btn-ghost btn-sm" id="settings-reset">Reset to default</button>' +
        '<button class="btn btn-primary btn-sm" id="settings-done">Done</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function injectSettingsModalStyles() {
  if (document.getElementById('settings-modal-styles')) return;
  const style = document.createElement('style');
  style.id = 'settings-modal-styles';
  style.textContent = `
    .settings-modal{ max-width:640px; }
    .settings-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:0 16px; }
    .settings-grid .field{ grid-column: span 1; }
    @media (max-width:560px){ .settings-grid{ grid-template-columns:1fr; } }

    .toggle-group{ display:flex; gap:6px; flex-wrap:wrap; }
    .toggle-group button{
      font-family:var(--f-mono); font-size:0.75rem; padding:7px 13px; cursor:pointer;
      background:var(--panel); border:var(--border-w) solid var(--border); color:var(--tx-muted);
      border-radius:var(--radius);
    }
    .toggle-group button.active{ border-color:var(--a1); color:var(--tx); background:var(--a1-dim); }

    .theme-live-preview{ margin-top:14px; padding:14px; background:var(--bg); border:1px dashed var(--border); border-radius:8px; }

    .customize-grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); gap:8px; margin-bottom:10px; }
    .swatch-row{
      display:flex; align-items:center; gap:8px; font-family:var(--f-mono); font-size:0.68rem; color:var(--tx-muted);
      background:var(--bg); border:1px solid var(--border); border-radius:7px; padding:6px 8px;
    }
    .swatch-label{ flex:1; }
    .swatch-row input[type=color]{ width:26px; height:22px; padding:0; border:none; background:none; cursor:pointer; }
    .swatch-warn{ font-size:0.62rem; color:var(--danger); white-space:nowrap; }
    #card-swatch-row .swatch-row{ margin-top:8px; }

    .font-override-grid{ display:grid; grid-template-columns: repeat(auto-fill, minmax(160px,1fr)); gap:0 12px; }

    input[type=range]{ width:100%; accent-color: var(--a1); }
    .gear-btn{ background:var(--surf); border:1px solid var(--border); color:var(--surft); border-radius:8px; padding:8px 10px; cursor:pointer; font-size:1rem; line-height:1; }
    .gear-btn:hover{ color:var(--a1); border-color:var(--a1); }
  `;
  document.head.appendChild(style);
}

function initSettingsModal() {
  injectSettingsModalStyles();
  if (!document.getElementById('settings-backdrop')) {
    const wrap = document.createElement('div');
    wrap.innerHTML = buildSettingsModalHTML();
    document.body.appendChild(wrap.firstElementChild);
  }

  const backdrop = document.getElementById('settings-backdrop');
  wireThemeEditor();

  const els = {
    background: document.getElementById('set-background'),
    bgUploadField: document.getElementById('bg-upload-field'),
    bgDropzone: document.getElementById('bg-dropzone'),
    bgFileInput: document.getElementById('bg-file-input'),
    layoutWidth: document.getElementById('set-layout-width'),
    layoutWidthVal: document.getElementById('layout-width-val'),
    sidebarGap: document.getElementById('set-sidebar-gap'),
    sidebarGapVal: document.getElementById('sidebar-gap-val'),
    textScale: document.getElementById('set-text-scale'),
    textScaleVal: document.getElementById('text-scale-val')
  };

  let current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());

  function syncFormFromCurrent() {
    els.background.value = current.background;
    els.bgUploadField.style.display = current.background === 'custom' ? 'block' : 'none';
    els.layoutWidth.value = current.layoutWidth;
    els.layoutWidthVal.textContent = current.layoutWidth + 'px';
    els.sidebarGap.value = current.sidebarGap;
    els.sidebarGapVal.textContent = current.sidebarGap + 'px';
    els.textScale.value = current.textScale;
    els.textScaleVal.textContent = Math.round(current.textScale * 100) + '%';
  }

  function preview() { applyAppearance(current); }
  function persist() { Storage.setSettings(current); }

  els.background.addEventListener('change', () => {
    current.background = els.background.value;
    els.bgUploadField.style.display = current.background === 'custom' ? 'block' : 'none';
    preview(); persist();
  });

  function handleBgFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => {
      img.onload = () => {
        // Cap to 1920px on the long edge before storing, so a phone photo
        // doesn't blow past localStorage's ~5MB quota.
        const MAX = 1920;
        let width = img.width, height = img.height;
        if (width > MAX || height > MAX) {
          const scale = MAX / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        current.backgroundImage = dataUrl;
        preview(); persist();
        if (window.showToast) window.showToast('Background image saved.');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  els.bgDropzone.addEventListener('click', () => els.bgFileInput.click());
  els.bgFileInput.addEventListener('change', () => handleBgFile(els.bgFileInput.files[0]));
  els.bgDropzone.addEventListener('dragover', e => { e.preventDefault(); els.bgDropzone.classList.add('drag'); });
  els.bgDropzone.addEventListener('dragleave', () => els.bgDropzone.classList.remove('drag'));
  els.bgDropzone.addEventListener('drop', e => {
    e.preventDefault(); els.bgDropzone.classList.remove('drag');
    handleBgFile(e.dataTransfer.files[0]);
  });

  els.layoutWidth.addEventListener('input', () => {
    current.layoutWidth = Number(els.layoutWidth.value);
    els.layoutWidthVal.textContent = current.layoutWidth + 'px';
    preview();
  });
  els.layoutWidth.addEventListener('change', persist);

  els.sidebarGap.addEventListener('input', () => {
    current.sidebarGap = Number(els.sidebarGap.value);
    els.sidebarGapVal.textContent = current.sidebarGap + 'px';
    preview();
  });
  els.sidebarGap.addEventListener('change', persist);

  els.textScale.addEventListener('input', () => {
    current.textScale = Number(els.textScale.value);
    els.textScaleVal.textContent = Math.round(current.textScale * 100) + '%';
    preview();
  });
  els.textScale.addEventListener('change', persist);

  document.getElementById('settings-reset').addEventListener('click', () => {
    current = Object.assign({}, DEFAULT_SETTINGS);
    Storage.resetSettings();
    Storage.resetThemePrefs();
    _themePrefs = currentThemePrefs();
    applyTheme(_themePrefs);
    syncThemeFormFromPrefs(_themePrefs);
    syncFormFromCurrent(); preview();
    if (window.showToast) window.showToast('Settings reset to default.');
  });

  document.getElementById('settings-export').addEventListener('click', () => {
    Storage.downloadJSON('loewtorials-backup-' + new Date().toISOString().slice(0,10) + '.json', Storage.exportAll());
  });

  document.getElementById('settings-import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      Storage.importAll(bundle, { mode: 'merge' });
      current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());
      _themePrefs = currentThemePrefs();
      applyTheme(_themePrefs);
      syncThemeFormFromPrefs(_themePrefs);
      syncFormFromCurrent(); preview();
      if (window.showToast) window.showToast('Backup imported.');
    } catch (err) {
      if (window.showToast) window.showToast('Import failed: ' + err.message, true);
    }
    e.target.value = '';
  });

  function open() {
    current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());
    _themePrefs = currentThemePrefs();
    syncFormFromCurrent();
    syncThemeFormFromPrefs(_themePrefs);
    backdrop.classList.remove('hidden');
  }
  function close() { backdrop.classList.add('hidden'); }

  document.getElementById('settings-close').addEventListener('click', close);
  document.getElementById('settings-done').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  return { open, close };
}

// Adds a gear button into any container element (masthead / rail) that
// opens the shared settings modal.
function mountSettingsGearButton(containerEl) {
  if (!containerEl) return;
  const btn = document.createElement('button');
  btn.className = 'gear-btn';
  btn.title = 'Appearance & layout settings';
  btn.setAttribute('aria-label', 'Settings');
  btn.textContent = '\u2699';
  containerEl.appendChild(btn);
  const modal = initSettingsModal();
  btn.addEventListener('click', modal.open);
  return modal;
}
