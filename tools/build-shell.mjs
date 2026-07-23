// Regenerate index.html's shell region from ui-data/data-kitchen-shell.ttl —
// the layout source of truth (a ui:Layout the sol-components compiler turns
// into the nav + main + menu-pane markup between the shell:begin/end markers).
//
// The <head>, the skip-link, and the <sol-default> preferences singleton are
// hand-authored shell scaffolding, NOT layout — they live outside the markers
// and are never touched.
//
//   node tools/build-shell.mjs           # rewrite index.html's region in place
//   node tools/build-shell.mjs --check   # exit 1 if index.html is out of date
//
// The `--check` mode backs a drift guard so the RDF stays authoritative: edit
// the TTL and rerun, never hand-edit between the markers.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SC = resolve(ROOT, 'node_modules/sol-components/core');
const { rdf } = await import(resolve(SC, 'rdf.js'));
const { generateLayoutBody } = await import(resolve(SC, 'layout-generate.js'));

const TTL_PATH = resolve(ROOT, 'ui-data/data-kitchen-shell.ttl');
const HTML_PATH = resolve(ROOT, 'index.html');
// A stable base for parsing; the emitted markup carries only the doc-relative
// hrefs the TTL declares, so the base never leaks into index.html.
const DOC = 'https://data-kitchen.invalid/ui-data/data-kitchen-shell.ttl';

const MARKER = /([ \t]*<!-- shell:begin[\s\S]*?-->)\n[\s\S]*?([ \t]*<!-- shell:end -->)/;

// The RDF-derived shell region (2-space indented, matching the markers).
export function renderShellRegion() {
  const store = rdf.graph();
  rdf.parse(readFileSync(TTL_PATH, 'utf8'), store, DOC, 'text/turtle');
  const warnings = [];
  const region = generateLayoutBody({
    store, layoutNode: rdf.sym(`${DOC}#Shell`), baseUrl: DOC, warn: (m) => warnings.push(m),
  }).replace(/^\n+/, '').replace(/\s+$/, '');
  return { region, warnings };
}

// Splice the region between the markers of `html`. Throws if the markers are
// absent (index.html must carry them — added once when the shell was adopted).
export function applyRegion(html, region) {
  if (!MARKER.test(html)) throw new Error('index.html is missing the shell:begin / shell:end markers');
  return html.replace(MARKER, (_m, begin, end) => `${begin}\n${region}\n${end}`);
}

function main() {
  const check = process.argv.includes('--check');
  const { region, warnings } = renderShellRegion();
  for (const w of warnings) console.error(`[build-shell] warning: ${w}`);
  const current = readFileSync(HTML_PATH, 'utf8');
  const next = applyRegion(current, region);
  if (check) {
    if (next !== current) {
      console.error('[build-shell] index.html is OUT OF DATE — run: node tools/build-shell.mjs');
      process.exit(1);
    }
    console.log('[build-shell] index.html shell region is up to date.');
    return;
  }
  if (next === current) { console.log('[build-shell] index.html already current.'); return; }
  writeFileSync(HTML_PATH, next);
  console.log('[build-shell] rewrote index.html shell region from data-kitchen-shell.ttl');
}

if (resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
