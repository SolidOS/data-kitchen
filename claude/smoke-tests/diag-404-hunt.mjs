// Capture every failed request (status, URL, initiator) to find what
// resource sol-form is missing.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const failed = [];
page.on('response', async (resp) => {
  const status = resp.status();
  if (status >= 400 && status < 600) {
    failed.push({ status, url: resp.url(), method: resp.request().method() });
  }
});
const consoleMsgs = [];
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warn') {
    consoleMsgs.push(`${m.type()}: ${m.text()}`);
  }
});
page.on('requestfailed', req => {
  failed.push({ status: 'failed', url: req.url(), method: req.method(), reason: req.failure()?.errorText });
});

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 2500));

// Nav to Settings to trigger sol-form mounts.
await page.evaluate(() => {
  for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? [])
    if (b.textContent.trim() === 'Settings') b.click();
});
await new Promise(r => setTimeout(r, 2500));

// Force-open every panel one by one and let saves/loads run.
const summaries = await page.evaluate(async () => {
  const out = [];
  const dets = Array.from(document.querySelectorAll('sol-settings > sol-accordion > .sol-accordion-wrapper > details'));
  for (const d of dets) {
    const s = d.querySelector(':scope > summary')?.textContent.trim();
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
    out.push(s);
    await new Promise(r => setTimeout(r, 800));
  }
  return out;
});
console.log('--- panels opened ---');
console.log(summaries);

console.log('--- failed requests ---');
for (const f of failed) console.log(JSON.stringify(f));

console.log('--- console errors/warnings ---');
for (const m of consoleMsgs) {
  if (!/(CORS|net::ERR_|favicon|open-meteo|w3\.org|calendar\.google)/.test(m)) console.log(m);
}

await browser.close();
