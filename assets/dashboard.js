(async function () {
  await ensureSynced();
  bootAppearance();
  applyTheme(Storage.getThemePrefs()); // re-apply in case hydration pulled in a different theme from another device

  let manifestWizards = [];
  let currentList = [];
  let openMenuId = null;
  let statusFilter = 'all';

  const grid = document.getElementById('wizardGrid');
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const sortSelect = document.getElementById('sortSelect');
  const toast = document.getElementById('toast');
  const categoryNav = document.getElementById('categoryNav');

  // mobile sidebar toggle (mirrors the wizard page's rail/backdrop wiring)
  const rail = document.getElementById('rail');
  const railBackdrop = document.getElementById('railBackdrop');
  const openRailBtn = document.getElementById('openRail');
  if (openRailBtn && rail && railBackdrop) {
    openRailBtn.addEventListener('click', () => { rail.classList.add('open'); railBackdrop.classList.add('open'); });
    railBackdrop.addEventListener('click', () => { rail.classList.remove('open'); railBackdrop.classList.remove('open'); });
  }

  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { toast.className = 'toast'; }, 2600);
  }
  window.showToast = showToast;

  document.getElementById('downloadLogBtn').addEventListener('click', () => {
    Storage.downloadText('loewtorials-activity-log-' + new Date().toISOString().slice(0, 10) + '.md', generateActivityLogMd());
  });

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------------- load + render ----------------
  function loadAndRender() {
    fetch('wizards/manifest.json')
      .then(r => r.json())
      .then(manifest => {
        manifestWizards = manifest.wizards || [];
        refresh();
      })
      .catch(err => {
        console.error(err);
        grid.innerHTML = `<div class="empty-state">Couldn't load wizards/manifest.json. If you're opening this file directly from disk, run it through a local server instead (browsers block fetch() on file://).</div>`;
      });
  }

  function refresh() {
    const all = Storage.getAllWizardMeta(manifestWizards);
    populateCategoryFilter(all);
    updateViewTabCounts(all);
    currentList = applyFiltersAndSort(all).filter(w => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'active') return !w.status || w.status === 'active';
      return w.status === statusFilter;
    });
    renderGrid(currentList);
    renderHiddenLink();
  }

  function updateViewTabCounts(all) {
    document.getElementById('countAll').textContent = all.length;
    document.getElementById('countActive').textContent = all.filter(w => !w.status || w.status === 'active').length;
    document.getElementById('countSolved').textContent = all.filter(w => w.status === 'solved').length;
    document.getElementById('countArchived').textContent = all.filter(w => w.status === 'archived').length;
  }

  document.querySelectorAll('#viewTabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      statusFilter = btn.getAttribute('data-status');
      document.querySelectorAll('#viewTabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      refresh();
    });
  });

  function populateCategoryFilter(all) {
    const cats = Array.from(new Set(all.map(w => w.category || 'Uncategorized'))).sort();
    const current = categorySelect.value;
    categorySelect.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (cats.includes(current)) categorySelect.value = current;
    renderCategoryNav(cats, current);
  }

  // Sidebar shortcut list for categories — clicking one sets the same
  // filter as the toolbar's category <select>, just reachable from the
  // nav without scrolling to the toolbar.
  function renderCategoryNav(cats, current) {
    if (!categoryNav) return;
    categoryNav.innerHTML = cats.map(c =>
      `<button type="button" data-category="${escapeHtml(c)}" class="${c === current ? 'active' : ''}">${escapeHtml(c)}</button>`
    ).join('');
    categoryNav.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.getAttribute('data-category');
        categorySelect.value = categorySelect.value === cat ? '' : cat;
        refresh();
      });
    });
  }

  function applyFiltersAndSort(all) {
    const q = searchInput.value.trim().toLowerCase();
    const cat = categorySelect.value;
    let list = all.filter(w => {
      if (cat && w.category !== cat) return false;
      if (!q) return true;
      const hay = [w.title, w.subtitle, w.description, (w.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
    const sort = sortSelect.value;
    list.sort((a, b) => {
      if (sort === 'date-desc') return (b.date || '').localeCompare(a.date || '');
      if (sort === 'date-asc') return (a.date || '').localeCompare(b.date || '');
      if (sort === 'category') return (a.category || '').localeCompare(b.category || '') || a.title.localeCompare(b.title);
      return a.title.localeCompare(b.title); // name
    });
    return list;
  }

  function renderGrid(list) {
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state">No wizards match that filter yet.</div>`;
      return;
    }
    grid.innerHTML = list.map(cardHtml).join('');

    grid.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        toggleMenu(id);
      });
    });
    grid.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        handleCardAction(action, id);
      });
    });
    grid.querySelectorAll('.wizard-card').forEach(card => {
      card.addEventListener('click', () => {
        window.location.href = 'wizard.html?id=' + encodeURIComponent(card.getAttribute('data-id'));
      });
    });
  }

  function cardHtml(w) {
    const tags = (w.tags || []).slice(0, 4).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    const deletable = w.source === 'custom' || w.source === 'custom-override';
    const statusBadge = w.status === 'solved' ? `<span class="status-badge solved">Solved</span>`
      : w.status === 'archived' ? `<span class="status-badge archived">Archived</span>` : '';
    const archiveAction = w.status === 'archived'
      ? `<button data-action="unarchive" data-id="${escapeHtml(w.id)}">Restore to active</button>`
      : `<button data-action="archive" data-id="${escapeHtml(w.id)}">Archive</button>`;
    return `
    <article class="wizard-card" data-id="${escapeHtml(w.id)}">
      <div class="card-top">
        <span class="badge">${escapeHtml(w.category || 'Uncategorized')}</span>
        ${w.kind === 'article' ? '<span class="badge">Article</span>' : ''}
        ${w.confidence === 'low' ? '<span class="badge badge-warn" title="Auto-converted with lower confidence — check Article view">Low confidence</span>' : ''}
        ${statusBadge}
        <button class="menu-btn" data-id="${escapeHtml(w.id)}" aria-label="Manage this wizard">&#8942;</button>
        <div class="card-menu" id="menu-${escapeHtml(w.id)}">
          <button data-action="edit" data-id="${escapeHtml(w.id)}">Edit details</button>
          <button data-action="export" data-id="${escapeHtml(w.id)}">Export JSON</button>
          ${w._hasSource ? `<button data-action="source" data-id="${escapeHtml(w.id)}">Download source .md</button>` : ''}
          ${archiveAction}
          <button data-action="hide" data-id="${escapeHtml(w.id)}">Hide from dashboard</button>
          ${deletable ? `<button class="danger" data-action="delete" data-id="${escapeHtml(w.id)}">Delete</button>` : ''}
        </div>
      </div>
      <h3>${escapeHtml(w.title)}</h3>
      ${w.subtitle ? `<p class="card-sub">${escapeHtml(w.subtitle)}</p>` : ''}
      ${w.description ? `<p class="card-desc">${escapeHtml(w.description)}</p>` : ''}
      <div class="tag-row">${tags}</div>
      <div class="card-bottom">
        <span class="card-date">${escapeHtml(w.date || '')}</span>
        <span class="btn btn-sm btn-ghost">Open &rarr;</span>
      </div>
    </article>`;
  }

  function toggleMenu(id) {
    document.querySelectorAll('.card-menu.open').forEach(m => { if (m.id !== 'menu-' + id) m.classList.remove('open'); });
    const menu = document.getElementById('menu-' + id);
    if (menu) menu.classList.toggle('open');
  }
  document.addEventListener('click', () => document.querySelectorAll('.card-menu.open').forEach(m => m.classList.remove('open')));

  function handleCardAction(action, id) {
    const meta = Storage.getAllWizardMeta(manifestWizards).find(w => w.id === id) ||
      Storage.getHiddenWizardMeta(manifestWizards).find(w => w.id === id);
    if (action === 'edit') openEditModal(id, meta);
    if (action === 'archive') { Storage.setOverride(id, { status: 'archived' }); showToast('Archived.'); refresh(); }
    if (action === 'unarchive') { Storage.setOverride(id, { status: 'active' }); showToast('Restored to active.'); refresh(); }
    if (action === 'hide') { Storage.setOverride(id, { hidden: true }); showToast('Hidden. You can restore it from "Manage hidden wizards" below the grid.'); refresh(); renderHiddenLink(); }
    if (action === 'delete') {
      if (confirm(`Delete "${meta.title}"? This only removes it from this device — it can't be undone here.`)) {
        Storage.deleteCustomWizard(id);
        showToast('Deleted.');
        refresh();
      }
    }
    if (action === 'export') {
      Storage.loadWizardData(id, manifestWizards).then(data => {
        Storage.downloadJSON(id + '.json', data);
      }).catch(err => showToast(err.message, true));
    }
    if (action === 'source') {
      const custom = Storage.getCustomWizards()[id];
      if (custom && custom._sourceMarkdown) {
        const blob = new Blob([custom._sourceMarkdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = id + '.md'; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      }
    }
  }

  // ---------------- filters wiring ----------------
  searchInput.addEventListener('input', refresh);
  categorySelect.addEventListener('change', refresh);
  sortSelect.addEventListener('change', refresh);

  // ---------------- hidden wizards ----------------
  function renderHiddenLink() {
    const hidden = Storage.getHiddenWizardMeta(manifestWizards);
    const el = document.getElementById('hiddenLink');
    if (!hidden.length) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = `${hidden.length} wizard${hidden.length > 1 ? 's' : ''} hidden — manage`;
  }
  document.getElementById('hiddenLink').addEventListener('click', () => {
    const hidden = Storage.getHiddenWizardMeta(manifestWizards);
    const names = hidden.map(w => `\u2022 ${w.title}`).join('\n');
    if (confirm(`Hidden wizards:\n\n${names}\n\nUnhide all of them?`)) {
      hidden.forEach(w => Storage.setOverride(w.id, { hidden: false }));
      refresh(); renderHiddenLink();
    }
  });

  // ---------------- edit modal ----------------
  const editModal = document.getElementById('editModal');
  let editingId = null;
  function openEditModal(id, meta) {
    editingId = id;
    document.getElementById('editTitleInput').value = meta.title || '';
    document.getElementById('editCategory').value = meta.category || '';
    document.getElementById('editTags').value = (meta.tags || []).join(', ');
    document.getElementById('editDate').value = meta.date || '';
    editModal.classList.remove('hidden');
  }
  document.getElementById('editCancel').addEventListener('click', () => editModal.classList.add('hidden'));
  document.getElementById('editModalClose').addEventListener('click', () => editModal.classList.add('hidden'));
  document.getElementById('editSave').addEventListener('click', () => {
    const title = document.getElementById('editTitleInput').value.trim();
    if (!title) { showToast('Title can\'t be empty.', true); return; }
    const category = document.getElementById('editCategory').value.trim() || 'Uncategorized';
    const tags = document.getElementById('editTags').value.split(',').map(t => t.trim()).filter(Boolean);
    const date = document.getElementById('editDate').value.trim();
    Storage.setOverride(editingId, { title, category, tags, date });
    editModal.classList.add('hidden');
    refresh();
    showToast('Saved.');
  });

  // ---------------- add-wizard modal ----------------
  const addModal = document.getElementById('addModal');
  document.getElementById('newWizardBtn').addEventListener('click', () => { addModal.classList.remove('hidden'); resetAddModal(); });
  document.getElementById('addModalClose').addEventListener('click', () => addModal.classList.add('hidden'));

  // Three panes share the modal: paneUpload/paneGenerate are switched by the
  // visible tabs, paneReview is a third step reached only via the "Review"
  // button (and back again) — the tab strip hides while it's open since it
  // isn't one of the two top-level choices.
  const addTabsEl = document.querySelector('.add-tabs');
  function showAddPane(name) {
    document.querySelectorAll('.add-pane').forEach(p => p.classList.remove('active'));
    document.getElementById(name).classList.add('active');
    if (name === 'paneReview') {
      addTabsEl.style.display = 'none';
    } else {
      addTabsEl.style.display = '';
      document.querySelectorAll('.add-tabs button').forEach(b => b.classList.toggle('active', b.getAttribute('data-pane') === name));
    }
  }
  document.querySelectorAll('.add-tabs button').forEach(btn => {
    btn.addEventListener('click', () => showAddPane(btn.getAttribute('data-pane')));
  });

  function resetAddModal() {
    document.getElementById('mdFileInput').value = '';
    document.getElementById('mdPasteArea').value = '';
    document.getElementById('parseResult').innerHTML = '';
    document.getElementById('confirmAddBtn').style.display = 'none';
    document.getElementById('reviewList').innerHTML = '';
    pendingItems = [];
    showAddPane('paneUpload');
  }

  // One entry per file dropped/chosen, plus at most one for the paste
  // textarea. `edit` seeds the review-step inputs (title/category/tags/date)
  // and is the only thing the review step is allowed to change — the parsed
  // wizard's steps/content are never touched.
  let pendingItems = [];

  function upsertPendingItem(key, fileName, text) {
    const existingIdx = pendingItems.findIndex(it => it.key === key);
    if (!text || !text.trim()) {
      if (existingIdx !== -1) pendingItems.splice(existingIdx, 1);
      renderParseList();
      return;
    }
    const { wizard, errors } = parseWizardMarkdown(text);
    const item = {
      key, fileName, sourceMarkdown: text, wizard, errors,
      edit: wizard ? {
        title: wizard.title,
        category: wizard.category,
        tags: (wizard.tags || []).join(', '),
        date: wizard.date
      } : null
    };
    if (existingIdx !== -1) pendingItems[existingIdx] = item; else pendingItems.push(item);
    renderParseList();
  }

  function removePendingItem(key) {
    pendingItems = pendingItems.filter(it => it.key !== key);
    renderParseList();
  }

  function renderParseItemHtml(it) {
    const source = it.fileName ? escapeHtml(it.fileName) : 'Pasted text';
    if (it.wizard) {
      const kindLabel = it.wizard.kind === 'article' ? 'Article (auto-converted from plain Markdown)' : 'Wizard';
      const errorsHtml = (it.errors && it.errors.length)
        ? `<ul class="parse-item-errors">${it.errors.map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : '';
      return `<div class="parse-item${it.errors && it.errors.length ? ' has-error' : ''}" data-key="${escapeHtml(it.key)}">
        <div class="parse-item-main">
          <strong>${escapeHtml(it.wizard.title)}</strong>
          <div class="parse-item-meta">${kindLabel} \u00b7 ${escapeHtml(it.wizard.category)} \u00b7 ${Object.keys(it.wizard.steps).length} steps</div>
          <div class="parse-item-source">${source}</div>
          ${errorsHtml}
        </div>
        <button class="parse-item-remove" data-key="${escapeHtml(it.key)}" title="Remove">&times;</button>
      </div>`;
    }
    return `<div class="parse-item has-error" data-key="${escapeHtml(it.key)}">
      <div class="parse-item-main">
        <strong>Couldn't build a wizard from this one</strong>
        <div class="parse-item-source">${source}</div>
        <ul class="parse-item-errors">${(it.errors || []).map(e => `<li>${escapeHtml(e)}</li>`).join('')}</ul>
      </div>
      <button class="parse-item-remove" data-key="${escapeHtml(it.key)}" title="Remove">&times;</button>
    </div>`;
  }

  function renderParseList() {
    const resultEl = document.getElementById('parseResult');
    const confirmBtn = document.getElementById('confirmAddBtn');
    if (!pendingItems.length) { resultEl.innerHTML = ''; confirmBtn.style.display = 'none'; return; }
    resultEl.innerHTML = `<div class="parse-list">${pendingItems.map(renderParseItemHtml).join('')}</div>`;
    resultEl.querySelectorAll('.parse-item-remove').forEach(btn => {
      btn.addEventListener('click', () => removePendingItem(btn.getAttribute('data-key')));
    });
    const validCount = pendingItems.filter(it => it.wizard).length;
    if (validCount) {
      confirmBtn.style.display = '';
      confirmBtn.textContent = `Review ${validCount} wizard${validCount > 1 ? 's' : ''}`;
    } else {
      confirmBtn.style.display = 'none';
    }
  }

  function readFileAsText(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsText(file);
    });
  }

  // Handles any number of files from either the file picker or a drop —
  // each one gets its own pending item, parsed and listed independently.
  function handleFiles(fileList) {
    Array.from(fileList || []).forEach(file => {
      readFileAsText(file).then(text => upsertPendingItem('file:' + file.name.toLowerCase(), file.name, text));
    });
  }

  document.getElementById('mdFileInput').addEventListener('change', e => { handleFiles(e.target.files); });
  document.getElementById('mdPasteArea').addEventListener('input', e => { upsertPendingItem('__paste__', null, e.target.value); });

  const dropzone = document.getElementById('dropzone');
  ['dragover', 'dragenter'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(evt => dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('drag'); }));
  dropzone.addEventListener('drop', e => { handleFiles(e.dataTransfer.files); });
  dropzone.addEventListener('click', () => document.getElementById('mdFileInput').click());

  // ---------------- review step: edit labels, not content ----------------
  function openReviewPane() {
    const validItems = pendingItems.filter(it => it.wizard);
    if (!validItems.length) return;
    document.getElementById('reviewList').innerHTML = validItems.map(it => {
      const kindLabel = it.wizard.kind === 'article' ? 'Article' : 'Wizard';
      const source = it.fileName ? escapeHtml(it.fileName) : 'Pasted text';
      return `<div class="review-item" data-key="${escapeHtml(it.key)}">
        <div class="review-item-head">
          <span class="badge">${kindLabel}</span>
          <span class="review-item-source">${source} \u00b7 ${Object.keys(it.wizard.steps).length} steps</span>
        </div>
        <div class="field">
          <label>Title</label>
          <input type="text" class="ri-title" value="${escapeHtml(it.edit.title)}">
        </div>
        <div class="review-row">
          <div class="field">
            <label>Category</label>
            <input type="text" class="ri-category" value="${escapeHtml(it.edit.category)}">
          </div>
          <div class="field">
            <label>Date</label>
            <input type="date" class="ri-date" value="${escapeHtml(it.edit.date)}">
          </div>
        </div>
        <div class="field">
          <label>Tags (comma separated)</label>
          <input type="text" class="ri-tags" value="${escapeHtml(it.edit.tags)}">
        </div>
      </div>`;
    }).join('');
    showAddPane('paneReview');
  }
  document.getElementById('confirmAddBtn').addEventListener('click', openReviewPane);
  document.getElementById('reviewBackBtn').addEventListener('click', () => showAddPane('paneUpload'));

  function existingWizardIds() {
    const ids = new Set(manifestWizards.map(w => w.id));
    Object.keys(Storage.getCustomWizards()).forEach(id => ids.add(id));
    return ids;
  }

  document.getElementById('reviewConfirmBtn').addEventListener('click', () => {
    const takenIds = existingWizardIds();
    let added = 0;
    document.querySelectorAll('#reviewList .review-item').forEach(row => {
      const key = row.getAttribute('data-key');
      const item = pendingItems.find(it => it.key === key);
      if (!item || !item.wizard) return;

      const title = row.querySelector('.ri-title').value.trim() || item.wizard.title;
      const category = row.querySelector('.ri-category').value.trim() || 'Uncategorized';
      const tags = row.querySelector('.ri-tags').value.split(',').map(t => t.trim()).filter(Boolean);
      const date = row.querySelector('.ri-date').value.trim() || item.wizard.date;

      // Id follows the (possibly edited) title, uniquified against every
      // existing wizard and everything else in this same batch.
      const base = slug(title);
      let id = base, n = 2;
      while (takenIds.has(id)) { id = base + '-' + n; n++; }
      takenIds.add(id);

      // Register both any `sourceFiles:` the doc's frontmatter declared and
      // the actual uploaded/dropped filename (if any), so a checklist
      // elsewhere like "work through this-file.md" can find its way back.
      const declared = item.wizard.sourceFiles || [];
      const auto = item.fileName ? [item.fileName] : [];
      const seen = new Set();
      const sourceFiles = declared.concat(auto).filter(sf => {
        const sfKey = (typeof sf === 'string' ? sf : sf.file || '').trim().toLowerCase();
        if (!sfKey || seen.has(sfKey)) return false;
        seen.add(sfKey);
        return true;
      });

      const data = Object.assign({}, item.wizard, {
        id, title, category, tags, date, sourceFiles,
        _sourceMarkdown: item.sourceMarkdown,
        _addedAt: new Date().toISOString().slice(0, 10)
      });
      Storage.saveCustomWizard(data);
      added++;
    });
    addModal.classList.add('hidden');
    showToast(added === 1 ? 'Wizard added.' : `${added} wizards added.`);
    refresh();
  });

  // patch getAllWizardMeta results with a _hasSource flag for the menu
  const originalGetAllWizardMeta = Storage.getAllWizardMeta;
  Storage.getAllWizardMeta = function (manifest) {
    const list = originalGetAllWizardMeta(manifest);
    const custom = Storage.getCustomWizards();
    return list.map(w => Object.assign({}, w, { _hasSource: !!(custom[w.id] && custom[w.id]._sourceMarkdown) }));
  };

  // ---------------- "get a wizard written" panel ----------------
  const STARTER_PROMPT = "I've attached loewtorials' wizard-authoring spec (wizard-spec.md). Please write a new wizard in that exact Markdown format for the following topic — ask me anything you need first: \n\n[describe the process/decision-tree/troubleshooting flow you want turned into a wizard]";

  document.getElementById('downloadSpecBtn').addEventListener('click', () => {
    fetch('templates/wizard-spec.md').then(r => r.text()).then(text => {
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'wizard-spec.md'; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
  });

  document.getElementById('copyPromptBtn').addEventListener('click', () => {
    navigator.clipboard.writeText(STARTER_PROMPT).then(
      () => showToast('Prompt copied — download the spec above, then paste this alongside it in Claude.'),
      () => showToast('Could not copy automatically — select and copy the prompt manually.', true)
    );
  });

  document.getElementById('openDesktopBtn').addEventListener('click', () => {
    window.location.href = 'claude://claude.ai/new?q=' + encodeURIComponent(STARTER_PROMPT);
  });

  loadAndRender();
})();
