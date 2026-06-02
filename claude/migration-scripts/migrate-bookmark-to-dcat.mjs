/**
 * migrate-bookmark-to-dcat.mjs — rewrite omp's bookmark-ontology source
 * lists (feeds.ttl, images.ttl) into the SKOS/DCAT model the new shapes
 * and sol-form editors use. Reproducible; preserves existing local ids;
 * dedupes repeated entries; emits clean, grouped, hand-formatted Turtle.
 *
 *   bk:Topic (root)      → skos:ConceptScheme
 *   bk:Topic (child)     → skos:Concept + skos:topConceptOf root | skos:broader parent
 *   ui:label             → skos:prefLabel
 *   ui:Link              → dcat:Dataset, <itemType> (rss:channel | schema:ImageGallery)
 *   ui:label             → dct:title
 *   bk:recalls           → <urlPred> (dcat:accessURL feeds | dcat:landingPage images)
 *   bk:hasTopic          → dcat:theme
 *   + a dcat:Catalog wrapper (dcat:themeTaxonomy + dcat:dataset) — full DCAT.
 *
 * Run from project root:
 *   node claude/migration-scripts/migrate-bookmark-to-dcat.mjs          # writes
 *   node claude/migration-scripts/migrate-bookmark-to-dcat.mjs --dry    # stdout only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire('/home/jeff/solid/solid-web-components/');
const $rdf = require('rdflib');

const NS = {
  rdf:  'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ui:   'http://www.w3.org/ns/ui#',
  bk:   'http://www.w3.org/2002/01/bookmark#',
};
const BASE = 'https://omp.local/lib.ttl'; // dummy parse base; fragments → #x

const ROOT = '/home/jeff/Dropbox/Web/solid/open_media_player';

const JOBS = [
  {
    input:    `${ROOT}/libraries/news/feeds.ttl`,
    focus:    'Feeds',
    itemType: { pfx: 'rss', iri: 'http://purl.org/rss/1.0/channel' },
    urlPred:  { pfx: 'dcat', local: 'accessURL' },
    // Topics are also taxo:topic (RSS 1.0 taxonomy module) so the feed
    // editor's topic dropdown (sh:class taxo:topic) lists ONLY feed topics,
    // not every skos:Concept in the shared store (music/movie genres).
    conceptTypes: ['skos:Concept', 'taxo:topic'],
    title:    'News feeds',
  },
  {
    input:    `${ROOT}/libraries/wikimedia_images/images.ttl`,
    focus:    'Images',
    itemType: { pfx: 'schema', iri: 'http://schema.org/ImageGallery' },
    urlPred:  { pfx: 'dcat', local: 'landingPage' },
    // schema:DefinedTerm (schema.org's category-term class) so the collection
    // editor's topic dropdown (sh:class schema:DefinedTerm) lists ONLY image
    // topics — not feed topics (taxo:topic) or music genres (mo:Genre) that
    // share the global store. Distinct marker per domain.
    conceptTypes: ['skos:Concept', 'schema:DefinedTerm'],
    title:    'Image collections',
  },
];

const PREFIXES = {
  dct:    'http://purl.org/dc/terms/',
  dcat:   'http://www.w3.org/ns/dcat#',
  skos:   'http://www.w3.org/2004/02/skos/core#',
  rss:    'http://purl.org/rss/1.0/',
  schema: 'http://schema.org/',
  taxo:   'http://purl.org/rss/1.0/modules/taxonomy/',
};

/** Turtle @prefix lines for the prefixes actually used by a job. */
function preambleFor(job) {
  const used = new Set(['dct', 'dcat', 'skos', job.itemType.pfx, job.urlPred.pfx]);
  for (const t of job.conceptTypes) used.add(t.split(':')[0]);
  return [...used]
    .filter(p => PREFIXES[p])
    .map(p => `@prefix ${p}: <${PREFIXES[p]}> .`)
    .join('\n');
}

const esc = s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const frag = uri => uri.startsWith(BASE + '#') ? uri.slice(BASE.length) : uri; // "#x"
const ref  = uri => `<${frag(uri)}>`;

function migrate(job) {
  const store = $rdf.graph();
  $rdf.parse(readFileSync(job.input, 'utf8'), store, BASE, 'text/turtle');
  const sym = u => $rdf.sym(u);
  const val = (s, p) => { const o = store.any(s, sym(p), null); return o ? o.value : ''; };

  // ── topics ────────────────────────────────────────────────────────────
  const rootUri = `${BASE}#${job.focus}`;
  const topics = []; // { uri, label, parent }
  for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.bk + 'Topic'))) {
    const uri = st.subject.value;
    if (topics.some(t => t.uri === uri)) continue;
    topics.push({
      uri,
      label: val(st.subject, NS.ui + 'label') || frag(uri).slice(1),
      parent: (store.any(st.subject, sym(NS.bk + 'subTopicOf'), null) || {}).value || '',
    });
  }
  const known = new Set(topics.map(t => t.uri));

  // ── items (ui:Link), deduped by URL, first-seen order ─────────────────
  const items = [];
  const seenUrl = new Set();
  for (const st of store.statementsMatching(null, sym(NS.rdf + 'type'), sym(NS.ui + 'Link'))) {
    const subj = st.subject;
    const url = val(subj, NS.bk + 'recalls');
    const topic = (store.any(subj, sym(NS.bk + 'hasTopic'), null) || {}).value || '';
    if (!url || !topic || !known.has(topic)) continue;
    if (seenUrl.has(url)) continue;
    seenUrl.add(url);
    items.push({ id: frag(subj.value), label: val(subj, NS.ui + 'label') || url, url, topic });
  }

  // ── emit ──────────────────────────────────────────────────────────────
  const out = [];
  out.push(`# ${job.title} — SKOS/DCAT model (migrated from the bookmark ontology`);
  out.push(`# by claude/migration-scripts/migrate-bookmark-to-dcat.mjs).`);
  out.push(`# Topics are a skos:ConceptScheme; each entry is a dcat:Dataset.`);
  out.push('');
  out.push(`@prefix : <#> .`);
  out.push(preambleFor(job));
  out.push('');

  // Catalog wrapper (full DCAT).
  out.push(`<#catalog>`);
  out.push(`  a dcat:Catalog ;`);
  out.push(`  dct:title ${esc(job.title)} ;`);
  out.push(`  dcat:themeTaxonomy <#${job.focus}> ;`);
  const members = items.map(i => `<${i.id}>`);
  out.push(`  dcat:dataset ${members.join(' , ') || '( )'} .`);
  out.push('');

  // Scheme + concepts.
  const root = topics.find(t => t.uri === rootUri);
  out.push(`# ── topics (skos:ConceptScheme) ──`);
  out.push(`<#${job.focus}> a skos:ConceptScheme ; skos:prefLabel ${esc(root ? root.label : job.focus)} .`);
  out.push('');
  for (const t of topics) {
    if (t.uri === rootUri) continue;
    const rel = (t.parent === rootUri || !known.has(t.parent))
      ? `skos:topConceptOf <#${job.focus}>`
      : `skos:broader ${ref(t.parent)}`;
    out.push(`${ref(t.uri)} a ${job.conceptTypes.join(', ')} ; skos:prefLabel ${esc(t.label)} ; ${rel} .`);
  }
  out.push('');

  // Items grouped by topic, in topic discovery order.
  out.push(`# ── entries (dcat:Dataset) ──`);
  const byTopic = new Map();
  for (const it of items) { (byTopic.get(it.topic) || byTopic.set(it.topic, []).get(it.topic)).push(it); }
  for (const t of topics) {
    const group = byTopic.get(t.uri);
    if (!group || !group.length) continue;
    out.push('');
    out.push(`# ${t.label}`);
    for (const it of group) {
      out.push(`<${it.id}>`);
      out.push(`  a dcat:Dataset, ${job.itemType.pfx}:${job.itemType.iri.replace(/^.*[#/]/, '')} ;`);
      out.push(`  dct:title ${esc(it.label)} ;`);
      out.push(`  ${job.urlPred.pfx}:${job.urlPred.local} <${it.url}> ;`);
      out.push(`  dcat:theme ${ref(it.topic)} .`);
    }
  }
  out.push('');

  const text = out.join('\n');
  const stats = `${topics.length} topics, ${items.length} entries (${seenUrl.size} unique URLs)`;
  return { text, stats };
}

const dry = process.argv.includes('--dry');
for (const job of JOBS) {
  const { text, stats } = migrate(job);
  if (dry) {
    console.log(`\n===== ${job.input} =====\n${text}`);
  } else {
    writeFileSync(job.input, text);
  }
  console.error(`${job.input}: ${stats}`);
}
