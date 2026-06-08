/**
 * Validate the migrated libraries/news/feeds.ttl and
 * libraries/wikimedia_images/images.ttl against the REAL swc parsers
 * (parseSourceList / parseBookmarkTree) with a fetch() stub over the
 * actual on-disk files. Confirms the DCAT/SKOS rewrite renders.
 *
 *   node claude/validation/validate-rewritten-sources.mjs
 */
import { readFileSync } from 'node:fs';

globalThis.DOMParser = class { parseFromString() { return { documentElement: {}, getElementsByTagName: () => [] }; } };

const ROOT = '/home/jeff/Dropbox/Web/solid/open_media_player';
const FILES = {
  'https://omp.local/feeds.ttl':  `${ROOT}/libraries/news/feeds.ttl`,
  'https://omp.local/images.ttl': `${ROOT}/libraries/wikimedia_images/images.ttl`,
};
globalThis.fetch = async (url) => {
  const path = FILES[String(url).split('#')[0]];
  if (!path) return { ok: false, status: 404, async text() { return ''; } };
  const body = readFileSync(path, 'utf8');
  return { ok: true, status: 200, async text() { return body; } };
};

const { parseSourceList, parseBookmarkTree } =
  await import('sol-components/web/utils/feed-fetch.js');

let fail = 0;
const ok = (c, m) => { console.log(c ? '  ✓' : '  ✗', m); if (!c) fail++; };

// News
const feeds = await parseSourceList('https://omp.local/feeds.ttl#Feeds', {});
console.log(`News: ${feeds.length} feeds`);
ok(feeds.length === 42, '42 feeds parsed');
ok(feeds.every(f => f.url && f.label && f.topic), 'every feed has url + label + topic');
ok(new Set(feeds.map(f => f.topic)).size === 3, '3 distinct topics (News / Sci/Tech / Culture)');
ok(feeds.some(f => f.label === 'NY Times' && /World\.xml$/.test(f.url)), 'NY Times accessURL resolved');

// Images
const tree = await parseBookmarkTree('https://omp.local/images.ttl#Images', {});
const count = (n) => n.collections.length + n.topics.reduce((s, t) => s + count(t), 0);
const total = count(tree);
console.log(`Images: root "${tree.label}", ${tree.topics.length} groups, ${total} collections`);
ok(tree.label === 'Images', 'root label "Images"');
ok(tree.topics.length === 2, 'two top groups (Art / Life)');
ok(total === 741, '741 collections across the tree');
const art = tree.topics.find(t => t.label === 'Images - Art');
const photo = art && art.topics.find(t => t.label === 'Photographic Collections');
ok(!!photo && photo.collections.length > 0, 'Photographic Collections has collections');
ok(photo && photo.collections.every(c => /commons\.wikimedia\.org\/wiki\/Category:/.test(c.url)),
  'collection URLs are Commons categories (dcat:landingPage)');

console.log(fail ? `\nFAILED (${fail})` : '\nALL PASS');
process.exit(fail ? 1 : 0);
