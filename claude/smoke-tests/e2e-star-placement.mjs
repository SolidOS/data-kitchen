/**
 * e2e-star-placement.mjs — verify the favourite-star relocation:
 *
 *   • Movies: NO star on the video player (the film-intro overlay) — the
 *     `.ia-film-intro-fav` button is gone. Instead each film row in the
 *     Movies column carries a `.ia-row-fav` ☆, the way images are starred.
 *     Clicking it (and naming the favourite) adds it to the communal wall
 *     and lights the row's ★.
 *   • Music: the tracklist's action cell (col-remove) holds the ☆ favourite
 *     toggle — the old ✕ "remove from list" is gone.
 *
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-star-placement.mjs
 */
import puppeteer from 'puppeteer-core';
const BASE = 'http://localhost:3000/solid/open_media_player/';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };

// Favourites created via the app during the run, cleaned up in `finally`.
const created = [];
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1320, height: 860 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 4,
    { timeout: 20000 });
  const clickTab = (id) => page.evaluate((id) =>
    document.querySelector(`#omp-tabs > .sol-tabs-bar > button[data-tab-id="${id}"]`).click(), id);

  // ---- 1) No star on the video player anywhere ----
  const noFilmStar = await page.evaluate(() =>
    document.querySelectorAll('.ia-film-intro-fav').length === 0);
  check(noFilmStar, 'no `.ia-film-intro-fav` button (star removed from the video player)');

  // ---- 2) Music: a real library track shows the ☆ in its action cell (no ✕),
  //          and starring it lands the track in the ★ Favorites list. ----
  await clickTab('Music');
  await page.waitForFunction(() => document.querySelector('#panel-music .ia-artist-search-input'), { timeout: 30000 });
  // The artist-search box loads albums without the genre/artist cascade.
  await page.type('#panel-music .ia-artist-search-input', 'Grateful Dead');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() =>
    document.querySelectorAll('#panel-music [data-column="album"] .ia-listbox-item:not(.ia-listbox-all)').length > 0,
    { timeout: 30000 });
  // Click albums until one yields tracks.
  let musicTracks = false;
  for (let i = 0; i < 5 && !musicTracks; i++) {
    await page.evaluate((i) =>
      document.querySelectorAll('#panel-music [data-column="album"] .ia-listbox-item:not(.ia-listbox-all)')[i]?.click(), i);
    musicTracks = await page.waitForFunction(() =>
      document.querySelectorAll('#panel-music .ia-track-row').length > 0, { timeout: 12000 }).then(() => true).catch(() => false);
  }
  check(musicTracks, 'Music: a search loads playable tracks into the queue');
  const music = await page.evaluate(() => {
    const row = document.querySelector('#panel-music .ia-track-row');
    const action = row.querySelector('.col-remove');
    return {
      starInAction: !!action.querySelector('.ia-track-fav-btn'),
      xInAction: !!action.querySelector('.ia-track-remove-btn'),
      titleHasStar: !!row.querySelector('.col-title .ia-track-fav-btn'),
      title: row.querySelector('.col-title')?.textContent?.trim(),
    };
  });
  check(music.starInAction, 'Music: the track\'s action cell holds the ☆ favourite toggle');
  check(!music.xInAction, 'Music: no ✕ "remove from list" in the action cell');
  check(!music.titleHasStar, 'Music: star is not duplicated in the title cell');
  // Star it, confirm, then confirm it shows in the Community Favorites section.
  await page.evaluate(() => document.querySelector('#panel-music .ia-track-row .ia-track-fav-btn').click());
  await page.waitForSelector('.omp-fav-overlay .omp-fav-add', { timeout: 8000 });
  await page.click('.omp-fav-overlay .omp-fav-add');
  const musicInFav = await page.waitForFunction((t) =>
    [...document.querySelectorAll('#panel-music .ia-favourites-list .ia-listbox-item')].some(li => li.textContent.includes(t)),
    { timeout: 15000 }, music.title).then(() => true).catch(() => false);
  check(musicInFav, `Music: starred track "${music.title}" shows in the Community Favorites section`);
  check(await page.evaluate(() => document.querySelector('#panel-music #ia-h-favs')?.textContent.trim() === 'Community Favorites'),
    'Music: favourites section is headed "Community Favorites"');
  // Record the favourite created via the app so `finally` can clean it up.
  if (music.title) {
    const newFile = await page.evaluate(async (base, title) => {
      const t = await (await fetch(base + 'favourites/', { headers: { Accept: 'text/turtle' }, cache: 'no-store' })).text();
      const m = t.match(/ldp:contains\s+([^.]+)\./s);
      const ids = m ? [...m[1].matchAll(/<([^>]+)>/g)].map(x => x[1]) : [];
      for (const id of ids) {
        const u = new URL(id, base + 'favourites/').href;
        const c = await (await fetch(u, { cache: 'no-store' })).text();
        if (c.includes(title)) return u;
      }
      return null;
    }, BASE, music.title);
    if (newFile) created.push(newFile);
  }

  // ---- 3) Movies: film rows carry a star; favouriting adds them to the
  //          Community Favorites column (headed accordingly). ----
  await clickTab('Movies');
  await page.waitForFunction(() =>
    document.querySelector('#panel-movies #ia-h-favs')?.textContent.trim() === 'Community Favorites',
    { timeout: 30000 });
  // Browse: pick the first film type, then the first collection, to load films.
  const pickFirst = (col) => page.evaluate((col) => {
    const item = document.querySelector(`#panel-movies [data-column="${col}"] .ia-listbox-item:not(.ia-listbox-all)`);
    item?.click();
  }, col);
  await page.waitForFunction(() =>
    document.querySelector('#panel-movies [data-column="genre"] .ia-listbox-item:not(.ia-listbox-all)'),
    { timeout: 15000 });
  await pickFirst('genre');
  await page.waitForFunction(() =>
    document.querySelector('#panel-movies [data-column="artist"] .ia-listbox-item:not(.ia-listbox-all)'),
    { timeout: 15000 });
  await pickFirst('artist');
  // Films arrive in the Movies (album) column from archive.org.
  const filmsLoaded = await page.waitForFunction(() =>
    document.querySelectorAll('#panel-movies [data-column="album"] .ia-listbox-item:not(.ia-listbox-all)').length > 0,
    { timeout: 30000 }).then(() => true).catch(() => false);
  check(filmsLoaded, 'Movies: films load into the Movies column');

  if (filmsLoaded) {
    const everyRowHasStar = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#panel-movies [data-column="album"] .ia-listbox-item:not(.ia-listbox-all)')];
      return rows.length > 0 && rows.every(r => r.querySelector('.ia-row-fav'));
    });
    check(everyRowHasStar, 'Movies: every film row carries a `.ia-row-fav` ☆');

    // Star the LAST film in the browse column (least likely to already be on
    // the wall), then name + confirm the favourite.
    const starredTitle = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#panel-movies [data-column="album"] .ia-listbox-item:not(.ia-listbox-all)')];
      const it = rows[rows.length - 1];
      const n = it.querySelector('.ia-listbox-label')?.textContent?.trim() || '';
      it.querySelector('.ia-row-fav').click();
      return n;
    });
    await page.waitForSelector('.omp-fav-overlay .omp-fav-add', { timeout: 8000 });
    await page.click('.omp-fav-overlay .omp-fav-add');

    // The browse-column star lights up…
    const lit = await page.waitForFunction(() =>
      document.querySelector('#panel-movies [data-column="album"] .ia-listbox-item .ia-row-fav.on'),
      { timeout: 15000 }).then(() => true).catch(() => false);
    check(lit, 'Movies: the film row\'s ★ lights up after favouriting');

    // …and the film appears in the Community Favorites COLUMN WITHOUT clicking
    // anything — it's a persistent list, like the images tab.
    const inFavColumn = await page.waitForFunction((t) =>
      [...document.querySelectorAll('#panel-movies .ia-favourites-list .ia-listbox-item')]
        .some(li => li.textContent.includes(t)),
      { timeout: 15000 }, starredTitle).then(() => true).catch(() => false);
    check(inFavColumn, `Movies: starred film "${starredTitle}" appears in the Community Favorites column (no click needed)`);

    const colState = await page.evaluate((t) => {
      const row = [...document.querySelectorAll('#panel-movies .ia-favourites-list .ia-listbox-item')].find(li => li.textContent.includes(t));
      return { rowVisible: !!row && row.offsetHeight > 0 };
    }, starredTitle);
    check(colState.rowVisible, 'Movies: the favourite film row is visible in the column');

    // Clicking the lit ★ again unstars it (toggle).
    const goneAfterUnstar = await page.evaluate(async (t) => {
      const it = [...document.querySelectorAll('#panel-movies [data-column="album"] .ia-listbox-item')]
        .find(x => x.querySelector('.ia-listbox-label')?.textContent?.trim() === t);
      it.querySelector('.ia-row-fav').click();
      return true;
    }, starredTitle);
    const unstarred = await page.waitForFunction((t) =>
      ![...document.querySelectorAll('#panel-movies .ia-favourites-list .ia-listbox-item')].some(li => li.textContent.includes(t)),
      { timeout: 15000 }, starredTitle).then(() => true).catch(() => false);
    check(goneAfterUnstar && unstarred, 'Movies: clicking the lit ★ unstars it (removed from the column)');

    // Record the favourite we created (the film we starred) for cleanup.
    if (starredTitle) {
      const f = await page.evaluate(async (base, title) => {
        const t = await (await fetch(base + 'favourites/', { headers: { Accept: 'text/turtle' }, cache: 'no-store' })).text();
        const m = t.match(/ldp:contains\s+([^.]+)\./s);
        const ids = m ? [...m[1].matchAll(/<([^>]+)>/g)].map(x => x[1]) : [];
        for (const id of ids) {
          const u = new URL(id, base + 'favourites/').href;
          const c = await (await fetch(u, { cache: 'no-store' })).text();
          if (c.includes(title)) return u;
        }
        return null;
      }, BASE, starredTitle);
      if (f) created.push(f);
    }
  }

  check(errors.length === 0, `no page errors${errors.length ? ' — ' + errors.join('; ') : ''}`);
} finally {
  for (const f of created) { try { await fetch(f, { method: 'DELETE' }); } catch {} }
  await browser.close();
}
console.log(fails ? `\n${fails} failure(s)` : '\nStar-placement checks passed.');
process.exit(fails ? 1 : 0);
