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
