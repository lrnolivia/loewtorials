# Hosted technical help — staged setup

This feature is intentionally **not active**. Its code lives on the local-only
`codex/llm-help-integration` branch, the branch has no GitHub upstream, and
`wrangler.toml` does not currently grant the Worker access to Workers AI.

Even if the code is merged before setup is complete, the Worker fails closed:
`LLM_HELP_ENABLED` must equal `true`, the `AI` binding must exist, the existing
KV binding must exist, and the request must carry the existing site password.
Otherwise the hosted Ask button stays disabled and no inference request runs.

## What is already built

- Authenticated `GET /api/help/config` and `POST /api/help` routes.
- Cloudflare-hosted `@cf/openai/gpt-oss-120b` as the default model.
- A 20-request daily cap stored in the existing KV namespace.
- 120 KB request-body limit and bounded question, terminal, and guide context.
- Browser-side and Worker-side redaction for common passwords, API keys,
  bearer tokens, private keys, and credentials embedded in URLs.
- Guide title, description, current section, and full guide text are added
  automatically.
- Copy/download Markdown fallback remains available if hosted help is disabled,
  unavailable, or over its daily cap.
- Answers can be copied or downloaded from the help panel.

The selected model is a strong reasoning-oriented text model with a 128K context
window. It does not accept images. Screenshots therefore remain part of the
downloadable handoff: their filenames are recorded in the Markdown file and the
original images download separately for attachment to a visual model.

## Do not do this until you are ready to test Cloudflare billing

Add the following inactive configuration to `wrangler.toml`:

```toml
[ai]
binding = "AI"

[vars]
LLM_HELP_ENABLED = "false"
LLM_HELP_MODEL = "@cf/openai/gpt-oss-120b"
LLM_HELP_DAILY_LIMIT = "20"
```

Deploying with `LLM_HELP_ENABLED = "false"` is a safe wiring check: the AI
binding exists, but the endpoint still refuses inference.

When you have confirmed the binding and reviewed the Workers AI billing page,
change only this line:

```toml
LLM_HELP_ENABLED = "true"
```

Then deploy manually for the first live test. Do not rely on an automatic
GitHub deployment for the first activation.

```bash
npx wrangler deploy
```

Open a guide, unlock the site with the existing sync password, open **Need
help**, and confirm the status says **Hosted assistant ready**. Ask a harmless
test question, then verify the request in the Workers AI dashboard.

## Before enabling automatic deployment

- Confirm `SITE_PASSWORD` is still set as a Cloudflare secret.
- Confirm the `AI` binding is named exactly `AI`.
- Keep `LLM_HELP_DAILY_LIMIT` at 20 for the first week.
- Confirm the help endpoint returns `401` without the site password.
- Confirm pasted fake credentials are replaced with `[REDACTED]`.
- Confirm the Workers AI usage dashboard shows the expected single request.
- Add a Cloudflare spend notification or budget appropriate for the account.
- Only then merge/push the feature branch and reconnect automatic deployment.

## Local verification without a model or deployment

Run the Worker safety tests:

```bash
node tests/worker-help.test.mjs
```

To preview a successful hosted answer entirely on your own machine, start the
fixture server:

```bash
node tests/help-preview-server.mjs
```

Open `http://127.0.0.1:8088/wizard.html?id=tour&view=article` and unlock it
with the fixture-only password `local-test-password`. The returned answer is a
hard-coded test response; this server never contacts Cloudflare or any model.

## Changing providers later

The browser talks only to `/api/help`; it never talks directly to a model
provider. A later provider change therefore stays inside `worker/index.js` and
does not require rebuilding the help interface or exposing a provider key in the
browser.
