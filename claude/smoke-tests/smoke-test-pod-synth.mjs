// Guards the DCAT spine that installOnPod synthesises for a pod
// install (index.ttl / releases.ttl / playlists.ttl). Mirrors the
// template strings in ia3.js installOnPod — keep in sync. Asserts the
// Turtle is well-formed AND the recursive-DCAT shape matches the dev
// library (so the pod loads via the same lazy/.meta-proven path):
//   index.ttl#it a dcat:Catalog
//     dcat:catalog → releases.ttl#it , playlists.ttl#it
//     dcat:dataset → agents.ttl#it
//     dcat:themeTaxonomy → genres.ttl#Music
//   releases.ttl#it a dcat:Catalog ; dcat:dataset → <release#it>
//   playlists.ttl#it a dcat:Catalog ; dcat:dataset → <playlist>

import rdflib from 'rdflib';
const { graph, parse, sym, Namespace } = rdflib;
const DCAT = Namespace('http://www.w3.org/ns/dcat#');
const RDF  = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

const podLibBase = 'https://pod.example/omp/libraries/internet_archive_music/';
const title = 'Internet Archive Music';
const plSeeAlso  = [`<${podLibBase}playlists/Bonobo>`, `<${podLibBase}playlists/J_Dilla>`];
const relSeeAlso = [`<${podLibBase}releases/bonobo_black_sands_2010>`, `<${podLibBase}releases/donuts>`];
const relDataset = relSeeAlso.map(u => u.replace(/>$/, '#it>'));

// ---- the three templates, byte-identical to ia3.js installOnPod ----
const idx =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<${podLibBase}index.ttl>
    a <${podLibBase}index.ttl#Library>, dcat:Catalog ;
    dct:title ${JSON.stringify(title)} .
<${podLibBase}index.ttl#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(title)} ;
    dcat:catalog <${podLibBase}releases.ttl#it>, <${podLibBase}playlists.ttl#it> ;
    dcat:dataset <${podLibBase}agents.ttl#it> ;
    dcat:themeTaxonomy <${podLibBase}genres.ttl#Music> .
`;
const relIdx =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<${podLibBase}releases.ttl#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(title + ' — releases')}${
  relDataset.length ? ` ;\n    dcat:dataset ${relDataset.join(',\n                 ')}` : ''} .
`;
const plIdx =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<${podLibBase}playlists.ttl#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(title + ' — playlists')}${
  plSeeAlso.length ? ` ;\n    dcat:dataset ${plSeeAlso.join(',\n                 ')}` : ''} .
`;

const store = graph();
const parseOk = (ttl, base, label) => {
  try { parse(ttl, store, base, 'text/turtle'); check(true, `${label} parses as valid Turtle`); }
  catch (e) { check(false, `${label} parse FAILED: ${e.message}`); }
};
parseOk(idx,    podLibBase + 'index.ttl',     'index.ttl');
parseOk(relIdx, podLibBase + 'releases.ttl',  'releases.ttl');
parseOk(plIdx,  podLibBase + 'playlists.ttl', 'playlists.ttl');

const I = sym(podLibBase + 'index.ttl#it');
const has = (s, p, o) => store.holds(s, p, sym(o));
check(store.holds(I, RDF('type'), DCAT('Catalog')), 'index#it a dcat:Catalog');
check(has(I, DCAT('catalog'), podLibBase + 'releases.ttl#it')
   && has(I, DCAT('catalog'), podLibBase + 'playlists.ttl#it'),
   'index#it dcat:catalog → releases.ttl#it + playlists.ttl#it');
check(has(I, DCAT('dataset'), podLibBase + 'agents.ttl#it'),
   'index#it dcat:dataset → agents.ttl#it');
check(has(I, DCAT('themeTaxonomy'), podLibBase + 'genres.ttl#Music'),
   'index#it dcat:themeTaxonomy → genres.ttl#Music');
check(!/rdfs:seeAlso|seeAlso/.test(idx + relIdx + plIdx),
   'NO rdfs:seeAlso emitted (pure DCAT spine)');

const R = sym(podLibBase + 'releases.ttl#it');
check(store.holds(R, RDF('type'), DCAT('Catalog')), 'releases.ttl#it a dcat:Catalog');
check(has(R, DCAT('dataset'), podLibBase + 'releases/donuts#it'),
   'releases.ttl#it dcat:dataset → <release#it> (release node is <#it>)');

const P = sym(podLibBase + 'playlists.ttl#it');
check(store.holds(P, RDF('type'), DCAT('Catalog')), 'playlists.ttl#it a dcat:Catalog');
check(has(P, DCAT('dataset'), podLibBase + 'playlists/Bonobo'),
   'playlists.ttl#it dcat:dataset → <playlist> (playlist node is the doc, no #it)');

// Empty-collection guard: no `dcat:dataset .` syntax error.
const emptyRel =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<${podLibBase}releases.ttl#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(title + ' — releases')}${
  [].length ? ` ;\n    dcat:dataset x` : ''} .
`;
try { parse(emptyRel, graph(), podLibBase + 'releases.ttl', 'text/turtle'); check(true, 'empty dataset list → still valid Turtle'); }
catch (e) { check(false, `empty dataset list FAILED: ${e.message}`); }

console.log();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
