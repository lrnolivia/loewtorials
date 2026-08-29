// settings.js
// The settings modal now only covers layout/background + sync + backup
// + the Containerfile-detection entry point. Theme (style/color/mode/
// corners/customize/fonts) moved to the paintbrush popover in the
// persistent header — see assets/header.js — since it needed to be
// reachable from every screen, not just from inside this modal.

const BACKGROUND_OPTIONS = [
  { id: 'grid', label: 'Dot grid (default)' },
  { id: 'graph', label: 'Graph paper' },
  { id: 'diagonal', label: 'Diagonal hatch' },
  { id: 'glow', label: 'Accent glow' },
  { id: 'rings', label: 'Topographic rings' },
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

  // Reset every inline background property first so switching between
  // variants cannot leave a previous option's size/position/attachment
  // behind. The dot-grid default intentionally falls back to styles.css.
  body.style.backgroundImage = '';
  body.style.backgroundSize = '';
  body.style.backgroundPosition = '';
  body.style.backgroundRepeat = '';
  body.style.backgroundColor = '';
  body.style.backgroundAttachment = '';

  if (settings.background === 'solid') {
    body.style.backgroundImage = 'none';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'none') {
    body.style.backgroundImage = 'none';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'graph') {
    body.style.backgroundImage = 'linear-gradient(color-mix(in srgb, var(--border) 10%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--border) 10%, transparent) 1px, transparent 1px)';
    body.style.backgroundSize = '28px 28px';
    body.style.backgroundRepeat = 'repeat';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'diagonal') {
    body.style.backgroundImage = 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--a1) 11%, transparent) 0 1px, transparent 1px 16px)';
    body.style.backgroundSize = 'auto';
    body.style.backgroundRepeat = 'repeat';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'glow') {
    body.style.backgroundImage = 'radial-gradient(circle at 12% 8%, color-mix(in srgb, var(--a2) 28%, transparent), transparent 34%), radial-gradient(circle at 88% 22%, color-mix(in srgb, var(--a3) 20%, transparent), transparent 30%), radial-gradient(circle at 50% 100%, color-mix(in srgb, var(--a1) 18%, transparent), transparent 38%)';
    body.style.backgroundSize = 'auto';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundColor = 'var(--bg)';
    body.style.backgroundAttachment = 'fixed';
  } else if (settings.background === 'rings') {
    body.style.backgroundImage = 'repeating-radial-gradient(circle at 10% 0%, transparent 0 18px, color-mix(in srgb, var(--border) 9%, transparent) 19px 20px)';
    body.style.backgroundSize = 'auto';
    body.style.backgroundRepeat = 'repeat';
    body.style.backgroundColor = 'var(--bg)';
  } else if (settings.background === 'custom' && settings.backgroundImage) {
    body.style.backgroundImage = 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.55)), url(' + settings.backgroundImage + ')';
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundRepeat = 'no-repeat';
    body.style.backgroundAttachment = 'fixed';
  }
}

// Layout/background only — color and fonts are applyTheme()'s job
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
// Settings modal (layout/background + sync + backup)
// ---------------------------------------------------------------------
function buildSettingsModalHTML() {
  const bgOpts = BACKGROUND_OPTIONS.map(b => '<option value="' + b.id + '">' + b.label + '</option>').join('');

  return '' +
  '<div class="modal-backdrop hidden" id="settings-backdrop">' +
    '<div class="modal">' +
      '<button class="modal-close" id="settings-close" aria-label="Close">&times;</button>' +
      '<h2>Layout &amp; data</h2>' +
      '<p class="hint">Look and color live in the paintbrush icon now — this is everything else. Changes apply live and save to this browser.</p>' +

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

      '<div class="divider">containerfile</div>' +
      '<p class="hint">Upload your build\'s Containerfile so wizard steps can flag which parts already apply to your setup.</p>' +
      '<div class="spec-actions">' +
        '<button class="btn btn-ghost btn-sm" id="open-containerfile-btn">Manage Containerfile</button>' +
      '</div>' +

      '<div class="divider">sync</div>' +
      '<p class="hint" id="sync-status-line"></p>' +
      '<div class="field">' +
        '<label>Site password</label>' +
        '<input type="password" id="sync-password-field" placeholder="Enter to set/change" autocomplete="new-password">' +
      '</div>' +
      '<div class="spec-actions">' +
        '<button class="btn btn-ghost btn-sm" id="sync-save-btn" type="button">Save &amp; reconnect</button>' +
        '<button class="btn btn-ghost btn-sm" id="sync-now-btn" type="button">Sync now</button>' +
        '<button class="btn btn-ghost btn-sm" id="sync-forget-btn" type="button">Forget on this device</button>' +
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
    .settings-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:0 16px; }
    .settings-grid .field{ grid-column: span 1; }
    @media (max-width:560px){ .settings-grid{ grid-template-columns:1fr; } }
    input[type=range]{ width:100%; accent-color: var(--a1); }
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

  document.getElementById('open-containerfile-btn').addEventListener('click', () => {
    if (window.openContainerfileModal) window.openContainerfileModal();
  });

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
    syncFormFromCurrent(); preview();
    if (window.showToast) window.showToast('Layout settings reset to default.');
  });

  document.getElementById('settings-export').addEventListener('click', () => {
    Storage.downloadJSON('loewtorials-backup-' + new Date().toISOString().slice(0,10) + '.json', Storage.exportAll());
  });

  const syncStatusLine = document.getElementById('sync-status-line');
  function refreshSyncStatus(msg) {
    if (msg) { syncStatusLine.textContent = msg; return; }
    syncStatusLine.textContent = Storage.getSitePassword()
      ? 'Connected — changes sync to the server automatically.'
      : 'Not connected — working locally on this device only.';
  }
  refreshSyncStatus();

  document.getElementById('sync-save-btn').addEventListener('click', async () => {
    const pw = document.getElementById('sync-password-field').value.trim();
    if (!pw) return;
    Storage.setSitePassword(pw);
    refreshSyncStatus('Connecting…');
    const result = await Storage.hydrateFromServer();
    if (result.ok) {
      if (window.applyTheme) applyTheme(Storage.getThemePrefs());
      current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());
      syncFormFromCurrent(); preview();
      document.getElementById('sync-password-field').value = '';
      refreshSyncStatus();
      if (window.showToast) window.showToast(result.seeded ? 'Connected — this device is now the seed.' : 'Connected and synced.');
    } else if (result.reason === 'unauthorized') {
      Storage.clearSitePassword();
      refreshSyncStatus('Incorrect password.');
    } else {
      refreshSyncStatus('Could not reach the server — will retry in the background.');
    }
  });

  document.getElementById('sync-now-btn').addEventListener('click', async () => {
    if (!Storage.getSitePassword()) {
      refreshSyncStatus('Set a password above first.');
      return;
    }
    refreshSyncStatus('Syncing…');
    const result = await Storage.hydrateFromServer();
    if (result.ok) {
      if (window.applyTheme) applyTheme(Storage.getThemePrefs());
      current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());
      syncFormFromCurrent(); preview();
      refreshSyncStatus();
      if (window.showToast) window.showToast('Synced.');
    } else {
      refreshSyncStatus(result.reason === 'unauthorized' ? 'Incorrect password.' : 'Could not reach the server.');
    }
  });

  document.getElementById('sync-forget-btn').addEventListener('click', () => {
    Storage.clearSitePassword();
    refreshSyncStatus();
    if (window.showToast) window.showToast('Disconnected — this device now works locally only.');
  });

  document.getElementById('settings-import-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      Storage.importAll(bundle, { mode: 'merge' });
      current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());
      if (window.applyTheme) applyTheme(Storage.getThemePrefs());
      syncFormFromCurrent(); preview();
      if (window.showToast) window.showToast('Backup imported.');
    } catch (err) {
      if (window.showToast) window.showToast('Import failed: ' + err.message, true);
    }
    e.target.value = '';
  });

  function open() {
    current = Object.assign({}, DEFAULT_SETTINGS, Storage.getSettings());
    syncFormFromCurrent();
    refreshSyncStatus();
    backdrop.classList.remove('hidden');
  }
  function close() { backdrop.classList.add('hidden'); }

  document.getElementById('settings-close').addEventListener('click', close);
  document.getElementById('settings-done').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  return { open, close };
}
