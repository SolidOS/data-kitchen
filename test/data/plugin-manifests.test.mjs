// Every flat plugins/*.ttl manifest must be a valid catalog entry:
// ui:Link (needs ui:href) XOR ui:Component (needs ui:name). This is the
// contract tools/seed-plugins-catalog.mjs depends on (it silently skips
// anything that fails it, so a malformed manifest would vanish from the
// catalog without warning).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf, NS, sym, loadGraph, isType } from '../helpers/rdf.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'plugins');
const files = readdirSync(dir).filter((f) => f.endsWith('.ttl'));

test('there are flat plugin manifests to validate', () => {
  assert.ok(files.length > 0, 'expected plugins/*.ttl manifests');
});

for (const f of files) {
  test(`plugins/${f}: ui:Link XOR ui:Component with its required field`, () => {
    const base = 'http://dk.invalid/plugins/' + f;
    const store = loadGraph(join(dir, f), base);
    const subj = sym(base);
    const link = isType(store, subj, 'Link');
    const comp = isType(store, subj, 'Component');

    assert.ok(link || comp, 'must be a ui:Link or a ui:Component');
    assert.ok(!(link && comp), 'must not be both ui:Link and ui:Component');

    if (link) {
      assert.ok(store.any(subj, sym(NS.ui + 'href')), 'ui:Link needs ui:href');
    }
    if (comp) {
      const name = store.any(subj, sym(NS.ui + 'name'));
      assert.ok(name && name.value.trim(), 'ui:Component needs a non-empty ui:name');
    }
  });
}

test('every ui:attribute blank node carries schema:name and schema:value', () => {
  for (const f of files) {
    const base = 'http://dk.invalid/plugins/' + f;
    const store = loadGraph(join(dir, f), base);
    for (const st of store.statementsMatching(null, sym(NS.ui + 'attribute'), null)) {
      const b = st.object;
      const k = store.any(b, sym(NS.schema + 'name'));
      assert.ok(k && k.value, `${f}: ui:attribute missing schema:name`);
      // schema:value may legitimately be the empty string (boolean attrs like defer);
      // the predicate must still be present.
      assert.ok(store.any(b, sym(NS.schema + 'value')) !== undefined,
        `${f}: ui:attribute "${k && k.value}" missing schema:value`);
    }
  }
});
