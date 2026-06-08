import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => errors.push(`reqfailed ${r.url()}: ${r.failure()?.errorText}`));
page.on('console', m => {
  if (['error', 'warning'].includes(m.type())) {
    errors.push(`console.${m.type()}: ${m.text()}`);
  }
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3500));

const out = await page.evaluate(() => {
  const sel = (q) => {
    const el = document.querySelector(q);
    if (!el) return { q, missing: true };
    const r = el.getBoundingClientRect();
    return {
      q,
      box: `${Math.round(r.width)}x${Math.round(r.height)} @ ${Math.round(r.x)},${Math.round(r.y)}`,
      shadow: !!el.shadowRoot,
      childCount: el.childElementCount,
    };
  };
  return [
    'body',
    'main#dk-content',
    'dk-dashboard',
    'dk-dashboard header.dash',
    'dk-dashboard sol-weather',
    'dk-dashboard sol-time',
    'dk-dashboard sol-calendar',
    'dk-dashboard sol-feed',
    'dk-dashboard main.feed',
    'nav.dk-menubar',
    'nav.dk-menubar sol-menu',
  ].map(sel);
});

console.log('--- layout ---');
for (const r of out) console.log(JSON.stringify(r));
console.log('--- diagnostics ---');
for (const e of errors) console.log(e);

await browser.close();
