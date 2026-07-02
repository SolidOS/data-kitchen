// HTML-escape a string for safe interpolation into an innerHTML template — used by
// the dk renderer's settings/issuer forms. (sol-components has its own escapeHtml
// for its components; this is dk's shared copy for dk's own src/ modules.)
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
