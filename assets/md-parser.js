// md-parser.js
// Turns a loewtorials-flavored Markdown file into the wizard JSON schema
// consumed by wizard-engine.js. See templates/wizard-spec.md for the full
// authoring guide (also downloadable from the dashboard's "+" menu).
//
// Design goal: a human or an LLM should be able to write this by hand
// without knowing the JSON schema. Sequence in the document IS the flow —
// "next" is inferred from what comes after a step, so authors don't have
// to wire up ids by hand except for branch choices.

function parseWizardMarkdown(rawText) {
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
    }
    // lines before the first heading are ignored (frontmatter-adjacent notes)
  });
  if (current) blocks.push(current);

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

// Minimal markdown -> HTML: paragraphs, **bold**, *em*, `code`, - bullet lists, 1. numbered lists.
function mdToHtml(text) {
  if (!text) return '';
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim());
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
