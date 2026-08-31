// Private hosted technical support for guide pages.
//
// The interface always keeps the no-API Markdown handoff available. The
// hosted assistant only becomes clickable when the authenticated Worker
// reports that LLM_HELP_ENABLED, the AI binding, and the KV usage limiter
// are all configured. See LLM-HELP-SETUP.md.

(function () {
  const HELP_CONFIG_URL = '/api/help/config';
  const HELP_URL = '/api/help';

  function clamp(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function redactSecrets(value) {
    let text = String(value || '');
    let redactions = 0;
    const replace = (pattern, replacement) => {
      text = text.replace(pattern, function () {
        redactions += 1;
        return typeof replacement === 'function' ? replacement.apply(null, arguments) : replacement;
      });
    };
    replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]');
    replace(/\b(authorization\s*:\s*bearer\s+)[^\s'"`]+/gi, function (_, prefix) { return prefix + '[REDACTED]'; });
    replace(/\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|secret)\s*[=:]\s*)[^\s'"`]+/gi, function (_, prefix) { return prefix + '[REDACTED]'; });
    replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[opusr]_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{12,})\b/g, '[REDACTED TOKEN]');
    replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, function (_, protocol) { return protocol + '[REDACTED]@'; });
    return { text, redactions };
  }

  function htmlToText(html) {
    const el = document.createElement('div');
    el.innerHTML = String(html || '');
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function orderedStepIds(wizard) {
    const ids = [];
    (wizard.outline || []).forEach(function (item) {
      if (item.type === 'group') ids.push.apply(ids, item.steps || []);
      else if (item.type === 'branch' && item.id) ids.push(item.id);
      else if (item.type === 'outcomes') ids.push.apply(ids, item.ids || []);
    });
    Object.keys(wizard.steps || {}).forEach(function (id) {
      if (ids.indexOf(id) === -1) ids.push(id);
    });
    return ids;
  }

  function stepText(id, step) {
    const chunks = ['## ' + (step.title || id), 'Step id: ' + id];
    if (step.body) chunks.push(htmlToText(step.body));
    if (step.note) chunks.push('Note: ' + htmlToText(step.note));
    (step.code || []).forEach(function (code) { chunks.push('```text\n' + code + '\n```'); });
    if (step.checklist && step.checklist.length) chunks.push('Checklist:\n' + step.checklist.map(function (item) { return '- ' + item; }).join('\n'));
    if (step.choices && step.choices.length) chunks.push('Choices:\n' + step.choices.map(function (choice) { return '- ' + choice.label + ' → ' + choice.next; }).join('\n'));
    return chunks.join('\n');
  }

  function buildGuideContext(wizard, currentStepId) {
    const steps = wizard.steps || {};
    const ids = orderedStepIds(wizard);
    const ordered = currentStepId && steps[currentStepId]
      ? [currentStepId].concat(ids.filter(function (id) { return id !== currentStepId; }))
      : ids;
    let context = '';
    ordered.forEach(function (id) {
      if (!steps[id] || context.length >= 58000) return;
      const block = stepText(id, steps[id]);
      const label = id === currentStepId ? '\n\n# CURRENT SECTION\n' : '\n\n# GUIDE SECTION\n';
      context += label + block;
    });
    return context.slice(0, 58000).trim();
  }

  function currentArticleStepId() {
    const sections = Array.from(document.querySelectorAll('.article-step[id^="step-"]'));
    if (!sections.length) return '';
    const hashId = decodeURIComponent(location.hash || '').replace(/^#step-/, '');
    const hashSection = hashId && document.getElementById('step-' + hashId);
    if (hashSection) {
      const hashRect = hashSection.getBoundingClientRect();
      if (hashRect.bottom > 70 && hashRect.top < window.innerHeight) return hashId;
    }
    const visibleTop = 70;
    let best = sections[0];
    let bestVisible = -1;
    sections.forEach(function (section) {
      const rect = section.getBoundingClientRect();
      const visible = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, visibleTop));
      if (visible >= bestVisible) { best = section; bestVisible = visible; }
    });
    return best.id.slice(5);
  }

  function getCurrentStepId(options) {
    const supplied = options.getCurrentStepId ? options.getCurrentStepId() : '';
    return supplied || currentArticleStepId() || options.wizard.start || '';
  }

  function authHeaders(withJson) {
    const password = window.Storage && Storage.getSitePassword ? Storage.getSitePassword() : '';
    const headers = {};
    if (password) headers.Authorization = 'Bearer ' + password;
    if (withJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function readJsonResponse(response) {
    let body = {};
    try { body = await response.json(); } catch (error) { /* use generic message below */ }
    if (!response.ok) {
      const err = new Error(body.error || 'The hosted assistant could not be reached.');
      err.status = response.status;
      throw err;
    }
    return body;
  }

  function buildHelpMarkdown(options, question, terminal, files) {
    const currentStepId = getCurrentStepId(options);
    const currentStep = (options.wizard.steps || {})[currentStepId] || {};
    const safeQuestion = redactSecrets(question);
    const safeTerminal = redactSecrets(terminal);
    const safeContext = redactSecrets(buildGuideContext(options.wizard, currentStepId));
    const redactions = safeQuestion.redactions + safeTerminal.redactions + safeContext.redactions;
    const lines = [
      '# Help request: ' + options.wizard.title,
      '',
      '**Guide:** ' + location.href,
      '**Current view:** ' + options.getMode(),
      '**Current section:** ' + (currentStep.title || currentStepId || 'Unknown'),
      '',
      '## Question',
      safeQuestion.text || '_No question entered._',
      '',
      '## Terminal output',
      safeTerminal.text ? '```text\n' + safeTerminal.text + '\n```' : '_None provided._',
      '',
      '## Screenshots',
      files.length ? files.map(function (file) { return '- Attach `' + file.name.replace(/`/g, '') + '` separately'; }).join('\n') : '_None provided._',
      '',
      '## Guide context',
      safeContext.text || '_No guide context available._',
      '',
      '## Requested help',
      'Diagnose the likely cause and give safe, reversible, step-by-step next actions. Distinguish Bazzite/Linux and Windows commands. Explain before suggesting anything destructive.'
    ];
    if (redactions) lines.splice(6, 0, '**Safety:** ' + redactions + ' possible secret' + (redactions === 1 ? '' : 's') + ' automatically redacted.', '');
    return { markdown: lines.join('\n'), redactions };
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    return Promise.resolve();
  }

  function downloadScreenshots(files) {
    files.forEach(function (file) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    });
  }

  function modalHtml() {
    return '<div class="modal-backdrop" id="help-backdrop"><div class="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">' +
      '<button class="modal-close" type="button" aria-label="Close">&times;</button>' +
      '<p class="help-kicker">&#10022; Private technical support</p><h2 id="help-title">What went wrong?</h2>' +
      '<p class="hint">Describe the problem and paste any useful terminal output. The current guide and section are added automatically.</p>' +
      '<div class="help-service-status" id="help-service-status" aria-live="polite"><span class="help-status-dot"></span><span>Checking hosted assistant&hellip;</span></div>' +
      '<div class="field"><label for="help-question">Question or problem</label><textarea id="help-question" placeholder="What did you expect, and what happened instead?"></textarea></div>' +
      '<div class="field"><label for="help-terminal">Terminal output (optional)</label><textarea id="help-terminal" class="help-terminal" placeholder="Paste the relevant output, including the command you ran&hellip;"></textarea></div>' +
      '<div class="field"><label for="help-screenshots">Screenshots (optional)</label><input type="file" id="help-screenshots" accept="image/*" multiple><p class="help-field-note">The hosted text model cannot inspect images. Screenshot names go in the Markdown package and the files download separately.</p></div>' +
      '<div class="help-safety-note">&#128737; Likely passwords, API keys, access tokens, and private keys are redacted in the browser and checked again by the Worker.</div>' +
      '<div class="help-primary-actions"><button class="btn btn-primary" id="help-ask" type="button" disabled>&#10022; Ask hosted assistant</button><button class="btn btn-ghost" id="help-copy" type="button">&#10697; Copy help request</button><button class="btn btn-ghost" id="help-download" type="button">&darr; Download .md package</button></div>' +
      '<div class="help-answer" id="help-answer" hidden><div class="help-answer-head"><strong>&#10022; Suggested next steps</strong><div><button class="btn btn-ghost btn-sm" id="help-copy-answer" type="button">&#10697; Copy</button><button class="btn btn-ghost btn-sm" id="help-download-answer" type="button">&darr; Download</button></div></div><pre id="help-answer-text"></pre><p class="help-answer-meta" id="help-answer-meta"></p></div>' +
      '<details class="help-external"><summary>Use another assistant instead</summary><div class="spec-actions"><a class="btn btn-ghost" href="https://chatgpt.com/" target="_blank" rel="noopener">&#8599; Open ChatGPT</a><a class="btn btn-ghost" href="https://claude.ai/new" target="_blank" rel="noopener">&#8599; Open Claude</a></div></details>' +
    '</div></div>';
  }

  function open(options) {
    const old = document.getElementById('help-backdrop');
    if (old) {
      if (window.ModalFocus) ModalFocus.deactivate(old);
      old.remove();
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = modalHtml();
    document.body.appendChild(wrap.firstElementChild);

    const backdrop = document.getElementById('help-backdrop');
    const questionEl = document.getElementById('help-question');
    const terminalEl = document.getElementById('help-terminal');
    const filesEl = document.getElementById('help-screenshots');
    const statusEl = document.getElementById('help-service-status');
    const askBtn = document.getElementById('help-ask');
    const answerEl = document.getElementById('help-answer');
    const answerTextEl = document.getElementById('help-answer-text');
    const answerMetaEl = document.getElementById('help-answer-meta');
    let hostedConfig = null;
    let lastAnswer = '';

    function setServiceStatus(kind, message) {
      statusEl.className = 'help-service-status' + (kind ? ' ' + kind : '');
      statusEl.innerHTML = '<span class="help-status-dot"></span><span></span>';
      statusEl.lastElementChild.textContent = message;
    }

    function close() {
      if (window.ModalFocus) ModalFocus.deactivate(backdrop);
      backdrop.remove();
    }
    backdrop.querySelector('.modal-close').onclick = close;
    backdrop.onclick = function (event) { if (event.target === backdrop) close(); };
    if (window.ModalFocus) ModalFocus.activate(backdrop, { onEscape: close, initialFocus: questionEl });
    else setTimeout(function () { questionEl.focus(); }, 0);

    function requestPackage() {
      return buildHelpMarkdown(options, questionEl.value.trim(), terminalEl.value.trim(), Array.from(filesEl.files || []));
    }

    document.getElementById('help-copy').onclick = function () {
      const pkg = requestPackage();
      copyText(pkg.markdown).then(function () { options.showToast('Help request copied.'); });
    };

    document.getElementById('help-download').onclick = function () {
      const files = Array.from(filesEl.files || []);
      const pkg = requestPackage();
      Storage.downloadText(options.id + '-help-request.md', pkg.markdown);
      downloadScreenshots(files);
      options.showToast(pkg.redactions ? 'Help package downloaded with possible secrets redacted.' : 'Help package downloaded.');
    };

    document.getElementById('help-copy-answer').onclick = function () {
      if (lastAnswer) copyText(lastAnswer).then(function () { options.showToast('Answer copied.'); });
    };
    document.getElementById('help-download-answer').onclick = function () {
      if (lastAnswer) Storage.downloadText(options.id + '-help-answer.md', '# Technical help: ' + options.wizard.title + '\n\n' + lastAnswer);
    };

    askBtn.onclick = async function () {
      const question = questionEl.value.trim();
      if (!question) { options.showToast('Describe the problem first.', true); questionEl.focus(); return; }
      const currentStepId = getCurrentStepId(options);
      const currentStep = (options.wizard.steps || {})[currentStepId] || {};
      const safeQuestion = redactSecrets(question);
      const safeTerminal = redactSecrets(terminalEl.value.trim());
      const safeContext = redactSecrets(buildGuideContext(options.wizard, currentStepId));
      const localRedactions = safeQuestion.redactions + safeTerminal.redactions + safeContext.redactions;
      askBtn.disabled = true;
      askBtn.innerHTML = '&#8987; Asking&hellip;';
      setServiceStatus('working', 'Reviewing this guide and your question…');
      try {
        const response = await fetch(HELP_URL, {
          method: 'POST',
          headers: authHeaders(true),
          body: JSON.stringify({
            question: safeQuestion.text,
            terminal: safeTerminal.text,
            view: options.getMode(),
            pageUrl: location.href,
            guide: {
              id: options.id,
              title: options.wizard.title,
              subtitle: options.wizard.subtitle || '',
              description: options.wizard.description || '',
              currentStepId: currentStepId,
              currentStepTitle: currentStep.title || '',
              context: safeContext.text
            }
          })
        });
        const body = await readJsonResponse(response);
        lastAnswer = body.answer;
        answerTextEl.textContent = lastAnswer;
        answerMetaEl.textContent = (body.model || hostedConfig.model || 'Hosted model') + ' · ' + body.remainingToday + ' requests left today' + ((body.redactionsApplied || localRedactions) ? ' · possible secrets redacted' : '');
        answerEl.hidden = false;
        setServiceStatus('ready', 'Hosted assistant ready');
        answerEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (error) {
        setServiceStatus('unavailable', error.message || 'Hosted help failed.');
        options.showToast(error.message || 'Hosted help failed.', true);
      } finally {
        askBtn.disabled = !(hostedConfig && hostedConfig.enabled);
        askBtn.innerHTML = '&#10022; Ask hosted assistant';
      }
    };

    fetch(HELP_CONFIG_URL, { headers: authHeaders(false) })
      .then(readJsonResponse)
      .then(function (config) {
        hostedConfig = config;
        if (config.enabled) {
          setServiceStatus('ready', 'Hosted assistant ready · ' + config.dailyLimit + ' requests per day');
          askBtn.disabled = false;
        } else {
          setServiceStatus('unavailable', (config.unavailableReason || 'Hosted assistant is not configured yet.') + ' Copy or download still works.');
        }
      })
      .catch(function (error) {
        const message = error.status === 401 ? 'Unlock syncing to use hosted help.' : 'Hosted assistant is not configured yet.';
        setServiceStatus('unavailable', message + ' Copy or download still works.');
      });
  }

  window.GuideHelp = { open, redactSecrets, buildGuideContext };
})();
