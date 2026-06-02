/**
 * e2e-image-edit.mjs — verify the Image Collections editor end-to-end:
 * lazy rolodex (one card of 741, no hang), datalist jump, Add / edit / Remove
 * persisting to images.ttl, and a topic dropdown scoped to image topics only
 * (schema:DefinedTerm — not music/movie genres). Snapshots images.ttl and
 * restores it afterward. Waits on state (not fixed sleeps) so the async
 * sparql-update PATCHes have time to land.
 *
 * Server up + writable (CSS) at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-image-edit.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3000/solid/open_media_player';
const IMAGES = `${BASE}/libraries/wikimedia_images/images.ttl`;

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fetchImages = () => fetch(IMAGES, { cache: 'no-store' }).then(r => r.text());
const SNAPSHOT = await fetchImages();

// In-page helper installed on window: returns the collections sol-form.
const INSTALL = () => {
  window.__coll = () => {
    const ov = document.querySelector('.omp-settings-overlay');
    return [...ov.querySelectorAll('sol-form')].find(f =>
      / of 7\d\d$/.test((f.shadowRoot?.querySelector('.rolodex-counter')?.textContent || '').trim()));
  };
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (/PATCH failed|add failed/i.test(m.text())) console.log('  PAGE:', m.text()); });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });

  // Open settings, expand the Image collections panel.
  await page.click('.omp-more');
  await sleep(150);
  await page.evaluate(() => document.querySelector('.omp-menu [data-action="settings"]')?.click());
  await page.waitForFunction(() => !document.querySelector('.omp-settings-overlay')?.hasAttribute('hidden'), { timeout: 5000 });
  await page.evaluate(() => {
    for (const d of document.querySelector('.omp-settings-overlay').querySelectorAll('details')) {
      if (/Image collections/i.test(d.querySelector('summary')?.textContent || '')) { d.open = true; d.dispatchEvent(new Event('toggle')); }
    }
  });
  await page.evaluate(INSTALL);
  await page.waitForFunction(() => window.__coll()?.shadowRoot?.querySelector('.rolodex-counter'), { timeout: 8000 });

  const snap = () => page.evaluate(() => {
    const sr = window.__coll().shadowRoot;
    return {
      counter: sr.querySelector('.rolodex-counter').textContent.trim(),
      inputs: sr.querySelectorAll('input, select, textarea').length,
      title: sr.querySelector('input[type="text"]:not(.rolodex-jump-input), input:not([type])')?.value || '',
      topicOptions: [...(sr.querySelector('select')?.options || [])].map(o => o.textContent.trim()),
      hasAdd: !!sr.querySelector('.rolodex-add'), hasRemove: !!sr.querySelector('.rolodex-remove'),
      hasJump: !!sr.querySelector('.rolodex-jump-input'),
    };
  });
  const waitCounter = (re) => page.waitForFunction(
    (r) => new RegExp(r).test((window.__coll()?.shadowRoot?.querySelector('.rolodex-counter')?.textContent || '').trim()),
    { timeout: 12000 }, re.source);

  let s = await snap();
  check(/of 741/.test(s.counter), `lazy rolodex shows "1 of 741" (${s.counter})`);
  check(s.inputs < 20, `lazy: only the active card is mounted (${s.inputs} controls, not ~2000)`);
  check(s.hasAdd && s.hasRemove && s.hasJump, 'Add / Remove / jump-box present');
  const flat = s.topicOptions.join(' ').toLowerCase();
  check(/art|prints|activism/.test(flat), `topic dropdown lists image topics (${s.topicOptions.slice(0, 3).join(', ')}…)`);
  check(!/jazz|hip hop|reggae|feature films/.test(flat), 'topic dropdown excludes music/movie genres');

  // Jump box pages to a chosen label.
  const target = await page.evaluate(() => {
    const sr = window.__coll().shadowRoot;
    const opts = [...sr.querySelector('datalist').options].map(o => o.value);
    const cur = sr.querySelector('input[type="text"]:not(.rolodex-jump-input)').value;
    const t = opts.find(v => v && v !== cur) || opts[0];
    const jin = sr.querySelector('.rolodex-jump-input');
    jin.value = t; jin.dispatchEvent(new Event('input', { bubbles: true }));
    return t;
  });
  await sleep(300);
  s = await snap();
  check(s.title === target, `jump box paged to "${target}"`);

  // Add a record → wait for "742".
  await page.evaluate(() => window.__coll().shadowRoot.querySelector('.rolodex-add').click());
  await waitCounter(/of 742/).catch(() => {});
  s = await snap();
  check(/of 742/.test(s.counter), `Add appended a record (${s.counter})`);

  // Edit its title and wait for it to appear in the server copy.
  const NEWTITLE = 'E2E Test Collection ' + Date.now();
  await page.evaluate((t) => {
    const inp = window.__coll().shadowRoot.querySelector('input[type="text"]:not(.rolodex-jump-input), input:not([type])');
    inp.focus(); inp.value = t;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
  }, NEWTITLE);
  let savedTitle = false;
  for (let i = 0; i < 12 && !savedTitle; i++) { await sleep(700); savedTitle = (await fetchImages()).includes(NEWTITLE); }
  check(savedTitle, 'edited title PATCHed into images.ttl');

  // Remove it (two-step confirm) → wait for "741".
  await page.evaluate(() => window.__coll().shadowRoot.querySelector('.rolodex-remove').click());
  await sleep(250);
  await page.evaluate(() => window.__coll().shadowRoot.querySelector('.rolodex-remove').click());
  await waitCounter(/of 741/).catch(() => {});
  s = await snap();
  check(/of 741/.test(s.counter), `Remove dropped the record (${s.counter})`);
  let removed = false;
  for (let i = 0; i < 8 && !removed; i++) { await sleep(600); removed = !(await fetchImages()).includes(NEWTITLE); }
  check(removed, 'removed record gone from images.ttl');

  const fatal = errors.filter(e => !/favicon|net::ERR|proxy/i.test(e));
  check(fatal.length === 0, `no page errors${fatal.length ? ' — ' + fatal.slice(0, 3).join(' | ') : ''}`);
} finally {
  await browser.close();
  await fetch(IMAGES, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: SNAPSHOT })
    .then(r => console.log(`restored images.ttl (${r.status})`)).catch(e => console.log('restore failed:', e.message));
}
console.log(fails ? `\n${fails} failure(s)` : '\nImage-editing e2e passed.');
process.exit(fails ? 1 : 0);
