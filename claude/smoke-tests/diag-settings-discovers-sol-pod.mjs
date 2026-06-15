// Diagnose whether <sol-settings> discovers <sol-pod> for the settings form,
// and prove the dependency on the pod browser being mounted (it's a deferred
// tab). Mounts a fresh <sol-settings> before and after mounting <dk-podz>.
// Run from dk root with the static server on :8081 (+ temp dk-pod symlink).
import { chromium } from 'playwright-core';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto('http://localhost:8081/index.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

async function discover(tag) {
  return page.evaluate(async (id) => {
    document.getElementById(id)?.remove();
    const s = document.createElement('sol-settings');
    s.id = id;
    document.body.appendChild(s);
    await new Promise(r => setTimeout(r, 1200));
    const root = s.shadowRoot || s;
    const heads = [...root.querySelectorAll('div, summary, h3, h4')]
      .map(e => e.textContent.trim().split('\n')[0]).filter(Boolean);
    return { count: heads.length, heads: [...new Set(heads)].slice(0, 30) };
  }, tag);
}

const before = await discover('diag-before');

// Mount the pod browser (the deferred tab) so its <sol-pod> elements exist.
await page.evaluate(() => {
  const host = document.getElementById('dk-content') || document.body;
  host.appendChild(document.createElement('dk-podz'));
});
await page.waitForTimeout(2500);
const podsMounted = await page.evaluate(() => document.querySelectorAll('sol-pod').length);

const after = await discover('diag-after');

console.log('=== sol-settings discovery ===');
console.log('sol-pod elements mounted after opening pod browser:', podsMounted);
console.log('BEFORE dk-podz mounted:', JSON.stringify(before, null, 2));
console.log('AFTER  dk-podz mounted:', JSON.stringify(after, null, 2));
console.log('\nAFTER heads mention Pod/sol-pod:',
  after.heads.some(h => /pod/i.test(h)));

await browser.close();
