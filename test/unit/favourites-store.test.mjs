// Unit tests for src/shared/omp-favourites-store.js — the per-library
// favourites data layer. The pure builders (favouritesUrl, favouriteTurtle)
// are tested directly; the async I/O (add/remove/list) is driven through a
// stubbed global fetch, which also exercises the RDF round-trip + grouping in
// listFavourites.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  favouritesUrl, favouriteTurtle, addFavourite, removeFavouriteFile, listFavourites,
} from '../../src/shared/omp-favourites-store.js';

const realFetch = globalThis.fetch;
const realDocument = globalThis.document;

beforeEach(() => { globalThis.document = { baseURI: 'http://localhost:3000/' }; });
afterEach(() => { globalThis.fetch = realFetch; globalThis.document = realDocument; });

const LIB = 'http://localhost:3000/lib/index.ttl';
const FOLDER = 'http://localhost:3000/lib/favourites/';

test('favouritesUrl appends favourites/ to the library base', () => {
  assert.equal(favouritesUrl(LIB), FOLDER);
  assert.equal(favouritesUrl('http://localhost:3000/lib/'), FOLDER);
});

test('favouritesUrl requires a base', () => {
  assert.throws(() => favouritesUrl(''), /library base URL is required/);
});

test('favouriteTurtle builds a BookmarkAction referencing the item', () => {
  const ttl = favouriteTurtle({
    item: 'http://archive.org/x', bucket: 'Sound', schemaType: 'AudioObject',
    name: 'Song', contributor: 'alice', link: 'http://archive.org/x/play',
    created: '2024-01-01T00:00:00Z',
  });
  assert.match(ttl, /a schema:BookmarkAction/);
  assert.match(ttl, /dct:references <http:\/\/archive\.org\/x>/);
  assert.match(ttl, /a dctype:Sound, schema:AudioObject/);
  assert.match(ttl, /dct:creator "alice"/);
  // a play/open URL with download:false → landingPage (a page), not downloadURL
  assert.match(ttl, /dcat:landingPage <http:\/\/archive\.org\/x\/play>/);
  assert.doesNotMatch(ttl, /dcat:downloadURL/);
});

test('favouriteTurtle uses dcat:downloadURL for a downloadable file', () => {
  const ttl = favouriteTurtle({
    item: 'i', bucket: 'Sound', schemaType: 'AudioObject', name: 'n',
    contributor: 'a', link: 'http://x/f.mp3', download: true, created: '2024-01-01T00:00:00Z',
  });
  assert.match(ttl, /dcat:downloadURL <http:\/\/x\/f\.mp3>/);
});

test('addFavourite POSTs the turtle and returns the new file URL', async () => {
  let captured;
  globalThis.fetch = async (url, opts) => {
    captured = { url: url.toString(), opts };
    return { ok: true, headers: { get: (h) => (h === 'Location' ? 'newfav' : null) } };
  };
  const out = await addFavourite(
    { item: 'i', bucket: 'Sound', schemaType: 'AudioObject', name: 'n', contributor: 'a', created: '2024-01-01T00:00:00Z' },
    LIB,
  );
  assert.equal(captured.url, FOLDER);
  assert.equal(captured.opts.method, 'POST');
  assert.equal(captured.opts.headers['Content-Type'], 'text/turtle');
  assert.equal(out, FOLDER + 'newfav');
});

test('addFavourite throws on a non-ok response', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403 });
  await assert.rejects(
    () => addFavourite({ item: 'i', bucket: 'Sound', schemaType: 'AudioObject', name: 'n', contributor: 'a' }, LIB),
    /HTTP 403/,
  );
});

test('removeFavouriteFile DELETEs and throws on failure', async () => {
  let method;
  globalThis.fetch = async (_u, opts) => { method = opts.method; return { ok: true }; };
  await removeFavouriteFile(FOLDER + 'a');
  assert.equal(method, 'DELETE');

  globalThis.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(() => removeFavouriteFile(FOLDER + 'a'), /HTTP 401/);
});

test('listFavourites groups stars of the same item and dedupes contributors', async () => {
  const fav = (contributor, created) => favouriteTurtle({
    item: 'http://archive.org/x', bucket: 'Sound', schemaType: 'AudioObject',
    name: 'Song', contributor, link: 'http://archive.org/x/play', created,
  });
  const container = '@prefix ldp: <http://www.w3.org/ns/ldp#>.\n<> ldp:contains <a>, <b>, <c>.';
  const map = {
    [FOLDER]: container,
    [FOLDER + 'a']: fav('alice', '2024-01-01T00:00:00Z'),
    [FOLDER + 'b']: fav('bob', '2024-03-01T00:00:00Z'),
    [FOLDER + 'c']: fav('alice', '2024-02-01T00:00:00Z'),   // alice again → deduped
  };
  globalThis.fetch = async (url) => {
    const key = url.toString();
    return key in map
      ? { ok: true, text: async () => map[key], headers: { get: () => null } }
      : { ok: false, status: 404, text: async () => '' };
  };

  const groups = await listFavourites(LIB);
  assert.equal(groups.length, 1, 'all three stars are for one item');
  const g = groups[0];
  assert.equal(g.item, 'http://archive.org/x');
  assert.equal(g.bucket, 'Sound');
  assert.equal(g.count, 2, 'alice + bob (alice not double-counted)');
  assert.equal(g.created, '2024-03-01T00:00:00Z', 'newest star wins for sort');
});

test('listFavourites returns [] when the folder does not exist yet', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  assert.deepEqual(await listFavourites(LIB), []);
});
