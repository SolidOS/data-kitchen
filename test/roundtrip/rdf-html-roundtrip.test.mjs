// Round-trip property for the shell conversion: emitting the menu RDF to HTML
// (rdf2html) and importing it back (html2rdf) must be idempotent on #Tabs and
// #Bar. Both directions go through the SAME sol-components core modules the
// `npm run rdf2html` / `html2rdf` scripts use, so this guards the round-trip
// the scripts promise — entirely in memory, never touching the repo's TTL.
//
// html2rdf's extractor (core/menu-html.js) needs a DOM, so extraction runs in a
// headless chromium page (as the real script does). If chromium can't launch,
// the test SKIPS rather than fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SC = resolve(ROOT, 'node_modules/sol-components/core');
const DOC = 'https://data-kitchen.invalid/ui-data/data-kitchen-main-menu.ttl';
const TTL = resolve(ROOT, 'ui-data/data-kitchen-main-menu.ttl');
const SKELETON = '<sol-tabs id="dk-tabs" keep-alive>\n  <!-- chrome:begin -->\n  <!-- chrome:end -->\n</sol-tabs>\n';

const { rdf } = await import(resolve(SC, 'rdf.js'));
const { parseMenuItems, rdfVal } = await import(resolve(SC, 'menu-rdf.js'));
const { generateShell } = await import(resolve(SC, 'menu-generate.js'));
const { rewriteMenuDocument } = await import(resolve(SC, 'menu-serialize.js'));

const sym = (f) => rdf.sym(`${DOC}#${f}`);
const emit = (store) => generateShell({
  tabs: parseMenuItems(store, sym('Tabs')),
  bar: parseMenuItems(store, sym('Bar')),
  chrome: parseMenuItems(store, sym('Chrome')),
  currentHtml: SKELETON,
  warn: () => {},
}).html;
const parse = (ttl) => { const s = rdf.graph(); rdf.parse(ttl, s, DOC, 'text/turtle'); return s; };
const menuMeta = (store, node) => {
  const o = rdfVal(store, node, 'orientation');
  return {
    label: rdfVal(store, node, 'label') || undefined,
    orientation: o ? (o.includes('#') ? o.slice(o.indexOf('#') + 1) : o).toLowerCase() : undefined,
  };
};

// Probe chromium once; skip the whole test if it isn't usable here.
let chromium, SKIP = false;
try {
  ({ chromium } = await import('playwright-core'));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  await b.close();
} catch (e) {
  SKIP = `chromium unavailable: ${e.message.split('\n')[0]}`;
}

async function extractFromHtmlInPage(html) {
  const src = readFileSync(resolve(SC, 'menu-html.js'), 'utf8');
  const modUrl = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    return await page.evaluate(async ({ modUrl, html }) => {
      const { extractFromHtml } = await import(modUrl);
      return extractFromHtml(html);
    }, { modUrl, html });
  } finally {
    await browser.close();
  }
}

// One full HTML→RDF pass: harvest the snapshot and merge #Tabs/#Bar back into a
// fresh copy of the live doc (exactly what `npm run html2rdf` does), then
// re-emit. Returns the regenerated snapshot.
async function roundtrip(ttl) {
  const html = emit(parse(ttl));
  const { tabs, bar } = await extractFromHtmlInPage(html);
  assert.ok(tabs.length > 0, 'extractor found tab anchors');
  const store = parse(ttl);
  return rewriteMenuDocument(store, DOC, [
    { iri: `${DOC}#Tabs`, ...menuMeta(store, sym('Tabs')), items: tabs },
    { iri: `${DOC}#Bar`, ...menuMeta(store, sym('Bar')), items: bar },
  ]);
}

test('rdf2html → html2rdf → rdf2html round-trips the live menu unchanged', { skip: SKIP }, async () => {
  // The full contract: emit the live menu to HTML, import it back, re-emit — the
  // snapshot must be byte-for-byte identical. This requires every menu node to
  // emit a unique HTML id (a submenu sharing an id with a child would collapse on
  // harvest), so it also guards against id collisions in the shipped menu.
  const ttl0 = readFileSync(TTL, 'utf8');
  const html1 = emit(parse(ttl0));
  const ttl1 = await roundtrip(ttl0);
  const html2 = emit(parse(ttl1));
  assert.equal(html2, html1, 'the shell HTML round-trips unchanged on the first pass');
});
