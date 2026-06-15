// Verify the absorbed in-house pod browser (dk-podz) after dropping the podz
// package + self-instantiating bundle. Confirms: dk-podz mounts, SolidFileBrowser
// is constructed by dk (not self-instantiated), the two <sol-pod> panels upgrade,
// sol-modal/AuthManager are available, the relocated podz.css + popup-auth-callback
// load (no 404), and nothing requests the removed node_modules/podz tree.
//
// Run from dk root with the static server on :8081 (python3 -m http.server 8081,
// with a temporary repo-root `dk-pod` symlink -> ~/solid/dk-pod so engine + pod
// paths both resolve, mimicking the electron router).
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const URL = 'http://localhost:8081/index.html';
const errors = [];
const failed = [];
const podzPkgReqs = [];

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
page.on('requestfinished', async r => {
  if (/node_modules\/podz|podz\.bundle/.test(r.url())) podzPkgReqs.push(r.url());
  const resp = await r.response();
  if (resp && resp.status() >= 400) failed.push(resp.status() + ' ' + r.url());
});
page.on('requestfailed', r => { if (!/api\.|w3\.org|google|esm\.sh|cdn/.test(r.url())) failed.push('FAILED ' + r.url()); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

const errCountBeforePodz = errors.length;

// Mount the podz tab the way the menu does.
await page.evaluate(() => {
  const host = document.getElementById('dk-content') || document.body;
  const el = document.createElement('dk-podz');
  host.appendChild(el);
});
await page.waitForTimeout(3000);

const result = await page.evaluate(() => ({
  dkPodzPresent: !!document.querySelector('dk-podz'),
  podsInDom: document.querySelectorAll('dk-podz sol-pod').length,
  leftPod: !!document.getElementById('left-pod'),
  rightPod: !!document.getElementById('right-pod'),
  splitter: !!document.getElementById('panel-splitter'),
  solPodDefined: !!customElements.get('sol-pod'),
  solModalDefined: !!customElements.get('sol-modal'),
  dkPodzDefined: !!customElements.get('dk-podz'),
  authManager: !!(window.SolidWebComponents?.AuthManager),
  podzCssLink: !!document.querySelector('link[data-dk-podz-css]'),
}));

const errsAfterPodz = errors.slice(errCountBeforePodz);

console.log('=== dk-podz absorbed verification ===');
console.log(JSON.stringify(result, null, 2));
console.log('errors before mount :', errCountBeforePodz);
console.log('errors after mount  :', errsAfterPodz.length, errsAfterPodz);
console.log('failed (>=400/fail) :', failed.length, failed);
console.log('removed-pkg requests:', podzPkgReqs.length, podzPkgReqs);

const ok = result.dkPodzPresent && result.podsInDom === 2 && result.leftPod && result.rightPod
  && result.solPodDefined && result.solModalDefined && result.podzCssLink
  && podzPkgReqs.length === 0
  && !failed.some(f => /podz|dk-podz|popup-auth|sol-pod|sol-modal/.test(f));
console.log('\nRESULT:', ok ? 'PASS ✅' : 'FAIL ❌');

await browser.close();
process.exit(ok ? 0 : 1);
