/**
 * e2e-news-scroll.mjs — verify the remembered/selected News source is
 * scrolled into view on startup (regression: sol-tabs keep-alive renders the
 * feed inside a hidden pane, so scrollIntoView was a no-op until the fix that
 * defers the scroll until the host becomes visible).
 *
 * Strategy: cold start → find a source deep inside an OVERFLOWING topic column
 * → pin it as the remembered source in localStorage → reload → assert the
 * selected source is fully visible within its scrollable column.
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-news-scroll.mjs
 */
import puppeteer from 'puppeteer-core';
const URL = 'http://localhost:3000/solid/open_media_player/';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });

  // Cold start.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });

  // Wait for the feed to render its source columns.
  await page.waitForFunction(() => {
    const f = document.getElementById('panel-news');
    return f?.shadowRoot?.querySelectorAll('.feed-topic-col-list .feed-link').length > 0;
  }, { timeout: 25000 });

  // Find a source deep inside an overflowing column; pin it as remembered.
  const picked = await page.evaluate(() => {
    const feed = document.getElementById('panel-news');
    const root = feed.shadowRoot;
    const cols = [...root.querySelectorAll('.feed-topic-col-list')];
    const overflowing = cols.find(c => c.scrollHeight > c.clientHeight + 4);
    if (!overflowing) return { overflow: false };
    const links = [...overflowing.querySelectorAll('.feed-link')];
    const deep = links[links.length - 1];           // last = furthest below the fold
    const key = feed.topicsSelectionKey;
    localStorage.setItem(key, deep.href);
    return { overflow: true, url: deep.href, label: deep.textContent, key };
  });
  check(picked.overflow, picked.overflow
    ? `found overflowing column; pinned deep source "${picked.label}"`
    : 'NO overflowing column found — cannot exercise scroll (test inconclusive)');
  if (!picked.overflow) throw new Error('no overflowing column to test');

  // Reload — the feed should restore + scroll the remembered source into view.
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(() => {
    const f = document.getElementById('panel-news');
    return !!f?.shadowRoot?.querySelector('.feed-link.selected');
  }, { timeout: 25000 });

  // Give the IntersectionObserver + rAF a moment after the pane is shown.
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));

  const res = await page.evaluate((wantUrl) => {
    const root = document.getElementById('panel-news').shadowRoot;
    const a = root.querySelector('.feed-link.selected');
    const container = a?.closest('.feed-topic-col-list');
    const cr = container.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    return {
      selectedUrl: a?.href,
      matches: a?.href === wantUrl,
      overflows: container.scrollHeight > container.clientHeight + 1,
      scrollTop: Math.round(container.scrollTop),
      fullyVisible: ar.top >= cr.top - 1 && ar.bottom <= cr.bottom + 1,
    };
  }, picked.url);

  check(res.matches, `remembered deep source is the selected one on reload`);
  check(res.overflows, `its column overflows (scroll is actually required)`);
  check(res.scrollTop > 0, `column scrolled down to reach it (scrollTop=${res.scrollTop})`);
  check(res.fullyVisible, `selected source is fully visible within its column`);

  console.log(fails ? `\n${fails} failure(s)` : '\nNews scroll-into-view check passed.');
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
