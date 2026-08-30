import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../worker/index.js', import.meta.url), 'utf8');
const workerModule = await import('data:text/javascript;base64,' + Buffer.from(workerSource).toString('base64'));
const worker = workerModule.default;

function makeKV() {
  const values = new Map();
  return {
    values,
    async get(key) { return values.has(key) ? values.get(key) : null; },
    async put(key, value) { values.set(key, String(value)); }
  };
}

function makeEnv(overrides = {}) {
  const calls = [];
  const env = {
    SITE_PASSWORD: 'correct horse battery staple',
    LOEWTORIALS_KV: makeKV(),
    ASSETS: { fetch: async () => new Response('asset') },
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        return { response: 'Check the service status, then retry the safe command.', usage: { input_tokens: 20, output_tokens: 10 } };
      }
    },
    ...overrides
  };
  env.calls = calls;
  return env;
}

function authHeaders(json = false) {
  const headers = { Authorization: 'Bearer correct horse battery staple' };
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function helpBody() {
  return {
    question: 'Why did this fail? api_key=sk-abcdefghijklmnop',
    terminal: 'Authorization: Bearer super-secret-token\npassword=hunter2\nError: service unavailable',
    view: 'article',
    pageUrl: 'https://example.test/wizard.html?id=tour',
    guide: {
      id: 'tour',
      title: 'Tour',
      currentStepId: 'welcome',
      currentStepTitle: 'Welcome',
      context: 'Run the diagnostic only. client_secret=do-not-send'
    }
  };
}

{
  const env = makeEnv({ LLM_HELP_ENABLED: undefined, AI: undefined });
  const response = await worker.fetch(new Request('https://example.test/api/help/config', { headers: authHeaders() }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.enabled, false);
  assert.match(body.unavailableReason, /not been enabled/i);
}

{
  const env = makeEnv({ LLM_HELP_ENABLED: 'true' });
  const response = await worker.fetch(new Request('https://example.test/api/help', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(helpBody())
  }), env);
  assert.equal(response.status, 401);
  assert.equal(env.calls.length, 0);
}

{
  const env = makeEnv({ LLM_HELP_ENABLED: 'false' });
  const response = await worker.fetch(new Request('https://example.test/api/help', {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(helpBody())
  }), env);
  assert.equal(response.status, 503);
  assert.equal(env.calls.length, 0);
}

{
  const env = makeEnv({ LLM_HELP_ENABLED: 'true', LLM_HELP_DAILY_LIMIT: '1' });
  const response = await worker.fetch(new Request('https://example.test/api/help', {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify(helpBody())
  }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.answer, 'Check the service status, then retry the safe command.');
  assert.equal(body.remainingToday, 0);
  assert.ok(body.redactionsApplied >= 4);
  assert.equal(env.calls.length, 1);
  const prompt = env.calls[0].input.messages.map(message => message.content).join('\n');
  assert.doesNotMatch(prompt, /hunter2|super-secret-token|do-not-send|sk-abcdefghijklmnop/);
  assert.match(prompt, /\[REDACTED/);

  const limited = await worker.fetch(new Request('https://example.test/api/help', {
    method: 'POST', headers: authHeaders(true), body: JSON.stringify({ ...helpBody(), question: 'A second question' })
  }), env);
  assert.equal(limited.status, 429);
  assert.equal(env.calls.length, 1);
}

{
  const env = makeEnv({ LLM_HELP_ENABLED: 'true' });
  const response = await worker.fetch(new Request('https://example.test/api/help', {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify({ ...helpBody(), terminal: 'x'.repeat(130 * 1024) })
  }), env);
  assert.equal(response.status, 413);
  assert.equal(env.calls.length, 0);
}

console.log('worker-help tests passed');
