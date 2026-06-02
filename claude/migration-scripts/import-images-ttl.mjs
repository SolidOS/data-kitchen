/**
 * import-images-ttl.mjs — one-shot: normalize linked-bookmarks' images.ttl
 * into the canonical bookmark shape OMP's shared parser groks, writing it as
 * the 4th library.
 *
 * Origin shape:  [ a bk:BookMark; bk:hasTopic :X; rdfs:label "…"; bk:recalls <url> ]
 *                two roots :Art / :More (rdfs:label, no subTopicOf).
 * Output shape:  single :Images root; topics use ui:label; each bookmark is
 *                :img-NNNN a ui:Link; ui:label "…"; bk:recalls <url>; bk:hasTopic :X.
 *
 * Numeric / malformed Commons category URLs (…/Category:<digits>) won't
 * resolve to a real category — they're skipped and listed at the end.
 *
 * Run from project root:  node claude/migration-scripts/import-images-ttl.mjs
 */
import * as $rdf from 'rdflib';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');                       // project root
const SRC  = '/home/jeff/solid-more/MyOldApps/linked-bookmarks/data/images.ttl';
const OUT  = resolve(ROOT, 'libraries/wikimedia_images/images.ttl');

const BK   = 'http://www.w3.org/2002/01/bookmark#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF  = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

const BASE = 'file://' + SRC;   // rdflib needs an absolute base URI
const text = readFileSync(SRC, 'utf8');
const store = $rdf.graph();
$rdf.parse(text, store, BASE, 'text/turtle');

const sym = u => $rdf.sym(u);
const labelOf = node => (store.any(node, sym(RDFS + 'label'), null) || {}).value || '';
const localName = uri => uri.split('#').pop();

// ── topics ──────────────────────────────────────────────────────────────
// Every bk:Topic, split into roots (no subTopicOf) vs. subtopics.
const topicNodes = store.statementsMatching(null, sym(RDF + 'type'), sym(BK + 'Topic'))
  .map(st => st.subject)
  .filter(s => s.termType === 'NamedNode');

// Curated regroupings that diverge from the source file: sub-topic local
// name → the group local name it should live under. Applied on import so a
// re-run reproduces the hand-tuned grouping instead of reverting to source.
const REPARENT = {
  Tarot_Decks: 'Art',
  Tarot_Major_Arcana: 'Art',
  Circus: 'Art',
  Water_Sculpture_Gardens: 'Art',
};

const roots = [];
const subtopics = [];   // { uri, label, parentLocal }
for (const t of topicNodes) {
  const parent = store.any(t, sym(BK + 'subTopicOf'), null);
  if (parent) {
    const local = localName(t.value);
    subtopics.push({ uri: t.value, label: labelOf(t), parentLocal: REPARENT[local] || localName(parent.value) });
  } else roots.push({ uri: t.value, label: labelOf(t) });
}

// ── bookmarks ───────────────────────────────────────────────────────────
const bookmarkNodes = store.statementsMatching(null, sym(RDF + 'type'), sym(BK + 'BookMark'))
  .map(st => st.subject);

const isNumericCategory = url => /\/Category:\d+$/.test(decodeURIComponent(url));

const bookmarks = [];   // { label, url, topicLocal }
const skipped = [];
for (const b of bookmarkNodes) {
  const url = (store.any(b, sym(BK + 'recalls'), null) || {}).value || '';
  const topic = (store.any(b, sym(BK + 'hasTopic'), null) || {}).value || '';
  const label = labelOf(b);
  if (!url || !topic) continue;
  if (isNumericCategory(url)) { skipped.push({ label, url }); continue; }
  bookmarks.push({ label, url, topicLocal: localName(topic) });
}

// ── emit canonical Turtle ────────────────────────────────────────────────
const esc = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const out = [];
out.push('@prefix :    <#> .');
out.push('@prefix ui:  <http://www.w3.org/ns/ui#> .');
out.push('@prefix bk:  <http://www.w3.org/2002/01/bookmark#> .');
out.push('');
out.push('# Normalized from linked-bookmarks/data/images.ttl by');
out.push('# claude/migration-scripts/import-images-ttl.mjs — see PLAN-images-library.md.');
out.push('# Single root :Images so the shared bookmark parser (one #fragment focus) works.');
out.push('');
out.push('<#Images> a bk:Topic; ui:label "Images" .');
out.push('');
for (const r of roots)
  out.push(`<#${localName(r.uri)}> a bk:Topic; ui:label "${esc(r.label)}"; bk:subTopicOf <#Images> .`);
out.push('');
for (const s of subtopics)
  out.push(`<#${localName(s.uri)}> a bk:Topic; ui:label "${esc(s.label)}"; bk:subTopicOf <#${s.parentLocal}> .`);
out.push('');
out.push('# ── collections (each bk:recalls a Wikimedia Commons category) ──');
let n = 0;
for (const b of bookmarks) {
  const id = `img-${String(++n).padStart(4, '0')}`;
  out.push(`<#${id}> a ui:Link; ui:label "${esc(b.label)}"; bk:hasTopic <#${b.topicLocal}>; bk:recalls <${b.url}> .`);
}
out.push('');

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out.join('\n'), 'utf8');

console.log(`Wrote ${OUT}`);
console.log(`  roots:      ${roots.length}  (${roots.map(r => r.label).join(', ')})`);
console.log(`  subtopics:  ${subtopics.length}`);
console.log(`  bookmarks:  ${bookmarks.length}`);
console.log(`  skipped (numeric/malformed Category): ${skipped.length}`);
for (const s of skipped) console.log(`    - ${s.label}  ${s.url}`);
