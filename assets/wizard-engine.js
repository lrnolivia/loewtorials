// wizard-engine.js
// Renders a wizard data object (see wizards/*.json for the schema) into the
// #app root using the rail/stage UI. Fully generic — no wizard-specific code
// lives here. To add a wizard, add data, not code.

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyCode(text, btn) {
  const done = () => { btn.textContent = 'copied'; btn.classList.add('copied'); setTimeout(() => { btn.textContent = 'copy'; btn.classList.remove('copied'); }, 1400); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { btn.textContent = 'select & copy'; });
  } else {
    btn.textContent = 'select & copy';
  }
}

// Optional "detected on your system" badge. Purely informational, never
// blocks navigation. A step (or the whole wizard) can declare
// `relevantPackages: ['ntfs-3g', ...]`; if a system profile was passed in,
// each package is checked against the last-parsed Containerfile's
// installed-package list.
function matchBadgeHtml(relevantPackages, profile) {
  if (!relevantPackages || !relevantPackages.length || !profile) return '';
  const cf = profile.containerfile;
  if (!cf || !cf.parsed) return '';
  const installed = new Set((cf.parsed.installedPackages || []).map(p => p.toLowerCase()));
  const found = relevantPackages.filter(p => installed.has(String(p).toLowerCase()));
  const missing = relevantPackages.filter(p => !installed.has(String(p).toLowerCase()));
  let html = '<p class="match-badge-row">';
  if (found.length) {
    html += `<span class="match-badge found">&#10003; detected on your system (${found.map(escapeHtml).join(', ')})</span>`;
  }
  if (missing.length) {
    html += `<span class="match-badge missing">&#9888; not found in your last Containerfile (${missing.map(escapeHtml).join(', ')})</span>`;
  }
  html += '</p>';
  return html;
}

function createWizardEngine(rootEl, wizard, opts) {
  opts = opts || {};
  const STEPS = wizard.steps;
  const OUTLINE = wizard.outline || [];
  const START = (opts.startAt && STEPS[opts.startAt]) ? opts.startAt : wizard.start;

  let currentId = START;
  let history = [];
  let checked = {}; // stepId -> Set of indices
  let banner = null;

  function stepOrder() {
    // Flatten outline groups (in order) for progress-bar math; branch/outcome
    // markers included so percentage feels right even mid-branch.
    const order = [];
    OUTLINE.forEach(item => {
      if (item.type === 'group') order.push(...item.steps);
      else if (item.type === 'branch') order.push(item.id);
    });
    return order.length ? order : Object.keys(STEPS);
  }

  function goTo(id, stepOpts) {
    stepOpts = stepOpts || {};
    history.push(currentId);
    currentId = id;
    banner = stepOpts.banner || null;
    render();
    // Scroll .stage-top (phase eyebrow + step title) into view, not just
    // the step card — the card sits below stage-top in the DOM, so
    // aligning the card's own top edge to the viewport top (the previous
    // approach) pushed the eyebrow/title/view-toggle up and off-screen
    // above it on any step tall enough to need scrolling, leaving you on
    // an unlabeled wall of content with no sense of which step you were
    // on. Scrolling the full rootEl instead (an even earlier approach)
    // yanked the sidebar along with it and fought the sidebar's own
    // sticky positioning. .stage-top is the middle ground: it's the
    // first thing in the content column, above the card, so scrolling
    // it to 'start' brings both the title and the card into view
    // together without touching the sidebar. .stage-top also carries
    // scroll-margin-top (see wizard.css) so the sticky utility bar
    // doesn't cover it once it gets there.
    if (!opts.suppressScroll) {
      const scrollTarget = rootEl.querySelector('.stage-top') || rootEl.querySelector('[data-w="stepCard"]') || rootEl;
      if (scrollTarget.scrollIntoView) scrollTarget.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (opts.onNavigate) opts.onNavigate(currentId, history);
  }

  function goBack() {
    if (history.length === 0) return;
    currentId = history.pop();
    banner = null;
    render();
    if (opts.onNavigate) opts.onNavigate(currentId, history);
  }

  function resetAll() {
    currentId = START;
    history = [];
    checked = {};
    banner = null;
    render();
    if (opts.onNavigate) opts.onNavigate(currentId, history);
  }

  function toggleCheck(stepId, idx) {
    checked[stepId] = checked[stepId] || new Set();
    if (checked[stepId].has(idx)) checked[stepId].delete(idx);
    else checked[stepId].add(idx);
  }

  // ---------------- render: rail ----------------
  function renderRail(railContentEl, mobileProgressEl) {
    let html = '';

    function tickState(id) {
      if (id === currentId) return 'current';
      if (history.includes(id)) return 'past';
      return '';
    }
    function groupState(ticks) {
      if (ticks.includes(currentId)) return 'active';
      if (ticks.every(t => history.includes(t))) return 'done';
      return '';
    }

    OUTLINE.forEach(item => {
      if (item.type === 'group') {
        html += `<div class="group ${groupState(item.steps)}">
          <div class="group-head"><span class="node"></span><span class="label">${escapeHtml(item.label)}</span></div>
          <div class="ticks">`;
        item.steps.forEach(id => {
          const s = STEPS[id];
          if (!s) return;
          html += `<button type="button" class="tick ${tickState(id)}" data-step-link="${escapeHtml(id)}"><span class="dot"></span>${escapeHtml(s.title)}</button>`;
        });
        html += `</div></div>`;
      } else if (item.type === 'branch') {
        const branchStep = STEPS[item.id];
        const label = item.label || (branchStep ? branchStep.title : '');
        const seen = currentId === item.id || history.includes(item.id);
        const isCurrent = currentId === item.id;
        const state = isCurrent ? 'active' : (seen ? 'done' : '');
        html += `<button type="button" class="diamond-row ${state}" data-step-link="${escapeHtml(item.id)}"><span class="diamond"></span> ${escapeHtml(label)}</button>`;
      } else if (item.type === 'outcomes') {
        html += `<div class="outcomes">`;
        item.ids.forEach(id => {
          const s = STEPS[id];
          if (!s) return;
          const taken = currentId === id;
          html += `<button type="button" class="outcome-node ${taken ? 'taken' : ''}" data-step-link="${escapeHtml(id)}">${escapeHtml((s.outcomeStyle === 'success' ? 'RESOLVED \u2014 ' : '').concat(s.title))}</button>`;
        });
        html += `</div>`;
      }
    });

    railContentEl.innerHTML = html;
    railContentEl.querySelectorAll('[data-step-link]').forEach(link => link.addEventListener('click', () => {
      const id = link.getAttribute('data-step-link');
      if (id && id !== currentId) goTo(id);
      const rail = document.getElementById('rail');
      const backdrop = document.getElementById('railBackdrop');
      if (rail) rail.classList.remove('open');
      if (backdrop) backdrop.classList.remove('open');
    }));

    if (mobileProgressEl) {
      const order = stepOrder();
      const idx = order.indexOf(currentId);
      const pct = idx >= 0 ? Math.round(((idx + 1) / order.length) * 100) : 0;
      mobileProgressEl.style.transform = 'scaleX(' + (pct / 100) + ')';
    }
  }

  // ---------------- render: stage ----------------
  function renderStage(cardEl, eyebrowEl) {
    const s = STEPS[currentId];
    if (!s) {
      cardEl.innerHTML = `<p class="step-body">This wizard has no step called "${escapeHtml(currentId)}". Check the wizard data for a broken <code>next</code> reference.</p>`;
      return;
    }

    let phaseLabel = (s.group && groupLabelFor(s.group)) || 'Step';
    if (s.type === 'branch') phaseLabel += ' \u00b7 Decision point';
    if (s.type === 'outcome') phaseLabel = 'Outcome';
    if (eyebrowEl) eyebrowEl.textContent = phaseLabel;

    cardEl.className = 'step-card' + (s.type === 'branch' ? ' branch' : '') + (s.type === 'outcome' ? ' outcome ' + (s.outcomeStyle || 'success') : '');

    let html = '';
    if (s.tick) html += `<p class="step-kicker">Step ${escapeHtml(s.tick)}</p>`;
    if (banner) html += `<div class="note-callout">${banner}</div>`;
    html += `<h2 class="step-title">${escapeHtml(s.title)}</h2>`;
    html += matchBadgeHtml(s.relevantPackages || wizard.relevantPackages, opts.profile);
    html += `<div class="step-body">${s.body || ''}</div>`;

    if (s.code && s.code.length) {
      s.code.forEach((c, i) => {
        html += `<div class="code-wrap"><pre class="code" id="code-${currentId}-${i}">${escapeHtml(c)}</pre><button class="copy-btn" data-code="${currentId}-${i}">copy</button></div>`;
      });
    }
    if (s.note) html += `<div class="note-callout">${s.note}</div>`;
    if (s.checklist && s.checklist.length) {
      html += `<ul class="checklist">`;
      s.checklist.forEach((item, i) => {
        const isChecked = checked[currentId] && checked[currentId].has(i);
        html += `<li>
          <input type="checkbox" id="chk-${currentId}-${i}" ${isChecked ? 'checked' : ''} data-step="${currentId}" data-idx="${i}">
          <label for="chk-${currentId}-${i}" class="${isChecked ? 'done' : ''}">${escapeHtml(item)}</label>
        </li>`;
      });
      html += `</ul>`;
    }

    // Auto-linked references to other wizards (e.g. a checklist item that
    // said "work through fix-dirty-ntfs-partition.md"). Only rendered when
    // a match is actually found — unmatched filenames stay plain text.
    const depth = opts.depth || 0;
    const canEmbed = depth < 2 && !!opts.loadWizard;
    let matchedRefs = [];
    if (s.refs && s.refs.length && opts.resolveRef) {
      matchedRefs = s.refs
        .map(f => opts.resolveRef(f))
        .filter(match => match && match.id !== (opts.currentWizardId || wizard.id));
    }
    if (matchedRefs.length) {
      html += `<div class="ref-links">`;
      matchedRefs.forEach((match, i) => {
        const href = 'wizard.html?id=' + encodeURIComponent(match.id) + (match.step ? '&step=' + encodeURIComponent(match.step) : '');
        html += `<div class="ref-link-card">
          <div class="ref-link-head">
            <span class="ref-link-icon">&#128279;</span>
            <div>
              <div class="ref-link-label">Referenced wizard</div>
              <div class="ref-link-title">${escapeHtml(match.title)}</div>
            </div>
          </div>
          <div class="ref-link-actions">
            ${canEmbed ? `<button type="button" class="btn btn-sm btn-ghost" data-embed-toggle="${i}">Show here</button>` : ''}
            <a class="btn btn-sm btn-ghost" href="${href}">Open full page &rarr;</a>
          </div>
          <div class="ref-embed" data-embed-slot="${i}" style="display:none;"></div>
        </div>`;
      });
      html += `</div>`;
    }

    html += `<div class="stage-nav">`;
    html += `<button class="btn btn-back" id="wBack" ${history.length === 0 ? 'disabled style="visibility:hidden"' : ''}>\u2190 Back</button>`;
    if (s.type === 'branch') {
      html += `<div class="choice-row">`;
      s.choices.forEach((c, i) => {
        html += `<button class="btn btn-choice" data-choice="${i}">${escapeHtml(c.label)}</button>`;
      });
      html += `</div>`;
    } else if (s.type === 'outcome' || !s.next) {
      // terminal — no forward nav
    } else {
      html += `<button class="btn btn-primary" id="wNext">Next \u2192</button>`;
    }
    html += `</div>`;

    cardEl.innerHTML = html;
    if (window.Motion) window.Motion.swap(cardEl);

    const nextBtn = cardEl.querySelector('#wNext');
    if (nextBtn) nextBtn.addEventListener('click', () => goTo(s.next));
    const backBtn = cardEl.querySelector('#wBack');
    if (backBtn) backBtn.addEventListener('click', goBack);
    cardEl.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const c = s.choices[parseInt(btn.getAttribute('data-choice'), 10)];
        goTo(c.next, { banner: c.banner });
      });
    });
    cardEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        toggleCheck(cb.getAttribute('data-step'), parseInt(cb.getAttribute('data-idx'), 10));
        renderStage(cardEl, eyebrowEl);
      });
    });
    cardEl.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-code');
        const pre = cardEl.querySelector('#code-' + key);
        copyCode(pre.textContent, btn);
      });
    });
    cardEl.querySelectorAll('[data-embed-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.getAttribute('data-embed-toggle'), 10);
        const slot = cardEl.querySelector('[data-embed-slot="' + i + '"]');
        const match = matchedRefs[i];
        if (!slot || !match) return;

        if (slot.dataset.loaded === '1') {
          const isOpen = slot.style.display !== 'none';
          slot.style.display = isOpen ? 'none' : '';
          btn.textContent = isOpen ? 'Show here' : 'Hide';
          return;
        }

        slot.style.display = '';
        slot.innerHTML = `<div class="ref-embed-loading">Loading&hellip;</div>`;
        btn.textContent = 'Hide';
        btn.disabled = true;

        Promise.resolve(opts.loadWizard(match.id)).then(data => {
          slot.innerHTML = `<div class="ref-embed-inner" data-w="stepCard"></div>`;
          const nested = createWizardEngine(slot, data, {
            startAt: match.step,
            suppressScroll: true,
            resolveRef: opts.resolveRef,
            loadWizard: opts.loadWizard,
            currentWizardId: match.id,
            depth: depth + 1,
            profile: opts.profile
          });
          nested.render();
          slot.dataset.loaded = '1';
          btn.disabled = false;
        }).catch(err => {
          slot.innerHTML = `<div class="ref-embed-error">Couldn't load this wizard: ${escapeHtml(err.message || 'unknown error')}</div>`;
          btn.disabled = false;
        });
      });
    });
  }

  function groupLabelFor(groupId) {
    const g = OUTLINE.find(i => i.type === 'group' && i.id === groupId);
    return g ? g.label : null;
  }

  function render() {
    const railContentEl = rootEl.querySelector('[data-w="railContent"]');
    const mobileProgressEl = rootEl.querySelector('[data-w="mobileProgress"]');
    const cardEl = rootEl.querySelector('[data-w="stepCard"]');
    const eyebrowEl = rootEl.querySelector('[data-w="phaseEyebrow"]');
    if (railContentEl) renderRail(railContentEl, mobileProgressEl);
    if (cardEl) renderStage(cardEl, eyebrowEl);
  }

  // Plain-object snapshot of which checklist items are ticked per step —
  // {stepId: [idx, idx, ...]} — for anything that wants to read progress
  // without reaching into engine internals (e.g. the mark-solved review).
  function getChecked() {
    const out = {};
    Object.keys(checked).forEach(stepId => {
      out[stepId] = Array.from(checked[stepId]).sort((a, b) => a - b);
    });
    return out;
  }

  return {
    render,
    resetAll,
    goTo,
    goBack,
    getChecked,
    get currentId() { return currentId; },
    get history() { return history.slice(); }
  };
}

// ---------------------------------------------------------------------
// Article view: renders every step in a wizard's outline as one long,
// scrollable read-through — same data, no navigation state. Branches are
// shown as a labeled list of options (each a same-page anchor link to its
// target section) rather than followed, since there's no single "path"
// being played through; outcomes render inline instead of as an ending.
// Checklists and code-copy still work. Used both for auto-converted
// articles and as the always-available alternate view for any wizard.
// ---------------------------------------------------------------------
function renderArticleView(rootEl, wizard, opts) {
  opts = opts || {};
  const STEPS = wizard.steps;
  const OUTLINE = wizard.outline || [];
  let checked = {};

  function stepBlockHtml(id, s) {
    let html = `<section class="article-step" id="step-${escapeHtml(id)}">`;
    const isBranch = s.type === 'branch';
    const isOutcome = s.type === 'outcome';
    if (isBranch) html += `<p class="step-kicker">Decision point</p>`;
    else if (isOutcome) html += `<p class="step-kicker">Outcome${s.outcomeStyle ? ' \u00b7 ' + escapeHtml(s.outcomeStyle) : ''}</p>`;
    html += `<h2 class="step-title">${escapeHtml(s.title)}</h2>`;
    html += matchBadgeHtml(s.relevantPackages || wizard.relevantPackages, opts.profile);
    if (s.body) html += `<div class="step-body">${s.body}</div>`;

    if (isBranch) {
      html += `<ul class="article-choices">`;
      (s.choices || []).forEach(c => {
        html += `<li><a href="#step-${escapeHtml(c.next)}">${escapeHtml(c.label)}</a>${c.banner ? ' <span class="choice-banner">' + escapeHtml(c.banner) + '</span>' : ''}</li>`;
      });
      html += `</ul>`;
    }
    if (s.code && s.code.length) {
      s.code.forEach((c, i) => {
        html += `<div class="code-wrap"><pre class="code" id="acode-${id}-${i}">${escapeHtml(c)}</pre><button class="copy-btn" data-code="${id}-${i}">copy</button></div>`;
      });
    }
    if (s.note) html += `<div class="note-callout">${s.note}</div>`;
    if (s.checklist && s.checklist.length) {
      html += `<ul class="checklist">`;
      s.checklist.forEach((item, i) => {
        const isChecked = checked[id] && checked[id].has(i);
        html += `<li>
          <input type="checkbox" id="achk-${id}-${i}" ${isChecked ? 'checked' : ''} data-step="${id}" data-idx="${i}">
          <label for="achk-${id}-${i}" class="${isChecked ? 'done' : ''}">${escapeHtml(item)}</label>
        </li>`;
      });
      html += `</ul>`;
    }
    html += `</section>`;
    return html;
  }

  function wireInteractions(cardEl) {
    cardEl.querySelectorAll('input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        const stepId = cb.getAttribute('data-step');
        const idx = parseInt(cb.getAttribute('data-idx'), 10);
        checked[stepId] = checked[stepId] || new Set();
        if (checked[stepId].has(idx)) checked[stepId].delete(idx); else checked[stepId].add(idx);
        const label = cb.nextElementSibling;
        if (label) label.classList.toggle('done', checked[stepId].has(idx));
      });
    });
    cardEl.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pre = cardEl.querySelector('#acode-' + btn.getAttribute('data-code'));
        if (pre) copyCode(pre.textContent, btn);
      });
    });
  }

  function allStepIds() {
    const ids = [];
    OUTLINE.forEach(item => {
      if (item.type === 'group') ids.push(...item.steps);
      else if (item.type === 'branch') ids.push(item.id);
      else if (item.type === 'outcomes') ids.push(...item.ids);
    });
    return ids;
  }

  function render() {
    const cardEl = rootEl.querySelector('[data-w="stepCard"]');
    const railContentEl = rootEl.querySelector('[data-w="railContent"]');
    const eyebrowEl = rootEl.querySelector('[data-w="phaseEyebrow"]');
    if (eyebrowEl) eyebrowEl.textContent = 'Article \u00b7 full read-through';

    let html = '';
    OUTLINE.forEach(item => {
      if (item.type === 'group') {
        html += `<h3 class="article-group-label">${escapeHtml(item.label)}</h3>`;
        item.steps.forEach(id => { if (STEPS[id]) html += stepBlockHtml(id, STEPS[id]); });
      } else if (item.type === 'branch') {
        if (STEPS[item.id]) html += stepBlockHtml(item.id, STEPS[item.id]);
      } else if (item.type === 'outcomes') {
        item.ids.forEach(id => { if (STEPS[id]) html += stepBlockHtml(id, STEPS[id]); });
      }
    });

    if (cardEl) {
      cardEl.className = 'step-card article-card';
      cardEl.innerHTML = html || '<p class="step-body">Nothing to show.</p>';
      wireInteractions(cardEl);
    }

    if (railContentEl) {
      let railHtml = '';
      OUTLINE.forEach(item => {
        if (item.type === 'group') {
          railHtml += `<div class="group"><div class="group-head"><span class="node"></span><span class="label">${escapeHtml(item.label)}</span></div><div class="ticks">`;
          item.steps.forEach(id => {
            const s = STEPS[id];
            if (s) railHtml += `<a class="tick" href="#step-${escapeHtml(id)}"><span class="dot"></span>${escapeHtml(s.title)}</a>`;
          });
          railHtml += `</div></div>`;
        } else if (item.type === 'branch') {
          const s = STEPS[item.id];
          railHtml += `<a class="diamond-row" href="#step-${escapeHtml(item.id)}"><span class="diamond"></span> ${escapeHtml(item.label || (s && s.title) || '')}</a>`;
        } else if (item.type === 'outcomes') {
          railHtml += `<div class="outcomes">`;
          item.ids.forEach(id => {
            const s = STEPS[id];
            if (s) railHtml += `<a class="outcome-node" href="#step-${escapeHtml(id)}">${escapeHtml(s.title)}</a>`;
          });
          railHtml += `</div>`;
        }
      });
      railContentEl.innerHTML = railHtml;
    }
  }

  return {
    render,
    getChecked() {
      const out = {};
      Object.keys(checked).forEach(id => { out[id] = Array.from(checked[id]).sort((a, b) => a - b); });
      return out;
    },
    getHistory() { return allStepIds(); }
  };
}
