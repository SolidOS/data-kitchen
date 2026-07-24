// dk's shell layout (ui-data/data-kitchen-shell.ttl) must conform to
// sol-components' ui.shacl (the layout shapes, plus the menu/plugin shapes its
// ui:Component leaves validate against — one file now). This is what makes the
// shared layout shape actually CONSTRAIN dk — the App-Builder preset layouts are
// unshipped, so dk's shell is the live conformance target.
//
// It enforces, among other things, that every region declares an xhv:role.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (rel) => join(root, rel);
const SHAPES = 'node_modules/sol-components/shapes';

function parse(text, base) {
  return new Store(new Parser({ baseIRI: base }).parse(text));
}
const summarize = (report) => report.results.slice(0, 10).map((r) =>
  `${(r.focusNode?.value || '').split(/[#/]/).pop()} ${(r.path?.value || '').split(/[#/]/).pop()} ` +
  `${r.message.map((m) => m.value).join('; ') || r.sourceConstraintComponent?.value?.split('#').pop()}`,
).join('\n   ');

// ui.shacl holds the layout + menu/plugin shapes (component leaves validate too).
function shapes() {
  const s = new Store();
  const f = 'ui.shacl';
  for (const q of new Parser({ baseIRI: `http://shapes/${f}` })
    .parse(readFileSync(P(`${SHAPES}/${f}`), 'utf8'))) s.add(q);
  return s;
}

test('data-kitchen-shell.ttl conforms to ui.shacl', async () => {
  const data = parse(
    readFileSync(P('ui-data/data-kitchen-shell.ttl'), 'utf8'),
    'https://data-kitchen.invalid/ui-data/data-kitchen-shell.ttl',
  );
  const report = await new SHACLValidator(shapes()).validate(data);
  assert.ok(report.conforms, `shell violated ui.shacl:\n   ${summarize(report)}`);
});

test('the ☰ menu binds to the pane via ui:region shell:MenuPane (menu-side node link, no data-for)', () => {
  const menu = readFileSync(P('ui-data/data-kitchen-hamburger-menu.ttl'), 'utf8');
  // The binding is menu-side and a NODE reference now: #More names the pane
  // region as a resource (shell:MenuPane), not a "#dk-menu-pane" selector string;
  // the renderer derives the DOM id from the target node. The pane no longer
  // claims items with data-for. (ui:region node resolution is covered by
  // sol-components' menu-rdf tests; full menu conformance here would need the
  // plugins catalog loaded, which is a separate doc.)
  assert.match(menu, /:More\b[\s\S]*?ui:region\s+shell:MenuPane/, 'the #More menu must bind to the pane node via ui:region');
  assert.match(menu, /@prefix\s+shell:\s+<data-kitchen-shell\.ttl#>/, 'the shell: prefix must resolve to the shell doc');
  const shell = readFileSync(P('ui-data/data-kitchen-shell.ttl'), 'utf8');
  assert.doesNotMatch(shell, /schema:name\s+"data-for"/, 'the shell pane must not declare a data-for attribute anymore');
});
