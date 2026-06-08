// Verify two recent changes:
//   1. data-kitchen-settings.ttl#Settings is wired everywhere
//      (sol-default, sol-form on settings page, dk-settings-applier
//      seed + load).
//   2. sol-search loads engines from the schema:ItemList in
//      data/search-engines.ttl#SearchEngines, sorted by
//      schema:position, and search submission resolves the
//      hydra:template against {query}.

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

// 1. Settings file is in use everywhere it should be.
const settingsWiring = await page.evaluate(() => ({
  defaultSrc: document.querySelector('sol-default')?.getAttribute('source'),
  localStorageDkPrefs: localStorage.getItem('dk-prefs'),
  localStorageDataKitchen: localStorage.getItem('data-kitchen-settings'),
}));
console.log('-- settings wiring --');
console.log(JSON.stringify(settingsWiring, null, 2));

// 2. Engines list comes from the ItemList. Order should follow schema:position.
const engineLabels = await page.evaluate(() => {
  const sols = document.querySelector('sol-search');
  if (!sols?.shadowRoot) return ['(no sol-search)'];
  return [...sols.shadowRoot.querySelectorAll('label.engine span')].map(s => s.textContent.trim());
});
console.log('-- sol-search engines (RDF-driven) --');
console.log(JSON.stringify(engineLabels));

// 3. Submitting a query expands the hydra:template — verify the
//    selected engine resolves to an https://... URL (not the engine
//    IRI fragment, which was the SKOS-era bug).
const searched = await page.evaluate(() => {
  const sols = document.querySelector('sol-search');
  const sr = sols?.shadowRoot;
  if (!sr) return { ok: false };
  // Force-select Google specifically.
  const googleRadio = [...sr.querySelectorAll('label.engine')]
    .find(l => l.textContent.trim() === 'Google')
    ?.querySelector('input[type=radio]');
  if (googleRadio) { googleRadio.checked = true; googleRadio.dispatchEvent(new Event('change')); }
  // Stub window.open to capture URL without opening anything.
  let capturedUrl = null;
  window.open = (url) => { capturedUrl = url; return { focus(){}, closed: false, location: {} }; };
  const input = sr.querySelector('input.q');
  input.value = 'hello world';
  sr.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  return { ok: true, url: capturedUrl };
});
console.log('-- submit result URL --');
console.log(JSON.stringify(searched, null, 2));

// 4. Sanity: settings panel discovery still finds the Search widget.
const panels = await page.evaluate(() => {
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); break; }
  }
  return null;
});
await new Promise(r => setTimeout(r, 2000));
const summaries = await page.evaluate(() => {
  return [...document.querySelectorAll('.dk-settings sol-accordion details > summary')].map(s => s.textContent.trim());
});
console.log('-- sol-settings accordion summaries (post-rename) --');
console.log(JSON.stringify(summaries));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/rename-and-search.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
