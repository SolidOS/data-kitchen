// Every flat plugins/*.ttl manifest must be a valid unified ui:Plugin entry
// (plugin-manifest-unification, 2026-07-18; single payload 2026-07-19):
// typed ui:Plugin, a REQUIRED schema:additionalType picking the kind, and
// ONE schema:url payload the kind interprets —
//   ui:Link      → the URL to open
//   ui:Component → an ES module whose FILENAME is the element tag
//   ui:Command   → a registry #fragment, hyphen-free (none among the seeds)
// This is the contract tools/seed-plugins-catalog.mjs depends on (it skips
// anything that fails it, so a malformed manifest would vanish from the
// catalog without warning). The full SHACL check runs in menu-shacl.test.mjs;
// these are the fast structural asserts with readable failures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NS, sym, loadGraph, isType } from '../helpers/rdf.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'plugins');
const files = readdirSync(dir).filter((f) => f.endsWith('.ttl'));

const KINDS = ['Link', 'Component', 'Command'].map((k) => NS.ui + k);
const TAG_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;

test('there are flat plugin manifests to validate', () => {
  assert.ok(files.length > 0, 'expected plugins/*.ttl manifests');
});

for (const f of files) {
  test(`plugins/${f}: a ui:Plugin with additionalType and its kind's payload`, () => {
    const base = 'http://dk.invalid/plugins/' + f;
    const store = loadGraph(join(dir, f), base);
    const subj = sym(base);

    assert.ok(isType(store, subj, 'Plugin'), 'must be a ui:Plugin');
    const kinds = store.each(subj, sym(NS.schema + 'additionalType'), null).map((n) => n.value);
    assert.equal(kinds.length, 1, 'exactly one schema:additionalType');
    assert.ok(KINDS.includes(kinds[0]), `unknown kind ${kinds[0]}`);

    const label = store.any(subj, sym(NS.ui + 'label'));
    assert.ok(label && label.value.trim(), 'every entry needs a ui:label');

    // retired payload trio must be GONE (2026-07-19)
    for (const retired of ['name', 'module', 'href']) {
      assert.ok(!store.any(subj, sym(NS.ui + retired)),
        `retired payload predicate ui:${retired} still present`);
    }
    const urls = store.each(subj, sym(NS.schema + 'url'), null);
    assert.equal(urls.length, 1, 'exactly one schema:url payload');
    const url = urls[0].value;

    if (kinds[0] === NS.ui + 'Component') {
      const basename = url.split('/').pop().split('#')[0]
        .replace(/\.js$/i, '').replace(/\.(esm|min)$/i, '');
      assert.ok(TAG_RE.test(basename),
        `Component url filename must BE the element tag (got "${basename}" from ${url})`);
    } else if (kinds[0] === NS.ui + 'Command') {
      const key = url.split('#')[1] || '';
      assert.ok(/^[A-Za-z][A-Za-z0-9]*$/.test(key),
        `Command url needs a hyphen-free #fragment key (got "${url}")`);
    }

    // blurb is the USER-FACING schema:description, never rdfs:comment
    assert.ok(!store.any(subj, sym('http://www.w3.org/2000/01/rdf-schema#comment')),
      'card blurbs are schema:description now — rdfs:comment must not remain');
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
