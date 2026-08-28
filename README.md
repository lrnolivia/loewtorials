# loewtorials

A personal wizard dashboard. Card grid of interactive, step-by-step guides
("wizards"), organizable by category/date/tags, with a built-in Markdown
format so you can write a new wizard by hand or hand a spec to Claude and
upload what comes back.

It's a static site (plain HTML/CSS/JS, no build step) served as a single
Cloudflare Worker, with one API route for cross-device sync — see
`CLOUDFLARE-SETUP.md` for the sync-specific setup. Cloudflare's free tier
covers the Worker, static assets, and the KV storage it syncs to, with
no extra cost.

## What's in here

```
index.html          the dashboard (card grid, filters, add/edit modals)
wizard.html          the generic wizard player — loads any wizard by ?id=
assets/
  styles.css          shared design tokens + buttons/modals/toast
  dashboard.css        dashboard-only layout (grid, cards, toolbar)
  wizard.css            wizard-player-only layout (rail/stage)
  wizard-engine.js      renders any wizard JSON — no wizard-specific code
  dashboard.js           dashboard logic: load, filter, sort, add, edit
  md-parser.js            turns wizard Markdown into wizard JSON
  storage.js               localStorage: custom wizards + metadata overrides
  completion.js             "mark solved" review + activity log generation
wizards/
  manifest.json        list of built-in wizards (id, title, category, date, tags, file)
  tour.json               a built-in tour of the dashboard itself — what a
                         wizard is, branches/outcomes, linking, uploading,
                         mark-solved, appearance
wizards-src/
  tour.md                 the tour wizard's markdown source (see
                         PROJECT-GUIDE.md for how a built-in wizard's .md
                         gets converted into its wizards/*.json)
templates/
  wizard-spec.md        the authoring guide — downloadable from the "+" button,
                         meant to be handed to a fresh Claude conversation
```

## How wizards work

Every wizard is just a JSON object (`wizards/*.json`) with a `steps` map and
an `outline` describing the sidebar. `wizard-engine.js` doesn't know
anything about any specific wizard — it just renders whatever JSON it's
given. That's the "modular" part: adding a wizard is adding data, never
touching the engine.

There are two ways a wizard gets onto the dashboard:

1. **Built-in** — listed in `wizards/manifest.json`, data lives in a JSON
   file in `wizards/`. These ship with the site and are visible to everyone
   who loads it.
2. **Custom (uploaded)** — parsed client-side from a `.md` file via the "+
   New wizard" button and saved into the browser's `localStorage` on
   whatever device you uploaded it from. Nothing is sent anywhere.

Custom wizards are per-device/per-browser by design (this is a static site
with no server to store things centrally). If you want a wizard uploaded on
your phone to show up everywhere, use the card's **Export JSON** action,
drop the resulting file into `wizards/`, add an entry to
`wizards/manifest.json`, and redeploy. At that point it's a built-in
wizard, permanent for anyone who loads the site.

The tour wizard is included as a built-in, but it's manageable like any
other card — rename it, edit its category/tags/date, hide it, or export its
JSON, all from the card's menu (⋮ → Edit details). If you want to fully
rewrite its content, upload a new `.md` with `id: tour` in the frontmatter;
a custom upload with the same id shadows the built-in one everywhere in
the UI.

## Wizards linking to other wizards

If one wizard's step, checklist, or note mentions another wizard's `.md`
filename (e.g. `` `fix-partition.md` `` — backticks optional), and some
wizard on the dashboard claims that filename, the mention becomes a live
card right in that step: the linked wizard's title, a button to expand it
inline (walk it right there, no page change), and a link to open it
full-page. Unmatched mentions are just left as plain text.

A wizard claims a filename two ways: automatically, under whatever name you
uploaded/dropped it as, or explicitly via a `sourceFiles:` frontmatter field
(comma-separated) — useful when one wizard covers content from more than one
source doc, e.g. a "round 2" doc that got folded into an existing wizard and
never uploaded on its own. A `sourceFiles` entry can also point at a
specific step id instead of the wizard's start (`wizards/manifest.json`
shows the syntax), so a "round 2" reference can jump straight into the
round-2 section instead of the top.

## Writing a new wizard

- **By hand:** see `templates/wizard-spec.md` for the exact Markdown format
  (Groups, Steps, Branches, Outcomes — the flow follows document order, so
  most of the time you just write steps in sequence).
- **With Claude:** the dashboard's "+ New wizard → Get one written" tab
  downloads that same spec file and gives you a starter prompt to copy.
  Open a fresh Claude conversation, attach the spec, describe what you want
  the wizard to walk through, and Claude writes the `.md` back to you. Drop
  it into the "Upload / paste .md" tab to preview and add it.

This all happens client-side in your browser — there's no server-side
generation, so there was no way to make "upload markdown → working wizard"
happen without either this approach or a real backend. This keeps the whole
thing free and framework-free.

## Running it locally

Because `index.html` and `wizard.html` `fetch()` JSON files, opening them
directly from disk (`file://...`) will fail — browsers block that. Serve
the folder over local HTTP instead, from inside the `loewtorials/` folder:

```
python3 -m http.server 8080
# or
npx serve .
```

Then open `http://localhost:8080`.

## Deploying to Cloudflare Workers (free)

No build command required. Do the one-time KV namespace + password setup
in `CLOUDFLARE-SETUP.md` first (it also covers auto-deploy on push, the
Workers equivalent of what Pages' git integration used to do) — that
single doc covers deploying and turning on cross-device sync together,
since on Workers both come from the same `wrangler.toml`/`wrangler deploy`.

Once deployed, editing on your Mac or PC and pushing (or running
`wrangler deploy`) is all it takes to update it everywhere — including on
your phone, since it's just a URL. Custom domains and renaming the
`*.workers.dev` subdomain are both free, under your Worker's **Settings →
Domains & Routes**.
