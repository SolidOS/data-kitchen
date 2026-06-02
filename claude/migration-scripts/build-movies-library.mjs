// build-movies-library.mjs — generate libraries/internet_archive_movies/
// from a linked-bookmarks movies.ttl (bk:Topic + bk:BookMark).
//
// Maps:
//   bk:Topic (subTopicOf :Movies)  -> skos:Concept (film type) in genres.ttl
//   bk:BookMark (hasTopic, recalls -> schema:Collection in agents.ttl
//     a /details/<id> URL)            (schema:name, dcat:landingPage, schema:genre)
//
// Emits the standard DCAT spine (index/genres/agents/releases/playlists),
// parallel to internet_archive_music/, with the catalog declared
// `dct:type dctype:MovingImage` (the media-type seam) and the genre
// scheme named #FilmTypes (resolved by the app via dcat:themeTaxonomy).
//
// Run from project root:
//   node claude/migration-scripts/build-movies-library.mjs [path/to/movies.ttl] [--apply]
// Without --apply it does a dry run (prints a summary, writes nothing).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import rdflib from 'rdflib';

const { graph, parse, sym, Namespace } = rdflib;

const BK   = Namespace('http://www.w3.org/2002/01/bookmark#');
const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
const RDFS = Namespace('http://www.w3.org/2000/01/rdf-schema#');

const SRC_DEFAULT = '/home/jeff/solid-more/MyOldApps/linked-bookmarks/data/movies.ttl';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const srcPath = args.find(a => !a.startsWith('--')) || SRC_DEFAULT;

const OUT_DIR = fileURLToPath(new URL('../../libraries/internet_archive_movies/', import.meta.url));
const BASE = 'http://local/movies.ttl';   // parse base; ':' prefix is <#>

const TITLE = 'Internet Archive Movies';

// ---- parse source ----------------------------------------------------
const store = graph();
parse(readFileSync(srcPath, 'utf8'), store, BASE, 'text/turtle');

const localName = (uri) => uri.split('#').pop();
const ttlStr = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// Film types = bk:Topic with bk:subTopicOf :Movies (the root topic).
const moviesRoot = sym(`${BASE}#Movies`);
const filmTypes = store.match(null, BK('subTopicOf'), moviesRoot).map(st => ({
  frag: localName(st.subject.value),
  label: store.any(st.subject, RDFS('label'))?.value || localName(st.subject.value),
}));
const knownFrags = new Set(filmTypes.map(t => t.frag));

// Collections = bk:BookMark nodes.
const collections = [];
for (const st of store.match(null, RDF('type'), BK('BookMark'))) {
  const node = st.subject;
  const topic = store.any(node, BK('hasTopic'));
  const recalls = store.any(node, BK('recalls'));
  const label = store.any(node, RDFS('label'))?.value;
  if (!topic || !recalls || !label) continue;
  const frag = localName(topic.value);
  if (!knownFrags.has(frag)) continue;            // skip orphan topics
  collections.push({ name: label, url: recalls.value, genreFrag: frag, uuid: randomUUID() });
}

// ---- emit files ------------------------------------------------------
const files = {};

files['index.ttl'] =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
@prefix dctype: <http://purl.org/dc/dcmitype/>.

<>
    a <#Library>, dcat:Catalog ;
    dct:title ${ttlStr(TITLE)} .

<#it>
    a dcat:Catalog ;
    dct:title ${ttlStr(TITLE)} ;
    dct:type dctype:MovingImage ;
    dcat:catalog <./releases.ttl#it>, <./playlists.ttl#it> ;
    dcat:dataset <./agents.ttl#it> ;
    dcat:themeTaxonomy <./genres.ttl#FilmTypes> .
`;

files['genres.ttl'] =
`@prefix : <./genres.ttl#>.
@prefix skos: <http://www.w3.org/2004/02/skos/core#>.

<#FilmTypes> a skos:ConceptScheme; skos:prefLabel "Film Types".
` + filmTypes.map(t =>
`<#${t.frag}> a skos:Concept; skos:prefLabel ${ttlStr(t.label)}; skos:topConceptOf <#FilmTypes>.`
).join('\n') + '\n';

files['agents.ttl'] =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
@prefix schema: <http://schema.org/>.
@prefix genres: <./genres.ttl#>.

<#it> a dcat:Dataset; dct:title "Collections".
` + collections.map(c =>
`<urn:uuid:${c.uuid}> a schema:Collection;
    schema:name ${ttlStr(c.name)};
    dcat:landingPage <${c.url}>;
    schema:genre genres:${c.genreFrag}.`
).join('\n') + '\n';

files['releases.ttl'] =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.

<#it> a dcat:Catalog; dct:title ${ttlStr(TITLE + ' — releases')}.
`;

files['playlists.ttl'] =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.

<#it> a dcat:Catalog; dct:title ${ttlStr(TITLE + ' — playlists')}.
`;

// ---- report / write --------------------------------------------------
console.log(`source: ${srcPath}`);
console.log(`film types: ${filmTypes.length}`);
for (const t of filmTypes) console.log(`  - ${t.frag}  "${t.label}"`);
console.log(`collections: ${collections.length}`);
const byGenre = {};
for (const c of collections) byGenre[c.genreFrag] = (byGenre[c.genreFrag] || 0) + 1;
for (const [g, n] of Object.entries(byGenre)) console.log(`  - ${g}: ${n}`);

if (!apply) {
  console.log('\n(dry run — pass --apply to write to ' + OUT_DIR + ')');
  process.exit(0);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
for (const [name, body] of Object.entries(files)) {
  writeFileSync(new URL(name, 'file://' + OUT_DIR), body);
  console.log('wrote ' + name + ' (' + body.length + ' bytes)');
}
console.log('\ndone: ' + OUT_DIR);
