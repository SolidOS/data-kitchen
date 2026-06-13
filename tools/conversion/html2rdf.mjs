#!/usr/bin/env node
/**
 * html2rdf — import an edited shell snapshot back into data/data-kitchen-main-menu.ttl.
 *
 * The reverse of rdf2html.mjs: harvest the snapshot's <sol-tabs> with
 * sol-components core/menu-html.js (the exact inverse of the emitter, so the
 * mappings stay single-sourced) and MERGE the result into data/data-kitchen-main-menu.ttl —
 * updateMenuInStore rebuilds only #Tabs and #Bar, preserving pantry items,
 * #Chrome, and every unrelated statement. Chrome edits in the snapshot are
 * NOT imported (edit data/data-kitchen-main-menu.ttl#Chrome directly).
 *
 *   npm run html2rdf                                # tools/conversion/shell.html
 *   node tools/conversion/html2rdf.mjs [in.html]    # explicit input path
 *
 * core/menu-html.js needs a DOM, so extraction runs in a headless chrome page
 * (the same launch pattern as claude/smoke-tests).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SC = resolve(ROOT, 'node_modules/sol-components/core');
const { rdf } = await import(resolve(SC, 'rdf.js'));
const { rdfVal } = await import(resolve(SC, 'menu-rdf.js'));
const { rewriteMenuDocument } = await import(resolve(SC, 'menu-serialize.js'));

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SRC = resolve(ROOT, args[0] || 'tools/conversion/shell.html');
const TTL = resolve(ROOT, 'data/data-kitchen-main-menu.ttl');
const DOC = 'https://data-kitchen.invalid/data/data-kitchen-main-menu.ttl';

// Run core/menu-html.js's extractFromHtml in a headless page — the module has
// no imports, so it loads straight from a data: URL.
async function extract(html) {
  let chromium;
  try {
    ({ chromium } = await import('/home/jeff/solid/podz/node_modules/playwright-core/index.mjs'));
  } catch {
    console.error('playwright-core not found (expected in ../podz, as the smoke tests use) — needed to give core/menu-html.js a DOM.');
    process.exit(1);
  }
  const menuHtmlSrc = readFileSync(resolve(SC, 'menu-html.js'), 'utf8');
  const modUrl = 'data:text/javascript;base64,' + Buffer.from(menuHtmlSrc).toString('base64');
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

// A menu's own metadata, preserved across the rebuild (same as the app's
// menu builders do).
function menuMeta(store, node) {
  const o = rdfVal(store, node, 'orientation');
  return {
    label: rdfVal(store, node, 'label') || undefined,
    orientation: o ? (o.includes('#') ? o.slice(o.indexOf('#') + 1) : o).toLowerCase() : undefined,
  };
}

const { tabs, bar } = await extract(readFileSync(SRC, 'utf8'));
if (!tabs.length) {
  console.error(`no <sol-tabs> tab anchors found in ${SRC} — nothing imported`);
  process.exit(1);
}

const store = rdf.graph();
rdf.parse(readFileSync(TTL, 'utf8'), store, DOC, 'text/turtle');
const out = await rewriteMenuDocument(store, DOC, [
  { iri: `${DOC}#Tabs`, ...menuMeta(store, rdf.sym(`${DOC}#Tabs`)), items: tabs },
  { iri: `${DOC}#Bar`, ...menuMeta(store, rdf.sym(`${DOC}#Bar`)), items: bar },
]);
writeFileSync(TTL, out);
console.log(`imported ${tabs.length} tabs + ${bar.length} bar items from ${args[0] || 'tools/conversion/shell.html'} into data/data-kitchen-main-menu.ttl`);
console.log('note: the chrome block is not imported — edit data/data-kitchen-main-menu.ttl#Chrome directly.');
