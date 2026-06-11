#!/usr/bin/env node
/**
 * generate-html-first — re-emit html-first.html from data/tabs.ttl.
 *
 * The builders (<sol-menu-builder>/<sol-bar-builder> on the Customize tab)
 * save the RDF; this script turns it back into the declarative shell. The
 * actual emission lives in sol-components core/menu-generate.js (shared with the
 * in-app tabs sync); this is just the node CLI wrapper that does the file I/O:
 *
 *   - #Tabs / #Bar are parsed with core/menu-rdf.js (parseMenuItems)
 *   - core/menu-generate.js renders the shell, preserving the opening
 *     <sol-tabs …> tag and the <!-- chrome:begin --> … <!-- chrome:end -->
 *     block verbatim from the current file
 *
 *   node tools/conversion/generate-html-first.mjs            # rewrite
 *   node tools/conversion/generate-html-first.mjs --verify   # check only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SC = resolve(ROOT, 'node_modules/sol-components/core');
const { rdf } = await import(resolve(SC, 'rdf.js'));
const { parseMenuItems } = await import(resolve(SC, 'menu-rdf.js'));
const { generateShell } = await import(resolve(SC, 'menu-generate.js'));

const VERIFY = process.argv.includes('--verify');
const TTL = resolve(ROOT, 'data/tabs.ttl');
const OUT = resolve(ROOT, 'html-first.html');
const DOC = 'https://data-kitchen.invalid/data/tabs.ttl';   // attr values are literals; base never leaks

const store = rdf.graph();
rdf.parse(readFileSync(TTL, 'utf8'), store, DOC, 'text/turtle');
const tabs = parseMenuItems(store, rdf.sym(`${DOC}#Tabs`));
const bar = parseMenuItems(store, rdf.sym(`${DOC}#Bar`));
const current = readFileSync(OUT, 'utf8');

const { html, chrome } = generateShell({
  tabs, bar, currentHtml: current, warn: (m) => console.warn('  ! ' + m),
});
if (!chrome) {
  console.error('html-first.html lacks a <sol-tabs> opening tag or a <!-- chrome:begin --> … <!-- chrome:end --> block; refusing to regenerate.');
  process.exit(1);
}

if (VERIFY) {
  const same = html.trim() === current.trim();
  console.log(same ? 'VERIFY OK — html-first.html matches data/tabs.ttl'
                   : 'VERIFY MISMATCH — html-first.html differs from what data/tabs.ttl generates (run without --verify to regenerate)');
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, html);
console.log(`wrote html-first.html (${tabs.length} tabs, ${bar.length} bar items, chrome preserved)`);
