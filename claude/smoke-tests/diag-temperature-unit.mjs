// Verify the ui:TemperatureUnit migration:
//   * Settings → Weather panel mounts sol-form against weather-settings.shacl
//   * The Temperature unit field renders as a single-select <select>
//     (not solid-ui's multiselect chip widget) since maxCount=1.
//   * sol-weather's _applySource correctly maps ui:Both → units="both".

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

// sol-weather mapping check via the units attribute it set.
const weatherUnits = await page.evaluate(() => document.querySelector('sol-weather')?.getAttribute('units'));
console.log('sol-weather units after _applySource:', weatherUnits);

// Open Settings → Weather panel.
await page.evaluate(() => {
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); break; }
  }
});
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(() => {
  const det = [...document.querySelectorAll('.dk-settings sol-accordion details')].find(d => d.querySelector('summary')?.textContent.trim() === 'Weather');
  if (det) { det.open = true; det.dispatchEvent(new Event('toggle')); }
});
await new Promise(r => setTimeout(r, 3000));

const tuField = await page.evaluate(() => {
  const det = [...document.querySelectorAll('.dk-settings sol-accordion details')].find(d => d.querySelector('summary')?.textContent.trim() === 'Weather');
  const form = det?.querySelector('sol-form');
  const root = form?.shadowRoot;
  if (!root) return { error: 'no sol-form shadow' };
  const row = root.querySelector('[data-key="temperatureUnit"]');
  if (!row) {
    const keys = [...root.querySelectorAll('[data-key]')].map(e => e.dataset.key);
    return { error: 'no temperatureUnit row', keys };
  }
  const sel = row.querySelector('select');
  return {
    'row tag':                row.tagName,
    'has <select>':           !!sel,
    'select multiple':        sel?.multiple,
    'select options':         sel ? [...sel.options].map(o => ({ value: o.value, text: o.textContent, selected: o.selected })) : null,
    'has multiselect chips':  !!row.querySelector('.multiselect__container'),
    'rendered HTML preview':  row.innerHTML.slice(0, 250),
  };
});
console.log('-- Temperature unit field --');
console.log(JSON.stringify(tuField, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/temperature-unit.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
