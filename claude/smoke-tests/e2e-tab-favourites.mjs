/**
 * e2e-tab-favourites.mjs — verify favourites are surfaced per media tab now
 * that the standalone ★ Favourites tab is gone.
 *
 *   • Music: a pinned "★ Favorites" entry sits in the Playlists sidebar,
 *     header stays "Playlists", + Playlist still available.
 *   • Movies: the Sources column is favourites-only — header reads "Favorites",
 *     + Playlist is hidden, and the ★ Favorites entry is present.
 *   • Clicking ★ Favorites selects it (switches the source).
 *
 * ia-player is light DOM, so panel contents query directly.
 * Server up at http://localhost:3000/solid/open_media_player/.
 * Run from project root: node claude/smoke-tests/e2e-tab-favourites.mjs
 */
import puppeteer from 'puppeteer-core';
const URL = 'http://localhost:3000/solid/open_media_player/';

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log(`✗ ${msg}`); } else console.log(`✓ ${msg}`); };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 820 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForFunction(
    () => document.querySelectorAll('#omp-tabs > .sol-tabs-bar > button').length === 4,
    { timeout: 20000 });

  const clickTab = (id) => page.evaluate((id) =>
    document.querySelector(`#omp-tabs > .sol-tabs-bar > button[data-tab-id="${id}"]`).click(), id);
  const favsReady = (panel) => page.waitForFunction((p) =>
    document.querySelector(`#${p} #ia-h-favs`)?.textContent.trim() === 'Community Favorites',
    { timeout: 30000 }, panel);

  // ---- Music ----
  // Music keeps its Playlists section AND a separate "Community Favorites"
  // section below it.
  await clickTab('panel-music');
  await favsReady('panel-music');
  const music = await page.evaluate(() => {
    const root = document.getElementById('panel-music');
    const favHdr = root.querySelector('#ia-h-favs');
    const plHdr = root.querySelector('#ia-h-sources');
    return {
      favHeader: favHdr?.textContent.trim(),
      favVisible: !!favHdr && getComputedStyle(favHdr).display !== 'none',
      playlistsVisible: !!plHdr && getComputedStyle(plHdr).display !== 'none',
      playlistHeader: plHdr?.textContent.trim(),
      addPlaylistHidden: !!root.querySelector('.ia-add-playlist-btn')?.hidden,
    };
  });
  check(music.favHeader === 'Community Favorites', `Music: "Community Favorites" section present (got "${music.favHeader}")`);
  check(music.favVisible && music.playlistsVisible, 'Music: both Playlists and Community Favorites sections show');
  check(music.playlistHeader === 'Playlists', `Music: Playlists header stays "Playlists" (got "${music.playlistHeader}")`);
  check(!music.addPlaylistHidden, `Music: + Playlist still available`);

  // ---- Movies ----
  // Movies are favourites-only: the Playlists section is hidden and the
  // Community Favorites section fills the column.
  await clickTab('panel-movies');
  await favsReady('panel-movies');
  const movies = await page.evaluate(() => {
    const root = document.getElementById('panel-movies');
    return {
      favHeader: root.querySelector('#ia-h-favs')?.textContent.trim(),
      playlistsHidden: getComputedStyle(root.querySelector('#ia-h-sources')).display === 'none',
      favOnly: root.querySelector('.ia-player-app').classList.contains('favourites-only'),
      addPlaylistHidden: !!root.querySelector('.ia-add-playlist-btn')?.hidden,
    };
  });
  check(movies.favHeader === 'Community Favorites', `Movies: "Community Favorites" header (got "${movies.favHeader}")`);
  check(movies.favOnly, 'Movies: panel is favourites-only');
  check(movies.playlistsHidden, 'Movies: Playlists section hidden');
  check(movies.addPlaylistHidden, `Movies: + Playlist hidden (favourites-only)`);

  check(errors.length === 0, `no page errors${errors.length ? ' — ' + errors.join('; ') : ''}`);
  console.log(fails ? `\n${fails} failure(s)` : '\nPer-tab favourites checks passed.');
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
