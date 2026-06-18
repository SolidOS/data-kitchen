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
const conformingCases = [
  ['news feeds',           'plugins/news/feeds.shacl',                   'plugins/news/feeds.ttl'],
  ['image collections',    'plugins/omp-images/images.shacl',            'plugins/omp-images/libraries/wikimedia_images/images.ttl'],
  ['image libraries',      'plugins/omp-images/image-libraries.shacl',   'plugins/omp-images/libraries/wikimedia_images/images.ttl'],
  ['image topics',         'plugins/omp-images/image-topics.shacl',      'plugins/omp-images/libraries/wikimedia_images/images.ttl'],
];

for (const [label, shape, data] of conformingCases) {
  test(`${label} data conforms to ${shape.split('/').pop()}`, async () => {
    const report = await validate(shape, readFileSync(P(data), 'utf8'));
    assert.ok(report.conforms, `expected conformance, violations:\n   ${summarize(report)}`);
  });
}

// --- the music shape: a richer, cross-referencing model (catalog → release →
//     track → playlist), exercised by the bundled music-example.ttl ---
const MUSIC_SHAPE = 'plugins/ia-player/music.shacl';
const musicExample = readFileSync(P('plugins/ia-player/music-example.ttl'), 'utf8');

test('music-example conforms to music.shacl', async () => {
  const report = await validate(MUSIC_SHAPE, musicExample);
  assert.ok(report.conforms, `expected conformance, violations:\n   ${summarize(report)}`);
});

test('music shape has teeth: a Release without a title is rejected', async () => {
  // Remove the release's required dcterms:title → ReleaseShape must flag it.
  const broken = musicExample.replace(/dcterms:title "Woo Warriors at the Soho" ;\n\s*/, '');
  const report = await validate(MUSIC_SHAPE, broken);
  assert.equal(report.conforms, false, 'a Release missing dcterms:title must NOT conform');
});

test('music shape has teeth: a track rating must be a decimal, not an integer', async () => {
  // TrackShape wants schema:ratingValue as xsd:decimal; an integer must fail.
  // (This is exactly the nit music-example.ttl used to carry.)
  const broken = musicExample.replace('schema:ratingValue 5.0 ;', 'schema:ratingValue 5 ;');
  const report = await validate(MUSIC_SHAPE, broken);
  assert.equal(report.conforms, false, 'an integer ratingValue must NOT conform');
});
