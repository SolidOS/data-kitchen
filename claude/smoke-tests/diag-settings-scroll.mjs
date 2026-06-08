// Verifies the settings page scrolls within its container instead of
// pushing the dk chrome (header / menubar) off the viewport when the
// accordion expands.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => {
  if (m.type() === 'error') errs.push('console.error: ' + m.text());
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

// Click Settings.
await page.evaluate(() => {
  for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? []) {
    if (b.textContent.trim() === 'Settings') { b.click(); return; }
  }
});
await new Promise(r => setTimeout(r, 2000));

// Open every outer panel so the accordion is at its tallest, then
// measure whether the page itself scrolls or whether the .dk-settings
// container scrolls.
const layoutBefore = await page.evaluate(() => {
  const dks = document.querySelector('.dk-settings');
  const header = document.querySelector('header.dk-chrome');
  return {
    'document scroll height':  document.documentElement.scrollHeight,
    'window inner height':     window.innerHeight,
    '.dk-settings clientHeight': dks?.clientHeight,
    '.dk-settings scrollHeight': dks?.scrollHeight,
    'header top':              header?.getBoundingClientRect().top,
  };
});

// `<details name>` runs in exclusive mode, so only one outer panel can
// be open at a time. Open the Menu panel (the tallest — sol-tree-edit
// with 4 items + head + add) to stress the height-overflow path.
await page.evaluate(async () => {
  const dets = Array.from(document.querySelectorAll('sol-settings > sol-accordion > .sol-accordion-wrapper > details'));
  const menu = dets.find(d => d.querySelector(':scope > summary')?.textContent.trim() === 'Menu');
  if (menu) {
    menu.open = true;
    menu.dispatchEvent(new Event('toggle'));
  }
});
await new Promise(r => setTimeout(r, 800));

// Drill the open Menu panel into Home so sol-tree-edit shows the
// per-item form (the tallest single view).
await page.evaluate(async () => {
  const tree = document.querySelector('sol-settings sol-tree-edit');
  if (!tree) return;
  const allDetails = Array.from(tree.querySelectorAll('details'));
  const home = allDetails.find(d => d.querySelector(':scope > summary')?.textContent.trim() === 'Home');
  if (home) { home.open = true; home.dispatchEvent(new Event('toggle')); }
});
await new Promise(r => setTimeout(r, 800));

const layoutAfter = await page.evaluate(() => {
  const dks    = document.querySelector('.dk-settings');
  const header = document.querySelector('header.dk-chrome');
  const sols   = document.querySelector('.dk-settings > sol-settings');
  const acc    = document.querySelector('.dk-settings sol-accordion');
  return {
    'document scroll height':    document.documentElement.scrollHeight,
    'window inner height':       window.innerHeight,
    '.dk-settings clientHeight': dks?.clientHeight,
    '.dk-settings scrollHeight': dks?.scrollHeight,
    '.dk-settings overflowing':  dks ? dks.scrollHeight > dks.clientHeight : null,
    'sol-settings clientHeight': sols?.clientHeight,
    'sol-settings scrollHeight': sols?.scrollHeight,
    'sol-accordion offsetHeight': acc?.offsetHeight,
    'header top (visible?)':     header?.getBoundingClientRect().top,
  };
});

console.log('--- before opening panels ---');
console.log(JSON.stringify(layoutBefore, null, 2));
console.log('--- after opening every panel ---');
console.log(JSON.stringify(layoutAfter, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/settings-scroll-all-open.png' });

// Try scrolling INSIDE the settings container and confirm document
// scrollTop stays at 0 (proves the container is what scrolled).
const scrollProof = await page.evaluate(() => {
  const dks = document.querySelector('.dk-settings');
  if (!dks) return { error: 'no .dk-settings' };
  dks.scrollTop = 400;
  return {
    'dks scrollTop':       dks.scrollTop,
    'document scrollTop':  document.documentElement.scrollTop,
  };
});
console.log('--- after dks.scrollTop = 400 ---');
console.log(JSON.stringify(scrollProof, null, 2));

console.log('--- errors (filtered) ---');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google)/.test(e)) {
    console.log(e);
  }
}

await browser.close();
