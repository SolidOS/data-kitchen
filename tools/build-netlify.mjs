// Build the NETLIFY variant — the hosted dk whose users sign in to their own
// remote pods: engine files at the site root exactly as the router serves
// them (/node_modules/sol-components, /dist/dk.bundle.js, /src/, /assets/,
// /plugins/*/dist/, plus node_modules/open-media-player the omp manifest
// names), the netlify-variant seeded content beside them.
//
//   npm run dist:netlify   →  release/netlify/
//
// Deployed with the Netlify CLI (`netlify deploy --prod`; netlify.toml names
// the publish dir and the /proxy Function). Shell-definition writes still
// 405 on the static host; the user's own pod is the writable surface.

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'release', 'netlify');

// Engine trees, pruned like electron-builder's dist (tests/docs/etc stay home).
const PRUNE = new Set(['node_modules', 'tests', 'tests-disabled', 'coverage',
  'docs', 'examples', 'drafts', 'claude', '.git', '.claude']);
const copyPruned = (fromRel, toRel = fromRel) => {
  const from = join(root, fromRel);
  if (!existsSync(from)) { console.warn(`[netlify] missing ${fromRel} — skipped`); return; }
  cpSync(from, join(out, toRel), {
    recursive: true, dereference: true,
    filter: (src) => !PRUNE.has(src.split('/').pop()) && !src.endsWith('.map'),
  });
};

// Seeded content FIRST — the assembler cleans the out dir before writing
// (index.html at root, the rest under dk-pod/dk/); engine copies follow.
execFileSync(process.execPath, [
  '--preserve-symlinks', join(root, 'tools', 'assemble-variant.mjs'), 'netlify', out,
], { stdio: 'inherit' });

copyPruned('node_modules/sol-components');
copyPruned('node_modules/open-media-player/omp.manifest.json');
copyPruned('node_modules/open-media-player/dist');
copyPruned('node_modules/open-media-player/src');
copyPruned('dist/dk.bundle.js');
copyPruned('src');
copyPruned('assets');
for (const p of ['ia-player', 'omp-images']) {
  copyPruned(`plugins/${p}/dist`);
}

// The News entry ships reader="inline" for Electron, where a native view
// paints the article pane; a plain browser has no painter for it, so the
// hosted catalog carries the pop-out reader instead. Same rdflib-not-text
// discipline as the assembler's catalog filter.
await setNewsReaderWindow(
  join(out, 'dk-pod', 'dk', 'ui-data', 'data-kitchen-plugins-catalog.ttl'),
);

async function setNewsReaderWindow(catPath) {
  if (!existsSync(catPath)) return;
  const SC = join(root, 'node_modules', 'sol-components', 'core');
  const { rdf } = await import(join(SC, 'rdf.js'));
  const { serializeMenuDocument } = await import(join(SC, 'menu-serialize.js'));
  const SCHEMA = 'http://schema.org/';
  const DOC = 'https://assemble.invalid/ui-data/data-kitchen-plugins-catalog.ttl';
  const store = rdf.graph();
  rdf.parse(readFileSync(catPath, 'utf8'), store, DOC, 'text/turtle');
  const entry = rdf.sym(DOC + '#News-three-panel-feeds');
  let changed = false;
  for (const pair of store.each(entry, rdf.sym(SCHEMA + 'additionalProperty'), null)) {
    if (store.anyValue(pair, rdf.sym(SCHEMA + 'name')) !== 'reader') continue;
    store.removeMatches(pair, rdf.sym(SCHEMA + 'value'), null);
    // The graph term matters: the serializer emits only the document's graph.
    store.add(pair, rdf.sym(SCHEMA + 'value'), rdf.literal('window'), rdf.sym(DOC));
    changed = true;
  }
  if (!changed) { console.warn('[netlify] News reader param not found — catalog left as assembled'); return; }
  writeFileSync(catPath, await serializeMenuDocument(store, DOC));
  console.log('[netlify] catalog: News reader → window (pop-out)');
}

console.log(`[netlify] release/netlify/ ready — deploy with \`netlify deploy --prod\``);
