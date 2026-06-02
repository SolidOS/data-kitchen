/**
 * e2e-settings.mjs — verify the SHACL settings UI end-to-end in a real
 * browser: the gear → Settings overlay, <sol-settings> discovery, and that
 * <sol-form> actually renders fields (the real test of the solid-ui bundle
 * integration). Also checks the News tab still renders from the rewritten
 * DCAT feeds.ttl.
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-settings.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(HERE, '../validation/images-e2e');
mkdirSync(SHOTS, { recursive: true });
const URL = 'http://localhost:3000/solid/open_media_player/';

let fails = 0;
const errors = [];
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
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // window.UI (solid-ui) must be present for sol-form to render.
  const hasUI = await page.evaluate(() => !!(window.UI && window.UI.widgets && window.UI.widgets.fieldFunction));
  check(hasUI, 'window.UI.widgets.fieldFunction present (solid-ui bundled)');

  // News tab renders topic columns from the rewritten DCAT feeds.ttl.
  const newsTopics = await page.evaluate(() => {
    const r = document.getElementById('panel-news')?.shadowRoot;
    return r ? r.querySelectorAll('.feed-source-list, .feed-topic, [class*="topic"]').length : 0;
  });
  check(newsTopics > 0, `News tab rendered from DCAT data (${newsTopics} topic nodes)`);

  // Open the ⋮ menu → Settings…
  await page.click('.omp-more');
  await sleep(150);
  await page.evaluate(() => {
    [...document.querySelectorAll('.omp-menu [data-action="settings"]')][0]?.click();
  });
  await page.waitForFunction(() => {
    const o = document.querySelector('.omp-settings-overlay');
    return o && !o.hasAttribute('hidden');
  }, { timeout: 5000 });
  check(true, 'settings overlay opened');

  // sol-settings built panels for the carriers (Appearance, News feeds).
  await sleep(400);
  const labels = await page.evaluate(() => {
    const ov = document.querySelector('.omp-settings-overlay');
    return [...ov.querySelectorAll('details summary, .accordion-summary, [class*="summary"]')]
      .map(s => s.textContent.trim()).filter(Boolean);
  });
  const labelText = labels.join(' | ');
  check(/Preferences/i.test(labelText), `Preferences panel present (${labelText})`);
  check(/News feeds/i.test(labelText), `News feeds panel present`);
  check(/Image collections/i.test(labelText), `Image collections panel present`);

  // Expand every panel (open all <details> in the overlay) and let forms mount.
  await page.evaluate(() => {
    document.querySelector('.omp-settings-overlay')
      .querySelectorAll('details').forEach(d => { d.open = true; d.dispatchEvent(new Event('toggle')); });
  });
  await sleep(1500);

  // Inspect the mounted <sol-form> elements: fields rendered, no error banner.
  const forms = await page.evaluate(() => {
    const ov = document.querySelector('.omp-settings-overlay');
    const out = [];
    for (const f of ov.querySelectorAll('sol-form')) {
      const sr = f.shadowRoot;
      const txt = sr ? sr.textContent : '';
      out.push({
        view: f.getAttribute('view') || 'shape',
        inputs: sr ? sr.querySelectorAll('input, select, textarea').length : 0,
        counter: sr?.querySelector('.rolodex-counter')?.textContent || '',
        error: /could not resolve a renderer|sol-form-error|failed/i.test(txt),
        loading: /Loading form/i.test(txt),
      });
    }
    return out;
  });
  console.log('  sol-forms:', JSON.stringify(forms));

  // sh:class dropdowns must have enumerated their choices from the store
  // (prefs: ui:ColorScheme/ui:FontSize via owl:imports; feeds: skos:Concept).
  const selects = await page.evaluate(() => {
    const ov = document.querySelector('.omp-settings-overlay');
    const out = [];
    for (const f of ov.querySelectorAll('sol-form')) {
      for (const sel of f.shadowRoot?.querySelectorAll('select') || []) {
        out.push([...sel.options].map(o => o.textContent.trim()).filter(Boolean));
      }
    }
    return out;
  });
  console.log('  selects:', JSON.stringify(selects));
  const flat = selects.flat().join(' ').toLowerCase();
  check(/light/.test(flat) && /dark/.test(flat), 'prefs color-scheme options enumerated (Light/Dark/System)');
  check(/small|medium|large/.test(flat), 'prefs font-size options enumerated');
  check(selects.some(opts => opts.some(o => /news|sci|culture/i.test(o))),
    'feeds topic dropdown enumerated skos:Concepts');
  check(forms.length >= 2, `at least 2 sol-form editors mounted (${forms.length})`);
  check(forms.every(f => !f.error), 'no sol-form render errors');
  check(forms.every(f => !f.loading), 'no sol-form stuck on "Loading form…"');
  check(forms.some(f => f.inputs > 0), 'sol-form fields rendered (inputs present)');
  const rolodex = forms.find(f => f.view === 'rolodex');
  check(!!rolodex, 'News-feeds rolodex form present');
  check(rolodex && /\b\d+\b/.test(rolodex.counter) && /42|of/i.test(rolodex.counter),
    `rolodex shows record counter (${rolodex?.counter})`);

  await page.screenshot({ path: `${SHOTS}/5-settings.png` });

  const fatal = errors.filter(e => !/favicon|net::ERR|proxy|404|Failed to load resource/i.test(e));
  check(fatal.length === 0, `no fatal console errors${fatal.length ? ' — ' + fatal.slice(0, 4).join(' | ') : ''}`);

  console.log(fails ? `\n${fails} failure(s)` : '\nSettings e2e passed.');
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
