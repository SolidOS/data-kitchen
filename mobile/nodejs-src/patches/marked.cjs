'use strict';

// Stub of `marked` for nodejs-mobile, which is built WITHOUT ICU
// (v8_enable_i18n_support=0). The real marked@9 uses Unicode property-escape
// regexes (/[\p{L}\p{N}]/u) that throw "Invalid property name in character
// class" on a no-ICU V8, crashing CSS at load (its MarkdownToHtmlConverter
// requires marked eagerly).
//
// Markdown->HTML is a negligible feature on a headless pod, so this minimal,
// ASCII-only converter (headings + paragraphs, everything escaped) keeps CSS
// booting. Applied over node_modules/marked/lib/marked.cjs by main.js after the
// dependency tree is extracted. If a full-ICU nodejs-mobile build is adopted,
// drop this patch.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function marked(md) {
  return String(md == null ? '' : md)
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (h) {
        const n = h[1].length;
        return '<h' + n + '>' + escapeHtml(h[2]) + '</h' + n + '>';
      }
      return '<p>' + escapeHtml(trimmed) + '</p>';
    })
    .filter(Boolean)
    .join('\n');
}

marked.marked = marked;
marked.parse = marked;
marked.parseInline = marked;
marked.lexer = (md) => [{ type: 'text', raw: String(md), text: String(md) }];
marked.setOptions = () => marked;
marked.use = () => marked;

module.exports = marked;
module.exports.marked = marked;
module.exports.parse = marked;
