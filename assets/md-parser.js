// md-parser.js
// Turns a loewtorials-flavored Markdown file into the wizard JSON schema
// consumed by wizard-engine.js. See templates/wizard-spec.md for the full
// authoring guide (also downloadable from the dashboard's "+" menu).
//
// Design goal: a human or an LLM should be able to write this by hand
// without knowing the JSON schema. Sequence in the document IS the flow —
// "next" is inferred from what comes after a step, so authors don't have
// to wire up ids by hand except for branch choices.

// Entry point used by the dashboard's add-wizard flow. Routes between two
// parsers based on what's actually in the document — no LLM involved:
//   - Group:/Step:/Branch:/Outcome: headings present -> structured wizard
//   - anything else (a plain README, a handoff doc, notes) -> generic
//     article, auto-converted into a simple single-track wizard (one
//     step per top-level heading, checklists/code/notes still work, ends
//     in a real Outcome step) so it renders through the same engine.
function parseWizardMarkdown(rawText) {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const body = fmMatch ? fmMatch[2] : text;
  return hasWizardHeadings(body) ? parseStructuredWizard(rawText) : parseGenericArticle(rawText);
}

// Fence-aware: a code sample that happens to contain a line like
// "### Step: x | y" (e.g. this very spec file, quoted in a step) must not
// trigger wizard-mode by accident.
function hasWizardHeadings(body) {
  const re = /^(##|###)\s*(Group|Step|Branch|Outcome)\s*:/i;
  let inFence = false;
  for (const line of body.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (!inFence && re.test(line)) return true;
  }
  return false;
}

function parseStructuredWizard(rawText) {
  const errors = [];
  const text = rawText.replace(/\r\n/g, '\n').trim();

  // ---- frontmatter ----
  let meta = {};
  let body = text;
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) {
    meta = parseFrontmatter(fmMatch[1]);
    body = fmMatch[2];
  } else {
    errors.push('No frontmatter block found (--- ... ---) — using defaults for title/id/category.');
  }

  // ---- split into heading-delimited blocks ----
  const lines = body.split('\n');
  const headingRe = /^(##|###)\s*(Group|Step|Branch|Outcome)\s*:\s*([^|]+)\|(.+)$/i;

  const blocks = [];
  const leadingLines = []; // content before the first heading -> becomes an Overview step
  let current = null;
  lines.forEach(line => {
    const m = line.match(headingRe);
    if (m) {
      if (current) blocks.push(current);
      current = {
        kind: m[2].toLowerCase(),
        id: m[3].trim(),
        titleRaw: m[4].trim(),
        lines: []
      };
    } else if (current) {
      current.lines.push(line);
    } else {
      leadingLines.push(line);
    }
  });
  if (current) blocks.push(current);

  // An optional prose intro before the first Group/Step heading (e.g. a
  // "## Overview" or just plain paragraphs) becomes a real first step, so
  // the person sees a summary of the whole wizard before step one — no
  // separate schema or renderer needed.
  if (blocks.length && leadingLines.join('\n').trim()) {
    blocks.unshift({ kind: 'step', id: '__overview', titleRaw: 'Overview', lines: leadingLines });
  }

  if (!blocks.length) {
    errors.push('No Group/Step/Branch/Outcome headings found — nothing to build.');
    return { meta, wizard: null, errors };
  }

  // ---- build steps + outline ----
  const steps = {};
  const outline = [];
  const outcomeIds = [];
  let activeGroup = null;
  let firstStepId = null;

  blocks.forEach((b, i) => {
    const content = b.lines.join('\n').trim();

    if (b.kind === 'group') {
      activeGroup = { type: 'group', id: b.id, label: b.titleRaw, steps: [] };
      outline.push(activeGroup);
      return; // groups don't create a step themselves
    }

    if (!firstStepId) firstStepId = b.id;

    if (b.kind === 'step') {
      const parsed = parseStepBody(content);
      steps[b.id] = {
        group: activeGroup ? activeGroup.id : null,
        tick: nextTick(activeGroup),
        title: b.titleRaw,
        body: parsed.bodyHtml,
        code: parsed.code.length ? parsed.code : undefined,
        note: parsed.note || undefined,
        checklist: parsed.checklist.length ? parsed.checklist : undefined,
        refs: parsed.refs.length ? parsed.refs : undefined,
        next: null // filled in a second pass
      };
      if (activeGroup) activeGroup.steps.push(b.id);
      return;
    }

    if (b.kind === 'branch') {
      const parsed = parseStepBody(content, { branch: true });
      if (!parsed.choices.length) {
        errors.push(`Branch "${b.id}" has no "Choices:" list — add one or more "- Label -> targetId" lines.`);
      }
      steps[b.id] = {
        type: 'branch',
        group: activeGroup ? activeGroup.id : null,
        title: b.titleRaw,
        body: parsed.bodyHtml,
        choices: parsed.choices,
        refs: parsed.refs.length ? parsed.refs : undefined
      };
      outline.push({ type: 'branch', id: b.id, label: b.titleRaw });
      return;
    }

    if (b.kind === 'outcome') {
      const styleMatch = b.titleRaw.match(/\((success|info|warning)\)\s*$/i);
      const style = styleMatch ? styleMatch[1].toLowerCase() : 'success';
      const title = styleMatch ? b.titleRaw.replace(styleMatch[0], '').trim() : b.titleRaw;
      const parsed = parseStepBody(content);
      steps[b.id] = {
        type: 'outcome',
        outcomeStyle: style,
        title,
        body: parsed.bodyHtml,
        refs: parsed.refs.length ? parsed.refs : undefined
      };
      outcomeIds.push(b.id);
      return;
    }
  });

  // ---- second pass: wire up implicit "next" for plain steps ----
  const flowBlocks = blocks.filter(b => b.kind !== 'group');
  flowBlocks.forEach((b, i) => {
    const s = steps[b.id];
    if (!s || s.type === 'branch' || s.type === 'outcome') return;
    const following = flowBlocks[i + 1];
    if (following) {
      s.next = following.id;
    } else {
      delete s.next; // terminal — engine hides the Next button when absent
    }
  });

  // Give the synthetic Overview step (if any) its own small group at the
  // very top of the rail, ahead of the author's real groups.
  if (steps['__overview']) {
    steps['__overview'].group = '__overview';
    outline.unshift({ type: 'group', id: '__overview', label: 'Overview', steps: ['__overview'] });
  }

  if (outcomeIds.length) outline.push({ type: 'outcomes', ids: outcomeIds });

  // ---- validate references ----
  Object.keys(steps).forEach(id => {
    const s = steps[id];
    if (s.next && !steps[s.next]) errors.push(`Step "${id}" points to "${s.next}", which doesn't exist.`);
    if (s.choices) {
      s.choices.forEach(c => {
        if (!steps[c.next]) errors.push(`Branch "${id}" choice "${c.label}" points to "${c.next}", which doesn't exist.`);
      });
    }
  });

  const id = slug(meta.id || meta.title || 'wizard-' + Date.now());
  const wizard = {
    id,
    kind: 'wizard',
    suggestedView: 'wizard',
    title: meta.title || 'Untitled wizard',
    subtitle: meta.subtitle || '',
    description: meta.description || '',
    category: meta.category || 'Uncategorized',
    tags: meta.tags || [],
    date: meta.date || new Date().toISOString().slice(0, 10),
    sourceFiles: meta.sourceFiles || [],
    relevantPackages: meta.relevantPackages || [],
    start: meta.start || firstStepId,
    outline,
    steps
  };

  if (!wizard.start || !steps[wizard.start]) {
    errors.push(`Start step "${wizard.start}" doesn't exist — falling back to the first step in the document.`);
    wizard.start = firstStepId;
  }

  return { meta, wizard, errors };
}

// ---------------------------------------------------------------------
// Generic markdown mode: any plain doc with no wizard headings. No LLM
// involved — deterministic heuristics only. We attempt to build real
// wizard structure using the same concepts as the hand-authored format:
//   - a ## section containing ### sub-sections becomes a Group of Steps
//   - a "## heading ending in ?" whose body is *only* a bullet list, where
//     every bullet clearly names another heading in the doc (via `-> Target`,
//     a quoted/backtick "Target", or "see/go to Target"), becomes a real
//     Branch with Choices
//   - everything else chains in document order, same as before
// Every attempt is checked against concrete, listed criteria (see
// `scoreConfidence` below); anything that doesn't clearly meet them still
// produces a usable wizard, just flagged `confidence: 'low'` with the
// specific reasons, so the UI can suggest Article view instead of hiding
// the gap. A doc with fewer than 2 sections has nothing to structure, so
// it stays a plain single-step `kind: 'article'` — no attempt, no flag.
// ---------------------------------------------------------------------
function parseGenericArticle(rawText) {
  const errors = [];
  const notes = [];
  const text = rawText.replace(/\r\n/g, '\n').trim();

  let meta = {};
  let body = text;
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (fmMatch) { meta = parseFrontmatter(fmMatch[1]); body = fmMatch[2].trim(); }

  const bodyLines = body.split('\n');
  let title = meta.title;
  if (!title) {
    const h1 = (bodyLines[0] || '').match(/^#(?!#)\s+(.+)$/);
    if (h1) { title = h1[1].trim(); bodyLines.shift(); }
  }
  const rest = bodyLines.join('\n').trim();

  const sections = splitOnHeading(rest, 2);

  // ---- fewer than 2 sections: nothing to structure, stay a plain article ----
  if (sections.length < 2) {
    const parsed = parseStepBody(sections[0] ? sections[0].content : '');
    const stepId = '__overview';
    const wizardId = slug(meta.id || title || 'article-' + Date.now());
    return {
      meta, errors,
      wizard: {
        id: wizardId, kind: 'article', suggestedView: 'article',
        title: title || (sections[0] && sections[0].heading) || 'Untitled article',
        subtitle: meta.subtitle || '', description: meta.description || '',
        category: meta.category || 'Uncategorized', tags: meta.tags || [],
        date: meta.date || new Date().toISOString().slice(0, 10),
        sourceFiles: meta.sourceFiles || [], relevantPackages: meta.relevantPackages || [],
        start: stepId,
        outline: [{ type: 'group', id: 'content', label: title || 'Article', steps: [stepId] }],
        steps: { [stepId]: { group: 'content', title: sections[0] ? (sections[0].heading || 'Overview') : 'Overview', body: parsed.bodyHtml, checklist: parsed.checklist.length ? parsed.checklist : undefined, code: parsed.code.length ? parsed.code : undefined, note: parsed.note || undefined, refs: parsed.refs.length ? parsed.refs : undefined, next: undefined } }
      }
    };
  }

  // ---- pass 1: build groups/steps, one outline group per top-level section ----
  const steps = {};
  const rawById = {};
  const titleToId = {};
  const outline = [];
  const usedIds = new Set();
  let firstStepId = null;
  let anySectionHasChildren = false;
  let allSectionsHaveChildren = true;

  function makeId(headingText, fallback) {
    let base = slug(headingText || fallback);
    let id = base, n = 2;
    while (usedIds.has(id)) { id = base + '-' + n; n++; notes.push(`Heading "${headingText}" is a near-duplicate of another heading — used "${id}" as its internal id.`); }
    usedIds.add(id);
    return id;
  }

  sections.forEach((sec, i) => {
    const children = splitOnHeading(sec.content, 3).filter(c => c.heading);
    if (children.length) anySectionHasChildren = true; else allSectionsHaveChildren = false;

    const groupId = makeId(sec.heading, 'section-' + (i + 1));
    const groupLabel = sec.heading || (i === 0 ? 'Overview' : 'Untitled section');
    const leafSections = children.length ? children : [{ heading: null, content: sec.content }];
    const groupStepIds = [];

    leafSections.forEach((leaf, j) => {
      const stepId = (i === 0 && j === 0 && !leaf.heading) ? '__overview' : makeId(leaf.heading, groupId + '-' + (j + 1));
      const parsed = parseStepBody(leaf.content);
      const stepTitle = leaf.heading || groupLabel;
      steps[stepId] = {
        group: groupId,
        title: stepTitle,
        body: parsed.bodyHtml,
        code: parsed.code.length ? parsed.code : undefined,
        note: parsed.note || undefined,
        checklist: parsed.checklist.length ? parsed.checklist : undefined,
        refs: parsed.refs.length ? parsed.refs : undefined,
        next: null
      };
      rawById[stepId] = leaf.content;
      if (!(stepTitle in titleToId)) titleToId[slug(stepTitle)] = stepId;
      groupStepIds.push(stepId);
      if (!firstStepId) firstStepId = stepId;
    });

    outline.push({ type: 'group', id: groupId, label: groupLabel, steps: groupStepIds, _sectionIndex: i });
  });

  const hierarchyMixed = anySectionHasChildren && !allSectionsHaveChildren;

  // ---- pass 2: try to promote "? heading + pure bullet list" leaves into real branches ----
  let unresolvedBranchCues = 0;
  const flowIds = []; // document-order leaf ids, for sequential chaining
  outline.forEach(g => g.steps.forEach(id => flowIds.push(id)));

  flowIds.forEach(id => {
    const s = steps[id];
    if (!/\?\s*$/.test(s.title)) return; // only consider question-phrased headings
    const bullets = extractPureBulletList(rawById[id]);
    if (!bullets) return; // body isn't *only* a bullet list -> leave as a normal step
    const choices = tryResolveChoices(bullets, titleToId, id);
    if (!choices) { unresolvedBranchCues++; notes.push(`"${s.title}" reads like a decision point, but its options don't clearly point at other sections, so it was left as a regular step.`); return; }
    // promote: remove from its group's step list, add as a top-level branch entry right after that group
    const g = outline.find(o => o.type === 'group' && o.steps.includes(id));
    const branchStep = { type: 'branch', group: g ? g.id : null, title: s.title, body: '', choices, refs: s.refs };
    steps[id] = branchStep;
    if (g) {
      g.steps = g.steps.filter(sid => sid !== id);
      const gIdx = outline.indexOf(g);
      outline.splice(gIdx + 1, 0, { type: 'branch', id, label: s.title });
      if (!g.steps.length) outline.splice(outline.indexOf(g), 1);
    }
  });

  // ---- chain plain (non-branch) steps sequentially in document order ----
  // (branches ARE valid targets to chain into — the engine shows their
  // choices when reached; we only skip assigning .next FROM a branch,
  // since it navigates via .choices instead)
  const outcomeIds = [];
  for (let k = 0; k < flowIds.length; k++) {
    const id = flowIds[k];
    const s = steps[id];
    if (s.type === 'branch') continue;
    s.next = (k + 1 < flowIds.length) ? flowIds[k + 1] : '__reviewed';
  }
  steps['__reviewed'] = { type: 'outcome', outcomeStyle: 'success', title: 'Reviewed', body: '<p>End of this document. Use the sidebar to jump back to any section.</p>' };
  outcomeIds.push('__reviewed');
  outline.push({ type: 'outcomes', ids: outcomeIds });

  // ---- reachability check: can every step actually be reached by clicking through? ----
  const reachable = new Set();
  (function walk(id) {
    if (!id || reachable.has(id) || !steps[id]) return;
    reachable.add(id);
    const s = steps[id];
    if (s.next) walk(s.next);
    if (s.choices) s.choices.forEach(c => walk(c.next));
  })(firstStepId);
  const unreachable = Object.keys(steps).filter(id => id !== '__reviewed' && !reachable.has(id));
  if (unreachable.length) {
    notes.push(`${unreachable.length} section(s) aren't reachable by clicking through (${unreachable.map(id => `"${steps[id].title}"`).join(', ')}) — nothing is lost, but Article view shows them too.`);
  }

  // ---- score confidence ----
  if (hierarchyMixed) notes.push('Some top-level sections have sub-sections and others don\'t, so the step grouping may be uneven.');
  if (!anySectionHasChildren && flowIds.length > 12) notes.push(`${flowIds.length} steps with no natural grouping — this may read better in Article view.`);
  if (unresolvedBranchCues) { /* note already added per-cue above */ }
  const confidence = notes.length ? 'low' : 'high';

  const wizardId = slug(meta.id || title || 'wizard-' + Date.now());
  const wizard = {
    id: wizardId,
    kind: 'wizard',
    confidence,
    confidenceNotes: notes,
    suggestedView: confidence === 'low' ? 'article' : 'wizard',
    title: title || 'Untitled wizard',
    subtitle: meta.subtitle || '',
    description: meta.description || '',
    category: meta.category || 'Uncategorized',
    tags: meta.tags || [],
    date: meta.date || new Date().toISOString().slice(0, 10),
    sourceFiles: meta.sourceFiles || [],
    relevantPackages: meta.relevantPackages || [],
    start: firstStepId,
    outline,
    steps
  };

  return { meta, wizard, errors };
}

// Returns raw bullet-item text (one per `- ...` line) only if, once fenced
// code/checklist/blockquote lines are stripped, EVERY remaining non-blank
// line is a plain bullet — i.e. the section is unambiguously "pick one of
// these". Returns null (not a clean bullet-only section) otherwise, so we
// never force a branch onto prose that just happens to end in a question.
function extractPureBulletList(content) {
  const lines = (content || '').split('\n');
  const bullets = [];
  let inFence = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!line) continue;
    if (/^>/.test(line)) continue; // notes don't disqualify a branch
    if (/^-\s*\[[ xX]\]/.test(line)) return null; // a checklist, not a choice list
    const b = line.match(/^-\s+(.+)$/);
    if (b) { bullets.push(b[1].trim()); continue; }
    return null; // some other prose line -> not a pure bullet list
  }
  return bullets.length >= 2 ? bullets : null;
}

// Resolves each bullet to an existing step id via, in order: explicit
// "Label -> Target" arrow syntax, a quoted/backtick "Target", or a
// "see/go to/work through Target" phrase — matched against known section
// titles (exact-slug first, then word-overlap as a fallback). All bullets
// must resolve to a *different* target than the branch's own step, and to
// at least two distinct targets, or the whole branch is rejected (no
// partial branches).
function tryResolveChoices(bullets, titleToId, ownId) {
  const choices = [];
  for (const bullet of bullets) {
    let label = null, targetPhrase = null;
    const arrow = bullet.match(/^(.+?)\s*->\s*(.+)$/);
    if (arrow) { label = arrow[1].trim(); targetPhrase = arrow[2].trim(); }
    if (!targetPhrase) {
      const quoted = bullet.match(/["'`]([^"'`]{2,80})["'`]/);
      if (quoted) { targetPhrase = quoted[1].trim(); label = bullet.slice(0, quoted.index).replace(/[:—-]\s*$/, '').trim() || targetPhrase; }
    }
    if (!targetPhrase) {
      const verb = bullet.match(/\b(?:see|go to|work through|check)\s+["'`]?([A-Za-z0-9][\w'\- ]{2,70}?)["'`]?[.\s]*$/i);
      if (verb) { targetPhrase = verb[1].trim(); label = bullet.slice(0, verb.index).replace(/[:—-]\s*$/, '').trim() || targetPhrase; }
    }
    if (!targetPhrase) return null;
    const targetId = matchHeadingId(targetPhrase, titleToId);
    if (!targetId || targetId === ownId) return null;
    choices.push({ label: label || targetPhrase, next: targetId });
  }
  const distinctTargets = new Set(choices.map(c => c.next));
  return (choices.length === bullets.length && distinctTargets.size >= 2) ? choices : null;
}

function matchHeadingId(phrase, titleToId) {
  const key = slug(phrase);
  if (titleToId[key]) return titleToId[key];
  const words = new Set(key.split('-').filter(Boolean));
  let best = null, bestScore = 0;
  Object.keys(titleToId).forEach(k => {
    const kWords = new Set(k.split('-').filter(Boolean));
    const overlap = [...words].filter(w => kWords.has(w)).length;
    const score = overlap / Math.max(words.size, kWords.size);
    if (score > bestScore) { bestScore = score; best = titleToId[k]; }
  });
  return bestScore >= 0.6 ? best : null;
}

// Fence-aware split on a top-level `#`-heading level (e.g. level=2 splits
// on "## "). Returns [{heading, content}, ...]; if no heading of that
// level exists, returns the whole text as a single unheaded section.
function splitOnHeading(text, level) {
  const marker = '#'.repeat(level);
  const re = new RegExp('^' + marker + '(?!#)\\s+(.+)$');
  const sections = [];
  let current = { heading: null, lines: [] };
  let inFence = false;
  text.split('\n').forEach(line => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const m = !inFence && re.exec(line);
    if (m) {
      if (current.heading !== null || current.lines.some(l => l.trim())) sections.push(current);
      current = { heading: m[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  });
  if (current.heading !== null || current.lines.some(l => l.trim())) sections.push(current);
  if (!sections.length) sections.push({ heading: null, lines: [] });
  return sections.map(s => ({ heading: s.heading, content: s.lines.join('\n').trim() }));
}

function nextTick(group) {
  if (!group) return undefined;
  return undefined; // tick labels (A1, B2...) are cosmetic; left to the author via title if wanted
}

function parseFrontmatter(fmText) {
  const meta = {};
  fmText.split('\n').forEach(line => {
    const m = line.match(/^([a-zA-Z_]+)\s*:\s*(.*)$/);
    if (!m) return;
    const key = m[1].trim();
    let val = m[2].trim();
    if (key === 'tags' || key === 'sourceFiles' || key === 'relevantPackages') {
      val = val.replace(/^\[|\]$/g, '');
      meta[key] = val.split(',').map(t => t.trim()).filter(Boolean);
    } else {
      meta[key] = val;
    }
  });
  return meta;
}

function parseStepBody(content, opts) {
  opts = opts || {};
  const code = [];
  const checklist = [];
  const noteLines = [];
  let choices = [];
  const bodyLines = [];

  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (/^```/.test(line.trim())) {
      const fence = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) { fence.push(lines[i]); i++; }
      code.push(fence.join('\n'));
      i++; // skip closing fence
      continue;
    }

    // checklist item
    const chk = line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/);
    if (chk) { checklist.push(chk[2].trim()); i++; continue; }

    // blockquote note
    if (/^\s*>/.test(line)) {
      noteLines.push(line.replace(/^\s*>\s?/, ''));
      i++; continue;
    }

    // choices block (branches only)
    if (opts.branch && /^\s*choices\s*:\s*$/i.test(line)) {
      i++;
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const cm = lines[i].match(/^\s*-\s+(.*?)\s*->\s*([A-Za-z0-9_-]+)\s*(?:\|\s*(.*))?$/);
        if (cm) {
          choices.push({ label: cm[1].trim(), next: cm[2].trim(), banner: cm[3] ? cm[3].trim() : undefined });
        }
        i++;
      }
      continue;
    }

    bodyLines.push(line);
    i++;
  }

  return {
    bodyHtml: mdToHtml(bodyLines.join('\n').trim()),
    code,
    checklist,
    note: noteLines.length ? mdInline(noteLines.join(' ').trim()) : '',
    choices,
    refs: extractFileRefs([checklist.join('\n'), noteLines.join('\n'), bodyLines.join('\n')].join('\n'))
  };
}

// Picks out mentions of other wizard source files, e.g. "Work through
// `fix-dirty-ntfs-partition.md`" — backticks optional. Matched at render
// time against every known wizard's `sourceFiles` list; unmatched mentions
// are just ignored (no broken links shown).
function extractFileRefs(text) {
  if (!text) return [];
  const refs = new Set();
  const re = /`?([A-Za-z0-9][A-Za-z0-9_-]*\.md)`?/g;
  let m;
  while ((m = re.exec(text))) refs.add(m[1]);
  return Array.from(refs);
}

// Minimal markdown -> HTML: headings, paragraphs, **bold**, *em*, `code`,
// - bullet lists, 1. numbered lists. Heading levels are offset by +2 (a
// source `###` becomes h5) since h1/h2 are already used by the page/step
// title elsewhere on screen — this only matters for sub-headings that
// land inside a step's body (e.g. a generic article's own "### Detail"
// subsections within one top-level section).
function mdToHtml(text) {
  if (!text) return '';
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim());
    if (lines.length === 1) {
      const h = lines[0].match(/^(#{1,4})(?!#)\s+(.+)$/);
      if (h) {
        const level = Math.min(h[1].length + 2, 6);
        return `<h${level}>${mdInline(h[2].trim())}</h${level}>`;
      }
    }
    if (lines.every(l => /^-\s+/.test(l))) {
      return '<ul>' + lines.map(l => `<li>${mdInline(l.replace(/^-\s+/, ''))}</li>`).join('') + '</ul>';
    }
    if (lines.every(l => /^\d+\.\s+/.test(l))) {
      return '<ol>' + lines.map(l => `<li>${mdInline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('') + '</ol>';
    }
    return `<p>${mdInline(lines.join(' '))}</p>`;
  }).join('\n');
}

function mdInline(str) {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}

function slug(str) {
  return String(str).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || ('wizard-' + Date.now());
}
