import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const errs = [];
const bad = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2000));

// Click the Podz button in sol-menu's shadow root
const clicked = await page.evaluate(() => {
  const menu = document.querySelector('sol-menu');
  const btn = menu?.shadowRoot?.querySelector('button.sol-menu-nav-button, .sol-menu-nav button');
  // We just want the Podz button — find by text.
  const all = menu?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? [];
  for (const b of all) {
    if (b.textContent.trim() === 'Podz') { b.click(); return true; }
  }
  return false;
});
console.log('clicked Podz:', clicked);

await new Promise(r => setTimeout(r, 3000));

const state = await page.evaluate(() => {
  const dp = document.querySelector('dk-podz');
  const leftPod = document.querySelector('#left-pod');
  const rightPod = document.querySelector('#right-pod');
  const splitter = document.querySelector('#panel-splitter');
  const help = document.querySelector('#help-modal');
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { tag: el.localName, box: `${Math.round(b.width)}x${Math.round(b.height)} @ ${Math.round(b.x)},${Math.round(b.y)}` };
  };
  return {
    'dk-podz': r(dp),
    'left-pod': r(leftPod),
    'right-pod': r(rightPod),
    'panel-splitter': r(splitter),
    'help-modal': r(help),
    'SolidFileBrowser_global': typeof window.SolidFileBrowser,
    'PodzExtras_global': typeof window.PodzExtras,
  };
});
console.log('--- state after Podz click ---');
for (const [k,v] of Object.entries(state)) console.log(k, JSON.stringify(v));

console.log('--- 4xx/5xx responses ---');
for (const b of bad) console.log(b);
console.log('--- errors ---');
for (const e of errs) console.log(e);

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/phase1-podz.png', fullPage: false });

await browser.close();
