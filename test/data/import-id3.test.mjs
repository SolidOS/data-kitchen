// The ID3 import RDF builder (plugins/ia-player/import-id3-build.js): the docs
// it authors from scanned-track metadata must (a) group correctly and (b) all
// conform, merged, to the music SHACL shape — the same engine + shape the
// player's own data is validated against (see shacl-shapes.test.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Parser, Store } from 'n3';
import SHACLValidator from 'rdf-validate-shacl';
import { groupReleases, buildLibraryDocs, slugify, fileUrl } from '../../plugins/ia-player/import-id3-build.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MUSIC_SHAPE = join(root, 'plugins/ia-player/music.shacl');

// A representative scan: a 2-track album, a no-album single, and a track with no
// artist / no genre (→ the Unknown Artist / Unsorted fallbacks).
const SCAN = [
  { absPath: '/music/Pixies/Doolittle/01.mp3', title: 'Debaser', artist: 'Pixies', albumArtist: 'Pixies', album: 'Doolittle', trackNo: 1, genre: 'Rock', year: 1989, durationSec: 170, hasPicture: true },
  { absPath: '/music/Pixies/Doolittle/02.mp3', title: 'Tame',    artist: 'Pixies', albumArtist: 'Pixies', album: 'Doolittle', trackNo: 2, genre: 'Rock', year: 1989, durationSec: 135, hasPicture: true },
  { absPath: '/music/loose/mystery loop.mp3',  title: 'Mystery Loop', artist: 'Aphex Twin', albumArtist: null, album: null, trackNo: null, genre: 'Electronic', year: 2001, durationSec: 240, hasPicture: false },
  { absPath: '/music/loose/untagged.mp3',      title: null, artist: null, albumArtist: null, album: null, trackNo: null, genre: null, year: null, durationSec: 60, hasPicture: false },
  { absPath: '/music/bad.mp3', error: 'parse failed' },   // must be skipped
];

function buildAll(scan = SCAN, covers = new Map()) {
  return buildLibraryDocs(groupReleases(scan), { covers });
}

test('groups albums, makes singles, and skips parse failures', () => {
  const g = groupReleases(SCAN);
  // album (1 release of 2 tracks) + 2 singles = 3 releases; bad.mp3 dropped.
  assert.equal(g.releases.length, 3);
  const album = g.releases.find((r) => r.title === 'Doolittle');
  assert.equal(album.tracks.length, 2);
  assert.deepEqual(album.tracks.map((t) => t.trackNo), [1, 2]);
  assert.ok(album.artFromAbsPath, 'album should carry an art source (hasPicture)');
  // the untitled, artist-less single falls back to Unknown Artist
  assert.ok(g.artists.some((a) => a.name === 'Unknown Artist'));
  // missing genre falls back to Unsorted
  assert.ok(g.genres.some((gn) => gn.name === 'Unsorted'));
});

test('mo:item is the file:// URL of the original, segment-encoded', () => {
  const docs = buildAll();
  const single = docs[Object.keys(docs).find((k) => k.startsWith('releases/') && docs[k].includes('Mystery Loop'))];
  assert.match(single, /mo:item <file:\/\/\/music\/loose\/mystery%20loop\.mp3>/);
});

test('foaf:depiction appears only when a cover file is supplied', () => {
  const g = groupReleases(SCAN);
  const album = g.releases.find((r) => r.title === 'Doolittle');
  const withCover = buildLibraryDocs(g, { covers: new Map([[album.slug, { file: `art-${album.slug}.jpg` }]]) });
  assert.match(withCover[`releases/${album.slug}`], /foaf:depiction <\.\/art-.*\.jpg>/);
  const noCover = buildLibraryDocs(g, {});
  assert.doesNotMatch(noCover[`releases/${album.slug}`], /foaf:depiction/);
});

test('the whole authored library conforms to music.shacl', async () => {
  const docs = buildAll(SCAN, new Map());
  // Merge every doc into one graph under a shared base so the cross-document
  // IRIs (release → ../agents.ttl#x, releases.ttl → ./releases/slug#it, …)
  // resolve to the same nodes the shape then validates.
  const LIB = 'http://dk.invalid/lib/';
  const store = new Store();
  for (const [rel, body] of Object.entries(docs)) {
    for (const q of new Parser({ baseIRI: LIB + rel }).parse(body)) store.add(q);
  }
  const shapes = new Store(new Parser({ baseIRI: 'http://dk.invalid/shape/' }).parse(readFileSync(MUSIC_SHAPE, 'utf8')));
  const report = await new SHACLValidator(shapes).validate(store);
  const violations = report.results.slice(0, 8).map((r) =>
    `${(r.focusNode?.value || '').split(/[#/]/).pop()} ${(r.path?.value || '').split(/[#/]/).pop()} ` +
    `${r.message.map((m) => m.value).join('; ') || r.sourceConstraintComponent?.value?.split('#').pop()}`).join('\n   ');
  assert.ok(report.conforms, `authored library should conform, violations:\n   ${violations}`);
});

test('slugify and fileUrl basics', () => {
  assert.equal(slugify('Café Tacvba!'), 'cafe_tacvba');
  assert.equal(fileUrl('/a b/c#d.mp3'), 'file:///a%20b/c%23d.mp3');
});
