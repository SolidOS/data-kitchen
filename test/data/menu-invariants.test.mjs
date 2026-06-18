// Structural invariants of the RDF-first shell (ui-data/data-kitchen-main-menu.ttl).
// The shell renders from this file at runtime; these are the contracts
// src/dk-tabs-rdf.js and sol-components' menu builders assume.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf, NS, sym, loadGraph, isType } from '../helpers/rdf.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC = 'https://data-kitchen.invalid/ui-data/data-kitchen-main-menu.ttl';
const store = loadGraph(join(root, 'ui-data/data-kitchen-main-menu.ttl'), DOC);
const M = (frag) => sym(DOC + '#' + frag);

for (const frag of ['Tabs', 'Bar', 'Chrome']) {
  test(`#${frag} is a ui:Menu`, () => {
    assert.ok(isType(store, M(frag), 'Menu'), `#${frag} must be a ui:Menu`);
    assert.ok(store.any(M(frag), sym(NS.ui + 'parts')), `#${frag} must have ui:parts`);
  });
}

test('#Bar is horizontally oriented', () => {
  assert.equal(
    store.any(M('Bar'), sym(NS.ui + 'orientation'))?.value,
    NS.ui + 'Horizontal',
  );
});

test('#Chrome carries the self-healing chrome items', () => {
  // src/dk-tabs-rdf.js#healChrome re-inserts these if absent; they must exist in
  // the shipped menu so a fresh load renders help / hamburger / login.
  for (const item of ['chrome-help', 'chrome-menu', 'chrome-login']) {
    assert.ok(isType(store, M(item), 'Component'), `#${item} should be a ui:Component`);
  }
});

test('every ui:Link in the menu has ui:href', () => {
  const offenders = store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Link'))
    .map((st) => st.subject)
    .filter((s) => !store.any(s, sym(NS.ui + 'href')))
    .map((s) => s.value.split('#').pop());
  assert.deepEqual(offenders, [], `ui:Link without ui:href: ${offenders.join(', ')}`);
});

test('every ui:Component in the menu has a non-empty ui:name', () => {
  const offenders = store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Component'))
    .map((st) => st.subject)
    .filter((s) => !store.any(s, sym(NS.ui + 'name'))?.value?.trim())
    .map((s) => s.value.split('#').pop());
  assert.deepEqual(offenders, [], `ui:Component without ui:name: ${offenders.join(', ')}`);
});

test('every ui:attribute node has schema:name and schema:value', () => {
  for (const st of store.statementsMatching(null, sym(NS.ui + 'attribute'), null)) {
    const b = st.object;
    const owner = st.subject.value.split('#').pop();
    const k = store.any(b, sym(NS.schema + 'name'));
    assert.ok(k && k.value, `${owner}: ui:attribute missing schema:name`);
    assert.ok(store.any(b, sym(NS.schema + 'value')) !== undefined,
      `${owner}: ui:attribute "${k && k.value}" missing schema:value`);
  }
});
