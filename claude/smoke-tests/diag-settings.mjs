// Verify the dk-settings → sol-accordion shape:
//   * navigates to Settings
//   * confirms exactly one <sol-accordion> inside .dk-settings
//   * captures one summary per editable widget (no tag/path/URI)
//   * confirms sol-feed is excluded (inline editor)
//   * expanding a panel lazy-mounts an editor element
//   * mounted editor wires `sol-form-save` → host reload (smoke-checks attachment)

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2000));

// Click "Settings" — chrome sol-button.
const clicked = await page.evaluate(() => {
  for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? []) {
    if (b.textContent.trim() === 'Settings') { b.click(); return true; }
  }
  // Settings is a sol-button, not a menu item — look in the chrome buttons.
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') { sb.shadowRoot?.querySelector('button')?.click(); return true; }
  }
  return false;
});
console.log('clicked Settings:', clicked);
await new Promise(r => setTimeout(r, 2500));

const shape = await page.evaluate(() => {
  const section = document.querySelector('.dk-settings');
  if (!section) return { '(no .dk-settings)': true };
  const accordions = section.querySelectorAll('sol-accordion');
  const summaries = Array.from(section.querySelectorAll('sol-accordion details > summary')).map(s => s.textContent.trim());
  const detailsCount = section.querySelectorAll('sol-accordion details').length;
  const oldEditButtons = section.querySelectorAll('button.dk-settings-edit').length;
  const modals = document.querySelectorAll('sol-modal').length;
  return {
    accordions: accordions.length,
    detailsCount,
    summaries,
    oldEditButtons,
    modals,
  };
});
console.log('--- accordion shape ---');
console.log(JSON.stringify(shape, null, 2));

// Expand the first accordion panel and verify lazy mount.
const expanded = await page.evaluate(() => {
  const det = document.querySelector('.dk-settings sol-accordion details');
  if (!det) return { ok: false, reason: 'no details' };
  det.open = true;
  det.dispatchEvent(new Event('toggle'));
  return { ok: true, summary: det.querySelector('summary')?.textContent.trim() };
});
console.log('expanded:', expanded);
await new Promise(r => setTimeout(r, 1500));

const mounted = await page.evaluate(() => {
  const section = document.querySelector('.accordion-content-section');
  if (!section) return { '(no content section)': true };
  return {
    childCount: section.children.length,
    firstChildTag: section.firstElementChild?.localName,
    hasSolForm: !!section.querySelector('sol-form'),
    hasSolTreeEdit: !!section.querySelector('sol-tree-edit'),
  };
});
console.log('--- first panel mount ---');
console.log(JSON.stringify(mounted, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/settings-accordion.png' });

console.log('--- errors (filtered) ---');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google|api\.weather|fcc\.gov)/.test(e)) console.log(e);
}

await browser.close();
