#!/usr/bin/env node
/**
 * rdf-to-html — the reverse of html-to-rdf: regenerate the declarative HTML
 * FROM the UI-config RDF (claude/plans/PLAN-html-src-of-truth.md).
 *
 * The sync run when you flip the source of truth TO HTML-canonical. Emits the
 * <sol-tabs> tab anchors + toolbar action launchers, the ⋮ <menu>, and the
 * <sol-default> settings attributes, in index.html (html-first) authoring style. Per the
 * completeness principle each mode is self-contained, so this covers everything.
 *
 *   node bin/rdf-to-html.mjs [rdfdir] [outdir]   (defaults: data/generated, data/generated)
 *   --verify   round-trip: HTML(html-first) → RDF → HTML → RDF must be stable (lossless)
 *
 * Mappings live in bin/lib/html-rdf.mjs (shared with html-to-rdf).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseTabsTtl, parseMenuTtl, parseSettingsTtl,
  emitTabsHtml, emitMenuHtml, emitSolDefaultAttrs,
  extractFromHtml, tabsTtl, menuTtl, settingsTtl, normalize,
} from './lib/html-rdf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const VERIFY = process.argv.includes('--verify');
const RDFDIR = resolve(ROOT, args[0] || 'data/generated');
const OUT = resolve(ROOT, args[1] || 'data/generated');
const read = (p) => readFileSync(p, 'utf8');

const tabs = parseTabsTtl(read(resolve(RDFDIR, 'tabs.ttl')));
const menu = existsSync(resolve(RDFDIR, 'menu.ttl')) ? parseMenuTtl(read(resolve(RDFDIR, 'menu.ttl'))) : null;
mkdirSync(OUT, { recursive: true });
// tabs.fragment.html includes the toolbar actions; the ⋮ action nests the menu
// inline (dual-role), so menu.fragment.html is mainly for inspection.
writeFileSync(resolve(OUT, 'tabs.fragment.html'), emitTabsHtml({ ...tabs, menu }) + '\n');
if (menu) writeFileSync(resolve(OUT, 'menu.fragment.html'), emitMenuHtml(menu) + '\n');
let settings = null;
if (existsSync(resolve(RDFDIR, 'settings.ttl'))) {
  settings = parseSettingsTtl(read(resolve(RDFDIR, 'settings.ttl')));
  writeFileSync(resolve(OUT, 'soldefault.fragment.html'), emitSolDefaultAttrs(settings) + '\n');
}
console.log(`generated → ${OUT}/{tabs,menu,soldefault}.fragment.html  (from ${args[0] || 'data/generated'}/*.ttl)`);
console.log(`  ${tabs.tabs.length} tab anchors, ${tabs.actions.length} actions, ${menu ? 'menu' : 'no menu'}, ${settings ? 'settings' : 'no settings'}`);

if (VERIFY) {
  // Closed loop on html-first.html: HTML → RDF → HTML → RDF, compare normalised shapes.
  const html0 = read(resolve(ROOT, 'html-first.html')) + '\n' + read(resolve(ROOT, 'index.html'));
  const d0 = await extractFromHtml(html0);                                   // HTML → shape
  const ttl = { tabs: tabsTtl(d0), menu: d0.menu ? menuTtl(d0.menu) : null, settings: d0.settings ? settingsTtl(d0.settings) : null };
  const dRdf = {                                                             // RDF → shape
    ...parseTabsTtl(ttl.tabs),
    menu: ttl.menu ? parseMenuTtl(ttl.menu) : null,
    settings: ttl.settings ? parseSettingsTtl(ttl.settings) : null,
  };
  // tabs + actions + settings via the HTML loop. The ⋮ is dual-role (a toolbar
  // action that ALSO owns the menu via data-from-rdf → menu.ttl); its inline
  // <menu> isn't part of the action's HTML form, so the menu rides separately
  // and is checked at the data level (its own lossless round-trip) below.
  const wrapped = `<!doctype html><title>${dRdf.tabsLabel}</title>`
    + (dRdf.settings ? emitSolDefaultAttrs(dRdf.settings) : '')
    + `<sol-tabs>\n${emitTabsHtml(dRdf)}\n</sol-tabs>`;
  const d2 = await extractFromHtml(wrapped);                                 // HTML → shape
  if (d0.menu) d2.menu = parseMenuTtl(menuTtl(d0.menu));                     // menu: data round-trip
  const ok = JSON.stringify(normalize(d0)) === JSON.stringify(normalize(d2));
  console.log(`round-trip HTML→RDF→HTML→RDF stable (lossless): ${ok ? '✓' : '✗'}`);
  if (!ok) {
    console.log('  start:', JSON.stringify(normalize(d0)));
    console.log('  after:', JSON.stringify(normalize(d2)));
  }
  process.exit(ok ? 0 : 1);
}
