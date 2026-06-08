// Verify save round-trip for the Default panel (sol-default) and the
// Search panel (sol-search → schema:ItemList). Both flow through
// sol-form's UpdateManager PATCH → CSS pod → reload of the host widget.
//
// Pre-req: search-engines.ttl is reachable at a write-supporting URL
// (CSS pod). If sol-search's `source` still points at :8081 (python
// http.server, no PATCH), the save will fail and this test reports it.

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errs = [];
const reqs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
page.on('request', r => {
  const m = r.method();
  if (m === 'PUT' || m === 'PATCH' || m === 'POST' || m === 'DELETE') {
    reqs.push({ method: m, url: r.url() });
  }
});
page.on('response', async r => {
  const m = r.request().method();
  if (m === 'PUT' || m === 'PATCH' || m === 'POST' || m === 'DELETE') {
    reqs[reqs.length - 1] = { ...reqs[reqs.length - 1], status: r.status() };
  }
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

// Click the Settings sol-button to mount the settings page.
await page.evaluate(() => {
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); break; }
  }
});
await new Promise(r => setTimeout(r, 2000));

async function expandPanel(label) {
  const ok = await page.evaluate((l) => {
    const dets = document.querySelectorAll('.dk-settings sol-accordion details');
    for (const d of dets) {
      const s = d.querySelector('summary')?.textContent.trim();
      if (s === l) { d.open = true; d.dispatchEvent(new Event('toggle')); return true; }
    }
    return false;
  }, label);
  await new Promise(r => setTimeout(r, 1800));
  return ok;
}

async function snapshot(label) {
  return await page.evaluate(() => {
    const sd = document.querySelector('sol-default');
    return {
      'sol-default proxy attr': sd?.getAttribute('proxy'),
    };
  });
}

console.log('-- (1) Default panel: form mount --');
const opened = await expandPanel('Default');
const defaultMount = await page.evaluate((wasOpened) => {
  const det = [...document.querySelectorAll('.dk-settings sol-accordion details')].find(d => d.querySelector('summary')?.textContent.trim() === 'Default');
  const section = det?.querySelector('.accordion-content-section');
  return {
    expanded: wasOpened,
    formMounted: !!section?.querySelector('sol-form'),
    formSubject: section?.querySelector('sol-form')?.getAttribute('subject'),
    formSaveTo:  section?.querySelector('sol-form')?.getAttribute('save-to'),
    formShape:   section?.querySelector('sol-form')?.getAttribute('shape'),
    formSource:  section?.querySelector('sol-form')?.getAttribute('source'),
    rawHTML:     section ? section.innerHTML.slice(0, 500) : null,
  };
}, opened);
console.log(JSON.stringify(defaultMount, null, 2));

console.log('-- (1) sol-default before save --');
console.log(JSON.stringify(await snapshot('before'), null, 2));

// Find the proxy input inside the Default panel's sol-form and mutate it.
// sol-form renders fields via solid-ui — the proxy field is a text input
// labeled "CORS proxy". We mutate the value, dispatch change/blur to
// trigger UpdateManager, and watch the network panel for PATCH.
const TEST_PROXY = `http://localhost:3002/proxy?uri=test${Date.now()}&`;
// Wait for sol-form's field rendering (which is async — solid-ui's
// fieldFunction reads the shape, fetches owl:imports, then walks
// properties).
await new Promise(r => setTimeout(r, 2500));
const mutated = await page.evaluate((newVal) => {
  const det = [...document.querySelectorAll('.dk-settings sol-accordion details')].find(d => d.querySelector('summary')?.textContent.trim() === 'Default');
  const form = det?.querySelector('sol-form');
  const root = form?.shadowRoot;
  if (!root) return { ok: false, reason: 'no sol-form shadow root' };
  const inputs = [...root.querySelectorAll('input, textarea, select')];
  const inputInfo = inputs.map(i => ({
    tag: i.localName,
    type: i.type,
    name: i.name,
    value: (i.value || '').slice(0, 80),
    aria: i.getAttribute('aria-label'),
  }));
  const proxyInput = inputs.find(i => /proxy/i.test(i.getAttribute('aria-label') || '') || /proxy|^http/i.test(i.value || ''));
  if (!proxyInput) return { ok: false, reason: 'no proxy input found', inputCount: inputs.length, inputInfo };
  proxyInput.focus();
  proxyInput.value = newVal;
  proxyInput.dispatchEvent(new Event('input',  { bubbles: true }));
  proxyInput.dispatchEvent(new Event('change', { bubbles: true }));
  proxyInput.blur();
  return { ok: true, newValue: proxyInput.value };
}, TEST_PROXY);
console.log('-- (1) proxy mutation --');
console.log(JSON.stringify(mutated, null, 2));

await new Promise(r => setTimeout(r, 2000));

console.log('-- (1) sol-default after save (network) --');
console.log(JSON.stringify(reqs.filter(r => r.url.includes('data-kitchen-settings')), null, 2));
console.log('-- (1) sol-default attrs after save --');
console.log(JSON.stringify(await snapshot('after'), null, 2));

// (2) Search panel
console.log('-- (2) Search panel: form mount --');
await expandPanel('Search');
const searchMount = await page.evaluate(() => {
  const det = [...document.querySelectorAll('.dk-settings sol-accordion details')].find(d => d.querySelector('summary')?.textContent.trim() === 'Search');
  const section = det?.querySelector('.accordion-content-section');
  return {
    formMounted: !!section?.querySelector('sol-form'),
    formSubject: section?.querySelector('sol-form')?.getAttribute('subject'),
    formSaveTo:  section?.querySelector('sol-form')?.getAttribute('save-to'),
    rawHTML: section ? section.innerHTML.slice(0, 400) : null,
  };
});
console.log(JSON.stringify(searchMount, null, 2));

console.log('-- (2) PATCH-supporting URL? --');
console.log('search-engines source =', await page.evaluate(() => document.querySelector('sol-search')?.getAttribute('source')));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/save-roundtrip.png' });

console.log('-- errors (filtered) --');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
