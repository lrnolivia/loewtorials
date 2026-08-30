// Local-only browser fixture for the hosted-help interface. It never calls a
// model provider and binds only to the loopback interface.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

const root = new URL('../', import.meta.url);
const port = Number.parseInt(process.env.LOEWTORIALS_TEST_PORT || '8088', 10);
const password = 'local-test-password';
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:' + port);
  if (url.pathname.startsWith('/api/')) {
    if (request.headers.authorization !== 'Bearer ' + password) return json(response, 401, { error: 'Unauthorized' });
    if (url.pathname === '/api/state' && request.method === 'GET') return json(response, 200, {});
    if (url.pathname === '/api/state' && request.method === 'PUT') return json(response, 200, { ok: true });
    if (url.pathname === '/api/help/config' && request.method === 'GET') {
      return json(response, 200, { enabled: true, model: '@cf/openai/gpt-oss-120b', dailyLimit: 20, supportsImages: false });
    }
    if (url.pathname === '/api/help' && request.method === 'POST') {
      const body = JSON.parse(await readBody(request));
      return json(response, 200, {
        answer: 'Likely cause: the test service is intentionally returning a fixture.\n\n1. Confirm the safe diagnostic.\n2. Retry the narrowly scoped action.',
        model: '@cf/openai/gpt-oss-120b',
        remainingToday: 19,
        redactionsApplied: /\[REDACTED/.test(JSON.stringify(body)) ? 1 : 0
      });
    }
    return json(response, 404, { error: 'Not found' });
  }

  try {
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const fileUrl = new URL('.' + pathname, root);
    if (!fileUrl.href.startsWith(root.href)) return json(response, 403, { error: 'Forbidden' });
    const info = await stat(fileUrl);
    if (!info.isFile()) return json(response, 404, { error: 'Not found' });
    const body = await readFile(fileUrl);
    response.writeHead(200, { 'Content-Type': mime[extname(fileUrl.pathname)] || 'application/octet-stream' });
    response.end(body);
  } catch (error) {
    json(response, 404, { error: 'Not found' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('local hosted-help fixture on http://127.0.0.1:' + port);
});
