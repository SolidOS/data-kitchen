/**
 * smoke-test-commons.mjs — verify commons-fetch.js against the live Commons
 * API and exercise the category-URL parser on real images.ttl URLs.
 *
 * Run from project root:  node claude/smoke-tests/smoke-test-commons.mjs
 * (Network required. commons-fetch lives in the sibling solid-web-components.)
 */
// Minimal DOMParser shim so getCategoryImages' extmetadata→text path runs
// under Node (the browser has DOMParser natively).
if (!globalThis.DOMParser) {
  globalThis.DOMParser = class {
    parseFromString(html) {
      const text = String(html).replace(/<[^>]*>/g, '');
      return { body: { textContent: text } };
    }
  };
}

const { categoryTitleFromUrl, getCategoryImages } =
  await import('../../../solid-web-components/web/utils/commons-fetch.js');

let fails = 0;
const eq = (got, want, msg) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${msg}` + (ok ? '' : `\n    got: ${got}\n    want: ${want}`));
};

// ── URL parsing (includes percent-encoded titles from the real data) ──────
eq(categoryTitleFromUrl('https://commons.wikimedia.org/wiki/Category:Tarot_1JJ'),
   'Category:Tarot 1JJ', 'underscore title');
eq(categoryTitleFromUrl('https://commons.wikimedia.org/wiki/Category:Sticker_art_in_S%C3%A3o_Paulo_city'),
   'Category:Sticker art in São Paulo city', 'percent-encoded title');
eq(categoryTitleFromUrl('https://example.org/not-a-category'), '', 'non-category → empty');

// ── live fetch ────────────────────────────────────────────────────────────
console.log('\nFetching Category:Tarot_1JJ …');
const { images, cont } = await getCategoryImages(
  'https://commons.wikimedia.org/wiki/Category:Tarot_1JJ',
  { thumbWidth: 240, limit: 5 },
);
console.log(`  got ${images.length} images, cont=${cont ? 'yes' : 'no'}`);
if (images.length) {
  const i = images[0];
  console.log(`  first: ${i.title}\n    thumb: ${i.thumb}\n    full:  ${i.full}\n    license: ${i.license || '(none)'}`);
  eq(images.length > 0, true, 'category returned images');
  eq(/^https:\/\/upload\.wikimedia\.org\//.test(i.thumb), true, 'thumb is an upload.wikimedia URL');
  eq(typeof i.full === 'string' && i.full.length > 0, true, 'full-size URL present');
} else {
  fails++;
  console.log('✗ expected images for Tarot_1JJ');
}

console.log(fails ? `\n${fails} failure(s)` : '\nAll checks passed.');
process.exit(fails ? 1 : 0);
