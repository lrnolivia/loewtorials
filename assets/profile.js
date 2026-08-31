// profile.js
// Containerfile detection: an optional uploaded Containerfile,
// heuristically parsed into a flat list of "detected facts" (base
// image, branch, installed packages). Consumed by wizard-engine.js (via
// opts.profile) to show "detected on your system" badges on steps that
// declare `relevantPackages`.
//
// The hand-entered spec form (model/CPU/GPU/RAM/OS) that used to live
// here is gone — the header now shows static specs for one real
// machine (see assets/header.js) instead of a per-browser editable
// card, so there's nothing left to persist or render for that part.
//
// The Containerfile parser is intentionally simple and line-based — it
// is not a shell interpreter. Unrecognized lines are ignored, never
// errors.

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

function escapeHtmlP(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------
// Containerfile modal (upload only — no spec fields)
// ---------------------------------------------------------------------
function buildContainerfileModalHTML() {
  return `
  <div class="modal-backdrop hidden" id="cf-backdrop">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <button class="modal-close" id="cf-close" aria-label="Close">&times;</button>
      <h2 id="cf-title">Containerfile detection</h2>
      <p class="hint">Upload your build's Containerfile to auto-detect installed packages and your image branch. Re-upload any time \u2014 wizard steps that declare relevant packages will show a match against whatever was parsed most recently. Nothing here leaves this browser.</p>
      <div class="dropzone" id="cf-dropzone" role="button" tabindex="0" aria-label="Choose a Containerfile">
        <strong>Click to upload</strong> or drag your Containerfile here.
        <input type="file" id="cf-file-input" accept=".txt,text/plain,Containerfile,*" style="display:none">
      </div>
      <div id="cf-summary"></div>
      <div style="display:flex; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-primary" id="cf-done">Done</button>
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

let _cfModalInited = false;
function openContainerfileModal() {
  if (!_cfModalInited) {
    if (!document.getElementById('cf-backdrop')) {
      const wrap = document.createElement('div');
      wrap.innerHTML = buildContainerfileModalHTML();
      document.body.appendChild(wrap.firstElementChild);
    }
    wireContainerfileModal();
    _cfModalInited = true;
  }
  renderContainerfileSummary(document.getElementById('cf-summary'));
  document.getElementById('cf-backdrop').classList.remove('hidden');
}
window.openContainerfileModal = openContainerfileModal;

function wireContainerfileModal() {
  const backdrop = document.getElementById('cf-backdrop');
  const close = () => backdrop.classList.add('hidden');
  document.getElementById('cf-close').addEventListener('click', close);
  document.getElementById('cf-done').addEventListener('click', close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

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
    };
    reader.readAsText(file);
  }
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dropzone.classList.remove('drag');
    handleFile(e.dataTransfer.files[0]);
  });
}
