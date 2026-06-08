import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const events = [];
page.on('console', m => { if (/dk-prefs|sol-form|shape-to-form/.test(m.text())) events.push(m.type() + ': ' + m.text()); });
page.on('request', req => { if (req.url().includes('dk-prefs.ttl')) events.push('REQ ' + req.method() + ' ' + req.url()); });
page.on('response', r => { if (r.url().includes('dk-prefs.ttl')) events.push('RESP ' + r.status() + ' ' + r.request().method() + ' ' + r.url()); });
page.on('pageerror', e => events.push('PAGEERR ' + e.message));

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => document.querySelector('sol-button[name=Settings]').shadowRoot.querySelector('.sol-button-trigger').click());
await new Promise(r => setTimeout(r, 3500));

const before = await page.evaluate(() => document.documentElement.dataset.theme);
console.log('theme before:', before);

// Find the dropdown via deep shadow path and select Dark using a more
// realistic interaction (focus, set value, fire input + change).
const result = await page.evaluate(() => {
  const body = document.querySelector('.dk-settings sol-form').shadowRoot.querySelector('.sol-form-shape-fields');
  const row = Array.from(body.querySelectorAll('.sol-form-shape-key')).find(r => r.dataset.key === 'colorScheme');
  const sel = row.querySelector('select');
  if (!sel) return { ok: false, why: 'no select' };
  const darkOpt = Array.from(sel.options).find(o => o.text === 'Dark');
  sel.focus();
  sel.value = darkOpt.value;
  sel.dispatchEvent(new Event('input',  { bubbles: true }));
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: sel.value, hasOnChange: typeof sel.onchange };
});
console.log('changed:', JSON.stringify(result));

await new Promise(r => setTimeout(r, 2500));
const after = await page.evaluate(() => document.documentElement.dataset.theme);
console.log('theme after:', after);
const kbAfter = await page.evaluate(() => {
  const kb = window.solidLogic?.store;
  if (!kb) return 'no kb';
  return kb.statementsMatching(null, { termType: 'NamedNode', value: 'http://www.w3.org/ns/ui#colorScheme' }, null)
    .map(s => s.subject.value + ' → ' + s.object.value);
});
console.log('kb colorScheme triples:', kbAfter);

const ttl = await (await fetch('http://localhost:3000/data-kitchen/data/dk-prefs.ttl')).text();
console.log('current ttl:');
console.log(ttl);

console.log('\n--- events ---');
events.forEach(e => console.log(e));

await browser.close();
