#!/usr/bin/env node
// Offline check for the Phase-A vocab migration: parse converted
// playlist files + agents.ttl and confirm the new schema.org / oa:
// vocabulary round-trips through ia-rdf.js's parser. Run from the
// project root: node claude/smoke-tests/smoke-test-vocab.mjs

import { readFileSync } from 'node:fs';
import { graph, parse, sym } from 'rdflib';
import { parsePlaylists } from '../../src/ia-rdf.js';

const LIB = 'libraries/internet_archive_music';
const BASE = 'http://omp.local/internet_archive_music/';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('FAIL: ' + msg); } };

const loadPlaylist = (slug) => {
  const g = graph();
  parse(readFileSync(`${LIB}/playlists/${slug}$.ttl`, 'utf8'),
        g, `${BASE}playlists/${slug}`, 'text/turtle');
  return g;
};

// 1 — parsePlaylists finds a converted playlist and reads its fields.
{
  const g = loadPlaylist('A_Tribe_Called_Quest');
  const pls = parsePlaylists(g);
  ok(pls.length === 1, 'A_Tribe: one schema:MusicPlaylist found');
  ok(pls[0]?.name === 'A Tribe Called Quest', 'A_Tribe: title parsed');
  ok(pls[0]?.hidden === true, 'A_Tribe: oa:styleClass "hidden" → hidden');
}
{
  const pls = parsePlaylists(loadPlaylist('Bonobo'));
  ok(pls.length === 1 && pls[0].hidden === false, 'Bonobo: not hidden');
}

// 2 — the new structural triples are present; the old omp: ones gone.
{
  const g = loadPlaylist('Autechre');
  const SCHEMA = (t) => sym('http://schema.org/' + t);
  const RDFt = sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
  const items = g.match(null, SCHEMA('itemListElement'), null);
  ok(items.length === 8, `Autechre: 8 schema:itemListElement (got ${items.length})`);
  const li = items[0].object;
  ok(g.holds(li, RDFt, SCHEMA('ListItem')), 'Autechre: list item typed schema:ListItem');
  ok(!!g.any(li, SCHEMA('position')), 'Autechre: schema:position present');
  ok(!!g.any(li, SCHEMA('item')), 'Autechre: schema:item present');
  const ord = g.any(g.any(null, RDFt, SCHEMA('MusicPlaylist')), SCHEMA('itemListOrder'));
  ok(ord?.value === 'http://schema.org/ItemListOrderAscending', 'Autechre: itemListOrder ascending');
  ok(g.statements.every(s => !s.predicate.value.includes('open-media-player.org')),
     'Autechre: no omp: predicates remain');
}

// 3 — agents.ttl: dct:source present, omp: gone.
{
  const g = graph();
  parse(readFileSync(`${LIB}/agents.ttl`, 'utf8'), g, `${BASE}agents.ttl`, 'text/turtle');
  const src = g.match(null, sym('http://purl.org/dc/terms/source'), null);
  ok(src.length === 39, `agents.ttl: 39 dct:source links (got ${src.length})`);
  ok(g.statements.every(s => !s.predicate.value.includes('open-media-player.org')),
     'agents.ttl: no omp: predicates remain');
}

// 4 — releases: tracks link their file via mo:item, no dcat:downloadUrl.
{
  const { readdirSync } = await import('node:fs');
  const relDir = `${LIB}/releases`;
  const relFile = readdirSync(relDir).find(n =>
    n.endsWith('.ttl') && !n.startsWith('#') && !n.endsWith('~') && !n.includes('.pre-'));
  const g = graph();
  parse(readFileSync(`${relDir}/${relFile}`, 'utf8'), g, `${BASE}releases/x`, 'text/turtle');
  const MO = (t) => sym('http://purl.org/ontology/mo/' + t);
  const tracks = g.match(null, sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), MO('Track'));
  ok(tracks.length > 0, `release ${relFile}: has mo:Track nodes (${tracks.length})`);
  ok(g.match(null, MO('item'), null).length === tracks.length,
     `release ${relFile}: every track has mo:item`);
  ok(g.match(null, sym('http://www.w3.org/ns/dcat#downloadUrl'), null).length === 0,
     `release ${relFile}: no dcat:downloadUrl remains`);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
