// theme.js
// The theme system: three independent, freely-combining controls —
//   style  : 'brutal'   | 'dopamine'
//   theme  : 'cream'    | 'neon-cobalt' | 'greige' | 'mono'
//   mode   : 'light'    | 'dark'
// = 16 live combinations, all reached by flipping these three switches.
// Every component reads color from the CSS custom properties this file
// writes onto :root — nothing in the CSS ever hardcodes a color. See
// assets/styles.css for the small set of derived (color-mix) variables
// built on top of these, and the [data-style] rules that give each style
// its shape (radius/border/shadow) without new per-component tokens.

// One entry per color theme. Each has a `light` and `dark` half (the
// neutral bg/panel/surf/border/tx set) and a shared accent + font set
// that doesn't change with mode. `card`/`cardt` are optional — omit them
// and the card fill defaults to a2/a2t (see applyTheme below).
const FAMILIES = {
  cream: {
    label: 'Cream',
    fonts: { display: "'Archivo Black', sans-serif", body: "'Work Sans', sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace" },
    a1: '#FFD23F', a1t: '#1C1B17',
    a2: '#7FE0E8', a2t: '#1C1B17',
    a3: '#FF5B49', a3t: '#1C1B17',
    light: { bg: '#EDE3C8', panel: '#E3D5AE', surf: '#FAF6EA', surft: '#1C1B17', border: '#1C1B17', tx: '#1C1B17' },
    dark:  { bg: '#171310', panel: '#221C15', surf: '#2C2419', surft: '#F3EBDA', border: '#F3EBDA', tx: '#F3EBDA' }
  },
  'neon-cobalt': {
    label: 'Neon Cobalt',
    fonts: { display: "'Bungee', sans-serif", body: "'Space Grotesk', sans-serif", mono: "'Space Mono', ui-monospace, monospace" },
    a1: '#C6FF29', a1t: '#0A0A14',
    a2: '#FF2EC4', a2t: '#0A0A14',
    a3: '#22E5FF', a3t: '#0A0A14',
    // card is always cobalt, in both modes and both styles — hot pink
    // (a2) never carries the card, it lives in badges / the dopamine
    // spec bar instead.
    card: '#2A2AF5', cardt: '#F5F5FF',
    light: { bg: '#F0EEFF', panel: '#D6D0FF', surf: '#2A2AF5', surft: '#F5F5FF', border: '#0A0A14', tx: '#0A0A14' },
    dark:  { bg: '#0A0A14', panel: '#14132C', surf: '#2A2AF5', surft: '#F5F5FF', border: '#F5F5FF', tx: '#F5F5FF' }
  },
  greige: {
    label: 'Greige',
    fonts: { display: "'Fraunces', Georgia, serif", body: "'Work Sans', sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace" },
    a1: '#C79B4B', a1t: '#2B2924',
    a2: '#7C8C74', a2t: '#2B2924',
    a3: '#B5654F', a3t: '#F7F1EC', // takes light text, not dark
    light: { bg: '#DAD4C8', panel: '#C9C2B2', surf: '#EFEBE2', surft: '#2B2924', border: '#2B2924', tx: '#2B2924' },
    dark:  { bg: '#211E1A', panel: '#2E2A24', surf: '#3B362E', surft: '#EDE7DC', border: '#EDE7DC', tx: '#EDE7DC' }
  },
  mono: {
    label: 'Mono',
    fonts: { display: "'Sora', sans-serif", body: "'Sora', sans-serif", mono: "'IBM Plex Mono', ui-monospace, monospace" },
    a1: '#C9C4BB', a1t: '#221F1C',
    a2: '#9C968C', a2t: '#221F1C',
    a3: '#4A453E', a3t: '#F3F1EC', // the dark chip — light text
    light: { bg: '#DEDAD3', panel: '#CFCAC1', surf: '#F1EEE9', surft: '#221F1C', border: '#221F1C', tx: '#221F1C' },
    dark:  { bg: '#1C1A17', panel: '#272420', surf: '#322E28', surft: '#EFECE6', border: '#EFECE6', tx: '#EFECE6' }
  }
};

// A single utility accent for destructive actions (delete, danger
// button, error states). It sits outside the 16-combination system on
// purpose — a rare functional color needs to stay legible regardless of
// which of the 4 palettes is active, so it only varies with light/dark,
// never with theme or style.
const MODE_DANGER = { light: '#B7362A', dark: '#E2685A' };

// Small curated list a person can pick for "just the display/body/mono
// font" overrides, independent of their color theme. Built from the same
// four families above (§6) plus a system-default fallback per slot.
const FONT_ALTERNATES = {
  display: [
    { id: 'cream', label: 'Archivo Black (Cream)', value: FAMILIES.cream.fonts.display },
    { id: 'neon-cobalt', label: 'Bungee (Neon Cobalt)', value: FAMILIES['neon-cobalt'].fonts.display },
    { id: 'greige', label: 'Fraunces (Greige)', value: FAMILIES.greige.fonts.display },
    { id: 'mono', label: 'Sora (Mono)', value: FAMILIES.mono.fonts.display },
    { id: 'system', label: 'System default', value: 'system-ui, sans-serif' }
  ],
  body: [
    { id: 'cream', label: 'Work Sans (Cream/Greige)', value: FAMILIES.cream.fonts.body },
    { id: 'neon-cobalt', label: 'Space Grotesk (Neon Cobalt)', value: FAMILIES['neon-cobalt'].fonts.body },
    { id: 'mono', label: 'Sora (Mono)', value: FAMILIES.mono.fonts.body },
    { id: 'system', label: 'System default', value: 'system-ui, sans-serif' }
  ],
  mono: [
    { id: 'cream', label: 'JetBrains Mono (Cream)', value: FAMILIES.cream.fonts.mono },
    { id: 'neon-cobalt', label: 'Space Mono (Neon Cobalt)', value: FAMILIES['neon-cobalt'].fonts.mono },
    { id: 'greige', label: 'IBM Plex Mono (Greige/Mono)', value: FAMILIES.greige.fonts.mono },
    { id: 'system', label: 'System monospace', value: 'ui-monospace, Menlo, Consolas, monospace' }
  ]
};

const THEME_TOKEN_KEYS = ['bg', 'panel', 'surf', 'surft', 'border', 'tx', 'a1', 'a1t', 'a2', 'a2t', 'a3', 'a3t', 'card', 'cardt'];

const DEFAULT_THEME_PREFS = {
  style: 'brutal',      // 'brutal' | 'dopamine'
  theme: 'cream',       // key into FAMILIES
  mode: 'light',        // 'light' | 'dark'
  fontOverrides: null,  // { display, body, mono } | null — independent of theme/customPalette
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
  return Object.assign({}, neutrals, {
    a1: fam.a1, a1t: fam.a1t,
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
  const fam = FAMILIES[prefs.theme] || FAMILIES.cream;
  const base = Object.assign({}, fam.fonts);
  if (prefs.fontOverrides) {
    if (prefs.fontOverrides.display) base.display = prefs.fontOverrides.display;
    if (prefs.fontOverrides.body) base.body = prefs.fontOverrides.body;
    if (prefs.fontOverrides.mono) base.mono = prefs.fontOverrides.mono;
  }
  return base;
}

// The single entry point — reads prefs (or takes them, for live preview
// while the theme editor is open), writes every CSS custom property onto
// :root, and flips the data-style attribute the [data-style] rule pairs
// in styles.css/dashboard.css/wizard.css key off of. Safe to call
// repeatedly.
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
