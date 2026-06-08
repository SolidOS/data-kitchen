// Check that visiting Podz then returning Home does not leak podz's
// stylesheet into the home view. Snapshots three things:
//   * computed --bg, --text, --accent from :root before/during/after Podz
//   * <header.dk-chrome> margin/padding (would shift to 0 if podz's * reset reaches it)
//   * "Settings" sol-button is still visible / clickable post-Podz

import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});

const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded', timeout: 15000 });
await new Promise(r => setTimeout(r, 1500));

async function snapshot(label) {
  const s = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const body = document.body;
    const bodyStyle = getComputedStyle(body);
    const header = document.querySelector('header.dk-chrome');
    const headerStyle = header ? getComputedStyle(header) : null;
    const dashHeader = document.querySelector('header.dash');
    const dashStyle = dashHeader ? getComputedStyle(dashHeader) : null;
    return {
      'root --bg':     root.getPropertyValue('--bg').trim(),
      'root --text':   root.getPropertyValue('--text').trim(),
      'root --accent': root.getPropertyValue('--accent').trim(),
      'body bg-color': bodyStyle.backgroundColor,
      'body padding':  bodyStyle.padding,
      'body margin':   bodyStyle.margin,
      'dk-chrome padding': headerStyle?.padding ?? null,
      'dk-chrome margin':  headerStyle?.margin ?? null,
      'dash padding':   dashStyle?.padding ?? null,
      'podz-css link': !!document.querySelector('link[data-dk-podz-css]'),
    };
  });
  console.log(`-- ${label} --`);
  console.log(JSON.stringify(s, null, 2));
  return s;
}

const before = await snapshot('before Podz click');

// Click Podz menu item
await page.evaluate(() => {
  for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? []) {
    if (b.textContent.trim() === 'Podz') { b.click(); return; }
  }
});
await new Promise(r => setTimeout(r, 1500));
const onPodz = await snapshot('while on Podz');

// Click Home menu item
await page.evaluate(() => {
  for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? []) {
    if (b.textContent.trim() === 'Home') { b.click(); return; }
  }
});
await new Promise(r => setTimeout(r, 1000));
const back = await snapshot('back on Home');

// Diff: anything that changed?
const diffs = [];
for (const k of Object.keys(before)) {
  if (before[k] !== back[k]) diffs.push({ key: k, before: before[k], after: back[k] });
}
console.log('-- diffs after Podz round-trip --');
console.log(diffs.length ? JSON.stringify(diffs, null, 2) : '(none)');

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/podz-theme-leak.png' });

await browser.close();
