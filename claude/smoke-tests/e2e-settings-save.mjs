/**
 * e2e-settings-save.mjs — verify the settings SAVE round-trip: edit a text
 * field in the Appearance form, confirm sol-form PATCHes the server copy of
 * data/omp-settings.ttl, then restore the file. Uses the proxy field (a text
 * input — solid-ui single-select dropdowns don't autosave; text fields do).
 *
 * Server up + writable (Community Solid Server) at
 * http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-settings-save.mjs
 */
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:3000/solid/open_media_player';
const SETTINGS = `${BASE}/data/omp-settings.ttl`;
const MARKER = `http://localhost:3002/proxy-test-${Date.now()}?uri=`;
const DEFAULT_TTL = `@prefix omp: <urn:omp:shape:settings:> .
@prefix ui:  <http://www.w3.org/ns/ui#> .

<#Settings>
  a omp:Prefs ;
  ui:colorScheme ui:SystemColorScheme ;
  ui:fontSize ui:MediumFont ;
  ui:proxy "http://localhost:3002/proxy?uri=" .
`;

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 30000 });

  // Open settings, expand the Appearance panel.
  await page.click('.omp-more');
  await sleep(150);
  await page.evaluate(() => document.querySelector('.omp-menu [data-action="settings"]')?.click());
  await page.waitForFunction(() => !document.querySelector('.omp-settings-overlay')?.hasAttribute('hidden'),
    { timeout: 5000 });
  await page.evaluate(() => document.querySelector('.omp-settings-overlay')
    .querySelectorAll('details').forEach(d => { d.open = true; d.dispatchEvent(new Event('toggle')); }));
  await sleep(1200);

  // Type a marker into the proxy text field of the shape-driven (non-rolodex)
  // Appearance form and commit it.
  const typed = await page.evaluate((marker) => {
    const ov = document.querySelector('.omp-settings-overlay');
    const prefs = [...ov.querySelectorAll('sol-form')].find(f => (f.getAttribute('view') || '') !== 'rolodex');
    const inp = prefs?.shadowRoot?.querySelector('input[type="text"], input:not([type])');
    if (!inp) return false;
    inp.focus();
    inp.value = marker;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
    return true;
  }, MARKER);
  check(typed, 'found + edited the proxy text field');

  // Wait for the debounced autosave PATCH to land, then read the server copy.
  await sleep(2500);
  const saved = await fetch(SETTINGS, { cache: 'no-store' }).then(r => r.text()).catch(() => '');
  check(saved.includes(MARKER), `omp-settings.ttl PATCHed with the new proxy value`);
} finally {
  await browser.close();
  // Restore the settings file to defaults regardless of outcome.
  await fetch(SETTINGS, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: DEFAULT_TTL })
    .then(r => console.log(`restored omp-settings.ttl (${r.status})`))
    .catch(e => console.log('restore failed:', e.message));
}
console.log(fails ? `\n${fails} failure(s)` : '\nSave round-trip verified.');
process.exit(fails ? 1 : 0);
