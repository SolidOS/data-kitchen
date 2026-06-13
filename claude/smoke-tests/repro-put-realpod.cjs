// Reproduce the main-menu PUT against a COPY of the REAL pod (/tmp/dkroot/dk-pod),
// using the same create-app config the app ships, but with showStackTrace ON so
// the real 500 surfaces. Plain unauthenticated PUT — matches the synthetic owner
// session (dk-owner-session.js: CSS is allow-all behind the gate, no OIDC token).
//
//   node claude/smoke-tests/repro-put-realpod.cjs
const fs = require('node:fs');
const createApp = require('../../pivot/dist/create-app.cjs');

const PORT = 8200;                       // listen here (8000 is the live app)
const BASE = `http://localhost:${PORT}/`; // advertise the SAME origin we listen on (allow-all; .acl not enforced)
const ROOT = '/tmp/dkroot';              // /dk-pod/ -> /tmp/dkroot/dk-pod
const REL = 'dk-pod/dk/data/data-kitchen-main-menu.ttl';
const PUT_URL = `http://localhost:${PORT}/${REL}`;
const VAR = 'urn:solid-server:default:variable:';

async function main() {
  const app = createApp({
    [`${VAR}baseUrl`]: BASE,
    [`${VAR}port`]: PORT,
    [`${VAR}rootFilePath`]: ROOT,
    [`${VAR}loggingLevel`]: 'warn',
    [`${VAR}showStackTrace`]: true,
    [`${VAR}confirmMigration`]: false,
    [`${VAR}seedConfig`]: undefined,
    [`${VAR}socket`]: undefined,
    [`${VAR}workers`]: 1,
  });
  await app.start();
  console.log('pivot up (copy of real pod) on port', PORT, 'baseUrl', BASE);

  // Build the exact body the shell PUTs: live menu + Gmail + Matrix favorites.
  const orig = fs.readFileSync(REL.startsWith('/') ? REL : `${ROOT}/${REL}`, 'utf8');
  const { rdf } = await import('../../node_modules/sol-components/core/rdf.js');
  const { parseMenuItems } = await import('../../node_modules/sol-components/core/menu-rdf.js');
  const { rewriteMenuDocument } = await import('../../node_modules/sol-components/core/menu-serialize.js');
  const docId = BASE + REL;
  const store = rdf.graph();
  rdf.parse(orig, store, docId, 'text/turtle');
  const tabsIri = docId + '#Tabs';
  const items = parseMenuItems(store, rdf.sym(tabsIri));
  items.push({ type: 'link', name: 'Gmail', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', region: 'tab', href: 'https://mail.google.com/mail/u/0/' });
  const body = await rewriteMenuDocument(store, docId, [{ iri: tabsIri, label: 'data-kitchen', orientation: 'horizontal', items }]);

  // First, a plain GET to confirm the resource reads.
  const g = await fetch(PUT_URL);
  console.log(`\nGET  ${PUT_URL} -> ${g.status} ${g.statusText} (${(await g.text()).length} bytes)`);

  const res = await fetch(PUT_URL, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body });
  const text = await res.text().catch(() => '');
  console.log(`\nPUT  ${PUT_URL} -> ${res.status} ${res.statusText}`);
  console.log(text.slice(0, 4000));

  await app.stop?.();
  process.exit(0);
}
main().catch((e) => { console.error('REPRO ERROR', e && (e.stack || e)); process.exit(1); });
