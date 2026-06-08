// Verify the Settings accordion opens with every panel collapsed.

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(() => {
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); break; }
  }
});
await new Promise(r => setTimeout(r, 2000));

const state = await page.evaluate(() => {
  const dets = [...document.querySelectorAll('.dk-settings sol-accordion details')];
  return {
    count: dets.length,
    summaries: dets.map(d => d.querySelector('summary')?.textContent.trim()),
    openFlags: dets.map(d => d.open),
    anyOpen: dets.some(d => d.open),
    accordionStartClosedAttr: document.querySelector('.dk-settings sol-accordion')?.hasAttribute('start-closed'),
  };
});

console.log(JSON.stringify(state, null, 2));
console.log('all closed on first render:', !state.anyOpen);

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/settings-all-closed.png' });
await browser.close();
