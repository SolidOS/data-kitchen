#!/usr/bin/env node
/**
 * html-to-rdf — generate the UI-config RDF FROM the declarative HTML.
 *
 * The "HTML as the source of truth" step (claude/plans/PLAN-html-src-of-truth.md):
 * index.html authors the tabs / ⋮-menu / settings declaratively, and this
 * derives the equivalent RDF that the `from-rdf` path (index.html) consumes.
 * One-way (HTML → RDF); see bin/rdf-to-html.mjs for the reverse (sync at switch).
 *
 *   node bin/html-to-rdf.mjs [src.html] [outdir]    (defaults: index.html, data/generated)
 *   --verify   diff the output against the hand-authored data/{tabs,menu}.ttl
 *
 * Mappings + parsing/serialising live in bin/lib/html-rdf.mjs.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFromHtml, tabsTtl, menuTtl, settingsTtl, parseTabsTtl, parseMenuTtl, normalize } from './lib/html-rdf.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const VERIFY = process.argv.includes('--verify');
const SRC = resolve(ROOT, args[0] || 'html-first.html');
const OUT = resolve(ROOT, args[1] || 'data/generated');

// Tabs / ⋮-menu are authored in html-first.html; <sol-default> settings live in
// the vanilla shell (index.html). Parse both so settings.ttl still regenerates.
const SHELL = resolve(ROOT, 'index.html');
const shellHtml = (!args[0] && existsSync(SHELL)) ? '\n' + readFileSync(SHELL, 'utf8') : '';
const data = await extractFromHtml(readFileSync(SRC, 'utf8') + shellHtml);
// The ⋮ dropdown is dual-role: an inline <menu> in HTML, but in RDF it's a
// toolbar action that needs its own `source` to the generated menu.ttl so the
// rdf-first page loads it (no switch). Inject a page-relative source.
if (data.menu) {
  const menuUrl = './' + relative(ROOT, resolve(OUT, 'menu.ttl')).split(/[\\/]/).join('/') + '#More';
  const dd = (data.actions || []).find((a) => a.tag === 'sol-dropdown-button');
  if (dd && !dd.attrs.some(([k]) => k === 'source')) dd.attrs.push(['source', menuUrl]);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'tabs.ttl'), tabsTtl(data));
if (data.menu) writeFileSync(resolve(OUT, 'menu.ttl'), menuTtl(data.menu));
if (data.settings) writeFileSync(resolve(OUT, 'settings.ttl'), settingsTtl(data.settings));
console.log(`generated → ${OUT}/{tabs,menu,settings}.ttl  (from ${args[0] || 'html-first.html'})`);
console.log(`  ${data.tabs.length} tabs, ${data.menu?.items.length || 0} menu items`);

if (VERIFY) {
  const cmp = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Menu: full structural equality (name/label/acl:Write) with the hand-authored file.
  const gMenu = normalize({ menu: parseMenuTtl(readFileSync(resolve(OUT, 'menu.ttl'), 'utf8')) }).menu;
  const hMenu = normalize({ menu: parseMenuTtl(readFileSync(resolve(ROOT, 'data/menu.ttl'), 'utf8')) }).menu;
  const menuOk = cmp(gMenu, hMenu);
  console.log(`menu == hand-authored data/menu.ttl: ${menuOk ? '✓' : '✗'}`);
  if (!menuOk) { console.log('  gen :', JSON.stringify(gMenu)); console.log('  hand:', JSON.stringify(hMenu)); }
  // Tabs: compare component subject/name/label (href→source nuance in the hand
  // file means attribute sets differ for Music/Movies — expected).
  const tComps = (ttl) => parseTabsTtl(ttl).tabs.map((t) => ({ local: t.local, name: t.name, label: t.label })).sort((a, b) => a.local.localeCompare(b.local));
  const tabsOk = cmp(tComps(readFileSync(resolve(OUT, 'tabs.ttl'), 'utf8')), tComps(readFileSync(resolve(ROOT, 'data/tabs.ttl'), 'utf8')));
  console.log(`tab components == hand-authored data/tabs.ttl: ${tabsOk ? '✓' : '✗'}`);
  process.exit(menuOk && tabsOk ? 0 : 1);
}
