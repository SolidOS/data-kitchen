// The generated catalog (ui-data/data-kitchen-plugins-catalog.ttl) must stay in
// sync with the flat plugins/*.ttl manifests it is seeded from: every valid
// manifest appears exactly once (by its dct:source provenance link), and the
// catalog names no source that doesn't exist on disk. This guards the seeder's
// output contract without re-running the (repo-mutating) seeder.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NS, sym, loadGraph, isType } from '../helpers/rdf.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pluginsDir = join(root, 'plugins');

// The plugin files that the seeder WOULD include (Link+href or Component+name).
const validPlugins = readdirSync(pluginsDir)
  .filter((f) => f.endsWith('.ttl'))
  .filter((f) => {
    const base = 'http://dk.invalid/plugins/' + f;
    const store = loadGraph(join(pluginsDir, f), base);
    const subj = sym(base);
    if (isType(store, subj, 'Link')) return !!store.any(subj, sym(NS.ui + 'href'));
    if (isType(store, subj, 'Component')) return !!store.any(subj, sym(NS.ui + 'name'));
    return false;
  });

const catBase = 'http://dk.invalid/ui-data/data-kitchen-plugins-catalog.ttl';
const catalog = loadGraph(join(root, 'ui-data/data-kitchen-plugins-catalog.ttl'), catBase);
// Catalog entries record their origin manifest as dct:source <../plugins/NAME.ttl>.
const sources = catalog.statementsMatching(null, sym(NS.dct + 'source'), null)
  .map((st) => st.object.value.split('/').pop());

test('every valid plugin manifest appears in the catalog', () => {
  const missing = validPlugins.filter((f) => !sources.includes(f));
  assert.deepEqual(missing, [], `manifests missing from the catalog: ${missing.join(', ')}`);
});

test('every catalog source points at an existing plugin manifest', () => {
  const orphans = sources.filter((s) => !validPlugins.includes(s));
  assert.deepEqual(orphans, [], `catalog sources with no manifest: ${orphans.join(', ')}`);
});

test('catalog lists each source exactly once (no double-listing)', () => {
  const seen = new Map();
  for (const s of sources) seen.set(s, (seen.get(s) || 0) + 1);
  const dupes = [...seen].filter(([, n]) => n > 1).map(([s]) => s);
  assert.deepEqual(dupes, [], `double-listed sources: ${dupes.join(', ')}`);
});
