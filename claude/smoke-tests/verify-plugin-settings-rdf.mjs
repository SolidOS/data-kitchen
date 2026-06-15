// Verify <dk-plugin-settings>: RDF-driven, in-use-gated plugin settings.
//   A) dk-podz IS in use (it's in data-kitchen-main-menu.ttl) -> the
//      "Data Kitchen Pod Browser" group renders WITHOUT the pod browser tab being
//      mounted (RDF-driven, no DOM-discovery dependency).
//   B) pointed at a menu that lacks dk-podz -> the group does NOT render (gating).
//   C) the discovery <sol-settings> accordion does not double-list "Pod".
// Run from dk root with the static server on :8081 (+ temp dk-pod symlink).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

// NOTE: pod browser tab is deliberately NOT opened (no <sol-pod> mounted).
const r = await page.evaluate(async () => {
  const host = document.getElementById('dk-content') || document.body;

  // (A) Inject the real settings page (its <dk-plugin-settings> uses menu=main-menu).
  const wrap = document.createElement('div'); wrap.id = 'diag-settings';
  wrap.innerHTML = await (await fetch('dk-pod/dk/pages/settings.html')).text();
  host.appendChild(wrap);

  // (B) A second renderer pointed at a menu doc with NO dk-podz ui:name.
  const gated = document.createElement('dk-plugin-settings');
  gated.id = 'diag-gated';
  gated.setAttribute('source', 'dk-pod/dk/ui-data/data-kitchen-settings-groups.ttl');
  gated.setAttribute('menu', 'dk-pod/dk/plugins/sol-pod/pod-settings.ttl'); // no ui:name here
  host.appendChild(gated);

  await new Promise(r => setTimeout(r, 2500));

  const podForm = [...document.querySelectorAll('#diag-settings dk-plugin-settings sol-form')]
    .find(f => (f.getAttribute('subject') || '').includes('pod-settings.ttl'));
  const formText = podForm ? (podForm.shadowRoot || podForm).textContent : '';
  const formControls = podForm ? (podForm.shadowRoot || podForm).querySelectorAll('input,select,textarea').length : 0;

  const settings = document.querySelector('#diag-settings sol-settings');
  const sRoot = settings ? (settings.shadowRoot || settings) : null;
  const heads = sRoot ? [...sRoot.querySelectorAll('div,summary,h3,h4')]
    .map(e => e.textContent.trim().split('\n')[0]).filter(Boolean) : [];

  return {
    podsMounted: document.querySelectorAll('sol-pod').length,        // expect 0
    inUseGroupRendered: !!podForm,
    inUseHeading: podForm ? podForm.closest('section')?.querySelector('h3')?.textContent : null,
    inUseHasControls: formControls,
    inUseHasHidePaths: /Hide paths/i.test(formText),
    inUseHasEditorKeys: /Editor keys/i.test(formText),
    gatedOutGroupCount: document.querySelectorAll('#diag-gated sol-form').length, // expect 0
    discoveryListsPod: heads.some(h => /\bpod\b/i.test(h)),          // expect false
  };
});

console.log('=== dk-plugin-settings (RDF-driven, in-use-gated) ===');
console.log(JSON.stringify(r, null, 2));

const ok = r.podsMounted === 0 && r.inUseGroupRendered &&
  r.inUseHeading === 'Data Kitchen Pod Browser' &&
  r.inUseHasControls > 0 && r.inUseHasHidePaths && r.inUseHasEditorKeys &&
  r.gatedOutGroupCount === 0 && r.discoveryListsPod === false;
console.log('\nRESULT:', ok ? 'PASS ✅' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
