// profile.js
// System profile: hand-entered PC specs (model, CPU, GPU, RAM, OS, disk
// layout) plus an optional uploaded Containerfile, heuristically parsed
// into a flat list of "detected facts" (base image, branch, installed
// packages). Rendered as a small card in the dashboard masthead. Consumed
// by wizard-engine.js (via opts.profile) to show "detected on your
// system" badges on steps that declare `relevantPackages`.
//
// The Containerfile parser is intentionally simple and line-based — it is
// not a shell interpreter. Unrecognized lines are ignored, never errors.

const SPEC_FIELDS = [
  { key: 'model', label: 'Model', icon: '\u{1F5A5}\uFE0F' },
  { key: 'cpu', label: 'CPU', icon: '\u{1F5A7}\uFE0F' },
  { key: 'gpu', label: 'GPU', icon: '\u{1F3AE}' },
  { key: 'ram', label: 'RAM', icon: '\u{1F4BE}' },
  { key: 'os', label: 'OS', icon: '\u{1F5B3}\uFE0F' },
  { key: 'kernel', label: 'Kernel', icon: '\u{1F427}' },
  { key: 'disks', label: 'Disks', icon: '\u{1F4C0}' }
];

// ---------------------------------------------------------------------
// Containerfile parsing (heuristic, line-based)
// ---------------------------------------------------------------------
function parseContainerfile(raw) {
  const lines = String(raw || '').split('\n');
  const result = {
    baseImage: null,
    branch: null,
    installedPackages: [],
    notes: []
  };
  const pkgSeen = new Set();
  let pendingComment = [];

  function flushComment() {
    const text = pendingComment.join(' ').trim();
    pendingComment = [];
    return text;
  }

  lines.forEach(line => {
    const trimmed = line.trim();

    if (/^#/.test(trimmed) && !/^###/.test(trimmed)) {
      pendingComment.push(trimmed.replace(/^#+\s?/, ''));
      return;
    }
    if (!trimmed) { pendingComment = []; return; }

    // FROM <image>[:tag] [AS name]
    const fromMatch = trimmed.match(/^FROM\s+([^\s]+)/i);
    if (fromMatch && !result.baseImage && !/scratch/i.test(fromMatch[1])) {
      result.baseImage = fromMatch[1];
      const tagMatch = fromMatch[1].match(/:([^:]+)$/);
      if (tagMatch) result.branch = tagMatch[1];
    }

    // rpm-ostree install pkg1 pkg2 / dnf5 install pkg1 / dnf install pkg1
    const installMatch = trimmed.match(/(?:rpm-ostree|dnf5?|apt(?:-get)?)\s+install\s+(.+)/i);
    if (installMatch) {
      const comment = flushComment();
      installMatch[1]
        .split(/\s*&&|\s*\\\s*$/)[0] // stop at a trailing && or line-continuation
        .split(/\s+/)
        .map(p => p.trim())
        .filter(p => p && !p.startsWith('-') && !/^\$/.test(p))
        .forEach(pkg => {
          const key = pkg.toLowerCase();
          if (pkgSeen.has(key)) return;
          pkgSeen.add(key);
          result.installedPackages.push(pkg);
          if (comment) result.notes.push({ pkg, comment });
        });
    } else if (trimmed) {
      pendingComment = [];
    }
  });

  return result;
}

// ---------------------------------------------------------------------
// Dashboard spec card
// ---------------------------------------------------------------------
function renderSpecCard(containerEl) {
  if (!containerEl) return;
  const profile = Storage.getProfile();
  const specs = profile.specs || {};
  const hasAny = SPEC_FIELDS.some(f => specs[f.key]);

  if (!hasAny) {
    containerEl.className = 'spec-card empty';
    containerEl.innerHTML = `No system specs saved yet \u2014 <button class="btn-ghost btn-sm btn" id="specEditBtn" type="button">add yours</button>`;
  } else {
    containerEl.className = 'spec-card';
    containerEl.innerHTML = SPEC_FIELDS
      .filter(f => specs[f.key])
      .map(f => `<span class="spec-item"><span class="spec-ico">${f.icon}</span><strong>${escapeHtmlP(specs[f.key])}</strong></span>`)
      .join('') + `<button class="icon-btn spec-edit" id="specEditBtn" type="button">edit</button>`;
  }
  const btn = containerEl.querySelector('#specEditBtn');
  if (btn) btn.addEventListener('click', () => openProfileModal());
}

function escapeHtmlP(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------
// Profile modal: specs form + Containerfile upload
// ---------------------------------------------------------------------
function buildProfileModalHTML() {
  const fields = SPEC_FIELDS.map(f => `
    <div class="field">
      <label>${f.label}</label>
      <input type="text" id="spec-${f.key}" placeholder="${f.label}">
    </div>`).join('');

  return `
  <div class="modal-backdrop hidden" id="profile-backdrop">
    <div class="modal">
      <button class="modal-close" id="profile-close" aria-label="Close">&times;</button>
      <h2>System profile</h2>
      <p class="hint">Shown as a small header card on the dashboard, and used to flag which wizard steps apply to your setup. Nothing here leaves this browser.</p>

      <div class="settings-grid">${fields}</div>

      <div class="divider">Containerfile</div>
      <p class="hint">Upload your build's Containerfile to auto-detect installed packages and your image branch. Re-upload any time \u2014 wizard steps that declare relevant packages will show a match against whatever was parsed most recently.</p>
      <div class="dropzone" id="cf-dropzone">
        <strong>Click to upload</strong> or drag your Containerfile here.
        <input type="file" id="cf-file-input" accept=".txt,text/plain,Containerfile,*" style="display:none">
      </div>
      <div id="cf-summary"></div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
        <button class="btn btn-ghost" id="profile-cancel">Close</button>
        <button class="btn btn-primary" id="profile-save">Save specs</button>
      </div>
    </div>
  </div>`;
}

function renderContainerfileSummary(el) {
  const profile = Storage.getProfile();
  const cf = profile.containerfile;
  if (!cf) { el.innerHTML = `<p class="hint">No Containerfile uploaded yet.</p>`; return; }
  const p = cf.parsed || {};
  el.innerHTML = `
    <div class="preview-box">
      <strong>${escapeHtmlP(p.baseImage || 'unknown base image')}</strong>
      ${p.branch ? ` \u00b7 branch: ${escapeHtmlP(p.branch)}` : ''}
      <br>${(p.installedPackages || []).length} package${(p.installedPackages || []).length === 1 ? '' : 's'} detected: ${escapeHtmlP((p.installedPackages || []).join(', ') || 'none')}
      <br><span style="color:var(--tx-faint); font-size:0.7rem;">uploaded ${escapeHtmlP((cf.uploadedAt || '').slice(0, 10))}</span>
      <div style="margin-top:8px;"><button class="btn btn-ghost btn-sm" id="cf-clear-btn" type="button">Remove</button></div>
    </div>`;
  const clearBtn = el.querySelector('#cf-clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    Storage.clearProfileContainerfile();
    renderContainerfileSummary(el);
    if (window.showToast) window.showToast('Containerfile removed.');
  });
}

let _profileModalInited = false;
function openProfileModal() {
  if (!_profileModalInited) {
    if (!document.getElementById('profile-backdrop')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildProfileModalHTML();
      document.body.appendChild(wrap.firstElementChild);
    }
    wireProfileModal();
    _profileModalInited = true;
  }
  const profile = Storage.getProfile();
  const specs = profile.specs || {};
  SPEC_FIELDS.forEach(f => {
    const input = document.getElementById('spec-' + f.key);
    if (input) input.value = specs[f.key] || '';
  });
  renderContainerfileSummary(document.getElementById('cf-summary'));
  document.getElementById('profile-backdrop').classList.remove('hidden');
}

function wireProfileModal() {
  const backdrop = document.getElementById('profile-backdrop');
  const close = () => backdrop.classList.add('hidden');
  document.getElementById('profile-close').addEventListener('click', close);
  document.getElementById('profile-cancel').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  document.getElementById('profile-save').addEventListener('click', () => {
    const specs = {};
    SPEC_FIELDS.forEach(f => {
      const input = document.getElementById('spec-' + f.key);
      if (input && input.value.trim()) specs[f.key] = input.value.trim();
    });
    Storage.setProfileSpecs(specs);
    if (window.showToast) window.showToast('System profile saved.');
    close();
    if (window.refreshSpecCard) window.refreshSpecCard();
  });

  const dropzone = document.getElementById('cf-dropzone');
  const fileInput = document.getElementById('cf-file-input');
  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      const parsed = parseContainerfile(raw);
      Storage.setProfileContainerfile(raw, parsed);
      renderContainerfileSummary(document.getElementById('cf-summary'));
      if (window.showToast) window.showToast('Containerfile parsed \u2014 ' + parsed.installedPackages.length + ' package(s) detected.');
      if (window.refreshSpecCard) window.refreshSpecCard();
    };
    reader.readAsText(file);
  }
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag');
    handleFile(e.dataTransfer.files[0]);
  });
}
