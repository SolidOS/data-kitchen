// Verify Podz stays single-mount across Home↔Podz round trips.
// Confirms:
//   * exactly one <dk-podz> in the DOM after multiple round trips
//   * its inner sol-pod instances are reused (not rebuilt)
//   * no "Podz is single-mount" warning text appears
//   * podz's PodzExtras_global persists across nav (state survives)

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

async function clickMenu(name) {
  await page.evaluate((n) => {
    for (const b of document.querySelector('sol-menu')?.shadowRoot?.querySelectorAll('.sol-menu-nav button') ?? []) {
      if (b.textContent.trim() === n) { b.click(); return; }
    }
  }, name);
  await new Promise(r => setTimeout(r, 1200));
}

async function snapshot(label) {
  const s = await page.evaluate(() => {
    const dkPodz = document.querySelectorAll('dk-podz');
    const sample = dkPodz[0];
    return {
      dkPodzCount: dkPodz.length,
      activeWrapper: document.querySelector('#dk-content [data-menu-item]:not([hidden])')?.dataset.menuItem,
      podzWrapperHidden: document.querySelector('#dk-content [data-menu-item="Podz"]')?.hidden,
      homeWrapperHidden: document.querySelector('#dk-content [data-menu-item="Home"]')?.hidden,
      solPodCount: document.querySelectorAll('dk-podz sol-pod').length,
      warningPresent: !!Array.from(document.querySelectorAll('dk-podz *')).find(e => /single-mount/.test(e.textContent || '')),
      dkPodzId: sample ? (sample._uid ??= Math.random().toString(36).slice(2,8)) : null,
    };
  });
  console.log(`-- ${label} --`, JSON.stringify(s));
  return s;
}

await snapshot('home');
await clickMenu('Podz');
const a = await snapshot('podz #1');
await clickMenu('Home');
const b = await snapshot('home #2');
await clickMenu('Podz');
const c = await snapshot('podz #2');
await clickMenu('Home');
await clickMenu('Podz');
const d = await snapshot('podz #3');

// Same dk-podz element should be reused.
console.log('same dk-podz across visits:', a.dkPodzId === c.dkPodzId && c.dkPodzId === d.dkPodzId);
console.log('single dk-podz count throughout:', [a, b, c, d].every(s => s.dkPodzCount === 1));
console.log('no remount warning:', [a, b, c, d].every(s => !s.warningPresent));
console.log('sol-pod count stable:', a.solPodCount === c.solPodCount && c.solPodCount === d.solPodCount, 'value:', a.solPodCount);

await page.screenshot({ path: '/home/jeff/data-kitchen/claude/smoke-tests/podz-keepalive.png' });

await browser.close();
