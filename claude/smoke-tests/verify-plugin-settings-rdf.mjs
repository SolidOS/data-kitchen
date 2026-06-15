// Verify <dk-plugin-settings> (manifest-driven, in-use-gated):
//   A) dk-podz IS in use (in data-kitchen-main-menu.ttl) -> its settings group
//      renders from its manifest (shape + requires .ttl), subject derived from the
//      doc's foaf:primaryTopic, WITHOUT the pod browser tab being mounted.
//   B) pointed at a menu with no plugin sources -> no group (in-use gating).
//   C) the discovery <sol-settings> accordion does not double-list "Pod".
// Run from dk root with the static server on :8081 (+ temp dk-pod symlink).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

// NOTE: pod browser tab deliberately NOT opened (no <sol-pod> mounted).
const r = await page.evaluate(async () => {
  const host = document.getElementById('dk-content') || document.body;

  // (A) the real settings page (its <dk-plugin-settings> uses menu=main-menu).
  const wrap = document.createElement('div'); wrap.id = 'diag-settings';
  wrap.innerHTML = await (await fetch('dk-pod/dk/pages/settings.html')).text();
  host.appendChild(wrap);

  // (B) a renderer pointed at a menu doc with NO plugin sources (no ui:name) -> gated out.
  const gated = document.createElement('dk-plugin-settings');
  gated.id = 'diag-gated';
  gated.setAttribute('menu', 'dk-pod/dk/plugins/podz/pod-settings.ttl');
  host.appendChild(gated);

  await new Promise(r => setTimeout(r, 3000));

  const podForm = [...document.querySelectorAll('#diag-settings dk-plugin-settings sol-form')]
    .find(f => (f.getAttribute('subject') || '').includes('pod-settings.ttl'));
  const formText = podForm ? (podForm.shadowRoot || podForm).textContent : '';
  const formControls = podForm ? (podForm.shadowRoot || podForm).querySelectorAll('input,select,textarea').length : 0;

  const settings = document.querySelector('#diag-settings sol-settings');
  const sRoot = settings ? (settings.shadowRoot || settings) : null;
  const heads = sRoot ? [...sRoot.querySelectorAll('div,summary,h3,h4')]
    .map(e => e.textContent.trim().split('\n')[0]).filter(Boolean) : [];

  return {
    podsMounted: document.querySelectorAll('sol-pod').length,            // expect 0
    inUseGroupRendered: !!podForm,
    inUseHeading: podForm ? podForm.closest('section')?.querySelector('h3')?.textContent : null,
    subjectFromPrimaryTopic: podForm ? podForm.getAttribute('subject') : null,
    inUseHasControls: formControls,
    inUseHasHidePaths: /Hide paths/i.test(formText),
    inUseHasEditorKeys: /Editor keys/i.test(formText),
    gatedOutGroupCount: document.querySelectorAll('#diag-gated sol-form').length,  // expect 0
    discoveryListsPod: heads.some(h => /\bpod\b/i.test(h)),               // expect false
  };
});

console.log('=== dk-plugin-settings (manifest-driven, in-use-gated) ===');
console.log(JSON.stringify(r, null, 2));

const ok = r.podsMounted === 0 && r.inUseGroupRendered &&
  /pod-settings\.ttl#Settings$/.test(r.subjectFromPrimaryTopic || '') &&
  r.subjectFromPrimaryTopic.includes('/plugins/podz/') &&
  r.inUseHasControls > 0 && r.inUseHasHidePaths && r.inUseHasEditorKeys &&
  r.gatedOutGroupCount === 0 && r.discoveryListsPod === false;
console.log('\nRESULT:', ok ? 'PASS ✅' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
