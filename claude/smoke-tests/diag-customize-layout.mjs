// diag-customize-layout — measure the REAL rendered Customize "choose plugins"
// layout against the running app, at 1920 wide. Reports bounding boxes, the
// resolved --font-size/--card-w/--col-2, flex-wrap state, and whether the
// right-hand targets column wrapped BELOW the catalog (y greater) vs sat beside
// it. Run from dk root with the app running (electron serves :8000).
// Uses the same playwright-core driver the repo's verify-* tests use.
import { chromium } from '/home/jeff/solid/podz/node_modules/playwright-core/index.mjs';

const URL = process.env.DK_URL || 'http://localhost:8000/index.html';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
await page.evaluate(async () => { if (window.ComponentInterop?.ready) await window.ComponentInterop.ready; });
await page.waitForTimeout(4000);

// open ☰ → Customize
await page.evaluate(async () => {
  const dd = document.querySelector('sol-dropdown-button.omp-more');
  dd?.shadowRoot?.querySelector('.sol-dd-trigger')?.click();
  await new Promise(r => setTimeout(r, 800));
  [...(dd?.shadowRoot?.querySelectorAll('.sol-dd-popup button, .sol-dd-popup a') || [])]
    .find(b => /^customize$/i.test(b.textContent.trim()))?.click();
  await new Promise(r => setTimeout(r, 5000));
});

const out = await page.evaluate(() => {
  const b = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  const cs = (el, prop) => el ? getComputedStyle(el).getPropertyValue(prop).trim() : null;

  const root = document.querySelector('#dk-menu-pane .dk-choose-plugins')
            || document.querySelector('.dk-choose-plugins');
  if (!root) return { ERROR: 'no .dk-choose-plugins found', menuPane: !!document.querySelector('#dk-menu-pane'),
                      anyChoose: !!document.querySelector('.dk-choose-plugins') };
  const mgr  = root.querySelector('sol-plugin-manager');
  const targets = root.querySelector('.dk-choose-targets');
  const menuB = root.querySelector('sol-menu-manager');
  const barB  = root.querySelector('sol-button-bar-manager');

  // ancestor chain up to <html>, crossing shadow boundaries, for any width clamp
  const chain = [];
  let n = root;
  for (let i = 0; i < 30 && n && n !== document.documentElement; i++) {
    chain.push({
      tag: n.tagName.toLowerCase() + (n.id ? '#' + n.id : '')
         + (typeof n.className === 'string' && n.className.trim() ? '.' + n.className.trim().split(/\s+/).join('.') : ''),
      box: b(n), display: cs(n, 'display'), flexWrap: cs(n, 'flex-wrap'),
      maxWidth: cs(n, 'max-width'), width: cs(n, 'width'), overflowX: cs(n, 'overflow-x'),
    });
    n = n.parentElement || (n.getRootNode() && n.getRootNode().host) || null;
  }

  const sr = mgr && mgr.shadowRoot;
  const firstCard = sr && sr.querySelector('.card:not(.ghost)');
  const cardsWrap = firstCard && firstCard.parentElement;

  return {
    rootFontSizePx: getComputedStyle(document.documentElement).fontSize,
    fontSizeVar_html: cs(document.documentElement, '--font-size'),
    fontSizeVar_choose: cs(root, '--font-size'),
    choosePlugins: { box: b(root), flexWrap: cs(root, 'flex-wrap'),
                     cardW: cs(root, '--card-w'), col2: cs(root, '--col-2') },
    manager: { box: b(mgr), minWidth: cs(mgr, 'min-width'), flexBasis: cs(mgr, 'flex-basis'),
               flexGrow: cs(mgr, 'flex-grow'), flexShrink: cs(mgr, 'flex-shrink') },
    targets: { box: b(targets), minWidth: cs(targets, 'min-width'), flexBasis: cs(targets, 'flex-basis'),
               flexGrow: cs(targets, 'flex-grow'), flexShrink: cs(targets, 'flex-shrink') },
    menuManager_box: b(menuB),
    barManager_box: b(barB),
    cardsWrap: { box: b(cardsWrap), cols: cardsWrap ? getComputedStyle(cardsWrap).gridTemplateColumns : null,
                 display: cardsWrap ? getComputedStyle(cardsWrap).display : null },
    firstCard: { box: b(firstCard), width: firstCard ? getComputedStyle(firstCard).width : null },
    targets_below_manager: (() => { const m = b(mgr), t = b(targets); return (m && t) ? (t.y >= m.y + 20) : null; })(),
    ancestorChain: chain,
  };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
