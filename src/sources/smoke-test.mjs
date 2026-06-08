/**
 * src/sources/smoke-test.mjs — node check of the pure source-adapter logic.
 * Run from the repo root:  node src/sources/smoke-test.mjs
 *
 * Covers the no-network pieces: the contract read/write round-trip + ordering,
 * imagesToStore's page offsetting, and reading real SKOS/DCAT collections. The
 * network path (loadCategory) is exercised by the browser e2e, not here.
 */
import assert from 'node:assert';
import { rdf } from 'sol-components/core/rdf.js';
import {
  NS, addImageItem, readImageItems, addCollection, readCollections,
} from 'sol-components/web/utils/contract.js';
import { imagesToStore } from './commons.js';

let n = 0;
const ok = (msg) => { console.log(`  ✓ ${msg}`); n++; };

/* 1 — ImageItem round-trip + position ordering ------------------------------ */
{
  const store = rdf.graph();
  // add out of display order; readImageItems must sort by schema:position
  addImageItem(store, { iri: 'urn:b', thumb: 'https://x/tb', full: 'https://x/fb', position: 1, caption: 'B' });
  addImageItem(store, { iri: 'urn:a', thumb: 'https://x/ta', full: 'https://x/fa', position: 0, caption: 'A',
    width: 300, height: 200, license: 'CC BY', author: 'Jo', detailUrl: 'https://x/A' });
  const items = readImageItems(store);
  assert.equal(items.length, 2, 'two items');
  assert.deepEqual(items.map(i => i.caption), ['A', 'B'], 'sorted by position');
  assert.equal(items[0].width, 300);
  assert.equal(items[0].height, 200);
  assert.equal(items[0].license, 'CC BY');
  assert.equal(items[0].author, 'Jo');
  assert.equal(items[0].detailUrl, 'https://x/A');
  ok('ImageItem write→read round-trips and sorts by position');
}

/* 2 — imagesToStore offsets position across pages --------------------------- */
{
  const page1 = [
    { title: 'one', thumb: 'https://c/t1', full: 'https://c/f1', width: 1, height: 1, descUrl: 'https://c/one', artist: 'a1', license: 'L1' },
    { title: 'two', thumb: 'https://c/t2', full: 'https://c/f2', descUrl: 'https://c/two' },
  ];
  const page2 = [{ title: 'three', thumb: 'https://c/t3', full: 'https://c/f3', descUrl: 'https://c/three' }];

  const s1 = imagesToStore(page1, { startIndex: 0 });
  const s2 = imagesToStore(page2, { startIndex: page1.length });
  const i1 = readImageItems(s1);
  const i2 = readImageItems(s2);
  assert.deepEqual(i1.map(i => i.position), [0, 1], 'page 1 positions');
  assert.deepEqual(i2.map(i => i.position), [2], 'page 2 position offset by page size');
  assert.equal(i1[0].iri, 'https://c/one', 'IRI = Commons File: page (descUrl)');
  assert.equal(i1[0].detailUrl, 'https://c/one', 'detailUrl = descUrl');
  assert.equal(i1[0].caption, 'one');
  assert.equal(i1[0].author, 'a1');
  ok('imagesToStore maps Commons fields and offsets position across pages');
}

/* 3 — read real SKOS/DCAT collections (the file-provider vocab) -------------- */
{
  const ttl = `
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix schema: <http://schema.org/> .
<#img-1> a dcat:Dataset, schema:ImageGallery ;
  dct:title "Graffiti of spray cans" ;
  dcat:landingPage <https://commons.wikimedia.org/wiki/Category:Graffiti_of_spray_cans> ;
  dcat:theme <#Graffiti> .`;
  const store = rdf.graph();
  rdf.parse(ttl, store, 'https://ex/images.ttl', 'text/turtle');
  const colls = readCollections(store);
  assert.equal(colls.length, 1, 'one collection');
  assert.equal(colls[0].title, 'Graffiti of spray cans');
  assert.equal(colls[0].landingPage, 'https://commons.wikimedia.org/wiki/Category:Graffiti_of_spray_cans');
  assert.equal(colls[0].theme, 'https://ex/images.ttl#Graffiti');
  ok('readCollections reads dct:title / dcat:landingPage / dcat:theme from real TTL');

  // and addCollection is the inverse
  const out = rdf.graph();
  addCollection(out, colls[0]);
  const back = readCollections(out)[0];
  assert.equal(back.title, colls[0].title);
  assert.equal(back.landingPage, colls[0].landingPage);
  assert.equal(back.theme, colls[0].theme);
  ok('addCollection ↔ readCollections round-trips');
}

console.log(`\n${n} smoke checks passed`);
