// storage.js
// All persistence for loewtorials lives in localStorage on the current
// device/browser. There's no backend, so "uploading" a wizard saves it
// locally; use Export (in the manage menu) to get a JSON file you can
// commit into /wizards and list in manifest.json to make it permanent
// for everyone who loads the site.

const LS_CUSTOM = 'loewtorials.customWizards.v1';   // { [id]: fullWizardData }
const LS_OVERRIDES = 'loewtorials.overrides.v1';    // { [id]: {category?, tags?, date?, hidden?, favorite?, status?} }
const LS_SETTINGS = 'loewtorials.settings.v1';      // appearance/layout settings, see Storage.getSettings()
const LS_COMPLETIONS = 'loewtorials.completions.v1'; // { [wizardId]: [ completionRecord, ... ] }
const LS_PROFILE = 'loewtorials.profile.v1';        // { specs: {...}, containerfile: {raw, parsed, uploadedAt} }
const LS_THEME = 'loewtorials.theme.v1';            // { style, theme, mode, fontOverrides, customPalette } — see assets/theme.js

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.warn('loewtorials: failed to read', key, e);
    return fallback;
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('loewtorials: failed to write', key, e);
    return false;
  }
}

const Storage = {
  getCustomWizards() { return readJSON(LS_CUSTOM, {}); },

  saveCustomWizard(wizardData) {
    if (!wizardData || !wizardData.id) throw new Error('Wizard data needs an id.');
    const all = Storage.getCustomWizards();
    all[wizardData.id] = wizardData;
    writeJSON(LS_CUSTOM, all);
    return wizardData.id;
  },

  deleteCustomWizard(id) {
    const all = Storage.getCustomWizards();
    delete all[id];
    writeJSON(LS_CUSTOM, all);
    Storage.clearOverride(id);
  },

  getOverrides() { return readJSON(LS_OVERRIDES, {}); },

  setOverride(id, patch) {
    const all = Storage.getOverrides();
    all[id] = Object.assign({}, all[id] || {}, patch);
    writeJSON(LS_OVERRIDES, all);
  },

  clearOverride(id) {
    const all = Storage.getOverrides();
    delete all[id];
    writeJSON(LS_OVERRIDES, all);
  },

  // Merge manifest (built-in) + custom wizards + overrides into one flat
  // list of card metadata for the dashboard.
  getAllWizardMeta(manifestWizards) {
    const overrides = Storage.getOverrides();
    const custom = Storage.getCustomWizards();
    const seen = new Set();
    const out = [];

    (manifestWizards || []).forEach(w => {
      seen.add(w.id);
      const ov = overrides[w.id] || {};
      out.push(Object.assign({}, w, ov, { source: 'builtin' }));
    });

    Object.keys(custom).forEach(id => {
      if (seen.has(id)) return; // a custom upload with the same id as a built-in overrides it entirely
      const w = custom[id];
      const ov = overrides[id] || {};
      out.push({
        id: w.id,
        title: w.title,
        subtitle: w.subtitle,
        description: w.description,
        category: w.category || 'Uncategorized',
        tags: w.tags || [],
        date: w.date || w._addedAt || '',
        source: 'custom',
        ...ov
      });
    });

    // Custom wizard that shadows a built-in id: swap it in, keep it manageable/deletable.
    Object.keys(custom).forEach(id => {
      if (!seen.has(id)) return;
      const idx = out.findIndex(w => w.id === id);
      if (idx === -1) return;
      const w = custom[id];
      const ov = overrides[id] || {};
      out[idx] = Object.assign({}, out[idx], {
        title: w.title, subtitle: w.subtitle, description: w.description,
        category: w.category || out[idx].category, tags: w.tags || out[idx].tags,
        date: w.date || w._addedAt || out[idx].date,
        source: 'custom-override'
      }, ov);
    });

    return out.filter(w => !w.hidden);
  },

  getHiddenWizardMeta(manifestWizards) {
    const overrides = Storage.getOverrides();
    const custom = Storage.getCustomWizards();
    const all = (manifestWizards || []).map(w => Object.assign({}, w, { source: 'builtin' }))
      .concat(Object.keys(custom).map(id => Object.assign({}, custom[id], { source: 'custom' })));
    return all.filter(w => overrides[w.id] && overrides[w.id].hidden);
  },

  async loadWizardData(id, manifestWizards) {
    const custom = Storage.getCustomWizards();
    let data;
    if (custom[id]) {
      data = custom[id];
    } else {
      const entry = (manifestWizards || []).find(w => w.id === id);
      if (!entry) throw new Error('No wizard found with id "' + id + '".');
      const res = await fetch(entry.file);
      if (!res.ok) throw new Error('Could not load ' + entry.file + ' (' + res.status + ')');
      data = await res.json();
    }
    // Apply dashboard-level renames/edits (see setOverride) so the wizard
    // page itself — not just the dashboard card — reflects them.
    const ov = Storage.getOverrides()[id];
    if (ov) {
      data = Object.assign({}, data, {
        title: ov.title || data.title,
        category: ov.category || data.category,
        tags: ov.tags || data.tags,
        date: ov.date || data.date
      });
    }
    return data;
  },

  // Builds a lookup of every ".md" filename any known wizard says it was
  // authored from (its own `sourceFiles`), so a step in one wizard that
  // mentions e.g. "work through fix-dirty-ntfs-partition.md" can be
  // auto-linked to the wizard that declares that filename. Each entry in a
  // wizard's `sourceFiles` array can be a plain filename string, or
  // `{ file, step }` to point at a specific step inside that wizard instead
  // of its start.
  buildRefIndex(manifestWizards) {
    const overrides = Storage.getOverrides();
    const custom = Storage.getCustomWizards();
    const index = [];
    function add(id, title, sourceFiles) {
      (sourceFiles || []).forEach(sf => {
        const isObj = sf && typeof sf === 'object';
        const file = String(isObj ? sf.file : sf || '').trim().toLowerCase();
        if (!file) return;
        index.push({
          file,
          id,
          step: isObj ? sf.step : undefined,
          title: (overrides[id] && overrides[id].title) || title
        });
      });
    }
    (manifestWizards || []).forEach(w => add(w.id, w.title, w.sourceFiles));
    Object.keys(custom).forEach(id => add(id, custom[id].title, custom[id].sourceFiles));
    return index;
  },

  resolveRef(index, filename) {
    const norm = String(filename || '').trim().toLowerCase();
    if (!norm) return null;
    return (index || []).find(e => e.file === norm) || null;
  },

  downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  // ---------------------------------------------------------------------
  // Appearance / layout settings (theme, fonts, background, width, scale)
  // ---------------------------------------------------------------------
  getSettings() { return readJSON(LS_SETTINGS, {}); },

  setSettings(patch) {
    const all = Storage.getSettings();
    const merged = Object.assign({}, all, patch);
    writeJSON(LS_SETTINGS, merged);
    return merged;
  },

  resetSettings() {
    try { localStorage.removeItem(LS_SETTINGS); } catch (e) { /* ignore */ }
  },

  // ---------------------------------------------------------------------
  // Theme prefs (style / color theme / mode + optional overrides) —
  // see assets/theme.js for FAMILIES data and applyTheme().
  // ---------------------------------------------------------------------
  getThemePrefs() { return readJSON(LS_THEME, {}); },

  setThemePrefs(patch) {
    const all = Storage.getThemePrefs();
    const merged = Object.assign({}, all, patch);
    writeJSON(LS_THEME, merged);
    return merged;
  },

  resetThemePrefs() {
    try { localStorage.removeItem(LS_THEME); } catch (e) { /* ignore */ }
  },

  // ---------------------------------------------------------------------
  // Completions ("mark solved/finished" records)
  // ---------------------------------------------------------------------
  getCompletions() { return readJSON(LS_COMPLETIONS, {}); },

  getCompletionsFor(wizardId) {
    const all = Storage.getCompletions();
    return all[wizardId] || [];
  },

  addCompletion(wizardId, record) {
    const all = Storage.getCompletions();
    if (!all[wizardId]) all[wizardId] = [];
    all[wizardId].push(record);
    writeJSON(LS_COMPLETIONS, all);
    return record;
  },

  deleteCompletion(wizardId, completionId) {
    const all = Storage.getCompletions();
    if (!all[wizardId]) return;
    all[wizardId] = all[wizardId].filter(r => r.id !== completionId);
    if (!all[wizardId].length) delete all[wizardId];
    writeJSON(LS_COMPLETIONS, all);
  },

  // Flat, date-sorted (newest first) list of every completion across every
  // wizard, each annotated with its wizardId — used to build the aggregate
  // activity log.
  getAllCompletionsFlat() {
    const all = Storage.getCompletions();
    const out = [];
    Object.keys(all).forEach(wizardId => {
      (all[wizardId] || []).forEach(rec => out.push(Object.assign({ wizardId }, rec)));
    });
    out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return out;
  },

  // ---------------------------------------------------------------------
  // System profile (PC specs + parsed Containerfile)
  // ---------------------------------------------------------------------
  getProfile() { return readJSON(LS_PROFILE, { specs: {}, containerfile: null }); },

  setProfileSpecs(specs) {
    const p = Storage.getProfile();
    p.specs = Object.assign({}, p.specs, specs);
    writeJSON(LS_PROFILE, p);
    return p;
  },

  setProfileContainerfile(raw, parsed) {
    const p = Storage.getProfile();
    p.containerfile = { raw, parsed, uploadedAt: new Date().toISOString() };
    writeJSON(LS_PROFILE, p);
    return p;
  },

  clearProfileContainerfile() {
    const p = Storage.getProfile();
    p.containerfile = null;
    writeJSON(LS_PROFILE, p);
    return p;
  },

  // ---------------------------------------------------------------------
  // Full export/import — settings + custom wizards + overrides +
  // completions + profile, as one JSON blob, for moving between
  // devices/browsers (storage is per-browser by design otherwise).
  // ---------------------------------------------------------------------
  exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      customWizards: Storage.getCustomWizards(),
      overrides: Storage.getOverrides(),
      settings: Storage.getSettings(),
      completions: Storage.getCompletions(),
      profile: Storage.getProfile(),
      themePrefs: Storage.getThemePrefs()
    };
  },

  importAll(bundle, opts) {
    opts = opts || {};
    if (!bundle || typeof bundle !== 'object') throw new Error('Invalid backup file.');
    const mode = opts.mode || 'merge'; // 'merge' | 'replace'
    if (mode === 'replace') {
      writeJSON(LS_CUSTOM, bundle.customWizards || {});
      writeJSON(LS_OVERRIDES, bundle.overrides || {});
      writeJSON(LS_SETTINGS, bundle.settings || {});
      writeJSON(LS_COMPLETIONS, bundle.completions || {});
      writeJSON(LS_PROFILE, bundle.profile || { specs: {}, containerfile: null });
      writeJSON(LS_THEME, bundle.themePrefs || {});
      return;
    }
    // merge: incoming values win on key collision, existing keys kept otherwise
    writeJSON(LS_CUSTOM, Object.assign({}, Storage.getCustomWizards(), bundle.customWizards || {}));
    writeJSON(LS_OVERRIDES, Object.assign({}, Storage.getOverrides(), bundle.overrides || {}));
    writeJSON(LS_SETTINGS, Object.assign({}, Storage.getSettings(), bundle.settings || {}));
    writeJSON(LS_THEME, Object.assign({}, Storage.getThemePrefs(), bundle.themePrefs || {}));
    const mergedCompletions = Storage.getCompletions();
    Object.keys(bundle.completions || {}).forEach(id => {
      mergedCompletions[id] = (mergedCompletions[id] || []).concat(bundle.completions[id] || []);
    });
    writeJSON(LS_COMPLETIONS, mergedCompletions);
    if (bundle.profile) {
      writeJSON(LS_PROFILE, Object.assign({}, Storage.getProfile(), bundle.profile));
    }
  }
};
