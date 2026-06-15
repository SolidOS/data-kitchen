// Verify the "Data Kitchen Pod Browser" settings (option 1): a DIRECT <sol-form>
// over sol-pod's settings doc renders on the settings page regardless of whether
// the pod browser tab is mounted, and the discovery <sol-settings> does NOT also
// list a "Pod" panel (both <sol-pod>s carry data-settings-skip).
// Run from dk root with the static server on :8081 (+ temp dk-pod symlink).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

// Mount the pod browser FIRST, so its <sol-pod>s exist — this is the case where
// a naive discovery form would double-list.
await page.evaluate(() => {
  const host = document.getElementById('dk-content') || document.body;
  host.appendChild(document.createElement('dk-podz'));
});
await page.waitForTimeout(2000);

// Inject the real settings page fragment so the direct form + discovery render.
await page.evaluate(async () => {
  const html = await (await fetch('dk-pod/dk/pages/settings.html')).text();
  const div = document.createElement('div');
  div.id = 'diag-settings';
  div.innerHTML = html;
  (document.getElementById('dk-content') || document.body).appendChild(div);
});
await page.waitForTimeout(2500);

const r = await page.evaluate(() => {
  const podsMounted = document.querySelectorAll('sol-pod').length;
  // The direct form (subject points at pod-settings.ttl)
  const forms = [...document.querySelectorAll('sol-form')];
  const podForm = forms.find(f => (f.getAttribute('subject') || '').includes('pod-settings.ttl'));
  const formText = podForm ? (podForm.shadowRoot || podForm).textContent : '';
  const formControls = podForm ? (podForm.shadowRoot || podForm).querySelectorAll('input,select,textarea').length : 0;
  // The discovery accordion
  const settings = document.querySelector('#diag-settings sol-settings');
  const sRoot = settings ? (settings.shadowRoot || settings) : null;
  const heads = sRoot ? [...sRoot.querySelectorAll('div,summary,h3,h4')]
    .map(e => e.textContent.trim().split('\n')[0]).filter(Boolean) : [];
  return {
    podsMounted,
    directFormPresent: !!podForm,
    directFormHasHidePaths: /Hide paths/i.test(formText),
    directFormHasEditorKeys: /Editor keys/i.test(formText),
    directFormControls: formControls,
    discoveryHeads: [...new Set(heads)].slice(0, 20),
    discoveryListsPod: heads.some(h => /\bpod\b/i.test(h)),
  };
});

console.log('=== Data Kitchen Pod Browser settings form ===');
console.log(JSON.stringify(r, null, 2));

const ok = r.podsMounted === 2 && r.directFormPresent &&
  r.directFormHasHidePaths && r.directFormHasEditorKeys &&
  r.directFormControls > 0 && r.discoveryListsPod === false;
console.log('\nRESULT:', ok ? 'PASS ✅' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
