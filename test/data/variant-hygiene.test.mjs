// Hygiene contracts for the release variants (pure — no assembly writes):
//   • the WEB demo ships no machine-absolute localhost/127.0.0.1 literal in
//     any ui-data / plugin TTL, and no startup.ttl;
//   • every menu part REACHABLE from the web variant's Tabs/Bar/Chrome whose
//     dct:source names a flat manifest resolves inside the web file set
//     (pantry entries for dropped groups may dangle — they are unreachable);
//   • the mobile variant ships the full plugin set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { NS, sym, loadGraph } from '../helpers/rdf.mjs';
import { MENU_DOC, reachableParts } from '../helpers/menu-invariants.mjs';
import { resolveVariantFiles } from '../../tools/assemble-variant.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MENU_DEST = join('dk-pod', 'dk', 'ui-data', 'data-kitchen-main-menu.ttl');
const web = resolveVariantFiles('web');
const mobile = resolveVariantFiles('mobile');
const base = resolveVariantFiles('base');

test('web: no localhost/127.0.0.1 in shipped ui-data or plugin TTL', () => {
  const offenders = [];
  for (const [dest, src] of web) {
    if (!/\.(ttl|shacl)$/.test(dest)) continue;
    if (!dest.includes(`${sep}ui-data${sep}`) && !dest.includes(`${sep}plugins${sep}`)) continue;
    const body = readFileSync(src, 'utf8');
    if (/localhost|127\.0\.0\.1/.test(body)) offenders.push(dest);
  }
  assert.deepEqual(offenders, [], `machine-absolute literals in: ${offenders.join(', ')}`);
});

test('web: no startup.ttl ships', () => {
  const hit = [...web.keys()].find((d) => d.includes('data-kitchen-startup.ttl'));
  assert.equal(hit, undefined);
});

test('web: every REACHABLE menu part with a manifest source resolves in the set', () => {
  const store = loadGraph(web.get(MENU_DEST), MENU_DOC);
  const missing = [];
  for (const node of reachableParts(store)) {
    const src = store.any(node, sym(NS.dct + 'source'))?.value;
    if (!src || !/\/plugins\/[^/]+\.ttl$/.test(src)) continue;
    const manifest = join('dk-pod', 'dk', 'plugins', src.split('/').pop());
    if (!web.has(manifest)) missing.push(`${node.value.split('#').pop()} → ${src.split('/').pop()}`);
  }
  assert.deepEqual(missing, [], `reachable parts with excluded manifests: ${missing.join(', ')}`);
});

test('mobile: ships the full base plugin set', () => {
  const plugins = (m) => [...m.keys()].filter((d) => /plugins[/\\][^/\\]+\.ttl$/.test(d)).sort();
  assert.deepEqual(plugins(mobile), plugins(base));
});
