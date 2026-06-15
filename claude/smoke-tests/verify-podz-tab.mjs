// Exercise the podz tab end-to-end: mount <dk-podz>, which dynamically imports
// the refreshed ESM podz bundle. Confirms the bundle loads, shares dk's single
// rdflib instance (no second copy), self-instantiates without error, and the
// sol-pod elements upgrade. Run from dk root with the server on :8081.
import { chromium } from 'playwright-core';

const URL = 'http://localhost:8081/index.html';
const errors = [];
const requests = [];
const failed = [];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('requestfinished', async r => { requests.push(r.url()); const resp = await r.response(); if (resp && resp.status() >= 400) failed.push(resp.status() + ' ' + r.url()); });
page.on('requestfailed', r => { if (!/api\.|w3\.org|google|esm\.sh|cdn/.test(r.url())) failed.push('FAILED ' + r.url()); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

const errCountBeforePodz = errors.length;

// Mount the podz tab the way the menu does: a <dk-podz> in #dk-content.
await page.evaluate(() => {
  const el = document.createElement('dk-podz');
  document.getElementById('dk-content').appendChild(el);
});
// podz fetches its template, then dynamically imports the ESM bundle + sol-modal etc.
await page.waitForTimeout(4000);

const result = await page.evaluate(() => ({
  dkPodzPresent: !!document.querySelector('dk-podz'),
  podsInDom: document.querySelectorAll('dk-podz sol-pod').length,
  solPodDefined: !!customElements.get('sol-pod'),
  solModalDefined: !!customElements.get('sol-modal'),
  authManager: !!(window.SolidWebComponents?.AuthManager),
}));

const podzBundleReqs = requests.filter(u => /podz\.bundle\.min\.js/.test(u));
const rdflibReqs = [...new Set(requests.filter(u => /\/rdflib(\.|\/)/i.test(u)))];
const solComponentsModuleReqs = requests.filter(u => /sol-components\/(core|web)\//.test(u)).slice(0, 12);
const podzErrors = errors.slice(errCountBeforePodz);

console.log('\n=== PODZ TAB ===');
console.log('dk-podz present       :', result.dkPodzPresent);
console.log('sol-pod elements in DOM:', result.podsInDom);
console.log('sol-pod defined       :', result.solPodDefined);
console.log('sol-modal defined     :', result.solModalDefined);
console.log('AuthManager intact    :', result.authManager);

console.log('\n=== podz ESM bundle requested? ===');
console.log(podzBundleReqs.length ? podzBundleReqs.join('\n') : '(NOT requested — dk-podz did not load it)');

console.log('\n=== rdflib instances (should stay 1) ===');
console.log(rdflibReqs.length, rdflibReqs.join('\n'));

console.log('\n=== sol-components core/web modules pulled by podz (sample) ===');
console.log(solComponentsModuleReqs.length ? solComponentsModuleReqs.join('\n') : '(none yet)');

console.log('\n=== FAILED REQUESTS (non-external) ===');
console.log(failed.length ? failed.join('\n') : '(none)');

console.log('\n=== CONSOLE ERRORS AFTER MOUNTING PODZ ===');
console.log(podzErrors.length ? podzErrors.join('\n---\n') : '(none)');

await browser.close();
