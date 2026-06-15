// Repro for the "save failed PUT main-menu.ttl -> 500" report after adding the
// favorites (Gmail, Maps, …) as Tab buttons. Builds the SAME Turtle body the
// shell PUTs (parse main-menu -> add a Gmail link to #Tabs -> serialize) and
// validates it with both rdflib and N3 (the parser CSS uses). If the body is
// the problem it surfaces here; if it parses clean the 500 is server-side.
//
//   node claude/smoke-tests/repro-menu-save.mjs
import { readFileSync } from 'node:fs';
import { rdf } from '../../node_modules/sol-components/core/rdf.js';
import { parseMenuItems } from '../../node_modules/sol-components/core/menu-rdf.js';
import { rewriteMenuDocument } from '../../node_modules/sol-components/core/menu-serialize.js';
import N3 from '../../node_modules/n3/lib/index.js';

const docUrl = 'http://localhost:8000/dk-pod/dk/ui-data/data-kitchen-main-menu.ttl';
const ttl = readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8');

const store = rdf.graph();
rdf.parse(ttl, store, docUrl, 'text/turtle');

const tabsIri = docUrl + '#Tabs';
const items = parseMenuItems(store, rdf.sym(tabsIri));
console.log(`#Tabs currently has ${items.length} items`);

// Mirror the drag payload a favorite card produces.
items.push({
  type: 'link',
  name: 'Gmail',
  icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico',
  region: 'tab',
  href: 'https://mail.google.com/mail/u/0/',
});
// And the Matrix one, whose href has the #/# that looked suspicious.
items.push({
  type: 'link',
  name: 'Matrix Chat',
  icon: 'https://app.cinny.in/assets/favicon-5KspoOBy.ico',
  region: 'tab',
  href: 'https://matrix.to/#/#solid-practitioners:matrix.org',
});

const body = await rewriteMenuDocument(store, docUrl, [{ iri: tabsIri, label: 'data-kitchen', orientation: 'horizontal', items }]);

console.log('\n--- added triples (grep) ---');
for (const line of body.split('\n')) {
  if (/Gmail|Matrix|gmail\.ico|cinny|mail\.google|matrix\.to/.test(line)) console.log(line);
}

let rdflibErr = null, n3Err = null;
try { const s2 = rdf.graph(); rdf.parse(body, s2, docUrl, 'text/turtle'); }
catch (e) { rdflibErr = e.message; }
try { new N3.Parser({ baseIRI: docUrl }).parse(body); }
catch (e) { n3Err = e.message; }

console.log('\n--- re-parse results ---');
console.log('rdflib:', rdflibErr ? 'FAIL ' + rdflibErr : 'ok');
console.log('N3   :', n3Err ? 'FAIL ' + n3Err : 'ok');
console.log('\nbody bytes:', body.length);
