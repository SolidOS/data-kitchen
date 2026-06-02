export function createPlayerUI({ mediaType = 'audio', panel = false } = {}) {
  const isVideo = mediaType === 'video';
  // Column labels per media type (the renderer half of the media-type
  // seam). Audio = music's labels; video = film terms.
  const L = isVideo
    ? { genre: 'Film Types', artist: 'Collections', album: 'Movies', find: 'Find a film…',
        addGenre: '+ Add film type', addArtist: '+ Add collection' }
    : { genre: 'Genres', artist: 'Artists', album: 'Albums', find: 'Find artist…',
        addGenre: '+ Add genre', addArtist: '+ Add artist' };
  // ONE media element for every library type — a <video> plays audio
  // files fine, so this single element handles both music and movies and
  // can switch media type at runtime without being recreated (music keeps
  // playing until a movie reuses it). Kept on the `.ia-audio` class so all
  // existing transport wiring is unchanged; `.ia-video` + the container's
  // .media-video class drive whether it's hidden (audio) or fills the
  // bottom (video).
  const mediaEl = '<video class="ia-audio ia-video" aria-label="Media player" playsinline controls></video>';
  const container = document.createElement('div');
  container.className = 'ia-player-app' + (isVideo ? ' media-video' : ' media-audio');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', isVideo ? 'Open Media Player (movies)' : 'Open Media Player');
  container.innerHTML = `
    <div class="ia-toolbar" role="toolbar" aria-label="Playback controls">
      <button type="button" class="ia-btn ia-prev" aria-label="Previous track" title="Previous"><span class="ia-icon" aria-hidden="true">⏮</span><span class="ia-blabel">Prev</span></button>
      <button type="button" class="ia-btn ia-play" aria-label="Play" title="Play"><span class="ia-icon" aria-hidden="true">▶</span><span class="ia-blabel">Play</span></button>
      <button type="button" class="ia-btn ia-next" aria-label="Next track" title="Next"><span class="ia-icon" aria-hidden="true">⏭</span><span class="ia-blabel">Next</span></button>
      <div class="ia-seek-wrap">
        <input class="ia-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" disabled>
        <span class="ia-time" aria-hidden="true"><span class="ia-time-cur">0:00</span> / <span class="ia-time-dur">0:00</span></span>
      </div>
      <div class="ia-volume-wrap" role="group" aria-label="Volume">
        <span class="ia-volume-icon" aria-hidden="true">🔊</span>
        <input class="ia-volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume">
      </div>
      <form class="ia-artist-search" role="search">
        <input class="ia-artist-search-input" type="search" placeholder="${L.find}" aria-label="Find by name (creator search)">
      </form>
      <span class="gear-wrap">
        <button type="button" class="ia-btn manage-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Open menu" title="Menu"><span class="ia-icon" aria-hidden="true">⋮</span><span class="ia-blabel">Menu</span></button>
        <div class="gear-menu" role="menu" hidden>
          <!-- Sign-in lives at the top of the menu. <sol-login> hosts its
               own button + WebID popover; isn't a .menu-item because it's
               not arrow-key navigable in the same way (its inner button
               handles focus). The menu button turns green and adopts the
               WebID as its title when sol-login reports a session. -->
          ${panel ? '' : `<div class="menu-item-sollogin" role="none">
            <sol-login class="ia-sol-login" issuers="https://solidcommunity.net,https://login.inrupt.com"></sol-login>
          </div>`}
          <!-- Clear tracklist now lives as a button at the far right of the
               tracklist header row; the menu entry is retired. -->
          <!-- Appearance: light/dark toggle + text-size stepper. Both write
               document-level attributes (data-theme / data-fontsize) so the
               two library panels stay in sync. -->
          <button type="button" class="menu-item gear-theme" role="menuitemcheckbox" aria-checked="false"><span class="gear-theme-ico" aria-hidden="true">🌙</span> <span class="menu-label gear-theme-label">Dark mode</span></button>
          <button type="button" class="menu-item gear-fontsize" role="menuitem"><span class="gear-fontsize-ico" aria-hidden="true">A</span> <span class="menu-label gear-fontsize-label">Text size: Medium</span></button>
          <!-- Save as playlist parked — restore when the workflow returns.
          <button type="button" class="menu-item gear-save-playlist" role="menuitem"><span aria-hidden="true">💾</span> <span class="menu-label">Save as playlist…</span></button>
          -->
          <button type="button" class="menu-item gear-filters" role="menuitem"><span aria-hidden="true">🔎</span> <span class="menu-label">Filters…</span></button>
          <button type="button" class="menu-item gear-view-deleted" role="menuitem"><span aria-hidden="true">🗑</span> <span class="menu-label">View deleted</span></button>
          <button type="button" class="menu-item gear-help-link" role="menuitem"><span aria-hidden="true">📖</span> <span class="menu-label">Help</span></button>
          <button type="button" class="menu-item gear-login-help" role="menuitem"><span aria-hidden="true">🔑</span> <span class="menu-label">Solid login help</span></button>
          <button type="button" class="menu-item gear-install-pod" role="menuitem"><span aria-hidden="true">📡</span> <span class="menu-label">Install on my Pod…</span></button>
          <button type="button" class="menu-item gear-update-app" role="menuitem"><span aria-hidden="true">📲</span> <span class="menu-label">Update app on Pod…</span></button>
          <button type="button" class="menu-item gear-help" role="menuitem"><span aria-hidden="true">?</span> <span class="menu-label">About</span></button>
        </div>
      </span>
    </div>

    <div class="ia-nowplaying"><span class="ia-nowplaying-text" role="status" aria-live="polite" aria-atomic="true"></span></div>

    <div class="ia-sources" data-column="source">
      <h3 class="ia-column-header" id="ia-h-libs">Libraries</h3>
      <ul class="ia-listbox ia-libraries-list" role="listbox" aria-multiselectable="true" aria-labelledby="ia-h-libs" tabindex="0"></ul>
      <h3 class="ia-column-header" id="ia-h-sources">Playlists</h3>
      <ul class="ia-listbox ia-sources-list" role="listbox" aria-labelledby="ia-h-sources" tabindex="0"></ul>
      <h3 class="ia-column-header" id="ia-h-favs">Community Favorites</h3>
      <ul class="ia-listbox ia-favourites-list" role="listbox" aria-labelledby="ia-h-favs" tabindex="0"></ul>
      <div class="ia-sources-actions">
        <button type="button" class="ia-add-source-btn">+ Library</button>
        <button type="button" class="ia-add-playlist-btn">+ Playlist</button>
      </div>
      <div class="ia-sources-resize" role="separator" aria-orientation="vertical" aria-label="Resize sources column" title="Drag to resize"></div>
    </div>

    <div class="ia-browser">
      <div class="ia-column" data-column="genre">
        <h3 class="ia-column-header" id="ia-h-genre">${L.genre}</h3>
        <ul class="ia-listbox" role="listbox" aria-multiselectable="true" aria-labelledby="ia-h-genre" tabindex="0"></ul>
        <div class="ia-column-footer">
          <button type="button" class="ia-add-genre-btn">${L.addGenre}</button>
        </div>
      </div>
      <div class="ia-column" data-column="artist">
        <h3 class="ia-column-header" id="ia-h-artist">${L.artist}</h3>
        <ul class="ia-listbox" role="listbox" aria-multiselectable="true" aria-labelledby="ia-h-artist" tabindex="0"></ul>
        <div class="ia-column-footer">
          <button type="button" class="ia-add-artist-btn">${L.addArtist}</button>
        </div>
      </div>
      <div class="ia-column" data-column="album">
        <h3 class="ia-column-header" id="ia-h-album">${L.album}</h3>
        <ul class="ia-listbox" role="listbox" aria-multiselectable="true" aria-labelledby="ia-h-album" tabindex="0"></ul>
      </div>
      <div class="ia-browser-resize" role="separator" aria-orientation="horizontal" aria-label="Resize browser" title="Drag to resize"></div>
    </div>

    <div class="ia-tracklist-wrap">
      <table class="ia-tracklist" role="grid" aria-label="Tracks">
        <colgroup>
          <col data-col="num" class="col-num">
          <col data-col="title" class="col-title">
          <col data-col="artist" class="col-artist">
          <col data-col="album" class="col-album">
          <col data-col="time" class="col-time">
          <col data-col="remove" class="col-remove">
          <!-- favorites column disabled for now; re-enable when that feature returns.
          <col data-col="fav" class="col-fav">
          -->
        </colgroup>
        <thead>
          <tr>
            <th scope="col" data-col="num" class="col-num"><button type="button" class="ia-randomize-btn" aria-label="Randomize tracklist order" title="Randomize"><span aria-hidden="true">🎲</span></button><span class="th-label">#</span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="title" data-sort="name" class="col-title"><span class="th-label">Title</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="artist" data-sort="artist" class="col-artist"><span class="th-label">Artist</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="album" data-sort="album" class="col-album"><span class="th-label">Album</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="time" data-sort="time" class="col-time"><span class="th-label">Time</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="remove" class="col-remove" aria-label="Remove"><button type="button" class="ia-clear-tracks-btn" aria-label="Clear tracklist" title="Clear tracklist"><span aria-hidden="true">🧹</span></button></th>
            <!--
            <th scope="col" data-col="fav" data-sort="fav" class="col-fav" aria-label="Favorite"><span class="th-label" aria-hidden="true">★</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            -->
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="ia-tracklist-empty">Choose an album to see tracks.</div>
    </div>

    <div class="ia-status" role="status" aria-live="polite" aria-atomic="true"><span class="ia-status-msg"></span><span class="ia-status-count" aria-live="off"></span></div>

    ${mediaEl}

    <!-- Film intro overlay (movies): shown over the player area when a film
         is selected but not yet started. Click (or Enter/Space) to play. -->
    <div class="ia-film-intro" role="button" tabindex="0" aria-label="Play film">
      <div class="ia-film-intro-card">
        <h2 class="ia-film-intro-title"></h2>
        <p class="ia-film-intro-length"></p>
        <p class="ia-film-intro-about"></p>
        <p class="ia-film-intro-rights"></p>
        <p class="ia-film-intro-hint">Click to play. Move the mouse to the lower right of the film to enlarge to full screen.</p>
      </div>
    </div>
  `;

  const manageButton = container.querySelector('.manage-btn');
  const gearMenu = container.querySelector('.gear-menu');
  const menuItems = () => Array.from(gearMenu.querySelectorAll('.menu-item'));

  function setMenuOpen(open, opts = {}) {
    gearMenu.hidden = !open;
    manageButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      const items = menuItems();
      const initial = opts.focusLast ? items[items.length - 1] : items[0];
      initial?.focus();
    } else if (opts.returnFocus !== false) {
      manageButton.focus();
    }
  }

  manageButton.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenuOpen(gearMenu.hidden, { returnFocus: false });
  });
  manageButton.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setMenuOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setMenuOpen(true, { focusLast: true });
    }
  });

  gearMenu.addEventListener('keydown', (e) => {
    const items = menuItems();
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setMenuOpen(false, { returnFocus: false });
    }
  });

  document.addEventListener('click', (e) => {
    if (!gearMenu.contains(e.target) && e.target !== manageButton) {
      if (!gearMenu.hidden) setMenuOpen(false, { returnFocus: false });
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !gearMenu.hidden) setMenuOpen(false);
  });

  function setPlayLabel(state) {
    const lbl = container.querySelector('.ia-play .ia-blabel');
    if (lbl) lbl.textContent = state === 'playing' ? 'Pause' : 'Play';
  }

  return {
    container,
    audio: container.querySelector('.ia-audio'),
    status: container.querySelector('.ia-status-msg'),
    trackCount: container.querySelector('.ia-status-count'),
    nowPlaying: container.querySelector('.ia-nowplaying-text'),
    // Film intro overlay (movies)
    filmIntro: container.querySelector('.ia-film-intro'),
    filmIntroTitle: container.querySelector('.ia-film-intro-title'),
    filmIntroLength: container.querySelector('.ia-film-intro-length'),
    filmIntroAbout: container.querySelector('.ia-film-intro-about'),
    filmIntroRights: container.querySelector('.ia-film-intro-rights'),
    // toolbar
    prevBtn: container.querySelector('.ia-prev'),
    playBtn: container.querySelector('.ia-play'),
    nextBtn: container.querySelector('.ia-next'),
    seekSlider: container.querySelector('.ia-seek'),
    timeCur: container.querySelector('.ia-time-cur'),
    timeDur: container.querySelector('.ia-time-dur'),
    volumeSlider: container.querySelector('.ia-volume'),
    // sources + browser columns
    sourcesList: container.querySelector('.ia-sources-list'),
    favouritesList: container.querySelector('.ia-favourites-list'),
    librariesList: container.querySelector('.ia-libraries-list'),
    addSourceBtn: container.querySelector('.ia-add-source-btn'),
    addPlaylistBtn: container.querySelector('.ia-add-playlist-btn'),
    genreList: container.querySelector('[data-column="genre"] .ia-listbox'),
    artistList: container.querySelector('[data-column="artist"] .ia-listbox'),
    albumList: container.querySelector('[data-column="album"] .ia-listbox'),
    addGenreBtn: container.querySelector('.ia-add-genre-btn'),
    addArtistBtn: container.querySelector('.ia-add-artist-btn'),
    genreColumnFooter: container.querySelector('[data-column="genre"] .ia-column-footer'),
    artistColumnFooter: container.querySelector('[data-column="artist"] .ia-column-footer'),
    // tracklist
    trackTable: container.querySelector('.ia-tracklist'),
    trackHead: container.querySelector('.ia-tracklist thead'),
    trackBody: container.querySelector('.ia-tracklist tbody'),
    trackEmpty: container.querySelector('.ia-tracklist-empty'),
    randomizeBtn: container.querySelector('.ia-randomize-btn'),
    clearTracksBtn: container.querySelector('.ia-clear-tracks-btn'),
    // menu
    manageButton,
    gearMenu,
    helpMenuItem: container.querySelector('.gear-help'),
    helpLinkMenuItem: container.querySelector('.gear-help-link'),
    loginHelpMenuItem: container.querySelector('.gear-login-help'),
    installPodMenuItem: container.querySelector('.gear-install-pod'),
    updateAppMenuItem: container.querySelector('.gear-update-app'),
    themeToggle: container.querySelector('.gear-theme'),
    fontSizeBtn: container.querySelector('.gear-fontsize'),
    filtersMenuItem: container.querySelector('.gear-filters'),
    viewDeletedMenuItem: container.querySelector('.gear-view-deleted'),
    savePlaylistMenuItem: container.querySelector('.gear-save-playlist'),
    setMenuOpen,
    setPlayLabel
  };
}

// ---------- Listbox -----------------------------------------------------

export function createListbox(ulElement, {
  onChange,
  allLabel = '(All)',
  showAll = true,
  multiSelect = true,
  mode = 'select',                 // 'select' | 'checkbox'
  allowDeselect = false,           // single-select only: re-click clears
  renderItemActions = null,        // (item) => extra HTML appended to each row
  onItemAction = null,             // (action, id, anchorEl) => void
  onItemDrop = null                // (id, dataTransfer) => void
} = {}) {
  let items = [];        // [{ id, label }]
  let selected = new Set();   // empty = "all"
  let anchorId = null;        // for shift-click range
  let message = null;         // when set, show this instead of items

  function getSelection() { return new Set(selected); }
  function getItems() { return items.slice(); }

  function setItems(newItems) {
    items = newItems.slice();
    message = null;
    for (const id of [...selected]) {
      if (!items.some(it => it.id === id)) selected.delete(id);
    }
    if (anchorId && !items.some(it => it.id === anchorId)) anchorId = null;
    render();
  }

  function setMessage(text) {
    message = text || null;
    render();
  }

  function setSelection(ids, opts = {}) {
    selected = new Set(ids || []);
    for (const id of [...selected]) {
      if (!items.some(it => it.id === id)) selected.delete(id);
    }
    render();
    if (opts.notify !== false) onChange?.(getSelection());
  }

  function checkboxGlyph(isSel) { return isSel ? '☑' : '☐'; }

  function render() {
    if (message !== null) {
      ulElement.innerHTML = `<li class="ia-listbox-message" aria-disabled="true">${escapeHTML(message)}</li>`;
      return;
    }
    const allActive = selected.size === 0;
    let html = '';
    if (showAll) {
      html += `<li role="option" class="ia-listbox-item ia-listbox-all${allActive ? ' selected' : ''}" data-id="" tabindex="-1" aria-selected="${allActive}">${escapeHTML(allLabel)}</li>`;
    }
    for (const item of items) {
      // Optional non-interactive section divider before this item
      // (role=presentation, no .ia-listbox-item ⇒ skipped by keyboard
      // nav and selection). Used to label the curated/raw artist split.
      if (item.section) {
        html += `<li class="ia-listbox-divider" role="presentation">${escapeHTML(item.section)}</li>`;
      }
      const isSel = selected.has(item.id);
      const prefix = mode === 'checkbox'
        ? `<span class="ia-listbox-checkbox" aria-hidden="true">${checkboxGlyph(isSel)}</span>`
        : '';
      const actions = renderItemActions?.(item) ?? '';
      // Optional native hover tooltip (used by playlists for description).
      const titleAttr = item.title ? ` title="${escapeHTML(item.title)}"` : '';
      // Optional extra class + accessible label (e.g. raw search artists)
      // so the distinction survives greyscale / screen readers.
      const cls = `ia-listbox-item${isSel ? ' selected' : ''}${item.className ? ' ' + item.className : ''}`;
      const ariaAttr = item.ariaLabel ? ` aria-label="${escapeHTML(item.ariaLabel)}"` : '';
      html += `<li role="option" class="${cls}" data-id="${escapeHTML(item.id)}" tabindex="-1" aria-selected="${isSel}"${titleAttr}${ariaAttr}>${prefix}<span class="ia-listbox-label">${escapeHTML(item.label)}</span>${actions}</li>`;
    }
    ulElement.innerHTML = html;
  }

  function selectOnly(id) {
    selected.clear();
    if (id) selected.add(id);
    anchorId = id || null;
    render();
    onChange?.(getSelection());
  }

  function toggle(id) {
    if (!id) selected.clear();
    else if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    anchorId = id || null;
    render();
    onChange?.(getSelection());
  }

  function rangeTo(id) {
    if (!anchorId || !id) return selectOnly(id);
    const ids = items.map(it => it.id);
    const a = ids.indexOf(anchorId);
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) return selectOnly(id);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    selected = new Set(ids.slice(lo, hi + 1));
    render();
    onChange?.(getSelection());
  }

  ulElement.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      const li = actionBtn.closest('.ia-listbox-item');
      onItemAction?.(actionBtn.dataset.action, li?.dataset.id ?? null, actionBtn);
      return;
    }
    const li = e.target.closest('.ia-listbox-item');
    if (!li) return;
    const id = li.dataset.id;
    if (mode === 'checkbox' && id) {
      toggle(id);
    } else if (multiSelect && e.shiftKey && id) {
      rangeTo(id);
    } else if (multiSelect && (e.ctrlKey || e.metaKey)) {
      toggle(id);
    } else if (!multiSelect && allowDeselect && id && selected.has(id)) {
      selected.clear();
      anchorId = null;
      render();
      onChange?.(getSelection());
    } else {
      selectOnly(id);
    }
    li.focus();
  });

  if (onItemDrop) {
    ulElement.addEventListener('dragover', (e) => {
      const li = e.target.closest('.ia-listbox-item');
      if (!li || !li.dataset.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      li.classList.add('drop-target');
    });
    ulElement.addEventListener('dragleave', (e) => {
      const li = e.target.closest('.ia-listbox-item');
      li?.classList.remove('drop-target');
    });
    ulElement.addEventListener('drop', (e) => {
      const li = e.target.closest('.ia-listbox-item');
      if (!li || !li.dataset.id) return;
      e.preventDefault();
      li.classList.remove('drop-target');
      onItemDrop(li.dataset.id, e.dataTransfer);
    });
  }

  ulElement.addEventListener('keydown', (e) => {
    const all = Array.from(ulElement.querySelectorAll('.ia-listbox-item'));
    if (!all.length) return;
    const focused = ulElement.querySelector('.ia-listbox-item:focus') || all[0];
    const idx = all.indexOf(focused);
    let nextIdx = idx;
    if (e.key === 'ArrowDown') { nextIdx = Math.min(idx + 1, all.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { nextIdx = Math.max(idx - 1, 0); e.preventDefault(); }
    else if (e.key === 'Home') { nextIdx = 0; e.preventDefault(); }
    else if (e.key === 'End') { nextIdx = all.length - 1; e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const id = focused.dataset.id;
      if (multiSelect && (e.ctrlKey || e.metaKey)) toggle(id);
      else if (multiSelect && e.shiftKey && id) rangeTo(id);
      else selectOnly(id);
      return;
    } else return;

    const next = all[nextIdx];
    if (next) {
      next.focus();
      const nid = next.dataset.id;
      if (multiSelect && e.shiftKey && nid && anchorId) rangeTo(nid);
      else if (!multiSelect || (!e.ctrlKey && !e.metaKey)) selectOnly(nid);
    }
  });

  render();

  // Relabel the "(All …)" row at runtime (e.g. when the active library's
  // media type switches Genres↔Film Types).
  function setAllLabel(text) {
    if (text && text !== allLabel) { allLabel = text; render(); }
  }

  return { setItems, setSelection, getSelection, getItems, setMessage, setAllLabel };
}

// ---------- Track list --------------------------------------------------

export function setupTrackList(tbody, handlers) {
  let selected = new Set();    // selected track IDs
  let anchor = null;            // last clicked anchor for shift-range

  function getRows() { return Array.from(tbody.querySelectorAll('.ia-track-row')); }
  function getSelection() { return new Set(selected); }

  function applySelection() {
    const rows = getRows();
    const validIds = new Set(rows.map(r => r.dataset.trackId));
    for (const id of [...selected]) if (!validIds.has(id)) selected.delete(id);
    if (anchor && !validIds.has(anchor)) anchor = null;
    rows.forEach(row => {
      const sel = selected.has(row.dataset.trackId);
      row.classList.toggle('selected', sel);
      row.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
  }

  function clearSelection() {
    selected.clear();
    anchor = null;
    applySelection();
  }

  function selectOnly(id) {
    selected.clear();
    if (id) { selected.add(id); anchor = id; }
    else anchor = null;
    applySelection();
  }

  function toggleInSelection(id) {
    if (!id) return;
    if (selected.has(id)) selected.delete(id);
    else { selected.add(id); anchor = id; }
    applySelection();
  }

  function rangeTo(id) {
    if (!anchor || !id) return selectOnly(id);
    const ids = getRows().map(r => r.dataset.trackId);
    const a = ids.indexOf(anchor);
    const b = ids.indexOf(id);
    if (a < 0 || b < 0) return selectOnly(id);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    selected = new Set(ids.slice(lo, hi + 1));
    applySelection();
  }

  function selectAll() {
    selected = new Set(getRows().map(r => r.dataset.trackId));
    if (selected.size) anchor = [...selected][0];
    applySelection();
  }

  function emitRemove(ids) {
    if (!ids.length) return;
    selected.clear();
    anchor = null;
    handlers.onRemove?.(ids);
  }

  tbody.addEventListener('click', (e) => {
    const favBtn = e.target.closest('.ia-track-fav-btn');
    if (favBtn) {
      // ☆ → favourite (doesn't select/play the row).
      e.stopPropagation();
      handlers.onFavourite?.({ url: favBtn.dataset.url, name: favBtn.dataset.name,
        artist: favBtn.dataset.artist, album: favBtn.dataset.album });
      return;
    }
    const removeBtn = e.target.closest('.ia-track-remove-btn');
    const kebabBtn = e.target.closest('.ia-track-kebab');
    const row = e.target.closest('.ia-track-row');
    if (!row) return;
    const trackId = row.dataset.trackId;
    if (kebabBtn) {
      // Kebab opens a small floating menu (Edit / Visit on the Internet Archive /
      // Remove, varying by row). The anchor is passed so the menu can
      // position itself against the clicked button.
      handlers.onEdit?.(trackId, kebabBtn);
      return;
    }
    if (removeBtn) {
      // The ✕ button always targets its own row, regardless of selection,
      // and always confirms — selection-based batch removal lives on the
      // keyboard Delete path. Tagging the call with fromButton=true tells
      // the caller to confirm even for a single row.
      selected.delete(trackId);
      if (anchor === trackId) anchor = null;
      handlers.onRemove?.([trackId], { fromButton: true });
      return;
    }
    if (e.shiftKey) rangeTo(trackId);
    else if (e.ctrlKey || e.metaKey) toggleInSelection(trackId);
    else selectOnly(trackId);
    row.focus();
  });

  tbody.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.ia-track-row');
    if (!row) return;
    const trackId = row.dataset.trackId;
    const ids = selected.has(trackId) ? [...selected] : [trackId];
    if (!selected.has(trackId)) selectOnly(trackId);
    e.dataTransfer.setData('application/x-ia-tracks', JSON.stringify(ids));
    e.dataTransfer.setData('text/plain', `${ids.length} track${ids.length === 1 ? '' : 's'}`);
    e.dataTransfer.effectAllowed = 'copy';
    row.classList.add('dragging');
  });
  tbody.addEventListener('dragend', (e) => {
    const row = e.target.closest('.ia-track-row');
    row?.classList.remove('dragging');
  });

  tbody.addEventListener('dblclick', (e) => {
    const row = e.target.closest('.ia-track-row');
    if (!row) return;
    if (e.target.closest('.ia-track-remove-btn,.ia-track-kebab')) return;
    handlers.onPlay?.(row.dataset.trackId);
  });

  tbody.addEventListener('keydown', (e) => {
    const rows = getRows();
    if (!rows.length) return;
    const focused = tbody.querySelector('.ia-track-row:focus') || rows[0];
    const idx = rows.indexOf(focused);
    let nextIdx = idx;

    if (e.key === 'ArrowDown') { nextIdx = Math.min(idx + 1, rows.length - 1); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { nextIdx = Math.max(idx - 1, 0); e.preventDefault(); }
    else if (e.key === 'Home') { nextIdx = 0; e.preventDefault(); }
    else if (e.key === 'End') { nextIdx = rows.length - 1; e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      handlers.onPlay?.(focused.dataset.trackId);
      return;
    } else if (e.key === ' ') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) toggleInSelection(focused.dataset.trackId);
      else handlers.onPlay?.(focused.dataset.trackId);
      return;
    } else if (e.key === 'Delete') {
      // Delete-only — Backspace was too easy to hit by mistake (people
      // expect it to mean browser-back). Multi-row Delete is confirmed
      // downstream; single-row Delete is silent.
      e.preventDefault();
      const ids = selected.size ? [...selected] : (focused ? [focused.dataset.trackId] : []);
      emitRemove(ids);
      return;
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      selectAll();
      return;
    } else if (e.key === 'Escape') {
      if (selected.size) { e.preventDefault(); clearSelection(); }
      return;
    } else return;

    const next = rows[nextIdx];
    if (next) {
      next.focus();
      const nid = next.dataset.trackId;
      if (e.shiftKey && anchor) rangeTo(nid);
      else if (!e.ctrlKey && !e.metaKey) selectOnly(nid);
    }
  });

  return { getSelection, clearSelection, applySelection };
}

export function setupColumnResize(table) {
  table.addEventListener('mousedown', (e) => {
    const handle = e.target.closest('.resize-handle');
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    const th = handle.closest('th');
    if (!th) return;
    const colName = th.dataset.col;
    const colEl = table.querySelector(`col[data-col="${colName}"]`);
    if (!colEl) return;
    const startX = e.clientX;
    const startWidth = th.offsetWidth;
    const onMove = (ev) => {
      const next = Math.max(30, startWidth + (ev.clientX - startX));
      colEl.style.width = next + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      table.classList.remove('resizing');
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    table.classList.add('resizing');
  });
}

export function setupTrackSort(thead, handlers) {
  let sortCol = null;
  let sortDir = 'asc';

  function applyIndicator() {
    Array.from(thead.querySelectorAll('th')).forEach(th => {
      th.classList.remove('sorted');
      th.removeAttribute('aria-sort');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = '';
    });
    if (!sortCol) return;
    const th = thead.querySelector(`th[data-sort="${sortCol}"]`);
    if (!th) return;
    th.classList.add('sorted');
    th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = sortDir === 'asc' ? '▲' : '▼';
  }

  thead.addEventListener('click', (e) => {
    if (e.target.closest('.resize-handle')) return;
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    if (sortCol === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = key;
      sortDir = 'asc';
    }
    applyIndicator();
    handlers.onSort?.(sortCol, sortDir);
  });

  return {
    applyIndicator,
    getSort: () => ({ col: sortCol, dir: sortDir }),
    setSort: (col, dir) => { sortCol = col || null; sortDir = dir === 'desc' ? 'desc' : 'asc'; applyIndicator(); },
    clear: () => { sortCol = null; sortDir = 'asc'; applyIndicator(); }
  };
}

export function renderTrackList(tbody, emptyEl, tracks, { currentTrackId, isFav, emptyMessage, useKebab, favouritable, wallDelete }) {
  if (!tracks.length) {
    tbody.innerHTML = '';
    if (emptyMessage) emptyEl.textContent = emptyMessage;
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  // The action cell is built per-row from up to three pieces:
  //   • ☆ — the communal-favourite toggle. Shown on EVERY favouritable row
  //     so a track is always one click from the wall (never buried in a menu).
  //   • ⋯ — a kebab, when the row has extra actions (Edit / Visit / Remove-
  //     from-playlist), built by openTrackKebabMenu. Sits beside the star.
  //   • ✕ — owner moderation in the Favorites view: removes the item from the
  //     communal wall (wallDelete). Replaces the star+kebab entirely.
  // The old ✕ "remove from the ephemeral queue" is gone — clear the queue
  // from the header 🧹 or with the keyboard.
  const wantsKebab = typeof useKebab === 'function'
    ? (t) => !!t.node && useKebab(t) !== false
    : (t) => !!t.node;
  const favBtnHTML = (t) =>
    `<button type="button" class="ia-track-fav-btn${isFav && isFav(t) ? ' on' : ''}" data-url="${escapeHTML(t.url || '')}" data-name="${escapeHTML(t.name || '')}" data-artist="${escapeHTML(t.artist || '')}" data-album="${escapeHTML(t.album || '')}" title="Add to favourites" aria-label="Favourite" tabindex="-1">${isFav && isFav(t) ? '★' : '☆'}</button>`;
  const kebabHTML =
    `<button type="button" class="ia-src-edit ia-row-kebab ia-track-kebab" aria-haspopup="menu" aria-label="Track actions" title="Track actions" tabindex="-1">⋯</button>`;
  const removeHTML =
    `<button type="button" class="ia-track-remove-btn" aria-label="Remove from favourites" title="Remove from favourites">✕</button>`;
  const actionCell = (t) => {
    if (wallDelete) return removeHTML;
    let html = favouritable ? favBtnHTML(t) : '';
    if (wantsKebab(t)) html += kebabHTML;
    // A non-favouritable row with no kebab still needs its remove affordance.
    if (!favouritable && !wantsKebab(t)) html += removeHTML;
    return html;
  };
  const rows = tracks.map((t, i) => {
    const isCurrent = t.id === currentTrackId;
    return `<tr class="ia-track-row${isCurrent ? ' playing' : ''}" draggable="true" data-track-id="${escapeHTML(t.id)}" data-album-url="${escapeHTML(t.albumUrl || '')}" tabindex="-1" aria-current="${isCurrent ? 'true' : 'false'}">
      <td class="col-num">${isCurrent ? '<span aria-hidden=\"true\">▸</span>' : i + 1}</td>
      <td class="col-title">${escapeHTML(t.name)}</td>
      <td class="col-artist">${escapeHTML(t.artist || '')}</td>
      <td class="col-album">${escapeHTML(t.album || '')}</td>
      <td class="col-time">${escapeHTML(t.time || '')}</td>
      <td class="col-remove">${actionCell(t)}</td>
    </tr>`;
  });
  tbody.innerHTML = rows.join('');
}

// ---------- Playback controls -------------------------------------------

export function formatTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function setupPlaybackControls(refs, handlers) {
  const { audio, playBtn, prevBtn, nextBtn, seekSlider, timeCur, timeDur, volumeSlider } = refs;

  playBtn.addEventListener('click', () => handlers.onPlayToggle?.());
  prevBtn.addEventListener('click', () => handlers.onPrev?.());
  nextBtn.addEventListener('click', () => handlers.onNext?.());

  let seeking = false;
  seekSlider.addEventListener('input', () => { seeking = true; });
  seekSlider.addEventListener('change', () => {
    seeking = false;
    if (isFinite(audio.duration)) {
      audio.currentTime = (parseFloat(seekSlider.value) / 1000) * audio.duration;
    }
  });

  volumeSlider.addEventListener('input', () => {
    audio.volume = parseFloat(volumeSlider.value);
  });

  audio.addEventListener('timeupdate', () => {
    if (seeking || !isFinite(audio.duration) || audio.duration === 0) return;
    seekSlider.value = String((audio.currentTime / audio.duration) * 1000);
    timeCur.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('loadedmetadata', () => {
    seekSlider.disabled = !isFinite(audio.duration);
    timeDur.textContent = formatTime(audio.duration || 0);
    timeCur.textContent = formatTime(audio.currentTime || 0);
  });

  audio.addEventListener('emptied', () => {
    seekSlider.value = '0';
    seekSlider.disabled = true;
    timeCur.textContent = '0:00';
    timeDur.textContent = '0:00';
  });

  const playIcon = playBtn.querySelector('.ia-icon');
  const playLabel = playBtn.querySelector('.ia-blabel');

  audio.addEventListener('play', () => {
    if (playIcon) playIcon.textContent = '⏸'; else playBtn.textContent = '⏸';
    if (playLabel) playLabel.textContent = 'Pause';
    playBtn.setAttribute('aria-label', 'Pause');
    playBtn.title = 'Pause';
  });

  audio.addEventListener('pause', () => {
    if (playIcon) playIcon.textContent = '▶'; else playBtn.textContent = '▶';
    if (playLabel) playLabel.textContent = 'Play';
    playBtn.setAttribute('aria-label', 'Play');
    playBtn.title = 'Play';
  });
}

export function setToolbarToggleState(btn, on) {
  btn.classList.toggle('active', !!on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

// Small absolute-positioned action menu anchored next to an element. Items
// are `{ id, label }`. Returns a close() handle. Auto-closes on outside
// click or Escape; closes after a selection. onSelect(id) is called.
export function showFloatingMenu(anchor, items, onSelect) {
  document.querySelectorAll('.ia-floating-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'ia-floating-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map(it =>
    `<button type="button" class="ia-floating-menu-item" role="menuitem" data-id="${escapeHTML(it.id)}">${escapeHTML(it.label)}</button>`
  ).join('');
  document.body.appendChild(menu);

  const rect = anchor.getBoundingClientRect();
  menu.style.position = 'fixed';
  // Measure then place. Default: drop down-right from the anchor. If that
  // would overflow the viewport's right edge (kebabs sit on a right
  // border), right-align the menu to the anchor instead so it opens
  // leftward. Same idea vertically for the bottom edge.
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const pad = 8;
  let left = rect.left;
  if (left + mw + pad > window.innerWidth) {
    left = Math.max(pad, rect.right - mw);
  }
  let top = rect.bottom + 4;
  if (top + mh + pad > window.innerHeight) {
    top = Math.max(pad, rect.top - mh - 4);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const close = () => {
    menu.remove();
    document.removeEventListener('mousedown', outside, true);
    document.removeEventListener('keydown', onKey);
  };
  const outside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) close();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus?.(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const btns = Array.from(menu.querySelectorAll('.ia-floating-menu-item'));
      const idx = btns.indexOf(document.activeElement);
      const next = e.key === 'ArrowDown'
        ? btns[(idx + 1) % btns.length]
        : btns[(idx - 1 + btns.length) % btns.length];
      next?.focus();
    }
  };

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('.ia-floating-menu-item');
    if (!btn) return;
    close();
    onSelect?.(btn.dataset.id);
  });

  setTimeout(() => {
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey);
  }, 0);
  const first = menu.querySelector('.ia-floating-menu-item');
  if (first) first.focus();
  return close;
}

let bundledAboutHtml = null;

export function setBundledAssets({ css, aboutHtml } = {}) {
  if (css && !document.getElementById('ia-player-styles')) {
    const style = document.createElement('style');
    style.id = 'ia-player-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }
  if (aboutHtml) bundledAboutHtml = aboutHtml;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(modal) {
  const opener = document.activeElement;
  const focusable = () => Array.from(modal.querySelectorAll(FOCUSABLE)).filter(el => !el.closest('[hidden]'));
  const first = focusable()[0];
  if (first) first.focus();
  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) return;
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  });
  return () => { opener?.focus?.(); };
}

export function updateStatusHTML(statusElement, html) {
  statusElement.innerHTML = html;
}

export function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

export async function showAboutModal(opts = {}) {
  // Back-compat: a bare string arg used to mean the URL.
  if (typeof opts === 'string') opts = { url: opts };
  const { url = './assets/ia-about.html', title = 'About', useBundle = true, size = 'normal' } = opts;

  const existing = document.querySelector('.about-modal');
  if (existing) existing.remove();

  let html;
  if (useBundle && bundledAboutHtml) {
    html = bundledAboutHtml;
  } else {
    try {
      const resp = await fetch(url);
      html = await resp.text();
    } catch (err) {
      html = `Could not load content: ${err.message}`;
    }
  }

  const overlay = document.createElement('div');
  overlay.className = 'about-modal';
  const sizeClass = size === 'large' ? ' about-modal-large' : '';
  overlay.innerHTML = `
    <div class="about-modal-content${sizeClass}" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">×</button>
      <h2 id="about-modal-title" class="about-modal-title">${escapeHTML(title)}</h2>
      <div class="about-modal-body">${html}</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const restoreFocus = trapFocus(overlay);
  const close = () => { overlay.remove(); restoreFocus(); };
  overlay.querySelector('.about-modal-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', esc);
    }
  });
}

// Filters modal — small form for the quality-filter config object. The
// caller passes the current filter and an onSave callback; the modal
// renders an input per field, normalises values on submit, and calls
// back with the new filter.
export function showFiltersModal({ filter, onSave }) {
  const existing = document.querySelector('.about-modal');
  if (existing) existing.remove();

  const f = filter || {};
  const blocked = (f.blockedCollections || []).join(', ');
  const minTrackMmSs = secsToMmSs(f.minTrackDurationSec || 0);
  const minItemMmSs = secsToMmSs(f.minItemRuntimeSec || 0);

  const overlay = document.createElement('div');
  overlay.className = 'about-modal';
  overlay.innerHTML = `
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="filters-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">×</button>
      <h2 id="filters-modal-title" class="about-modal-title">Filters</h2>
      <form class="filters-form">
        <p class="filters-hint">Hides low-quality archive.org results before they reach the album / track lists. Catalog artists (specific IA collections) are not filtered by default.</p>
        <label class="filters-row">
          <span class="filters-label">Min track length (mm:ss)</span>
          <input type="text" name="minTrack" value="${escapeHTML(minTrackMmSs)}" placeholder="3:00" inputmode="numeric">
        </label>
        <label class="filters-row">
          <span class="filters-label">Min item runtime (mm:ss)</span>
          <input type="text" name="minItem" value="${escapeHTML(minItemMmSs)}" placeholder="0:00" inputmode="numeric">
        </label>
        <label class="filters-row">
          <span class="filters-label">Min track bitrate (kbps)</span>
          <input type="number" name="minBitrate" value="${f.minTrackBitrateKbps || 0}" min="0" step="1">
        </label>
        <label class="filters-row">
          <span class="filters-label">Min item downloads</span>
          <input type="number" name="minDownloads" value="${f.minDownloads || 0}" min="0" step="1">
        </label>
        <label class="filters-row">
          <span class="filters-label">Blocked collections (comma-sep)</span>
          <input type="text" name="blocked" value="${escapeHTML(blocked)}" placeholder="podcasts, spokenword">
        </label>
        <label class="filters-row filters-row-check">
          <input type="checkbox" name="applyCatalog" ${f.applyToCatalogArtists ? 'checked' : ''}>
          <span class="filters-label">Also apply to catalog artists (/details/ URLs)</span>
        </label>
        <div class="filters-actions">
          <button type="button" class="filters-reset">Reset to defaults</button>
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const restoreFocus = trapFocus(overlay);
  const form = overlay.querySelector('form');
  const close = () => { overlay.remove(); restoreFocus(); };
  overlay.querySelector('.about-modal-close').addEventListener('click', close);
  overlay.querySelector('.filters-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  overlay.querySelector('.filters-reset').addEventListener('click', () => {
    onSave?.(null);  // null = caller resets to defaults
    close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const next = {
      minTrackDurationSec: mmSsToSecs(form.elements.minTrack.value),
      minTrackBitrateKbps: Math.max(0, parseInt(form.elements.minBitrate.value, 10) || 0),
      minItemRuntimeSec:   mmSsToSecs(form.elements.minItem.value),
      minDownloads:        Math.max(0, parseInt(form.elements.minDownloads.value, 10) || 0),
      blockedCollections:  form.elements.blocked.value.split(',').map(s => s.trim()).filter(Boolean),
      applyToCatalogArtists: form.elements.applyCatalog.checked,
    };
    onSave?.(next);
    close();
  });
}

function secsToMmSs(secs) {
  const n = Math.max(0, Math.floor(secs || 0));
  if (!n) return '';
  const m = Math.floor(n / 60);
  const s = n % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function mmSsToSecs(str) {
  const t = String(str || '').trim();
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Math.max(0, parseInt(t, 10));  // bare seconds
  const m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return 0;
}

// Combined create/edit form for a playlist's name / maker / description.
// `values` seeds the fields; `onSave({name,maker,description})` is called
// with trimmed values when the user submits (name required).
// Renders an optional left-aligned group of action buttons inside a
// `.filters-actions` row. `actions` = [{ label, danger?, onClick }].
// onClick runs, then the modal closes unless onClick returns exactly
// false (lets a handler keep the modal open, e.g. after a cancelled
// confirm). The caller owns any confirm() prompts.
function actionsHTML(actions) {
  if (!actions || !actions.length) return '';
  return actions.map((a, i) =>
    `<button type="button" class="filters-extra${a.danger ? ' filters-danger' : ''}" data-action-idx="${i}">${escapeHTML(a.label)}</button>`
  ).join('');
}
function wireActions(overlay, actions, close) {
  if (!actions) return;
  overlay.querySelectorAll('.filters-extra').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = actions[Number(btn.dataset.actionIdx)];
      const keepOpen = await a?.onClick?.();
      if (keepOpen !== false) close();
    });
  });
}

export function showPlaylistEditModal({ title = 'Playlist', values = {}, actions, onSave }) {
  const existing = document.querySelector('.about-modal');
  if (existing) existing.remove();

  const v = values || {};
  const overlay = document.createElement('div');
  overlay.className = 'about-modal';
  overlay.innerHTML = `
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="pl-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">×</button>
      <h2 id="pl-modal-title" class="about-modal-title">${escapeHTML(title)}</h2>
      <form class="filters-form">
        <label class="filters-row">
          <span class="filters-label">Name</span>
          <input type="text" name="name" value="${escapeHTML(v.name || '')}" required autocomplete="off">
        </label>
        <label class="filters-row">
          <span class="filters-label">Maker</span>
          <input type="text" name="maker" value="${escapeHTML(v.maker || '')}" autocomplete="off" placeholder="(optional)">
        </label>
        <label class="filters-row">
          <span class="filters-label">Description</span>
          <input type="text" name="description" value="${escapeHTML(v.description || '')}" autocomplete="off" placeholder="(optional, shows on hover)">
        </label>
        <div class="filters-actions">
          ${actionsHTML(actions)}
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const restoreFocus = trapFocus(overlay);
  const form = overlay.querySelector('form');
  const close = () => { overlay.remove(); restoreFocus(); };
  overlay.querySelector('.about-modal-close').addEventListener('click', close);
  overlay.querySelector('.filters-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  wireActions(overlay, actions, close);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) { form.elements.name.focus(); return; }
    onSave?.({
      name,
      maker: form.elements.maker.value.trim(),
      description: form.elements.description.value.trim(),
    });
    close();
  });
  form.elements.name.focus();
  form.elements.name.select();
}

// Single-pane library editor: label + URL together, optional Delete.
export function showLibraryEditModal({ title = 'Edit library', values = {}, canDelete = false, onSave, onDelete }) {
  const existing = document.querySelector('.about-modal');
  if (existing) existing.remove();

  const v = values || {};
  const overlay = document.createElement('div');
  overlay.className = 'about-modal';
  overlay.innerHTML = `
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="lib-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">×</button>
      <h2 id="lib-modal-title" class="about-modal-title">${escapeHTML(title)}</h2>
      <form class="filters-form">
        <label class="filters-row">
          <span class="filters-label">Name</span>
          <input type="text" name="label" value="${escapeHTML(v.label || '')}" required autocomplete="off">
        </label>
        <label class="filters-row">
          <span class="filters-label">Library URL</span>
          <input type="text" name="url" value="${escapeHTML(v.url || '')}" required autocomplete="off">
        </label>
        <div class="filters-actions">
          ${canDelete ? '<button type="button" class="filters-extra filters-danger" data-action-idx="0">Delete library</button>' : ''}
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const restoreFocus = trapFocus(overlay);
  const form = overlay.querySelector('form');
  const close = () => { overlay.remove(); restoreFocus(); };
  overlay.querySelector('.about-modal-close').addEventListener('click', close);
  overlay.querySelector('.filters-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  if (canDelete) {
    overlay.querySelector('.filters-extra').addEventListener('click', async () => {
      const keepOpen = await onDelete?.();
      if (keepOpen !== false) close();
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const label = form.elements.label.value.trim();
    const url = form.elements.url.value.trim();
    if (!label || !url) { form.elements[label ? 'url' : 'label'].focus(); return; }
    onSave?.({ label, url });
    close();
  });
  form.elements.label.focus();
  form.elements.label.select();
}

// Edit a playlist track's title / artist / album. `siblingCount` > 0
// surfaces a note that the album edit is shared by that many other
// tracks from the same source.
export function showTrackEditModal({ values = {}, siblingCount = 0, actions, onSave }) {
  const existing = document.querySelector('.about-modal');
  if (existing) existing.remove();

  const v = values || {};
  const albumNote = siblingCount > 0
    ? ` (also updates ${siblingCount} other track${siblingCount === 1 ? '' : 's'} from this source)`
    : '';
  const overlay = document.createElement('div');
  overlay.className = 'about-modal';
  overlay.innerHTML = `
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="tk-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">×</button>
      <h2 id="tk-modal-title" class="about-modal-title">Edit track</h2>
      <form class="filters-form">
        <label class="filters-row">
          <span class="filters-label">Title</span>
          <input type="text" name="title" value="${escapeHTML(v.title || '')}" required autocomplete="off">
        </label>
        <label class="filters-row">
          <span class="filters-label">Artist</span>
          <input type="text" name="artist" value="${escapeHTML(v.artist || '')}" autocomplete="off" placeholder="(optional)">
        </label>
        <label class="filters-row">
          <span class="filters-label">Album${escapeHTML(albumNote)}</span>
          <input type="text" name="album" value="${escapeHTML(v.album || '')}" autocomplete="off" placeholder="(optional)">
        </label>
        <div class="filters-actions">
          ${actionsHTML(actions)}
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const restoreFocus = trapFocus(overlay);
  const form = overlay.querySelector('form');
  const close = () => { overlay.remove(); restoreFocus(); };
  overlay.querySelector('.about-modal-close').addEventListener('click', close);
  overlay.querySelector('.filters-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  wireActions(overlay, actions, close);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = form.elements.title.value.trim();
    if (!t) { form.elements.title.focus(); return; }
    onSave?.({
      title: t,
      artist: form.elements.artist.value.trim(),
      album: form.elements.album.value.trim(),
    });
    close();
  });
  form.elements.title.focus();
  form.elements.title.select();
}

export function updateStatus(statusElement, message) {
  statusElement.textContent = message;
}

export function showRDFInput(host, onLoad) {
  host.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'music-player';
  container.innerHTML = `
    <h1>Open Media Player</h1>
    <div class="rdf-input">
      <input type="text" class="rdf-uri" placeholder="Enter RDF file URI" value="./libraries/internet_archive_music/index.ttl" aria-label="RDF file URI">
      <br>
      <button class="load-btn">Load Music Library</button>
    </div>
  `;

  host.appendChild(container);

  const input = container.querySelector('.rdf-uri');
  const button = container.querySelector('.load-btn');

  const loadHandler = () => {
    const uri = input.value.trim();
    if (uri) onLoad(uri);
  };

  button.addEventListener('click', loadHandler);
  input.addEventListener('keypress', e => {
    if (e.key === 'Enter') loadHandler();
  });
}

export function showLoadingScreen(host) {
  host.innerHTML = '<div class="loading-screen">Loading music library...</div>';
}

export function showError(host, message) {
  host.innerHTML = `<div class="error">Error loading music player: ${message}</div>`;
}

export function mountPlayer(host, playerContainer) {
  host.innerHTML = '';
  host.appendChild(playerContainer);
}
