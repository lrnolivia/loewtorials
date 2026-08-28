// worker/index.js — Cloudflare Worker entry point for loewtorials.
//
// Handles one API route (GET/PUT /api/state, the cross-device sync
// blob) and delegates everything else to the static assets binding —
// same site, same behavior as the old Pages Functions setup, just
// running as a Worker instead. See CLOUDFLARE-SETUP.md.

const KV_KEY = 'state';

function checkAuth(request, env) {
  const header = request.headers.get('Authorization') || '';
  const expected = 'Bearer ' + (env.SITE_PASSWORD || '');
  if (!env.SITE_PASSWORD || header !== expected) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  return null;
}

async function handleGetState(request, env) {
  const denied = checkAuth(request, env);
  if (denied) return denied;

  if (!env.LOEWTORIALS_KV) {
    return new Response(JSON.stringify({ error: 'LOEWTORIALS_KV binding is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const raw = await env.LOEWTORIALS_KV.get(KV_KEY);
  return new Response(raw || '{}', {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handlePutState(request, env) {
  const denied = checkAuth(request, env);
  if (denied) return denied;

  if (!env.LOEWTORIALS_KV) {
    return new Response(JSON.stringify({ error: 'LOEWTORIALS_KV binding is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let bodyText;
  try {
    bodyText = await request.text();
    JSON.parse(bodyText); // validate before persisting anything
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await env.LOEWTORIALS_KV.put(KV_KEY, bodyText);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/state') {
      if (request.method === 'GET') return handleGetState(request, env);
      if (request.method === 'PUT') return handlePutState(request, env);
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // everything else: serve the static site (index.html, wizard.html,
    // assets/*, wizards/*, etc.) via the [assets] binding in wrangler.toml
    return env.ASSETS.fetch(request);
  }
};
