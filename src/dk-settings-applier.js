// dk-settings-applier applies the UI settings to the live page (data-theme on
// <html>, --font-size CSS variable). It reads the RESOLVED values straight off
// <sol-default> — which loads them from its `source` RDF and exposes them as
// attributes (ui:colorScheme → `color-scheme`, ui:fontSize → `font-size`). So
// there is NO rdflib / store access here: dk imports ZERO swc internals; the
// RDF read lives in the component. Re-applies on `sol-default-change` (the
// component re-resolved), `sol-form-save` (the settings page saved), and
// system-theme change. First-run persistence is handled by sol-settings/sol-form
// on save; until then dk falls back to system/medium. The ☰ Theme / Text size
// toggles ALSO write their choice back to the settings RDF (dk-tabs-shell
// persistAppearance), so the file and the live state stay in agreement.

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
  const s = (size === 'small' || size === 'large') ? size : 'medium';
  // Drive the root rem size the same way the ☰/"A" button does: <html
  // data-fontsize> → ia.css :root[data-fontsize] (and the [data-fontsize]
  // #panel rules). Setting only --font-size below never resized the shell.
  document.documentElement.dataset.fontsize = s;
  const map = { small: 'var(--small-font, 16px)',
                medium: 'var(--medium-font, 20px)',
                large: 'var(--large-font, 24px)' };
  document.documentElement.style.setProperty('--font-size', map[s]);
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
// A form save persists the RDF but <sol-default> still holds the old resolved
// values — re-read its source first (its attribute changes then fire
// sol-default-change → readAndApply). Covers the settings page's open
// preferences form, which no <sol-settings> reload-wires.
document.addEventListener('sol-form-save', () => {
  const sd = document.querySelector('sol-default');
  if (sd && typeof sd.reload === 'function') sd.reload().catch(() => {});
  readAndApply();
  // The Data Kitchen Pod Browser settings form (ui:ignorePattern / ui:editorKeys)
  // saves to sol-pod's own doc; re-apply to any mounted <sol-pod> so a change
  // shows without reopening the pod browser tab.
  document.querySelectorAll('sol-pod').forEach((p) => { try { p.reload?.(); } catch (_) {} });
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (currentTheme === 'system') applyTheme('system');
        });
}
