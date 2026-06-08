import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const reqs = [];
const failed = [];
page.on('response', r => reqs.push({ url: r.url(), status: r.status() }));
page.on('requestfailed', r => failed.push({ url: r.url(), err: r.failure()?.errorText }));
const consoleMsgs = [];
page.on('console', m => consoleMsgs.push({ type: m.type(), text: m.text() }));
page.on('pageerror', e => consoleMsgs.push({ type: 'pageerror', text: e.message }));

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 3500));

const customs = await page.evaluate(() => {
  const names = ['sol-menu','sol-time','sol-weather','sol-calendar','sol-feed','sol-pod','sol-modal','dk-dashboard','dk-podz'];
  const result = {};
  for (const n of names) {
    const ctor = customElements.get(n);
    result[n] = ctor ? ctor.name : null;
  }
  const time = document.querySelector('sol-time');
  result['sol-time.shadowRoot'] = time ? !!time.shadowRoot : 'no element';
  result['sol-time.outerHTML.length'] = time ? time.outerHTML.length : 0;
  if (time && time.shadowRoot) {
    result['sol-time.shadow.innerHTML.length'] = time.shadowRoot.innerHTML.length;
    result['sol-time.shadow.text'] = time.shadowRoot.textContent?.slice(0, 80);
  }
  return result;
});

console.log('--- custom elements registered ---');
for (const [k,v] of Object.entries(customs)) console.log(k, '=', v);
console.log('--- failed requests ---');
for (const f of failed) console.log(f.err, f.url);
console.log('--- non-200 responses ---');
for (const r of reqs) if (r.status >= 400) console.log(r.status, r.url);
console.log('--- console errors / warnings ---');
for (const m of consoleMsgs) if (['error','warning','pageerror'].includes(m.type)) console.log(m.type, m.text);

await browser.close();
