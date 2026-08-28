# loewtorials — project guide

Read this file first when picking this project back up. It's meant to stay
accurate — if you make a structural change, update the relevant section
here in the same session, especially "State of the project" at the bottom.

## What this is

A personal static dashboard of interactive step-by-step guides ("wizards").
No backend, no build step, no framework — plain HTML/CSS/JS, deployed as-is
(e.g. to Netlify). See `README.md` for the user-facing pitch, deployment
instructions, and the wizard markdown format's full spec is in
`templates/wizard-spec.md`.

## File inventory + conventions

```
index.html              dashboard — card grid, view tabs, spec-card,
                         activity-log button, settings gear
wizard.html              wizard player — settings gear, mark-solved
                         button, profile passthrough
assets/
  styles.css              root CSS vars incl. --text-scale,
                          --shell-max-width, --sidebar-gap; all
                          font-size values are in rem (only text scales
                          with --text-scale, not spacing/sizing — keep
                          new font-size CSS in rem too: px/16). Also holds
                          the mark-solved review UI classes
                          (.review-step, .status-btn, etc.) since
                          completion.js's modal is shared by both pages.
  dashboard.css            .shell uses min(var(--shell-max-width),96vw);
                          .spec-card, .view-tabs, .status-badge
  wizard.css                .app is a centered max-width grid; .stage
                          left padding uses var(--sidebar-gap); prose
                          capped at 74ch; .match-badge-row
  storage.js               getSettings/setSettings/resetSettings,
                          completions CRUD + getAllCompletionsFlat,
                          profile specs/containerfile getters/setters,
                          exportAll/importAll, downloadText.
                          getAllWizardMeta() merges localStorage
                          `overrides` onto manifest/custom data via
                          Object.assign — a new per-wizard flag (like
                          status: solved/archived) needs zero
                          storage.js changes, just show up on the
                          merged object.
  settings.js               theme presets, curated Google Fonts,
                          background variants (grid/solid/none/custom
                          image — applied via INLINE STYLES on <body>
                          from applyBackground(), not CSS classes — new
                          variants add a branch there, not new CSS),
                          applyAppearance()/bootAppearance(),
                          mountSettingsGearButton()
  profile.js                SPEC_FIELDS, parseContainerfile()
                          (heuristic, line-based), renderSpecCard(),
                          profile modal, openProfileModal()
  completion.js              mark-solved review + .md generation — see
                          "The mark-solved review" section below before
                          touching this file, its data model is more
                          involved than it looks
  wizard-engine.js           renders any wizard JSON, fully generic.
                          Exposes engine.getChecked() (per-step ticked
                          checklist indices) alongside .history/.currentId
                          for anything that needs to read progress, e.g.
                          completion.js. matchBadgeHtml() reads
                          wizard.relevantPackages / step.relevantPackages
                          (wizard-level only is actually implemented —
                          there is no per-step frontmatter syntax) against
                          the last-parsed Containerfile.
  dashboard.js               calls bootAppearance() first, mounts
                          gear + spec card, wires view tabs/status
                          filter, archive/unarchive/hide/delete/export
                          card-menu actions, activity-log download
  md-parser.js               turns wizard Markdown into wizard JSON.
                          Frontmatter has a hardcoded field allowlist
                          copied onto the wizard object — a new
                          frontmatter field needs a line added there
                          AND, if it's a comma-separated list (like
                          tags/sourceFiles/relevantPackages), added to
                          the list-parsing branch in parseFrontmatter()
wizards/manifest.json     built-in wizards: [{id, title, category, date,
                          tags, file}]. Currently just the tour wizard.
wizards/tour.json          the tour wizard's compiled JSON (see below —
                          don't hand-edit this, edit the .md source and
                          recompile)
wizards-src/tour.md        the tour wizard's markdown SOURCE. This
                          directory is source-only, nothing here is
                          fetched by the live app — only wizards/*.json
                          is. Add other built-in wizards' .md sources
                          here too if you want them kept as editable
                          source rather than just the compiled JSON.
templates/wizard-spec.md   authoring guide, downloadable from the "+"
                          button. Documents relevantPackages as
                          wizard-level only.
```

Independent globals-based scripts (`settings.js`, `profile.js`,
`completion.js`), no bundler. They assume `Storage` is loaded and expect
`window.showToast` to exist (both `index.html` and `wizard.html` set it
early in inline `<script>` blocks — do the same in any new entry point).

## Adding or editing a built-in wizard

Built-in wizards ship as pre-compiled JSON in `wizards/*.json` (this is
what `wizard.html`/`index.html` actually `fetch()`), but they're easier to
author and edit as markdown. The parser (`assets/md-parser.js`) is pure
JS with zero DOM dependency, so you can run it in Node instead of a
browser to compile a `.md` source into the JSON the app needs:

```
node -e "
const fs = require('fs');
const vm = require('vm');
const sandbox = {}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('assets/md-parser.js','utf8'), sandbox);
const md = fs.readFileSync('wizards-src/YOUR-WIZARD.md','utf8');
const result = vm.runInContext('parseWizardMarkdown', sandbox)(md);
if (result.errors.length) console.log('ERRORS:', result.errors);
fs.writeFileSync('wizards/YOUR-WIZARD.json', JSON.stringify(result.wizard, null, 2));
"
```

Then add an entry to `wizards/manifest.json` (`id`, `title`, `category`,
`date`, `tags`, `file`). Keep the `.md` source in `wizards-src/` so future
edits don't mean hand-editing JSON.

(The other, simpler way to add a built-in wizard: use the dashboard's
normal upload flow to add it as a *custom* wizard, use the card menu's
"Export JSON" action, then drop the exported file into `wizards/` and
register it in the manifest. Either path produces the same JSON shape.)

## The mark-solved review (assets/completion.js)

This got redesigned from a 5-box free-text form into something that
follows the actual run: it reads `engine.history` + `engine.getChecked()`
and builds one review entry per unique step actually visited (deduped to
first occurrence — a looped-back branch doesn't get a second card). Every
entry defaults to the happy-path answer ("Went fine" / "Right call" /
"Ended here as expected"), so hitting Save with zero taps already produces
an accurate record for a clean run — taps are only needed to flag
exceptions, and a note field only appears (and is always optional) once an
entry is flipped off its default.

Data model per record (`Storage.addCompletion`'s `record` argument):
```
{
  id, date, wizardTitle,
  pathTaken: [stepId, ...],       // raw history incl. revisits, for the flat activity log
  stepReviews: [
    { id, kind: 'step'|'branch'|'outcome', title, choiceLabel, checklist, status, note }
  ],
  overall: 'yes' | 'tweaks' | 'no',
  notes: '',                      // optional general free text
  systemSnapshot: {...}           // unchanged from before
}
```
Old completions saved before this change have `record.answers` (the old
5-field shape) instead of `record.stepReviews` — `generateCompletionMd()`
and `generateActivityLogMd()` both branch on which is present, so old
records still render correctly. Don't drop that branch when touching this
file; there's no migration step, old localStorage data is expected to
stick around as-is.

**Import-from-.md**: `parseChatSummaryMd()` does best-effort keyword
matching — it fuzzy-matches each step's title against lines in an
uploaded `.md` (works for a chat summary the user typed, or a `.md` this
app generated earlier) and classifies matched lines by keyword
(issue/different/skipped/fine words), with a naive negation check so "no
problems" doesn't get flagged as an issue. Anything unmatched becomes
leftover text dropped into the optional general notes field, so nothing
from the import is silently lost even when nothing auto-matches. This is
intentionally simple string matching, not NLP — if it misclassifies
something the user just taps the correct status afterward, the import is
a pre-fill, not a commitment.

## State of the project

Everything in the original handoff's priority list is done:

- Fixed: `relevantPackages` frontmatter field was being silently dropped
  by the parser (missing from the field allowlist + list-field branch).
  Now flows through and the "detected on your system" badge works.
  Documented as wizard-level-only in `templates/wizard-spec.md` (no
  per-step syntax was ever implemented, and the stated use case doesn't
  need one).
- Verified via Playwright: dashboard load, settings (theme/font/
  background/sliders), custom-wizard upload, system profile +
  Containerfile parsing, wizard player rendering (rail, checklist,
  code-copy, branch, outcomes), the new mark-solved review flow
  (defaults, status flip reveals note field, import pre-fills and
  correctly handles negation, save downloads a correct `.md`, dashboard
  shows the solved badge), activity-log download, view-tab filtering
  (All/Active/Solved/Archived), and card-menu actions (archive, unarchive,
  hide/unhide, export JSON) — all clean, zero console errors beyond the
  expected fonts.googleapis.com 403 from sandboxed network egress.
- Authored the `tour` wizard (`wizards-src/tour.md` → `wizards/tour.json`)
  covering what a wizard is, groups/steps/branches/outcomes, the
  auto-linked-reference mechanic, custom upload, mark-solved + summary,
  activity log, and appearance settings. Registered in
  `wizards/manifest.json`.
- `README.md`'s stale `dirty-ntfs.json` references replaced with the real
  `tour.json`/`tour` wizard.

Not yet done (deliberately deferred, low priority, don't build
speculatively — let the user pick):
full-text step search, one-shot export/import UI polish (the backend
already exists via `Storage.exportAll()`/`importAll()` — check whether
the settings-modal backup buttons are enough or a dashboard
restore-on-load flow is worth adding), keyboard shortcuts in the wizard
player, related-wizards suggestions, print/PDF view of a completed
wizard, and "delete" on a custom wizard card wasn't explicitly
re-verified in this pass (archive/unarchive/hide/export all were) since
it's destructive and low-risk/self-explanatory — worth a quick check
before relying on it if it becomes relevant.
