// Verifies that sh:node nested-shape support surfaces the per-item
// ui:attribute Multiple inside sol-tree-edit's per-item editor:
//   Settings → Menu panel (sol-tree-edit) → drill into "Home" →
//   confirm an "Attributes" section appears with rows for the
//   schema:name=source/value=pages/home.html and trusted=true entries.
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
page.on('console', m => {
  if (m.type() === 'error') errs.push('console.error: ' + m.text());
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

// Click Settings
const navOk = await page.evaluate(() => {
  const buttons = document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? [];
  for (const b of buttons) if (b.textContent.trim() === 'Settings') { b.click(); return true; }
  return false;
});
console.log('nav→Settings:', navOk);
await new Promise(r => setTimeout(r, 2000));

// The Menu accordion panel auto-opens (first in sol-settings accordion);
// sol-tree-edit mounts inside. Verify the head section and per-item rows.
const treeState = await page.evaluate(() => {
  const tree = document.querySelector('sol-settings sol-tree-edit');
  if (!tree) return { error: 'no sol-tree-edit' };
  const summaries = Array.from(tree.querySelectorAll('summary')).map(s => s.textContent.trim());
  return {
    'sol-tree-edit present': true,
    'summaries (head + items)': summaries,
  };
});
console.log('--- sol-tree-edit on Menu panel ---');
console.log(JSON.stringify(treeState, null, 2));

// Open the "Home" item details (the per-item accordion entry) and look
// for an "Attributes" sub-section in its body.
const homeItem = await page.evaluate(async () => {
  const tree = document.querySelector('sol-settings sol-tree-edit');
  if (!tree) return { error: 'no sol-tree-edit' };
  const allDetails = Array.from(tree.querySelectorAll('details'));
  // Find a details whose summary matches "Home" (case-insensitive).
  const home = allDetails.find(d => {
    const s = d.querySelector(':scope > summary')?.textContent?.trim().toLowerCase();
    return s === 'home';
  });
  if (!home) return { error: 'no Home details', summaries: allDetails.map(d => d.querySelector(':scope > summary')?.textContent?.trim()) };
  home.open = true;
  home.dispatchEvent(new Event('toggle'));
  await new Promise(r => setTimeout(r, 800));

  // Walk the body and look for the synthesized Attributes Multiple.
  const body = home.querySelector(':scope > .accordion-body');
  if (!body) return { error: 'no accordion-body in Home details' };

  // Collect every text input / textarea / labelled field in the body
  // so the test can verify source / trusted values surface.
  const labels = Array.from(body.querySelectorAll('label')).map(l => l.textContent.trim());
  const inputs = Array.from(body.querySelectorAll('input,textarea')).map(i => ({
    type: i.tagName.toLowerCase() + (i.type ? ':' + i.type : ''),
    name: i.name || null,
    value: i.value,
  }));
  // solid-ui labels can land in spans/divs rather than <label>.
  const txtNodes = Array.from(body.querySelectorAll('div,span'))
    .map(n => n.firstChild?.nodeType === 3 ? n.firstChild.nodeValue?.trim() : null)
    .filter(Boolean);

  return {
    labels,
    inputCount: inputs.length,
    inputs,
    bodyHasAttributesWord: /attribute/i.test(body.textContent),
    bodyHasSourceValue: body.textContent.includes('pages/home.html'),
    bodyHasTrustedValue: body.textContent.includes('trusted'),
    sampleText: txtNodes.slice(0, 20),
  };
});
console.log('--- Home item drill ---');
console.log(JSON.stringify(homeItem, null, 2));

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/nested-attrs-home.png' });

console.log('--- errors (filtered) ---');
for (const e of errs) {
  if (!/(CORS|net::ERR_|favicon|\.acl|\.meta|\.well-known|open-meteo|w3\.org|calendar\.google)/.test(e)) {
    console.log(e);
  }
}

await browser.close();
