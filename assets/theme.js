// theme.js
// The theme system: four independent, freely-combining controls —
//   style   : 'brutal'   | 'dopamine'
//   theme   : 'cream'    | 'neon-cobalt' | 'greige' | 'mono'
//   mode    : 'light'    | 'dark'
//   corners : 'square'   | 'rounded'   — independent of style on purpose;
//             "rounded neo-brutalism" and "square dopamine" are both
//             valid combos, not just the two defaults.
// Every component reads color/shape from the CSS custom properties this
// file writes onto :root — nothing in the CSS ever hardcodes a color.
// See assets/styles.css for the derived (color-mix) variables built on
// top of these, and the [data-style]/[data-corners] rules that give
// each combination its shape without a token per component.

// One entry per color theme. Each has a `light` and `dark` half (the
// neutral bg/panel/surf/border/tx set) and a shared accent set that
// doesn't change with mode. `card`/`cardt` default to a2/a2t but are
// always independently customizable (see CUSTOMIZE_ROWS in header.js)
// — every family gets its own card row now, not just the ones that
// happen to ship a non-default card color.
const FAMILIES = {
  cream: {
    label: 'Cream',
    a1: '#FFD23F', a1t: '#1C1B17',
    // a1 itself is tuned as a *fill* color (paired with a1t drawn on top
    // of it) — as text drawn directly on a light neutral (bg/panel/surf)
    // it measures well under WCAG AA (~1.3:1 against this family's
    // surf). a1TextLight is a separate, deliberately darker branch of
    // the same hue for that use, applied only in light mode — see
    // resolveFamilyTokens's `a1-text` token below.
    a1TextLight: '#725700',
    cardAccentText: '#594300',
    a2: '#7FE0E8', a2t: '#1C1B17',
    a3: '#FF5B49', a3t: '#1C1B17',
    light: { bg: '#EDE3C8', panel: '#E3D5AE', surf: '#FAF6EA', surft: '#1C1B17', border: '#1C1B17', tx: '#1C1B17' },
    dark:  { bg: '#171310', panel: '#221C15', surf: '#2C2419', surft: '#F3EBDA', border: '#F3EBDA', tx: '#F3EBDA' }
  },
  'neon-cobalt': {
    label: 'Neon Cobalt',
    a1: '#C6FF29', a1t: '#0A0A14',
    a1TextLight: '#435C00',
    cardAccentText: '#C6FF29',
    a2: '#FF2EC4', a2t: '#0A0A14',
    a3: '#22E5FF', a3t: '#0A0A14',
    card: '#2A2AF5', cardt: '#F5F5FF',
    light: { bg: '#F0EEFF', panel: '#D6D0FF', surf: '#2A2AF5', surft: '#F5F5FF', border: '#0A0A14', tx: '#0A0A14' },
    dark:  { bg: '#0A0A14', panel: '#14132C', surf: '#2A2AF5', surft: '#F5F5FF', border: '#F5F5FF', tx: '#F5F5FF' }
  },
  greige: {
    label: 'Greige',
    a1: '#C79B4B', a1t: '#2B2924',
    a1TextLight: '#664C1D',
    cardAccentText: '#211E1A',
    a2: '#7C8C74', a2t: '#2B2924',
    a3: '#B5654F', a3t: '#F7F1EC', // takes light text, not dark
    cardt: '#211E1A',
    light: { bg: '#DAD4C8', panel: '#C9C2B2', surf: '#EFEBE2', surft: '#2B2924', border: '#2B2924', tx: '#2B2924' },
    dark:  { bg: '#211E1A', panel: '#2E2A24', surf: '#3B362E', surft: '#EDE7DC', border: '#EDE7DC', tx: '#EDE7DC' }
  },
  mono: {
    label: 'Mono',
    a1: '#C9C4BB', a1t: '#221F1C',
    a1TextLight: '#5C5548',
    cardAccentText: '#221F1C',
    a2: '#9C968C', a2t: '#221F1C',
    a3: '#4A453E', a3t: '#F3F1EC', // the dark chip — light text
    light: { bg: '#DEDAD3', panel: '#CFCAC1', surf: '#F1EEE9', surft: '#221F1C', border: '#221F1C', tx: '#221F1C' },
    dark:  { bg: '#1C1A17', panel: '#272420', surf: '#322E28', surft: '#EFECE6', border: '#EFECE6', tx: '#EFECE6' }
  }
};

// One shared font default for every theme now (Bungee/Sora/JetBrains
// Mono) instead of a bespoke set per family — themes differ by color,
// not typeface, unless someone overrides it below.
const DEFAULT_FONTS = {
  display: "'Bungee', sans-serif",
  body: "'Sora', sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace"
};

// A single utility accent for destructive actions (delete, danger
// button, error states) sits outside the 16-combination system so it
// reads consistently no matter which palette or mode is active.
const MODE_DANGER = { light: '#B7362A', dark: '#E2685A' };

// A clean, curated set of display/body fonts — a sans-serif and a
// serif option in each, plus a couple of alternates — for the
// individual-slot overrides in the theme popover. Not tied to any
// family; these replace the old "borrow another theme's font set"
// alternates entirely.
const FONT_ALTERNATES = {
  display: [
    { id: 'bungee', label: 'Bungee (default)', value: "'Bungee', sans-serif" },
    { id: 'space-grotesk', label: 'Space Grotesk (sans)', value: "'Space Grotesk', sans-serif" },
    { id: 'sora-display', label: 'Sora (sans)', value: "'Sora', sans-serif" },
    { id: 'fraunces', label: 'Fraunces (serif)', value: "'Fraunces', serif" },
    { id: 'playfair', label: 'Playfair Display (serif)', value: "'Playfair Display', serif" },
    { id: 'system', label: 'System default', value: 'system-ui, sans-serif' }
  ],
  body: [
    { id: 'sora', label: 'Sora (default)', value: "'Sora', sans-serif" },
    { id: 'inter', label: 'Inter (sans)', value: "'Inter', sans-serif" },
    { id: 'work-sans', label: 'Work Sans (sans)', value: "'Work Sans', sans-serif" },
    { id: 'source-serif', label: 'Source Serif 4 (serif)', value: "'Source Serif 4', serif" },
    { id: 'lora', label: 'Lora (serif)', value: "'Lora', serif" },
    { id: 'system', label: 'System default', value: 'system-ui, sans-serif' }
  ],
  mono: [
    { id: 'jetbrains', label: 'JetBrains Mono (default)', value: "'JetBrains Mono', ui-monospace, monospace" },
    { id: 'space-mono', label: 'Space Mono', value: "'Space Mono', ui-monospace, monospace" },
    { id: 'ibm-plex-mono', label: 'IBM Plex Mono', value: "'IBM Plex Mono', ui-monospace, monospace" },
    { id: 'system', label: 'System monospace', value: 'ui-monospace, Menlo, Consolas, monospace' }
  ]
};

const THEME_TOKEN_KEYS = ['bg', 'panel', 'surf', 'surft', 'border', 'tx', 'a1', 'a1t', 'a1-text', 'card-accent-text', 'a2', 'a2t', 'a3', 'a3t', 'card', 'cardt'];

const DEFAULT_THEME_PREFS = {
  style: 'brutal',      // 'brutal' | 'dopamine'
  theme: 'cream',       // key into FAMILIES
  mode: 'light',        // 'light' | 'dark'
  corners: 'square',    // 'square' | 'rounded' — independent of style
  fontOverrides: null,  // { display, body, mono } | null
  customPalette: null   // full token diff against the selected family | null
};

// Resolves one family+mode into a flat token map (bg/panel/surf/... plus
// a1/a2/a3 + their text colors, plus card/cardt with the a2 default
// applied), before any user customization is layered on.
function resolveFamilyTokens(themeId, mode) {
  const fam = FAMILIES[themeId] || FAMILIES.cream;
  const neutrals = fam[mode] || fam.light;
  const card = fam.card || fam.a2;
  const cardt = fam.cardt || fam.a2t;
  // a1 used as a *fill* (buttons, badges, done-state dots) always uses
  // the punchy a1 value with a1t drawn on top of it. a1 used as *text*
  // color directly on a light neutral is a different case — in light
  // mode, swap in each family's darker a1TextLight branch instead (see
  // FAMILIES above); in dark mode the plain a1 already reads fine
  // against every family's dark neutrals, so no branch is needed there.
  const a1Text = mode === 'light' ? (fam.a1TextLight || fam.a1) : fam.a1;
  return Object.assign({}, neutrals, {
    a1: fam.a1, a1t: fam.a1t, 'a1-text': a1Text,
    'card-accent-text': fam.cardAccentText || a1Text,
    a2: fam.a2, a2t: fam.a2t,
    a3: fam.a3, a3t: fam.a3t,
    card, cardt
  });
}

function resolveTokens(prefs) {
  const base = resolveFamilyTokens(prefs.theme, prefs.mode);
  if (prefs.customPalette) return Object.assign({}, base, prefs.customPalette);
  return base;
}

function resolveFonts(prefs) {
  return Object.assign({}, DEFAULT_FONTS, prefs.fontOverrides || {});
}

// The single entry point — reads prefs (or takes them, for live preview
// while the theme popover is open), writes every CSS custom property
// onto :root, and flips the data-style/data-corners attributes the
// [data-style]/[data-corners] rules in styles.css/dashboard.css/
// wizard.css key off of. Safe to call repeatedly.
function applyTheme(rawPrefs) {
  const prefs = Object.assign({}, DEFAULT_THEME_PREFS, rawPrefs || (window.Storage && Storage.getThemePrefs()));
  const root = document.documentElement;
  const tokens = resolveTokens(prefs);
  const fonts = resolveFonts(prefs);

  THEME_TOKEN_KEYS.forEach(key => {
    if (tokens[key]) root.style.setProperty('--' + key, tokens[key]);
  });
  root.style.setProperty('--f-display', fonts.display);
  root.style.setProperty('--f-body', fonts.body);
  root.style.setProperty('--f-mono', fonts.mono);
  root.style.setProperty('--danger', MODE_DANGER[prefs.mode] || MODE_DANGER.light);

  root.dataset.style = prefs.style;
  root.dataset.theme = prefs.theme;
  root.dataset.mode = prefs.mode;
  root.dataset.corners = prefs.corners || 'square';
  root.style.colorScheme = prefs.mode;

  return prefs;
}

// Called once, very early (see the <head> snippet in index.html /
// wizard.html) so the page never flashes the default theme before the
// stored one applies.
function bootTheme() {
  try { applyTheme(Storage.getThemePrefs()); }
  catch (e) { /* ignore — CSS defaults in :root cover this */ }
}
