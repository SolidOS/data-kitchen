// sol-include trusted=light-DOM smoke test
//
// Verifies that the Settings page renders correctly now that
// `sol-include` with `trusted` puts its content in LIGHT DOM rather
// than shadow DOM. Walks through:
//
//   1. Open dk against the live CSS at :3000.
//   2. Click the Settings menu item — it instantiates
//      `<sol-include source="pages/settings.html" trusted>`.
//   3. Confirm the rendered `<section class="dk-settings">` is a
//      LIGHT-DOM child of the sol-include, not in its shadow root.
//   4. Confirm `.dk-settings` host CSS reaches the section
//      (max-width: 88rem, padding non-zero, header h2 styled).
//   5. Confirm `dk-settings.js`'s populator filled the inner
//      `<sol-accordion>` with the four widget panels.
//
// Run from project root:
//   node claude/smoke-tests/sol-include-trusted.mjs
//
// (Imports playwright from podz's node_modules — dk doesn't carry
// the dependency, and pulling it in just for this smoke test isn't
// worth the install footprint.)

import playwrightPkg from '/home/jeff/solid/podz/node_modules/playwright/index.js';
const { chromium } = playwrightPkg;

const URL = 'http://localhost:3000/data-kitchen/';

function fail(msg)  { console.error('  FAIL:', msg); process.exitCode = 1; }
function pass(msg)  { console.log('  pass:', msg); }
function step(msg)  { console.log('\n• ' + msg); }

const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const ctx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

page.on('console',   m => { if (m.type() === 'error') console.log('[console error]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));

step('Loading ' + URL);
await page.goto(URL, { waitUntil: 'domcontentloaded' });

step('Waiting for sol-menu to upgrade and render the nav items');
await page.waitForFunction(() => {
  const menu = document.querySelector('sol-menu');
  if (!menu?.shadowRoot) return false;
  // sol-menu renders nav items as <button role="menuitem">.
  const items = menu.shadowRoot.querySelectorAll('[role="menuitem"]');
  return Array.from(items).some(b => /settings/i.test(b.textContent));
}, { timeout: 10000 });
pass('sol-menu rendered with Settings menu item');

step('Clicking the Settings menu item');
await page.evaluate(() => {
  const menu = document.querySelector('sol-menu');
  const items = menu.shadowRoot.querySelectorAll('[role="menuitem"]');
  const settings = Array.from(items).find(b => /settings/i.test(b.textContent));
  settings.click();
});

step('Waiting for sol-include to load pages/settings.html');
await page.waitForFunction(() => {
  // After click, sol-menu's ui:linkTarget routing places a
  // <sol-include source="pages/settings.html" trusted> inside
  // <main id="dk-content">. Wait for the .dk-settings section to
  // appear anywhere in the page DOM.
  return !!document.querySelector('section.dk-settings');
}, { timeout: 5000 });
pass('.dk-settings section is present in document DOM');

step('Verifying the section is in LIGHT DOM (under sol-include, not in its shadow)');
const placement = await page.evaluate(() => {
  const sec = document.querySelector('section.dk-settings');
  if (!sec) return { ok: false, reason: 'no section' };
  // Walk up to find the containing sol-include.
  let host = sec.parentElement;
  while (host && host.localName !== 'sol-include') host = host.parentElement;
  if (!host) return { ok: false, reason: 'no sol-include ancestor' };

  // The sol-include must NOT have the same .dk-settings inside its
  // shadow root — otherwise we accidentally rendered to both, or
  // light-DOM render didn't trigger.
  const inShadow = host.shadowRoot?.querySelector('section.dk-settings') ?? null;
  // The sol-include must have an `.si-content` direct child in light
  // DOM (that's the wrapper the trusted branch appends).
  const siContent = Array.from(host.children).find(c => c.classList?.contains('si-content'));

  return {
    ok: !inShadow && !!siContent,
    inShadowDOM: !!inShadow,
    hasLightSiContent: !!siContent,
    sectionRoot: sec.getRootNode() === document ? 'document' : 'shadow',
  };
});
if (placement.ok)            pass('section is in light DOM under <sol-include> .si-content');
else                          fail('placement check failed: ' + JSON.stringify(placement));

step('Verifying host CSS reaches the trusted content');
const css = await page.evaluate(() => {
  const sec = document.querySelector('section.dk-settings');
  const h2  = sec?.querySelector('h2');
  if (!sec || !h2) return { ok: false, reason: 'missing sec or h2' };
  const secStyle = getComputedStyle(sec);
  const h2Style  = getComputedStyle(h2);
  return {
    ok: true,
    secMaxWidth: secStyle.maxWidth,
    secPadding: secStyle.padding,
    h2FontSize: h2Style.fontSize,
    h2FontWeight: h2Style.fontWeight,
  };
});
// dk-styles.css: .dk-settings { max-width: 88rem; padding: 24px clamp(...); }
// rem is relative to <html> (browser default 16px), not body. The body's
// 18px font-size doesn't affect rem.
const expected = 88 * 16;
if (css.secMaxWidth === `${expected}px`) {
  pass(`max-width = ${css.secMaxWidth} (matches .dk-settings's 88rem rule)`);
} else {
  fail(`max-width = ${css.secMaxWidth}, expected ${expected}px — host CSS did not reach the section`);
}
if (css.secPadding && css.secPadding !== '0px') pass(`padding = ${css.secPadding} (non-zero)`);
else fail(`padding = ${css.secPadding} — looks like the .dk-settings rule is not applying`);
if (parseFloat(css.h2FontSize) > 18) pass(`h2 font-size = ${css.h2FontSize} (styled, not default)`);
else fail(`h2 font-size = ${css.h2FontSize} — h2 styling didn't reach the trusted content`);

step('Verifying dk-settings.js populated the accordion');
const accordion = await page.evaluate(() => {
  const sec = document.querySelector('section.dk-settings');
  const ac  = sec?.querySelector('sol-accordion');
  if (!ac) return { ok: false, reason: 'no <sol-accordion>' };
  // dk-settings.js appends one <div> child per widget. There are
  // four known widgets (Main Menu, Weather, Time, Calendar).
  const panelCount = ac.children.length;
  // Inside each panel there should be the appropriate editor
  // element (sol-tree-edit for menu, sol-form for the others).
  const editorTags = Array.from(ac.children).map(panel => {
    const inner = panel.querySelector('sol-form, sol-tree-edit');
    return inner?.localName ?? null;
  });
  return { ok: true, panelCount, editorTags };
});
if (accordion.ok && accordion.panelCount === 4) {
  pass(`accordion has 4 panels: ${accordion.editorTags.join(', ')}`);
} else {
  fail(`accordion state unexpected: ${JSON.stringify(accordion)}`);
}

step('Saving screenshot for visual confirmation');
await page.screenshot({
  path: 'claude/smoke-tests/sol-include-trusted.png',
  fullPage: true,
});
pass('claude/smoke-tests/sol-include-trusted.png');

await browser.close();

if (process.exitCode) {
  console.log('\nSmoke test FAILED — see above.');
} else {
  console.log('\nSmoke test PASSED — trusted=light-DOM works end-to-end.');
}
