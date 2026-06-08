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
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

const r1 = await page.evaluate(() => {
  const sd = document.querySelector('sol-default');
  const cal = document.querySelector('sol-calendar');
  const feed = document.querySelector('sol-feed');
  return {
    'sol-default exists': !!sd,
    'sol-default upgraded': sd && customElements.get('sol-default')?.name === sd.constructor.name,
    'sol-default proxy attr': sd?.getAttribute('proxy'),
    'sol-calendar.proxy': cal?.proxy,
    'sol-calendar attr proxy': cal?.getAttribute('proxy'),
    'sol-feed.proxy': feed?.proxy,
    'sol-feed attr proxy': feed?.getAttribute('proxy'),
  };
});
console.log('--- initial (sol-default carries proxy) ---');
for (const [k,v] of Object.entries(r1)) console.log(k, '=', JSON.stringify(v));

// Listen for default-change events and capture them
await page.evaluate(() => {
  window.__events = [];
  document.addEventListener('sol-default-change', (e) => {
    window.__events.push(JSON.parse(JSON.stringify(e.detail)));
  });
});

// Mutate the proxy attribute on sol-default
await page.evaluate(() => {
  document.querySelector('sol-default').setAttribute('proxy', 'https://new.proxy/?u=');
});
await new Promise(r => setTimeout(r, 800));

const r2 = await page.evaluate(() => {
  return {
    events: window.__events,
    'sol-calendar.proxy after change': document.querySelector('sol-calendar')?.proxy,
    'sol-feed.proxy after change': document.querySelector('sol-feed')?.proxy,
  };
});
console.log('--- after sol-default.setAttribute proxy ---');
for (const [k,v] of Object.entries(r2)) console.log(k, '=', JSON.stringify(v));

console.log('--- errors ---');
for (const e of errs) console.log(e);

await browser.close();
