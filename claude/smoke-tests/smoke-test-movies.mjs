// Movies library + media-type seam: parse the generated
// internet_archive_movies/ spine and exercise the video read path
// (libraryMediaType + the video vocab profile in parseBookmarks).
// Pure parse (no network) — run: node claude/smoke-tests/smoke-test-movies.mjs

globalThis.window = { location: { href: 'http://localhost:3000/x/' } };

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import rdflib from 'rdflib';
import { parseBookmarks, libraryMediaType } from '../../src/ia-rdf.js';
import { getAlbums, getTracks } from '../../../solid-web-components/sources/internet-archive.js';

const { graph, parse } = rdflib;

let fails = 0;
const check = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' · ' + m); if (!c) fails++; };

const DIR = fileURLToPath(new URL('../../libraries/internet_archive_movies/', import.meta.url));
const BASE = 'http://local/movies/';            // pretend-served base
const baseURI = BASE + 'index.ttl';
const store = graph();
for (const f of ['index.ttl', 'genres.ttl', 'agents.ttl', 'releases.ttl', 'playlists.ttl']) {
  parse(readFileSync(DIR + f, 'utf8'), store, BASE + f, 'text/turtle');
}

// 1) media type resolves from <index#it> dct:type dctype:MovingImage
check(libraryMediaType(store, baseURI) === 'video', 'index declares video (dctype:MovingImage)');

// 2) video-profile parse finds the SKOS film types + schema:Collection rows
const { genres, bookmarks } = parseBookmarks(store, baseURI, 'video');
check(genres.length === 8, `8 film types via themeTaxonomy root (got ${genres.length})`);
check(genres.some(g => g.label === 'Feature Films'), 'film-type labels resolve (Feature Films)');
check(bookmarks.length === 108, `108 collections (got ${bookmarks.length})`);
check(bookmarks.every(b => b.url && /\/details\//.test(b.url)), 'every collection has a /details/ landingPage');
check(bookmarks.every(b => b.topic && /#/.test(b.topic)), 'every collection links a film-type (schema:genre)');
check(bookmarks.some(b => b.label === 'Film Noir'), 'collection names resolve (Film Noir)');

// 3) audio profile must find NONE of them (proves profile isolation)
const audioView = parseBookmarks(store, baseURI, 'audio');
check(audioView.bookmarks.length === 0, `audio profile sees 0 collections here (got ${audioView.bookmarks.length})`);

// 4) adapter media-kind mapping (signatures back-compatible; no network)
check(typeof getAlbums === 'function' && typeof getTracks === 'function', 'adapter exports present');

console.log();
console.log(fails ? `FAILED (${fails})` : 'ALL PASS');
process.exit(fails ? 1 : 0);
