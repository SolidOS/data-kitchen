// Verify sol-pod's settings consumption after the editorKeys/ignorePattern
// consolidation: sol-pod loads ui:ignorePattern + ui:editorKeys from its
// data-subject doc, applies glob filtering, exposes editorKeys for the live
// editor, and serializes settings back to the same Turtle shape (write-back).
//
// Run from dk root with the static server on :8081 (+ temp dk-pod symlink).
import { chromium } from 'playwright-core';

const URL = 'http://localhost:8081/index.html';
const errors = [];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });

await page.evaluate(() => {
  const host = document.getElementById('dk-content') || document.body;
  host.appendChild(document.createElement('dk-podz'));
});
// Give _loadSettings (fetch + parse) time to run on both pods.
await page.waitForTimeout(2500);

const r = await page.evaluate(() => {
  const left = document.getElementById('left-pod');
  const right = document.getElementById('right-pod');
  // Exercise the glob filter with representative names.
  const sample = [
    { name: '.hidden' }, { name: 'notes.txt' }, { name: 'draft~' },
    { name: '#auto#' }, { name: 'keep.ttl' },
  ];
  const visible = left._filterItems(sample).map(i => i.name);
  // Exercise write-back serialization (pure — no network).
  const before = left._serializeSettings();
  left._editorKeys = 'emacs';
  const afterEmacs = left._serializeSettings();
  left._editorKeys = 'default';
  return {
    leftPatterns: left._ignorePatterns,
    leftResCount: left._ignoreRes.length,
    leftEditorKeys: left.editorKeys,
    rightPatterns: right._ignorePatterns,             // both pods load+apply
    rightSkipsForm: right.hasAttribute('data-settings-skip'),
    leftSkipsForm: left.hasAttribute('data-settings-skip'),
    visibleAfterFilter: visible,
    serializeHasIgnore: /ui:ignorePattern ".\*", "\*~", "#\*#"/.test(before),
    serializeDefaultKeys: /ui:editorKeys ui:DefaultKeys/.test(before),
    serializeEmacsKeys: /ui:editorKeys ui:EmacsKeys/.test(afterEmacs),
  };
});

console.log('=== sol-pod settings verification ===');
console.log(JSON.stringify(r, null, 2));
console.log('console errors:', errors.filter(e => /sol-pod|settings|ignorePattern/.test(e)));

const ok =
  JSON.stringify(r.leftPatterns) === JSON.stringify(['.*', '*~', '#*#']) &&
  r.leftResCount === 3 &&
  r.leftEditorKeys === 'default' &&
  JSON.stringify(r.rightPatterns) === JSON.stringify(['.*', '*~', '#*#']) &&
  r.rightSkipsForm === true && r.leftSkipsForm === false &&
  JSON.stringify(r.visibleAfterFilter) === JSON.stringify(['notes.txt', 'keep.ttl']) &&
  r.serializeHasIgnore && r.serializeDefaultKeys && r.serializeEmacsKeys;

console.log('\nRESULT:', ok ? 'PASS ✅' : 'FAIL ❌');
await browser.close();
process.exit(ok ? 0 : 1);
