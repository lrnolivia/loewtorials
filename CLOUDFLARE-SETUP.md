# Cloudflare Workers setup — cross-device sync

loewtorials runs as a single Cloudflare Worker: `worker/index.js` serves
the static site (index.html, wizard.html, assets/*, wizards/*) and
handles one API route, `/api/state`, backed by a Workers KV namespace.
That's what makes your wizards/settings/progress the same on every
device you open the site from.

Workers, static assets, and KV are all on Cloudflare's **free** plan —
no card, no upgrade needed.

You do **not** need "Secrets Store" for this — that's a separate product
for static config values, and it isn't built for data your app rewrites
on every save the way this state blob is. The password below uses a
plain encrypted Worker **secret** (`wrangler secret put`), which is the
right tool and has nothing to do with Secrets Store.

## 0. One-time: install Wrangler

```bash
npm install -g wrangler
wrangler login   # opens a browser tab to authorize against your account
```

## 1. Create the KV namespace

From this repo's root (where `wrangler.toml` lives):

```bash
npx wrangler kv namespace create LOEWTORIALS_KV
```

This prints something like:

```
{ binding = "LOEWTORIALS_KV", id = "abcd1234..." }
```

Copy that `id` into `wrangler.toml` in this repo, replacing
`REPLACE_WITH_YOUR_NAMESPACE_ID`. Commit that change.

## 2. Set the shared password as a secret

```bash
npx wrangler secret put SITE_PASSWORD
```

It'll prompt you to type the password; nothing is written to any file,
so it never ends up in git.

## 3. Deploy

**One-off, from your machine:**

```bash
npx wrangler deploy
```

Your site is now live at `<name>.<your-subdomain>.workers.dev` (or a
custom domain you attach afterward in the dashboard, under your Worker's
**Settings → Domains & Routes** — free, same as Pages custom domains
were).

**Auto-deploy on push (what you had with Pages' git integration):**
Cloudflare's equivalent for Workers is called **Workers Builds** — same
idea, still free:

1. Push this repo (with the real KV id in `wrangler.toml`) to GitHub or
   GitLab.
2. Cloudflare dashboard → **Workers & Pages → Create application →
   Import a repository**, or if the Worker already exists from step 3
   above: your Worker → **Settings → Builds → Connect**.
3. Point it at the repo/branch. Cloudflare reads `wrangler.toml` from
   the repo automatically, same as the manual deploy above.

Every push to that branch now builds and deploys automatically, with
preview URLs on pull requests — the same workflow you were using on
Pages, just under the Workers product.

## Using it

Open the site on any device → gear icon → **Sync** section → enter the
password → **Save & reconnect**. That device is now unlocked; it'll pull
whatever's already saved server-side (or, the very first time anyone
connects, push its own local data up to become the seed for every other
device). After that, every change syncs in the background automatically
— no need to open Settings again unless you want to check status, force
a sync, or disconnect a device.

If a device isn't unlocked yet, you'll see an "Unlock loewtorials"
prompt on load instead of the dashboard — enter the password there, or
tap **Continue offline** to skip it for that visit and just use local
storage as before.

## How it works / limits

- One JSON blob, one KV key (`state`), last-write-wins. There's no merge
  logic — if you somehow edit the same wizard on two devices at the same
  moment, whichever syncs second overwrites the first. Non-issue for one
  person using it sequentially on a couple of machines; worth knowing if
  that ever changes.
- The password is checked as a simple `Authorization: Bearer <password>`
  header comparison against `SITE_PASSWORD` — nothing fancier. Rotate it
  any time by re-running `wrangler secret put SITE_PASSWORD`; existing
  devices will start getting "Incorrect password" and need to be
  reconnected with the new one.
- Export/Import (Settings → backup) still works exactly as before and is
  independent of this — it's a manual `.json` file, not the synced
  state.
- Everything under `/api/*` is routed to the Worker (`run_worker_first`
  in `wrangler.toml`); every other path is served as a static file
  without even invoking the Worker script, so there's no performance
  cost for normal page loads.
- Workers KV's free tier (100k reads/day, 1k writes/day, 1GB storage) is
  wildly more than one person syncing a couple of devices will ever use.
