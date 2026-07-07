// Validate dk's menus and plugin docs against the SHARED item shapes in
// sol-components' shapes/menu.shacl (ui:Menu / ui:Link / ui:Component — the
// same shapes palette cards and component-interop manifest entries use).
// Same harness pattern as shacl-shapes.test.mjs: n3 + rdf-validate-shacl.
//
// The shapes come from node_modules/sol-components (the dev symlink here;
// real npm content once sol-components ≥2.7.0 ships shapes/). Skips with a
// warning if the file is absent so a bare checkout stays green.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (rel) => join(root, rel);

const SHAPES_PATH = P('node_modules/sol-components/shapes/menu.shacl');

function parse(text, base = 'http://dk.invalid/') {
  return new Store(new Parser({ baseIRI: base }).parse(text));
}
function summarize(report) {
  return report.results.slice(0, 8).map((r) =>
    `${(r.focusNode?.value || '').split(/[#/]/).pop()} ` +
    `${(r.path?.value || '').split(/[#/]/).pop()} ` +
    `${r.message.map((m) => m.value).join('; ') || r.sourceConstraintComponent?.value?.split('#').pop()}`,
  ).join('\n   ');
}

if (!existsSync(SHAPES_PATH)) {
  console.warn('warn: sol-components shapes/menu.shacl not found — menu SHACL tests skipped');
} else {
  const shapes = parse(readFileSync(SHAPES_PATH, 'utf8'), 'http://dk.invalid/shapes/menu.shacl');
  const validate = async (dataText, base) =>
    new SHACLValidator(shapes).validate(parse(dataText, base));

  const menuDocs = [
    'ui-data/data-kitchen-main-menu.ttl',
    'ui-data/data-kitchen-hamburger-menu.ttl',
    'ui-data/data-kitchen-plugins-catalog.ttl',
  ];
  for (const doc of menuDocs) {
    test(`${doc} conforms to the shared menu shapes`, async () => {
      const report = await validate(readFileSync(P(doc), 'utf8'), `http://dk.invalid/${doc}`);
      assert.ok(report.conforms, `expected conformance, violations:\n   ${summarize(report)}`);
    });
  }

  test('every plugins/*.ttl doc conforms to the shared item shapes', async () => {
    const files = readdirSync(P('plugins')).filter((f) => f.endsWith('.ttl'));
    assert.ok(files.length > 50, `expected the full plugin set, found ${files.length}`);
    const bad = [];
    for (const f of files) {
      // single-subject `<>` docs — each needs its own baseIRI
      const report = await validate(
        readFileSync(P(join('plugins', f)), 'utf8'),
        `http://dk.invalid/plugins/${f}`,
      );
      if (!report.conforms) bad.push(`${f}:\n   ${summarize(report)}`);
    }
    assert.deepEqual(bad, [], `non-conforming plugin docs:\n${bad.join('\n')}`);
  });

  test('a menu member without ui:label fails (menu-context strictness)', async () => {
    const report = await validate(`
@prefix ui: <http://www.w3.org/ns/ui#> .
<#Menu> a ui:Menu ; ui:label "m" ; ui:parts ( <#NoLabel> ) .
<#NoLabel> a ui:Component ; ui:name "sol-thing" .
`);
    assert.equal(report.conforms, false, 'label-less menu member must not conform');
  });
}
