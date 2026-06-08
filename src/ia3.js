import {getAlbums, getTracks, buildArchiveQuery} from "./sources/internet-archive.js";
import { listFavourites, removeFavouriteFile } from "./omp-favourites-store.js";
import {
  loadRDF, resolvePodLibraryUrl, discoverPodStorages, ensurePublicTypeIndex,
  listRegisteredLibraries, registerPodLibrary, unregisterPodLibrary,
  createLibrary, installToPod, relativizeLibraryIris,
  allPlaylistDocs, allPlaylistDocsFromIndex, releaseDocsForPlaylistDocs,
  allReleaseDocs,
  parseBookmarks, libraryMediaType,
  isFavorited, addFavorite, removeFavorite, getFavoritesUri,
  removeTrackFromPlaylist,
  addGenre, removeGenre, renameGenre,
  addArtist, removeArtist, renameArtist, moveArtist,
  parseIaUrl,
  parsePlaylists, addPlaylist, removePlaylist, renamePlaylist, updatePlaylistMeta,
  deletedBinUri,
  addTrackToPlaylist, addTracksToPlaylist,
  convertPlaylistToArtist, unlinkPlaylistArtist, setPlaylistHidden,
  getLocalArtistAlbums, getLocalReleaseTracks,
  updateTrackMeta, releaseSiblingCount,
  setSolidWriteAuthed
} from "./ia-rdf.js";
import {
  createPlayerUI,
  createListbox,
  setupTrackList,
  setupColumnResize,
  setupTrackSort,
  renderTrackList,
  setupPlaybackControls,
  updateStatus,
  updateStatusHTML,
  escapeHTML,
  showRDFInput,
  showLoadingScreen,
  showError,
  mountPlayer,
  showAboutModal,
  showFiltersModal,
  showFloatingMenu,
  showPlaylistEditModal,
  showTrackEditModal,
  showLibraryEditModal
} from "./ia-ui.js";

// Snapshot the OIDC redirect params at BUNDLE LOAD — this evaluates
// when ia-player.js is first parsed, before <sol-login> initialises and
// solid-client-authn's handleIncomingRedirect strips ?code&state from
// the URL. By init() time the URL is already clean, so this boot-time
// capture is the only reliable "this load is a post-login return"
// signal (used to skip the wasted unauthenticated same-origin load).
const BOOT_AUTH_PARAMS = (() => {
  try { return /[?&](code|state)=/.test(location.search); } catch { return false; }
})();

function createPlayer({ libraryConfigs, libs, host }) {
  // Active media type = the (single) enabled library's declared type.
  // RUNTIME (not a const): selecting a different library in the Libraries
  // list switches it, which re-labels the columns, flips the player
  // element audio↔video, and sets the archive.org adapter/search kind.
  const activeMediaType = () => (enabledLibs()[0]?.mediaType) || 'audio';
  // Panel instances (storage-ns, driven by the two-panel index.html) put
  // their global controls in the host-page CHROME, not in the panel: no
  // per-panel gear button (hidden via .panel-instance CSS) and no per-panel
  // <sol-login> — the chrome hosts the single shared login (sign-in dedup).
  const storageNs = host?.getAttribute?.('storage-ns') || '';
  const nsSuffix = storageNs ? ':' + storageNs : '';
  const isPanel = !!storageNs;
  // Movies surface only Favourites in their Sources column (no playlists);
  // every tab slices the communal wall to its own media bucket.
  const favouritesOnly = !!host?.hasAttribute?.('favourites-only');
  const favBucket = () => (activeMediaType() === 'video' ? 'MovingImage' : 'Sound');
  // Communal favourites state (populated by loadCommunalFavTracks). Declared
  // up here because refreshSources() reads _favRecords during initial setup
  // (the movies panel lists the favourite films in its Sources column).
  let _favTrackUrls = new Set();
  let _favRecords = [];
  const ui = createPlayerUI({ mediaType: activeMediaType(), panel: isPanel });
  const {
    container, audio, status, trackCount, nowPlaying,
    filmIntro, filmIntroTitle, filmIntroLength, filmIntroAbout, filmIntroRights,
    prevBtn, playBtn, nextBtn, seekSlider, timeCur, timeDur,
    volumeSlider,
    sourcesList, favouritesList, librariesList, genreList, artistList, albumList,
    trackTable, trackHead, trackBody, trackEmpty,
    randomizeBtn, clearTracksBtn,
    helpMenuItem, helpLinkMenuItem, loginHelpMenuItem, filtersMenuItem, savePlaylistMenuItem,
    installPodMenuItem, updateAppMenuItem, viewDeletedMenuItem,
    addPlaylistBtn, addSourceBtn,
    addGenreBtn, addArtistBtn, genreColumnFooter, artistColumnFooter,
    themeToggle, fontSizeBtn,
    setMenuOpen
  } = ui;

  // ---- appearance (light/dark + text size) ---------------------------
  // Both live on the document root so the two library panels stay in sync.
  // The default is declared on <sol-default theme/fontsize> and resolved by
  // the omp.css :has() cascade; a saved choice is applied pre-paint by omp-boot
  // (localStorage). Each panel reflects + mutates the same shared attributes
  // and re-syncs its own menu UI on the cross-panel 'omp:appearance' event.
  const docEl = document.documentElement;
  // The effective value = an explicit <html data-theme> override → the default
  // declared on <sol-default theme/fontsize> → the system preference. (omp keeps
  // its default on <sol-default>; a standalone player has neither and falls to
  // the system pref.)
  const solDefault = () => document.querySelector('sol-default');
  function currentTheme() {
    return docEl.getAttribute('data-theme')
      || solDefault()?.getAttribute('theme')
      || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  }
  function currentFontSize() {
    return docEl.getAttribute('data-fontsize')
      || solDefault()?.getAttribute('fontsize')
      || 'medium';
  }
  function syncAppearanceUI() {
    const dark = currentTheme() !== 'light';
    if (themeToggle) {
      themeToggle.setAttribute('aria-checked', dark ? 'true' : 'false');
      const ico = themeToggle.querySelector('.gear-theme-ico');
      const lbl = themeToggle.querySelector('.gear-theme-label');
      if (ico) ico.textContent = dark ? '🌙' : '☀️';
      if (lbl) lbl.textContent = dark ? 'Dark mode' : 'Light mode';
    }
    const size = currentFontSize();
    if (fontSizeBtn) {
      const lbl = fontSizeBtn.querySelector('.gear-fontsize-label');
      if (lbl) lbl.textContent = 'Text size: ' + size[0].toUpperCase() + size.slice(1);
      const ico = fontSizeBtn.querySelector('.gear-fontsize-ico');
      if (ico) ico.style.fontSize = size === 'small' ? '0.8rem' : size === 'large' ? '1.2rem' : '1rem';
    }
  }
  const FONT_SIZES = ['small', 'medium', 'large'];
  function setTheme(theme) {
    docEl.setAttribute('data-theme', theme);
    try { localStorage.setItem('omp:theme', theme); } catch {}
    document.dispatchEvent(new CustomEvent('omp:appearance'));
  }
  function setFontSize(size) {
    docEl.setAttribute('data-fontsize', size);
    try { localStorage.setItem('omp:fontsize', size); } catch {}
    document.dispatchEvent(new CustomEvent('omp:appearance'));
  }
  // Make sure the attributes exist even if the pre-paint script didn't run
  // (e.g. index-movies.html before its own snippet, or an embedding host).
  // BUT when the page declares the default on <sol-default theme/fontsize>,
  // don't stamp — leave <html> unset so the omp.css :has() cascade owns the
  // default (and can follow the declared value / system pref). An explicit
  // toggle still writes <html data-theme>, which overrides the cascade.
  if (!solDefault()?.hasAttribute('theme'))    docEl.setAttribute('data-theme', currentTheme());
  if (!solDefault()?.hasAttribute('fontsize')) docEl.setAttribute('data-fontsize', currentFontSize());
  themeToggle?.addEventListener('click', () => setTheme(currentTheme() === 'light' ? 'dark' : 'light'));
  fontSizeBtn?.addEventListener('click', () => {
    setFontSize(FONT_SIZES[(FONT_SIZES.indexOf(currentFontSize()) + 1) % FONT_SIZES.length]);
  });
  document.addEventListener('omp:appearance', syncAppearanceUI);
  syncAppearanceUI();

  // ---- access gating -------------------------------------------------
  // "Effective" login = a live Solid session OR kitchen mode. Kitchen mode
  // (the `solid-kitchen` attribute on <sol-default>) is a dev/preview switch
  // that makes the UI look logged-in without an actual session — useful when
  // running on localhost without an IdP round-trip. Gating here is purely
  // visual: unauthenticated writes still fail server-side, kitchen or not.
  function isKitchenMode() {
    try { return !!document.querySelector('sol-default')?.hasAttribute('solid-kitchen'); } catch { return false; }
  }
  // The <sol-login> lives in the panel for a standalone player, or in the
  // host-page chrome for the two-panel shell — either way it's the single
  // one in the document, so look it up document-wide.
  function solLoginEl() { return document.querySelector('sol-login'); }
  function isRealLoggedIn() {
    const el = solLoginEl();
    return !!(el && el.isLoggedIn);
  }
  function isEffectivelyLoggedIn() {
    return isRealLoggedIn() || isKitchenMode();
  }
  // Toggle the .guest-mode class (CSS hides edit affordances) and mirror
  // the real-session state into the ⋮ menu button (green chip + WebID
  // tooltip). Idempotent — safe to call from anywhere a redraw happens.
  function applyAccessGating() {
    const guest = !isEffectivelyLoggedIn();
    container.classList.toggle('guest-mode', guest);
    const real = isRealLoggedIn();
    const webId = real ? (solLoginEl()?.webId || '') : '';
    const mb = container.querySelector('.manage-btn');
    if (mb) {
      mb.classList.toggle('logged-in', real);
      mb.title = webId || 'Menu';
    }
    // Let the host-page chrome mirror gating (hide owner-only ⋮ items,
    // colour its menu button) for the active panel.
    try { host?.dispatchEvent(new CustomEvent('omp:access', { detail: { guest, real, webId } })); } catch {}
  }

  // ---- multi-library aggregation -------------------------------------
  // Each entry in `libs` is { config, store, baseURI, genres, bookmarks, playlists }.
  // We aggregate visible data by tagging each item with its source lib id so
  // mutations and per-library filtering can be done later.
  function tagAll(arr, lib) { return arr.map(x => ({ ...x, _lib: lib.config.id })); }

  let genres = [];
  let bookmarks = [];
  let playlists = [];
  let playlistIds = new Set();
  let favUriSet = new Set();

  function enabledLibs() {
    return libs.filter(l => l.store && (libraryConfigs.find(c => c.id === l.config.id)?.enabled));
  }

  function recomputeAggregates() {
    const en = enabledLibs();
    genres = en.flatMap(l => tagAll(l.genres, l));
    bookmarks = en.flatMap(l => tagAll(l.bookmarks, l));
    playlists = en.flatMap(l => tagAll(l.playlists, l));
    playlistIds = new Set(playlists.map(p => p.id));
    favUriSet = new Set(en.map(l => getFavoritesUri(l.baseURI)));
  }

  // Reflect the active library's media type into the chrome: flip the
  // container class (audio bar ↔ large video, via CSS) and relabel the
  // three browse columns. The single <video> element is NOT recreated, so
  // anything currently playing keeps playing across the switch.
  // Single source of truth for every media-type-varying string. Read at
  // render time (so dynamic messages relabel on switch too).
  function mediaLabels(mt = activeMediaType()) {
    return mt === 'video'
      ? { genre: 'Film Types', artist: 'Collections', album: 'Movies',
          addGenre: '+ Add film type', addArtist: '+ Add collection',
          allGenre: '(All film types)', allArtist: '(All collections)', allAlbum: '(All movies)',
          find: 'Find a film…',
          chooseArtist: 'Choose a collection to see films.',
          loadingAlbums: 'Loading films…', noAlbums: 'No films found.' }
      : { genre: 'Genres', artist: 'Artists', album: 'Albums',
          addGenre: '+ Add genre', addArtist: '+ Add artist',
          allGenre: '(All genres)', allArtist: '(All artists)', allAlbum: '(All albums)',
          find: 'Find artist…',
          chooseArtist: 'Choose an artist to see albums.',
          loadingAlbums: 'Loading albums…', noAlbums: 'No albums found.' };
  }

  function applyActiveMediaType() {
    const mt = activeMediaType();
    container.classList.toggle('media-video', mt === 'video');
    container.classList.toggle('media-audio', mt !== 'video');
    const L = mediaLabels(mt);
    for (const col of ['genre', 'artist', 'album']) {
      const h = container.querySelector(`[data-column="${col}"] .ia-column-header`);
      if (h) h.textContent = L[col];
    }
    if (addGenreBtn) addGenreBtn.textContent = L.addGenre;
    if (addArtistBtn) addArtistBtn.textContent = L.addArtist;
    // Relabel the "(All …)" rows and the toolbar search placeholder.
    genreCol.setAllLabel(L.allGenre);
    artistCol.setAllLabel(L.allArtist);
    albumCol.setAllLabel(L.allAlbum);
    const searchInput = container.querySelector('.ia-artist-search-input');
    if (searchInput) searchInput.placeholder = L.find;
    // Movies have no transport bar — the whole toolbar is hidden (CSS), so
    // relocate the film-search onto the far right of the now-playing line.
    // Audio keeps it in the toolbar.
    const searchForm = container.querySelector('.ia-artist-search');
    const npRow = container.querySelector('.ia-nowplaying');
    const toolbar = container.querySelector('.ia-toolbar');
    if (searchForm) {
      if (mt === 'video' && npRow && searchForm.parentElement !== npRow) npRow.appendChild(searchForm);
      else if (mt !== 'video' && toolbar && searchForm.parentElement === npRow) toolbar.appendChild(searchForm);
    }
    // If the Albums column is currently showing the "choose an artist"
    // placeholder, relabel it in place.
    if (artistCol.getSelection().size === 0 && !searchAlbums && currentSource === 'library') {
      albumCol.setMessage(L.chooseArtist);
    }
    // Idle movies screen shows no <video> (Req 4): reveal it only when the
    // loaded media is itself a movie — not when audio is playing and the
    // user merely switched to the Movies library.
    container.classList.toggle('has-video', mt === 'video' && playingVideo);
  }

  // Re-derive a library's parsed views from its (mutated) store — used
  // after a write that the UI arrays don't track incrementally (e.g. a
  // playlist delete that creates/feeds the reserved "Deleted" bin).
  function resyncLibFromStore(lib) {
    if (!lib?.store) return;
    const pb = parseBookmarks(lib.store, lib.baseURI, lib.mediaType);
    lib.genres = pb.genres;
    lib.bookmarks = pb.bookmarks;
    lib.playlists = parsePlaylists(lib.store, lib.baseURI);
    recomputeAggregates();
  }

  // ---- lazy release-file loading ------------------------------------
  // Per-release files are skipped at startup (loadRDF lazyReleases) so
  // the Sources/Artist/Genre spine loads in ~tens of GETs, not the old
  // ~hundreds. A releases/<slug> file is fetched the first time a
  // playlist / artist / album that needs it is opened; then the lib's
  // parsed views are re-derived so track metadata appears. Idempotent
  // and cheap when warm (loadDocs no-ops already-loaded docs).
  async function ensureReleaseDocs(lib, urls) {
    if (!lib?.store || typeof lib.loadDocs !== 'function' || !urls?.length) return false;
    let n = 0;
    try { n = await lib.loadDocs(urls); }
    catch (e) { console.warn('[lazy] release load failed:', e?.message || e); }
    if (n) resyncLibFromStore(lib);
    return n > 0;
  }
  function releaseDocsForPlaylist(lib, playlistId) {
    if (!lib?.store) return [];
    return releaseDocsForPlaylistDocs(lib.store, [String(playlistId).split('#')[0]]);
  }

  // Where to write new favorites / playlists: first enabled library.
  function writeLib() { return enabledLibs()[0] || null; }
  function libById(id) { return libs.find(l => l.config.id === id) || null; }

  // Swap the pod library in place — NEVER via host.reload(), which would
  // rebuild <sol-login> with a fresh AuthManager and drop the Inrupt
  // session (→ unauthenticated pod fetch → empty library). Logged in →
  // pod only: local libraries are disabled (not deleted) and restored
  // on logout (plan decision 3).
  let preSolidEnabled = null;
  // True only when the loaded pod library was fetched with a live
  // session. A public (logged-out, read-only) load sets this false so a
  // later login upgrades it to an authenticated read/write load.
  let solidAuthed = false;
  // True when a pod library is loaded but NOT with a live session — its
  // writes will be rejected. Drives the reactive requireSession prompt.
  let solidReadOnly = false;
  let sessionPrompted = false;   // one prompt per read-only episode
  // Live pod context once authenticated: lets +Source / rename / delete
  // mirror into the public type index immediately. Null when logged out
  // — those edits are still saved to localStorage and reconciled into
  // the type index by the next login's syncPodLibraries().
  let podSync = null;   // { authedFetch, webId, typeIndex }
  function redrawAll() {
    recomputeAggregates();
    repopulateGenres();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    refreshSources();
    refreshLibraries();
    currentSource = 'library';
    switchSource('library');
  }
  // Like redrawAll but PRESERVES the current source/view — used by the
  // single-store in-place login/logout (data didn't change, only the
  // Fetcher's auth) so the panels don't wipe or reset to Library.
  function softRedraw() {
    recomputeAggregates();
    repopulateGenres();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    refreshSources();
    refreshLibraries();
    switchSource(currentSource);
  }
  async function loadSolidLibrary(url) {
    // Drop any prior solid entry; remember + disable local libraries.
    for (let i = libs.length - 1; i >= 0; i--) if (libs[i].config.solid) libs.splice(i, 1);
    for (let i = libraryConfigs.length - 1; i >= 0; i--) if (libraryConfigs[i].solid) libraryConfigs.splice(i, 1);
    if (!preSolidEnabled) {
      preSolidEnabled = libraryConfigs.map(c => [c.id, c.enabled]);
    }
    libraryConfigs.forEach(c => { c.enabled = false; });
    const cfg = { id: 'solid', label: 'My Pod', url, enabled: true, solid: true };
    libraryConfigs.push(cfg);
    const loaded = await loadOneLibrary(cfg);
    if (!loaded.store) {
      // Revert to local on failure so the player stays usable.
      const i = libraryConfigs.indexOf(cfg);
      if (i >= 0) libraryConfigs.splice(i, 1);
      if (preSolidEnabled) {
        for (const [id, en] of preSolidEnabled) {
          const c = libraryConfigs.find(x => x.id === id); if (c) c.enabled = en;
        }
        preSolidEnabled = null;
      }
      // Login didn't complete. If the eager local load was skipped
      // (auth-redirect path in init), load the enabled local libraries
      // now so the player isn't empty.
      for (const c of libraryConfigs) {
        if (c.solid || !c.enabled) continue;
        if (libs.some(l => l.config.id === c.id && l.store)) continue;
        const ll = await loadOneLibrary(c);
        const j = libs.findIndex(l => l.config.id === c.id);
        if (j >= 0) libs[j] = ll; else libs.push(ll);
      }
      solidAuthed = false;
      solidReadOnly = false;
      redrawAll();
      return { ok: false, err: loaded.error };
    }
    libs.push(loaded);
    // Self-hosted: the SAME url was also loaded as a private,
    // same-origin "local" library at startup. Disabling isn't enough —
    // playlist/agent lookups scan all libs by id and would hit that
    // unauthenticated duplicate (→ "uneditable"). Remove it entirely so
    // everything resolves to this authed shared store. (Cross-origin
    // case: urls differ → nothing matches → unchanged.)
    try {
      const dup = new URL(url, location.href).href;
      const sameUrl = (c) => c && !c.solid && c.url &&
        (() => { try { return new URL(c.url, location.href).href === dup; }
                 catch { return false; } })();
      for (let i = libs.length - 1; i >= 0; i--)
        if (sameUrl(libs[i].config)) libs.splice(i, 1);
      for (let i = libraryConfigs.length - 1; i >= 0; i--)
        if (sameUrl(libraryConfigs[i])) libraryConfigs.splice(i, 1);
      if (preSolidEnabled)
        preSolidEnabled = preSolidEnabled.filter(([id]) =>
          libraryConfigs.some(c => c.id === id));
    } catch (e) { console.warn('[pod] self-hosted dedupe skipped:', e?.message || e); }
    solidAuthed = !!(solLogin && solLogin.isLoggedIn);
    solidReadOnly = !solidAuthed;
    sessionPrompted = false;   // fresh episode
    redrawAll();
    return { ok: true, authed: solidAuthed };
  }
  function unloadSolidLibrary() {
    clearAuthInflight();
    for (let i = libs.length - 1; i >= 0; i--) if (libs[i].config.solid) libs.splice(i, 1);
    for (let i = libraryConfigs.length - 1; i >= 0; i--) if (libraryConfigs[i].solid) libraryConfigs.splice(i, 1);
    if (preSolidEnabled) {
      for (const [id, en] of preSolidEnabled) {
        const c = libraryConfigs.find(x => x.id === id); if (c) c.enabled = en;
      }
      preSolidEnabled = null;
    } else {
      libraryConfigs.forEach(c => { c.enabled = true; });
    }
    solidAuthed = false;
    solidReadOnly = false;
    sessionPrompted = false;
    redrawAll();
  }

  // ---- state -----------------------------------------------------------
  let playMode = 'random';       // 'random' | 'ordered'
  let repeatMode = 'off';        // 'off' | 'all' | 'one'
  let hasUserStarted = false;
  let randomPickInFlight = false;
  let currentSource = 'library'; // 'library' | 'favorites' | <playlistId>
  const history = [];            // back stack

  recomputeAggregates();

  // ---- persistence ----------------------------------------------------
  // Per-panel storage namespace (`storageNs`/`nsSuffix` computed up top)
  // scopes the per-view keys so the two panels don't clobber each other.
  const STATE_KEY = 'ia-player:state' + nsSuffix;
  // A namespaced (panel) instance owns a single src-driven library; it must
  // not read/write the shared library-config list (the other panel would
  // clobber it). Also hides the redundant one-row Libraries switcher.
  if (storageNs) container.classList.add('panel-instance');
  if (libraryConfigs.length === 1) container.classList.add('single-library');
  let saveTimer = null;
  let stateLoading = false;       // suppress saves while applying restored state

  function loadStateBlob() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('Could not read saved state:', err);
      return null;
    }
  }
  function writeStateBlob(blob) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(blob));
    } catch (err) {
      console.warn('Could not write state:', err);
    }
  }
  // title/artist/album are CSS-flex columns (col width:auto in ia.css):
  // they share the slack and shrink together. They must never carry an
  // inline px width or the flex layout breaks (a stale saved width
  // pinned title/artist and collapsed album), so they are neither
  // persisted nor restored — only the fixed columns are.
  const FLEX_COLS = new Set(['title', 'artist', 'album']);
  function readColumnWidths() {
    const map = {};
    if (!trackTable) return map;
    trackTable.querySelectorAll('col').forEach(c => {
      if (c.style.width && !FLEX_COLS.has(c.dataset.col)) map[c.dataset.col] = c.style.width;
    });
    return map;
  }
  function applyColumnWidths(widths) {
    if (!widths || !trackTable) return;
    for (const [name, w] of Object.entries(widths)) {
      if (FLEX_COLS.has(name)) continue;   // flex columns stay CSS-driven
      const c = trackTable.querySelector(`col[data-col="${CSS.escape(name)}"]`);
      if (c) c.style.width = w;
    }
  }
  function snapshotState() {
    const sort = trackSortApi?.getSort?.() ?? { col: null, dir: 'asc' };
    return {
      shuffle: playMode === 'random',
      repeat: repeatMode,
      volume: audio.volume,
      source: currentSource,
      genreSel: [...genreCol.getSelection()],
      artistSel: [...artistCol.getSelection()],
      albumSel: [...albumCol.getSelection()],
      sortCol: sort.col,
      sortDir: sort.dir,
      columnWidths: readColumnWidths(),
      sourcesWidth: container.style.getPropertyValue('--ia-sources-width') || '',
      browserHeight: container.style.getPropertyValue('--ia-browser-height') || '',
      libraryTracks: libraryTracks.map(t => ({
        id: t.id, url: t.url, name: t.name,
        artist: t.artist || '', album: t.album || '',
        albumUrl: t.albumUrl || '', time: t.time || '',
        _lib: t._lib
      })),
      currentTrackUrl: currentTrack?.url || null,
      // Save playback position so reopening the page can seek back to where
      // we were. Only meaningful when audio.src matches the current track.
      currentTime: (currentTrack && audio.src === currentTrack.url && Number.isFinite(audio.currentTime))
        ? audio.currentTime : 0
    };
  }
  function markDirty() {
    if (stateLoading) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeStateBlob(snapshotState());
    }, 400);
  }
  function flushSave() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    writeStateBlob(snapshotState());
  }
  window.addEventListener('beforeunload', flushSave);

  async function restoreState() {
    const s = loadStateBlob();
    if (!s) {
      // No saved state — defaults are already applied by the initial setup.
      return;
    }
    stateLoading = true;
    try {
      if (typeof s.volume === 'number') {
        audio.volume = Math.min(1, Math.max(0, s.volume));
        volumeSlider.value = String(audio.volume);
      }
      setPlayMode(s.shuffle ? 'random' : 'ordered');
      setRepeatMode(s.repeat || 'off');
      applyColumnWidths(s.columnWidths);
      if (s.sourcesWidth) container.style.setProperty('--ia-sources-width', s.sourcesWidth);
      if (s.browserHeight) container.style.setProperty('--ia-browser-height', s.browserHeight);
      if (s.sortCol && trackSortApi.setSort) {
        trackSortApi.setSort(s.sortCol, s.sortDir);
      }

      // Reapply browser-column selections without firing the cascade
      // callbacks (we drive the cascade manually so order is correct).
      if (Array.isArray(s.genreSel) && s.genreSel.length) {
        genreCol.setSelection(s.genreSel, { notify: false });
      }
      refreshArtistsColumn();
      if (Array.isArray(s.artistSel) && s.artistSel.length) {
        artistCol.setSelection(s.artistSel, { notify: false });
      }

      // Restore queue without re-fetching: each entry has the metadata we
      // need to render and to advance/skip later. Drop any track from a
      // library that isn't the active one (e.g. a movie left over from the
      // Movies tab when we restore onto Music) so it can't leak across.
      const enabledLibIds = new Set(libraryConfigs.filter(c => c.enabled).map(c => c.id));
      if (Array.isArray(s.libraryTracks) && s.libraryTracks.length) {
        libraryTracks = s.libraryTracks
          .map(t => ({ ...t }))
          .filter(t => !t._lib || enabledLibIds.has(t._lib));
      }

      // Switch to the previously-active source view BEFORE fetching albums.
      // Album-fetching hits archive.org and can take seconds; doing it
      // before the source restore would leave the user staring at the
      // empty library view until the network round-trip finishes.
      const restoringPlaylist = s.source && s.source !== 'library' && playlistIds.has(s.source);
      if (s.source === 'favorites') {
        currentSource = 'favorites';
        sourcesCol.setSelection(['favorites'], { notify: false });
        container.classList.add('source-favorites');
        refreshFavoritesView();
        loadCommunalFavTracks();
      } else if (restoringPlaylist) {
        currentSource = s.source;
        sourcesCol.setSelection([s.source], { notify: false });
        refreshPlaylistView(s.source);
      } else {
        // Two-phase load: the saved source may be a playlist whose file
        // isn't loaded yet (lazyPlaylists). Remember it so the background
        // playlist pass can switch to it once playlists resolve.
        if (s.source && s.source !== 'library' && s.source !== 'favorites') {
          pendingRestoreSource = s.source;
        }
        currentSource = 'library';
        currentTracks = libraryTracks;
        trackEmptyMsg = libraryEmptyMessage();
        renderTracks();
      }
      updateViewClass();

      // Albums: in library mode we await so the album column is populated
      // before the user starts interacting. In playlist mode we skip the
      // fetch entirely — the user is on a different view and will trigger
      // it on demand by re-selecting an artist after switching back.
      if (!restoringPlaylist) {
        await refreshAlbumsColumn();
        if (Array.isArray(s.albumSel) && s.albumSel.length) {
          albumCol.setSelection(s.albumSel, { notify: false });
        }
      }

      // Restore the "now playing" track marker and queue audio so Play
      // resumes from the saved position instead of starting from 0. Audio
      // isn't auto-played — browsers block autoplay without recent user
      // interaction and the toolbar Play button handles the manual case.
      if (s.currentTrackUrl) {
        const t = libraryTracks.find(x => x.url === s.currentTrackUrl) ||
                  currentTracks.find(x => x.url === s.currentTrackUrl);
        if (t && (!t._lib || enabledLibIds.has(t._lib))) {
          currentTrack = t;
          // Keep the <video> reveal (Req 4) consistent with the restored
          // media so we don't show a movie banner over the Music tab.
          playingVideo = activeMediaType() === 'video';
          container.classList.toggle('has-video', playingVideo);
          updateStatusHTML(nowPlaying, nowPlayingHTML(t));
          renderTracks();
          // Pre-load audio + seek to the saved position. The seek has to
          // wait until metadata is loaded, otherwise currentTime is ignored.
          audio.src = t.url;
          const seekTo = Number.isFinite(s.currentTime) && s.currentTime > 0 ? s.currentTime : 0;
          if (seekTo > 0) {
            const onMeta = () => {
              audio.removeEventListener('loadedmetadata', onMeta);
              try { audio.currentTime = seekTo; } catch (_) { /* seek may be out of range */ }
            };
            audio.addEventListener('loadedmetadata', onMeta);
          }
          audio.load();
        }
      }
    } finally {
      stateLoading = false;
    }
  }

  // Current track-list view and the playing item.
  let currentTracks = [];        // active view (shown in the table)
  let libraryTracks = [];        // persistent queue used while on the Library source
  // When a curated artist backed by a single playlist is selected in
  // library view, this holds that playlist id so the tracklist's
  // group-delete persists to it (the artist behaves like its playlist).
  // null for catalogue/search artists (in-memory queue only).
  let libraryBackingPlaylist = null;
  // Read-half only: a single curated artist (playlist-backed A *or*
  // catalogue C) → auto-select all its albums so the tracklist shows
  // every track at once. Independent of libraryBackingPlaylist, which
  // gates the *edit* half (delete/move) and stays A-only — catalogue
  // artists aggregate-and-view but stay read-only.
  let libraryAggregateAlbums = false;
  let currentTrack = null;       // track obj currently loaded into audio
  let playingVideo = false;      // true when the loaded media is a movie (drives the <video> reveal, Req 4)
  let pendingRestoreSource = null; // a saved playlist source awaiting the two-phase playlist load

  // Album/track caches keyed by IA collection/item id.
  const albumsByArtist = new Map();   // key: artist bookmark key -> Promise<[album]>
  const tracksByAlbum = new Map();    // key: album url -> Promise<[track]>
  // Drop an artist's cached albums (key = Agent node value). Used when a
  // convert/unlink reuses an existing Agent node, or when a linked
  // artist's source playlist changes — otherwise fetchAlbumsForArtist
  // keeps serving the pre-change list.
  function invalidateArtistCache(nodeVal) {
    if (nodeVal) albumsByArtist.delete(nodeVal);
  }
  // For a playlist that's linked as an artist, drop that artist's cache
  // so its albums refetch from the (now changed) playlist.
  function invalidateLinkedArtistFor(playlistId) {
    const pl = playlists.find(p => p.id === playlistId);
    if (pl?.artistNode) invalidateArtistCache(pl.artistNode.value);
  }

  // Quality filter — config object passed through to getAlbums / getTracks.
  // The 3-minute track-duration floor is on by default; everything else
  // opts in via the Filters modal.
  const FILTER_KEY = 'omp-player:quality-filter' + nsSuffix;
  const DEFAULT_FILTER = {
    minTrackDurationSec: 180,
    minTrackBitrateKbps: 0,
    minItemRuntimeSec:   0,
    minDownloads:        0,
    blockedCollections:  [],
    applyToCatalogArtists: false,
  };
  function loadFilter() {
    try {
      const raw = localStorage.getItem(FILTER_KEY);
      if (!raw) return { ...DEFAULT_FILTER };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_FILTER, ...parsed };
    } catch { return { ...DEFAULT_FILTER }; }
  }
  function saveFilter(f) {
    try { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch (err) {
      console.warn('Could not persist filter:', err);
    }
  }
  let qualityFilter = loadFilter();

  function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function extractId(url) { return url?.match(/(?:\/details\/|archive\.org\/details\/)([^/?]+)/)?.[1] ?? null; }
  function bookmarkKey(b) { return b.node?.value || b.url; }
  function byLabel(a, b) { return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }); }

  // Check the result of any RDF write helper. Returns true iff the PATCH
  // landed on disk. On failure surfaces the error in the status bar and
  // returns false so the caller can bail before doing in-memory bookkeeping
  // (which would diverge from disk and disappear on the next page load).
  function looksAuthFailure(reason) {
    return /\b40[13]\b|unauthor|forbidden|not allowed|permission|credential/i
      .test(String(reason || ''));
  }
  // Reactive session gate (plan steps 8–9). Fires only when a write was
  // rejected *because* the pod library is loaded read-only (logged out
  // / no write access) — never proactively by origin. Shows a
  // persistent "not saved" banner and, once per read-only episode,
  // offers to log in. (OIDC is a full redirect, so the change itself
  // can't be auto-replayed — the user redoes it after signing in.)
  // Open the Solid provider picker (sol-login's issuer dropdown) so the
  // user can choose where to sign in. The picker lives in sol-login's
  // shadow DOM INSIDE the gear menu, so the menu must be OPEN/visible for
  // it to position and show — the old `_toggleDropdown()` calls ran after
  // setMenuOpen(false), silently toggling a hidden dropdown. We (re)open
  // the menu, then click sol-login's own button (native UX → the two-
  // issuer picker). Returns false if no sol-login (caller shows a hint).
  function openPodLoginPicker() {
    const el = solLoginEl();
    if (!el) return false;
    // Standalone player: <sol-login> lives in THIS panel's gear menu, so
    // the menu must be open for its issuer picker to be visible. Two-panel
    // shell: it lives in the host-page chrome (always visible) and the
    // panel's own gear menu is hidden — opening it does nothing, so skip
    // it and just click the chrome's sol-login. (This is the bug fix: the
    // old unconditional setMenuOpen(true) opened a hidden menu and the
    // picker appeared to do nothing.)
    if (!isPanel) { try { setMenuOpen(true); } catch {} }
    try {
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      const btn = el.shadowRoot && el.shadowRoot.querySelector('.auth-btn');
      if (btn) { btn.click(); return true; }      // native: opens the picker
      if (typeof el._handleClick === 'function') { el._handleClick(); return true; }
      if (el.issuers && el.issuers[0]) { el.login(el.issuers[0]); return true; }
    } catch {}
    return false;
  }

  function requireSession(what) {
    if (!solidReadOnly) return false;
    const loggedIn = !!(solLogin && solLogin.isLoggedIn);
    updateStatus(status, loggedIn
      ? `"${what}" not saved — your pod denied the write (no permission). Changes stay in this browser only.`
      : `"${what}" not saved — log in to save to your pod. Changes stay in this browser only.`);
    if (sessionPrompted || loggedIn) return true;
    sessionPrompted = true;
    const ok = confirm(
      `Couldn't save "${what}" to your pod.\n\n` +
      `You're in guest mode (not signed in). This change needs a Solid ` +
      `login to save — creating playlists works without one, but editing ` +
      `the library does not.\n\n` +
      `Log in now?\n\n` +
      `OK = Log in (you'll need to redo this change after signing in)\n` +
      `Cancel = keep working in this browser (changes won't be saved)`);
    if (ok) {
      if (!openPodLoginPicker())
        updateStatus(status, 'Open the gear menu and click "Log in" to sign in to your pod.');
    }
    return true;
  }

  function checkSaved(res, what) {
    if (res && res.ok) return true;
    const reason = res?.err || 'persistence failed';
    console.warn(`checkSaved: ${what}:`, res);
    // Pod write rejected while read-only → offer the session choice
    // instead of a bare error; otherwise the normal message.
    if (solidReadOnly && looksAuthFailure(reason)) {
      requireSession(what);
    } else {
      updateStatus(status, `Couldn't ${what}: ${reason}. No changes saved.`);
    }
    return false;
  }

  // ---- sources sidebar -------------------------------------------------
  // Kebab (⋯) button rendered to the right of every editable row —
  // sources, libraries, genres, artists. Always visible + bold (see
  // .ia-row-kebab). data-action="edit" routes clicks through the
  // listbox's onItemAction.
  function kebabButtonHTML(label) {
    return `<button type="button" class="ia-src-edit ia-row-kebab" data-action="edit" aria-label="Edit ${escapeHTML(label)}" aria-haspopup="menu" title="Edit" tabindex="-1">⋯</button>`;
  }

  // Replace a listbox <li>'s contents with a text input for in-place rename.
  // The original HTML is restored on cancel; on commit the caller is
  // responsible for triggering whatever re-render reflects the new value.
  function inlineRenameLi(li, currentValue, { onCommit }) {
    if (!li) return;
    const originalHTML = li.innerHTML;
    li.innerHTML = `<input type="text" class="ia-row-rename" value="${escapeHTML(currentValue)}" aria-label="Rename" spellcheck="false">`;
    const input = li.querySelector('input');
    input.focus();
    input.select();
    let settled = false;
    const restore = () => { li.innerHTML = originalHTML; };
    const commit = () => {
      if (settled) return; settled = true;
      const v = input.value.trim();
      if (v && v !== currentValue) onCommit(v);
      else restore();
    };
    const cancel = () => { if (settled) return; settled = true; restore(); };
    input.addEventListener('keydown', (e) => {
      // Keep keystrokes inside the input: the listbox keydown handler
      // preventDefault()s Space/Enter/arrows for row nav, which would
      // otherwise eat spaces typed into the rename field.
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    // Stop clicks (and dblclicks) inside the input from bubbling to the
    // listbox, which would otherwise re-select the row and re-render —
    // destroying our input mid-edit.
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('dblclick', (e) => e.stopPropagation());
    input.addEventListener('mousedown', (e) => e.stopPropagation());
    input.addEventListener('blur', commit);
  }

  // Single-select (radio-like), no checkbox — selecting a library makes
  // it the sole active one (hiding the other's content); a media-type
  // icon in the label shows what each is. Selecting switches the chrome's
  // media type via onLibrariesToggled → applyActiveMediaType().
  const librariesCol = createListbox(librariesList, {
    onChange: (sel) => onLibrariesToggled(sel),
    showAll: false,
    multiSelect: false,
    allowDeselect: false,
    renderItemActions: (item) => kebabButtonHTML(item.label),
    onItemAction: (action, id, anchor) => {
      if (action === 'edit') openLibraryEditMenu(id, anchor);
    }
  });

  // The Sources column lists user PLAYLISTS. Communal favourites have their
  // own "Community Favorites" section below (favouritesCol).
  const sourcesCol = createListbox(sourcesList, {
    onChange: (sel) => switchSource([...sel][0] || 'library'),
    showAll: false,
    multiSelect: false,
    allowDeselect: true,
    renderItemActions: (item) => kebabButtonHTML(item.label),
    onItemAction: (action, id, anchor) => {
      if (action === 'edit') openSourceEditMenu(id, anchor);
    },
    onItemDrop: (playlistId, dataTransfer) => onDropOnPlaylist(playlistId, dataTransfer),
  });

  // ---- Community Favorites section -------------------------------------
  // A heading-style section (same chrome as Playlists) listing the communal
  // wall sliced to this player's media bucket. Clicking a row plays it; the
  // owner gets a ✕ to remove it from the wall. Music caps it at ~⅓ height;
  // movies (favourites-only) let it fill the column.
  const favouritesCol = createListbox(favouritesList, {
    onChange: (sel) => {
      const id = [...sel][0];
      if (!id) return;
      const rec = _favRecords.find(r => (r.item || r.link) === id);
      if (rec) playFavourite(rec);
    },
    showAll: false,
    multiSelect: false,
    allowDeselect: true,
    renderItemActions: () => isEffectivelyLoggedIn()
      ? `<button type="button" class="ia-row-favdel" data-action="favdel" title="Remove from the communal favourites" aria-label="Remove favourite" tabindex="-1">✕</button>`
      : '',
    onItemAction: (action, id) => {
      if (action === 'favdel' && confirm('Remove this favourite from the communal wall?')) deleteFavouriteRecord(id);
    },
  });

  function refreshFavourites() {
    const items = _favRecords.map(rec => ({
      id: rec.item || rec.link,
      label: rec.canonicalTitle || 'Untitled',
      title: rec.contributors?.length ? `Favourited by ${rec.contributors.map(c => c.name).join(', ')}` : '',
      _fav: rec,
    })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    favouritesCol.setItems(items);
    favouritesCol.setMessage(items.length ? null : (activeMediaType() === 'video'
      ? 'No favourite films yet — tap ☆ on a film.'
      : 'No favourites yet — tap ☆ on a track.'));
  }

  // Play a communal favourite. Films resolve their best file (playFavFilm);
  // audio plays the stored file directly.
  function playFavourite(rec) {
    const url = rec.link || rec.item;
    const name = rec.canonicalTitle || 'Untitled';
    if (activeMediaType() === 'video') { playFavFilm({ url, name }); return; }
    loadAndPlay({ id: url, url, name, album: 'Community Favorites', albumUrl: '', time: '', artist: '' });
  }

  function refreshLibraries() {
    const iconFor = (mt) => (mt === 'video' ? '🎬' : '🎵');
    librariesCol.setItems(libraryConfigs.map(c => {
      const lib = libs.find(l => l.config.id === c.id);
      const mt = (lib && lib.mediaType) || c.mediaType || 'audio';
      return { id: c.id, label: `${iconFor(mt)} ${c.label}` };
    }));
    const enabledIds = libraryConfigs.filter(c => c.enabled).map(c => c.id);
    librariesCol.setSelection(enabledIds, { notify: false });
  }
  refreshLibraries();

  function refreshSources() {
    // The Sources column lists user PLAYLISTS only — communal favourites are
    // their own section (refreshFavourites). Hidden playlists (artist-only)
    // stay in `playlists` for editing/linking but aren't shown; the reserved
    // "Deleted" bin is reachable only via the ⋮ menu → "View deleted".
    const playlistItems = playlists
      .filter(p => !p.hidden && !p.id.endsWith('/playlists/deleted'))
      .map(p => ({ id: p.id, label: p.label, title: p.description || '' }));
    sourcesCol.setItems(playlistItems);
    if (playlistItems.some(it => it.id === currentSource)) {
      sourcesCol.setSelection([currentSource], { notify: false });
    } else {
      if (currentSource === 'favorites') currentSource = 'library';
      sourcesCol.setSelection([], { notify: false });
    }
    updateViewClass();
  }

  // Only one side shows the "selected" highlight at a time: the playlist
  // (in the Sources column) when a playlist is the current source, OR the
  // library cascade (genre / artist / library rows) otherwise. The
  // library *checkbox* state is untouched — `viewing-playlist` only
  // neutralises the accent row-highlight via CSS, not the ☑ glyph.
  function updateViewClass() {
    container.classList.toggle('viewing-playlist', playlistIds.has(currentSource));
    // Library view is the only place Clear-tracklist applies (it's the
    // ephemeral queue). Drive the header-button's CSS visibility from
    // this explicit class rather than the absence of viewing-playlist —
    // 'favorites' isn't a playlist but also shouldn't show Clear.
    container.classList.toggle('viewing-library', currentSource === 'library');
  }
  refreshSources();
  refreshFavourites();

  // Movies (favourites-only): no playlists — hide the Playlists section and
  // let Community Favorites fill the column (CSS, keyed off .favourites-only).
  if (favouritesOnly) {
    container.classList.add('favourites-only');
    if (addPlaylistBtn) addPlaylistBtn.hidden = true;
  }

  // ---- library toggle / add / edit ------------------------------------

  function persistConfigs() {
    // A panel instance (src-driven, namespaced) doesn't own the shared
    // library-config list — skip it so the two panels can't clobber it.
    if (storageNs) return;
    saveLibraryConfigs(libraryConfigs);
    // Mirror on/off per URL so type-index-discovered libraries (not
    // saved as configs) still restore their last state next session.
    for (const c of libraryConfigs) {
      if (c.url && !c.solid) rememberLibEnabled(c.url, c.enabled);
    }
  }

  async function onLibrariesToggled(sel) {
    // Update config.enabled to match selection.
    libraryConfigs.forEach(c => { c.enabled = sel.has(c.id); });
    persistConfigs();

    // Lazy-load: a library selected for the first time this session was
    // listed from its config but never fetched (no startup network
    // trip). Fetch it now, on demand.
    for (const c of libraryConfigs) {
      if (!c.enabled) continue;
      const li = libs.findIndex(l => l.config.id === c.id);
      if (li >= 0 && libs[li].unloaded) {
        updateStatus(status, `Loading "${c.label}"…`);
        libs[li] = await loadOneLibrary(c);
        updateStatus(status, libs[li].error
          ? `Could not load "${c.label}": ${libs[li].error}`
          : `Loaded "${c.label}".`);
      }
    }

    // Single-select libraries: keep the playing media AND the library
    // queue intact across a switch. Music keeps playing while you browse
    // Movies — it stops only when a film reuses the <video> element — and
    // returning to Music shows the queue you left. (Movies never populate
    // `libraryTracks`, so it only ever holds the audio library's queue.)

    recomputeAggregates();
    applyActiveMediaType();   // audio↔video chrome follows the selection

    // If the current source is a playlist whose library was disabled,
    // bounce back to Library view.
    if (currentSource !== 'library' && currentSource !== 'favorites' && !playlistIds.has(currentSource)) {
      currentSource = 'library';
    }

    // A user-initiated switch starts the new library's browse columns
    // fresh. Critically this drops the previous library's album pick —
    // otherwise a still-selected movie would be re-fetched into the audio
    // queue by refreshTrackList once the chrome flips back to audio.
    genreCol.setSelection([], { notify: false });
    artistCol.setSelection([], { notify: false });
    albumCol.setSelection([], { notify: false });
    currentTracks = libraryTracks;

    repopulateGenres();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    refreshSources();
    if (currentSource === 'library') {
      currentTracks = libraryTracks;
      trackEmptyMsg = libraryEmptyMessage();
      renderTracks();
    } else if (currentSource === 'favorites') {
      openFavoritesView();
    } else {
      refreshPlaylistView(currentSource);
    }
  }

  // Mirror one library into the public type index. No-op (never throws)
  // when logged out — the next login's syncPodLibraries() reconciles it
  // from the persisted config. The .solid pod library is skipped here:
  // it's registered by the "Install on my Pod" wizard, not this path.
  async function mirrorRegister(cfg) {
    if (!podSync || !podSync.typeIndex || !cfg || cfg.solid || !cfg.url) return;
    try {
      await registerPodLibrary(podSync.authedFetch, podSync.typeIndex, {
        id: cfg.id,
        url: new URL(cfg.url, location.href).href,
        label: cfg.label,
      });
    } catch (e) {
      console.warn('type-index register failed (kept locally):', e?.message || e);
    }
  }
  async function mirrorUnregister(cfg) {
    if (!podSync || !podSync.typeIndex || !cfg) return;
    try {
      await unregisterPodLibrary(podSync.authedFetch, podSync.typeIndex, {
        id: cfg.id,
        url: cfg.url ? new URL(cfg.url, location.href).href : null,
      });
    } catch (e) {
      console.warn('type-index unregister failed:', e?.message || e);
    }
  }

  // Reconcile localStorage configs <-> the pod's public type index after
  // login. Push: every local (non-pod) library missing from the index is
  // registered. Pull: every registered library missing locally is added
  // as a config so it shows in the Libraries column, its on/off state
  // restored from the per-URL memory. Best-effort throughout; idempotent
  // (sol-login can re-fire).
  async function syncPodLibraries(authedFetch, webId) {
    let registry;
    try {
      registry = await listRegisteredLibraries(authedFetch, webId);
    } catch (e) {
      console.warn('listRegisteredLibraries failed:', e?.message || e);
      return;
    }
    const typeIndex = registry.typeIndex;
    podSync = typeIndex ? { authedFetch, webId, typeIndex } : null;
    if (!typeIndex) return;   // profile advertises none — nothing to sync
    const registered = new Set(registry.libraries.map(l => l.url));

    // Push: the startup default catalog + any remote +Source libraries.
    for (const cfg of libraryConfigs) {
      if (cfg.solid || !cfg.url) continue;
      const abs = new URL(cfg.url, location.href).href;
      if (registered.has(abs)) continue;
      try {
        await registerPodLibrary(authedFetch, typeIndex,
          { id: cfg.id, url: abs, label: cfg.label });
      } catch (e) { console.warn('push register failed:', e?.message || e); }
    }

    // Pull: registered libraries not present locally.
    const haveUrls = new Set(libraryConfigs
      .filter(c => c.url)
      .map(c => new URL(c.url, location.href).href));
    let added = false;
    for (const lib of registry.libraries) {
      if (haveUrls.has(lib.url)) continue;
      const cfg = {
        id: newLibraryId(),
        label: lib.label || lib.url,
        url: lib.url,
        // Pod-discovered libraries are remote → listed but not
        // selected by default (startup selection rule); an explicit
        // remembered toggle still wins.
        enabled: recallLibEnabled(lib.url, false),
      };
      const loaded = await loadOneLibrary(cfg);
      if (loaded.error) {
        console.warn('discovered library failed to load:', lib.url, loaded.error);
        continue;
      }
      libs.push(loaded);
      libraryConfigs.push(cfg);
      added = true;
    }
    if (added) {
      persistConfigs();
      recomputeAggregates();
      refreshLibraries();
      refreshSources();
      repopulateGenres();
      refreshArtistsColumn();
      refreshAlbumsColumn();
      if (currentSource === 'library') {
        currentTracks = libraryTracks;
        renderTracks();
      }
    }
  }

  async function addLibrarySource(label, url) {
    const id = newLibraryId();
    const cfg = { id, label, url, enabled: true };
    updateStatus(status, `Loading "${label}"…`);
    const loaded = await loadOneLibrary(cfg);
    if (loaded.error) {
      updateStatus(status, `Could not load "${label}": ${loaded.error}`);
      return;
    }
    libs.push(loaded);
    libraryConfigs.push(cfg);
    persistConfigs();
    recomputeAggregates();
    refreshLibraries();
    refreshSources();
    repopulateGenres();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    await mirrorRegister(cfg);
    updateStatus(status, podSync
      ? `Added "${label}" (registered on your pod).`
      : `Added "${label}".`);
  }

  // Create a brand-new empty library under the same ./libraries/ root as
  // the local catalog, then add it like any other source. Requires a
  // writable backend (the dev CSS / a pod) — Q1; a read-only static host
  // surfaces the PUT failure. Reuses addLibrarySource for load + persist
  // + type-index mirror.
  async function createLocalLibrary(name) {
    const localCfg = libraryConfigs.find(c => !c.solid && isLocalLibUrl(c.url));
    const ref = new URL(localCfg ? localCfg.url : './libraries/_/index.ttl',
                        location.href).href;
    const root = ref.match(/^(.*\/libraries\/)/)?.[1];
    if (!root) { updateStatus(status, 'Could not locate the libraries/ root.'); return; }
    const taken = new Set(libraryConfigs
      .map(c => (c.url || '').match(/\/libraries\/([^/]+)\//)?.[1])
      .filter(Boolean));
    let slug = slugifyLibrary(name);
    for (let n = 2; taken.has(slug); n++) slug = `${slugifyLibrary(name)}_${n}`;
    const base = root + slug + '/';
    updateStatus(status, `Creating library "${name}"…`);
    const res = await createLibrary(base, { title: name });
    if (!res.ok) {
      updateStatus(status, `Couldn't create "${name}": ${res.err}`);
      return;
    }
    await addLibrarySource(name, res.url);
  }

  function renameLibrary(id, newLabel) {
    const cfg = libraryConfigs.find(c => c.id === id);
    if (!cfg) return;
    cfg.label = newLabel;
    persistConfigs();
    refreshLibraries();
    mirrorRegister(cfg);
  }

  async function changeLibraryUrl(id, newUrl) {
    const cfg = libraryConfigs.find(c => c.id === id);
    if (!cfg) return;
    cfg.url = newUrl;
    persistConfigs();
    updateStatus(status, `Reloading "${cfg.label}" from ${newUrl}…`);
    const fresh = await loadOneLibrary(cfg);
    const idx = libs.findIndex(l => l.config.id === id);
    if (idx >= 0) libs[idx] = fresh;
    else libs.push(fresh);
    recomputeAggregates();
    refreshLibraries();
    refreshSources();
    repopulateGenres();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    if (currentSource === 'library') {
      currentTracks = libraryTracks;
      renderTracks();
    }
    await mirrorRegister(cfg);
    if (fresh.error) updateStatus(status, `Could not load: ${fresh.error}`);
    else updateStatus(status, `Reloaded "${cfg.label}".`);
  }

  function deleteLibrary(id) {
    const idx = libraryConfigs.findIndex(c => c.id === id);
    if (idx < 0) return;
    const removed = libraryConfigs[idx];
    mirrorUnregister(removed);
    libraryConfigs.splice(idx, 1);
    const li = libs.findIndex(l => l.config.id === id);
    if (li >= 0) libs.splice(li, 1);
    persistConfigs();
    libraryTracks = libraryTracks.filter(t => t._lib !== id);
    recomputeAggregates();
    refreshLibraries();
    refreshSources();
    repopulateGenres();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    if (currentSource === 'library') {
      currentTracks = libraryTracks;
      renderTracks();
    }
  }

  // ---- pencil action menus -------------------------------------------

  function openLibraryEditMenu(id, _anchor) {
    const cfg = libraryConfigs.find(c => c.id === id);
    if (!cfg) return;
    showLibraryEditModal({
      title: 'Edit library',
      values: { label: cfg.label, url: cfg.url },
      canDelete: libraryConfigs.length > 1,
      onSave: async ({ label, url }) => {
        if (label !== cfg.label) renameLibrary(id, label);
        if (url !== cfg.url) await changeLibraryUrl(id, url);
      },
      onDelete: () => {
        if (!confirm(`Delete library "${cfg.label}"?\nIts contents stay on disk; only this player will forget about it.`)) {
          return false;   // keep the modal open
        }
        deleteLibrary(id);
      }
    });
  }

  // Kebab on a playlist row opens the edit pane directly. The pane's
  // extra actions cover Convert to artist + Remove (no intermediate
  // floating menu).
  function openSourceEditMenu(id, _anchor) {
    if (!playlistIds.has(id)) return;
    const playlist = playlists.find(p => p.id === id);
    if (!playlist) return;
    const lib = libByPlaylist(id);
    if (!lib) return;

    // Keep the in-memory artist bookmark in sync with the RDF link
    // (one bookmark per Agent node; replace on relink).
    function syncArtistBookmark(node, label, genreId) {
      for (let i = bookmarks.length - 1; i >= 0; i--) {
        if (bookmarks[i].node && bookmarks[i].node.value === node.value) bookmarks.splice(i, 1);
      }
      bookmarks.push({
        node, label, topic: genreId, url: null, source: null,
        localData: true, sourcePlaylist: id, _lib: lib.config.id,
      });
    }

    async function convertAction() {
      const choices = genres.filter(g => !favUriSet.has(g.id));
      if (!choices.length) {
        updateStatus(status, 'Add a genre first — a converted artist needs one.');
        return;
      }
      const name = (prompt('Artist name:', playlist.name) || '').trim();
      if (!name) return;
      const sorted = choices.slice().sort(byLabel);
      const pick = prompt('Genre? Enter a number:\n'
        + sorted.map((g, i) => `  ${i + 1}. ${g.label}`).join('\n'), '1');
      if (pick == null) return;
      const genre = sorted[parseInt(pick, 10) - 1];
      if (!genre) { updateStatus(status, 'Conversion cancelled — no valid genre picked.'); return; }
      const res = await convertPlaylistToArtist(lib.store, lib.baseURI, id, { name, genreId: genre.id });
      if (!checkSaved(res, `convert "${playlist.name}" to an artist`)) return;
      // Playlist is the source of truth; the artist is a live link.
      playlist.artistNode = res.node;
      syncArtistBookmark(res.node, name, genre.id);
      // Relink reuses the existing Agent node — drop any albums cached
      // under it (e.g. a prior search-based "Aphex Twin" with hundreds
      // of archive.org hits) so the column refetches from the playlist.
      invalidateArtistCache(res.node.value);
      refreshArtistsColumn();
      refreshAlbumsColumn();
      updateStatus(status, `${res.relinked ? 'Relinked' : 'Converted'} "${playlist.name}" → artist "${name}" (${res.albumCount} album${res.albumCount === 1 ? '' : 's'}). Playlist kept.`);
    }

    async function unlinkAction() {
      if (!confirm(`Unlink the artist from "${playlist.name}"?\nThe playlist and its tracks stay; it just stops also appearing as an artist.`)) return false;
      const res = await unlinkPlaylistArtist(lib.store, lib.baseURI, id);
      if (!checkSaved(res, `unlink artist from "${playlist.name}"`)) return;
      if (res.node) {
        for (let i = bookmarks.length - 1; i >= 0; i--) {
          if (bookmarks[i].node && bookmarks[i].node.value === res.node.value) bookmarks.splice(i, 1);
        }
        invalidateArtistCache(res.node.value);
      }
      playlist.artistNode = null;
      playlist.hidden = false;
      refreshArtistsColumn();
      refreshAlbumsColumn();
      refreshSources();
      updateStatus(status, `Unlinked artist from "${playlist.name}". Playlist kept.`);
    }

    async function removeAction() {
      if (!confirm(`Delete playlist "${playlist.name}"?`)) return false;
      const res = await removePlaylist(lib.store, lib.baseURI, id);
      if (!checkSaved(res, `delete playlist "${playlist.name}"`)) return;
      for (let i = bookmarks.length - 1; i >= 0; i--) {
        if (bookmarks[i].topic === id) bookmarks.splice(i, 1);
      }
      const pi = playlists.findIndex(p => p.id === id);
      if (pi >= 0) playlists.splice(pi, 1);
      playlistIds.delete(id);
      if (currentSource === id) { currentSource = 'library'; switchSource('library'); }
      refreshSources();
    }

    // Convert/Unlink + Remove are owner-only actions (they mutate the
    // RDF). In guest mode the modal still opens (so anonymous visitors
    // can READ the playlist's metadata) but its extra-actions row is
    // empty — only the implicit Cancel remains. The Save button stays
    // visible; a write attempt without an authed Fetcher will surface
    // the error in the status line, which mirrors the prior behaviour
    // for read-only sessions.
    const guest = !isEffectivelyLoggedIn();
    const editorActions = guest ? [] : [
      playlist.artistNode
        ? { label: 'Unlink artist', onClick: unlinkAction }
        : { label: 'Convert to artist…', onClick: convertAction },
      { label: 'Remove playlist', danger: true, onClick: removeAction },
    ];
    showPlaylistEditModal({
      title: 'Edit playlist',
      values: { name: playlist.name, maker: playlist.maker, description: playlist.description },
      actions: editorActions,
      onSave: async ({ name, maker, description }) => {
        const res = await updatePlaylistMeta(lib.store, lib.baseURI, id, { name, maker, description });
        if (!checkSaved(res, `edit playlist "${playlist.name}"`)) return;
        // If this playlist is a converted-to-artist (has a linked
        // Agent via dcterms:source) and the title changed, also
        // rename the Agent's foaf:name — the Artists column displays
        // the agent's name, not the playlist's title, so without this
        // a playlist rename "persisted in the modal but not in the
        // artist list".
        if (playlist.artistNode && name && name !== playlist.name) {
          const ra = await renameArtist(lib.store, lib.baseURI, playlist.artistNode, name);
          if (!checkSaved(ra, `update linked artist "${playlist.name}" → "${name}"`)) return;
        }
        const lbl = maker ? `${name} (${maker})` : name;
        // Re-derive ALL views from the (now-saved) store so the UI
        // matches what persisted (both columns reflect the rename).
        resyncLibFromStore(lib);
        refreshSources();
        refreshArtistsColumn();
        updateStatus(status, `Updated "${lbl}".`);
      }
    });
  }

  // ---- Genre / Artist edit menus (kebab popups) -----------------------

  function findGenreLi(id) {
    return genreList.querySelector(`.ia-listbox-item[data-id="${CSS.escape(id)}"]`);
  }
  function findArtistLi(id) {
    return artistList.querySelector(`.ia-listbox-item[data-id="${CSS.escape(id)}"]`);
  }
  function bookmarkById(id) { return bookmarks.find(b => bookmarkKey(b) === id); }

  function openGenreEditMenu(id, anchor) {
    const genre = genres.find(g => g.id === id);
    if (!genre) return;
    showFloatingMenu(anchor, [
      { id: 'rename', label: 'Rename' },
      { id: 'delete', label: 'Delete' },
    ], async (action) => {
      const lib = libByGenreId(id);
      if (!lib) return;
      if (action === 'rename') {
        inlineRenameLi(findGenreLi(id), genre.label, {
          onCommit: async (next) => {
            const res = await renameGenre(lib.store, lib.baseURI, id, next);
            if (!checkSaved(res, `rename genre "${genre.label}"`)) {
              repopulateGenres();   // restore the original label in the UI
              return;
            }
            resyncLibFromStore(lib);   // reflect the saved store
            repopulateGenres();
            refreshArtistsColumn();
          }
        });
      } else if (action === 'delete') {
        const artistCount = bookmarks.filter(b => b.topic === id && isArtistBookmark(b)).length;
        const msg = artistCount
          ? `Delete genre "${genre.label}" and its ${artistCount} artist${artistCount === 1 ? '' : 's'}?`
          : `Delete genre "${genre.label}"?`;
        if (!confirm(msg)) return;
        const res = await removeGenre(lib.store, lib.baseURI, id);
        if (!checkSaved(res, `delete genre "${genre.label}"`)) return;
        resyncLibFromStore(lib);   // re-derive from the saved store
        repopulateGenres();
        refreshArtistsColumn();
        refreshAlbumsColumn();
      }
    });
  }

  function openArtistEditMenu(id, anchor) {
    const artist = bookmarkById(id);
    if (!artist) return;

    // Playlist-linked artist: the playlist is the source of truth, so
    // editing routes to the playlist editor. The kebab also toggles
    // whether the playlist row shows in Sources, and unlinks.
    if (artist.sourcePlaylist && playlistIds.has(artist.sourcePlaylist)) {
      const pid = artist.sourcePlaylist;
      const pl = playlists.find(p => p.id === pid);
      const lib = libByPlaylist(pid);
      const iaUrl = iaUrlForArtist(artist);
      const items = [
        { id: 'edit', label: 'Edit playlist…' },
        { id: 'toggle-hide', label: pl?.hidden ? 'Show in Playlists' : 'Hide from Playlists' },
        { id: 'unlink', label: 'Unlink artist' },
        // Always "Visit" — even when the URL is a fallback IA search, to
        // avoid confusion with the toolbar's separate artist search box.
        { id: 'visit-ia', label: 'Visit on the Internet Archive' },
      ];
      showFloatingMenu(anchor, items, async (action) => {
        if (action === 'visit-ia') { window.open(iaUrl, '_blank', 'noopener'); return; }
        if (action === 'edit') { openSourceEditMenu(pid); return; }
        if (!lib) return;
        if (action === 'toggle-hide') {
          const next = !pl?.hidden;
          const res = await setPlaylistHidden(lib.store, lib.baseURI, pid, next);
          if (!checkSaved(res, `${next ? 'hide' : 'show'} playlist "${pl?.name || ''}"`)) return;
          if (pl) pl.hidden = next;
          if (next && currentSource === pid) { currentSource = 'library'; switchSource('library'); }
          refreshSources();
          updateStatus(status, next
            ? `"${pl?.name}" hidden from Playlists (still an artist).`
            : `"${pl?.name}" shows in Playlists again.`);
        } else if (action === 'unlink') {
          if (!confirm(`Unlink the artist from "${pl?.name}"?\nThe playlist and its tracks stay; it just stops appearing as an artist.`)) return;
          const res = await unlinkPlaylistArtist(lib.store, lib.baseURI, pid);
          if (!checkSaved(res, `unlink artist from "${pl?.name || ''}"`)) return;
          const bi = bookmarks.indexOf(artist);
          if (bi >= 0) bookmarks.splice(bi, 1);
          if (res.node) invalidateArtistCache(res.node.value);
          if (pl) { pl.artistNode = null; pl.hidden = false; }
          refreshArtistsColumn();
          refreshAlbumsColumn();
          refreshSources();
          updateStatus(status, `Unlinked artist from "${pl?.name}". Playlist kept.`);
        }
      });
      return;
    }

    // Visit archive.org is ALWAYS offered. When the artist's landing page
    // is on archive.org we link there directly; otherwise iaUrlForArtist
    // falls back to a full-text archive.org search on the artist's name.
    // The label stays "Visit" in both cases — calling it "Search" would
    // be ambiguous with the toolbar's separate artist-search box.
    const iaUrl = iaUrlForArtist(artist);
    const items = [
      { id: 'rename', label: 'Rename' },
      { id: 'delete', label: 'Delete' },
      { id: 'visit-ia', label: 'Visit on the Internet Archive' },
    ];
    showFloatingMenu(anchor, items, async (action) => {
      if (action === 'visit-ia') {
        window.open(iaUrl, '_blank', 'noopener');
        return;
      }
      const lib = libByArtist(artist);
      if (!lib) return;
      if (action === 'rename') {
        inlineRenameLi(findArtistLi(id), artist.label, {
          onCommit: async (next) => {
            const res = await renameArtist(lib.store, lib.baseURI, artist.node, next);
            if (!checkSaved(res, `rename artist "${artist.label}"`)) {
              refreshArtistsColumn();   // restore original label
              return;
            }
            resyncLibFromStore(lib);   // reflect the saved store
            refreshArtistsColumn();
          }
        });
      } else if (action === 'delete') {
        if (!confirm(`Delete artist "${artist.label}"?`)) return;
        const res = await removeArtist(lib.store, lib.baseURI, artist.node);
        if (!checkSaved(res, `delete artist "${artist.label}"`)) return;
        resyncLibFromStore(lib);   // re-derive from the saved store
        refreshArtistsColumn();
        refreshAlbumsColumn();
      }
    });
  }

  // ---- Add genre / Add artist (column-footer inputs) ------------------

  function openAddGenreForm() {
    if (genreColumnFooter.querySelector('.ia-column-addform')) return;
    genreColumnFooter.innerHTML = `
      <form class="ia-column-addform" autocomplete="off">
        <input type="text" class="ia-column-addinput" placeholder="Genre name" aria-label="New genre name" required>
        <button type="submit" class="ia-column-addsave" aria-label="Add">✓</button>
        <button type="button" class="ia-column-addcancel" aria-label="Cancel">✗</button>
      </form>
    `;
    const form = genreColumnFooter.querySelector('form');
    const input = form.querySelector('input');
    const cancel = () => resetGenreFooter();
    input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = input.value.trim();
      if (!label) { cancel(); return; }
      const lib = writeLib();
      if (!lib) { updateStatus(status, 'Enable a library first.'); cancel(); return; }
      const res = await addGenre(lib.store, lib.baseURI, label);
      resetGenreFooter();
      if (!checkSaved(res, `add genre "${label}"`)) return;
      genres.push({ id: res.id, label, _lib: lib.config.id });
      repopulateGenres();
    });
    form.querySelector('.ia-column-addcancel').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
  }
  function resetGenreFooter() {
    genreColumnFooter.innerHTML = '<button type="button" class="ia-add-genre-btn">+ Add genre</button>';
    genreColumnFooter.querySelector('.ia-add-genre-btn').addEventListener('click', openAddGenreForm);
  }
  addGenreBtn.addEventListener('click', openAddGenreForm);

  function openAddArtistForm() {
    if (artistColumnFooter.querySelector('.ia-column-addform')) return;
    // Use only the genres editable from this library (excludes Favorites).
    const choices = genres.filter(g => !favUriSet.has(g.id));
    if (!choices.length) {
      updateStatus(status, 'Add a genre first.');
      return;
    }
    const options = choices
      .slice().sort(byLabel)
      .map(g => `<option value="${escapeHTML(g.id)}">${escapeHTML(g.label)}</option>`).join('');
    artistColumnFooter.innerHTML = `
      <form class="ia-column-addform ia-column-addartist" autocomplete="off">
        <input type="text" class="ia-column-addinput" placeholder="archive.org URL or ID" aria-label="Artist URL or ID" required>
        <select class="ia-column-addselect" aria-label="Genre">${options}</select>
        <button type="submit" class="ia-column-addsave" aria-label="Add">✓</button>
        <button type="button" class="ia-column-addcancel" aria-label="Cancel">✗</button>
      </form>
    `;
    const form = artistColumnFooter.querySelector('form');
    const input = form.querySelector('input');
    const select = form.querySelector('select');
    // Pre-select the genre the user is currently viewing, when there is one.
    const currentGenreSel = [...genreCol.getSelection()];
    if (currentGenreSel.length === 1 && choices.some(g => g.id === currentGenreSel[0])) {
      select.value = currentGenreSel[0];
    }
    const cancel = () => resetArtistFooter();
    input.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = input.value.trim();
      if (!raw) { cancel(); return; }
      const parsed = parseIaUrl(raw);
      // parseIaUrl handles /details/ URLs and bare item ids. Anything
      // else (a /search?… landing page, etc.) must be a real absolute
      // URL: run it through new URL() so spaces and other unsafe chars
      // get percent-encoded (the common paste-with-spaces case) and
      // garbage is rejected with a visible message instead of producing
      // a broken IRI that fails silently downstream.
      let url;
      if (parsed) {
        url = parsed.url;
      } else {
        try {
          url = new URL(raw).href;
        } catch {
          updateStatus(status, `Not a valid URL: "${raw}". Enter a full http(s) URL or an archive.org item id.`);
          input.focus();
          input.select();
          return;   // keep the form open so the user can fix it
        }
      }
      const label = parsed
        ? parsed.id
        : (prompt('Display name for this artist:', '') || '').trim();
      if (!label) { cancel(); return; }
      const genreId = select.value;
      const lib = writeLib();
      if (!lib) { updateStatus(status, 'Enable a library first.'); cancel(); return; }
      let res;
      try {
        res = await addArtist(lib.store, lib.baseURI, genreId, label, url);
      } catch (err) {
        resetArtistFooter();
        updateStatus(status, `Couldn't add artist "${label}": ${err.message || err}`);
        return;
      }
      resetArtistFooter();
      if (!checkSaved(res, `add artist "${label}"`)) return;
      bookmarks.push({
        node: res.node, label,
        topic: genreId, url, source: null,
        _lib: lib.config.id
      });
      refreshArtistsColumn();
    });
    form.querySelector('.ia-column-addcancel').addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
  }
  function resetArtistFooter() {
    artistColumnFooter.innerHTML = '<button type="button" class="ia-add-artist-btn">+ Add artist</button>';
    artistColumnFooter.querySelector('.ia-add-artist-btn').addEventListener('click', openAddArtistForm);
  }
  addArtistBtn.addEventListener('click', openAddArtistForm);

  // ---- bottom buttons -------------------------------------------------

  addSourceBtn.addEventListener('click', async () => {
    const choice = prompt(
      'Add a library:\n\n  1 = create a new empty library\n  2 = add an existing one by URL',
      '1');
    if (choice == null) return;
    if (choice.trim() === '1') {
      const name = prompt('New library name:');
      if (!name || !name.trim()) return;
      await createLocalLibrary(name.trim());
    } else {
      const url = prompt('Library RDF URL (its index.ttl):');
      if (!url || !url.trim()) return;
      const proposed = url.trim().split('/').filter(Boolean).pop() || 'Library';
      const label = prompt('Display name:', proposed);
      if (!label || !label.trim()) return;
      await addLibrarySource(label.trim(), url.trim());
    }
  });

  async function onDropOnPlaylist(playlistId, dataTransfer) {
    if (!playlistIds.has(playlistId)) return;
    const raw = dataTransfer.getData('application/x-ia-tracks');
    if (!raw) return;
    let ids;
    try { ids = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(ids) || !ids.length) return;
    const tracksToAdd = ids
      .map(id => currentTracks.find(t => t.id === id))
      .filter(Boolean);
    if (!tracksToAdd.length) return;
    const lib = libByPlaylist(playlistId);
    if (!lib) return;

    updateStatus(status, `Adding ${tracksToAdd.length} track${tracksToAdd.length === 1 ? '' : 's'} to playlist…`);
    // Dedup is authoritative in addTracksToPlaylist (reads the playlist's
    // hasPart from the store, doesn't trust the in-memory cache). Pass
    // everything; it returns what it actually added + how many it skipped.
    const payloads = tracksToAdd.map(t => ({
      label: [t.artist, t.album, t.name].filter(Boolean).join(' — ') || t.name,
      url: t.url,
      source: t.albumUrl,
      artist: t.artist,
      album: t.album,
      name: t.name,
      time: t.time,
    }));
    // Tracks are committed in chunks, so a failure can be partial: the
    // chunks that did persist come back in res.added/res.nodes even when
    // res.ok is false. Register whatever actually saved before reporting.
    // inlineTracks: guests (no real session and no kitchen flag) can't
    // PATCH releases/*, so the writer must mint Track + Release nodes
    // inside the playlist file itself — see addTracksToPlaylist.
    const inlineTracks = !isEffectivelyLoggedIn();
    const res = await addTracksToPlaylist(lib.store, lib.baseURI, playlistId, payloads, { inlineTracks });
    const added = res.added || [];
    added.forEach((t, i) => {
      bookmarks.push({
        node: res.nodes?.[i],
        label: t.label,
        topic: playlistId,
        url: t.url,
        source: t.source,
        _lib: lib.config.id
      });
    });
    const skipped = res.skipped || 0;
    if (!res.ok) {
      const reason = res.err || 'persistence failed';
      updateStatus(status, added.length
        ? `Saved ${added.length} track${added.length === 1 ? '' : 's'}, then the server failed: ${reason}. Retry to add the rest.`
        : `Couldn't add tracks to playlist: ${reason}. No changes saved.`);
      console.warn('add tracks to playlist (partial/failed):', res);
    } else if (!added.length) {
      updateStatus(status, skipped
        ? `All ${skipped} track${skipped === 1 ? '' : 's'} already in this playlist.`
        : 'Nothing to add.');
    } else {
      updateStatus(status, `Added ${added.length} track${added.length === 1 ? '' : 's'}`
        + (skipped ? ` (${skipped} already in playlist)` : '') + '.');
    }
    if (added.length) invalidateLinkedArtistFor(playlistId);
    if (currentSource === playlistId) refreshPlaylistView(playlistId);
  }

  addPlaylistBtn.addEventListener('click', () => {
    // Playlists are owner content — guests browse/listen but can't create
    // (the button is also hidden in guest mode; this guards the path).
    if (!isEffectivelyLoggedIn()) { updateStatus(status, 'Sign in to create playlists.'); return; }
    const lib = writeLib();
    if (!lib) { updateStatus(status, 'Enable a library to add playlists.'); return; }
    showPlaylistEditModal({
      title: 'New playlist',
      values: { name: `Playlist ${playlists.length + 1}`, maker: 'jeffz', description: '' },
      onSave: async ({ name, maker, description }) => {
        const res = await addPlaylist(lib.store, lib.baseURI, { name, maker, description });
        if (!checkSaved(res, `add playlist "${name}"`)) return;
        playlists.push({
          id: res.id, name: res.name, maker: res.maker,
          description: res.description, label: res.label, _lib: lib.config.id,
        });
        playlistIds.add(res.id);
        refreshSources();
        updateStatus(status, `Added playlist "${res.label}". Drag tracks onto it to fill it.`);
      }
    });
  });

  function switchSource(id) {
    currentSource = id;
    // Backing is only valid while a curated artist is actively selected
    // in library view; re-established by onArtistSelectionChange.
    libraryBackingPlaylist = null;
    libraryAggregateAlbums = false;
    // Browser columns stay visible in every source view; only the track
    // list area swaps content.
    container.classList.remove('source-no-browser');
    container.classList.remove('source-favorites');
    if (id === 'library') {
      currentTracks = libraryTracks;
      trackEmptyMsg = libraryEmptyMessage();
      renderTracks();
    } else if (id === 'favorites') {
      container.classList.add('source-favorites');
      openFavoritesView();
    } else if (playlistIds.has(id)) {
      refreshPlaylistView(id);
      updateStatus(status, 'Tip: select tracks (Shift/Ctrl-click) and press Delete to remove them.');
    } else {
      // Unknown source — fall back to library.
      currentSource = 'library';
      refreshSources();
      currentTracks = libraryTracks;
      renderTracks();
    }
    updateViewClass();
    // Persist the source change immediately. Without this the only path
    // saving currentSource is whatever later event happens to fire markDirty
    // (volume, play, sort, etc.) — and beforeunload is unreliable on
    // force-quit, so a click-playlist-then-quit can leave the saved source
    // as 'library' and the next reload won't restore the playlist.
    markDirty();
  }

  // ---- listbox columns -------------------------------------------------
  // Genre + Artist rows carry a ⋯ kebab opening a rename/delete menu.
  // Favorites is read-only at the moment (it's also the only genre item
  // that intentionally has no edit affordance), so its kebab is suppressed.
  const genreCol = createListbox(genreList, {
    onChange: onGenreSelectionChange,
    allLabel: '(All genres)',
    renderItemActions: (item) => favUriSet.has(item.id) ? '' : kebabButtonHTML(item.label),
    onItemAction: (action, id, anchor) => { if (action === 'edit') openGenreEditMenu(id, anchor); }
  });
  // Artist rows ALWAYS carry an "↗" IA link, in every mode. When the
  // artist's landing page is on archive.org we link straight there;
  // otherwise we fall back to a full-text archive.org search on the
  // artist's display name (audio-restricted, since this is a music
  // player). The kebab sits alongside in logged-in / kitchen mode;
  // guest mode hides the kebab (see .guest-mode CSS) so only the IA
  // link remains. data-action ensures the listbox click handler stops
  // propagation — no row-selection side effect when ↗ is clicked.
  function iaUrlForArtist(item) {
    const u = item.url || '';
    if (/(?:^|\/\/)(?:www\.)?archive\.org\//.test(u)) return u;
    const q = `${item.label || ''} AND mediatype:${activeMediaType() === 'video' ? 'movies' : 'audio'}`;
    return `https://archive.org/search?query=${encodeURIComponent(q)}`;
  }
  function artistRowActions(item) {
    const url = iaUrlForArtist(item);
    // Label stays "Visit on the Internet Archive" even for the search-URL
    // fallback — "Search" would be confusable with the toolbar's
    // separate artist-search box.
    const tip = 'Visit on the Internet Archive';
    const link = `<button type="button" class="ia-row-ialink" data-action="ialink" data-url="${escapeHTML(url)}" title="${tip}" aria-label="${tip}" tabindex="-1">↗</button>`;
    return kebabButtonHTML(item.label) + link;
  }
  const artistCol = createListbox(artistList, {
    onChange: onArtistSelectionChange,
    allLabel: '(All artists)',
    renderItemActions: artistRowActions,
    onItemAction: (action, id, anchor) => {
      if (action === 'edit') openArtistEditMenu(id, anchor);
      else if (action === 'ialink') {
        const url = anchor?.dataset?.url;
        if (url) window.open(url, '_blank', 'noopener');
      }
    }
  });
  // Movies: each film row in the Movies column carries a ☆ communal-favourite
  // toggle (the way images are starred in their Collection column). Audio
  // albums are an intermediate browse step, so they get no star.
  const albumCol = createListbox(albumList, {
    onChange: onAlbumSelectionChange,
    allLabel: '(All albums)',
    renderItemActions: (item) => {
      if (activeMediaType() !== 'video') return '';
      const on = !!item._album && _favTrackUrls.has(item._album.url);
      return `<button type="button" class="ia-row-fav${on ? ' on' : ''}" data-action="fav" title="Add to the communal favourites" aria-label="Favourite" tabindex="-1">${on ? '★' : '☆'}</button>`;
    },
    onItemAction: (action, id) => { if (action === 'fav') favouriteMovieById(id); },
  });

  function repopulateGenres() {
    const items = genres
      .filter(g => !favUriSet.has(g.id))
      .map(g => ({ id: g.id, label: g.label, title: g.label }))
      .sort(byLabel);
    genreCol.setItems(items);
  }

  function isArtistBookmark(b) {
    return !favUriSet.has(b.topic) && !playlistIds.has(b.topic);
  }

  function isFavoriteBookmark(b) {
    return favUriSet.has(b.topic);
  }

  function libByGenreId(id) {
    const g = genres.find(x => x.id === id);
    return g ? libById(g._lib) : writeLib();
  }
  function libByArtist(artist) { return artist._lib ? libById(artist._lib) : writeLib(); }
  function libByPlaylist(playlistId) {
    const p = playlists.find(x => x.id === playlistId);
    return p ? libById(p._lib) : writeLib();
  }
  function libByFavorite(trackUrl) {
    const b = bookmarks.find(b => isFavoriteBookmark(b) && b.url === trackUrl);
    return b ? libById(b._lib) : writeLib();
  }

  // Communal favourites: a track's ☆ writes to the shared favourites/ wall
  // (not a local bookmark). `_favTrackUrls`/`_favRecords` (declared near the
  // top of createPlayer) are refreshed from the wall on `omp:favourited`.
  async function loadCommunalFavTracks() {
    try {
      const all = await listFavourites();
      _favRecords = all.filter(g => g.bucket === favBucket());
      // Index BOTH identities: a film is favourited under its IA item URL
      // (the Movies-column star's id) while it plays via its file URL (the
      // record's link) — checking both lets every surface light up the ★.
      _favTrackUrls = new Set(_favRecords.flatMap(g => [g.item, g.link].filter(Boolean)));
    } catch { /* offline / no folder */ }
    try {
      renderTracks();
      refreshAlbumStars();    // movies: relight the browse-column ☆/★
      refreshFavourites();    // the Community Favorites section
    } catch { /* not mounted yet */ }
  }

  // Re-render the Movies-column rows so their ☆/★ reflects the latest wall
  // (audio is a no-op — its album rows carry no star). Cheap: re-feeds the
  // same items, and renderItemActions reads the fresh fav state.
  function refreshAlbumStars() {
    if (activeMediaType() !== 'video') return;
    albumCol.setItems(albumCol.getItems());
  }

  // Toggle a film's favourite from the Movies column. Starring is a pure
  // bookmark — it records the film's IA item page and touches NO network
  // (the video file is resolved later, at play time). Clicking a lit ★
  // removes it from the communal wall (owner moderation).
  function favouriteMovieById(id) {
    const item = albumCol.getItems().find(it => it.id === id);
    const album = item?._album;
    if (!album) return;
    if (_favTrackUrls.has(album.url)) { deleteFavouriteRecord(album.url); return; }
    host?.dispatchEvent(new CustomEvent('item-favourite', {
      detail: {
        item: album.url, bucket: 'MovingImage', schemaType: 'VideoObject',
        name: album.name || album.url, link: album.url, download: false,
        thumbnail: album.thumbnail || '',
      },
      bubbles: true, composed: true,
    }));
  }

  // Play a film from the ★ Favourites column. A favourite points either at the
  // IA item PAGE (the current format — resolve its best playable file now, the
  // way onMovieSelectionChange does) or directly at a media FILE (older
  // favourites, and the music path) — play that as-is.
  async function playFavFilm(t) {
    const url = t.url || '';
    const isFile = /\/download\//.test(url)
      || /\.(mp4|m4v|ogv|ogg|webm|mov|mkv|avi|mpe?g)(\?|#|$)/i.test(url);
    if (isFile) {
      const track = { id: url, url, name: t.name || url, time: '', artist: '', album: t.name || '', albumUrl: '' };
      loadAndPlay(track, { autoplay: false });
      showFilmIntro(track, { name: t.name });
      return;
    }
    const album = { url, name: t.name };
    updateStatus(status, 'Loading film…');
    let best = null;
    try {
      best = pickBestVideoFile(await fetchTracksForAlbum(album));
    } catch { /* network/parse error → handled below */ }
    if (!best) {
      updateStatus(status, '');
      showNotice(`Can't play “${t.name}” — no playable video found at the Internet Archive.`);
      return;
    }
    updateStatus(status, '');
    loadAndPlay(best, { autoplay: false });   // load + display, paused
    showFilmIntro(best, album);               // click-to-play intro overlay
  }

  // Toggle a track-list row's favourite. Clicking a lit ★ removes it from the
  // communal wall (owner moderation); ☆ adds it.
  function favouriteTrackRow(t) {
    if (!t || !t.url) return;
    if (isTrackFavorited(t.url)) { deleteFavouriteRecord(t.url); return; }
    const video = activeMediaType() === 'video';
    host?.dispatchEvent(new CustomEvent('item-favourite', {
      detail: {
        item: t.url, bucket: video ? 'MovingImage' : 'Sound',
        schemaType: video ? 'VideoObject' : 'AudioObject',
        name: t.name || t.url, link: t.url, download: true,
      },
      bubbles: true, composed: true,
    }));
  }

  function isTrackFavorited(url) {
    return _favTrackUrls.has(url);
  }

  // Owner moderation: delete one item's favourite from the communal wall.
  // A starred item can have several files (one per contributor) — remove
  // them all. Server-side this needs delete rights (a real session or the
  // dev kitchen flag); guests never see the affordance. Fires omp:favourited
  // so every open view (both players + the images tab) re-reads the wall.
  async function deleteFavouriteRecord(url) {
    const rec = _favRecords.find(g => g.item === url || g.link === url);
    if (!rec) return false;
    let removed = 0;
    for (const c of (rec.contributors || [])) {
      if (!c.file) continue;
      try { await removeFavouriteFile(c.file); removed++; }
      catch (e) { updateStatus(status, `Couldn't remove favourite: ${e.message}`); }
    }
    if (removed) document.dispatchEvent(new CustomEvent('omp:favourited'));
    return removed > 0;
  }

  function effectiveArtists() {
    const genreSel = genreCol.getSelection();
    if (genreSel.size === 0) return bookmarks.filter(isArtistBookmark);
    return bookmarks.filter(b => genreSel.has(b.topic) && isArtistBookmark(b));
  }

  // Curated = backed by something you curated: a sourcePlaylist link, a
  // curated playlist whose name/maker matches this artist (the "Madlib"
  // un-converted-stub case), OR it genuinely resolves to local RDF
  // albums (a localData catalogue artist like Wu-Tang). A bare
  // `localData` flag is NOT enough — "J Dilla" carries localData true
  // but has no playlist and no resolvable foaf:maker releases (0
  // albums) = raw, not curated. Shared by the 2-tier artist split AND
  // the click-to-aggregate read path so they classify identically.
  function isCuratedArtist(b) {
    if (!b) return false;
    if (b.sourcePlaylist) return true;
    const norm = (s) => (s || '').trim().toLowerCase();
    const name = norm(b.label);
    for (const p of playlists) {
      if (p.name && norm(p.name) === name) return true;
      if (p.maker && norm(p.maker) === name) return true;
    }
    if (b.localData && b.node) {
      // Lazy-load edge: a no-playlist catalogue artist (Wu-Tang) needs
      // release files for this check. They're skipped at startup, so it
      // returns false → such an artist shows under "Raw" UNTIL opened
      // once (fetchAlbumsForArtist then loads them + refreshes this
      // column → it moves to curated). Accepted cosmetic transient;
      // playlist-backed artists (sourcePlaylist/name match above) are
      // unaffected.
      const lib = libByArtist(b);
      try { return !!lib?.store && getLocalArtistAlbums(lib.store, b.node).length > 0; }
      catch { return false; }
    }
    return false;
  }

  function refreshArtistsColumn() {
    const list = effectiveArtists();
    const all = list.map(b => ({ id: bookmarkKey(b), label: b.label, title: b.label, url: b.url, _b: b }));
    // 2-tier provenance split — see isCuratedArtist.
    const curated = all.filter(it => isCuratedArtist(it._b)).sort(byLabel);
    const raw     = all.filter(it => !isCuratedArtist(it._b)).sort(byLabel);
    const isVideo = activeMediaType() === 'video';
    raw.forEach((it, i) => {
      it.className = 'ia-item-raw';
      it.ariaLabel = `${it.label} — raw archive.org search, not curated`;
      // Movies don't show the "Raw — uncurated…" section divider.
      if (i === 0 && !isVideo) it.section = 'Raw — uncurated archive.org searches';
    });
    artistCol.setItems([...curated, ...raw]);
  }

  async function fetchAlbumsForArtist(artist) {
    const key = bookmarkKey(artist);
    if (albumsByArtist.has(key)) return albumsByArtist.get(key);

    // Local-catalog artist (converted playlist / future import): the
    // albums are the Releases this Agent foaf:makers, read straight from
    // the RDF. No archive.org search.
    if (artist.localData && artist.node) {
      const lib = libByArtist(artist);
      if (lib?.store) {
        // Lazy: ensure this artist's release files are loaded first. A
        // converted artist is scoped to its source playlist's releases;
        // a no-playlist catalogue artist (e.g. Wu-Tang) needs the whole
        // releases set (foaf:maker scan), so load all release docs.
        const p = (async () => {
          const need = artist.sourcePlaylist
            ? releaseDocsForPlaylistDocs(lib.store, [String(artist.sourcePlaylist).split('#')[0]])
            : allReleaseDocs(lib.store, lib.baseURI);
          const changed = await ensureReleaseDocs(lib, need);
          if (changed) refreshArtistsColumn();
          return getLocalArtistAlbums(lib.store, artist.node)
            .map(a => ({ ...a, _artist: artist }));
        })();
        albumsByArtist.set(key, p);
        return p;
      }
    }

    // Artist landing pages can be either /details/<collection> URLs (the
    // traditional case — one IA collection per artist) or /search?query=…
    // URLs (a free-form search across all of archive.org, useful when the
    // artist doesn't have a single collection page). buildArchiveQuery
    // turns either into the right advancedsearch.php query string.
    const query = buildArchiveQuery(artist.url);
    if (!query) {
      const empty = Promise.resolve([]);
      albumsByArtist.set(key, empty);
      return empty;
    }
    const promise = getAlbums(query, qualityFilter, { mediaType: activeMediaType() })
      .then(list => list.map(a => ({ ...a, _artist: artist })))
      .catch(err => { console.error('getAlbums', err); return []; });
    albumsByArtist.set(key, promise);
    return promise;
  }

  let albumLoadToken = 0;
  // Ephemeral "Find an artist" search results. When set, they occupy
  // the Albums column instead of artist-derived albums and are NOT
  // persisted anywhere — the banner tells the user to save to a playlist
  // to keep them. Cleared as soon as the user navigates the library
  // cascade (genre/artist).
  let searchAlbums = null;
  function albumColumnEl() { return albumList.closest('.ia-column'); }
  function setAlbumNote(text) {
    const col = albumColumnEl();
    if (!col) return;
    let note = col.querySelector('.ia-album-note');
    if (!text) { note?.remove(); return; }
    if (!note) {
      note = document.createElement('div');
      note.className = 'ia-album-note';
      col.querySelector('.ia-column-header')?.after(note);
    }
    note.textContent = text;
  }
  function clearSearchResults() {
    if (!searchAlbums) return;
    searchAlbums = null;
    setAlbumNote('');
  }
  function renderSearchAlbums() {
    albumCol.setItems(searchAlbums.map(a => {
      const label = activeMediaType() === 'video' ? a.name : `${a._artist.label} — ${a.name}`;
      return { id: a.url, label, title: label, _album: a };
    }));
  }

  async function refreshAlbumsColumn() {
    if (currentSource === 'favorites') return;
    if (searchAlbums) { renderSearchAlbums(); refreshTrackList(); return; }
    const lbl = mediaLabels();
    const artistSel = artistCol.getSelection();
    if (artistSel.size === 0) {
      albumCol.setMessage(lbl.chooseArtist);
      refreshTrackList();
      return;
    }
    const myToken = ++albumLoadToken;
    albumCol.setMessage(lbl.loadingAlbums);
    const allArtists = effectiveArtists();
    const picked = allArtists.filter(b => artistSel.has(bookmarkKey(b)));
    const all = await Promise.all(picked.map(fetchAlbumsForArtist));
    if (myToken !== albumLoadToken) return;
    const flat = all.flat();
    if (!flat.length) {
      albumCol.setMessage(lbl.noAlbums);
      refreshTrackList();
      return;
    }
    albumCol.setItems(flat.map(a => {
      // Movies already sit under their chosen collection, so the column
      // shows just the film title; audio keeps the "Artist — Album" form.
      const label = activeMediaType() === 'video' ? a.name : `${a._artist.label} — ${a.name}`;
      return { id: a.url, label, title: label, _album: a };
    }));
    // Curated-artist-as-playlist (read half): auto-select every album
    // so the tracklist shows all the artist's tracks at once. Applies
    // to any single curated artist — playlist-backed (A) AND catalogue
    // (C, e.g. Wu-Tang). Edit routing is still gated separately on
    // libraryBackingPlaylist (A-only).
    // Audio aggregates a curated artist's whole catalogue into the queue;
    // movies don't (each film is played on click), so never auto-select.
    if ((libraryBackingPlaylist || libraryAggregateAlbums) && activeMediaType() !== 'video') {
      albumCol.setSelection(flat.map(a => a.url), { notify: false });
    }
    refreshTrackList();
  }

  async function fetchTracksForAlbum(album) {
    const key = album.url;
    if (tracksByAlbum.has(key)) return tracksByAlbum.get(key);

    // Local-catalog album: tracks come straight from mo:track in the
    // RDF — no live metadata fetch.
    if (album._local && album._releaseNode) {
      const lib = libByArtist(album._artist);
      if (lib?.store) {
        const relDoc = String(album._releaseNode.value || album._releaseNode).split('#')[0];
        const p = (async () => {
          // Defensive: the release file is normally already loaded
          // (its album row came from getLocalArtistAlbums), but ensure
          // it before reading mo:track so a lazy gap can't show 0 tracks.
          await ensureReleaseDocs(lib, [relDoc]);
          return getLocalReleaseTracks(lib.store, album._releaseNode).map(t => ({
            id: t.url,
            url: t.url,
            name: t.name,
            time: t.time || '',
            artist: album._artist?.label || '',
            album: album.name,
            albumUrl: album.url,
            node: t.node || null,   // RDF-backed → gets the same kebab as playlist rows
            _lib: album._artist?._lib,
          }));
        })();
        tracksByAlbum.set(key, p);
        return p;
      }
    }

    const cid = extractId(album.url);
    if (!cid) return Promise.resolve([]);
    // Album-level creator from the search result (may be array or string).
    const albumCreatorRaw = Array.isArray(album._creator) ? album._creator[0] : album._creator;
    const albumCreator = albumCreatorRaw ? String(albumCreatorRaw).trim() : '';
    const isVarious = /^(various(\s+artists?)?|v\.?a\.?)$/i.test(albumCreator);
    const albumArtistFallback = isVarious ? '' : albumCreator;
    const searchTermFallback = album._artist?.label || '';
    // Resolve artist per track: track's own (from IA file/item metadata)
    // beats the album's creator, which beats the search-term label the
    // user typed. Final fallback only kicks in for items missing all the
    // above — at that point "Flying Lotus (search term)" is the best
    // signal we have.
    const promise = getTracks(cid, qualityFilter, { mediaType: activeMediaType() })
      .then(list => (list || []).map(t => ({
        id: t.url,
        url: t.url,
        name: t.name,
        time: t.time || '',
        artist: t.artist || albumArtistFallback || searchTermFallback,
        album: album.name,
        albumUrl: album.url,
        _lib: album._artist?._lib,
        _rights: t._rights || album._rights || null,
        _detailUrl: t._detailUrl || album._detailUrl || album.url || '',
      })))
      .catch(err => { console.error('getTracks', err); return []; });
    tracksByAlbum.set(key, promise);
    return promise;
  }

  let trackLoadToken = 0;
  let trackEmptyMsg = 'Choose an album to add tracks.';

  function libraryEmptyMessage() {
    if (artistCol.getSelection().size === 0) return 'Choose an artist to see albums.';
    if (albumCol.getSelection().size === 0) return 'Choose an album to add tracks.';
    return 'No tracks in selected album(s).';
  }

  // Library mode: clicking an album APPENDS its tracks to the queue.
  // Deselecting an album does NOT remove tracks; the user removes them via ✕
  // (or by selecting rows and pressing Delete). Re-clicking the album fetches
  // again and appends any tracks that aren't already in the queue, so any
  // tracks removed from view come back when the album is clicked again.
  async function refreshTrackList() {
    if (currentSource !== 'library') return;
    // Movies have no tracklist queue — film selection is handled directly
    // by onMovieSelectionChange (Req 3). Skip the audio append-to-queue
    // path entirely so a curated collection doesn't bulk-fetch every film.
    if (activeMediaType() === 'video') return;
    const albumSel = albumCol.getSelection();
    if (!albumSel.size) {
      currentTracks = libraryTracks;
      trackEmptyMsg = libraryEmptyMessage();
      renderTracks();
      return;
    }
    const myToken = ++trackLoadToken;
    if (!libraryTracks.length) {
      trackEmptyMsg = 'Loading tracks…';
      currentTracks = libraryTracks;
      renderTracks();
    }
    const items = albumCol.getItems();
    const picked = items.filter(it => albumSel.has(it.id)).map(it => it._album);
    const lists = await Promise.all(picked.map(fetchTracksForAlbum));
    if (myToken !== trackLoadToken) return;
    const existingIds = new Set(libraryTracks.map(t => t.id));
    const toAdd = lists.flat().filter(t => !existingIds.has(t.id));
    if (toAdd.length) {
      libraryTracks = libraryTracks.concat(toAdd);
      markDirty();
    }
    currentTracks = libraryTracks;
    trackEmptyMsg = libraryEmptyMessage();
    applyTrackSort();
    renderTracks();
  }

  // Open the communal Favorites view. In movies, a film selected/playing in
  // the library view leaves the <video> + film-intro overlay in the shared
  // `player` grid cell; they'd sit on top of (and hide) the favourites list,
  // so clear that stage first. Clicking a favourite re-loads its film.
  function openFavoritesView() {
    if (activeMediaType() === 'video') {
      hideFilmIntro();
      container.classList.remove('has-video');
      try { audio.pause(); } catch { /* nothing loaded */ }
    }
    refreshFavoritesView();      // immediate, from the cached wall slice
    loadCommunalFavTracks();     // re-fetch the wall; re-renders when done
  }

  function refreshFavoritesView() {
    // The communal wall, sliced to this player's media bucket. Where a
    // favourited URL matches a loaded library track we reuse that rich track
    // (artist / album / duration); otherwise we play the bare record link.
    const byUrl = new Map(libraryTracks.map(t => [t.url, t]));
    currentTracks = _favRecords.map(rec => {
      const key = rec.item || rec.link;
      const hit = byUrl.get(key) || (rec.link && byUrl.get(rec.link)) || (rec.item && byUrl.get(rec.item));
      if (hit) return hit;
      return {
        id: key,
        url: rec.link || rec.item,
        name: rec.canonicalTitle || 'Untitled',
        time: '',
        artist: '',
        album: 'Favorites',
        albumUrl: '',
        thumbnail: rec.thumbnail || '',
      };
    });
    trackEmptyMsg = favouritesOnly
      ? 'No favourite films yet — tap ☆ on a film to add one.'
      : 'No favourites yet — tap ☆ on a track to add one.';
    applyTrackSort();
    renderTracks();
  }

  // Saved playlist bookmarks store the label as "Artist — Album — Title"
  // (joined with ' — ' when each piece is present). Split it back out so
  // the playlist view can show the same columns the library view does.
  function parsePlaylistBookmark(b) {
    // Prefer the structured fields parseBookmarks now puts on playlist
    // bookmarks; fall back to splitting the legacy "Artist — Album —
    // Title" label for any bookmark that lacks them.
    let name = b.name || '', artist = b.artist || '', album = b.album || '';
    if (!name && !artist && !album) {
      const parts = (b.label || '').split(' — ');
      if (parts.length >= 3) { artist = parts[0]; album = parts[1]; name = parts.slice(2).join(' — '); }
      else if (parts.length === 2) { album = parts[0]; name = parts[1]; }
      else name = b.label || '';
    }
    return {
      id: b.url,
      url: b.url,
      name: name || b.label,
      artist,
      album,
      albumUrl: b.source || '',
      time: '',
      node: b.node || null,   // Track URI — needed by the edit flow
      _lib: b._lib
    };
  }

  let playlistViewToken = 0;
  function refreshPlaylistView(playlistId) {
    const myToken = ++playlistViewToken;
    const lib = libByPlaylist(playlistId);
    if (lib?.loadDocs) {
      const need = releaseDocsForPlaylist(lib, playlistId);
      // Warm = at least one of this playlist's tracks already resolved
      // (its release file is loaded). Cold = release files skipped at
      // startup; show a brief loading note while we fetch them.
      const warm = bookmarks.some(b => b.topic === playlistId && b.url);
      if (need.length && !warm) {
        currentTracks = [];
        trackEmptyMsg = 'Loading playlist…';
        renderTracks();
        ensureReleaseDocs(lib, need)
          .then(() => {
            if (myToken !== playlistViewToken || currentSource !== playlistId) return;
            renderPlaylistView(playlistId, myToken);
            refreshArtistsColumn();
          })
          .catch(() => {
            if (myToken === playlistViewToken && currentSource === playlistId)
              renderPlaylistView(playlistId, myToken);
          });
        return;
      }
      if (need.length) {
        // Warm but possibly partial (multi-release playlist) — top up
        // in the background; re-render only if something new arrived.
        ensureReleaseDocs(lib, need).then(changed => {
          if (changed && myToken === playlistViewToken && currentSource === playlistId)
            renderPlaylistView(playlistId, myToken);
        }).catch(() => {});
      }
    }
    renderPlaylistView(playlistId, myToken);
  }

  function renderPlaylistView(playlistId, myToken) {
    const playlistBookmarks = bookmarks.filter(b => b.topic === playlistId);
    currentTracks = playlistBookmarks.map(parsePlaylistBookmark);
    trackEmptyMsg = 'This playlist is empty.';
    applyTrackSort();
    renderTracks();

    // Enrich each row with its real duration (and confirm artist/album)
    // by fetching the originating album's metadata. Group by album URL so
    // each album is fetched at most once; the per-album cache makes this
    // cheap on second visits.
    const byAlbum = new Map();
    for (const t of currentTracks) {
      if (!t.albumUrl) continue;
      if (!byAlbum.has(t.albumUrl)) byAlbum.set(t.albumUrl, []);
      byAlbum.get(t.albumUrl).push(t);
    }
    for (const [albumUrl, items] of byAlbum) {
      const stub = {
        url: albumUrl,
        name: items[0].album || '',
        _artist: { label: items[0].artist || '' }
      };
      fetchTracksForAlbum(stub).then(albumTracks => {
        if (myToken !== playlistViewToken) return;
        const byUrl = new Map(albumTracks.map(at => [at.url, at]));
        let changed = false;
        for (const t of items) {
          const at = byUrl.get(t.url);
          if (!at) continue;
          if (at.time && !t.time) { t.time = at.time; changed = true; }
          if (at.name && t.name !== at.name) { t.name = at.name; changed = true; }
        }
        if (changed && currentSource === playlistId) {
          applyTrackSort();
          renderTracks();
        }
      }).catch(() => {});
    }
  }

  function renderTracks() {
    // Whether a row gets the ⋯ kebab (≥2 actions: menu) vs the plain ✕
    // (1 action: direct remove). canEditTrack covers Edit availability
    // — kebab whenever Edit OR Visit-on-IA apply alongside Remove. The
    // only ✕ case for RDF-backed rows is a guest looking at a catalog
    // track that ALSO has no archive.org URL (Remove is the only action).
    // The Favorites view shows the communal wall. For the owner (real session
    // or kitchen) each row gets the ✕ "remove from favourites" affordance
    // (routed to deleteFavouriteRecord); guests just see the ★. Wall rows are
    // never playlist tracks, so they carry no kebab.
    const favView = currentSource === 'favorites';
    const owner = isEffectivelyLoggedIn();
    renderTrackList(trackBody, trackEmpty, currentTracks, {
      currentTrackId: currentTrack?.id,
      isFav: (t) => isTrackFavorited(t.url),
      favouritable: true,                 // every track shows a ☆
      wallDelete: favView && owner,       // owner moderation replaces ☆ with ✕
      emptyMessage: trackEmptyMsg,
      useKebab: (t) => {
        if (favView) return false;
        if (!t.node) return false;
        if (canEditTrack(t)) return true;
        return !!(t.albumUrl && /(?:^|\/\/)(?:www\.)?archive\.org\//.test(t.albumUrl));
      },
    });
    trackListApi?.applySelection();
    if (trackCount) {
      const n = currentTracks.length;
      if (!n) {
        trackCount.textContent = '';
      } else {
        let secs = 0;
        for (const t of currentTracks) secs += parseTimeSeconds(t.time);
        const totalMin = Math.round(secs / 60);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        const dur = secs > 0
          ? (h > 0 ? ` · ${h}h ${String(m).padStart(2, '0')}m` : ` · ${m}m`)
          : '';
        trackCount.textContent = `${n} track${n === 1 ? '' : 's'}${dur}`;
      }
    }
  }

  // Touching the library cascade (genre / artist / album) means the user
  // is browsing the library, not a playlist — snap the active view back
  // to library so the library side highlights and the playlist
  // de-highlights. Returns true if it actually switched.
  function ensureLibraryView() {
    if (currentSource === 'library') return false;
    currentSource = 'library';
    sourcesCol.setSelection([], { notify: false });
    updateViewClass();
    return true;
  }

  function onGenreSelectionChange(_sel) {
    ensureLibraryView();
    clearSearchResults();
    refreshArtistsColumn();
    refreshAlbumsColumn();
    markDirty();
  }

  function onArtistSelectionChange(sel) {
    ensureLibraryView();
    clearSearchResults();
    // Read half: any single curated artist (playlist-backed A OR
    // catalogue C) aggregates all its albums into the tracklist.
    // Edit half: only a playlist-backed (sourcePlaylist) artist routes
    // delete/move to its playlist file — catalogue artists stay
    // read-only. Anything else (multi-select / raw search) → neither.
    libraryBackingPlaylist = null;
    libraryAggregateAlbums = false;
    if (sel && sel.size === 1) {
      const picked = effectiveArtists().filter(b => sel.has(bookmarkKey(b)));
      if (picked.length === 1) {
        libraryAggregateAlbums = isCuratedArtist(picked[0]);
        if (picked[0].sourcePlaylist) {
          libraryBackingPlaylist = picked[0].sourcePlaylist;
        }
      }
    }
    refreshAlbumsColumn();
    markDirty();
  }

  function onAlbumSelectionChange(sel) {
    // Movies: a film isn't a queue of files — clicking one picks its best
    // version and plays it straight into the video panel (Req 3). Audio
    // keeps the append-to-queue behaviour below.
    if (activeMediaType() === 'video') { onMovieSelectionChange(sel); return; }
    // Picking an album while viewing a playlist replaces the queue with
    // the picked album's tracks (on top of the library snap-back).
    if (ensureLibraryView()) libraryTracks = [];
    refreshTrackList();
    markDirty();
  }

  // Among an item's playable files, the "film" is the longest one — extras
  // (trailers, credits, sample clips) are shorter. Ties / missing
  // durations fall back to the first file (getTracks already picked the
  // best derivative format within each group).
  function pickBestVideoFile(tracks) {
    if (!tracks || !tracks.length) return null;
    let best = tracks[0], bestSec = parseTimeSeconds(best.time);
    for (const t of tracks) {
      const s = parseTimeSeconds(t.time);
      if (s > bestSec) { best = t; bestSec = s; }
    }
    return best;
  }

  let movieLoadToken = 0;
  async function onMovieSelectionChange(sel) {
    ensureLibraryView();
    // Collapse to a single highlighted film (radio-like) — selecting a
    // movie loads its best version into the panel, paused (▶ to play).
    const ids = [...sel];
    const chosen = ids[ids.length - 1];
    // Movies never use the tracklist queue — leave `libraryTracks` (the
    // Music tab's queue) untouched so switching back to Music restores it.
    if (!chosen) { currentTracks = []; renderTracks(); markDirty(); return; }
    albumCol.setSelection([chosen], { notify: false });
    const item = albumCol.getItems().find(it => it.id === chosen);
    const album = item?._album;
    if (!album) return;
    const myToken = ++movieLoadToken;
    updateStatus(status, 'Loading film…');
    const files = await fetchTracksForAlbum(album);
    if (myToken !== movieLoadToken) return;
    const best = pickBestVideoFile(files);
    if (!best) {
      updateStatus(status, '');
      showNotice(`Can't play “${album.name}” — no playable video found at the Internet Archive.`);
      return;
    }
    // currentTracks holds just the chosen film — there's no file list in
    // the movies panel, so prev/next have nothing else to step through.
    // `libraryTracks` (the Music queue) is deliberately left intact.
    currentTracks = [best];
    updateStatus(status, '');
    loadAndPlay(best, { autoplay: false });   // load + display, paused
    showFilmIntro(best, album);               // click-to-play intro overlay
    markDirty();
  }

  // ---- film intro overlay (movies) ------------------------------------
  // Selecting a film loads it paused and shows an intro panel over the
  // video: title, running time, an Internet Archive link, and a play hint.
  // Clicking the panel (or pressing ▶) hides it and starts playback.
  let _currentFilm = null;
  function showFilmIntro(track, album) {
    if (!filmIntro) return;
    filmIntroTitle.textContent = album?.name || track.album || track.name || 'Untitled';
    filmIntroLength.textContent = track.time ? `Running time: ${track.time}` : '';
    const url = track.albumUrl || album?.url || '';
    filmIntroAbout.innerHTML = url
      ? `See more about this film at the <a href="${escapeHTML(url)}" target="_blank" rel="noopener">Internet Archive</a>`
      : '';
    if (filmIntroRights) {
      const r = track._rights || album?._rights || null;
      filmIntroRights.textContent = `⚖ ${r ? r.label : 'Rights unknown'}`;
    }
    _currentFilm = { track, album };
    // No star on the film overlay — films are favourited from the Movies
    // column (see albumCol's renderItemActions), the way images are starred.
    container.classList.add('film-intro');
  }
  function hideFilmIntro() { container.classList.remove('film-intro'); }
  if (filmIntro) {
    const startFromIntro = () => { hideFilmIntro(); audio.play().catch(() => {}); };
    filmIntro.addEventListener('click', startFromIntro);
    filmIntro.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startFromIntro(); }
    });
    // Safety net: if playback starts by any other means (the ▶ button),
    // drop the overlay too.
    audio.addEventListener('play', hideFilmIntro);
  }

  // ---- playback --------------------------------------------------------
  function recordHistory() {
    if (!currentTrack) return;
    history.push({ track: currentTrack });
    if (history.length > 200) history.shift();
  }

  // `autoplay:false` loads the media into the element (and reveals the
  // <video>) but leaves it paused — the user presses ▶. Movies use this so
  // a clicked film loads/displays without auto-playing.
  // A prominent, dismissible banner for things the user must not miss —
  // chiefly "this media can't play". The quiet status footer stays for
  // routine progress; this is for failures. Auto-dismisses unless `sticky`.
  let _noticeTimer = null;
  function showNotice(message, opts = {}) {
    let el = container.querySelector('.ia-notice');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ia-notice';
      el.setAttribute('role', 'alert');
      el.innerHTML = '<span class="ia-notice-icon" aria-hidden="true">⚠</span>'
        + '<span class="ia-notice-msg"></span>'
        + '<button type="button" class="ia-notice-close" aria-label="Dismiss">✕</button>';
      el.querySelector('.ia-notice-close').addEventListener('click', () => hideNotice());
      container.appendChild(el);
    }
    el.querySelector('.ia-notice-msg').textContent = message;
    el.classList.add('show');
    clearTimeout(_noticeTimer);
    if (!opts.sticky) _noticeTimer = setTimeout(hideNotice, opts.duration || 4000);
  }
  function hideNotice() {
    clearTimeout(_noticeTimer);
    container.querySelector('.ia-notice')?.classList.remove('show');
  }

  function loadAndPlay(track, opts = {}) {
    if (!track) return;
    hideNotice();   // a fresh load clears any stale failure banner
    const autoplay = opts.autoplay !== false;
    if (currentTrack && currentTrack.id !== track.id && !opts.fromHistory) recordHistory();
    currentTrack = track;
    if (autoplay) hasUserStarted = true;
    audio.src = track.url;
    audio.load();
    // Track whether the loaded media is a movie, and reveal the <video>
    // accordingly (Req 4); media-audio chrome ignores has-video.
    playingVideo = activeMediaType() === 'video';
    container.classList.toggle('has-video', playingVideo);
    updateStatusHTML(nowPlaying, nowPlayingHTML(track));
    updateStatus(status, '');
    markDirty();
    renderTracks();
    // Paused load (movies): swapping src + load() fires 'pause', so the
    // transport already shows ▶ — just don't start playback.
    if (!autoplay) return;
    audio.play().catch(err => {
      if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
        console.warn('Playback deferred:', err.name);
        updateStatus(status, 'Press ▶ to start playback');
        return;
      }
      updateStatus(status, `Error playing ${track.name}`);
      showNotice(`Can't play “${track.name}”. The media may be unavailable or in an unsupported format.`);
      console.error('Playback error:', err);
    });
  }

  function nowPlayingHTML(track) {
    const ia = track.albumUrl ? ` <a class="ia-link" href="${escapeHTML(track.albumUrl)}" target="_blank" rel="noopener">[IA]</a>` : '';
    // Item-level rights ride along on the track (from the IA adapter); shown
    // only when IA actually told us something, to keep the banner uncluttered.
    const rights = track._rights ? ` · <span class="ia-np-rights">⚖ ${escapeHTML(track._rights.label)}</span>` : '';
    // Movies: the banner is just the film's title (track.album holds the
    // IA item/movie title) — no file-name or queue counter.
    if (activeMediaType() === 'video') {
      const title = escapeHTML(track.album || track.name || 'Untitled');
      return `Now playing: ${title}${rights}${ia}`;
    }
    const parts = [track.artist, track.album, track.name].filter(Boolean).map(escapeHTML);
    const idx = currentTracks.findIndex(t => t.id === track.id);
    const counter = (idx >= 0 && currentTracks.length > 1) ? ` (${idx + 1}/${currentTracks.length})` : '';
    return `Now playing: ${parts.join(' — ')}${counter}${rights}${ia}`;
  }

  // ---- random ----------------------------------------------------------
  async function playRandom() {
    const pool = bookmarks.filter(b => isArtistBookmark(b) && b.url);
    if (!pool.length || randomPickInFlight) return;
    randomPickInFlight = true;
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        const artist = randomChoice(pool);
        const albums = await fetchAlbumsForArtist(artist);
        if (!albums.length) continue;
        const album = randomChoice(albums);
        const tracks = await fetchTracksForAlbum(album);
        if (!tracks.length) continue;
        const track = randomChoice(tracks);

        // Make sure we're on the Library source so the browser is visible.
        if (currentSource !== 'library') {
          sourcesCol.setSelection(['library'], { notify: false });
          switchSource('library');
        }
        // Sync the browser columns to highlight the chosen path.
        genreCol.setSelection([artist.topic], { notify: false });
        refreshArtistsColumn();
        artistCol.setSelection([bookmarkKey(artist)], { notify: false });
        await refreshAlbumsColumn();
        albumCol.setSelection([album.url], { notify: false });
        await refreshTrackList();

        loadAndPlay(track);
        return;
      }
      updateStatus(status, 'Could not find a random track to play');
    } finally {
      randomPickInFlight = false;
    }
  }

  // ---- skip / prev / advance ------------------------------------------
  function currentIndexInList() {
    if (!currentTrack) return -1;
    return currentTracks.findIndex(t => t.id === currentTrack.id);
  }

  function advance() {
    if (playMode === 'random') { playRandom(); return; }
    if (repeatMode === 'one' && currentTrack) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    const i = currentIndexInList();
    if (i < 0) {
      if (currentTracks[0]) loadAndPlay(currentTracks[0]);
      return;
    }
    if (i + 1 < currentTracks.length) {
      loadAndPlay(currentTracks[i + 1]);
      return;
    }
    if (repeatMode === 'all' && currentTracks[0]) {
      loadAndPlay(currentTracks[0]);
      return;
    }
    updateStatus(status, 'Reached the end of the list');
  }

  function goBack() {
    if (!history.length) { updateStatus(status, 'No previous track'); return; }
    const prev = history.pop();
    loadAndPlay(prev.track, { fromHistory: true });
  }

  // Shuffle / repeat toolbar buttons were retired; these setters now just
  // park the underlying mode (kept in state so saved blobs still round-trip
  // cleanly). Defaults stay 'ordered' / 'off' — the Randomize header button
  // is the one-shot replacement for shuffle.
  function setPlayMode(mode) {
    playMode = mode;
    markDirty();
  }

  function setRepeatMode(mode) {
    repeatMode = mode;
    markDirty();
  }

  // ---- track list interaction -----------------------------------------
  // Column resize works on any of the data columns; sort works on Title /
  // Artist / Album / Time / Favorite headers.
  setupColumnResize(trackTable);
  trackTable.addEventListener('mouseup', () => markDirty());

  // Sources column is user-resizable: drag its right-edge handle to set
  // --ia-sources-width on the grid container (persisted via markDirty).
  const sourcesResizeHandle = container.querySelector('.ia-sources-resize');
  if (sourcesResizeHandle) {
    sourcesResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = container.querySelector('.ia-sources')?.offsetWidth || 260;
      const onMove = (ev) => {
        // Clamp so the column can't be dragged uselessly small or eat the
        // whole window.
        const w = Math.max(140, Math.min(600, startW + (ev.clientX - startX)));
        container.style.setProperty('--ia-sources-width', w + 'px');
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        container.classList.remove('resizing-sources');
        markDirty();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      container.classList.add('resizing-sources');
    });
  }
  // Browser cascade is vertically resizable: drag its bottom-edge handle
  // to set --ia-browser-height on the grid container (persisted via
  // markDirty); the tracklist (1fr) absorbs the remaining height.
  const browserResizeHandle = container.querySelector('.ia-browser-resize');
  if (browserResizeHandle) {
    browserResizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = container.querySelector('.ia-browser')?.offsetHeight || 220;
      const onMove = (ev) => {
        const h = Math.max(120, Math.min(640, startH + (ev.clientY - startY)));
        container.style.setProperty('--ia-browser-height', h + 'px');
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        container.classList.remove('resizing-browser');
        markDirty();
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      container.classList.add('resizing-browser');
    });
  }

  // Toolbar "Find an artist": run a creator-scoped, audio-only
  // archive.org search and drop the results into the Albums column as
  // EPHEMERAL results (nothing is persisted — no artist is created).
  // The user keeps what they want by adding tracks to a playlist.
  // ---- Solid login -----------------------------------------------------
  // <sol-login> is bundled from source so it shares the player's single
  // rdflib + the one `rdf` singleton; its _integrateWithRdflib() (run on
  // init/login/logout) patches that shared fetcher with the Inrupt
  // authenticated fetch. The player mounts after DOMContentLoaded, so
  // sol-login's auto-init never fires for it — we drive initialize()
  // here (also processes the OIDC redirect return). Guarded: with no
  // @inrupt/solid-client-authn-browser UMD present the button still
  // shows; only an actual login attempt errors (standalone stays fine).
  const solLogin = solLoginEl();
  if (solLogin) {
    // ONE-TIME global bootstrap: the single login element (chrome shell or
    // standalone panel) is initialised + click-tracked ONCE, even though
    // both panels run this block. Session reactions below stay PER-PANEL
    // (document-level) so the one login refreshes every panel.
    const bootstrapping = !solLoginBootstrapped;
    solLoginBootstrapped = true;
    if (bootstrapping) {
      solLogin._manualInit = true;
      // Capture-phase so a deliberate login click is seen even though
      // sol-login's button is in shadow DOM (distinguishes it from a
      // silent session restore on plain reload).
      solLogin.addEventListener('click', () => {
        try { if (!solLogin.isLoggedIn) markAuthInflight(); } catch {}
      }, true);
    }
    // Re-gate THIS panel when the one-time init's silent restore lands.
    document.addEventListener('omp:reapply-gating', applyAccessGating);
    let solidBusy = false;
    const loadPod = async (url) => {
      updateStatus(status, 'Loading library from your pod…');
      const r = await loadSolidLibrary(url);
      if (!r.ok) updateStatus(status, `Couldn't load the pod library: ${r.err}. Staying on the local library.`);
      return !!r.ok;
    };
    document.addEventListener('sol-login', async (e) => {
      const webId = e.detail?.webId || solLogin.webId || '';
      if (!webId) return;
      // Signed in: consume the login-in-flight marker and restore the
      // pre-login search/hash the OIDC redirect clobbered (deep links).
      const _inflight = peekAuthInflight();
      if (_inflight) {
        try {
          const want = (_inflight.search || '') + (_inflight.hash || '');
          if (want && (location.search + location.hash) !== want)
            history.replaceState(null, '', location.pathname + want);
        } catch {}
        clearAuthInflight();
      }

      // In-place writable upgrade — ALWAYS, FIRST, idempotent. The
      // same-origin library is already in rdf.store; <sol-login>'s
      // _integrateWithRdflib() just swapped rdf.storeFetcher to the
      // authed fetch. Flip the write-path flag, drop read-only,
      // re-derive from the SAME store, refresh in place (no
      // reload/wipe). This must run UNCONDITIONALLY and BEFORE the
      // pending install/update resumes — those used to early-return
      // here, leaving the session logged-in-but-not-writable (rename →
      // "uneditable", no refresh). Safe on re-fire / silent restore.
      console.info('[omp] sol-login handler upgrade fired: webId=', webId);
      try {
        setSolidWriteAuthed(true);
        solidAuthed = true;
        solidReadOnly = false;
        sessionPrompted = false;
        const lib = enabledLibs().find(l => l.store && !l.config.solid
          && isLocalLibUrl(l.config.url));
        if (lib) {
          try { podLibRemember(webId, new URL(lib.config.url, location.href).href); } catch {}
          resyncLibFromStore(lib);          // re-derive (same store)
        }
        softRedraw();                        // refresh in place, keep view
        applyAccessGating();
        updateStatus(status, `Signed in: ${webId} — your library is now writable.`);
      } catch (err) {
        console.warn('[omp] pod login upgrade failed:', err);
        updateStatus(status, `Signed in, but: ${err.message}.`);
      }

      // THEN resume a deferred Install / Update-app push (heavy —
      // deferred out of the OIDC/initialize call stack so in-flight
      // auth requests aren't aborted). No longer blocks the upgrade.
      // Only the bootstrapping panel consumes the (global) pending flag so
      // the two panels don't race to claim it. NOTE: a deferred install
      // initiated from the OTHER panel would resume here against the wrong
      // library — narrow (logged-out owner) edge, tracked as a follow-up.
      if (bootstrapping && !solidBusy && consumePendingInstall()) {
        solidBusy = true;
        setTimeout(async () => {
          try { await installOnPod(); } finally { solidBusy = false; }
        }, 1500);
        return;
      }
      if (bootstrapping && !solidBusy && consumePendingUpdateApp()) {
        solidBusy = true;
        setTimeout(async () => {
          try { await updateAppOnPod(); } finally { solidBusy = false; }
        }, 1500);
        return;
      }
    });
    document.addEventListener('sol-logout', () => {
      podSync = null;
      // In-place downgrade: rdf.storeFetcher reverts to the unauth
      // fetch; the (public) library stays loaded, just read-only.
      setSolidWriteAuthed(false);
      solidAuthed = false;
      solidReadOnly = true;
      sessionPrompted = false;
      const lib = enabledLibs().find(l => l.store && !l.config.solid
        && isLocalLibUrl(l.config.url));
      if (lib) resyncLibFromStore(lib);
      softRedraw();
      applyAccessGating();
      updateStatus(status, 'Signed out. Viewing in guest mode — you may browse, search, listen, and favourite anything.');
    });
    if (bootstrapping) {
      Promise.resolve()
        .then(() => solLogin.initialize())
        // After initialize() the silent-restore path may have set
        // isLoggedIn=true without a fresh 'sol-login' event firing. Re-apply
        // gating across ALL panels so menu buttons reflect reality on reload.
        .then(() => document.dispatchEvent(new CustomEvent('omp:reapply-gating')))
        .catch((err) => console.warn('sol-login init skipped (no auth library?):', err?.message || err));
    }

    // Single-store: init() already loaded the same-origin library
    // ONCE into rdf.store (the logged-out, read-only spine). There is
    // nothing to auto-fetch here — login just swaps that store's
    // Fetcher to authed (sol-login handler above). Just reflect the
    // read-only state until then.
    if (!solLogin.isLoggedIn) {
      solidReadOnly = true;
      updateStatus(status, 'Viewing in guest mode. You may browse, search, listen, and favourite anything.');
    }
  }

  const artistSearchForm = container.querySelector('.ia-artist-search');
  if (artistSearchForm) {
    const artistSearchInput = artistSearchForm.querySelector('input');
    artistSearchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = artistSearchInput.value.trim();
      if (!name) return;
      const lib = writeLib();
      const u = new URL('https://archive.org/search');
      u.searchParams.set('query', `creator:"${name}"`);
      u.searchParams.append('and[]', `mediatype:"${activeMediaType() === 'video' ? 'movies' : 'audio'}"`);
      // Search results live in the library (album→track) pipeline.
      ensureLibraryView();
      genreCol.setSelection([], { notify: false });
      artistCol.setSelection([], { notify: false });
      sourcesCol.setSelection([], { notify: false });
      updateViewClass();
      searchAlbums = [];               // enter search-results mode
      setAlbumNote(`Searching “${name}”…`);
      albumCol.setMessage('Searching…');
      const token = ++albumLoadToken;
      let list = [];
      try {
        list = await getAlbums(buildArchiveQuery(u.href), qualityFilter, { mediaType: activeMediaType() });
      } catch (err) {
        console.error('find-artist search', err);
      }
      if (token !== albumLoadToken) return;   // superseded by a newer action
      const synthArtist = { label: name, _lib: lib?.config.id };
      searchAlbums = list.map(a => ({ ...a, _artist: synthArtist }));
      if (!searchAlbums.length) {
        setAlbumNote('');
        albumCol.setMessage(`No audio results for “${name}”.`);
        return;
      }
      setAlbumNote('Temporary search results — add tracks to a playlist to keep them.');
      renderSearchAlbums();
      refreshTrackList();
      updateStatus(status, `${searchAlbums.length} result${searchAlbums.length === 1 ? '' : 's'} for “${name}”.`);
    });
  }

  const trackSortApi = setupTrackSort(trackHead, {
    onSort: () => { applyTrackSort(); renderTracks(); markDirty(); }
  });

  function parseTimeSeconds(t) {
    if (!t) return 0;
    const parts = String(t).split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }

  function compareTracks(a, b, key) {
    if (key === 'time') return parseTimeSeconds(a.time) - parseTimeSeconds(b.time);
    if (key === 'fav') {
      const av = isTrackFavorited(a.url) ? 1 : 0;
      const bv = isTrackFavorited(b.url) ? 1 : 0;
      return av - bv;
    }
    const av = (a[key] || '').toString();
    const bv = (b[key] || '').toString();
    return av.localeCompare(bv, undefined, { sensitivity: 'base', numeric: true });
  }

  function applyTrackSort() {
    const { col, dir } = trackSortApi.getSort();
    if (!col) return;
    const factor = dir === 'asc' ? 1 : -1;
    currentTracks = currentTracks.slice().sort((a, b) => factor * compareTracks(a, b, col));
    if (currentSource === 'library') libraryTracks = currentTracks;
  }

  const trackListApi = setupTrackList(trackBody, {
    onPlay: (id) => {
      const t = currentTracks.find(tr => tr.id === id);
      if (!t) return;
      if (playMode === 'random') setPlayMode('ordered');
      // A favourited film is a bookmark to an IA item, not a playable file —
      // resolve its best version now (the same path the Movies column uses).
      if (activeMediaType() === 'video') { playFavFilm(t); return; }
      loadAndPlay(t);
    },
    onRemove: (ids, opts) => {
      removeTracksFromView(ids, opts);
    },
    onEdit: (id, anchor) => {
      openTrackKebabMenu(id, anchor);
    },
    onFavourite: (t) => favouriteTrackRow(t),
  });
  // Communal favourites state for the ☆ fill; refresh when anyone stars.
  loadCommunalFavTracks();
  document.addEventListener('omp:favourited', loadCommunalFavTracks);

  // Whether the title/artist/album editor is reachable for this row. The
  // editor PATCHes whatever file the Track node lives in: a real Solid
  // session can edit anywhere; a guest can only edit inline Tracks in
  // their current playlist file (catalog Tracks in releases/<slug>.ttl
  // are read-only for guests). Used both by the kebab menu (to decide
  // whether to show "Edit…") and by renderTracks (to decide whether
  // ⋯ vs ✕ should appear at all — see "more than one option" comment
  // in renderTrackList).
  function canEditTrack(row) {
    if (!row || !row.node) return false;
    if (isEffectivelyLoggedIn()) return true;
    // Guest: only Tracks living in the current playlist file are editable.
    const inPlaylist = currentSource && playlistIds.has(currentSource);
    if (!inPlaylist) return false;
    return row.node.value.startsWith(currentSource + '#');
  }

  // Kebab on a track row opens a small floating menu of available row
  // actions. The set of items varies with mode + track type:
  //
  //   Edit…                 — when canEditTrack(row)
  //   Visit on the Internet Archive  — when row.albumUrl is on archive.org
  //   Remove from {…}       — always (for RDF-backed rows)
  //
  // If only one item would appear, the menu is bypassed and the lone
  // action runs directly — matching the renderTrackList rule that a
  // 1-action row renders as ✕ instead of ⋯ (kebabs are reserved for
  // the >1-options case).
  function openTrackKebabMenu(id, anchor) {
    const row = currentTracks.find(t => t.id === id);
    if (!row) return;
    const albumUrl = row.albumUrl || '';
    const isIa = /(?:^|\/\/)(?:www\.)?archive\.org\//.test(albumUrl);
    const inPlaylist = currentSource && playlistIds.has(currentSource);

    const items = [];
    if (canEditTrack(row)) items.push({ id: 'edit',   label: 'Edit…' });
    if (isIa)              items.push({ id: 'visit',  label: 'Visit on the Internet Archive' });
    // Favouriting isn't here — the ☆ sits inline beside this kebab on every row.
    items.push({
      id: 'remove',
      label: inPlaylist ? 'Remove from playlist' : 'Remove from list',
      danger: true,
    });

    const pick = (action) => {
      if (action === 'visit')  { if (albumUrl) window.open(albumUrl, '_blank', 'noopener'); return; }
      if (action === 'remove') { removeTracksFromView([id], { fromButton: true }); return; }
      if (action === 'edit')   { openTrackEditPane(id); return; }
    };

    if (items.length <= 1) { pick(items[0]?.id || 'remove'); return; }
    showFloatingMenu(anchor, items, pick);
  }

  // The editor modal — just the title / artist / album form. Visit and
  // Remove used to live as buttons inside this modal; they're now
  // kebab-menu items above so the modal stays a pure editor.
  async function openTrackEditPane(id) {
    const row = currentTracks.find(t => t.id === id);
    if (!row || !row.node) {
      updateStatus(status, "Can't edit this track (no RDF node).");
      return;
    }
    const lib = libByPlaylist(currentSource) || writeLib();
    if (!lib) return;
    const siblingCount = releaseSiblingCount(lib.store, row.node);
    const inPlaylist = currentSource && playlistIds.has(currentSource);
    showTrackEditModal({
      values: { title: row.name, artist: row.artist, album: row.album },
      siblingCount,
      actions: [],   // Visit / Remove moved to the kebab menu
      onSave: async ({ title, artist, album }) => {
        const res = await updateTrackMeta(lib.store, lib.baseURI, row.node, { title, artist, album });
        if (!checkSaved(res, `edit "${row.name}"`)) return;
        // Update the in-memory bookmark so a later re-parse/render is right.
        const bm = bookmarks.find(b => b.node && b.node.value === row.node.value);
        if (bm) {
          bm.name = title; bm.artist = artist; bm.album = album;
          bm.label = [artist, album, title].filter(Boolean).join(' — ') || title;
        }
        // Album edit is shared by sibling tracks of the same Release —
        // update their rows + bookmarks too.
        if (album != null) {
          for (const b of bookmarks) {
            if (b.source && row.albumUrl && b.source === row.albumUrl) {
              b.album = album;
              b.label = [b.artist, b.album, b.name].filter(Boolean).join(' — ') || b.name;
            }
          }
        }
        // Reflect the edit in whatever view is showing it.
        if (inPlaylist) {
          invalidateLinkedArtistFor(currentSource);
          refreshPlaylistView(currentSource);
        } else {
          // Library view (e.g. a playlist-linked artist): update the
          // visible rows + drop the album's track cache so a re-select
          // re-reads the new metadata from the store.
          for (const t of currentTracks) {
            if (t.node && t.node.value === row.node.value) { t.name = title; t.artist = artist; }
            if (album != null && row.albumUrl && t.albumUrl === row.albumUrl) t.album = album;
          }
          if (row.albumUrl) tracksByAlbum.delete(row.albumUrl);
          renderTracks();
        }
        updateStatus(status, `Updated "${title}".`);
      }
    });
  }

  // Remove tracks from whatever view is currently active.
  //   - Library view: drop from the in-memory queue only (no RDF write).
  //   - Playlist view: persist by dropping the playlist's schema:itemListElement
  //     pointer (shared release/track triples are left intact).
  //   - Favorites view: same as playlist, addressed via getFavoritesUri.
  //
  // Confirmation policy (safety against accidental batch deletes):
  //   - ✕ button (opts.fromButton): always confirm.
  //   - Keyboard Delete with one row: silent.
  //   - Keyboard Delete with >1 rows: confirm.
  // Library queue removals never confirm — they're not persisted and
  // tracks can be re-added by clicking the album again.
  async function removeTracksFromView(trackIds, opts = {}) {
    if (!trackIds || !trackIds.length) return;
    const idSet = new Set(trackIds);
    // Library view with NO backing playlist (catalogue/search artist):
    // in-memory queue drop only, not persisted.
    if (currentSource === 'library' && !libraryBackingPlaylist) {
      libraryTracks = libraryTracks.filter(t => !idSet.has(t.id));
      currentTracks = libraryTracks;
      trackEmptyMsg = libraryEmptyMessage();
      renderTracks();
      markDirty();
      return;
    }

    // Favorites view = the communal wall. Removal is owner moderation: delete
    // the underlying favourite file(s), not a playlist pointer. (The ✕ is
    // hidden for guests; the server rejects an unauthorised DELETE anyway.)
    if (currentSource === 'favorites') {
      const needConfirmFav = opts.fromButton || trackIds.length > 1;
      if (needConfirmFav && !confirm(trackIds.length === 1
        ? 'Remove this favourite from the communal wall?'
        : `Remove ${trackIds.length} favourites from the communal wall?`)) return;
      const rows = currentTracks.filter(t => idSet.has(t.id));
      // deleteFavouriteRecord fires omp:favourited, whose listener reloads the
      // wall and re-renders this view — no manual refresh needed here.
      for (const t of rows) await deleteFavouriteRecord(t.url);
      return;
    }

    // Backed library view (curated artist) persists to its playlist,
    // exactly like playlist view.
    const backed = currentSource === 'library' ? libraryBackingPlaylist : null;

    const needConfirm = opts.fromButton || trackIds.length > 1;
    if (needConfirm) {
      const nameId = backed || currentSource;
      const playlistName = playlists.find(p => p.id === nameId)?.label
        || (currentSource === 'favorites' ? 'Favorites' : 'this playlist');
      const msg = trackIds.length === 1
        ? `Remove this track from "${playlistName}"?`
        : `Remove ${trackIds.length} tracks from "${playlistName}"?`;
      if (!confirm(msg)) return;
    }
    // Playlist / Favorites — persist removal from RDF. Each removal is
    // committed only when checkSaved approves, so a failed PATCH leaves
    // the track in both the UI and on disk (the track stays put in
    // currentTracks via a refresh below).
    const removed = currentTracks.filter(t => idSet.has(t.id));
    const playlistId = currentSource === 'favorites'
      ? getFavoritesUri(writeLib()?.baseURI)
      : (backed || currentSource);
    const succeeded = [];
    for (const t of removed) {
      const lib = currentSource === 'favorites' ? libByFavorite(t.url) : libByPlaylist(playlistId);
      if (!lib) continue;
      const res = await removeTrackFromPlaylist(lib.store, lib.baseURI, playlistId, t.url);
      if (!checkSaved(res, `remove "${t.name}" from playlist`)) continue;
      succeeded.push(t);
      for (let i = bookmarks.length - 1; i >= 0; i--) {
        if (bookmarks[i].url === t.url && bookmarks[i].topic === playlistId) {
          bookmarks.splice(i, 1);
          break;
        }
      }
    }
    const succSet = new Set(succeeded.map(t => t.id));
    currentTracks = currentTracks.filter(t => !succSet.has(t.id));
    // Backed library view: also drop from the in-memory queue so the
    // removed tracks don't re-appear on the next refresh.
    if (backed) libraryTracks = libraryTracks.filter(t => !succSet.has(t.id));
    if (succeeded.length && currentSource !== 'favorites') invalidateLinkedArtistFor(playlistId);
    renderTracks();
  }

  // ---- toolbar wiring -------------------------------------------------
  setupPlaybackControls(
    { audio, playBtn, prevBtn, nextBtn, seekSlider, timeCur, timeDur, volumeSlider },
    {
      onPlayToggle: () => {
        if (!currentTrack) {
          if (currentTracks[0]) loadAndPlay(currentTracks[0]);
          else playRandom();
          return;
        }
        // State-restore puts a track in `currentTrack` without loading the
        // audio source. First press of Play should start playback.
        if (!audio.src || audio.src !== currentTrack.url) {
          loadAndPlay(currentTrack);
          return;
        }
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      },
      onPrev: () => goBack(),
      onNext: () => advance()
    }
  );

  audio.addEventListener('volumechange', () => markDirty());

  // Persist playback position periodically so reopening the page resumes
  // close to where the user left off. timeupdate fires several times a
  // second; throttle to once every few seconds to avoid hammering
  // localStorage and the debounced save pipeline.
  let lastPositionSave = 0;
  audio.addEventListener('timeupdate', () => {
    const now = Date.now();
    if (now - lastPositionSave < 5000) return;
    lastPositionSave = now;
    markDirty();
  });
  audio.addEventListener('pause', () => markDirty());

  // Skip restricted / unplayable tracks instead of leaving the user stuck on
  // a silent player. Most commonly this fires for 401s on archive.org items
  // whose metadata is public but downloads are gated, plus the occasional
  // codec-not-supported case. Guard against infinite-skip when every track
  // in the queue is bad — bail out after a few in a row.
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;
  audio.addEventListener('playing', () => { consecutiveErrors = 0; });
  audio.addEventListener('error', () => {
    if (!audio.src || !currentTrack) return;
    const err = audio.error;
    console.warn('Audio error', err?.code, err?.message, 'for', currentTrack.url);
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      updateStatus(status, `Stopped: ${consecutiveErrors} tracks in a row couldn't be played.`);
      showNotice(`Stopped — ${consecutiveErrors} items in a row couldn't be played. The source may be offline.`, { sticky: true });
      return;
    }
    updateStatus(status, `Skipped (couldn't play "${currentTrack.name}")`);
    // Movies play one film at a time (no queue to skip to), so a silent
    // skip would look like nothing happened — surface it prominently.
    if (activeMediaType() === 'video') {
      showNotice(`Can't play “${currentTrack.name}”. The media may be unavailable or in an unsupported format.`);
    }
    if (playMode === 'random') playRandom();
    else advance();
  });

  audio.addEventListener('ended', () => {
    if (repeatMode === 'one') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    if (playMode === 'random') { playRandom(); return; }
    advance();
  });

  // ---- menu items -----------------------------------------------------
  helpMenuItem.addEventListener('click', () => {
    setMenuOpen(false);
    showAboutModal();
  });

  // Help reuses the About modal shell but in the wide "large" variant —
  // the action table needs the width. useBundle:false so edits to
  // ia-help.html show up immediately without a rebuild.
  helpLinkMenuItem?.addEventListener('click', () => {
    setMenuOpen(false);
    showAboutModal({ url: './assets/ia-help.html', title: 'Help', useBundle: false, size: 'large' });
  });

  loginHelpMenuItem?.addEventListener('click', () => {
    setMenuOpen(false);
    showAboutModal({ url: './assets/ia-login-help.html', title: 'Solid login help', useBundle: false, size: 'large' });
  });

  // Open the reserved "Deleted" bin in the ordinary playlist view.
  // Re-sync from the store first so a deletion made earlier this
  // session (which the UI arrays don't track) surfaces its bin.
  viewDeletedMenuItem?.addEventListener('click', () => {
    setMenuOpen(false);
    const lib = writeLib();
    if (!lib?.store) { updateStatus(status, 'Enable a library to view deleted items.'); return; }
    for (const l of enabledLibs()) resyncLibFromStore(l);
    const binId = deletedBinUri(lib.baseURI);
    if (!playlistIds.has(binId)) { updateStatus(status, 'Nothing has been deleted yet.'); return; }
    switchSource(binId);
  });

  // ⚠️ FIXME (component-interop migration): pod-install assumes a SELF-CONTAINED
  // bundle. omp now externalizes rdflib + the sol-components and loads them via
  // component-interop (see index.html). On the pod (non-localhost) data-stage
  // resolves to "cdn", so the sol-components themselves come from the CDN — but
  // data-manifest still points at the local ../sol-components/…, which won't
  // exist on the pod. Pod install must rewrite data-manifest to a CDN manifest
  // URL (e.g. https://cdn.jsdelivr.net/npm/sol-components@2.3.1/dist/sol-components.manifest.json).
  // Until that's done, "Install on my Pod" produces a broken deployment.
  //
  // Deploy a complete, self-hosted OMP onto the user's pod: the app
  // shell (CDN-prereq index.html + the self-contained ia-player.js
  // bundle) plus the whole local libraries/ tree, then best-effort link
  // it in the pod's public type index. Idempotent/resumable.
  // The two app files to push to a pod: index.html (script src rewritten
  // to the pod layout's ./ia-player.js) + the ACTUAL running bundle.
  // Critical: don't hardcode dist/ia-player.js — when this runs FROM a
  // pod instance the bundle is ./ia-player.js (no dist/), so a dist/
  // fetch 404s and the update silently pushes nothing. Discover the
  // real bundle from the page's own <script src>.
  async function readPodAppFiles() {
    // Resolve the EXPLICIT index.html file — never re-read a bare
    // container URL. When the page is served by a Solid server (CSS —
    // local dev or pod), location.href is the CONTAINER (…/foo/), and a
    // GET of that returns a Turtle directory LISTING, not index.html.
    // PUTting that listing over index.html corrupts the install (it was
    // the destructive Update-app bug). So append index.html when the URL
    // has no file extension, and VALIDATE every body before returning —
    // refuse to install a non-HTML / non-JS body (a listing, a 401/404
    // error page, a redirect) rather than clobber a good file with it.
    const pageUrl = location.href.split('#')[0].split('?')[0];
    const htmlUrl = /\/[^/]*\.[^/]+$/.test(pageUrl)
      ? pageUrl
      : new URL('index.html', pageUrl.endsWith('/') ? pageUrl : pageUrl + '/').href;
    const hRes = await fetch(htmlUrl);
    let html = await hRes.text();
    if (!hRes.ok || !/<html[\s>]|<ia-player[\s>]|<script[\s>]/i.test(html)) {
      throw new Error(`won't install: ${htmlUrl} returned ${hRes.status} and not HTML `
        + `(${html.length} bytes). The app page must be reachable as a file, not a container listing.`);
    }
    html = html.replace(/(?:\.?\/)?(?:dist\/)?ia-player(?:\.esm)?\.js/g, './ia-player.js');
    // Strip the dev-only kitchen flag — it must NEVER ship to a pod. It
    // fakes "logged in" without a real session, so the installed app would
    // show edit affordances and attempt AUTHENTICATED pod writes with no auth
    // behind them → 401. Kitchen mode is the `solid-kitchen` attribute on
    // <sol-default>; remove it (and any legacy inline window.SolidKitchen).
    html = html
      .replace(/(<sol-default\b[^>]*?)\s+solid-kitchen\b(\s*=\s*(?:"[^"]*"|'[^']*'|\S+))?/gi, '$1')
      .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.SolidKitchen(?:(?!<\/script>)[\s\S])*?<\/script>\s*/gi, '')
      .replace(/window\.SolidKitchen\s*=\s*true/gi, 'window.SolidKitchen = false');
    let bundleUrl = '';
    for (const s of document.querySelectorAll('script[src]')) {
      const src = s.getAttribute('src') || '';
      if (/ia-player(?:\.esm)?\.js(?:[?#]|$)/.test(src)) { bundleUrl = s.src; break; }
    }
    if (!bundleUrl) bundleUrl = new URL('dist/ia-player.js', htmlUrl).href; // dev fallback
    const jRes = await fetch(bundleUrl);
    const js = await jRes.text();
    if (!jRes.ok || js.length < 1000 || !/customElements|function|=>/.test(js)) {
      throw new Error(`won't install: ${bundleUrl} returned ${jRes.status} and not the JS bundle `
        + `(${js.length} bytes).`);
    }
    return [
      { relPath: 'index.html',   body: html, contentType: 'text/html' },
      { relPath: 'ia-player.js', body: js,   contentType: 'text/javascript' },
    ];
  }

  // Gather ONE library's pod files. Structural files (the catalog spine +
  // agents/genres) are always overwritten; content files (every playlist +
  // referenced release body) are marked `skipIfExists` so a re-install is
  // fast and won't clobber pod-side edits. Force-loads the playlist files
  // first so the two-phase lazy load can't truncate the copy. index.ttl is
  // COPIED (not synthesised) so each library keeps its own themeTaxonomy
  // root (Music #Music vs Movies #FilmTypes); only releases.ttl/playlists.ttl
  // are synthesised (they dcat:dataset the actually-gathered files).
  async function gatherLibraryFiles(lib) {
    const baseAbs = lib.baseURI;
    const libContainer = baseAbs.slice(0, baseAbs.lastIndexOf('/') + 1);
    const libSlug = libContainer.replace(/\/$/, '').split('/').pop() || 'library';
    const podLibPrefix = `libraries/${libSlug}/`;
    const title = lib.config?.label || libSlug;

    if (lib.loadDocs) {
      try { await lib.loadDocs(allPlaylistDocsFromIndex(lib.store, lib.baseURI)); }
      catch (e) { console.warn('[install] playlist force-load failed', e?.message || e); }
    }

    const content = [];
    const plSeeAlso = [];
    const plDocUrls = [];
    for (const u of allPlaylistDocs(lib.store, lib.baseURI)) {
      if (!u.startsWith(libContainer)) { console.warn('[install] SKIP playlist outside library', u); continue; }
      const rel = u.slice(libContainer.length);
      try {
        const resp = await fetch(u);
        const body = relativizeLibraryIris(await resp.text(), libSlug, rel);
        content.push({ relPath: podLibPrefix + rel, body, contentType: 'text/turtle', skipIfExists: true });
        plSeeAlso.push(`<./${rel}>`);
        plDocUrls.push(u);
      } catch (e) { console.warn('[install] gather playlist FAILED', u, e?.message || e); }
    }
    const relSeeAlso = [];
    for (const u of releaseDocsForPlaylistDocs(lib.store, plDocUrls)) {
      if (!u.startsWith(libContainer)) { console.warn('[install] SKIP release outside library', u); continue; }
      const rel = u.slice(libContainer.length);
      try {
        const resp = await fetch(u);
        const body = relativizeLibraryIris(await resp.text(), libSlug, rel);
        content.push({ relPath: podLibPrefix + rel, body, contentType: 'text/turtle', skipIfExists: true });
        relSeeAlso.push(`<./${rel}>`);
      } catch (e) { console.warn('[install] gather release FAILED', u, e?.message || e); }
    }
    const relDataset = relSeeAlso.map(u => u.replace(/>$/, '#it>'));
    const relIdx =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(title + ' — releases')}${
  relDataset.length ? ` ;\n    dcat:dataset ${relDataset.join(',\n                 ')}` : ''} .
`;
    const plIdx =
`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(title + ' — playlists')}${
  plSeeAlso.length ? ` ;\n    dcat:dataset ${plSeeAlso.join(',\n                 ')}` : ''} .
`;
    const structural = [
      { relPath: podLibPrefix + 'releases.ttl',  body: relIdx, contentType: 'text/turtle' },
      { relPath: podLibPrefix + 'playlists.ttl', body: plIdx,  contentType: 'text/turtle' },
    ];
    // Copy index.ttl + agents.ttl + genres.ttl (relativized) verbatim.
    for (const name of ['index.ttl', 'agents.ttl', 'genres.ttl']) {
      const resp = await fetch(libContainer + name);
      if (!resp.ok) throw new Error(`couldn't read ${name} (${resp.status})`);
      const body = relativizeLibraryIris(await resp.text(), libSlug, name);
      structural.push({ relPath: podLibPrefix + name, body, contentType: 'text/turtle' });
    }
    return { files: [...structural, ...content], podLibPrefix, title };
  }

  // The local libraries to install — EVERY <ia-player src> on the page
  // (Install/Update are whole-app, not panel-scoped), deduped + absolute.
  function localLibraryUrls() {
    const urls = [...document.querySelectorAll('ia-player[src]')]
      .map(el => { try { return new URL(el.getAttribute('src'), location.href).href; } catch { return null; } })
      .filter(u => u && isLocalLibUrl(u));
    // Fallback to this panel's own config if the page query found nothing.
    if (!urls.length) {
      const c = libraryConfigs.find(x => !x.solid && isLocalLibUrl(x.url));
      if (c) urls.push(new URL(c.url, location.href).href);
    }
    return [...new Set(urls)];
  }

  async function installOnPod() {
    setMenuOpen(false);
    if (!solLogin || !solLogin.isLoggedIn) {
      // Persist the intent so it survives the OIDC redirect and resumes
      // from the post-login `sol-login` handler, then open the provider
      // picker so the user can choose where to sign in.
      setPendingInstall();
      markAuthInflight();
      updateStatus(status, 'Choose your Solid provider to sign in — the install resumes automatically once you’re signed in.');
      if (!openPodLoginPicker())
        updateStatus(status, 'Open the gear menu and click "Log in" to sign in, then choose Install on my Pod again.');
      return;
    }
    const webId = solLogin.webId;
    const authedFetch = solLogin.fetchFor(webId);
    const libUrls = localLibraryUrls();
    if (!libUrls.length) { updateStatus(status, 'No local library available to install.'); return; }

    let storages = [];
    try { storages = await discoverPodStorages(authedFetch, webId); } catch {}
    if (!storages.length) storages = [new URL('/', webId).href];
    // 1) Present the discovered storages — pick one or type a custom URL.
    const menu = storages.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
    const pick = prompt(
      'Install Open Media Player — choose where it goes.\n\n' +
      'Enter a number, or type a full container URL:\n\n' + menu, '1');
    if (pick == null || !pick.trim()) return;
    let chosen;
    const n = parseInt(pick, 10);
    if (Number.isInteger(n) && storages[n - 1]) chosen = storages[n - 1];
    else if (/^https?:\/\/.+/.test(pick.trim())) chosen = pick.trim();
    if (!chosen) { updateStatus(status, 'Install cancelled — no valid location chosen.'); return; }
    const cbase = chosen.endsWith('/') ? chosen : chosen + '/';
    // 2) Editable final location (subfolder / different place is fine).
    const target = prompt(
      'Confirm or edit the install location:', new URL('open_media_player/', cbase).href);
    if (!target || !target.trim()) return;
    let podRoot = target.trim();
    if (!podRoot.endsWith('/')) podRoot += '/';

    // App shell (index.html + ia-player.js) — installed once at podRoot.
    let files = [];
    try {
      files = await readPodAppFiles();
    } catch (e) {
      updateStatus(status, `Couldn't read the app files to install: ${e.message}`);
      return;
    }

    // EVERY local library (Music + Movies): the spine + agents/genres
    // (structural, always overwritten) + each playlist/release body
    // (content, skipped if already on the pod). Libraries not loaded in
    // THIS panel's store are loaded on demand into the shared store.
    const installedLibs = [];
    for (const url of libUrls) {
      let lib = libs.find(l => l.baseURI === url && l.store);
      if (!lib) { try { lib = await loadOneLibrary({ id: url, url, enabled: true }); } catch { lib = null; } }
      if (!lib || !lib.store) { console.warn('[install] skipping unreadable library', url); continue; }
      try {
        const g = await gatherLibraryFiles(lib);
        files.push(...g.files);
        installedLibs.push({ podLibPrefix: g.podLibPrefix, title: g.title });
      } catch (e) {
        updateStatus(status, `Couldn't prepare ${url} to install: ${e.message}`);
        return;
      }
    }
    if (!installedLibs.length) { updateStatus(status, 'No readable libraries to install.'); return; }
    console.info(`[install] writing ${files.length} files (${installedLibs.length} libraries) to ${podRoot}`);

    updateStatus(status, `Installing ${files.length} files to ${podRoot}…`);
    const r = await installToPod(authedFetch, podRoot, files, (i, n, label) => {
      if (i === n || i % 10 === 0) updateStatus(status, `Installing ${i}/${n}: ${label}`);
    });

    // Record each installed library in the public type index (best-effort).
    let recorded = false;
    try {
      let ti = (await resolvePodLibraryUrl(authedFetch, webId)).typeIndex;
      if (!ti) ti = await ensurePublicTypeIndex(authedFetch, webId);
      if (ti) {
        for (const L of installedLibs) {
          const podLibIndex = podRoot + L.podLibPrefix + 'index.ttl';
          await registerPodLibrary(authedFetch, ti, {
            id: 'omp-pod-' + L.podLibPrefix.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, ''),
            url: podLibIndex, label: `${L.title} (my pod)`,
          });
          podLibRemember(webId, podLibIndex);
        }
        recorded = true;
      }
    } catch (e) { console.warn('type-index record skipped:', e?.message || e); }

    const reg = recorded ? ' Registered in your type index.' : ' (type index not updated).';
    updateStatus(status, r.ok
      ? `Installed ${installedLibs.length} ${installedLibs.length === 1 ? 'library' : 'libraries'} — open ${podRoot}index.html (${r.put} written${r.skipped ? `, ${r.skipped} kept` : ''}).${reg}`
      : `Installed ${r.put} files with ${r.failed.length} problem(s): ${r.failed.slice(0, 3).join('; ')}${reg}`);
  }
  installPodMenuItem?.addEventListener('click', installOnPod);

  // Push ONLY the app files (index.html + ia-player.js) to an
  // already-installed pod — for a bundle change without re-sending the
  // ~hundreds of library/release files. Idempotent overwrite via the
  // same installToPod path. Defaults the location to the
  // previously-installed pod root (derived from the remembered pointer).
  async function updateAppOnPod() {
    setMenuOpen(false);
    if (!solLogin || !solLogin.isLoggedIn) {
      // Persist the intent so it survives the OIDC redirect and resumes
      // from the post-login `sol-login` handler (same as installOnPod),
      // then open the provider picker so the user can choose where to
      // sign in.
      setPendingUpdateApp();
      markAuthInflight();
      updateStatus(status, 'Choose your Solid provider to sign in — the app update resumes automatically once you’re signed in.');
      if (!openPodLoginPicker())
        updateStatus(status, 'Open the gear menu and click "Log in" to sign in, then choose Update app on Pod again.');
      return;
    }
    const webId = solLogin.webId;
    const authedFetch = solLogin.fetchFor(webId);
    // Derive a guess at the previously-installed pod root from the
    // remembered library pointer (…/<podRoot>/libraries/<slug>/index.ttl
    // → …/<podRoot>/) so the second prompt's default points at the
    // existing install — not at a random new location.
    let guess = '';
    const last = podLibLast();
    if (last) { const i = last.indexOf('libraries/'); if (i > 0) guess = last.slice(0, i); }
    // Mirror Install-on-Pod's two-prompt flow: list discovered storages,
    // then a final editable location. (Previous one-prompt UX silently
    // pushed to the wrong place when the remembered pointer didn't
    // match the actual install location.)
    let storages = [];
    try { storages = await discoverPodStorages(authedFetch, webId); } catch {}
    if (!storages.length) storages = [new URL('/', webId).href];
    const menu = storages.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
    const pick = prompt(
      'Update app on Pod — choose where the app lives.\n\n' +
      'Enter a number, or type a full container URL:\n\n' + menu, '1');
    if (pick == null || !pick.trim()) return;
    let chosen;
    const n = parseInt(pick, 10);
    if (Number.isInteger(n) && storages[n - 1]) chosen = storages[n - 1];
    else if (/^https?:\/\/.+/.test(pick.trim())) chosen = pick.trim();
    if (!chosen) { updateStatus(status, 'Update cancelled — no valid location chosen.'); return; }
    const cbase = chosen.endsWith('/') ? chosen : chosen + '/';
    // If the player is running ON the chosen storage (you opened the
    // pod's own installed copy), default to the directory it lives in —
    // that's exactly the install to update, regardless of folder name.
    // Otherwise prefer the remembered install root on that same origin
    // (stale cross-origin pointers are ignored), then a generic fallback.
    const pageDir = (() => {
      const u = location.href.split('#')[0].split('?')[0];
      return u.endsWith('/') ? u : u.slice(0, u.lastIndexOf('/') + 1);
    })();
    const defaultLoc = (() => {
      try {
        if (new URL(pageDir).origin === new URL(cbase).origin
            && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(pageDir)) return pageDir;
      } catch {}
      if (guess) {
        try { if (new URL(guess).origin === new URL(cbase).origin) return guess; } catch {}
      }
      return new URL('open_media_player/', cbase).href;
    })();
    const target = prompt(
      'Confirm the existing install location to overwrite:', defaultLoc);
    if (!target || !target.trim()) return;
    let podRoot = target.trim();
    if (!podRoot.endsWith('/')) podRoot += '/';

    let files;
    try {
      files = await readPodAppFiles();
    } catch (e) {
      updateStatus(status, `Couldn't read the app files: ${e.message}`);
      return;
    }
    updateStatus(status, `Updating app (${files.length} files) at ${podRoot}…`);
    const r = await installToPod(authedFetch, podRoot, files,
      (i, n, label) => updateStatus(status, `Updating ${i}/${n}: ${label}`));
    updateStatus(status, r.ok
      ? `App updated — hard-reload ${podRoot}index.html (${r.put} files written).`
      : `App update: ${r.put} written, ${r.failed.length} problem(s): ${r.failed.slice(0, 3).join('; ')}`);
  }
  updateAppMenuItem?.addEventListener('click', updateAppOnPod);

  // Filters: opens the quality-filter modal. Saving (or resetting)
  // invalidates the album / track caches so the new thresholds take
  // effect the next time a row is clicked.
  filtersMenuItem?.addEventListener('click', () => {
    setMenuOpen(false);
    showFiltersModal({
      filter: qualityFilter,
      onSave: (next) => {
        qualityFilter = next === null ? { ...DEFAULT_FILTER } : next;
        saveFilter(qualityFilter);
        albumsByArtist.clear();
        tracksByAlbum.clear();
        // Refresh the visible columns so the new filter takes effect
        // immediately on what's currently shown.
        refreshAlbumsColumn();
        updateStatus(status, 'Filter updated.');
      }
    });
  });

  // Randomize button (tracklist # column header): one-shot Fisher-Yates
  // shuffle of whatever is currently visible. Doesn't touch playMode —
  // playback continues advancing linearly through the now-randomized order.
  // Re-clicking re-shuffles. No-op on empty queues. Stops sort/resize from
  // also firing on the parent <th>.
  randomizeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentTracks.length) {
      updateStatus(status, 'Nothing to randomize — the tracklist is empty.');
      return;
    }
    // Fisher–Yates in place on the visible array. In Library view that IS
    // libraryTracks (same reference), so the persisted queue follows along.
    const arr = currentTracks;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    // Clearing the active sort is essential: a randomized order is
    // meaningless if the table is going to re-sort it on next render.
    trackSortApi?.clear?.();
    renderTracks();
    updateStatus(status, `Randomized ${arr.length} track${arr.length === 1 ? '' : 's'}.`);
    markDirty();
  });

  // Clear-tracklist button (tracklist remove column header): same behavior
  // as the retired gear-menu item — only meaningful in Library view (that's
  // the ephemeral queue). Hidden via CSS on other views (see updateViewClass).
  clearTracksBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentSource !== 'library') {
      updateStatus(status, 'Clear tracklist only applies to the Library view. Use the playlist menu to delete a playlist.');
      return;
    }
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    libraryTracks = [];
    currentTracks = [];
    currentTrack = null;
    albumCol.setSelection([], { notify: false });
    trackListApi?.clearSelection?.();
    trackEmptyMsg = libraryEmptyMessage();
    renderTracks();
    updateStatusHTML(nowPlaying, '');
    updateStatus(status, 'Library queue cleared.');
    markDirty();
  });

  // Parked along with the menu entry — guard the listener so the missing
  // DOM node doesn't crash init.
  savePlaylistMenuItem?.addEventListener('click', async () => {
    setMenuOpen(false);
    if (!currentTracks.length) {
      updateStatus(status, 'Nothing to save — pick some albums first.');
      return;
    }
    const lib = writeLib();
    if (!lib) { updateStatus(status, 'Enable a library to save playlists.'); return; }
    const proposed = `Playlist ${playlists.length + 1}`;
    const name = prompt('Save current tracks as a playlist named:', proposed);
    if (!name || !name.trim()) return;
    const label = name.trim();
    updateStatus(status, `Saving playlist "${label}"…`);
    try {
      const res = await addPlaylist(lib.store, lib.baseURI, label);
      const playlistId = res.id;
      playlists.push({ id: playlistId, label, _lib: lib.config.id });
      playlistIds.add(playlistId);
      const payloads = currentTracks.map(t => ({
        label: [t.artist, t.album, t.name].filter(Boolean).join(' — ') || t.name,
        url: t.url,
        source: t.albumUrl
      }));
      // Same guest write-path opt-in as the drag-and-drop add above.
      const addRes = await addTracksToPlaylist(lib.store, lib.baseURI, playlistId, payloads,
        { inlineTracks: !isEffectivelyLoggedIn() });
      currentTracks.forEach((t, i) => {
        bookmarks.push({
          node: addRes.nodes?.[i],
          label: payloads[i].label,
          topic: playlistId,
          url: t.url,
          source: t.albumUrl,
          _lib: lib.config.id
        });
      });
      updateStatus(status, `Saved playlist "${label}" (${currentTracks.length} track${currentTracks.length === 1 ? '' : 's'}). Click it in Sources to view.`);
      refreshSources();
    } catch (err) {
      console.error('Save playlist failed:', err);
      updateStatus(status, `Could not save playlist: ${err.message}`);
    }
  });

  // ---- initial state --------------------------------------------------
  setPlayMode('ordered');
  setRepeatMode('off');
  applyActiveMediaType();   // relabel chrome for the active library on first paint
  repopulateGenres();
  refreshArtistsColumn();
  albumCol.setMessage(mediaLabels().chooseArtist);
  renderTracks();
  // First-paint access gating: covers cold load (no session yet) and
  // kitchen-mode previews. The 'sol-login' / 'sol-logout' handlers + the
  // post-initialize tick above re-apply this whenever session state moves.
  applyAccessGating();
  restoreState();

  // Two-phase load: the per-playlist files were skipped from the startup
  // spine (lazyPlaylists) so the browse columns paint immediately. Fetch
  // them in the background now, then refresh the Sources column + curated
  // split, and finish restoring a saved playlist view if one was pending.
  function backgroundLoadPlaylists() {
    for (const lib of enabledLibs()) {
      if (!lib.loadDocs) continue;
      const need = allPlaylistDocsFromIndex(lib.store, lib.baseURI);
      if (!need.length) continue;
      lib.loadDocs(need)
        .then(loaded => {
          if (!loaded) return;
          resyncLibFromStore(lib);   // re-parse playlists/bookmarks (same store)
          refreshSources();
          refreshArtistsColumn();
          if (pendingRestoreSource && playlistIds.has(pendingRestoreSource)
              && currentSource === 'library') {
            const src = pendingRestoreSource;
            pendingRestoreSource = null;
            sourcesCol.setSelection([src], { notify: false });
            switchSource(src);
          }
        })
        .catch(err => console.warn('background playlist load failed:', err));
    }
  }
  const _idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  _idle(() => backgroundLoadPlaylists());

  // Host-page chrome remote: the two-panel shell hides this panel's own ⋮
  // and drives these actions on whichever panel is active. We reuse the
  // (now-hidden) gear menu's handlers via a synthetic click so there's one
  // source of truth. `appState` lets the chrome gate owner-only items.
  host.appAction = (name) => {
    const sel = {
      help:        '.gear-help-link',
      about:       '.gear-help',
      loginHelp:   '.gear-login-help',
      filters:     '.gear-filters',
      viewDeleted: '.gear-view-deleted',
      installPod:  '.gear-install-pod',
      updateApp:   '.gear-update-app',
    }[name];
    if (sel) container.querySelector(sel)?.click();
  };
  host.appState = () => ({
    guest: !isEffectivelyLoggedIn(),
    real: isRealLoggedIn(),
    webId: (isRealLoggedIn() && solLoginEl()?.webId) || '',
    mediaType: activeMediaType(),
  });
  // The panel's media element, so the chrome can show a mini transport
  // (play/pause + progress) for an audio panel while another tab is shown.
  host.getMediaElement = () => audio;

  return container;
}

// ---------------------------------------------------------------------
// Library config persistence (localStorage)
// ---------------------------------------------------------------------

const LIB_KEY = 'ia-player:libraries';

function newLibraryId() {
  return 'lib-' + (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
}

// Locked slug rule: lowercase, spaces → _, strip non-alphanumerics,
// collapse repeats, trim. (Caller adds _N on folder collision.)
function slugifyLibrary(s) {
  return String(s).toLowerCase()
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_').replace(/^_|_$/g, '') || 'library';
}

// One-time self-heal: the bundled catalog moved from ./ia-music.ttl +
// ia-music-library/ to ./libraries/internet_archive_music/index.ttl
// (libraries-layout refactor). Rewrite any persisted config still
// pointing at the old paths so existing browsers don't 404 on startup.
// Idempotent; the migrated array is written back below.
function migrateConfigUrl(url) {
  if (typeof url !== 'string') return url;
  let u = url.replace('/ia-music-library/', '/libraries/internet_archive_music/');
  if (u === './ia-music.ttl' || u.endsWith('/ia-music.ttl')) {
    u = u.replace(/(^|\/)ia-music\.ttl$/,
      (_, p) => `${p}libraries/internet_archive_music/index.ttl`);
  }
  return u;
}

// A library is "local" when it resolves to the app's own origin (the
// bundled ./libraries/... catalog). Remote = any other origin (a
// +Source URL or a pod-discovered library). Drives startup selection.
function isLocalLibUrl(url) {
  try { return new URL(url, location.href).origin === location.origin; }
  catch { return false; }
}

function loadLibraryConfigs(defaultSrc) {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // A pod (solid) library is NEVER loaded from persisted config — it
      // needs the live Inrupt session, which doesn't exist at cold
      // startup (→ 401). It's re-added in-memory after login. Strip any
      // stale solid entry so the app self-heals.
      const clean = Array.isArray(parsed) ? parsed.filter(c => c && !c.solid) : [];
      if (clean.length) {
        let changed = false;
        for (const c of clean) {
          const nu = migrateConfigUrl(c.url);
          if (nu !== c.url) { c.url = nu; changed = true; }
          if (c.id === 'default' && c.label === 'Internet Archive') {
            c.label = 'Internet Archive Music'; changed = true;
          }
          // Startup selection rule: only same-origin (local) libraries
          // are auto-selected; remote ones are listed but unchecked
          // until the user opts in. Applied in-memory each load (not
          // persisted) so startup is deterministic regardless of the
          // last session's toggles.
          c.enabled = isLocalLibUrl(c.url);
        }
        if (changed) saveLibraryConfigs(clean);
        return clean;
      }
    }
  } catch (err) {
    console.warn('Could not read library configs from localStorage:', err);
  }
  return [{ id: 'default', label: 'Internet Archive Music', url: defaultSrc, enabled: true }];
}

function saveLibraryConfigs(libs) {
  try {
    // Don't persist the pod library (see loadLibraryConfigs).
    localStorage.setItem(LIB_KEY, JSON.stringify((libs || []).filter(c => c && !c.solid)));
  } catch (err) {
    console.warn('Could not write library configs to localStorage:', err);
  }
}

// Per-library enabled state, keyed by library URL. Libraries discovered
// from the pod type index aren't persisted as configs (only their URL
// lives in the type index), so this is how their last on/off choice
// survives a reload (plan decision: "all listed, remembered state").
const LIB_ENABLED_KEY = 'omp:lib-enabled';
function rememberLibEnabled(url, enabled) {
  if (!url) return;
  try {
    const m = JSON.parse(localStorage.getItem(LIB_ENABLED_KEY) || '{}');
    m[url] = !!enabled;
    localStorage.setItem(LIB_ENABLED_KEY, JSON.stringify(m));
  } catch (err) { console.warn('rememberLibEnabled failed:', err); }
}
function recallLibEnabled(url, fallback) {
  try {
    const m = JSON.parse(localStorage.getItem(LIB_ENABLED_KEY) || '{}');
    return url in m ? !!m[url] : fallback;
  } catch { return fallback; }
}

// Remember a user's pod library URL keyed by WebID. This is the
// fallback for pods whose public type index we can't write — the
// library exists, it just isn't auto-discoverable, so we recall the
// pointer locally instead.
const POD_LIB_KEY = 'omp:pod-library';
const POD_LIB_LAST = 'omp:pod-library:last';
function podLibRemember(webId, url) {
  try {
    const m = JSON.parse(localStorage.getItem(POD_LIB_KEY) || '{}');
    m[webId] = url;
    localStorage.setItem(POD_LIB_KEY, JSON.stringify(m));
  } catch (err) { console.warn('podLibRemember failed:', err); }
  // WebID-independent pointer so a publicly-readable pod library can be
  // shown at startup before/without login.
  try { localStorage.setItem(POD_LIB_LAST, url); } catch {}
}
function podLibRecall(webId) {
  try {
    return JSON.parse(localStorage.getItem(POD_LIB_KEY) || '{}')[webId] || null;
  } catch { return null; }
}
function podLibLast() {
  try { return localStorage.getItem(POD_LIB_LAST) || null; } catch { return null; }
}

// "Login in flight" marker. solid-client-authn strips ?code&state from
// the URL during handleIncomingRedirect BEFORE init() runs, so the URL
// is an unreliable "are we mid-login" signal. Instead we set this when
// a Solid login is initiated (it survives the OIDC redirect in
// localStorage), read it at init to skip the wasted unauth same-origin
// load, and clear it once signed in — also restoring the pre-login
// search/hash so deep links survive the redirect. Short TTL so an
// abandoned login doesn't suppress the local load forever.
const AUTH_INFLIGHT_KEY = 'omp:auth-inflight';
const AUTH_INFLIGHT_TTL = 120000;   // 2 min — an OIDC round-trip is seconds
function markAuthInflight() {
  try {
    localStorage.setItem(AUTH_INFLIGHT_KEY, JSON.stringify({
      search: location.search, hash: location.hash, t: Date.now(),
    }));
  } catch {}
}
function peekAuthInflight() {
  try {
    const v = JSON.parse(localStorage.getItem(AUTH_INFLIGHT_KEY) || 'null');
    if (!v) return null;
    if (Date.now() - (v.t || 0) > AUTH_INFLIGHT_TTL) {
      localStorage.removeItem(AUTH_INFLIGHT_KEY); return null;
    }
    return v;
  } catch { return null; }
}
function clearAuthInflight() { try { localStorage.removeItem(AUTH_INFLIGHT_KEY); } catch {} }
// Drop the remembered pointer(s) for a webId — used when a pointed-at
// pod library no longer loads (stale pre-refactor state).
function podLibForget(webId) {
  try {
    const m = JSON.parse(localStorage.getItem(POD_LIB_KEY) || '{}');
    if (webId) delete m[webId];
    localStorage.setItem(POD_LIB_KEY, JSON.stringify(m));
  } catch {}
  try { localStorage.removeItem(POD_LIB_LAST); } catch {}
}

// "Install on my Pod" needs a login first; Solid-OIDC login is a
// full-page redirect, so the intent must survive it in localStorage and
// resume from the post-login event.
const INSTALL_PENDING_KEY = 'omp:install-pending';
function setPendingInstall() {
  try { localStorage.setItem(INSTALL_PENDING_KEY, '1'); } catch {}
}
function consumePendingInstall() {
  try {
    const v = localStorage.getItem(INSTALL_PENDING_KEY);
    if (v) localStorage.removeItem(INSTALL_PENDING_KEY);
    return !!v;
  } catch { return false; }
}
const UPDATEAPP_PENDING_KEY = 'omp:updateapp-pending';
function setPendingUpdateApp() {
  try { localStorage.setItem(UPDATEAPP_PENDING_KEY, '1'); } catch {}
}
function consumePendingUpdateApp() {
  try {
    const v = localStorage.getItem(UPDATEAPP_PENDING_KEY);
    if (v) localStorage.removeItem(UPDATEAPP_PENDING_KEY);
    return !!v;
  } catch { return false; }
}

// ---------------------------------------------------------------------
// Init / IaPlayerElement
// ---------------------------------------------------------------------

async function loadOneLibrary(config) {
  try {
    // Single-store S1: the same-origin library (the app's own — pod
    // OR dev/localhost) loads ONCE into the rdf singleton store, so
    // login is just a Fetcher-auth swap (no reload, no duplicate).
    // External (+ Library, cross-origin) libs keep their own graph().
    const shared = !!config.solid || isLocalLibUrl(config.url);
    // Two-phase: skip the per-playlist files too (lazyPlaylists) so the
    // startup spine is just index + agents + genres. The browse columns
    // paint from those; createPlayer background-loads the playlist files
    // and refreshes the Sources column + curated split. Artist curated
    // detection survives the gap (sourcePlaylist lives in agents.ttl).
    const { store, baseURI, loadDocs } = await loadRDF(config.url,
      { shared, lazyReleases: true, lazyPlaylists: true });
    // Media type declared on the catalog (<index#it> dct:type) drives the
    // vocab profile, the archive.org mediatype, and the player element.
    const mediaType = libraryMediaType(store, baseURI);
    const { genres, bookmarks } = parseBookmarks(store, baseURI, mediaType);
    const playlists = parsePlaylists(store, baseURI);
    // loadDocs: fetch skipped per-release files on demand into `store`.
    return { config, store, baseURI, loadDocs, mediaType, genres, bookmarks, playlists, error: null };
  } catch (err) {
    console.error('Failed to load library', config.url, err);
    return { config, store: null, baseURI: null, loadDocs: null, mediaType: 'audio', genres: [], bookmarks: [], playlists: [], error: err.message };
  }
}

// One auto-About splash per page load, even with multiple <ia-player>s.
let aboutModalShown = false;
// The single <sol-login> (chrome shell or standalone) is initialised once,
// even though every panel's createPlayer wires its own session reactions.
let solLoginBootstrapped = false;
async function init(host, libraryConfigs) {
  // Build stamp — confirms which bundle is actually running (a stale
  // cached ia-player.js on the pod is the usual "still slow" culprit).
  try { console.info('[omp] BUILD', (typeof __OMP_BUILD__ !== 'undefined') ? __OMP_BUILD__ : 'dev-unbundled'); } catch {}
  showLoadingScreen(host);
  // Foreground the About modal on first startup; library loading runs
  // behind it. Fire-and-forget — we never want to block init on the modal.
  // Guard so the two-panel page (Music + Movies <ia-player>s) shows it
  // ONCE, not one per panel.
  // Startup About splash disabled for now — kept for easy reinsertion.
  // (Still available on demand via the gear menu's "About".)
  // if (!aboutModalShown) {
  //   aboutModalShown = true;
  //   showAboutModal().catch(err => console.warn('About modal failed:', err));
  // }
  // Remember which library tab the user was last on. The unified
  // index.html drives the set via reload() with hardcoded enabled flags,
  // bypassing loadLibraryConfigs' per-URL recall — so apply that memory
  // here too. Only when it yields exactly one active library (the
  // single-select invariant) so a fresh first load keeps its defaults.
  if (libraryConfigs.length > 1) {
    const recalled = libraryConfigs.map(c => recallLibEnabled(c.url, c.enabled));
    if (recalled.filter(Boolean).length === 1) {
      libraryConfigs.forEach((c, i) => { c.enabled = recalled[i]; });
    }
  }
  try {
    // Lazy: only fetch ENABLED libraries at startup. Disabled (remote,
    // unchecked) libraries are listed from their persisted config but
    // not fetched — so listing a remote library costs no network trip.
    // They load on demand when the user selects them (onLibrariesToggled).
    const unloadedLib = (config) => ({
      config, store: null, baseURI: null,
      genres: [], bookmarks: [], playlists: [], error: null, unloaded: true,
    });
    // Single-store S1: load every enabled library exactly once. The
    // same-origin lib goes into rdf.store (see loadOneLibrary); login
    // later just swaps that store's Fetcher to authed — no reload, no
    // duplicate — so the old auth-redirect "skip the eager load"
    // dance (and its _pushFlow/BOOT_AUTH_PARAMS guards) is gone.
    const loaded = await Promise.all(libraryConfigs.map(c =>
      c.enabled ? loadOneLibrary(c) : Promise.resolve(unloadedLib(c))));
    const player = createPlayer({
      libraryConfigs,
      libs: loaded,
      host
    });
    mountPlayer(host, player);
  } catch (error) {
    console.error('Initialization error:', error);
    showError(host, error.message);
  }
}

class IaPlayerElement extends HTMLElement {
  // `source` is accepted as an alias for `src` so a <sol-tabs> anchor's href
  // (forwarded as `source`) drives the player without a duplicate `data-src`.
  static get observedAttributes() { return ['src', 'source']; }

  connectedCallback() {
    if (this._mounted) return;
    this._mounted = true;
    // `defer`: don't auto-load on connect — the host page drives loading
    // (the two-panel index.html loads the ACTIVE panel via ensureLoaded()
    // and background-prefetches the other, so startup isn't blocked on
    // both libraries' spines at once).
    if (this.hasAttribute('defer')) return;
    this.ensureLoaded();
  }

  // Idempotent one-shot load — used by a host page to load a deferred panel
  // on demand (first shown) or to background-prefetch it after startup.
  ensureLoaded() {
    if (this._loaded) return;
    this._loaded = true;
    this._loadFromConfig();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this._mounted || (name !== 'src' && name !== 'source') || oldValue === newValue) return;
    // Only honor src attribute if no persisted libraries exist.
    if (!localStorage.getItem(LIB_KEY)) this._loadFromConfig();
  }

  _loadFromConfig() {
    const defaultSrc = this.getAttribute('src') || this.getAttribute('source');
    // Panel instance (storage-ns + src): one isolated, src-driven library.
    // Bypass the shared LIB_KEY config list so two panels (Music/Movies)
    // never read or overwrite each other's library set.
    const ns = this.getAttribute('storage-ns');
    if (ns && defaultSrc) {
      init(this, [{ id: ns, label: ns, url: defaultSrc, enabled: true }]);
      return;
    }
    if (!defaultSrc && !localStorage.getItem(LIB_KEY)) {
      showRDFInput(this, (uri) => {
        const cfg = [{ id: 'default', label: 'Internet Archive Music', url: uri, enabled: true }];
        saveLibraryConfigs(cfg);
        init(this, cfg);
      });
      return;
    }
    const libs = loadLibraryConfigs(defaultSrc || './libraries/internet_archive_music/index.ttl');
    init(this, libs);
  }

  reload(libraryConfigs) {
    init(this, libraryConfigs);
  }
}

if (!customElements.get('ia-player')) {
  customElements.define('ia-player', IaPlayerElement);
}
