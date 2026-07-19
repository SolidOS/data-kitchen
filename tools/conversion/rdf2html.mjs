#!/usr/bin/env node
/**
 * rdf2html — emit an editable HTML snapshot of the shell from ui-data/data-kitchen-main-menu.ttl.
 *
 * The shell is rdf-first: ui-data/data-kitchen-main-menu.ttl is the only live artifact (rendered at
 * runtime by the inline <sol-tabs from-rdf> in index.html + src/dk-tabs-rdf.js).
 * This snapshot exists for people who prefer editing the shell as HTML:
 *
 *   npm run rdf2html            # write tools/conversion/shell.html
 *   (edit the snapshot)
 *   npm run html2rdf            # import the edits back into ui-data/data-kitchen-main-menu.ttl
 *
 *   node tools/conversion/rdf2html.mjs [out.html]   # explicit output path
 *   node tools/conversion/rdf2html.mjs --verify     # compare, don't write
 *
 * Emission is sol-components core/menu-generate.js — the same module the
 * harvester (core/menu-html.js, used by html2rdf) inverts, so the two stay
 * round-trip exact. #Tabs → <a> anchors, #Bar → bar elements, #Chrome → the
 * chrome block (read-only in the snapshot; html2rdf does not import it).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SC = resolve(ROOT, 'node_modules/sol-components/core');
const { rdf } = await import(resolve(SC, 'rdf.js'));
const { parseMenuItems } = await import(resolve(SC, 'menu-rdf.js'));
const { generateShell } = await import(resolve(SC, 'menu-generate.js'));

const VERIFY = process.argv.includes('--verify');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const TTL = resolve(ROOT, 'ui-data/data-kitchen-main-menu.ttl');
const OUT = resolve(ROOT, args[0] || 'tools/conversion/shell.html');
const DOC = 'https://data-kitchen.invalid/ui-data/data-kitchen-main-menu.ttl';   // attr values are literals; base never leaks

// The snapshot is standalone — there is no live shell HTML to harvest the
// opening tag / chrome markers from — so supply them as a skeleton; the chrome
// block content is emitted from #Chrome.
const SKELETON = '<sol-tabs id="dk-tabs" keep-alive>\n  <!-- chrome:begin -->\n  <!-- chrome:end -->\n</sol-tabs>\n';

const BANNER = `<!-- Editable HTML snapshot of the dk shell, generated from ui-data/data-kitchen-main-menu.ttl by
     tools/conversion/rdf2html.mjs. NOT loaded by the app (the shell renders
     from the RDF). Edit the tab anchors / bar elements here, then import back
     with: npm run html2rdf. The chrome block below is informational only —
     html2rdf does not import it; edit ui-data/data-kitchen-main-menu.ttl#Chrome directly. -->
`;

const store = rdf.graph();
rdf.parse(readFileSync(TTL, 'utf8'), store, DOC, 'text/turtle');
// the catalog doc: reference-style parts point at its ui:Plugin entries
const CATDOC = DOC.replace(/[^/]+$/, 'data-kitchen-plugins-catalog.ttl');
const CAT_TTL = TTL.replace(/[^/]+$/, 'data-kitchen-plugins-catalog.ttl');
if (existsSync(CAT_TTL)) rdf.parse(readFileSync(CAT_TTL, 'utf8'), store, CATDOC, 'text/turtle');
const tabs = parseMenuItems(store, rdf.sym(`${DOC}#Tabs`));
const bar = parseMenuItems(store, rdf.sym(`${DOC}#Bar`));
const chromeItems = parseMenuItems(store, rdf.sym(`${DOC}#Chrome`));

const { html } = generateShell({
  tabs, bar, chrome: chromeItems, currentHtml: SKELETON, warn: (m) => console.warn('  ! ' + m),
  docUrl: DOC,
});
const text = BANNER + html;

if (VERIFY) {
  if (!existsSync(OUT)) { console.error(`VERIFY: ${OUT} does not exist (run without --verify first)`); process.exit(1); }
  const same = text.trim() === readFileSync(OUT, 'utf8').trim();
  console.log(same ? 'VERIFY OK — snapshot matches ui-data/data-kitchen-main-menu.ttl'
                   : 'VERIFY MISMATCH — snapshot differs from what ui-data/data-kitchen-main-menu.ttl generates');
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, text);
console.log(`wrote ${args[0] || 'tools/conversion/shell.html'} (${tabs.length} tabs, ${bar.length} bar items, ${chromeItems.length} chrome items)`);
