/**
 * Smoke test: the dual-format (SKOS/DCAT) reading added to swc's
 * feed-fetch.js parses the Option-A omp data model (local item node +
 * dcat:accessURL / dcat:landingPage + dcat:theme) into the same feed /
 * collection records the bookmark form used to.
 *
 * Tests the REAL exported functions (parseSourceList, parseBookmarkTree)
 * with a fetch() stub over inline Turtle fixtures — no browser needed.
 *
 * Run from project root:  node claude/smoke-tests/parse-dcat-sources.mjs
 */
// feed-fetch.js constructs a DOMParser at module load (for the feed-XML
// path we don't exercise here) — stub it before importing.
globalThis.DOMParser = class { parseFromString() { return { documentElement: {}, getElementsByTagName: () => [] }; } };

const FEEDS_TTL = `
@prefix :     <#> .
@prefix dct:  <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix rss:  <http://purl.org/rss/1.0/> .

<#Feeds>   a skos:ConceptScheme ; skos:prefLabel "Feeds" .
<#News>    a skos:Concept ; skos:prefLabel "News" ; skos:topConceptOf <#Feeds> .
<#SciTech> a skos:Concept ; skos:prefLabel "Sci/Tech" ; skos:topConceptOf <#Feeds> .

:opb   a dcat:Dataset, rss:channel ; dct:title "OPB" ;
       dcat:accessURL <https://www.opb.org/rss> ; dcat:theme <#News> .
:verge a dcat:Dataset, rss:channel ; dct:title "The Verge" ;
       dcat:accessURL <https://www.theverge.com/rss/index.xml> ; dcat:theme <#SciTech> .
`;

const IMAGES_TTL = `
@prefix :       <#> .
@prefix dct:    <http://purl.org/dc/terms/> .
@prefix dcat:   <http://www.w3.org/ns/dcat#> .
@prefix skos:   <http://www.w3.org/2004/02/skos/core#> .
@prefix schema: <http://schema.org/> .

<#Images> a skos:ConceptScheme ; skos:prefLabel "Images" .
<#Art>    a skos:Concept ; skos:prefLabel "Art" ; skos:topConceptOf <#Images> .
<#Photographic_Collections> a skos:Concept ;
    skos:prefLabel "Photographic Collections" ; skos:broader <#Art> .

<#chicago> a dcat:Dataset, schema:ImageGallery ;
    dct:title "Photographs in the Art Institute of Chicago" ;
    dcat:landingPage <https://commons.wikimedia.org/wiki/Category:Photographs_in_the_Art_Institute_of_Chicago> ;
    dcat:theme <#Photographic_Collections> .
`;

// Legacy bookmark form — must still parse (dual-format guarantee).
const BK_FEEDS_TTL = `
@prefix :   <#> .
@prefix ui: <http://www.w3.org/ns/ui#> .
@prefix bk: <http://www.w3.org/2002/01/bookmark#> .

<#Feeds> a bk:Topic ; ui:label "Feeds" .
<#News>  a bk:Topic ; ui:label "News" ; bk:subTopicOf <#Feeds> .
:00010 a ui:Link ; ui:label "OPB" ;
       bk:recalls <https://www.opb.org/rss> ; bk:hasTopic <#News> .
`;

const FIXTURES = {
  'https://test.local/feeds.ttl': FEEDS_TTL,
  'https://test.local/images.ttl': IMAGES_TTL,
  'https://test.local/bk-feeds.ttl': BK_FEEDS_TTL,
};

// Minimal fetch stub the parsers' feedFetch() can use.
globalThis.fetch = async (url) => {
  const key = String(url).split('#')[0];
  const body = FIXTURES[key];
  if (body == null) return { ok: false, status: 404, async text() { return ''; } };
  return { ok: true, status: 200, async text() { return body; } };
};

const { parseSourceList, parseBookmarkTree } =
  await import('/home/jeff/solid/solid-web-components/web/utils/feed-fetch.js');

let failures = 0;
const assert = (cond, msg) => {
  if (cond) { console.log('  ✓', msg); }
  else { console.error('  ✗', msg); failures++; }
};

async function testFeeds() {
  console.log('parseSourceList (News, Option-A DCAT):');
  const feeds = await parseSourceList('https://test.local/feeds.ttl#Feeds', {});
  assert(feeds.length === 2, `2 feeds parsed (got ${feeds.length})`);
  const opb = feeds.find(f => f.label === 'OPB');
  assert(!!opb, 'OPB feed present (dct:title label)');
  assert(opb && opb.url === 'https://www.opb.org/rss', 'OPB url from dcat:accessURL');
  assert(opb && opb.topic === 'News', 'OPB topic "News" from dcat:theme → skos:prefLabel');
  const verge = feeds.find(f => f.label === 'The Verge');
  assert(verge && verge.topic === 'Sci/Tech', 'The Verge grouped under Sci/Tech');
}

async function testImages() {
  console.log('parseBookmarkTree (Images, Option-A DCAT):');
  const root = await parseBookmarkTree('https://test.local/images.ttl#Images', {});
  assert(root.label === 'Images', 'root label "Images"');
  const art = root.topics.find(t => t.label === 'Art');
  assert(!!art, 'Art group present (skos:topConceptOf)');
  const photo = art && art.topics.find(t => t.label === 'Photographic Collections');
  assert(!!photo, 'Photographic Collections sub-topic present (skos:broader)');
  const coll = photo && photo.collections[0];
  assert(!!coll, 'collection leaf present');
  assert(coll && coll.label === 'Photographs in the Art Institute of Chicago', 'collection label from dct:title');
  assert(coll && /Category:Photographs_in_the_Art_Institute_of_Chicago$/.test(coll.url),
    'collection url from dcat:landingPage');
}

async function testBookmarkRegression() {
  console.log('parseSourceList (legacy bk: form still works):');
  const feeds = await parseSourceList('https://test.local/bk-feeds.ttl#Feeds', {});
  const opb = feeds.find(f => f.label === 'OPB');
  assert(!!opb, 'bk: OPB feed present');
  assert(opb && opb.url === 'https://www.opb.org/rss', 'bk: url from bk:recalls');
  assert(opb && opb.topic === 'News', 'bk: topic from ui:label');
}

await testFeeds();
await testImages();
await testBookmarkRegression();
console.log(failures ? `\nFAILED (${failures})` : '\nALL PASS');
process.exit(failures ? 1 : 0);
