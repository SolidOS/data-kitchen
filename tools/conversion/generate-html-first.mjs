#!/usr/bin/env node
/**
 * generate-html-first — re-emit html-first.html from data/tabs.ttl.
 *
 * The builders (<sol-menu-builder>/<sol-bar-builder> on the Customize tab)
 * save the RDF; this script turns it back into the declarative shell:
 *
 *   - #Tabs  → the <a> tab anchors (href = source, data-handler = ui:name,
 *              other attributes data-prefixed)
 *   - #Bar   → the actions-row elements (attributes emitted verbatim;
 *              sol-button items get their ui:label as the button text)
 *   - the chrome block (help button, ⋮ menu) is NOT in the RDF — it is
 *     preserved VERBATIM from the existing file, between the
 *     `<!-- chrome:begin -->` … `<!-- chrome:end -->` markers
 *
 *   node tools/conversion/generate-html-first.mjs            # rewrite
 *   node tools/conversion/generate-html-first.mjs --verify   # check only
 *
 * Uses sol-components' own parser (core/menu-rdf.js), so what renders is
 * exactly what's generated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { rdf } = await import(resolve(ROOT, 'node_modules/sol-components/core/rdf.js'));
const { parseMenuItems } = await import(resolve(ROOT, 'node_modules/sol-components/core/menu-rdf.js'));

const VERIFY = process.argv.includes('--verify');
const TTL = resolve(ROOT, 'data/tabs.ttl');
const OUT = resolve(ROOT, 'html-first.html');
const DOC = 'https://data-kitchen.invalid/data/tabs.ttl';   // attr values are literals; base never leaks

const store = rdf.graph();
rdf.parse(readFileSync(TTL, 'utf8'), store, DOC, 'text/turtle');
const tabs = parseMenuItems(store, rdf.sym(`${DOC}#Tabs`));
const bar = parseMenuItems(store, rdf.sym(`${DOC}#Bar`));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const attrPairs = (item) => new Map((item.params || []).map(([k, v]) => [k, v]));

function emitTab(item) {
  if (item.type !== 'component' || !item.tag) {
    console.warn(`  ! skipping unassigned tab item "${item.name}" — drop a plugin on it first`);
    return '';
  }
  const attrs = attrPairs(item);
  const href = attrs.get('source') ?? '#';
  const id = attrs.get('id') ?? '';
  let out = `  <a href="${esc(href)}"${id ? ` id="${esc(id)}"` : ''}\n`;
  out += `     data-handler="${esc(item.tag)}"\n`;
  for (const [k, v] of attrs) {
    if (k === 'source' || k === 'id') continue;
    out += v === '' ? `     data-${k}\n` : `     data-${k}="${esc(v)}"\n`;
  }
  out += `  >${item.name}</a>\n`;
  return out;
}

function emitBarItem(item) {
  if (item.type !== 'component' || !item.tag) {
    console.warn(`  ! skipping unassigned bar item "${item.name}" — drop a plugin on it first`);
    return '';
  }
  const attrs = attrPairs(item);
  let out = `  <${item.tag}`;
  for (const [k, v] of attrs) out += v === '' ? `\n     ${k}` : `\n     ${k}="${esc(v)}"`;
  const text = item.tag === 'sol-button' ? item.name : '';
  out += `\n  >${text}</${item.tag}>\n`;
  return out;
}

// chrome: preserved verbatim from the current file
const current = readFileSync(OUT, 'utf8');
const chromeMatch = current.match(/([ \t]*<!-- chrome:begin[\s\S]*?<!-- chrome:end -->\n)/);
if (!chromeMatch) {
  console.error('html-first.html has no <!-- chrome:begin --> … <!-- chrome:end --> block; refusing to regenerate.');
  process.exit(1);
}

let html = `<sol-tabs id="dk-tabs" keep-alive>\n\n`;
html += tabs.map(emitTab).filter(Boolean).join('\n');
html += `\n  <!-- Actions row. The bar-managed plugins below come from
       data/tabs.ttl#Bar (edited with the bar builder); the chrome block
       (help, ⋮ menu) is fixed shell furniture preserved by the generator. -->\n\n`;
html += bar.map(emitBarItem).filter(Boolean).join('\n');
html += '\n' + chromeMatch[1];
html += `\n</sol-tabs>\n`;

if (VERIFY) {
  const same = html.trim() === current.trim();
  console.log(same ? 'VERIFY OK — html-first.html matches data/tabs.ttl'
                   : 'VERIFY MISMATCH — html-first.html differs from what data/tabs.ttl generates (run without --verify to regenerate)');
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, html);
console.log(`wrote html-first.html (${tabs.length} tabs, ${bar.length} bar items, chrome preserved)`);
