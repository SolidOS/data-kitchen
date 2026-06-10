import puppeteer from 'puppeteer-core';
const URL = 'http://localhost:3000/solid/open_media_player/';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
let fails = 0;
const check = (ok, m) => { console.log(`${ok?'✓':'✗'} ${m}`); if(!ok) fails++; };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 5,
    { timeout: 20000 });
  // Go to Movies
  await page.evaluate(() =>
    document.querySelector('#omp-tabs > .sol-tabs-bar > button[data-tab-id="panel-movies"]').click());
  await page.waitForFunction(() => {
    const l = document.querySelector('#panel-movies .ia-sources-list');
    return l && /Favorites/.test(l.textContent);
  }, { timeout: 30000 });
  // Click the ★ Favorites source
  await page.evaluate(() =>
    [...document.querySelectorAll('#panel-movies .ia-sources-list li')]
      .find(li => /★\s*Favorites/.test(li.textContent))?.click());
  // Wait for the favourited test film row to appear AND be visible
  const res = await page.waitForFunction(() => {
    const root = document.getElementById('panel-movies');
    const app = root.querySelector('.ia-player-app');
    const wrap = root.querySelector('.ia-tracklist-wrap');
    const rows = [...root.querySelectorAll('.ia-track-row')].map(r => r.textContent);
    const hit = rows.find(t => /ZZ Test Film/.test(t));
    if (!hit) return false;
    const cs = getComputedStyle(wrap);
    return {
      hasRow: !!hit,
      wrapDisplay: cs.display,
      wrapVisible: cs.display !== 'none' && wrap.offsetHeight > 0,
      sourceFav: app.classList.contains('source-favorites'),
      mediaVideo: app.classList.contains('media-video'),
    };
  }, { timeout: 15000, polling: 300 }).then(h => h.jsonValue()).catch(() => null);

  check(!!res, 'favourited film row appears in Movies Favorites view');
  if (res) {
    check(res.mediaVideo, 'panel is in media-video (movies) mode');
    check(res.sourceFav, 'app has source-favorites class');
    check(res.wrapDisplay !== 'none', `tracklist-wrap is shown (display=${res.wrapDisplay})`);
    check(res.wrapVisible, 'tracklist-wrap is actually visible (offsetHeight>0)');
  }
  check(errors.length === 0, `no page errors${errors.length?' — '+errors.join('; '):''}`);
} finally { await browser.close(); }
console.log(fails ? `\n${fails} failure(s)` : '\nPASS: starred movies show in fav list');
process.exit(fails ? 1 : 0);
