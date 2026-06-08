// dk-settings-applier applies the UI settings to the live page (data-theme on
// <html>, --font-size CSS variable). It reads the RESOLVED values straight off
// <sol-default> — which loads them from its `source` RDF and exposes them as
// attributes (ui:colorScheme → `color-scheme`, ui:fontSize → `font-size`). So
// there is NO rdflib / store access here: dk imports ZERO swc internals; the
// RDF read lives in the component. Re-applies on `sol-default-change` (the
// component re-resolved), `sol-form-save` (the settings page saved), and
// system-theme change. First-run persistence is handled by sol-settings/sol-form
// on save; until then dk falls back to system/medium.

const UI = 'http://www.w3.org/ns/ui#';
const SCHEME_TO_VALUE = {
  [UI + 'SystemColorScheme']: 'system',
  [UI + 'LightColorScheme']:  'light',
  [UI + 'DarkColorScheme']:   'dark',
};
const FONT_TO_VALUE = {
  [UI + 'SmallFont']:  'small',
  [UI + 'MediumFont']: 'medium',
  [UI + 'LargeFont']:  'large',
};

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.dataset.theme = dark ? 'dark' : 'light';
    html.dataset.themeSource = 'system';
  } else {
    html.dataset.theme = theme;
    html.dataset.themeSource = 'user';
  }
}

function applyFontSize(size) {
  const map = { small: 'var(--small-font, 16px)',
                medium: 'var(--medium-font, 20px)',
                large: 'var(--large-font, 24px)' };
  document.documentElement.style.setProperty('--font-size', map[size] || map.medium);
}

// Cache the resolved theme/font choice in localStorage so the
// before-first-paint inline script in index.html can apply them
// synchronously without waiting for the cross-origin fetch.
function cacheForFastPaint(theme, fontSize) {
  try { localStorage.setItem('data-kitchen-settings', JSON.stringify({ theme, fontSize })); }
  catch (_) {}
}

let currentTheme = 'system';

// Read the resolved settings off <sol-default> (set by the component from its
// `source` RDF) and apply them. Pure DOM — no rdflib.
function readAndApply() {
  const sd = document.querySelector('sol-default');
  const scheme = sd?.getAttribute('color-scheme');
  const font   = sd?.getAttribute('font-size');
  const theme = (scheme && SCHEME_TO_VALUE[scheme]) || 'system';
  const size  = (font && FONT_TO_VALUE[font]) || 'medium';
  currentTheme = theme;
  applyTheme(theme);
  applyFontSize(size);
  cacheForFastPaint(theme, size);
}

readAndApply();
// `sol-default-change` bubbles + is composed, so it reaches document.
document.addEventListener('sol-default-change', readAndApply);
document.addEventListener('sol-form-save', readAndApply);

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (currentTheme === 'system') applyTheme('system');
        });
}
