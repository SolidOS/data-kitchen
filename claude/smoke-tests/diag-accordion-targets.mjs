// Customize ▸ choose plugins: the menu/bar editors are an exclusive
// accordion (accordion="targets") — menu open + bar closed initially, the
// new headings show, clicking the bar header opens it AND closes the menu,
// clicking the menu header swaps back, clicking the open header is a no-op.
// Read-only (no saves). Run from dk root with the :3000 server up.
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const fails = [];
const check = (name, ok, detail = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); if (!ok) fails.push(name); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
try {
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
  await page.waitForTimeout(5000);

  // open ☰ Customize; the choose-plugins subtab is auto-selected
  await page.evaluate(async () => {
    const dd = document.querySelector('sol-dropdown-button.omp-more');
    dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
    await new Promise(r => setTimeout(r, 800));
    [...dd.shadowRoot.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a')]
      .find(b => /^customize$/i.test(b.textContent.trim()))?.click();
    await new Promise(r => setTimeout(r, 5000));
  });

  const state = () => page.evaluate(() => {
    const root = document.querySelector('#dk-menu-pane .dk-choose-targets');
    const menu = root?.querySelector('sol-menu-manager');
    const bar = root?.querySelector('sol-button-bar-manager');
    const visible = (m) => {
      const tree = m?.shadowRoot?.querySelector('ul.tree');
      return !!tree && getComputedStyle(tree).display !== 'none';
    };
    return {
      menuTitle: menu?.shadowRoot?.querySelector('.builder-title')?.textContent ?? null,
      barTitle: bar?.shadowRoot?.querySelector('.builder-title')?.textContent ?? null,
      menuOpen: menu?.hasAttribute('open'), barOpen: bar?.hasAttribute('open'),
      menuBody: visible(menu), barBody: visible(bar),
      menuHeadShown: !!menu?.shadowRoot?.querySelector('.builder-head')?.checkVisibility?.(),
      barHeadShown: !!bar?.shadowRoot?.querySelector('.builder-head')?.checkVisibility?.(),
    };
  });
  const clickHead = (tag) => page.evaluate(async (t) => {
    document.querySelector(`#dk-menu-pane .dk-choose-targets ${t}`)
      ?.shadowRoot?.querySelector('.builder-head')?.click();
    await new Promise(r => setTimeout(r, 300));
  }, tag);

  let s = await state();
  check('headings renamed', s.menuTitle === 'Customize Menu Tabs' && s.barTitle === 'Customize Top Row Buttons',
    `${s.menuTitle} | ${s.barTitle}`);
  check('initial: menu open, bar closed', s.menuOpen && s.menuBody && !s.barOpen && !s.barBody, JSON.stringify(s));
  check('both headers visible', s.menuHeadShown && s.barHeadShown);

  await clickHead('sol-button-bar-manager');
  s = await state();
  check('bar header click: bar opens, menu closes', s.barOpen && s.barBody && !s.menuOpen && !s.menuBody, JSON.stringify(s));

  await clickHead('sol-menu-manager');
  s = await state();
  check('menu header click: swaps back', s.menuOpen && s.menuBody && !s.barOpen && !s.barBody, JSON.stringify(s));

  await clickHead('sol-menu-manager');
  s = await state();
  check('clicking the open header is a no-op (one always open)', s.menuOpen && s.menuBody && !s.barOpen, JSON.stringify(s));

  await page.screenshot({ path: 'claude/smoke-tests/accordion-targets.png' });
} finally {
  await browser.close();
}
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
