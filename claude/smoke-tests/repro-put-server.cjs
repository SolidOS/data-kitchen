// Boots a throwaway pivot (CSS) on a TEMP root with showStackTrace ON, then
// replays the main-menu PUT to capture the real 500 the app hides
// (run-server.cjs sets showStackTrace:false). Nothing touches the real pod.
//
//   node claude/smoke-tests/repro-put-server.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const createApp = require('../../pivot/dist/create-app.cjs');

const PORT = 8077;
const BASE = `http://localhost:${PORT}/`;
const REL = 'dk-pod/dk/ui-data/data-kitchen-main-menu.ttl';
const URL = BASE + REL;
const VAR = 'urn:solid-server:default:variable:';

async function put(body, note) {
  const res = await fetch(URL, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body });
  const text = await res.text().catch(() => '');
  console.log(`\n[${note}] PUT ${URL} -> ${res.status} ${res.statusText}`);
  if (!res.ok) console.log(text.slice(0, 2000));
  return res.status;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-pivot-'));
  console.log('temp root:', root);
  const app = createApp({
    [`${VAR}baseUrl`]: BASE,
    [`${VAR}port`]: PORT,
    [`${VAR}rootFilePath`]: root,
    [`${VAR}loggingLevel`]: 'error',
    [`${VAR}showStackTrace`]: true,
    [`${VAR}confirmMigration`]: false,
    [`${VAR}seedConfig`]: undefined,
    [`${VAR}socket`]: undefined,
    [`${VAR}workers`]: 1,
  });
  await app.start();
  console.log('pivot up on', BASE);

  // 1) establish the resource with the ORIGINAL repo body
  const orig = fs.readFileSync('ui-data/data-kitchen-main-menu.ttl', 'utf8');
  await put(orig, 'original body');

  // 2) replay the body the smoke test built (original + Gmail + Matrix links)
  const { rdf } = await import('../../node_modules/sol-components/core/rdf.js');
  const { parseMenuItems } = await import('../../node_modules/sol-components/core/menu-rdf.js');
  const { rewriteMenuDocument } = await import('../../node_modules/sol-components/core/menu-serialize.js');
  const store = rdf.graph();
  rdf.parse(orig, store, URL, 'text/turtle');
  const tabsIri = URL + '#Tabs';
  const items = parseMenuItems(store, rdf.sym(tabsIri));
  items.push({ type: 'link', name: 'Gmail', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', region: 'tab', href: 'https://mail.google.com/mail/u/0/' });
  items.push({ type: 'link', name: 'Matrix Chat', icon: 'https://app.cinny.in/assets/favicon-5KspoOBy.ico', region: 'tab', href: 'https://matrix.to/#/#solid-practitioners:matrix.org' });
  const body = await rewriteMenuDocument(store, URL, [{ iri: tabsIri, label: 'data-kitchen', orientation: 'horizontal', items }]);
  await put(body, 'with favorites');

  await app.stop?.();
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(0);
}
main().catch((e) => { console.error('REPRO ERROR', e); process.exit(1); });
