// Build the plugin work list the icon probes consume. Parses every flat
// plugins/*.ttl manifest (same rdflib read as tools/seed-plugins-catalog.mjs)
// into {file,kind,label,tag,href,icon,region} and writes it as JSON so the
// CJS electron probe and the ESM playwright probe can both read it.
//
//   node claude/smoke-tests/build-plugin-list.mjs

import { writeFileSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rdf } from '../../node_modules/sol-components/core/rdf.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UI_NS = 'http://www.w3.org/ns/ui#';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

function readEntries() {
  const dir = join(root, 'plugins');
  const entries = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith('.ttl')) continue;
    const path = join(dir, f);
    if (!statSync(path).isFile()) continue;
    const base = 'http://dk.invalid/plugins/' + f;
    const store = rdf.graph();
    try { rdf.parse(readFileSync(path, 'utf8'), store, base, 'text/turtle'); }
    catch (e) { console.warn(`skip ${f}: ${e.message}`); continue; }
    const subj = rdf.sym(base);
    const has = (t) => store.statementsMatching(subj, rdf.sym(RDF_NS + 'type'), rdf.sym(UI_NS + t)).length > 0;
    const ui = (l) => { const n = store.any(subj, rdf.sym(UI_NS + l)); return n ? n.value : ''; };
    const iconNode = store.any(subj, rdf.sym(UI_NS + 'icon'));
    const isLink = has('Link');
    const isComponent = has('Component');
    if (!isLink && !isComponent) continue;
    entries.push({
      file: f,
      kind: isLink ? 'link' : 'component',
      label: ui('label') || f.replace(/\.ttl$/, ''),
      tag: ui('name'),
      href: ui('href'),
      icon: iconNode ? iconNode.value : '',
      // termType NamedNode => the icon was a <URL>; Literal => emoji/string
      iconIsUrl: iconNode ? iconNode.termType === 'NamedNode' : false,
      region: (ui('region') || '').split('#').pop(),
    });
  }
  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
}

const entries = readEntries();
const outDir = join(root, 'claude', 'validation');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'plugin-list.json'), JSON.stringify(entries, null, 2));
const links = entries.filter((e) => e.kind === 'link').length;
console.log(`wrote claude/validation/plugin-list.json: ${entries.length} entries (${links} link apps, ${entries.length - links} components)`);
