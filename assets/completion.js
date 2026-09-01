// completion.js
// "Mark solved / finished" workflow. Rather than a blank questionnaire, this
// walks the *actual path the user took* through the wizard (from the engine's
// history + which checklist boxes got ticked) and asks one tap-only question
// per step. Every question defaults to the happy-path answer, so hitting
// Save with zero taps already produces an accurate record for a run that
// went as written -- taps are only needed to flag exceptions. A free-text
// note is optional and only ever offered, never required.
//
// A completion also produces a per-run .md summary, and every completion
// across every wizard rolls up into one activity-log .md (see
// generateActivityLogMd) -- both meant to be handed back to a fresh
// Claude/ChatGPT conversation as a trace of what's already been done. An
// "import from a chat summary" button lets that trace flow the other way:
// upload a .md (either one this app generated, or a free-form summary from
// an AI chat) and best-effort keyword parsing pre-fills the taps.

const REVIEW_STATUS_LABELS = {
  step: { fine: 'Went fine', different: 'Did it differently', issue: 'Ran into an issue', skipped: 'Skipped it' },
  branch: { fine: 'Right call', issue: 'Wrong call \u2014 backtracked or regretted it' },
  outcome: { fine: 'Ended here as expected', issue: "Didn't actually end up here" }
};
const REVIEW_OVERALL_LABELS = { yes: 'Would use again as-is', tweaks: 'Needs some tweaks', no: "Wouldn't use again" };

// ---------------- building the review list from the run ----------------

// wizardCtx: { id, title, steps, getHistory: () => [stepIds], getChecked: () => {stepId:[idx,...]} }
function buildStepReviews(wizardCtx) {
  const steps = wizardCtx.steps || {};
  const rawHistory = wizardCtx.getHistory ? wizardCtx.getHistory() : [];
  const checkedMap = wizardCtx.getChecked ? wizardCtx.getChecked() : {};

  const seen = new Set();
  const entries = [];
  rawHistory.forEach((id, i) => {
    if (seen.has(id)) return;
    seen.add(id);
    const s = steps[id];
    if (!s) return;
    const kind = s.type === 'branch' ? 'branch' : s.type === 'outcome' ? 'outcome' : 'step';

    let choiceLabel = null;
    if (kind === 'branch' && s.choices) {
      const nextId = rawHistory[i + 1];
      const choice = s.choices.find(c => c.next === nextId);
      if (choice) choiceLabel = choice.label;
    }

    let checklist = null;
    if (s.checklist && s.checklist.length) {
      const checkedIdx = new Set(checkedMap[id] || []);
      checklist = s.checklist.map((text, idx) => ({ text, checked: checkedIdx.has(idx) }));
    }

    entries.push({ id, kind, title: s.title, choiceLabel, checklist, status: 'fine', note: '' });
  });
  return entries;
}

// ---------------- best-effort import from a pasted/uploaded .md ----------------

const IMPORT_ISSUE_WORDS = ['issue', 'problem', 'error', 'errored', 'fail', 'failed', 'broke', 'broken', "didn't work", 'did not work', 'stuck', "couldn't", 'could not', 'crash'];
const IMPORT_DIFFERENT_WORDS = ['differently', 'instead', 'modified', 'modification', 'changed it', 'different approach', 'tweaked', 'adjusted'];
const IMPORT_SKIPPED_WORDS = ['skipped', 'skip this', "didn't do", 'did not do', 'not applicable', 'n/a'];
const IMPORT_OVERALL_NO = ["wouldn't use", 'would not use', 'would not recommend', "wouldn't recommend", 'avoid this'];
const IMPORT_OVERALL_TWEAKS = ['needs work', 'could improve', 'needs tweaks', 'some tweaks', 'needs updating', 'could be better'];
const IMPORT_OVERALL_YES = ['would use again', 'worked great', 'went well overall', 'recommend it', 'use this again'];

function titleWords(title) {
  return String(title).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
}

function findMatchingLine(lines, title) {
  const words = titleWords(title);
  if (!words.length) return null;
  let best = null, bestScore = 0;
  lines.forEach(line => {
    const lower = line.toLowerCase();
    const score = words.filter(w => lower.includes(w)).length;
    if (score > bestScore && score >= Math.max(1, Math.ceil(words.length * 0.5))) {
      bestScore = score;
      best = line;
    }
  });
  return best;
}

// A crude but useful guard: "no problems", "not an issue", "didn't skip
// anything" shouldn't flag as issue/skipped just because the bare keyword
// is present. Looks for a negation cue in the ~25 chars before the match.
function isNegatedAt(lower, word) {
  const idx = lower.indexOf(word);
  if (idx === -1) return false;
  const before = lower.slice(Math.max(0, idx - 25), idx);
  return /\b(no|not|never|without|zero|n't)\b/.test(before);
}

function firstUnnegatedMatch(lower, words) {
  return words.find(w => lower.includes(w) && !isNegatedAt(lower, w));
}

function classifyLine(line) {
  const lower = line.toLowerCase();
  if (firstUnnegatedMatch(lower, IMPORT_ISSUE_WORDS)) return 'issue';
  if (firstUnnegatedMatch(lower, IMPORT_DIFFERENT_WORDS)) return 'different';
  if (firstUnnegatedMatch(lower, IMPORT_SKIPPED_WORDS)) return 'skipped';
  return 'fine';
}

// Returns { matches: {stepId: {status, note}}, overall, leftover, matchedCount }
function parseChatSummaryMd(text, entries) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const matches = {};
  const usedLines = new Set();

  entries.forEach(e => {
    const line = findMatchingLine(lines, e.title);
    if (!line) return;
    usedLines.add(line);
    const status = e.kind === 'step' ? classifyLine(line) : (classifyLine(line) === 'fine' ? 'fine' : 'issue');
    matches[e.id] = { status, note: line.replace(/^[-*#>\s]+/, '').slice(0, 240) };
  });

  const lower = text.toLowerCase();
  let overall = null;
  if (IMPORT_OVERALL_NO.some(w => lower.includes(w))) overall = 'no';
  else if (IMPORT_OVERALL_TWEAKS.some(w => lower.includes(w))) overall = 'tweaks';
  else if (IMPORT_OVERALL_YES.some(w => lower.includes(w))) overall = 'yes';

  const leftover = lines
    .filter(l => !usedLines.has(l) && !/^#+\s/.test(l) && l.length > 3)
    .join('\n')
    .slice(0, 2000);

  return { matches, overall, leftover, matchedCount: Object.keys(matches).length };
}

// ---------------- .md generation ----------------

function generateCompletionMd(wizardTitle, record) {
  const lines = [];
  lines.push('# ' + wizardTitle + ' \u2014 solved ' + record.date);
  lines.push('');

  if (record.stepReviews && record.stepReviews.length) {
    lines.push('## Step-by-step');
    record.stepReviews.forEach(e => {
      const label = (REVIEW_STATUS_LABELS[e.kind] || REVIEW_STATUS_LABELS.step)[e.status] || e.status;
      let head = '- **';
      if (e.kind === 'branch') head += 'Decision point: ' + e.title + '**';
      else if (e.kind === 'outcome') head += 'Outcome: ' + e.title + '**';
      else head += e.title + '**';
      head += ' \u2014 ' + label;
      if (e.kind === 'branch' && e.choiceLabel) head += ' (chose \u201c' + e.choiceLabel + '\u201d)';
      lines.push(head);
      if (e.checklist && e.checklist.length) {
        e.checklist.forEach(c => lines.push('  - [' + (c.checked ? 'x' : ' ') + '] ' + c.text));
      }
      if (e.note) lines.push('  Note: ' + e.note);
    });
    lines.push('');
    if (record.overall) lines.push('**Overall:** ' + (REVIEW_OVERALL_LABELS[record.overall] || record.overall));
    if (record.notes) lines.push('**Notes:** ' + record.notes);
  } else if (record.answers) {
    // Legacy free-text record shape, kept readable for old completions.
    if (record.pathTaken && record.pathTaken.length) lines.push('**Path taken:** ' + record.pathTaken.join(' \u2192 '));
    if (record.answers.rootCause) lines.push('**Root cause / fix:** ' + record.answers.rootCause);
    if (record.answers.outcomePath) lines.push('**Outcome / final step:** ' + record.answers.outcomePath);
    if (record.answers.wizardFeedback) lines.push('**Wizard feedback:** ' + record.answers.wizardFeedback);
    if (record.answers.specifics) lines.push('**Run-specific details:** ' + record.answers.specifics);
    if (record.answers.notes) lines.push('**Notes:** ' + record.answers.notes);
  }

  if (record.systemSnapshot) {
    const s = record.systemSnapshot;
    const bits = [];
    if (s.os) bits.push(s.os);
    if (s.cpu) bits.push(s.cpu);
    if (s.gpu) bits.push(s.gpu);
    if (s.containerBranch) bits.push('branch: ' + s.containerBranch);
    if (bits.length) lines.push('**System at the time:** ' + bits.join(' \u00b7 '));
  }
  lines.push('');
  return lines.join('\n');
}

function generateActivityLogMd() {
  const flat = Storage.getAllCompletionsFlat();
  const lines = ['# loewtorials activity log', '', 'Generated ' + new Date().toISOString().slice(0, 10) + ' \u2014 ' + flat.length + ' completion(s) across all wizards.', ''];
  if (!flat.length) {
    lines.push('_Nothing marked solved/finished yet._');
    return lines.join('\n');
  }
  flat.forEach(rec => {
    lines.push('## ' + rec.wizardTitle + ' \u2014 ' + rec.date);
    if (rec.stepReviews && rec.stepReviews.length) {
      const flagged = rec.stepReviews.filter(e => e.status !== 'fine');
      lines.push('- ' + rec.stepReviews.length + ' step(s) reviewed' + (flagged.length ? ', ' + flagged.length + ' flagged' : ', all went as written'));
      flagged.forEach(e => {
        const label = (REVIEW_STATUS_LABELS[e.kind] || REVIEW_STATUS_LABELS.step)[e.status] || e.status;
        lines.push('  - ' + e.title + ': ' + label + (e.note ? ' \u2014 ' + e.note : ''));
      });
      if (rec.overall) lines.push('- Overall: ' + (REVIEW_OVERALL_LABELS[rec.overall] || rec.overall));
      if (rec.notes) lines.push('- Notes: ' + rec.notes);
    } else if (rec.answers) {
      if (rec.pathTaken && rec.pathTaken.length) lines.push('- Path: ' + rec.pathTaken.join(' \u2192 '));
      if (rec.answers.rootCause) lines.push('- Root cause / fix: ' + rec.answers.rootCause);
      if (rec.answers.outcomePath) lines.push('- Outcome: ' + rec.answers.outcomePath);
      if (rec.answers.wizardFeedback) lines.push('- Wizard feedback: ' + rec.answers.wizardFeedback);
      if (rec.answers.specifics) lines.push('- Run-specific details: ' + rec.answers.specifics);
      if (rec.answers.notes) lines.push('- Notes: ' + rec.answers.notes);
    }
    lines.push('');
  });
  return lines.join('\n');
}

// ---------------- modal ----------------

function escapeHtmlC(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusOptionsFor(kind) {
  const labels = REVIEW_STATUS_LABELS[kind] || REVIEW_STATUS_LABELS.step;
  return Object.keys(labels).map(status => ({ status, label: labels[status] }));
}

function renderReviewEntryHtml(e, idx) {
  const kindLabel = e.kind === 'branch' ? 'Decision point' : e.kind === 'outcome' ? 'Outcome' : 'Step';
  let meta = '';
  if (e.kind === 'branch' && e.choiceLabel) meta = 'You chose: \u201c' + escapeHtmlC(e.choiceLabel) + '\u201d';
  else if (e.kind === 'outcome') meta = 'This is where the run ended.';

  let html = `<div class="review-step" data-entry="${idx}" data-kind="${e.kind}">
    <div class="review-step-head">
      <div>
        <p class="review-step-kind">${kindLabel}</p>
        <p class="review-step-title">${escapeHtmlC(e.title)}</p>
      </div>
    </div>`;
  if (meta) html += `<p class="review-step-meta">${meta}</p>`;

  if (e.checklist && e.checklist.length) {
    html += `<ul class="review-checklist-mini">`;
    e.checklist.forEach(c => {
      html += `<li class="${c.checked ? 'checked' : ''}"><span class="mark">${c.checked ? '\u2713' : '\u2013'}</span><span>${escapeHtmlC(c.text)}</span></li>`;
    });
    html += `</ul>`;
  }

  html += `<div class="status-row">`;
  statusOptionsFor(e.kind).forEach(opt => {
    const active = opt.status === e.status ? ' active' : '';
    html += `<button type="button" class="status-btn${active}" data-status="${opt.status}">${escapeHtmlC(opt.label)}</button>`;
  });
  html += `</div>`;

  html += `<div class="review-note-field" data-note-wrap style="display:${e.status === 'fine' ? 'none' : ''};">
    <textarea data-note placeholder="Optional \u2014 what happened?">${escapeHtmlC(e.note || '')}</textarea>
  </div>`;

  html += `</div>`;
  return html;
}

function buildCompletionModalHTML(entries) {
  const stepsHtml = entries.map(renderReviewEntryHtml).join('');
  return `
  <div class="modal-backdrop hidden" id="completion-backdrop">
    <div class="modal" style="max-width:720px;" role="dialog" aria-modal="true" aria-labelledby="completion-title">
      <button class="modal-close" id="completion-close" aria-label="Close">&times;</button>
      <h2 id="completion-title">Mark solved / finished</h2>
      <p class="hint">Everything below already defaults to "went as written" \u2014 tap anything that didn't, or just hit Save. This gets saved as a per-run summary you can hand back to Claude or ChatGPT later.</p>

      <div class="review-import-row">
        <p>Have a summary from an AI chat (or an earlier export from here)? Upload it and matching answers below will be pre-filled.</p>
        <button class="btn btn-ghost btn-sm" id="completion-import-btn" type="button">&uarr; Import from .md</button>
        <input type="file" id="completion-import-file" accept=".md,text/markdown,text/plain" style="display:none;">
        <span class="review-import-status" id="completion-import-status"></span>
      </div>

      <div id="completion-steps">${stepsHtml || '<p class="hint">No steps were recorded for this run.</p>'}</div>

      <div class="review-overall">
        <label>Overall, would you use this wizard again as-is?</label>
        <div class="status-row" id="completion-overall-row">
          <button type="button" class="status-btn active" data-overall="yes">Yes, as-is</button>
          <button type="button" class="status-btn" data-overall="tweaks">Needs tweaks</button>
          <button type="button" class="status-btn" data-overall="no">No</button>
        </div>
      </div>

      <button type="button" class="review-notes-toggle" id="completion-notes-toggle">+ Add a general note (optional)</button>
      <div class="review-note-field" id="completion-notes-wrap" style="display:none;">
        <textarea id="completion-notes" placeholder="Anything else worth recording..."></textarea>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:18px;">
        <button class="btn btn-ghost" id="completion-cancel">&times; Cancel</button>
        <button class="btn btn-primary" id="completion-save">&#10003; Save &amp; generate summary</button>
      </div>
    </div>
  </div>`;
}

// wizardCtx: { id, title, steps, getHistory: () => [stepIds], getChecked: () => {...} }
function initCompletionModal(wizardCtx) {
  const existing = document.getElementById('completion-backdrop');
  if (existing) existing.remove();

  const entries = buildStepReviews(wizardCtx);
  let overall = 'yes';

  const wrap = document.createElement('div');
  wrap.innerHTML = buildCompletionModalHTML(entries);
  document.body.appendChild(wrap.firstElementChild);

  const backdrop = document.getElementById('completion-backdrop');
  const close = () => {
    if (window.ModalFocus) ModalFocus.deactivate(backdrop);
    backdrop.remove();
  };

  document.getElementById('completion-close').onclick = close;
  document.getElementById('completion-cancel').onclick = close;
  backdrop.onclick = e => { if (e.target === backdrop) close(); };

  function entryEl(idx) { return backdrop.querySelector(`.review-step[data-entry="${idx}"]`); }

  backdrop.querySelectorAll('.review-step').forEach(stepEl => {
    const idx = parseInt(stepEl.getAttribute('data-entry'), 10);
    stepEl.querySelectorAll('.status-btn[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        const status = btn.getAttribute('data-status');
        entries[idx].status = status;
        stepEl.querySelectorAll('.status-btn[data-status]').forEach(b => b.classList.toggle('active', b === btn));
        const noteWrap = stepEl.querySelector('[data-note-wrap]');
        if (noteWrap) noteWrap.style.display = status === 'fine' ? 'none' : '';
      });
    });
    const noteArea = stepEl.querySelector('[data-note]');
    if (noteArea) noteArea.addEventListener('input', () => { entries[idx].note = noteArea.value.trim(); });
  });

  backdrop.querySelectorAll('#completion-overall-row .status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overall = btn.getAttribute('data-overall');
      backdrop.querySelectorAll('#completion-overall-row .status-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  const notesToggle = document.getElementById('completion-notes-toggle');
  const notesWrap = document.getElementById('completion-notes-wrap');
  notesToggle.addEventListener('click', () => {
    const show = notesWrap.style.display === 'none';
    notesWrap.style.display = show ? '' : 'none';
    notesToggle.textContent = show ? '\u2212 Hide general note' : '+ Add a general note (optional)';
  });

  function applyImport(text) {
    const result = parseChatSummaryMd(text, entries);
    entries.forEach((e, idx) => {
      const m = result.matches[e.id];
      if (!m) return;
      e.status = m.status;
      e.note = m.note;
      const el = entryEl(idx);
      if (!el) return;
      el.querySelectorAll('.status-btn[data-status]').forEach(b => b.classList.toggle('active', b.getAttribute('data-status') === m.status));
      const noteWrap = el.querySelector('[data-note-wrap]');
      const noteArea = el.querySelector('[data-note]');
      if (noteWrap) noteWrap.style.display = m.status === 'fine' ? 'none' : '';
      if (noteArea) noteArea.value = m.note;
    });
    if (result.overall) {
      overall = result.overall;
      backdrop.querySelectorAll('#completion-overall-row .status-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-overall') === result.overall));
    }
    if (result.leftover) {
      const notesArea = document.getElementById('completion-notes');
      notesArea.value = notesArea.value ? notesArea.value + '\n' + result.leftover : result.leftover;
      notesWrap.style.display = '';
      notesToggle.textContent = '\u2212 Hide general note';
    }
    const statusEl = document.getElementById('completion-import-status');
    statusEl.textContent = result.matchedCount ? `Matched ${result.matchedCount} step(s) \u2014 review below.` : 'Imported \u2014 nothing auto-matched, added as a note.';
  }

  document.getElementById('completion-import-btn').addEventListener('click', () => {
    document.getElementById('completion-import-file').click();
  });
  document.getElementById('completion-import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyImport(String(reader.result || ''));
    reader.readAsText(file);
  });

  document.getElementById('completion-save').onclick = () => {
    const profile = Storage.getProfile();
    const specs = profile.specs || {};
    const record = {
      id: 'c' + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      wizardTitle: wizardCtx.title,
      pathTaken: wizardCtx.getHistory ? wizardCtx.getHistory() : [],
      stepReviews: entries,
      overall,
      notes: (document.getElementById('completion-notes').value || '').trim(),
      systemSnapshot: {
        os: specs.os || null,
        cpu: specs.cpu || null,
        gpu: specs.gpu || null,
        containerBranch: profile.containerfile && profile.containerfile.parsed ? profile.containerfile.parsed.branch : null
      }
    };
    record.generatedMd = generateCompletionMd(wizardCtx.title, record);
    Storage.addCompletion(wizardCtx.id, record);
    Storage.setOverride(wizardCtx.id, { status: 'solved', autoArchived: true });

    const modal = backdrop.querySelector('.modal');
    modal.innerHTML = `<button class="modal-close" id="completion-result-close" aria-label="Close">&times;</button>
      <h2 id="completion-title">Saved on this site</h2>
      <p class="hint">This completion is stored with the guide. Copy it now or download the Markdown file whenever you need to share it.</p>
      <div class="field"><label for="completion-result-text">Generated summary</label><textarea id="completion-result-text" style="min-height:280px"></textarea></div>
      <div class="spec-actions"><button class="btn btn-ghost" id="completion-copy" type="button">&#10697; Copy summary</button><button class="btn btn-primary" id="completion-download" type="button">&darr; Download .md</button></div>`;
    document.getElementById('completion-result-text').value = record.generatedMd;
    document.getElementById('completion-result-close').onclick = close;
    document.getElementById('completion-copy').onclick = () => navigator.clipboard.writeText(record.generatedMd).then(() => window.showToast && window.showToast('Summary copied.'));
    document.getElementById('completion-download').onclick = () => Storage.downloadText(wizardCtx.id + '-solved-' + record.date + '.md', record.generatedMd);
    requestAnimationFrame(() => document.getElementById('completion-result-close').focus());
    if (window.showToast) window.showToast('Marked solved and saved.');
    if (window.onCompletionSaved) window.onCompletionSaved(record);
  };

  backdrop.classList.remove('hidden');
  if (window.ModalFocus) ModalFocus.activate(backdrop, { onEscape: close, initialFocus: '#completion-close', returnFocus: '#hdrRailBtn' });
}
