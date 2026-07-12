// The structural invariants of a dk main menu, shared by the base test
// (test/data/menu-invariants.test.mjs) and the per-variant runs
// (test/data/variant-menus.test.mjs). `registerMenuInvariants` registers one
// node:test per invariant against the given main-menu FILE; test names carry
// the label so failures say which variant broke.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rdf, NS, sym, loadGraph, isType } from './rdf.mjs';

export const MENU_DOC = 'https://data-kitchen.invalid/ui-data/data-kitchen-main-menu.ttl';

export function registerMenuInvariants(label, menuPath) {
  const store = loadGraph(menuPath, MENU_DOC);
  const M = (frag) => sym(MENU_DOC + '#' + frag);
  const t = (name, fn) => test(`${label}: ${name}`, fn);

  for (const frag of ['Tabs', 'Bar', 'Chrome']) {
    t(`#${frag} is a ui:Menu`, () => {
      assert.ok(isType(store, M(frag), 'Menu'), `#${frag} must be a ui:Menu`);
      assert.ok(store.any(M(frag), sym(NS.ui + 'parts')), `#${frag} must have ui:parts`);
    });
  }

  t('#Bar is horizontally oriented', () => {
    assert.equal(
      store.any(M('Bar'), sym(NS.ui + 'orientation'))?.value,
      NS.ui + 'Horizontal',
    );
  });

  t('#Chrome carries the self-healing chrome items', () => {
    // src/dk-tabs-rdf.js#healChrome re-inserts these if absent; they must exist in
    // the shipped menu so a fresh load renders help / hamburger. (The chrome
    // sign-in was removed 2026-07-10 — apps carry their own logins.)
    for (const item of ['chrome-help', 'chrome-menu']) {
      assert.ok(isType(store, M(item), 'Component'), `#${item} should be a ui:Component`);
    }
  });

  t('every ui:Link in the menu has ui:href', () => {
    const offenders = store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Link'))
      .map((st) => st.subject)
      .filter((s) => !store.any(s, sym(NS.ui + 'href')))
      .map((s) => s.value.split('#').pop());
    assert.deepEqual(offenders, [], `ui:Link without ui:href: ${offenders.join(', ')}`);
  });

  t('every ui:Component in the menu has a non-empty ui:name', () => {
    const offenders = store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Component'))
      .map((st) => st.subject)
      .filter((s) => !store.any(s, sym(NS.ui + 'name'))?.value?.trim())
      .map((s) => s.value.split('#').pop());
    assert.deepEqual(offenders, [], `ui:Component without ui:name: ${offenders.join(', ')}`);
  });

  t('every ui:attribute node has schema:name and schema:value', () => {
    for (const st of store.statementsMatching(null, sym(NS.ui + 'attribute'), null)) {
      const b = st.object;
      const owner = st.subject.value.split('#').pop();
      const k = store.any(b, sym(NS.schema + 'name'));
      assert.ok(k && k.value, `${owner}: ui:attribute missing schema:name`);
      assert.ok(store.any(b, sym(NS.schema + 'value')) !== undefined,
        `${owner}: ui:attribute "${k && k.value}" missing schema:value`);
    }
  });

  return store;
}

/** Every menu subject REACHABLE from the roots' ui:parts (submenus walked). */
export function reachableParts(store, roots = ['Tabs', 'Bar', 'Chrome']) {
  const M = (frag) => sym(MENU_DOC + '#' + frag);
  const seen = new Set();
  const queue = roots.map((r) => M(r));
  while (queue.length) {
    const node = queue.shift();
    if (seen.has(node.value)) continue;
    seen.add(node.value);
    const parts = store.any(node, sym(NS.ui + 'parts'));
    if (!parts) continue;
    for (const el of parts.elements || []) queue.push(el);
  }
  return [...seen].map((v) => sym(v));
}
