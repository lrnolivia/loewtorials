# loewtorials — handoff

> Universal process authority: read `lrnolivia/loew-runner@main/LOEW_CHAT_BIBLE.md` and `contracts/manifest.json` first. This file is a repository-specific overlay and must not fork the universal operating contract.

Package: `loewtorials_7.zip` (this delivery)

## Done this round (new)

### 6. Guided-view scroll thrashing — root cause found, fixed
The previous handoff round had verified guided-view scroll with a single
snapshot check per step (position after a fixed wait), which happened to
land on a plausible-looking value either way and missed that the scroll
position never actually settles. Polling `window.scrollY` every 50ms
after a "Next" click showed it oscillating indefinitely between two
values (e.g. 43 and 304) instead of converging.

Root cause: CSS scroll anchoring fighting with the header's collapse-on-
scroll behavior. `header.js`'s scroll listener toggles `body.scrolled`
at a single fixed threshold (scrollY > 70), which hides `.app-hero`/
`.specs-bar-wrap` (~260px of content sitting above `.stage-top`). On a
step short enough that 70px of scroll is close to the page's entire
scroll range: crossing 70 collapses the hero, shrinking the page;
Chrome's scroll anchoring then compensates for content disappearing
above the viewport by adjusting scrollY back down, which drops it below
70, which re-expands the hero, regrowing the page and letting scrollY
drift back past 70 — forever. `goTo()`'s `scrollIntoView` call was
correct the whole time; it just never got a stable layout to scroll to.

Fixed both contributing causes: `header.js`'s toggle now uses hysteresis
(collapse past 70, only re-expand under 40, so ordinary jitter can't
cross back and re-trigger the loop) and `.app-hero`/`.specs-bar-wrap` in
`styles.css` got `overflow-anchor:none` (stops the browser from
compensating for their resize at all — the more direct fix of the two).
Verified by polling scrollY every 50ms for 1s after each of several
"Next" clicks, at both a normal (700px) and a very short (500px)
viewport height: settles immediately every time, no oscillation.

### 7. Accent-1 text contrast on light themes
`--a1` is tuned as a *fill* color (paired with `--a1t` drawn on top of
it — WCAG floor 3:1 in the customize UI, the bar for large-scale/
component contrast, not body text). It was also being used directly as
a text `color` in ~17 places (nav, links, labels, checklist marks,
step-card emphasis), which only ever had headroom against *dark*
neutrals — against every family's light-mode backgrounds it measures as
low as 1.0–1.3:1.

Added `--a1-text`: a new token, branched by mode like the existing
neutrals (bg/panel/surf/tx already branch this way; a1 didn't). Dark
mode: identical to `--a1` (already reads fine there, no change). Light
mode: each family's new `a1TextLight` value in `theme.js` — a
same-hue-family darkened branch, picked to clear 4.5:1 against that
family's light bg/panel/surf. Repointed all ~17 `color:var(--a1)` text
uses to `color:var(--a1-text)` (left every `background:`/`border-color:
var(--a1)` alone — those still pair with `--a1t` as before and weren't
part of the complaint).

One deliberate exception: neon-cobalt's `.step-card` sits on `--surf`/
`--card`, which for that family stay a bold dark blue even in light
mode (see `FAMILIES['neon-cobalt']` in `theme.js`) — `a1-text` assumes a
*light* surface and goes nearly invisible there, while the original
`--a1` already had great contrast against that dark blue. Added a
`[data-theme="neon-cobalt"]` override reverting `.step-body strong`,
the checklist checkmark, and `.ref-link-label` back to plain `--a1`.

Follow-up: the greige and mono dopamine-card residual is now resolved
with a separate `--card-accent-text` token. It preserves the accent-hue
branch on pale surfaces while using an AA-safe near-neutral inside the
mid-tone card; greige's general card text pairing was also tightened
from 4.05:1 to 4.63:1.

Verified visually: screenshotted all 4 themes × both styles (brutal/
dopamine) in light mode; spot-checked computed `color` on `.step-body
strong` and `.eyebrow` against the intended hex per family.

### 8. Dopamine spec pills now follow the theme
The four spec pills (ASRock board / RTX 4070 / 32GB / SteamOS) in
dopamine style were hardcoded to `--chip-dark`/`--chip-dark-t` — always
near-black with white text, regardless of theme or light/dark mode,
which is what you flagged. Switched to `--card`/`--cardt` — the same
themed, mode-aware, contrast-checked pairing dopamine's wizard/step
cards already use — and removed the now-unused chip-dark tokens from
`theme.js` and `styles.css`. Brutal style's single bordered specs bar
(`--panel`/`--tx`) was already theme-aware and untouched.

### 9. Favicon — toolbox, forced past caching
Added a toolbox-emoji favicon to all three HTML pages (`index.html`,
`wizard.html`, `test.html`). Layered four `<link>` tags per page:
- An inline SVG **data URI** (toolbox emoji rendered as text) listed
  first — no network request at all, so nothing can serve it stale.
  This is what most current browsers actually display.
- `favicon.png` / `favicon.ico` / `apple-touch-icon.png` — new files at
  the repo root (served automatically by the Cloudflare Worker's static
  `[assets]` config, no routing changes needed), each a raster export
  of the same toolbox glyph, cropped tighter than the emoji's native
  padding so it still reads at 16–32px.
- Every file-based link carries `?v=1` — favicons are notoriously
  cached past normal page reloads (and past whatever a browser or the
  domain had cached before this existed); a version query makes it a
  new URL as far as any cache is concerned. Bump it if the icon ever
  changes again.

Verified: all four new root files serve 200, and all four `<link>` tags
resolve to the expected `href` in a loaded page.

## Done previous round
(sidebar) opening a modal that lists *every* wizard at once — including
hidden and archived ones, which the main grid deliberately never shows
together — with its own search box and status filter (All/Active/
Solved/Archived/Hidden), and the same row actions as the card menu
(Edit details, Archive/Restore, Hide/Unhide, Export JSON, Source .md,
Delete). It's built on a new `Storage.getEveryWizardMeta()` (shares the
same manifest+custom+overrides merge as `getAllWizardMeta`/
`getHiddenWizardMeta` — refactored into one private `_mergeWizardMeta`
so there's a single source of truth for that merge, not three) and
every row button calls the dashboard's existing `handleCardAction()`,
so nothing needed a second implementation. Also added an `unhide`
action to `handleCardAction` (previously only "unhide all," via the
hidden-count link under the grid, existed).

Verified via Playwright: seeded hidden + archived custom wizards,
confirmed each status filter in the Manage modal shows the right
subset, unhid and deleted rows from inside Manage (both changes showed
up in the main grid immediately), and edited a wizard from a Manage
row — the edit-details modal correctly stacks on top of the Manage
modal (moved earlier in `index.html`'s DOM order so it wins the
same-z-index stacking) and the Manage list re-renders with the new
title once saved.

Files: `index.html` (Manage button + modal markup, editModal moved
earlier in DOM order), `assets/dashboard.js` (`renderManageList()`,
`manageRowHtml()`, `unhide` action, `getEveryWizardMeta`/
`getAllWizardMeta` `_hasSource` patch factored into `withHasSource()`),
`assets/dashboard.css` (`.manage-row*`, `.status-badge.hidden-badge`),
`assets/storage.js` (`_mergeWizardMeta`, `getEveryWizardMeta`).

Editing deliberately stayed a dedicated modal rather than reusing the
multi-upload review pane as originally sketched below — both edit only
title/category/tags/date and leave content untouched, so the two
approaches are functionally identical; the dedicated modal avoids
duplicating the review-pane markup for a one-field-at-a-time case.

## Done previous round

### 1. Sticky header didn't stick
`.utility` (icon bar) had `position:sticky; top:0` — correct on paper — but
its parent `.app-header` only ever grows to ~64px tall (just enough to wrap
the icon bar + the thin accent stripe under it). A sticky element can't
move outside its containing block's box, so it only had ~4px of slack
before it ran out of room and got dragged off with the rest of the page.

Confirmed with a real headless Chromium run (not just static CSS reading):
after scrolling 539px, the header had moved -535px — essentially 1:1 with
scroll, i.e. not sticking at all.

**Fix:** `#appHeaderMount` and `.app-header` are now `display:contents`,
so `.utility`'s containing block becomes `<body>`, which spans the full
scrollable page. Re-verified: `rect.top` now stays pinned at `0` through
the same scroll test.

Files: `assets/styles.css` (`.app-header` / `#appHeaderMount` rule).

### 2. Guided view scroll
`goTo()` in the wizard engine scrolled `.step-card` (the content panel)
to the top of the viewport on every step change. But the phase eyebrow +
step title (`.stage-top`) sit *above* the card in the DOM. On any step
tall enough to need scrolling, aligning the card's top edge to y=0 pushed
the title/eyebrow completely off-screen *above* the viewport — measured
directly at `y: -131px`, fully hidden. You'd land on a wall of content
with no indication which step you were on.

**Fix:** scroll target changed to `.stage-top` so the title and card
arrive together. Also added `scroll-margin-top: var(--util-h)` to both
`.stage-top` and `.step-card`, since without it the title would land
exactly *behind* the (now actually-sticky) header instead of below it —
a second bug that would've only become visible once bug #1 was fixed.

Files: `assets/wizard-engine.js` (`goTo()`), `assets/wizard.css`
(`.stage-top`, `.step-card`).

### 3. Readability / contrast pass (previous round, included here too)
- `--tx-faint` / `--tx-muted` / `--surft-muted` mix ratios bumped —
  measured as low as 1.3:1 in some theme/component pairings (e.g. the
  style/mode/corners toggle against Neon Cobalt), now 4–8:1 across all
  8 theme×mode combos.
- Dopamine-style ghost/back buttons no longer disappear inside modals
  (they were filling with the modal's own background color, no border).
- `.spec-actions` / `.preview-box` / `.parse-errors` moved from
  `dashboard.css` (dashboard-only) into `styles.css` (shared) — they're
  used by `settings.js`, which also runs on `wizard.html`, and were
  rendering completely unstyled there (no flex, no gap) — root cause of
  "settings buttons too close together."

### 4. Multi-file upload + review/edit step (previous round)
Add-wizard modal accepts multiple `.md` files (drag or picker), parses
each independently with a per-file checklist, and adds a "Review" step
where title/category/tags/date are editable per-wizard before saving
(content itself is never editable there — only labels).

## Completed in the final pass

The last outstanding handoff item is complete: wizard pages now fall
back to Article view, while still respecting a query parameter, saved
per-wizard default, or author-supplied suggestion. Article rail links
also use a sticky-header-aware scroll margin and were verified to land
below the 60px utility bar.

The final theme review also removed obsolete dark-chip tokens, fixed the
remaining greige/mono dopamine-card contrast, and made article-card
secondary text use the card's own text pairing. Four theme-aware
backgrounds were added (graph paper, diagonal hatch, accent glow, and
topographic rings), and the original default was corrected to render a
true dot grid.

Beyond that, the next items are the low-priority, deliberately-deferred
ones in `PROJECT-GUIDE.md`'s "State of the project" section (full-text
step search, export/import UI polish, wizard-player keyboard shortcuts,
related-wizard suggestions, print/PDF view, bulk actions in Manage) —
don't build any of those speculatively, let the user pick one.

<details>
<summary>Original brief for the round above (kept for history)</summary>

Requested: a "Manage" entry point on the dashboard, plus a per-wizard
edit button that reuses the review-panel UI from the multi-upload flow,
and the ability to delete a wizard outright. **Not started.**

Rough plan, based on what's already in place:

- **Delete**: `Storage.getCustomWizards()` / `Storage.saveCustomWizard()`
  already exist in `assets/storage.js`; there's no
  `Storage.deleteCustomWizard(id)` yet — needs adding (remove from the
  `LS_CUSTOM` map, mirror whatever `saveCustomWizard` does for the sync
  push). Only custom (uploaded) wizards should be deletable — the
  manifest-shipped ones (like `tour`) aren't stored the same way, so the
  delete affordance should probably only show for wizards with a custom
  entry, and/or offer "archive" instead for manifest wizards (dashboard
  already has an Archived status — check `dashboard.js` for how status
  is set today, e.g. the wizard-card's `⋮` menu, before adding a
  redundant path).

- **Edit button on each wizard card**: the dashboard's wizard cards
  already render a `⋮` menu (visible in the screenshots — top-right of
  each card). Natural spot to add "Edit" and "Delete" entries. Check
  `assets/dashboard.js` for where that menu is built/wired.

- **Reusing the review panel**: the add-wizard modal's review step
  (`paneReview` / `renderReviewPane`-equivalent in `dashboard.js`, added
  in the multi-upload round) currently only runs against freshly-parsed
  `pendingItems`. To reuse it for editing an *existing* wizard:
  - It needs a single-item entry path that doesn't require a fresh
    Markdown parse — seed one `pendingItems`-shaped object directly from
    the stored wizard's current title/category/tags/date (+ its stored
    `_sourceMarkdown` if present, so "content unchanged" still holds).
  - The "Add to dashboard" confirm handler currently always calls
    `Storage.saveCustomWizard` with a freshly-uniquified `id` — for an
    edit, the `id` must stay the wizard's existing `id` (don't run it
    through the uniquify-against-existing-ids logic, or it'll collide
    with itself and get suffixed).
  - Simplest structural approach: give the review pane an explicit mode
    (`'add'` vs `'edit'`) so the confirm handler branches on save-new vs
    save-existing, rather than duplicating the whole pane.

- **"Manage" button on the dashboard**: unclear from the request whether
  this is (a) a dedicated bulk-manage screen/list, or (b) just the entry
  point that surfaces the edit/delete affordances per-card (i.e. the
  request may be satisfied entirely by the per-card `⋮` menu additions
  above, with "Manage" just labeling that mode). Worth a quick clarifying
  check before building a whole separate screen that might not be wanted.

None of this is implemented yet in the shipped zip — the fixes in this
delivery are limited to the sticky header, guided-view scroll, and the
earlier contrast/spacing/multi-upload work.

</details>
