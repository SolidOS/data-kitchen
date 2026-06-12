// One-off: list the accordion panel headings on Customize → Preferences
// (what sol-settings discovers), to see exactly which editors are offered.
// Run from dk root with the :3000 server up. Read-only.
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page.waitForTimeout(5000);

  const heads = await page.evaluate(async () => {
    const dd = document.querySelector('sol-dropdown-button.omp-more');
    dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
    await new Promise(r => setTimeout(r, 800));
    [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a')]
      .find(b => /^customize$/i.test(b.textContent.trim()))?.click();
    await new Promise(r => setTimeout(r, 4000));
    // pick the Preferences subtab
    const sub = document.querySelector('#dk-menu-pane sol-tabs[variant="sub"]');
    [...(sub?.querySelectorAll(':scope > .sol-tabs-bar button') || [])]
      .find(b => /Preferences/.test(b.textContent))?.click();
    await new Promise(r => setTimeout(r, 4000));
    const settings = document.querySelector('#dk-menu-pane sol-settings');
    if (!settings) return ['(no sol-settings found)'];
    return [...settings.querySelectorAll('details summary, details > .accordion-head, details')]
      .map(d => (d.querySelector?.('summary') || d).textContent.trim().split('\n')[0])
      .filter(Boolean);
  });
  console.log(JSON.stringify([...new Set(heads)], null, 2));
} finally {
  await browser.close();
}
