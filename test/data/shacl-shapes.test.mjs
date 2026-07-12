// Validate the plugins' bundled sample data against their own SHACL shapes
// (the shapes that drive the rolodex/settings editors). Uses the same engine
// component-interop's tests use: n3 + rdf-validate-shacl.
//
// The shapes only constrain nodes matching their target (sh:targetClass /
// sh:targetSubjectsOf), so extra catalog/scheme triples in the data are ignored.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (rel) => join(root, rel);

function parse(text, base = 'http://dk.invalid/') {
  return new Store(new Parser({ baseIRI: base }).parse(text));
}
async function validate(shapeFile, dataText) {
  const shapes = parse(readFileSync(P(shapeFile), 'utf8'));
  const report = await new SHACLValidator(shapes).validate(parse(dataText));
  return report;
}
function summarize(report) {
  return report.results.slice(0, 8).map((r) =>
    `${(r.focusNode?.value || '').split(/[#/]/).pop()} ` +
    `${(r.path?.value || '').split(/[#/]/).pop()} ` +
    `${r.message.map((m) => m.value).join('; ') || r.sourceConstraintComponent?.value?.split('#').pop()}`,
  ).join('\n   ');
}

// --- bundled sample data that conforms today (regression protection) ---
// The media shapes/data (music, images) moved to the open-media-player
// package, which carries its own tests/shapes.test.mjs for them.
const conformingCases = [
  ['news feeds',           'plugins/news/feeds.shacl',                   'plugins/news/feeds.ttl'],
];

for (const [label, shape, data] of conformingCases) {
  test(`${label} data conforms to ${shape.split('/').pop()}`, async () => {
    const report = await validate(shape, readFileSync(P(data), 'utf8'));
    assert.ok(report.conforms, `expected conformance, violations:\n   ${summarize(report)}`);
  });
}

// --- positioned lists in the settings doc (#Locations, #Issuers) ---
// The Settings-page rolodexes (sc shapes/pod-locations.shacl and
// oidc-issuers.shacl), src/dk-locations-feed.js, and src/dk-issuers-feed.js
// all rely on this contract: every entry is a schema:ListItem with an IRI
// schema:item and a unique integer schema:position (reorder swaps, the
// locations feed's max+1, and the issuer default = position 1 depend on it).

const SCHEMA = 'http://schema.org/';
const settingsTtl = readFileSync(P('ui-data/data-kitchen-settings.ttl'), 'utf8');

const positionedLists = [
  ['pod locations', '#Locations', 'node_modules/sol-components/shapes/pod-locations.shacl'],
  ['sign-in issuers', '#Issuers', 'node_modules/sol-components/shapes/oidc-issuers.shacl'],
];

for (const [label, frag, shape] of positionedLists) {
  test(`${label} conform to ${shape.split('/').pop()}`, async () => {
    const report = await validate(shape, settingsTtl);
    assert.ok(report.conforms, `expected conformance, violations:\n   ${summarize(report)}`);
  });

  test(`${label} list invariants (≥1 entry, unique integer positions)`, () => {
    const store = parse(settingsTtl, 'http://dk.invalid/dk-pod/dk/ui-data/data-kitchen-settings.ttl');
    const list = `http://dk.invalid/dk-pod/dk/ui-data/data-kitchen-settings.ttl${frag}`;
    const entries = store.getObjects(list, `${SCHEMA}itemListElement`, null);
    assert.ok(entries.length >= 1, `the seed must ship at least one ${label.replace(/s$/, '')}`);
    const positions = entries.map((e) => {
      const pos = store.getObjects(e, `${SCHEMA}position`, null);
      assert.equal(pos.length, 1, `${e.value} needs exactly one schema:position`);
      const n = Number(pos[0].value);
      assert.ok(Number.isInteger(n), `${e.value} position must be an integer`);
      const items = store.getObjects(e, `${SCHEMA}item`, null);
      assert.equal(items.length, 1, `${e.value} needs exactly one schema:item`);
      assert.equal(items[0].termType, 'NamedNode', `${e.value} schema:item must be an IRI`);
      return n;
    });
    assert.equal(new Set(positions).size, positions.length, 'positions must be unique');
  });
}
