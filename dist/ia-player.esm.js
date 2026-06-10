/*! ia-player v0.1.0 — omp app code (rdflib + sol-components via component-interop) */
var Hn=`/* =====================================================================
   Theme variables \u2014 override these in your page CSS (or via a higher-
   specificity selector) to retheme the player without touching the rest
   of the stylesheet.
   ===================================================================== */

/* =====================================================================
   THEME ARCHITECTURE \u2014 "two rooms, one building".
   Every surface/text/border token is DERIVED (color-mix) from four room
   inputs: --ia-base (surface), --ia-ink (text), --ia-accent, --ia-on-accent,
   plus two theme inputs: --ia-lift (elevation tint) / --ia-hover (interaction
   tint). So a whole theme or per-library mood is just a handful of vars.
     \u2022 Theme  \u2192 :root (dark) and [data-theme="light"].
     \u2022 Room   \u2192 .media-audio (warm/amber) and .media-video (cool/cyan),
                each refined again under light mode.
   The derived set is declared on BOTH :root (the neutral page/tab "hallway")
   and .ia-player-app, so each computes from its OWN base (var() substitution
   is per-element \u2014 a single :root copy would NOT pick up the room override).
   ===================================================================== */

/* ---- Theme inputs + fonts + geometry (DARK is the default) ---------- */
:root {
  color-scheme: dark;

  --ia-font-display: ui-serif, Georgia, "Times New Roman", serif;
  --ia-font-body:    system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --ia-font-mono:    ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;

  /* elevation lightens toward white; interaction also lightens (dark) */
  --ia-lift:  #ffffff;
  --ia-hover: #ffffff;
  --ia-sink:  #000000;

  /* neutral "hallway" room (page bg, tab bar) */
  --ia-base:      #121317;
  --ia-ink:       #e8e8ec;
  --ia-accent:    #c79248;
  --ia-on-accent: #15100a;

  /* fixed (theme-independent) */
  --ia-star:               #ffcc33;
  --ia-error:              #ff5a4d;
  --ia-error-soft:         #ff7a70;

  --ia-radius-sm:          5px;
  --ia-radius:             8px;
  --ia-radius-lg:          12px;
  --ia-sources-width:      260px;
  /* Default browse-cascade height \u2248 \u2153 of the screen (genre/artist/album or
     their movie equivs on top, tracklist below). A saved drag overrides it
     with a px value via restoreState. */
  --ia-browser-height:     33vh;

  --ia-overlay:            color-mix(in srgb, var(--ia-base) 18%, transparent);
  --ia-overlay-strong:     color-mix(in srgb, var(--ia-base) 30%, transparent);
  --ia-shadow-menu:        0 10px 28px -8px rgba(0,0,0,0.55);
  --ia-shadow-menu-strong: 0 14px 36px -10px rgba(0,0,0,0.65);

  --ia-z-modal:                100;
  --ia-modal-width:            500px;
  --ia-modal-width-large:      1100px;
  --ia-modal-gutter:           40px;
  --ia-modal-gutter-large:     60px;
  --ia-modal-max-height:       85vh;
  --ia-modal-max-height-large: 90vh;
}

[data-theme="light"] {
  color-scheme: light;
  --ia-lift:  #ffffff;   /* cards lift to white above the paper bg */
  --ia-hover: #1b1712;   /* interaction DARKENS on a light surface */
  --ia-sink:  #000000;
  --ia-base:      #efe9dd;
  --ia-ink:       #2a2620;
  --ia-accent:    #b5651d;
  --ia-on-accent: #ffffff;
}

/* ---- Room inputs (the two media moods) ----------------------------- */
.ia-player-app.media-audio { --ia-base:#15110c; --ia-ink:#efe6d8; --ia-accent:#f0a23a; --ia-on-accent:#1b1206; }
.ia-player-app.media-video { --ia-base:#0a0d12; --ia-ink:#dde7ef; --ia-accent:#49c8d8; --ia-on-accent:#06161a; }
[data-theme="light"] .ia-player-app.media-audio { --ia-base:#f7f1e4; --ia-ink:#2c2317; --ia-accent:#a8581a; --ia-on-accent:#fff; }
[data-theme="light"] .ia-player-app.media-video { --ia-base:#e8eff2; --ia-ink:#152029; --ia-accent:#1c7283; --ia-on-accent:#fff; }

/* ---- Derived tokens \u2014 computed per element from its own inputs ------ */
:root, .ia-player-app {
  /* Surfaces */
  --ia-bg:                 var(--ia-base);
  --ia-bg-app:             color-mix(in srgb, var(--ia-base) 96%, var(--ia-lift));
  --ia-bg-panel:           color-mix(in srgb, var(--ia-base) 92%, var(--ia-lift));
  --ia-bg-panel-strong:    color-mix(in srgb, var(--ia-base) 89%, var(--ia-lift));
  --ia-bg-elev:            color-mix(in srgb, var(--ia-base) 90%, var(--ia-lift));
  --ia-bg-elev-2:          color-mix(in srgb, var(--ia-base) 85%, var(--ia-lift));
  --ia-bg-row-alt:         color-mix(in srgb, var(--ia-base) 97%, var(--ia-sink));
  --ia-bg-row-hover:       color-mix(in srgb, var(--ia-base) 90%, var(--ia-hover));
  --ia-bg-row-focus:       color-mix(in srgb, var(--ia-base) 84%, var(--ia-hover));
  --ia-bg-row-selected:    color-mix(in srgb, var(--ia-base) 70%, var(--ia-accent));
  --ia-bg-row-playing:     color-mix(in srgb, var(--ia-base) 82%, var(--ia-accent));
  --ia-bg-row-playing-sel: color-mix(in srgb, var(--ia-base) 60%, var(--ia-accent));
  --ia-bg-btn:             color-mix(in srgb, var(--ia-base) 87%, var(--ia-lift));
  --ia-bg-btn-hover:       color-mix(in srgb, var(--ia-base) 78%, var(--ia-hover));
  --ia-bg-menu-hover:      color-mix(in srgb, var(--ia-base) 84%, var(--ia-hover));
  --ia-bg-section:         color-mix(in srgb, var(--ia-base) 98%, var(--ia-sink));
  --ia-bg-section-hover:   color-mix(in srgb, var(--ia-base) 88%, var(--ia-hover));
  --ia-bg-drop:            color-mix(in srgb, var(--ia-base) 78%, var(--ia-accent));
  --ia-bg-danger:          color-mix(in srgb, var(--ia-base) 80%, var(--ia-error));

  /* Borders */
  --ia-border:             color-mix(in srgb, var(--ia-base) 84%, var(--ia-hover));
  --ia-border-strong:      color-mix(in srgb, var(--ia-base) 74%, var(--ia-hover));
  --ia-border-btn:         color-mix(in srgb, var(--ia-base) 78%, var(--ia-hover));

  /* Text */
  --ia-text:               color-mix(in srgb, var(--ia-ink) 90%, var(--ia-base));
  --ia-text-strong:        var(--ia-ink);
  --ia-text-soft:          color-mix(in srgb, var(--ia-ink) 80%, var(--ia-base));
  --ia-text-muted:         color-mix(in srgb, var(--ia-ink) 80%, var(--ia-base));
  --ia-text-dim:           color-mix(in srgb, var(--ia-ink) 66%, var(--ia-base));
  --ia-text-faint:         color-mix(in srgb, var(--ia-ink) 56%, var(--ia-base));
  --ia-text-fainter:       color-mix(in srgb, var(--ia-ink) 46%, var(--ia-base));
  --ia-text-disabled:      color-mix(in srgb, var(--ia-ink) 46%, var(--ia-base));
  --ia-text-placeholder:   color-mix(in srgb, var(--ia-ink) 38%, var(--ia-base));

  /* Accent family + atmosphere */
  --ia-accent-hover:       color-mix(in srgb, var(--ia-accent) 84%, var(--ia-lift));
  --ia-accent-soft:        color-mix(in srgb, var(--ia-accent) 64%, var(--ia-lift));
  --ia-accent-pale:        color-mix(in srgb, var(--ia-accent) 44%, var(--ia-lift));
  --ia-accent-glow:        color-mix(in srgb, var(--ia-accent) 38%, transparent);
  --ia-glow:               color-mix(in srgb, var(--ia-accent) 20%, transparent);
}

/* ---- Text size (root font-size drives all rem-based type) ----------- */
:root[data-fontsize="small"]  { font-size: 16px; }
:root[data-fontsize="medium"] { font-size: 20px; }   /* default */
:root[data-fontsize="large"]  { font-size: 24px; }

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--ia-font-body);
  background: var(--ia-bg);
  color: var(--ia-text-strong);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

ia-player {
  display: block;
  width: 100%;
  height: 100vh;
}

/* Themed, tactile scrollbars. */
* { scrollbar-width: thin; scrollbar-color: var(--ia-border-strong) transparent; }
::-webkit-scrollbar { width: 11px; height: 11px; }
::-webkit-scrollbar-thumb {
  background: var(--ia-border-strong);
  border: 3px solid transparent;
  background-clip: padding-box;
  border-radius: 999px;
}
::-webkit-scrollbar-thumb:hover { background: var(--ia-accent-soft); background-clip: padding-box; }
::-webkit-scrollbar-track { background: transparent; }

/* Cohesive accent focus ring across the whole app. */
.ia-player-app :focus-visible {
  outline: 2px solid var(--ia-accent);
  outline-offset: 2px;
  border-radius: var(--ia-radius-sm);
}

/* ====== Rhythmbox-style desktop player layout ===================== */

.ia-player-app {
  display: grid;
  grid-template-columns: var(--ia-sources-width) 1fr;
  /* minmax(0,\u2026) so the browser cascade AND the tracklist can shrink
     instead of forcing the whole app taller than the viewport (which
     pushed the status bar \u2014 and now-playing \u2014 below the fold). */
  grid-template-rows: auto auto minmax(0, var(--ia-browser-height)) minmax(0, 1fr) auto;
  grid-template-areas:
    "toolbar    toolbar"
    "nowplaying nowplaying"
    "sources    browser"
    "sources    tracklist"
    "status     status";
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  position: relative;   /* positioning context for the .ia-notice banner */
  background: var(--ia-bg-app);
  color: var(--ia-text);
  font-family: var(--ia-font-body);
  font-size: 0.92rem;
  /* Cross-fade theme + library switches. */
  transition: background-color 0.35s ease, color 0.35s ease;
}
@media (prefers-reduced-motion: reduce) {
  .ia-player-app { transition: none; }
}

/* When the user is on a source that has no browser (Favorites or a saved
   playlist), hide the browser columns and let the tracklist take the
   full content area. */
.ia-player-app.source-no-browser .ia-browser { display: none; }
.ia-player-app.source-no-browser {
  grid-template-rows: auto auto 1fr auto;
  grid-template-areas:
    "toolbar    toolbar"
    "nowplaying nowplaying"
    "sources    tracklist"
    "status     status";
}

.ia-audio { display: none; }

/* Prominent, dismissible notice banner \u2014 used when media can't play (a quiet
   status-bar line is too easy to miss). Centred near the top of the panel,
   over everything, with a warning colour. Auto-dismisses unless sticky. */
.ia-notice {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%) translateY(-10px);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: .6em;
  max-width: min(560px, 92%);
  padding: .75em 1.05em;
  border-radius: 11px;
  border: 1px solid color-mix(in srgb, var(--ia-error, #ff5a4d) 70%, #000);
  background: var(--ia-error, #ff5a4d);
  color: #fff;
  font-size: .96rem;
  font-weight: 600;
  line-height: 1.35;
  box-shadow: 0 14px 40px -10px rgba(0, 0, 0, .6);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  /* Quick fade-IN, gentle fade-OUT so the auto-dismiss reads as a fade. */
  transition: opacity .45s ease, transform .45s ease, visibility .45s;
}
.ia-notice.show {
  transition: opacity .18s ease, transform .18s ease, visibility .18s;
}
.ia-notice.show {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(0);
  pointer-events: auto;
}
.ia-notice-icon { font-size: 1.2rem; line-height: 1; flex: 0 0 auto; }
.ia-notice-msg { flex: 1 1 auto; }
.ia-notice-close {
  flex: 0 0 auto;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 1.05rem;
  line-height: 1;
  opacity: .85;
  padding: 0 .1em;
}
.ia-notice-close:hover,
.ia-notice-close:focus-visible { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .ia-notice { transition: opacity .22s ease; } }

/* --- Video (movies) layout --------------------------------------- */
/* Movies have NO file list: clicking a film plays its best version
   straight into a large <video> that fills the bottom (the \`player\` row).
   Keyed off .media-video set by createPlayerUI for a
   \`dct:type dctype:MovingImage\` library. */
.ia-player-app.media-video {
  grid-template-rows: auto auto minmax(0, var(--ia-browser-height)) minmax(0, 1fr) auto;
  grid-template-areas:
    "toolbar    toolbar"
    "nowplaying nowplaying"
    "sources    browser"
    "sources    player"
    "status     status";
}
.ia-player-app.media-video.source-no-browser {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  grid-template-areas:
    "toolbar    toolbar"
    "nowplaying nowplaying"
    "sources    player"
    "status     status";
}
/* No tracklist (title/artist rows) in the movies panel \u2014 only the banner
   and the playing film. */
.ia-player-app.media-video .ia-tracklist-wrap { display: none; }
/* \u2026except the Favorites view, where the communal films DO list. There's no
   one-film-at-a-time \`tracklist\` row in the movies grid, so surface the list
   in the \`player\` cell. A clicked film then plays in the <video>, which sits
   later in the DOM (same cell) and paints over the list. */
.ia-player-app.media-video.source-favorites .ia-tracklist-wrap {
  display: block;
  grid-area: player;
}
/* The <video> fills the player area, letterboxed on black \u2014 but only once
   a movie is actually loaded (Req 4): an idle movies screen shows no
   black box, just the empty player area. */
.ia-player-app.media-video .ia-video { display: none; }
.ia-player-app.media-video.has-video .ia-video {
  grid-area: player;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #000;
  object-fit: contain;
}

/* Film intro overlay \u2014 stacked in the same \`player\` grid cell, on top of
   the <video>, when a film is selected but not yet started. Clicking it
   hides it and starts playback. */
.ia-film-intro { display: none; }
.ia-player-app.media-video.film-intro .ia-film-intro {
  grid-area: player;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgba(0, 0, 0, .82);
  cursor: pointer;
  text-align: center;
}
.ia-film-intro-card {
  position: relative;
  max-width: 38rem;
  color: #fff;
  font-family: var(--ia-font-body, system-ui, sans-serif);
}
.ia-film-intro-title {
  margin: 0 0 .4rem;
  font-family: var(--ia-font-display, Georgia, serif);
  font-size: 1.7rem;
  font-weight: 600;
  color: #fff;
}
.ia-film-intro-length { margin: 0 0 1rem; font-size: 1rem; color: #cdd6df; }
.ia-film-intro-length:empty { display: none; }
.ia-film-intro-about { margin: 0 0 1.4rem; font-size: 1rem; color: #e6edf3; }
.ia-film-intro-about:empty { display: none; }
.ia-film-intro-about a { color: var(--ia-accent, #49c8d8); }
.ia-film-intro-rights { margin: 0 0 1rem; font-size: .9rem; color: #aeb9c4; }
.ia-film-intro-rights:empty { display: none; }
.ia-film-intro-hint { margin: 0; font-size: .92rem; font-style: italic; color: #aeb9c4; }
.ia-nowplaying .ia-np-rights { color: #aeb9c4; }

/* --- Toolbar ----------------------------------------------------- */

.ia-toolbar {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: linear-gradient(var(--ia-bg-elev-2), var(--ia-bg-panel-strong));
  border-bottom: 1px solid var(--ia-border);
}

.ia-btn {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: var(--ia-bg-btn);
  color: var(--ia-text);
  border: 1px solid var(--ia-border-btn);
  border-radius: 4px;
  min-width: 44px;
  padding: 3px 6px;
  font-size: 0.95rem;
  line-height: 1.1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.ia-btn .ia-icon { font-size: 0.95rem; }
.ia-btn .ia-blabel {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ia-text-disabled);
  line-height: 1;
}
.ia-btn:hover,
.ia-btn:focus-visible {
  background: var(--ia-bg-btn-hover);
  color: var(--ia-text-strong);
  border-color: var(--ia-accent);
  outline: none;
}
.ia-btn:hover .ia-blabel,
.ia-btn:focus-visible .ia-blabel { color: var(--ia-text-strong); }
.ia-btn.active {
  background: var(--ia-accent);
  color: var(--ia-on-accent);
  border-color: var(--ia-accent);
}
.ia-btn.active .ia-blabel { color: var(--ia-on-accent); }

.ia-play .ia-icon { font-size: 1.05rem; }

.ia-seek-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ia-seek {
  flex: 1;
  height: 4px;
  cursor: pointer;
  min-width: 0;
}
.ia-time {
  color: var(--ia-text-dim);
  font-family: var(--ia-font-mono);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ia-volume-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ia-volume {
  width: 80px;
  cursor: pointer;
}

/* --- Artist search ----------------------------------------------- */

.ia-artist-search { display: inline-flex; margin-left: auto; }
.ia-artist-search-input {
  width: 320px;
  max-width: 40vw;
  padding: 4px 8px;
  font: inherit;
  color: var(--ia-text);
  background: var(--ia-bg);
  border: 1px solid var(--ia-border);
  border-radius: 4px;
}
.ia-artist-search-input:focus {
  outline: none;
  border-color: var(--ia-accent);
}

/* --- Gear menu --------------------------------------------------- */

.gear-wrap { position: relative; display: inline-flex; }

.gear-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 180px;
  background: var(--ia-bg-elev);
  border: 1px solid var(--ia-border-strong);
  border-radius: 6px;
  padding: 4px;
  z-index: 50;
  box-shadow: var(--ia-shadow-menu);
}
.gear-menu .menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--ia-text);
  padding: 8px 10px;
  font-size: 0.9rem;
  cursor: pointer;
  border-radius: 4px;
  height: auto;
  min-width: 0;
}
.gear-menu .menu-item:hover,
.gear-menu .menu-item:focus {
  background: var(--ia-bg-btn);
  color: var(--ia-text-strong);
  outline: none;
}

/* Appearance: text-size is a single .gear-fontsize menu-item that cycles
   Small \u2192 Medium \u2192 Large (the "A" icon resizes to show the current step). */
.gear-fontsize .gear-fontsize-ico {
  display: inline-block;
  width: 1.1rem; text-align: center;
  font-family: var(--ia-font-display);
}

/* Sol-login chip lives at the top of the gear menu. Visually distinct from
   the .menu-item rows below \u2014 a small framed block that hosts the login
   button / WebID popover. Not keyboard-nav'd by the menu's arrow handler
   (sol-login owns its own focus). */
.menu-item-sollogin {
  display: block;
  padding: 6px 8px 8px;
  border-bottom: 1px solid var(--ia-border);
  margin-bottom: 4px;
}
.menu-item-sollogin .ia-sol-login {
  display: block;
  width: 100%;
}

/* Menu button reflects real-session state (kitchen mode does NOT colour the
   chip \u2014 it only opens up the affordances). Green accent + the WebID lands
   in the title attribute (no visible label change \u2014 the \u22EE button stays
   compact in the toolbar). */
.ia-btn.manage-btn.logged-in {
  background: var(--ia-bg-loggedin, #1f5a2c);
  border-color: var(--ia-accent-green, #4caf50);
  color: var(--ia-text-strong);
}
.ia-btn.manage-btn.logged-in:hover,
.ia-btn.manage-btn.logged-in:focus-visible {
  background: var(--ia-bg-loggedin-hover, #267237);
  border-color: var(--ia-accent-green, #4caf50);
}
.ia-btn.manage-btn.logged-in .ia-icon { color: var(--ia-accent-green, #66d77a); }

/* Guest mode (no real session, no kitchen flag): hide admin / pod / edit
   affordances so anonymous visitors see a read-only player. Driven by
   .guest-mode on .ia-player-app from applyAccessGating(). */
.ia-player-app.guest-mode .gear-filters,
.ia-player-app.guest-mode .gear-view-deleted,
.ia-player-app.guest-mode .gear-install-pod,
.ia-player-app.guest-mode .gear-update-app { display: none; }
.ia-player-app.guest-mode .ia-add-source-btn { display: none; }
/* Playlists are owner content now \u2014 guests can browse/listen but not
   create or modify them (favouriting is the communal write surface instead). */
.ia-player-app.guest-mode .ia-add-playlist-btn { display: none; }
.ia-player-app.guest-mode .ia-sources-list .ia-row-kebab { display: none; }
/* Add-genre / add-artist (= add-film-type / add-collection for movies) are
   owner-only edits. Hide the whole column footer (border + padded strip), not
   just the button, so guests don't see an empty bar. Footers exist only on the
   genre + artist columns. */
.ia-player-app.guest-mode .ia-column-footer { display: none; }
/* Kebabs: hide everywhere EXCEPT in the Sources / Playlists list and the
   tracklist (per-row track kebabs are inside the table, not a listbox).
   Library + Genre + Artist listboxes lose their kebab in guest mode. */
.ia-player-app.guest-mode .ia-libraries-list .ia-row-kebab,
.ia-player-app.guest-mode [data-column="genre"] .ia-row-kebab,
.ia-player-app.guest-mode [data-column="artist"] .ia-row-kebab { display: none; }

/* Artist IA link: emitted on every artist row, but only DISPLAYED when
   it would otherwise be the row's lone affordance \u2014 i.e. in guest mode,
   where the artist kebab is hidden (no Rename/Delete/Convert for
   guests). In logged-in / kitchen mode the kebab covers it (Visit /
   Search archive.org lives as an item inside the kebab menu \u2014 see
   openArtistEditMenu). Same dimensions as .ia-row-kebab so the row
   layout stays stable. */
.ia-row-ialink {
  display: none;
  align-items: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--ia-text-dim);
  font-size: 0.95rem;
  line-height: 1;
  padding: 0 4px;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
}
.ia-row-ialink:hover,
.ia-row-ialink:focus-visible {
  color: var(--ia-text-strong);
  background: var(--ia-bg-btn);
  outline: none;
}
.ia-player-app.guest-mode [data-column="artist"] .ia-row-ialink {
  display: inline-flex;
}

/* --- Now-playing strip ------------------------------------------ */

.ia-nowplaying {
  grid-area: nowplaying;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 16px;
  background:
    linear-gradient(90deg, var(--ia-glow), transparent 40%),
    var(--ia-bg-panel-strong);
  border-bottom: 1px solid var(--ia-border);
  min-height: 30px;
}
.ia-nowplaying-text {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--ia-text-strong);
  font-family: var(--ia-font-display);
  font-optical-sizing: auto;
  font-size: 1.18rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ia-nowplaying-text:empty::before {
  content: 'Nothing playing yet.';
  color: var(--ia-text-placeholder);
  font-style: italic;
  font-weight: 400;
}
/* Movies have no transport bar \u2014 hide the whole toolbar; the film-search is
   moved (JS) onto the now-playing line's right. */
.ia-player-app.media-video .ia-toolbar { display: none; }
.ia-nowplaying .ia-artist-search { flex: 0 0 auto; margin-left: auto; }
.ia-nowplaying .ia-artist-search-input {
  width: 240px; max-width: 32vw;
  font-family: var(--ia-font-body); font-size: 0.85rem; font-weight: 400;
}
.ia-nowplaying .ia-link {
  color: var(--ia-accent);
  text-decoration: none;
  margin-left: 6px;
  font-size: 0.85em;
}
.ia-nowplaying .ia-link:hover,
.ia-nowplaying .ia-link:focus-visible {
  text-decoration: underline;
  outline: none;
}

/* --- Sources sidebar -------------------------------------------- */

.ia-sources {
  grid-area: sources;
  position: relative;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--ia-border);
  background: var(--ia-bg-panel);
  min-width: 0;
  overflow: hidden;
}
/* Drag handle on the sources column's right edge \u2014 resizes the grid's
   first track by setting --ia-sources-width on .ia-player-app. */
.ia-sources-resize {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}
.ia-sources-resize:hover,
.ia-player-app.resizing-sources .ia-sources-resize {
  background: var(--ia-accent);
  opacity: 0.5;
}
.ia-sources .ia-column-header {
  padding: 7px 12px;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.13em;
  color: var(--ia-accent-soft);
  background: var(--ia-bg-elev);
  border-bottom: 1px solid var(--ia-border);
  margin: 0;
}
/* Single-library panels (Music/Movies each run as their own <ia-player>)
   don't need the one-row Libraries switcher \u2014 the host page's tab bar
   switches panels. Hide the Libraries header, list and "+ Library". */
.ia-player-app.single-library #ia-h-libs,
.ia-player-app.single-library .ia-libraries-list,
.ia-player-app.single-library .ia-add-source-btn { display: none; }

/* Two-panel shell: the panel's own \u22EE menu is replaced by the shared chrome
   bar (host page). The menu DOM stays (its handlers are driven via the
   chrome's appAction), it's just hidden. */
.ia-player-app.panel-instance .gear-wrap { display: none; }

/* Libraries list sizes to its content; Playlists list takes the rest of
   the sources column. A 50% cap on libraries keeps a very long library
   list from starving playlists (it scrolls instead). */
.ia-sources .ia-libraries-list {
  flex: 0 0 auto;
  max-height: 50%;
  margin-bottom: 1rem;   /* gap between Libraries and the Playlists section */
}
.ia-sources .ia-sources-list {
  flex: 1 1 auto;
}
/* Community Favorites: a capped, independently-scrolling section below the
   Playlists section. Music caps it at ~\u2153 of the column; both lists scroll as
   needed. Movies (favourites-only) hide Playlists and let favourites fill. */
.ia-sources .ia-favourites-list {
  flex: 0 0 auto;
  max-height: 33%;
}
.ia-player-app.favourites-only #ia-h-sources,
.ia-player-app.favourites-only .ia-sources-list,
.ia-player-app.favourites-only .ia-add-playlist-btn { display: none; }
.ia-player-app.favourites-only .ia-favourites-list {
  flex: 1 1 auto;
  max-height: none;
}
.ia-sources .ia-listbox-item {
  padding: 6px 10px;
  font-size: 0.92rem;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ia-sources .ia-listbox-checkbox {
  font-size: 0.95rem;
  color: var(--ia-text-disabled);
  flex-shrink: 0;
}
.ia-sources .ia-listbox-item.selected .ia-listbox-checkbox { color: var(--ia-on-accent); }
.ia-sources .ia-listbox-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Pencil button on each source row, hidden until hover/focus. */
.ia-src-edit {
  background: transparent;
  border: none;
  color: var(--ia-text-dim);
  cursor: pointer;
  padding: 0 4px;
  font-size: 0.9rem;
  visibility: hidden;
  flex-shrink: 0;
}
.ia-sources .ia-listbox-item:hover .ia-src-edit,
.ia-sources .ia-listbox-item:focus-within .ia-src-edit,
.ia-sources .ia-listbox-item.selected .ia-src-edit { visibility: visible; }
.ia-src-edit:hover,
.ia-src-edit:focus-visible {
  color: var(--ia-accent);
  outline: none;
}

/* Genre + artist column rows need flex layout so the kebab can sit flush
   right with margin-left:auto. */
.ia-browser .ia-listbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ia-browser .ia-listbox-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Kebab on the genre + artist column rows: always visible, pushed to the
   right edge of the row, bolder than the label so it reads as a control. */
.ia-row-kebab {
  visibility: visible;
  margin-left: auto;
  flex-shrink: 0;
  font-size: 1.1rem;
  line-height: 1;
  letter-spacing: 1px;
  font-weight: 700;
  color: var(--ia-text-soft);
}
.ia-row-kebab:hover,
.ia-row-kebab:focus-visible { color: var(--ia-text-strong); }

/* Owner-only \u2715 on the movies \u2605 Favourites column rows \u2014 removes the film
   from the communal wall. Pushed to the right edge of the row. */
.ia-row-favdel {
  margin-left: auto;
  flex-shrink: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 .25rem;
  font-size: .9rem;
  line-height: 1;
  color: var(--ia-text-faint, #888);
}
.ia-player-app.guest-mode .ia-row-favdel { display: none; }
.ia-row-favdel:hover,
.ia-row-favdel:focus-visible { color: var(--ia-error-soft, #e74c3c); }

/* \u2606 communal-favourite toggle on Movies-column rows (the way images are
   starred in their Collection column). Always visible, pushed to the right;
   gold when the film is on the wall. */
.ia-row-fav {
  visibility: visible;
  margin-left: auto;
  flex-shrink: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 .15rem;
  font-size: 1.05rem;
  line-height: 1;
  color: var(--ia-text-faint, #888);
}
.ia-row-fav:hover,
.ia-row-fav:focus-visible { color: #e6b800; }
.ia-row-fav.on { color: #e6b800; }

/* Inline rename input that replaces a row's label during edit. */
.ia-row-rename {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--ia-accent);
  background: var(--ia-bg);
  color: var(--ia-text-strong);
  padding: 2px 4px;
  font: inherit;
  border-radius: 3px;
}

/* Footer area below each browser column, hosting the "+ Add" button or
   its expanded inline form. */
.ia-column-footer {
  padding: 4px 6px;
  border-top: 1px solid var(--ia-border);
  background: var(--ia-bg-subtle);
}
.ia-column-footer button.ia-add-genre-btn,
.ia-column-footer button.ia-add-artist-btn {
  width: 100%;
  background: transparent;
  border: 1px dashed var(--ia-border);
  color: var(--ia-text-dim);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 3px;
  font-size: 0.85rem;
  text-align: left;
}
.ia-column-footer button.ia-add-genre-btn:hover,
.ia-column-footer button.ia-add-artist-btn:hover {
  color: var(--ia-text-strong);
  border-color: var(--ia-accent);
}
.ia-column-addform {
  display: flex;
  gap: 4px;
  align-items: center;
}
.ia-column-addinput {
  flex: 1 1 auto;
  min-width: 0;
  padding: 3px 5px;
  border: 1px solid var(--ia-accent);
  border-radius: 3px;
  background: var(--ia-bg);
  color: var(--ia-text-strong);
  font: inherit;
}
.ia-column-addselect {
  flex: 0 1 auto;
  max-width: 40%;
  padding: 3px;
  border: 1px solid var(--ia-border);
  border-radius: 3px;
  background: var(--ia-bg);
  color: var(--ia-text-strong);
  font: inherit;
}
.ia-column-addsave,
.ia-column-addcancel {
  flex: 0 0 auto;
  background: transparent;
  border: none;
  color: var(--ia-text-dim);
  cursor: pointer;
  padding: 0 4px;
  font-size: 1rem;
}
.ia-column-addsave:hover { color: var(--ia-accent); }
.ia-column-addcancel:hover { color: var(--ia-danger, #c33); }
/* Stack the artist add-form when the column is narrow \u2014 keeps the URL
   input usable. */
.ia-column-addartist { flex-wrap: wrap; }
.ia-column-addartist .ia-column-addinput { flex-basis: 100%; }

.ia-sources-actions {
  display: flex;
  gap: 6px;
  padding: 6px 8px;
  border-top: 1px solid var(--ia-border);
  background: var(--ia-bg-elev);
}
.ia-sources-actions button {
  flex: 1;
  background: var(--ia-bg-btn);
  color: var(--ia-text);
  border: 1px solid var(--ia-border-strong);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 0.82rem;
  cursor: pointer;
}
.ia-sources-actions button:hover,
.ia-sources-actions button:focus-visible {
  background: var(--ia-bg-btn-hover);
  color: var(--ia-text-strong);
  border-color: var(--ia-accent);
  outline: none;
}

/* Floating contextual menu (used by pencil actions and similar). */
.ia-floating-menu {
  position: fixed;
  z-index: 200;
  background: var(--ia-bg-elev-2);
  border: 1px solid var(--ia-border-strong);
  border-radius: 6px;
  padding: 4px;
  min-width: 180px;
  box-shadow: var(--ia-shadow-menu-strong);
}
.ia-floating-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--ia-text);
  padding: 6px 10px;
  font-size: 0.88rem;
  border-radius: 4px;
  cursor: pointer;
}
.ia-floating-menu-item:hover,
.ia-floating-menu-item:focus-visible {
  background: var(--ia-bg-menu-hover);
  color: var(--ia-text-strong);
  outline: none;
}

/* --- Browser columns (Genres / Artists / Albums) ----------------- */

.ia-browser {
  grid-area: browser;
  display: grid;
  grid-template-columns: 1fr 1fr 1.5fr;
  height: 100%;          /* fill the (shrinkable) browser grid row */
  min-height: 0;
  background: var(--ia-bg-elev);
  border-bottom: 1px solid var(--ia-border);
  position: relative;
}
.ia-browser-resize {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -3px;
  height: 7px;
  cursor: row-resize;
  z-index: 6;
}
.ia-browser-resize:hover,
.ia-player-app.resizing-browser .ia-browser-resize {
  background: var(--ia-accent);
  opacity: .5;
}
.ia-column {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--ia-border);
  overflow: hidden;
}
.ia-column:last-child { border-right: none; }

.ia-column-header {
  margin: 0;
  padding: 8px 12px;
  font-family: var(--ia-font-display);
  font-optical-sizing: auto;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--ia-text-soft);
  background: var(--ia-bg-elev-2);
  border-bottom: 1px solid var(--ia-border);
}
.ia-album-note {
  padding: 5px 10px;
  font-size: 0.72rem;
  line-height: 1.3;
  color: var(--ia-text-dim);
  background: var(--ia-bg-elev);
  border-bottom: 1px solid var(--ia-border);
}

.ia-listbox {
  list-style: none;
  margin: 0;
  padding: 0;
  flex: 1;
  overflow-y: auto;
  outline: none;
}
.ia-listbox:focus-visible {
  box-shadow: inset 0 0 0 2px var(--ia-accent);
}

.ia-listbox-item {
  padding: 4px 12px;
  cursor: pointer;
  color: var(--ia-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;
}
.ia-listbox-item:hover { background: var(--ia-bg-row-focus); }
.ia-listbox-item.selected {
  background: var(--ia-accent);
  color: var(--ia-on-accent);
  font-weight: 600;
}

/* While a playlist is the current source, only the playlist row (in the
   Sources list) shows the selected highlight. The library cascade \u2014
   genre / artist / album columns and the Libraries list \u2014 must NOT look
   active. The Libraries *checkbox* (\u2611) is unaffected: it's a separate
   glyph driven by enabled-state, we only neutralise the accent row
   paint here. The Playlists list (.ia-sources-list) is intentionally
   excluded so the active playlist stays highlighted. */
.ia-player-app.viewing-playlist .ia-browser .ia-listbox-item.selected,
.ia-player-app.viewing-playlist .ia-sources .ia-libraries-list .ia-listbox-item.selected {
  background: transparent;
  color: var(--ia-text-soft);
}
.ia-player-app.viewing-playlist .ia-sources .ia-libraries-list .ia-listbox-item.selected .ia-listbox-checkbox {
  color: var(--ia-text-soft);
}
.ia-listbox-item:focus {
  outline: none;
  box-shadow: inset 0 0 0 2px var(--ia-accent-soft);
}
.ia-listbox-all {
  font-style: italic;
  color: var(--ia-text-disabled);
  border-bottom: 1px solid var(--ia-border);
}

/* Curated vs raw artist split. The divider is the structural cue
   (so the distinction isn't colour-only); raw rows are de-emphasised
   but stay fully interactive \u2014 hover/selected restore full contrast. */
.ia-listbox-divider {
  padding: 8px 12px 3px;
  color: var(--ia-text-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-top: 1px solid var(--ia-border);
  margin-top: 4px;
  cursor: default;
  user-select: none;
}
.ia-listbox-item.ia-item-raw { color: var(--ia-text-muted); font-style: italic; }
.ia-listbox-item.ia-item-raw:hover { color: var(--ia-text-soft); }
.ia-listbox-item.ia-item-raw.selected { color: var(--ia-on-accent); font-style: normal; }

.ia-listbox-message {
  padding: 14px 12px;
  color: var(--ia-text-faint);
  font-style: italic;
  font-size: 0.88rem;
  cursor: default;
}

/* --- Track list -------------------------------------------------- */

.ia-tracklist-wrap {
  grid-area: tracklist;
  overflow: auto;
  background: var(--ia-bg-app);
  position: relative;
}
.ia-tracklist-empty {
  padding: 30px 20px;
  text-align: center;
  color: var(--ia-text-faint);
}
.ia-tracklist {
  width: 100%;
  /* Floor: below this the three flex columns (title/artist/album) would
     clip their header labels, so the wrap scrolls horizontally instead.
     \`table-layout: fixed\` ignores per-column min-width, so the minimum
     is enforced here on the table as a whole. */
  min-width: 500px;
  border-collapse: collapse;
  font-size: 0.92rem;
  table-layout: fixed;
}
.ia-tracklist.resizing { cursor: col-resize; user-select: none; }
.ia-tracklist thead {
  position: sticky;
  top: 0;
  background: var(--ia-bg-elev);
  z-index: 2;
}
.ia-tracklist th {
  position: relative;
  text-align: left;
  font-weight: 600;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ia-text-dim);
  padding: 6px 10px;
  border-bottom: 1px solid var(--ia-border);
  white-space: nowrap;
}
.ia-tracklist th[data-sort] { cursor: pointer; }
.ia-tracklist th[data-sort]:hover { color: var(--ia-text-strong); }
.ia-tracklist th.sorted { color: var(--ia-accent); }
.ia-tracklist th .sort-arrow {
  display: inline-block;
  margin-left: 4px;
  font-size: 0.7rem;
}
.ia-tracklist th .resize-handle {
  position: absolute;
  right: 0;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  z-index: 3;
}
.ia-tracklist th .resize-handle:hover { background: var(--ia-accent-glow); }
/* Column widths. The table is table-layout:fixed at width:100%, so the
   columns always fit the pane. num / time / remove are fixed px, each
   wide enough for its header (and header button); title / artist /
   album are width:auto, so they flex \u2014 sharing the leftover space
   equally and shrinking together as the pane narrows. They never drop
   below their header labels: the table's min-width (above) is the floor
   where those three still clear "Title" / "Artist" / "Album"; below it
   the tracklist scrolls rather than clipping a heading. A resize handle
   still overrides any column with an explicit px width. */
col.col-num    { width: 64px; }
col.col-title  { width: auto; }
col.col-artist { width: auto; }
col.col-album  { width: auto; }
col.col-time   { width: 76px; }
col.col-fav    { width: 36px; }
col.col-remove { width: 60px; }
.ia-tracklist .col-num    { text-align: right; padding-right: 6px; }
.ia-tracklist .col-time   { text-align: right; font-family: var(--ia-font-mono); font-size: 0.82em; font-variant-numeric: tabular-nums; color: var(--ia-text-dim); }
.ia-tracklist .col-fav    { text-align: center; }
.ia-tracklist .col-remove { text-align: center; }
/* Header layout: keep button (left) + # label (right) in the col-num <th>,
   and the clear-tracklist button centered in the col-remove <th>. Body
   cells aren't affected \u2014 they're plain row numbers / per-row remove \xD7. */
.ia-tracklist thead th.col-num {
  text-align: left;
  padding-left: 4px;
  padding-right: 6px;
}
.ia-tracklist thead th.col-num .th-label {
  margin-left: 4px;
}
.ia-tracklist thead th.col-remove { padding: 4px; }
.ia-randomize-btn,
.ia-clear-tracks-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--ia-text-dim);
  font-size: 0.95rem;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  cursor: pointer;
  vertical-align: middle;
}
.ia-randomize-btn:hover,
.ia-clear-tracks-btn:hover {
  color: var(--ia-text-strong);
  background: var(--ia-bg-row-hover);
}
.ia-randomize-btn:focus-visible,
.ia-clear-tracks-btn:focus-visible {
  outline: 2px solid var(--ia-accent);
  outline-offset: 1px;
}
/* Clear-tracklist applies only to the Library view's ephemeral queue
   (see updateViewClass / the click handler in ia3.js). Hide the header
   button outside that view so the affordance matches the behavior. */
.ia-player-app:not(.viewing-library) .ia-clear-tracks-btn { display: none; }

.ia-track-row {
  cursor: pointer;
  outline: none;
}
.ia-track-row td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--ia-bg-panel-strong);
  color: var(--ia-text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ia-track-row:nth-child(even) td { background: var(--ia-bg-row-alt); }
.ia-track-row:hover td { background: var(--ia-bg-row-hover); }
.ia-track-row:focus td { background: var(--ia-bg-row-focus); }
.ia-track-row.selected td {
  background: var(--ia-bg-row-selected);
  color: var(--ia-text-strong);
}
.ia-track-row.dragging td { opacity: 0.5; }
.ia-sources .ia-listbox-item.drop-target {
  outline: 2px dashed var(--ia-accent);
  outline-offset: -2px;
  background: var(--ia-bg-drop);
}
.ia-track-row.selected.playing td {
  background: var(--ia-bg-row-playing-sel);
  /* Strong (ink) text, not accent-pale: on the accent-heavy playing-sel
     background, pale accent text collapses to ~zero contrast in light mode
     (it's a light tan on light tan). The row still reads as playing via its
     distinct background + bold weight + accent track number. */
  color: var(--ia-text-strong);
}
.ia-track-row.playing td {
  background: var(--ia-bg-row-playing);
  color: var(--ia-accent-soft);
  font-weight: 500;
}
.ia-track-row.playing .col-num { color: var(--ia-accent); }
.ia-track-row.selected .ia-track-remove-btn { visibility: visible; }

/* \u2606 communal-favourite toggle, prepended in the title cell. */
.ia-track-fav-btn {
  background: transparent; border: none; cursor: pointer; padding: 0 .35em 0 0;
  color: var(--ia-text-faint, #888); font-size: .95em; line-height: 1;
}
.ia-track-fav-btn:hover { color: #e6b800; }
.ia-track-fav-btn.on { color: #e6b800; }

.ia-track-fav-btn {
  background: transparent;
  border: none;
  color: var(--ia-text-fainter);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0;
}
.ia-track-fav-btn:hover,
.ia-track-fav-btn:focus-visible {
  color: var(--ia-star);
  outline: none;
}
.ia-track-fav-btn.active { color: var(--ia-star); }

.ia-track-remove-btn {
  background: transparent;
  border: none;
  color: var(--ia-text-fainter);
  font-size: 0.95rem;
  cursor: pointer;
  padding: 0;
  visibility: hidden;
}
.ia-track-row:hover .ia-track-remove-btn,
.ia-track-row:focus-within .ia-track-remove-btn { visibility: visible; }
/* In the Favorites view the \u2715 IS the owner's "remove from the wall" control \u2014
   keep it visible so the moderation affordance is discoverable, not hover-only. */
.ia-player-app.source-favorites .ia-track-remove-btn { visibility: visible; }
.ia-track-remove-btn:hover,
.ia-track-remove-btn:focus-visible {
  color: var(--ia-error-soft);
  outline: none;
}

/* --- Status footer ---------------------------------------------- */

.ia-status {
  grid-area: status;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  background: var(--ia-bg-panel-strong);
  border-top: 1px solid var(--ia-border);
  color: var(--ia-text-muted);
  font-size: 0.88rem;
  min-height: 28px;
}
.ia-status-msg {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ia-status-count {
  flex: 0 0 auto;
  color: var(--ia-text-dim);
  font-variant-numeric: tabular-nums;
}
.ia-status .ia-link {
  color: var(--ia-accent);
  text-decoration: none;
  margin-left: 6px;
  font-size: 0.85em;
}
.ia-status .ia-link:hover,
.ia-status .ia-link:focus-visible {
  text-decoration: underline;
  outline: none;
}

.error {
  color: var(--ia-error);
  text-align: center;
  padding: 40px 20px;
  font-size: 1.1rem;
}

.loading-screen {
  text-align: center;
  padding: 60px 20px;
  color: var(--ia-text-muted);
  font-size: 1.2rem;
}

.rdf-input {
  text-align: center;
  padding: 40px 20px;
}

.rdf-input input {
  width: 100%;
  max-width: 600px;
  padding: 12px 16px;
  font-size: 1rem;
  border: 2px solid var(--ia-border-strong);
  border-radius: 6px;
  background: var(--ia-bg-elev);
  color: var(--ia-text-strong);
  margin-bottom: 15px;
}

.rdf-input button {
  padding: 12px 30px;
  font-size: 1rem;
  background: var(--ia-accent);
  color: var(--ia-text-strong);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s ease;
}

.rdf-input button:hover,
.rdf-input button:focus {
  background: var(--ia-accent-hover);
  outline: 2px solid var(--ia-accent);
  outline-offset: 2px;
}

.about-modal {
  position: fixed;
  inset: 0;
  background: var(--ia-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--ia-z-modal);
}

.about-modal-content {
  position: relative;
  max-width: var(--ia-modal-width);
  width: calc(100% - var(--ia-modal-gutter));
  max-height: var(--ia-modal-max-height);
  overflow-y: auto;
  background: var(--ia-bg-elev);
  border: 1px solid var(--ia-border-strong);
  border-radius: var(--ia-radius-lg);
  padding: 24px 24px 20px;
  color: var(--ia-text);
  font-size: 0.95rem;
  line-height: 1.5;
}

/* Large-size variant used by the Help modal: wide enough for a reference
   table to breathe, tall enough to read a section without immediately
   scrolling. */
.about-modal-content.about-modal-large {
  max-width: var(--ia-modal-width-large);
  width: calc(100% - var(--ia-modal-gutter-large));
  max-height: var(--ia-modal-max-height-large);
}

.about-modal-content a {
  color: var(--ia-accent);
}

.about-modal-title {
  margin: 0 0 12px;
  font-size: 1.2rem;
  color: var(--ia-text-strong);
}

.about-buttons {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
  font-size: 0.9rem;
}

.about-buttons th,
.about-buttons td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ia-border-strong);
}

.about-buttons th {
  color: var(--ia-text-muted);
  font-weight: 600;
}

.about-buttons td:first-child {
  width: 70px;
  text-align: center;
  font-size: 1.05rem;
  color: var(--ia-star);
  white-space: nowrap;
}

.manage-modal {
  position: fixed;
  inset: 0;
  background: var(--ia-overlay-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 20px;
}

.manage-modal-content {
  position: relative;
  width: 100%;
  max-width: 740px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  background: var(--ia-bg-panel);
  border: 1px solid var(--ia-border-strong);
  border-radius: 8px;
  padding: 20px 24px;
  color: var(--ia-text);
}
.separator {
  display:inline-block;
  margin-left:1rem;
  margin-right:1rem;
}
.manage-modal-content h2 {
  margin: 0 0 12px;
  font-size: 1.2rem;
  color: var(--ia-text-strong);
}

.manage-modal-close {
  position: absolute;
  top: 6px;
  right: 10px;
  background: transparent;
  color: var(--ia-text-muted);
  border: none;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
}

.manage-modal-close:hover,
.manage-modal-close:focus {
  color: var(--ia-accent);
  outline: none;
}

.manage-add-genre {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.manage-add-genre input {
  flex: 1;
  padding: 8px 12px;
  background: var(--ia-bg-elev);
  color: var(--ia-text-strong);
  border: 1px solid var(--ia-border-strong);
  border-radius: 4px;
  font-size: 0.95rem;
}

.manage-add-genre button {
  padding: 8px 14px;
  background: var(--ia-accent);
  color: var(--ia-text-strong);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
}

.manage-add-genre button:hover { background: var(--ia-accent-hover); }

.manage-genre {
  border: 1px solid var(--ia-border);
  border-radius: 6px;
  margin-bottom: 12px;
  background: var(--ia-bg-section);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.manage-genre.drop-hover {
  border-color: var(--ia-accent);
  background: var(--ia-bg-drop);
}

.manage-genre-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ia-border);
}

.manage-genre-label {
  flex: 1;
  font-weight: 600;
  color: var(--ia-text-strong);
  cursor: text;
}

.manage-genre-head button {
  background: transparent;
  border: 1px solid var(--ia-border-strong);
  color: var(--ia-text-muted);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.95rem;
}

.manage-genre-head button:hover {
  color: var(--ia-text-strong);
  border-color: var(--ia-accent);
}

.manage-artist-list {
  list-style: none;
  margin: 0;
  padding: 6px 8px;
  min-height: 24px;
}

.manage-artist {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: grab;
}

.manage-artist:hover { background: var(--ia-bg-section-hover); }

.manage-artist.dragging {
  opacity: 0.4;
}

.manage-artist-label {
  flex: 1;
  color: var(--ia-text);
  cursor: grab;
  user-select: none;
}

.manage-artist.dragging .manage-artist-label { cursor: grabbing; }

.manage-artist-delete {
  background: transparent;
  border: 1px solid var(--ia-border-strong);
  color: var(--ia-text-muted);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
}

.manage-artist-delete:hover,
.manage-artist-delete:focus-visible {
  color: var(--ia-text-strong);
  border-color: var(--ia-error);
  outline: none;
}

.manage-artist-move {
  background: var(--ia-bg-elev);
  color: var(--ia-text);
  border: 1px solid var(--ia-border-strong);
  border-radius: 4px;
  padding: 2px 4px;
  font-size: 0.85rem;
  cursor: pointer;
}

.manage-artist-move:hover,
.manage-artist-move:focus-visible {
  border-color: var(--ia-accent);
  outline: none;
}

/* Visible focus indicators everywhere */
button:focus-visible,
select:focus-visible,
input:focus-visible,
a:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid var(--ia-accent);
  outline-offset: 2px;
}

.manage-add-artist-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.manage-add-artist-row input {
  flex: 1;
  padding: 8px 12px;
  background: var(--ia-bg-elev);
  color: var(--ia-text-strong);
  border: 1px solid var(--ia-border-strong);
  border-radius: 4px;
  font-size: 0.95rem;
  min-width: 0;
}

.manage-add-artist-row select {
  padding: 8px 10px;
  background: var(--ia-bg-elev);
  color: var(--ia-text-strong);
  border: 1px solid var(--ia-border-strong);
  border-radius: 4px;
  font-size: 0.95rem;
  max-width: 40%;
}

.manage-add-artist-row input:focus,
.manage-add-artist-row select:focus {
  border-color: var(--ia-accent);
  outline: none;
}

.manage-add-artist-row button {
  padding: 8px 14px;
  background: var(--ia-accent);
  color: var(--ia-text-strong);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
}

.manage-add-artist-row button:hover { background: var(--ia-accent-hover); }

.manage-artist-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.inline-confirm-text {
  color: var(--ia-accent-soft);
  font-size: 0.85rem;
}

.inline-confirm-yes,
.inline-confirm-no {
  background: transparent;
  border: 1px solid var(--ia-border-strong);
  color: var(--ia-text-muted);
  border-radius: 4px;
  padding: 2px 6px;
  cursor: pointer;
}

.inline-confirm-yes:hover {
  color: var(--ia-text-strong);
  border-color: var(--ia-error);
  background: var(--ia-bg-danger);
}

.inline-confirm-no:hover {
  color: var(--ia-text-strong);
  border-color: var(--ia-text-dim);
}

.manage-hint {
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--ia-text-dim);
}

.manage-hint code {
  background: var(--ia-bg-elev);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.85rem;
}

/* Filters modal form (lives inside .about-modal-content). */
.filters-form { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
.filters-hint { color: var(--ia-text-dim); font-size: 0.85rem; margin: 0 0 4px; }
.filters-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.filters-row .filters-label { flex: 1 1 auto; color: var(--ia-text); }
.filters-row input[type="text"],
.filters-row input[type="number"] {
  flex: 0 0 9rem;
  padding: 4px 6px;
  background: var(--ia-bg);
  color: var(--ia-text-strong);
  border: 1px solid var(--ia-border-strong);
  border-radius: var(--ia-radius-sm);
  font: inherit;
}
.filters-row-check { gap: 8px; }
.filters-row-check input { flex: 0 0 auto; }
.filters-actions { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.filters-actions button {
  background: var(--ia-bg-btn);
  color: var(--ia-text);
  border: 1px solid var(--ia-border-btn);
  border-radius: var(--ia-radius-sm);
  padding: 5px 12px;
  cursor: pointer;
}
.filters-actions button:hover { background: var(--ia-bg-btn-hover); }
.filters-actions .filters-save { background: var(--ia-accent); border-color: var(--ia-accent); color: var(--ia-text-strong); }
.filters-actions .filters-danger { border-color: var(--ia-danger, #c0392b); color: var(--ia-danger, #e74c3c); }
.filters-actions .filters-danger:hover { background: var(--ia-danger, #c0392b); color: #fff; }

.about-modal-close {
  position: absolute;
  top: 6px;
  right: 10px;
  background: transparent;
  color: var(--ia-text-muted);
  border: none;
  font-size: 1.6rem;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
}

.about-modal-close:hover,
.about-modal-close:focus {
  color: var(--ia-accent);
  outline: none;
}

::-webkit-scrollbar {
  width: 10px;
}

::-webkit-scrollbar-track {
  background: var(--ia-bg);
}

::-webkit-scrollbar-thumb {
  background: var(--ia-border-strong);
  border-radius: 5px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--ia-text-fainter);
}

p {
  margin-bottom:1em;
}
`;var Gn=`This Player provides access to thousands of free recordings
of performances and broadcasts from the fabulous Internet Archive
Live Music collections.  It stores Linked Data which can be edited
with a form supporting customized genres and artists. All materials
are downloadable from the <a href="https://archive.org/">Internet Archive</a>, please use the provided <a href="">[IA]</a> link to view licensing information on each item.

<table class="about-buttons">
  <thead>
    <tr><th>Button</th><th>Action</th></tr>
  </thead>
  <tbody>
    <tr><td>\u23EE</td><td>Previous track (back through history)</td></tr>
    <tr><td>\u25B6 / \u23F8</td><td>Play / pause</td></tr>
    <tr><td>\u23ED</td><td>Next track (or pick another random track)</td></tr>
    <tr><td>\u{1F500}</td><td>Shuffle / random play</td></tr>
    <tr><td>\u{1F501}</td><td>Repeat \u2014 off / all / one (click to cycle)</td></tr>
    <tr><td>\u2606 / \u2605</td><td>Add / remove the track from Favorites (in each track row)</td></tr>
    <tr><td>\u22EE</td><td>Menu \u2014 open the library manager or this About panel</td></tr>
    <tr><td>[IA]</td><td>Open the Internet Archive page for the current item in a new tab</td></tr>
  </tbody>
</table>

A <a href="jeff-zucker.github.io">Jeff Zucker</a> hack.
`;function Vn({mediaType:t="audio",panel:a=!1}={}){let r=t==="video",n=r?{genre:"Film Types",artist:"Collections",album:"Movies",find:"Find a film\u2026",addGenre:"+ Add film type",addArtist:"+ Add collection"}:{genre:"Genres",artist:"Artists",album:"Albums",find:"Find artist\u2026",addGenre:"+ Add genre",addArtist:"+ Add artist"},s='<video class="ia-audio ia-video" aria-label="Media player" playsinline controls></video>',o=document.createElement("div");o.className="ia-player-app"+(r?" media-video":" media-audio"),o.setAttribute("role","region"),o.setAttribute("aria-label",r?"Open Media Player (movies)":"Open Media Player"),o.innerHTML=`
    <div class="ia-toolbar" role="toolbar" aria-label="Playback controls">
      <button type="button" class="ia-btn ia-prev" aria-label="Previous track" title="Previous"><span class="ia-icon" aria-hidden="true">\u23EE</span><span class="ia-blabel">Prev</span></button>
      <button type="button" class="ia-btn ia-play" aria-label="Play" title="Play"><span class="ia-icon" aria-hidden="true">\u25B6</span><span class="ia-blabel">Play</span></button>
      <button type="button" class="ia-btn ia-next" aria-label="Next track" title="Next"><span class="ia-icon" aria-hidden="true">\u23ED</span><span class="ia-blabel">Next</span></button>
      <div class="ia-seek-wrap">
        <input class="ia-seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek" disabled>
        <span class="ia-time" aria-hidden="true"><span class="ia-time-cur">0:00</span> / <span class="ia-time-dur">0:00</span></span>
      </div>
      <div class="ia-volume-wrap" role="group" aria-label="Volume">
        <span class="ia-volume-icon" aria-hidden="true">\u{1F50A}</span>
        <input class="ia-volume" type="range" min="0" max="1" step="0.01" value="1" aria-label="Volume">
      </div>
      <form class="ia-artist-search" role="search">
        <input class="ia-artist-search-input" type="search" placeholder="${n.find}" aria-label="Find by name (creator search)">
      </form>
      <span class="gear-wrap">
        <button type="button" class="ia-btn manage-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Open menu" title="Menu"><span class="ia-icon" aria-hidden="true">\u22EE</span><span class="ia-blabel">Menu</span></button>
        <div class="gear-menu" role="menu" hidden>
          <!-- Sign-in lives at the top of the menu. <sol-login> hosts its
               own button + WebID popover; isn't a .menu-item because it's
               not arrow-key navigable in the same way (its inner button
               handles focus). The menu button turns green and adopts the
               WebID as its title when sol-login reports a session. -->
          ${a?"":`<div class="menu-item-sollogin" role="none">
            <sol-login class="ia-sol-login" issuers="https://solidcommunity.net,https://login.inrupt.com"></sol-login>
          </div>`}
          <!-- Clear tracklist now lives as a button at the far right of the
               tracklist header row; the menu entry is retired. -->
          <!-- Appearance: light/dark toggle + text-size stepper. Both write
               document-level attributes (data-theme / data-fontsize) so the
               two library panels stay in sync. -->
          <button type="button" class="menu-item gear-theme" role="menuitemcheckbox" aria-checked="false"><span class="gear-theme-ico" aria-hidden="true">\u{1F319}</span> <span class="menu-label gear-theme-label">Dark mode</span></button>
          <button type="button" class="menu-item gear-fontsize" role="menuitem"><span class="gear-fontsize-ico" aria-hidden="true">A</span> <span class="menu-label gear-fontsize-label">Text size: Medium</span></button>
          <!-- Save as playlist parked \u2014 restore when the workflow returns.
          <button type="button" class="menu-item gear-save-playlist" role="menuitem"><span aria-hidden="true">\u{1F4BE}</span> <span class="menu-label">Save as playlist\u2026</span></button>
          -->
          <button type="button" class="menu-item gear-filters" role="menuitem"><span aria-hidden="true">\u{1F50E}</span> <span class="menu-label">Filters\u2026</span></button>
          <button type="button" class="menu-item gear-view-deleted" role="menuitem"><span aria-hidden="true">\u{1F5D1}</span> <span class="menu-label">View deleted</span></button>
          <button type="button" class="menu-item gear-help-link" role="menuitem"><span aria-hidden="true">\u{1F4D6}</span> <span class="menu-label">Help</span></button>
          <button type="button" class="menu-item gear-login-help" role="menuitem"><span aria-hidden="true">\u{1F511}</span> <span class="menu-label">Solid login help</span></button>
          <button type="button" class="menu-item gear-install-pod" role="menuitem"><span aria-hidden="true">\u{1F4E1}</span> <span class="menu-label">Install on my Pod\u2026</span></button>
          <button type="button" class="menu-item gear-update-app" role="menuitem"><span aria-hidden="true">\u{1F4F2}</span> <span class="menu-label">Update app on Pod\u2026</span></button>
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
        <h3 class="ia-column-header" id="ia-h-genre">${n.genre}</h3>
        <ul class="ia-listbox" role="listbox" aria-multiselectable="true" aria-labelledby="ia-h-genre" tabindex="0"></ul>
        <div class="ia-column-footer">
          <button type="button" class="ia-add-genre-btn">${n.addGenre}</button>
        </div>
      </div>
      <div class="ia-column" data-column="artist">
        <h3 class="ia-column-header" id="ia-h-artist">${n.artist}</h3>
        <ul class="ia-listbox" role="listbox" aria-multiselectable="true" aria-labelledby="ia-h-artist" tabindex="0"></ul>
        <div class="ia-column-footer">
          <button type="button" class="ia-add-artist-btn">${n.addArtist}</button>
        </div>
      </div>
      <div class="ia-column" data-column="album">
        <h3 class="ia-column-header" id="ia-h-album">${n.album}</h3>
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
            <th scope="col" data-col="num" class="col-num"><button type="button" class="ia-randomize-btn" aria-label="Randomize tracklist order" title="Randomize"><span aria-hidden="true">\u{1F3B2}</span></button><span class="th-label">#</span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="title" data-sort="name" class="col-title"><span class="th-label">Title</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="artist" data-sort="artist" class="col-artist"><span class="th-label">Artist</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="album" data-sort="album" class="col-album"><span class="th-label">Album</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="time" data-sort="time" class="col-time"><span class="th-label">Time</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            <th scope="col" data-col="remove" class="col-remove" aria-label="Remove"><button type="button" class="ia-clear-tracks-btn" aria-label="Clear tracklist" title="Clear tracklist"><span aria-hidden="true">\u{1F9F9}</span></button></th>
            <!--
            <th scope="col" data-col="fav" data-sort="fav" class="col-fav" aria-label="Favorite"><span class="th-label" aria-hidden="true">\u2605</span><span class="sort-arrow" aria-hidden="true"></span><span class="resize-handle" aria-hidden="true"></span></th>
            -->
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div class="ia-tracklist-empty">Choose an album to see tracks.</div>
    </div>

    <div class="ia-status" role="status" aria-live="polite" aria-atomic="true"><span class="ia-status-msg"></span><span class="ia-status-count" aria-live="off"></span></div>

    ${s}

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
  `;let l=o.querySelector(".manage-btn"),u=o.querySelector(".gear-menu"),p=()=>Array.from(u.querySelectorAll(".menu-item"));function v(m,b={}){if(u.hidden=!m,l.setAttribute("aria-expanded",m?"true":"false"),m){let g=p();(b.focusLast?g[g.length-1]:g[0])?.focus()}else b.returnFocus!==!1&&l.focus()}l.addEventListener("click",m=>{m.stopPropagation(),v(u.hidden,{returnFocus:!1})}),l.addEventListener("keydown",m=>{m.key==="ArrowDown"||m.key==="Enter"||m.key===" "?(m.preventDefault(),v(!0)):m.key==="ArrowUp"&&(m.preventDefault(),v(!0,{focusLast:!0}))}),u.addEventListener("keydown",m=>{let b=p(),g=b.indexOf(document.activeElement);m.key==="ArrowDown"?(m.preventDefault(),b[(g+1)%b.length]?.focus()):m.key==="ArrowUp"?(m.preventDefault(),b[(g-1+b.length)%b.length]?.focus()):m.key==="Home"?(m.preventDefault(),b[0]?.focus()):m.key==="End"?(m.preventDefault(),b[b.length-1]?.focus()):m.key==="Tab"&&v(!1,{returnFocus:!1})}),document.addEventListener("click",m=>{!u.contains(m.target)&&m.target!==l&&(u.hidden||v(!1,{returnFocus:!1}))}),document.addEventListener("keydown",m=>{m.key==="Escape"&&!u.hidden&&v(!1)});function y(m){let b=o.querySelector(".ia-play .ia-blabel");b&&(b.textContent=m==="playing"?"Pause":"Play")}return{container:o,audio:o.querySelector(".ia-audio"),status:o.querySelector(".ia-status-msg"),trackCount:o.querySelector(".ia-status-count"),nowPlaying:o.querySelector(".ia-nowplaying-text"),filmIntro:o.querySelector(".ia-film-intro"),filmIntroTitle:o.querySelector(".ia-film-intro-title"),filmIntroLength:o.querySelector(".ia-film-intro-length"),filmIntroAbout:o.querySelector(".ia-film-intro-about"),filmIntroRights:o.querySelector(".ia-film-intro-rights"),prevBtn:o.querySelector(".ia-prev"),playBtn:o.querySelector(".ia-play"),nextBtn:o.querySelector(".ia-next"),seekSlider:o.querySelector(".ia-seek"),timeCur:o.querySelector(".ia-time-cur"),timeDur:o.querySelector(".ia-time-dur"),volumeSlider:o.querySelector(".ia-volume"),sourcesList:o.querySelector(".ia-sources-list"),favouritesList:o.querySelector(".ia-favourites-list"),librariesList:o.querySelector(".ia-libraries-list"),addSourceBtn:o.querySelector(".ia-add-source-btn"),addPlaylistBtn:o.querySelector(".ia-add-playlist-btn"),genreList:o.querySelector('[data-column="genre"] .ia-listbox'),artistList:o.querySelector('[data-column="artist"] .ia-listbox'),albumList:o.querySelector('[data-column="album"] .ia-listbox'),addGenreBtn:o.querySelector(".ia-add-genre-btn"),addArtistBtn:o.querySelector(".ia-add-artist-btn"),genreColumnFooter:o.querySelector('[data-column="genre"] .ia-column-footer'),artistColumnFooter:o.querySelector('[data-column="artist"] .ia-column-footer'),trackTable:o.querySelector(".ia-tracklist"),trackHead:o.querySelector(".ia-tracklist thead"),trackBody:o.querySelector(".ia-tracklist tbody"),trackEmpty:o.querySelector(".ia-tracklist-empty"),randomizeBtn:o.querySelector(".ia-randomize-btn"),clearTracksBtn:o.querySelector(".ia-clear-tracks-btn"),manageButton:l,gearMenu:u,helpMenuItem:o.querySelector(".gear-help"),helpLinkMenuItem:o.querySelector(".gear-help-link"),loginHelpMenuItem:o.querySelector(".gear-login-help"),installPodMenuItem:o.querySelector(".gear-install-pod"),updateAppMenuItem:o.querySelector(".gear-update-app"),themeToggle:o.querySelector(".gear-theme"),fontSizeBtn:o.querySelector(".gear-fontsize"),filtersMenuItem:o.querySelector(".gear-filters"),viewDeletedMenuItem:o.querySelector(".gear-view-deleted"),savePlaylistMenuItem:o.querySelector(".gear-save-playlist"),setMenuOpen:v,setPlayLabel:y}}function Lt(t,{onChange:a,allLabel:r="(All)",showAll:n=!0,multiSelect:s=!0,mode:o="select",allowDeselect:l=!1,renderItemActions:u=null,onItemAction:p=null,onItemDrop:v=null}={}){let y=[],m=new Set,b=null,g=null;function f(){return new Set(m)}function S(){return y.slice()}function D(C){y=C.slice(),g=null;for(let G of[...m])y.some(Z=>Z.id===G)||m.delete(G);b&&!y.some(G=>G.id===b)&&(b=null),ce()}function I(C){g=C||null,ce()}function F(C,G={}){m=new Set(C||[]);for(let Z of[...m])y.some(L=>L.id===Z)||m.delete(Z);ce(),G.notify!==!1&&a?.(f())}function j(C){return C?"\u2611":"\u2610"}function ce(){if(g!==null){t.innerHTML=`<li class="ia-listbox-message" aria-disabled="true">${H(g)}</li>`;return}let C=m.size===0,G="";n&&(G+=`<li role="option" class="ia-listbox-item ia-listbox-all${C?" selected":""}" data-id="" tabindex="-1" aria-selected="${C}">${H(r)}</li>`);for(let Z of y){Z.section&&(G+=`<li class="ia-listbox-divider" role="presentation">${H(Z.section)}</li>`);let L=m.has(Z.id),M=o==="checkbox"?`<span class="ia-listbox-checkbox" aria-hidden="true">${j(L)}</span>`:"",K=u?.(Z)??"",X=Z.title?` title="${H(Z.title)}"`:"",le=`ia-listbox-item${L?" selected":""}${Z.className?" "+Z.className:""}`,ue=Z.ariaLabel?` aria-label="${H(Z.ariaLabel)}"`:"";G+=`<li role="option" class="${le}" data-id="${H(Z.id)}" tabindex="-1" aria-selected="${L}"${X}${ue}>${M}<span class="ia-listbox-label">${H(Z.label)}</span>${K}</li>`}t.innerHTML=G}function ne(C){m.clear(),C&&m.add(C),b=C||null,ce(),a?.(f())}function xe(C){C?m.has(C)?m.delete(C):m.add(C):m.clear(),b=C||null,ce(),a?.(f())}function ze(C){if(!b||!C)return ne(C);let G=y.map(X=>X.id),Z=G.indexOf(b),L=G.indexOf(C);if(Z<0||L<0)return ne(C);let M=Math.min(Z,L),K=Math.max(Z,L);m=new Set(G.slice(M,K+1)),ce(),a?.(f())}t.addEventListener("click",C=>{let G=C.target.closest("[data-action]");if(G){C.stopPropagation();let M=G.closest(".ia-listbox-item");p?.(G.dataset.action,M?.dataset.id??null,G);return}let Z=C.target.closest(".ia-listbox-item");if(!Z)return;let L=Z.dataset.id;o==="checkbox"&&L?xe(L):s&&C.shiftKey&&L?ze(L):s&&(C.ctrlKey||C.metaKey)?xe(L):!s&&l&&L&&m.has(L)?(m.clear(),b=null,ce(),a?.(f())):ne(L),Z.focus()}),v&&(t.addEventListener("dragover",C=>{let G=C.target.closest(".ia-listbox-item");!G||!G.dataset.id||(C.preventDefault(),C.dataTransfer.dropEffect="copy",G.classList.add("drop-target"))}),t.addEventListener("dragleave",C=>{C.target.closest(".ia-listbox-item")?.classList.remove("drop-target")}),t.addEventListener("drop",C=>{let G=C.target.closest(".ia-listbox-item");!G||!G.dataset.id||(C.preventDefault(),G.classList.remove("drop-target"),v(G.dataset.id,C.dataTransfer))})),t.addEventListener("keydown",C=>{let G=Array.from(t.querySelectorAll(".ia-listbox-item"));if(!G.length)return;let Z=t.querySelector(".ia-listbox-item:focus")||G[0],L=G.indexOf(Z),M=L;if(C.key==="ArrowDown")M=Math.min(L+1,G.length-1),C.preventDefault();else if(C.key==="ArrowUp")M=Math.max(L-1,0),C.preventDefault();else if(C.key==="Home")M=0,C.preventDefault();else if(C.key==="End")M=G.length-1,C.preventDefault();else if(C.key===" "||C.key==="Enter"){C.preventDefault();let X=Z.dataset.id;s&&(C.ctrlKey||C.metaKey)?xe(X):s&&C.shiftKey&&X?ze(X):ne(X);return}else return;let K=G[M];if(K){K.focus();let X=K.dataset.id;s&&C.shiftKey&&X&&b?ze(X):(!s||!C.ctrlKey&&!C.metaKey)&&ne(X)}}),ce();function Ke(C){C&&C!==r&&(r=C,ce())}return{setItems:D,setSelection:F,getSelection:f,getItems:S,setMessage:I,setAllLabel:Ke}}function Yn(t,a){let r=new Set,n=null;function s(){return Array.from(t.querySelectorAll(".ia-track-row"))}function o(){return new Set(r)}function l(){let g=s(),f=new Set(g.map(S=>S.dataset.trackId));for(let S of[...r])f.has(S)||r.delete(S);n&&!f.has(n)&&(n=null),g.forEach(S=>{let D=r.has(S.dataset.trackId);S.classList.toggle("selected",D),S.setAttribute("aria-selected",D?"true":"false")})}function u(){r.clear(),n=null,l()}function p(g){r.clear(),g?(r.add(g),n=g):n=null,l()}function v(g){g&&(r.has(g)?r.delete(g):(r.add(g),n=g),l())}function y(g){if(!n||!g)return p(g);let f=s().map(j=>j.dataset.trackId),S=f.indexOf(n),D=f.indexOf(g);if(S<0||D<0)return p(g);let I=Math.min(S,D),F=Math.max(S,D);r=new Set(f.slice(I,F+1)),l()}function m(){r=new Set(s().map(g=>g.dataset.trackId)),r.size&&(n=[...r][0]),l()}function b(g){g.length&&(r.clear(),n=null,a.onRemove?.(g))}return t.addEventListener("click",g=>{let f=g.target.closest(".ia-track-fav-btn");if(f){g.stopPropagation(),a.onFavourite?.({url:f.dataset.url,name:f.dataset.name,artist:f.dataset.artist,album:f.dataset.album});return}let S=g.target.closest(".ia-track-remove-btn"),D=g.target.closest(".ia-track-kebab"),I=g.target.closest(".ia-track-row");if(!I)return;let F=I.dataset.trackId;if(D){a.onEdit?.(F,D);return}if(S){r.delete(F),n===F&&(n=null),a.onRemove?.([F],{fromButton:!0});return}g.shiftKey?y(F):g.ctrlKey||g.metaKey?v(F):p(F),I.focus()}),t.addEventListener("dragstart",g=>{let f=g.target.closest(".ia-track-row");if(!f)return;let S=f.dataset.trackId,D=r.has(S)?[...r]:[S];r.has(S)||p(S),g.dataTransfer.setData("application/x-ia-tracks",JSON.stringify(D)),g.dataTransfer.setData("text/plain",`${D.length} track${D.length===1?"":"s"}`),g.dataTransfer.effectAllowed="copy",f.classList.add("dragging")}),t.addEventListener("dragend",g=>{g.target.closest(".ia-track-row")?.classList.remove("dragging")}),t.addEventListener("dblclick",g=>{let f=g.target.closest(".ia-track-row");f&&(g.target.closest(".ia-track-remove-btn,.ia-track-kebab")||a.onPlay?.(f.dataset.trackId))}),t.addEventListener("keydown",g=>{let f=s();if(!f.length)return;let S=t.querySelector(".ia-track-row:focus")||f[0],D=f.indexOf(S),I=D;if(g.key==="ArrowDown")I=Math.min(D+1,f.length-1),g.preventDefault();else if(g.key==="ArrowUp")I=Math.max(D-1,0),g.preventDefault();else if(g.key==="Home")I=0,g.preventDefault();else if(g.key==="End")I=f.length-1,g.preventDefault();else if(g.key==="Enter"){g.preventDefault(),a.onPlay?.(S.dataset.trackId);return}else if(g.key===" "){g.preventDefault(),g.ctrlKey||g.metaKey?v(S.dataset.trackId):a.onPlay?.(S.dataset.trackId);return}else if(g.key==="Delete"){g.preventDefault();let j=r.size?[...r]:S?[S.dataset.trackId]:[];b(j);return}else if((g.ctrlKey||g.metaKey)&&(g.key==="a"||g.key==="A")){g.preventDefault(),m();return}else if(g.key==="Escape"){r.size&&(g.preventDefault(),u());return}else return;let F=f[I];if(F){F.focus();let j=F.dataset.trackId;g.shiftKey&&n?y(j):!g.ctrlKey&&!g.metaKey&&p(j)}}),{getSelection:o,clearSelection:u,applySelection:l}}function Jn(t){t.addEventListener("mousedown",a=>{let r=a.target.closest(".resize-handle");if(!r)return;a.preventDefault(),a.stopPropagation();let n=r.closest("th");if(!n)return;let s=n.dataset.col,o=t.querySelector(`col[data-col="${s}"]`);if(!o)return;let l=a.clientX,u=n.offsetWidth,p=y=>{let m=Math.max(30,u+(y.clientX-l));o.style.width=m+"px"},v=()=>{document.removeEventListener("mousemove",p),document.removeEventListener("mouseup",v),t.classList.remove("resizing")};document.addEventListener("mousemove",p),document.addEventListener("mouseup",v),t.classList.add("resizing")})}function Xn(t,a){let r=null,n="asc";function s(){if(Array.from(t.querySelectorAll("th")).forEach(u=>{u.classList.remove("sorted"),u.removeAttribute("aria-sort");let p=u.querySelector(".sort-arrow");p&&(p.textContent="")}),!r)return;let o=t.querySelector(`th[data-sort="${r}"]`);if(!o)return;o.classList.add("sorted"),o.setAttribute("aria-sort",n==="asc"?"ascending":"descending");let l=o.querySelector(".sort-arrow");l&&(l.textContent=n==="asc"?"\u25B2":"\u25BC")}return t.addEventListener("click",o=>{if(o.target.closest(".resize-handle"))return;let l=o.target.closest("th[data-sort]");if(!l)return;let u=l.dataset.sort;r===u?n=n==="asc"?"desc":"asc":(r=u,n="asc"),s(),a.onSort?.(r,n)}),{applyIndicator:s,getSort:()=>({col:r,dir:n}),setSort:(o,l)=>{r=o||null,n=l==="desc"?"desc":"asc",s()},clear:()=>{r=null,n="asc",s()}}}function Qn(t,a,r,{currentTrackId:n,isFav:s,emptyMessage:o,useKebab:l,favouritable:u,wallDelete:p}){if(!r.length){t.innerHTML="",o&&(a.textContent=o),a.hidden=!1;return}a.hidden=!0;let v=typeof l=="function"?S=>!!S.node&&l(S)!==!1:S=>!!S.node,y=S=>`<button type="button" class="ia-track-fav-btn${s&&s(S)?" on":""}" data-url="${H(S.url||"")}" data-name="${H(S.name||"")}" data-artist="${H(S.artist||"")}" data-album="${H(S.album||"")}" title="Add to favourites" aria-label="Favourite" tabindex="-1">${s&&s(S)?"\u2605":"\u2606"}</button>`,m='<button type="button" class="ia-src-edit ia-row-kebab ia-track-kebab" aria-haspopup="menu" aria-label="Track actions" title="Track actions" tabindex="-1">\u22EF</button>',b='<button type="button" class="ia-track-remove-btn" aria-label="Remove from favourites" title="Remove from favourites">\u2715</button>',g=S=>{if(p)return b;let D=u?y(S):"";return v(S)&&(D+=m),!u&&!v(S)&&(D+=b),D},f=r.map((S,D)=>{let I=S.id===n;return`<tr class="ia-track-row${I?" playing":""}" draggable="true" data-track-id="${H(S.id)}" data-album-url="${H(S.albumUrl||"")}" tabindex="-1" aria-current="${I?"true":"false"}">
      <td class="col-num">${I?'<span aria-hidden="true">\u25B8</span>':D+1}</td>
      <td class="col-title">${H(S.name)}</td>
      <td class="col-artist">${H(S.artist||"")}</td>
      <td class="col-album">${H(S.album||"")}</td>
      <td class="col-time">${H(S.time||"")}</td>
      <td class="col-remove">${g(S)}</td>
    </tr>`});t.innerHTML=f.join("")}function kr(t){if(!isFinite(t)||t<0)return"0:00";let a=Math.floor(t/60),r=Math.floor(t%60);return`${a}:${r.toString().padStart(2,"0")}`}function Zn(t,a){let{audio:r,playBtn:n,prevBtn:s,nextBtn:o,seekSlider:l,timeCur:u,timeDur:p,volumeSlider:v}=t;n.addEventListener("click",()=>a.onPlayToggle?.()),s.addEventListener("click",()=>a.onPrev?.()),o.addEventListener("click",()=>a.onNext?.());let y=!1;l.addEventListener("input",()=>{y=!0}),l.addEventListener("change",()=>{y=!1,isFinite(r.duration)&&(r.currentTime=parseFloat(l.value)/1e3*r.duration)}),v.addEventListener("input",()=>{r.volume=parseFloat(v.value)}),r.addEventListener("timeupdate",()=>{y||!isFinite(r.duration)||r.duration===0||(l.value=String(r.currentTime/r.duration*1e3),u.textContent=kr(r.currentTime))}),r.addEventListener("loadedmetadata",()=>{l.disabled=!isFinite(r.duration),p.textContent=kr(r.duration||0),u.textContent=kr(r.currentTime||0)}),r.addEventListener("emptied",()=>{l.value="0",l.disabled=!0,u.textContent="0:00",p.textContent="0:00"});let m=n.querySelector(".ia-icon"),b=n.querySelector(".ia-blabel");r.addEventListener("play",()=>{m?m.textContent="\u23F8":n.textContent="\u23F8",b&&(b.textContent="Pause"),n.setAttribute("aria-label","Pause"),n.title="Pause"}),r.addEventListener("pause",()=>{m?m.textContent="\u25B6":n.textContent="\u25B6",b&&(b.textContent="Play"),n.setAttribute("aria-label","Play"),n.title="Play"})}function la(t,a,r){document.querySelectorAll(".ia-floating-menu").forEach(f=>f.remove());let n=document.createElement("div");n.className="ia-floating-menu",n.setAttribute("role","menu"),n.innerHTML=a.map(f=>`<button type="button" class="ia-floating-menu-item" role="menuitem" data-id="${H(f.id)}">${H(f.label)}</button>`).join(""),document.body.appendChild(n);let s=t.getBoundingClientRect();n.style.position="fixed";let o=n.offsetWidth,l=n.offsetHeight,u=8,p=s.left;p+o+u>window.innerWidth&&(p=Math.max(u,s.right-o));let v=s.bottom+4;v+l+u>window.innerHeight&&(v=Math.max(u,s.top-l-4)),n.style.left=`${p}px`,n.style.top=`${v}px`;let y=()=>{n.remove(),document.removeEventListener("mousedown",m,!0),document.removeEventListener("keydown",b)},m=f=>{!n.contains(f.target)&&f.target!==t&&y()},b=f=>{if(f.key==="Escape"&&(f.preventDefault(),y(),t.focus?.()),f.key==="ArrowDown"||f.key==="ArrowUp"){f.preventDefault();let S=Array.from(n.querySelectorAll(".ia-floating-menu-item")),D=S.indexOf(document.activeElement);(f.key==="ArrowDown"?S[(D+1)%S.length]:S[(D-1+S.length)%S.length])?.focus()}};n.addEventListener("click",f=>{let S=f.target.closest(".ia-floating-menu-item");S&&(y(),r?.(S.dataset.id))}),setTimeout(()=>{document.addEventListener("mousedown",m,!0),document.addEventListener("keydown",b)},0);let g=n.querySelector(".ia-floating-menu-item");return g&&g.focus(),y}var Sr=null;function ei({css:t,aboutHtml:a}={}){if(t&&!document.getElementById("ia-player-styles")){let r=document.createElement("style");r.id="ia-player-styles",r.textContent=t,document.head.appendChild(r)}a&&(Sr=a)}var cs='a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';function ca(t){let a=document.activeElement,r=()=>Array.from(t.querySelectorAll(cs)).filter(s=>!s.closest("[hidden]")),n=r()[0];return n&&n.focus(),t.addEventListener("keydown",s=>{if(s.key!=="Tab")return;let o=r();if(!o.length)return;let l=o[0],u=o[o.length-1];s.shiftKey&&document.activeElement===l?(s.preventDefault(),u.focus()):!s.shiftKey&&document.activeElement===u&&(s.preventDefault(),l.focus())}),()=>{a?.focus?.()}}function Ma(t,a){t.innerHTML=a}function H(t){return String(t??"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a])}async function Ra(t={}){typeof t=="string"&&(t={url:t});let{url:a="./assets/ia-about.html",title:r="About",useBundle:n=!0,size:s="normal"}=t,o=document.querySelector(".about-modal");o&&o.remove();let l;if(n&&Sr)l=Sr;else try{l=await(await fetch(a)).text()}catch(m){l=`Could not load content: ${m.message}`}let u=document.createElement("div");u.className="about-modal";let p=s==="large"?" about-modal-large":"";u.innerHTML=`
    <div class="about-modal-content${p}" role="dialog" aria-modal="true" aria-labelledby="about-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">\xD7</button>
      <h2 id="about-modal-title" class="about-modal-title">${H(r)}</h2>
      <div class="about-modal-body">${l}</div>
    </div>
  `,document.body.appendChild(u);let v=ca(u),y=()=>{u.remove(),v()};u.querySelector(".about-modal-close").addEventListener("click",y),u.addEventListener("click",m=>{m.target===u&&y()}),document.addEventListener("keydown",function m(b){b.key==="Escape"&&(y(),document.removeEventListener("keydown",m))})}function ti({filter:t,onSave:a}){let r=document.querySelector(".about-modal");r&&r.remove();let n=t||{},s=(n.blockedCollections||[]).join(", "),o=Kn(n.minTrackDurationSec||0),l=Kn(n.minItemRuntimeSec||0),u=document.createElement("div");u.className="about-modal",u.innerHTML=`
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="filters-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">\xD7</button>
      <h2 id="filters-modal-title" class="about-modal-title">Filters</h2>
      <form class="filters-form">
        <p class="filters-hint">Hides low-quality archive.org results before they reach the album / track lists. Catalog artists (specific IA collections) are not filtered by default.</p>
        <label class="filters-row">
          <span class="filters-label">Min track length (mm:ss)</span>
          <input type="text" name="minTrack" value="${H(o)}" placeholder="3:00" inputmode="numeric">
        </label>
        <label class="filters-row">
          <span class="filters-label">Min item runtime (mm:ss)</span>
          <input type="text" name="minItem" value="${H(l)}" placeholder="0:00" inputmode="numeric">
        </label>
        <label class="filters-row">
          <span class="filters-label">Min track bitrate (kbps)</span>
          <input type="number" name="minBitrate" value="${n.minTrackBitrateKbps||0}" min="0" step="1">
        </label>
        <label class="filters-row">
          <span class="filters-label">Min item downloads</span>
          <input type="number" name="minDownloads" value="${n.minDownloads||0}" min="0" step="1">
        </label>
        <label class="filters-row">
          <span class="filters-label">Blocked collections (comma-sep)</span>
          <input type="text" name="blocked" value="${H(s)}" placeholder="podcasts, spokenword">
        </label>
        <label class="filters-row filters-row-check">
          <input type="checkbox" name="applyCatalog" ${n.applyToCatalogArtists?"checked":""}>
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
  `,document.body.appendChild(u);let p=ca(u),v=u.querySelector("form"),y=()=>{u.remove(),p()};u.querySelector(".about-modal-close").addEventListener("click",y),u.querySelector(".filters-cancel").addEventListener("click",y),u.addEventListener("click",m=>{m.target===u&&y()}),document.addEventListener("keydown",function m(b){b.key==="Escape"&&(y(),document.removeEventListener("keydown",m))}),u.querySelector(".filters-reset").addEventListener("click",()=>{a?.(null),y()}),v.addEventListener("submit",m=>{m.preventDefault();let b={minTrackDurationSec:Wn(v.elements.minTrack.value),minTrackBitrateKbps:Math.max(0,parseInt(v.elements.minBitrate.value,10)||0),minItemRuntimeSec:Wn(v.elements.minItem.value),minDownloads:Math.max(0,parseInt(v.elements.minDownloads.value,10)||0),blockedCollections:v.elements.blocked.value.split(",").map(g=>g.trim()).filter(Boolean),applyToCatalogArtists:v.elements.applyCatalog.checked};a?.(b),y()})}function Kn(t){let a=Math.max(0,Math.floor(t||0));if(!a)return"";let r=Math.floor(a/60),n=a%60;return`${r}:${String(n).padStart(2,"0")}`}function Wn(t){let a=String(t||"").trim();if(!a)return 0;if(/^\d+$/.test(a))return Math.max(0,parseInt(a,10));let r=a.match(/^(\d+):(\d{1,2})$/);return r?parseInt(r[1],10)*60+parseInt(r[2],10):0}function ai(t){return!t||!t.length?"":t.map((a,r)=>`<button type="button" class="filters-extra${a.danger?" filters-danger":""}" data-action-idx="${r}">${H(a.label)}</button>`).join("")}function ri(t,a,r){a&&t.querySelectorAll(".filters-extra").forEach(n=>{n.addEventListener("click",async()=>{await a[Number(n.dataset.actionIdx)]?.onClick?.()!==!1&&r()})})}function Lr({title:t="Playlist",values:a={},actions:r,onSave:n}){let s=document.querySelector(".about-modal");s&&s.remove();let o=a||{},l=document.createElement("div");l.className="about-modal",l.innerHTML=`
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="pl-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">\xD7</button>
      <h2 id="pl-modal-title" class="about-modal-title">${H(t)}</h2>
      <form class="filters-form">
        <label class="filters-row">
          <span class="filters-label">Name</span>
          <input type="text" name="name" value="${H(o.name||"")}" required autocomplete="off">
        </label>
        <label class="filters-row">
          <span class="filters-label">Maker</span>
          <input type="text" name="maker" value="${H(o.maker||"")}" autocomplete="off" placeholder="(optional)">
        </label>
        <label class="filters-row">
          <span class="filters-label">Description</span>
          <input type="text" name="description" value="${H(o.description||"")}" autocomplete="off" placeholder="(optional, shows on hover)">
        </label>
        <div class="filters-actions">
          ${ai(r)}
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `,document.body.appendChild(l);let u=ca(l),p=l.querySelector("form"),v=()=>{l.remove(),u()};l.querySelector(".about-modal-close").addEventListener("click",v),l.querySelector(".filters-cancel").addEventListener("click",v),l.addEventListener("click",y=>{y.target===l&&v()}),document.addEventListener("keydown",function y(m){m.key==="Escape"&&(v(),document.removeEventListener("keydown",y))}),ri(l,r,v),p.addEventListener("submit",y=>{y.preventDefault();let m=p.elements.name.value.trim();if(!m){p.elements.name.focus();return}n?.({name:m,maker:p.elements.maker.value.trim(),description:p.elements.description.value.trim()}),v()}),p.elements.name.focus(),p.elements.name.select()}function ni({title:t="Edit library",values:a={},canDelete:r=!1,onSave:n,onDelete:s}){let o=document.querySelector(".about-modal");o&&o.remove();let l=a||{},u=document.createElement("div");u.className="about-modal",u.innerHTML=`
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="lib-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">\xD7</button>
      <h2 id="lib-modal-title" class="about-modal-title">${H(t)}</h2>
      <form class="filters-form">
        <label class="filters-row">
          <span class="filters-label">Name</span>
          <input type="text" name="label" value="${H(l.label||"")}" required autocomplete="off">
        </label>
        <label class="filters-row">
          <span class="filters-label">Library URL</span>
          <input type="text" name="url" value="${H(l.url||"")}" required autocomplete="off">
        </label>
        <div class="filters-actions">
          ${r?'<button type="button" class="filters-extra filters-danger" data-action-idx="0">Delete library</button>':""}
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `,document.body.appendChild(u);let p=ca(u),v=u.querySelector("form"),y=()=>{u.remove(),p()};u.querySelector(".about-modal-close").addEventListener("click",y),u.querySelector(".filters-cancel").addEventListener("click",y),u.addEventListener("click",m=>{m.target===u&&y()}),document.addEventListener("keydown",function m(b){b.key==="Escape"&&(y(),document.removeEventListener("keydown",m))}),r&&u.querySelector(".filters-extra").addEventListener("click",async()=>{await s?.()!==!1&&y()}),v.addEventListener("submit",m=>{m.preventDefault();let b=v.elements.label.value.trim(),g=v.elements.url.value.trim();if(!b||!g){v.elements[b?"url":"label"].focus();return}n?.({label:b,url:g}),y()}),v.elements.label.focus(),v.elements.label.select()}function ii({values:t={},siblingCount:a=0,actions:r,onSave:n}){let s=document.querySelector(".about-modal");s&&s.remove();let o=t||{},l=a>0?` (also updates ${a} other track${a===1?"":"s"} from this source)`:"",u=document.createElement("div");u.className="about-modal",u.innerHTML=`
    <div class="about-modal-content" role="dialog" aria-modal="true" aria-labelledby="tk-modal-title">
      <button type="button" class="about-modal-close" aria-label="Close">\xD7</button>
      <h2 id="tk-modal-title" class="about-modal-title">Edit track</h2>
      <form class="filters-form">
        <label class="filters-row">
          <span class="filters-label">Title</span>
          <input type="text" name="title" value="${H(o.title||"")}" required autocomplete="off">
        </label>
        <label class="filters-row">
          <span class="filters-label">Artist</span>
          <input type="text" name="artist" value="${H(o.artist||"")}" autocomplete="off" placeholder="(optional)">
        </label>
        <label class="filters-row">
          <span class="filters-label">Album${H(l)}</span>
          <input type="text" name="album" value="${H(o.album||"")}" autocomplete="off" placeholder="(optional)">
        </label>
        <div class="filters-actions">
          ${ai(r)}
          <span style="flex:1"></span>
          <button type="button" class="filters-cancel">Cancel</button>
          <button type="submit" class="filters-save">Save</button>
        </div>
      </form>
    </div>
  `,document.body.appendChild(u);let p=ca(u),v=u.querySelector("form"),y=()=>{u.remove(),p()};u.querySelector(".about-modal-close").addEventListener("click",y),u.querySelector(".filters-cancel").addEventListener("click",y),u.addEventListener("click",m=>{m.target===u&&y()}),document.addEventListener("keydown",function m(b){b.key==="Escape"&&(y(),document.removeEventListener("keydown",m))}),ri(u,r,y),v.addEventListener("submit",m=>{m.preventDefault();let b=v.elements.title.value.trim();if(!b){v.elements.title.focus();return}n?.({title:b,artist:v.elements.artist.value.trim(),album:v.elements.album.value.trim()}),y()}),v.elements.title.focus(),v.elements.title.select()}function $(t,a){t.textContent=a}function oi(t,a){t.innerHTML="";let r=document.createElement("div");r.className="music-player",r.innerHTML=`
    <h1>Open Media Player</h1>
    <div class="rdf-input">
      <input type="text" class="rdf-uri" placeholder="Enter RDF file URI" value="./libraries/internet_archive_music/index.ttl" aria-label="RDF file URI">
      <br>
      <button class="load-btn">Load Music Library</button>
    </div>
  `,t.appendChild(r);let n=r.querySelector(".rdf-uri"),s=r.querySelector(".load-btn"),o=()=>{let l=n.value.trim();l&&a(l)};s.addEventListener("click",o),n.addEventListener("keypress",l=>{l.key==="Enter"&&o()})}function si(t){t.innerHTML='<div class="loading-screen">Loading music library...</div>'}function li(t,a){t.innerHTML=`<div class="error">Error loading music player: ${a}</div>`}function ci(t,a){t.innerHTML="",t.appendChild(a)}ei({css:Hn,aboutHtml:Gn});import*as fs from"rdflib";var di=Object.freeze({READY:"swc:ready",CAPABILITY:"swc:capability",OFFER:"swc:offer",LOGIN:"sol-login",LOGOUT:"sol-logout",AUTH_NEEDED:"sol-auth-needed",DEFAULT_CHANGE:"sol-default-change",COMMAND:"sol-command",ERROR:"sol-error",FORM_SAVE:"sol-form-save"});function ds(){let t=new Map,a=new Map;return{register(r,n){t.set(r,n);let s=a.get(r);s&&(a.delete(r),s.forEach(o=>o(n)))},get(r){return t.get(r)},has(r){return t.has(r)},names(){return Array.from(t.keys())},whenReady(r){return t.has(r)?Promise.resolve(t.get(r)):new Promise(n=>{let s=a.get(r)||[];s.push(n),a.set(r,s)})}}}var ui=null;function _r(){if(typeof window<"u"){let t=window.ComponentInterop||window.SolidWebComponents||{};return window.ComponentInterop=t,window.SolidWebComponents=t,t}return ui=ui||{}}function us(){let t=_r();return t.services||(t.services=ds()),t.EVENTS||(t.EVENTS=di),t.services}function pi(t,a){return us().register(t,a)}function fi(t,a){let r=_r();return r.adoptedFetch=typeof t=="function"?t:null,a&&a.webId&&(r.adoptedWebId=a.webId),r.adoptedFetch}if(typeof window<"u"){let t=_r();t.adoptFetch||(t.adoptFetch=fi),typeof t.registerConsumer=="function"&&t.registerConsumer("adoptFetch",a=>fi(a))}var me=fs,Na=class{constructor(){this._store=null,this._fetcher=null,this._adopted=!1,this._loaded=new Set,this._changeSubs=new Set,this._wiredStore=null,this._flushPending=!1}markLoaded(a){this._loaded.add(a)}isLoaded(a){return this._loaded.has(a)}sym(a){return me.sym(a)}literal(a,r,n){return n!==void 0?me.literal(a,r,n):me.literal(a,r)}blankNode(a){return me.blankNode(a)}graph(){return me.graph()}parse(a,r,n,s){return me.parse(a,r,n,s)}st(a,r,n,s){return me.st(a,r,n,s)}get store(){if(this._adopted&&this._store)return this._store;let a=typeof window<"u"&&(window[Symbol.for("solid-logic-singleton")]||window.SolidLogic);return a?.store?(this._store=a.store,a.store):(this._store||(this._store=me.graph()),this._store)}useStore(a){return!a||typeof a.match!="function"?!1:(this._store=a,this._fetcher=a.fetcher||null,this._adopted=!0,this._loaded.clear(),this._wireChange(a),!0)}onChange(a,r,n,s){let o={pattern:{subject:a,predicate:r,object:n},cb:s,dirty:!1};return this._changeSubs.add(o),this._wireChange(this.store),()=>this._changeSubs.delete(o)}_matchesPattern(a,r){return(!a.subject||r.subject&&r.subject.equals(a.subject))&&(!a.predicate||r.predicate&&r.predicate.equals(a.predicate))&&(!a.object||r.object&&r.object.equals(a.object))}_wireChange(a){if(!a||this._wiredStore===a)return;this._wiredStore=a;let r=n=>{let s=!1;for(let o of this._changeSubs)!o.dirty&&this._matchesPattern(o.pattern,n)&&(o.dirty=!0,s=!0);s&&this._scheduleFlush()};typeof a.addDataCallback=="function"&&a.addDataCallback(r),typeof a.addDataRemovalCallback=="function"&&a.addDataRemovalCallback(r)}_scheduleFlush(){this._flushPending||(this._flushPending=!0,queueMicrotask(()=>{this._flushPending=!1;for(let a of this._changeSubs)if(a.dirty){a.dirty=!1;try{a.cb()}catch(r){console.error("[rdf] onChange subscriber failed",r)}}}))}get storeFetcher(){return this._fetcher?this._fetcher:this.store.fetcher?(this._fetcher=this.store.fetcher,this._fetcher):(this._fetcher=new me.Fetcher(this.store),this.store.fetcher=this._fetcher,this._fetcher)}async load(a){let r=String(a).split("#")[0];return this.isLoaded(r)||(await this.storeFetcher.load(r),this.markLoaded(r)),this.store}fetcher(a,r){return new me.Fetcher(a,r)}sparqlToQuery(a,r,n){return me.SPARQLToQuery(a,r,n)}sparqlQuery(a,r){return me.sparqlQuery(a,r)}isReady(){return!!me&&typeof me.graph=="function"}hasSparqlEngine(){return typeof me.SPARQLToQuery=="function"}hasRemoteSparql(){return typeof me.sparqlQuery=="function"}serialize(a,r,n,s){return me.serialize(a,r,n,s)}get UpdateManager(){return me.UpdateManager}get SPARQLToQuery(){return me.SPARQLToQuery}get Fetcher(){return me.Fetcher}get NamedNode(){return me.NamedNode}get BlankNode(){return me.BlankNode}get Literal(){return me.Literal}get Collection(){return me.Collection}get Statement(){return me.Statement}},mi=Symbol.for("sol-components:rdf-singleton"),W=typeof window<"u"?window[mi]||(window[mi]=new Na):new Na,we=W;pi("rdf",W);typeof window<"u"&&window.SolidWebComponents&&typeof window.SolidWebComponents.registerConsumer=="function"&&window.SolidWebComponents.registerConsumer("rdf.useStore",function(t){W.useStore(t)});var de={rdf:"http://www.w3.org/1999/02/22-rdf-syntax-ns#",schema:"http://schema.org/",dcat:"http://www.w3.org/ns/dcat#",dct:"http://purl.org/dc/terms/",skos:"http://www.w3.org/2004/02/skos/core#"},Ne=t=>W.sym(t),zt=t=>W.literal(String(t)),ps=Ne(de.rdf+"type");function hi(t,a){let r=Ne(a.iri);return t.add(r,ps,Ne(de.schema+"ImageObject")),a.thumb&&t.add(r,Ne(de.schema+"thumbnailUrl"),Ne(a.thumb)),a.full&&t.add(r,Ne(de.schema+"contentUrl"),Ne(a.full)),a.width&&t.add(r,Ne(de.schema+"width"),zt(a.width)),a.height&&t.add(r,Ne(de.schema+"height"),zt(a.height)),a.caption&&t.add(r,Ne(de.schema+"caption"),zt(a.caption)),a.license&&t.add(r,Ne(de.schema+"license"),zt(a.license)),a.author&&t.add(r,Ne(de.schema+"author"),zt(a.author)),a.detailUrl&&t.add(r,Ne(de.schema+"mainEntityOfPage"),Ne(a.detailUrl)),a.position!=null&&t.add(r,Ne(de.schema+"position"),zt(a.position)),r}var ms="https://commons.wikimedia.org/w/api.php";function bi(t){return t?(new DOMParser().parseFromString(String(t),"text/html").body.textContent||"").replace(/\s+/g," ").trim():""}function hs(t){if(!t)return"";let a="";try{let r=new URL(t),n=r.pathname.match(/\/wiki\/(.+)$/);a=n?n[1]:r.searchParams.get("title")||""}catch{let r=String(t).match(/Category:[^?#]+/);a=r?r[0]:""}try{a=decodeURIComponent(a)}catch{}return a=a.replace(/_/g," ").trim(),/^Category:/i.test(a)?a:""}async function gi(t,a={}){let{thumbWidth:r=300,limit:n=60,cont:s,signal:o}=a,l=hs(t);if(!l)throw new Error("Not a Commons category URL");let u=new URLSearchParams({action:"query",format:"json",origin:"*",generator:"categorymembers",gcmtitle:l,gcmtype:"file",gcmlimit:String(n),prop:"imageinfo",iiprop:"url|size|extmetadata",iiurlwidth:String(r),iiextmetadatafilter:"Artist|LicenseShortName"});s&&u.set("gcmcontinue",s);let p=await fetch(`${ms}?${u}`,{signal:o});if(!p.ok)throw new Error(`HTTP ${p.status} from Commons`);let v=await p.json();if(v.error)throw new Error(v.error.info||"Commons API error");let y=v.query&&v.query.pages?Object.values(v.query.pages):[];y.sort((g,f)=>(g.index||0)-(f.index||0));let m=[];for(let g of y){let f=g.imageinfo&&g.imageinfo[0];if(!f||!f.thumburl)continue;let S=f.extmetadata||{};m.push({title:(g.title||"").replace(/^File:/,""),name:g.title||"",thumb:f.thumburl,full:f.url,width:f.thumbwidth||0,height:f.thumbheight||0,descUrl:f.descriptionurl||"",artist:bi(S.Artist&&S.Artist.value),license:bi(S.LicenseShortName&&S.LicenseShortName.value)})}let b=v.continue&&v.continue.gcmcontinue?v.continue.gcmcontinue:null;return{images:m,cont:b}}function bs(t,{startIndex:a=0}={}){let r=W.graph();return t.forEach((n,s)=>{let o=a+s,l=n.descUrl||n.full||`urn:commons:image:${o}`;hi(r,{iri:l,thumb:n.thumb,full:n.full,width:n.width,height:n.height,caption:n.title,license:n.license,author:n.artist,detailUrl:n.descUrl,position:o})}),r}async function*yi(t,{pageSize:a=60,thumbWidth:r=300,signal:n}={}){let s,o=0;do{let{images:l,cont:u}=await gi(t,{thumbWidth:r,limit:a,cont:s,signal:n});yield bs(l,{startIndex:o}),o+=l.length,s=u}while(s)}var Le={rdf:"http://www.w3.org/1999/02/22-rdf-syntax-ns#",schema:"http://schema.org/",dct:"http://purl.org/dc/terms/",dcat:"http://www.w3.org/ns/dcat#",dctype:"http://purl.org/dc/dcmitype/",ldp:"http://www.w3.org/ns/ldp#",xsd:"http://www.w3.org/2001/XMLSchema#"},$r=()=>new URL("favourites/",document.baseURI).href,Ar=t=>JSON.stringify(String(t));function gs(t){let a=t.created||new Date().toISOString(),r=`<${t.item}> a dctype:${t.bucket}, schema:${t.schemaType} ;
   schema:name ${Ar(t.name)}`;return t.thumbnail&&(r+=` ;
   schema:thumbnailUrl <${t.thumbnail}>`),t.link&&(r+=` ;
   ${t.download?"dcat:downloadURL":"dcat:landingPage"} <${t.link}>`),r+=" .",`@prefix schema: <${Le.schema}> .
@prefix dct: <${Le.dct}> .
@prefix dcat: <${Le.dcat}> .
@prefix dctype: <${Le.dctype}> .
@prefix xsd: <${Le.xsd}> .

<> a schema:BookmarkAction ;
   dct:creator ${Ar(t.contributor)} ;
   dct:title ${Ar(t.title||t.name)} ;
   dct:created "${a}"^^xsd:dateTime ;
   dct:references <${t.item}> .

${r}
`}async function vi(t){let a=await fetch($r(),{method:"POST",headers:{"Content-Type":"text/turtle"},body:gs(t)});if(!a.ok)throw new Error(`Couldn't save favourite (HTTP ${a.status}).`);let r=a.headers.get("Location");return r?new URL(r,$r()).href:null}async function da(t){let a=await fetch(t,{method:"DELETE"});if(!a.ok)throw new Error(`Couldn't remove favourite (HTTP ${a.status}).`)}function ys(t,a){let r=W.graph();try{W.parse(a,r,t,"text/turtle")}catch{return null}let n=r.each(void 0,W.sym(Le.rdf+"type"),W.sym(Le.schema+"BookmarkAction"))[0];if(!n)return null;let s=r.any(n,W.sym(Le.dct+"references"))?.value;if(!s)return null;let o=W.sym(s),l=r.each(o,W.sym(Le.rdf+"type")).map(v=>v.value),u=l.find(v=>v.startsWith(Le.dctype))||"",p=l.find(v=>v.startsWith(Le.schema))||"";return{file:t,item:s,contributor:r.any(n,W.sym(Le.dct+"creator"))?.value||"anonymous",customTitle:r.any(n,W.sym(Le.dct+"title"))?.value||"",created:r.any(n,W.sym(Le.dct+"created"))?.value||"",canonicalTitle:r.any(o,W.sym(Le.schema+"name"))?.value||s,thumbnail:r.any(o,W.sym(Le.schema+"thumbnailUrl"))?.value||"",link:r.any(o,W.sym(Le.dcat+"downloadURL"))?.value||r.any(o,W.sym(Le.dcat+"landingPage"))?.value||s,bucket:u.replace(Le.dctype,"")||"Collection",schemaType:p.replace(Le.schema,"")}}async function Fa(){let t=$r(),a;try{let l=await fetch(t,{headers:{Accept:"text/turtle"},cache:"no-store"});if(!l.ok)return[];a=await l.text()}catch{return[]}let r=W.graph();try{W.parse(a,r,t,"text/turtle")}catch{return[]}let n=r.each(W.sym(t),W.sym(Le.ldp+"contains")).map(l=>l.value).filter(l=>!l.endsWith("/")),s=[];await Promise.all(n.map(async l=>{try{let u=await fetch(l,{cache:"no-store"});if(!u.ok)return;let p=ys(l,await u.text());p&&s.push(p)}catch{}}));let o=new Map;for(let l of s){o.has(l.item)||o.set(l.item,{item:l.item,canonicalTitle:l.canonicalTitle,thumbnail:l.thumbnail,link:l.link,bucket:l.bucket,schemaType:l.schemaType,created:l.created,contributors:[]});let u=o.get(l.item);u.contributors.some(p=>p.name===l.contributor)||u.contributors.push({name:l.contributor,customTitle:l.customTitle,file:l.file}),l.created>u.created&&(u.created=l.created),!u.thumbnail&&l.thumbnail&&(u.thumbnail=l.thumbnail)}return[...o.values()].map(l=>({...l,count:l.contributors.length}))}var vs="omp:fav-contributor",ws=()=>{try{return localStorage.getItem(vs)||""}catch{return""}},xs=`
  .omp-fav-overlay { position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,.55);
    display: flex; align-items: flex-start; justify-content: center; padding: 12vh 16px; }
  .omp-fav-modal { width: min(420px, 100%); background: var(--ia-bg, #15161a); color: var(--ia-text, #e7e7ea);
    border: 1px solid var(--ia-border, #2a2d33); border-radius: 14px; padding: 18px 20px 16px;
    box-shadow: 0 24px 60px -16px rgba(0,0,0,.7); font-family: var(--ia-font-body, system-ui, sans-serif); }
  .omp-fav-modal h2 { margin: 0 0 .6em; font-size: 1.1rem; }
  .omp-fav-modal label { display: block; font-size: .82rem; margin: .5em 0 .15em; color: var(--ia-text-soft, #c8c8cc); }
  .omp-fav-modal input { width: 100%; box-sizing: border-box; font: inherit; padding: .4em .55em;
    border: 1px solid var(--ia-border, #2a2d33); border-radius: 7px; background: var(--ia-bg-elev, #1c1d22); color: inherit; }
  .omp-fav-note { font-size: .74rem; color: var(--ia-text-muted, #9aa0a6); margin: .8em 0 0; line-height: 1.4; }
  .omp-fav-row { display: flex; justify-content: flex-end; gap: .5em; margin-top: 1em; }
  .omp-fav-row button { font: inherit; font-size: .85rem; padding: .4em .9em; border-radius: 8px; cursor: pointer;
    border: 1px solid var(--ia-border, #2a2d33); background: var(--ia-bg-btn, #2a2a2a); color: inherit; }
  .omp-fav-row button.primary { background: var(--ia-accent, #e6b800); color: #1a1a1a; border-color: transparent; font-weight: 600; }
`;function ks(t){return new Promise(a=>{let r=document.createElement("div");r.className="omp-fav-overlay",r.innerHTML=`<style>${xs}</style>
      <div class="omp-fav-modal" role="dialog" aria-modal="true" aria-label="Add to favourites">
        <h2>\u2605 Add to favourites</h2>
        <label>Name this favourite<input class="omp-fav-title" type="text"></label>
        <p class="omp-fav-note">Favourites are a shared, public wall \u2014 anyone can add; only the owner can remove.</p>
        <div class="omp-fav-row">
          <button class="omp-fav-cancel" type="button">Cancel</button>
          <button class="omp-fav-add primary" type="button">Add \u2605</button>
        </div>
      </div>`,document.body.appendChild(r);let n=r.querySelector(".omp-fav-title");n.value=t||"",n.focus(),n.select?.();let s=l=>{r.remove(),a(l)},o=()=>{let l=n.value.trim();s({contributor:ws()||"anonymous",title:l||t})};r.querySelector(".omp-fav-cancel").addEventListener("click",()=>s(null)),r.querySelector(".omp-fav-add").addEventListener("click",o),r.addEventListener("click",l=>{l.target===r&&s(null)}),r.addEventListener("keydown",l=>{l.key==="Escape"?s(null):l.key==="Enter"&&(l.preventDefault(),o())})})}async function Er(t){let a=await ks(t.name);if(!a)return null;let r={...t,contributor:a.contributor,title:a.title};return await vi(r),document.dispatchEvent(new CustomEvent("omp:favourited",{detail:r})),r}function wi(){window.__ompFavRouter||(window.__ompFavRouter=!0,document.addEventListener("item-favourite",t=>{let a=t.detail;a&&a.bucket&&a.item&&Er(a).catch(r=>console.warn("[favourite]",r.message))}))}var Ss=`
  :host { display: flex; flex-direction: row; height: 100%; min-height: 0; overflow: hidden;
          font-family: var(--font-ui, system-ui, sans-serif); font-size: var(--font-size, 20px);
          color: var(--text, #212121); background: var(--bg, #f5f5f5); }
  :host([hidden]) { display: none; }
  * { box-sizing: border-box; }

  .fav-col { flex: 0 0 13rem; display: flex; flex-direction: column; min-height: 0;
             background: var(--surface, #fff); border-right: 1px solid var(--border, #d0d0d0); }
  .right { flex: 1 1 auto; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .browser { flex: 0 0 42%; display: flex; min-height: 8rem;
             background: var(--surface, #fff); border-bottom: 1px solid var(--border, #d0d0d0); }

  .pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; overflow: hidden; }
  .browser .pane { flex: 1 1 0; }
  .browser .pane + .pane { border-left: 1px solid var(--border, #d0d0d0); }
  .pane-head { flex: 0 0 auto; padding: .45rem .6rem .3rem; font-size: .68em; font-weight: 700;
               text-transform: uppercase; letter-spacing: .05em; color: var(--text-muted, #7f8c8d); }
  .list { list-style: none; margin: 0; padding: 0 .35rem .4rem; overflow: auto; min-height: 0; flex: 1 1 auto; }
  .hint { padding: .35rem .5rem; font-size: .72em; font-style: italic; color: var(--text-muted, #7f8c8d); }

  .row { display: block; width: 100%; text-align: left; font: inherit; font-size: .78em;
         padding: .35rem .5rem; margin: 0; border: none; border-radius: 6px; background: transparent;
         color: var(--text, #212121); cursor: pointer; line-height: 1.3; }
  .row:hover { background: var(--hover, #eaf2fb); }
  .row.selected { background: var(--focus-bg, #ebf5fb); color: var(--selected-fg, var(--link, #2980b9)); font-weight: 600; }
  .row:focus-visible { outline: 2px solid var(--accent, #3498db); outline-offset: -2px; }
  .coll, .fav-link { color: var(--link, var(--accent, #2980b9)); }

  /* collection row = label button + a \u2605 favourite toggle */
  li.has-star { display: flex; align-items: center; gap: .1rem; }
  li.has-star .row { flex: 1 1 auto; min-width: 0; }
  .star { flex: 0 0 auto; background: transparent; border: none; cursor: pointer; padding: 0 .25rem;
          font-size: .95em; line-height: 1; color: var(--text-muted, #9aa0a6); }
  .star:hover { color: var(--accent, #e6b800); }
  .star.on { color: #e6b800; }
  /* owner-only "remove from the communal wall" control on a favourite row */
  .fav-x { flex: 0 0 auto; background: transparent; border: none; cursor: pointer; padding: 0 .3rem;
           color: var(--text-muted, #9aa0a6); font-size: .8em; display: none; }
  :host(.owner) .fav-x { display: inline-block; }
  .fav-x:hover { color: var(--error, #e74c3c); }

  /* owner-only add controls (hidden unless :host(.owner)) */
  .add { flex: 0 0 auto; border-top: 1px solid var(--border, #d0d0d0); padding: .35rem; display: none; }
  :host(.owner) .add { display: block; }
  .add-btn { width: 100%; font: inherit; font-size: .74em; padding: .3rem .5rem; cursor: pointer;
             border: 1px dashed var(--border, #c0c0c0); border-radius: 6px; background: transparent; color: var(--text-muted, #555); }
  .add-btn:hover:not(:disabled) { background: var(--hover, #eaf2fb); color: var(--text, #111); }
  .add-btn:disabled { opacity: .5; cursor: default; }
  .add-form { display: flex; flex-direction: column; gap: .3rem; }
  .add-form input { font: inherit; font-size: .76em; padding: .3rem .4rem; border: 1px solid var(--border, #c0c0c0);
                    border-radius: 6px; background: var(--bg, #fff); color: var(--text, #111); }
  .add-form .add-row { display: flex; gap: .3rem; }
  .add-form button { font: inherit; font-size: .74em; padding: .28rem .6rem; border-radius: 6px;
                     border: 1px solid var(--border, #c0c0c0); cursor: pointer; background: var(--surface, #fff); color: inherit; }
  .add-form button.primary { background: var(--accent, #3498db); color: #fff; border-color: transparent; }
  .add-err { font-size: .7em; color: var(--error, #e74c3c); padding: 0 .2rem; }

  sol-gallery { flex: 1 1 auto; min-width: 0; min-height: 0; }
`,Tr=class extends HTMLElement{constructor(){super(),this.attachShadow({mode:"open"}),this._loaded=!1,this._favColls=[],this._favLandings=new Set}connectedCallback(){if(this._built)return;this._built=!0,this.source=this.getAttribute("source")||"";let a=document.createElement("style");a.textContent=Ss,this._favPane=this._pane("Community Favorites","fav-col");let r=document.createElement("div");r.className="right";let n=document.createElement("div");n.className="browser",this._libPane=this._pane("Library"),this._topicPane=this._pane("Topic"),this._collPane=this._pane("Collection"),n.append(this._libPane.pane,this._topicPane.pane,this._collPane.pane),this._gallery=document.createElement("sol-gallery"),this._gallery.addEventListener("load-more",()=>this._pump&&this._pump()),r.append(n,this._gallery),this.shadowRoot.append(a,this._favPane.pane,r),this._buildAddControls(),this._syncOwner(),this._onGating=()=>this._syncOwner(),document.addEventListener("omp:reapply-gating",this._onGating),this._onFav=()=>this._loadCommunalFavs(),document.addEventListener("omp:favourited",this._onFav),this._renderFavourites(),this._loadCommunalFavs()}disconnectedCallback(){document.removeEventListener("omp:reapply-gating",this._onGating),document.removeEventListener("omp:favourited",this._onFav)}_pane(a,r){let n=document.createElement("div");n.className="pane"+(r?" "+r:"");let s=document.createElement("div");s.className="pane-head",s.textContent=a;let o=document.createElement("ul");return o.className="list",n.append(s,o),{pane:n,list:o}}ensureLoaded(){this._loaded||this._loading||this._load().catch(a=>console.warn("[omp-images] load failed:",a.message))}async reload(){return this._loaded=!1,this._load()}async _load(){this._loading=!0;try{let a=this._docUrl(),r=await fetch(a);if(!r.ok)throw new Error(`HTTP ${r.status} for ${a}`);let n=W.graph();W.parse(await r.text(),n,a,"text/turtle"),this._readModel(n),this._renderLibraries(),this._renderFavourites(),this._restoreSelection(),this._loaded=!0}finally{this._loading=!1}}_readModel(a){let r=W.sym(de.rdf+"type"),n=o=>a.any(o,W.sym(de.skos+"prefLabel"))?.value||o.value,s=W.sym(this._schemeIri());this._libraries=a.each(void 0,W.sym(de.skos+"topConceptOf"),s).map(o=>({iri:o.value,label:this._libLabel(n(o))})).sort((o,l)=>o.label.localeCompare(l.label)),this._topicsByLib=new Map,this._topicByIri=new Map,this._topicLib=new Map;for(let o of this._libraries){let l=a.each(void 0,W.sym(de.skos+"broader"),W.sym(o.iri)).map(u=>({iri:u.value,label:n(u)})).sort((u,p)=>u.label.localeCompare(p.label));this._topicsByLib.set(o.iri,l);for(let u of l)this._topicByIri.set(u.iri,u),this._topicLib.set(u.iri,o.iri)}this._collsByTopic=new Map,this._collByIri=new Map;for(let o of a.each(void 0,r,W.sym(de.dcat+"Dataset"))){let l=a.any(o,W.sym(de.dcat+"theme"))?.value;if(!l)continue;let u={iri:o.value,title:a.any(o,W.sym(de.dct+"title"))?.value||"(untitled)",landingPage:a.any(o,W.sym(de.dcat+"landingPage"))?.value||"",theme:l};this._collsByTopic.has(l)||this._collsByTopic.set(l,[]),this._collsByTopic.get(l).push(u),this._collByIri.set(o.value,u)}for(let o of this._collsByTopic.values())o.sort((l,u)=>l.title.localeCompare(u.title))}_libLabel(a){return a.replace(/^Images\s*-\s*/i,"").trim()||a}_renderLibraries(){this._libPane.list.replaceChildren(),this._libBtns=new Map;for(let a of this._libraries){let r=this._row(this._libPane.list,"lib",a.label);r.addEventListener("click",()=>this._selectLibrary(a)),this._libBtns.set(a.iri,r)}this._libraries.length||this._hint(this._libPane.list,"No libraries")}_selectLibrary(a){this._activeLibrary=a,this._mark(this._libBtns,this._libBtns.get(a.iri)),this._renderTopics(a),this._activeTopic=null,this._collPane.list.replaceChildren(),this._hint(this._collPane.list,"Select a topic"),this._addCollBtn.disabled=!0,this._addTopicBtn.disabled=!1}_renderTopics(a){this._topicPane.list.replaceChildren(),this._topicBtns=new Map;let r=this._topicsByLib.get(a.iri)||[];for(let n of r){let s=this._row(this._topicPane.list,"topic",n.label);s.addEventListener("click",()=>this._selectTopic(n)),this._topicBtns.set(n.iri,s)}r.length||this._hint(this._topicPane.list,"No topics in this library yet")}_selectTopic(a){this._activeTopic=a,this._mark(this._topicBtns,this._topicBtns.get(a.iri)),this._renderColls(a),this._addCollBtn.disabled=!1}_renderColls(a){this._collPane.list.replaceChildren(),this._collBtns=new Map,this._starByIri=new Map;let r=this._collsByTopic.get(a.iri)||[];for(let n of r){let s=document.createElement("li");s.className="has-star";let o=document.createElement("button");o.type="button",o.className="row coll",o.textContent=n.title,o.addEventListener("click",()=>this._openCollection(n));let l=this._starButton(n);s.append(o,l),this._collPane.list.appendChild(s),this._collBtns.set(n.iri,o)}r.length||this._hint(this._collPane.list,"No collections in this topic yet"),this._activeCollIri&&this._collBtns.has(this._activeCollIri)&&this._collBtns.get(this._activeCollIri).classList.add("selected")}_starButton(a){let r=this._favLandings.has(a.landingPage),n=document.createElement("button");return n.type="button",n.className="star"+(r?" on":""),n.textContent=r?"\u2605":"\u2606",n.title="Add to the communal favourites",n.setAttribute("aria-label","Favourite"),n.addEventListener("click",s=>{s.stopPropagation(),this._favourite(a)}),this._starByIri.set(a.iri,n),n}async _loadCommunalFavs(){try{let a=await Fa();this._favColls=a.filter(r=>r.bucket==="Collection"||r.schemaType==="ImageGallery"),this._favLandings=new Set(this._favColls.map(r=>r.link||r.item))}catch{this._favColls=[],this._favLandings=new Set}this._renderFavourites(),this._refreshStars()}_refreshStars(){for(let[a,r]of this._starByIri||new Map){let n=this._collByIri?.get(a),s=n&&this._favLandings.has(n.landingPage);r.classList.toggle("on",!!s),r.textContent=s?"\u2605":"\u2606"}}_renderFavourites(){let a=this._favPane.list;a.replaceChildren();let r=[...this._favColls].sort((n,s)=>n.canonicalTitle.localeCompare(s.canonicalTitle));if(!r.length){this._hint(a,"Star a collection \u2014 it joins the \u2605 Favourites wall");return}for(let n of r){let s=document.createElement("li");s.className="has-star";let o=document.createElement("button");o.type="button",o.className="row fav-link",o.textContent=n.canonicalTitle+(n.count>1?`  \xB7  \u2605${n.count}`:""),o.title=`Favourited by ${n.contributors.map(l=>l.name).join(", ")}`,o.addEventListener("click",()=>this.openByRef(n.link||n.item)),s.append(o,this._favDeleteButton(n)),a.appendChild(s)}}_favDeleteButton(a){let r=document.createElement("button");return r.type="button",r.className="fav-x",r.textContent="\u2715",r.title="Remove from the communal favourites",r.setAttribute("aria-label","Remove favourite"),r.addEventListener("click",async n=>{if(n.stopPropagation(),!!confirm(`Remove \u201C${a.canonicalTitle}\u201D from the communal favourites?`)){for(let s of a.contributors||[])if(s.file)try{await da(s.file)}catch(o){console.warn("[fav delete]",o.message)}document.dispatchEvent(new CustomEvent("omp:favourited"))}}),r}async _favourite(a){if(this._favLandings.has(a.landingPage)){let n=this._favColls.find(s=>(s.link||s.item)===a.landingPage);for(let s of n?.contributors||[])if(s.file)try{await da(s.file)}catch(o){console.warn("[fav delete]",o.message)}document.dispatchEvent(new CustomEvent("omp:favourited"));return}await Er({item:a.landingPage,bucket:"Collection",schemaType:"ImageGallery",name:a.title,link:a.landingPage,download:!1})&&this._loadCommunalFavs()}openByRef(a){for(let r of this._collByIri?.values()||[])if(r.landingPage===a){this._jumpToCollection(r.iri);return}}_jumpToCollection(a){let r=this._collByIri?.get(a);if(!r)return;let n=this._topicLib.get(r.theme),s=this._libraries.find(l=>l.iri===n),o=this._topicByIri.get(r.theme);s&&this._selectLibrary(s),o&&this._selectTopic(o),this._openCollection(r),requestAnimationFrame(()=>{this._libBtns.get(n)?.scrollIntoView({block:"nearest"}),this._topicBtns.get(r.theme)?.scrollIntoView({block:"nearest"}),this._collBtns.get(a)?.scrollIntoView({block:"nearest"})})}_openCollection(a){this._activeCollIri=a.iri,this._collBtns&&this._mark(this._collBtns,this._collBtns.get(a.iri));try{localStorage.setItem(this._selKey(),a.landingPage)}catch{}let r=a.landingPage;if(!r){this._gallery.clear(),this._gallery.end();return}this._abort?.abort(),this._abort=new AbortController;let n=this._abort.signal;this._gallery.clear();let s=yi(r,{signal:n})[Symbol.asyncIterator](),o=!1,l=!1;this._pump=async()=>{if(!(o||l)){l=!0;try{let{value:u,done:p}=await s.next();if(n.aborted)return;if(p){o=!0,this._gallery.end();return}this._gallery.add(u)}catch(u){o=!0,u.name!=="AbortError"&&(this._gallery.end(),console.warn("[omp-images]",u.message))}finally{l=!1}}},this._pump()}_restoreSelection(){let a=null;try{a=localStorage.getItem(this._selKey())}catch{}if(a){for(let r of this._collByIri.values())if(r.landingPage===a){this._jumpToCollection(r.iri);return}}}_row(a,r,n){let s=document.createElement("li"),o=document.createElement("button");return o.type="button",o.className=`row ${r}`,o.textContent=n,s.appendChild(o),a.appendChild(s),o}_hint(a,r){if(!r){a.replaceChildren();return}let n=document.createElement("li");n.className="hint",n.textContent=r,a.replaceChildren(n)}_mark(a,r){for(let n of a.values()){let s=n===r;n.classList.toggle("selected",s),s?n.setAttribute("aria-current","true"):n.removeAttribute("aria-current")}}_buildAddControls(){let a=document.createElement("div");a.className="add",this._addTopicBtn=this._mkAddBtn("+ Add topic",()=>this._openAddTopic(a)),this._addTopicBtn.disabled=!0,a.appendChild(this._addTopicBtn),this._topicPane.pane.appendChild(a);let r=document.createElement("div");r.className="add",this._addCollBtn=this._mkAddBtn("+ Add collection",()=>this._openAddCollection(r)),this._addCollBtn.disabled=!0,r.appendChild(this._addCollBtn),this._collPane.pane.appendChild(r)}_mkAddBtn(a,r){let n=document.createElement("button");return n.type="button",n.className="add-btn",n.textContent=a,n.addEventListener("click",r),n}_openAddTopic(a){if(!this._activeLibrary)return;this._addTopicBtn.style.display="none";let{form:r,inputs:n,ok:s,err:o,reset:l}=this._addForm(a,[{ph:"Topic name"}],this._addTopicBtn);r.addEventListener("submit",async u=>{u.preventDefault();let p=n[0].value.trim();if(p){s.disabled=!0,o.textContent="";try{await this._addTopic(p,this._activeLibrary.iri);let v=this._activeLibrary.iri;l(),await this.reload();let y=this._libraries.find(m=>m.iri===v);y&&this._selectLibrary(y)}catch(v){o.textContent=v.message,s.disabled=!1}}})}_openAddCollection(a){if(!this._activeTopic)return;this._addCollBtn.style.display="none";let{form:r,inputs:n,ok:s,err:o,reset:l}=this._addForm(a,[{ph:"Collection title"},{ph:"Commons category URL",value:"https://commons.wikimedia.org/wiki/Category:"}],this._addCollBtn);r.addEventListener("submit",async u=>{u.preventDefault();let p=n[0].value.trim(),v=n[1].value.trim();if(!(!p||!v)){s.disabled=!0,o.textContent="";try{await this._addCollection(p,v,this._activeTopic.iri);let y=this._activeTopic.iri,m=this._activeLibrary.iri;l(),await this.reload();let b=this._libraries.find(f=>f.iri===m);b&&this._selectLibrary(b);let g=this._topicByIri.get(y);g&&this._selectTopic(g)}catch(y){o.textContent=y.message,s.disabled=!1}}})}_addForm(a,r,n){let s=document.createElement("form");s.className="add-form";let o=r.map(m=>{let b=document.createElement("input");return b.placeholder=m.ph,b.required=!0,m.value&&(b.value=m.value),s.appendChild(b),b}),l=document.createElement("div");l.className="add-row";let u=document.createElement("button");u.type="submit",u.className="primary",u.textContent="Add";let p=document.createElement("button");p.type="button",p.textContent="Cancel";let v=document.createElement("div");v.className="add-err",l.append(u,p),s.append(l,v),a.appendChild(s),o[0].focus();let y=()=>{s.remove(),n.style.display=""};return p.addEventListener("click",y),{form:s,inputs:o,ok:u,err:v,reset:y}}async _addTopic(a,r){let n=this._mintIri(a);await this._patch(`<${n}> a skos:Concept, schema:DefinedTerm ; skos:prefLabel ${JSON.stringify(a)} ; skos:broader <${r}> .`)}async _addCollection(a,r,n){let s=this._mintIri(a,"coll");await this._patch(`<${s}> a <${de.dcat}Dataset>, <${de.schema}ImageGallery> ; dct:title ${JSON.stringify(a)} ; dcat:landingPage <${r}> ; dcat:theme <${n}> .`)}async _patch(a){let r=`PREFIX skos: <${de.skos}>
PREFIX schema: <${de.schema}>
PREFIX dct: <${de.dct}>
PREFIX dcat: <${de.dcat}>
INSERT DATA {
${a}
}
`,n=await fetch(this._docUrl(),{method:"PATCH",headers:{"Content-Type":"application/sparql-update"},body:r});if(!n.ok)throw new Error(`Save failed (HTTP ${n.status}). The file must be on a Solid pod you own.`)}_docUrl(){return new URL(this.source,document.baseURI).href.split("#")[0]}_schemeIri(){let a=this.source.split("#")[1]||"Images";return`${this._docUrl()}#${a}`}_selKey(){return`omp-images:collection:${this.source}`}_mintIri(a,r){let n=(r?r+"-":"")+a.trim().replace(/[^A-Za-z0-9]+/g,"_").replace(/^_+|_+$/g,"").slice(0,40),s=n||"item",o=this._docUrl(),l=p=>this._topicByIri.has(`${o}#${p}`)||this._libraries.some(v=>v.iri===`${o}#${p}`)||this._collByIri.has(`${o}#${p}`),u=2;for(;l(s);)s=`${n}_${u++}`;return`${o}#${s}`}_syncOwner(){let a=!!document.querySelector("sol-default")?.hasAttribute("solid-kitchen")||!!document.querySelector("sol-login")?.isLoggedIn;this.classList.toggle("owner",a)}};customElements.get("omp-images")||customElements.define("omp-images",Tr);var Cr=class extends HTMLElement{static get template(){return"assets/omp-calendar-popout.html"}async connectedCallback(){if(this._rendered)return;this._rendered=!0;let a=await fetch(new URL(this.constructor.template,document.baseURI));this.innerHTML=await a.text(),this._trigger=this.querySelector(".omp-popout-trigger"),this._panel=this.querySelector(".omp-popout-panel"),this._trigger.addEventListener("click",r=>{r.stopPropagation(),this._toggle()}),this._onDocClick=r=>{this.contains(r.target)||this._close()},this._onKeydown=r=>{r.key==="Escape"&&!this._panel.hidden&&(this._close(),this._trigger.focus())},document.addEventListener("click",this._onDocClick),document.addEventListener("keydown",this._onKeydown),this._mountCalendar()}_mountCalendar(){let a=this._panel.querySelector("template.omp-calendar-tpl");if(!a)return;let r=a.content.cloneNode(!0),n=r.querySelector("sol-calendar");if(n)for(let s of["source","view","proxy"]){let o=this.getAttribute(s);o!=null&&n.setAttribute(s,o)}this._panel.appendChild(r)}disconnectedCallback(){document.removeEventListener("click",this._onDocClick),document.removeEventListener("keydown",this._onKeydown)}_toggle(){this._panel.hidden?this._open():this._close()}_close(){this._panel.hidden=!0,this._trigger.setAttribute("aria-expanded","false")}_open(){let a=this._trigger.getBoundingClientRect();this._panel.style.top=`${Math.round(a.bottom+6)}px`,this._panel.style.right=`${Math.round(Math.max(8,window.innerWidth-a.right))}px`,this._panel.hidden=!1,this._trigger.setAttribute("aria-expanded","true")}};customElements.define("omp-calendar-popout",Cr);function Ir(t){if(!t)return null;let a;try{a=new URL(t)}catch{return null}let r=a.pathname.match(/\/details\/([^/?]+)/);if(r)return`collection:${r[1]}`;if(a.pathname==="/search"||a.pathname==="/search.php"){let n=[],s=(a.searchParams.get("query")||"").trim();s&&n.push(s);for(let o of a.searchParams.getAll("and[]")){let l=o.trim();l&&n.push(l)}return n.length?n.join(" AND "):null}return null}function ki(t){if(t==null)return NaN;if(typeof t=="number")return t;let a=String(t).trim();if(!a)return NaN;if(/^[0-9.]+$/.test(a))return parseFloat(a);let r=a.split(":").map(Number);return r.some(n=>!Number.isFinite(n))?NaN:r.length===3?r[0]*3600+r[1]*60+r[2]:r.length===2?r[0]*60+r[1]:r[0]}function Ls(t){return/^collection:/.test(t)}function _s(t){return t==="video"?"movies":"audio"}async function Pr(t,a=null,r={}){if(!t)return[];let n=_s(r.mediaType),s=t,o=a&&(!Ls(t)||a.applyToCatalogArtists);if(o){let m=[];t.includes("mediatype:")||m.push(`mediatype:"${n}"`),a.minDownloads>0&&m.push(`downloads:[${a.minDownloads} TO *]`);for(let b of a.blockedCollections||[]){let g=String(b).trim();g&&m.push(`-collection:"${g}"`)}m.length&&(s=`(${t}) AND ${m.join(" AND ")}`)}let l=new URLSearchParams({q:s,output:"json",rows:1e4});for(let m of["identifier","title","downloads","runtime","collection","creator","format","licenseurl","rights","possible-copyright-status"])l.append("fl[]",m);let u=`https://archive.org/advancedsearch.php?${l}`,p=await fetch(u);if(!p.ok)throw new Error(`HTTP error! status: ${p.status}`);let v=await p.json(),y=[];if(v.response&&v.response.docs)for(let m of v.response.docs)m.identifier&&y.push({name:m.title||m.identifier,url:`https://archive.org/details/${m.identifier}`,_downloads:m.downloads,_runtime:m.runtime,_collection:m.collection,_creator:m.creator,_format:m.format,_rights:Si(m),_detailUrl:`https://archive.org/details/${m.identifier}`});if(o){let m=(a.blockedCollections||[]).map(b=>String(b).trim()).filter(Boolean);y=y.filter(b=>{if(a.minItemRuntimeSec>0&&b._runtime!=null){let g=ki(b._runtime);if(Number.isFinite(g)&&g<a.minItemRuntimeSec)return!1}return!(m.length&&b._collection&&(Array.isArray(b._collection)?b._collection:[b._collection]).some(f=>m.includes(f)))})}return r.mediaType==="video"&&(y=y.filter(m=>{let b=Array.isArray(m._format)?m._format:m._format?[m._format]:[];return!b.length||b.some(g=>Cs.test(g))}),y=As(y)),y}function As(t){let a=s=>{let o=parseInt(s._downloads,10);return Number.isFinite(o)?o:0},r=new Map,n=[];for(let s of t){let o=String(s.name||"").toLowerCase().replace(/\s+/g," ").trim();if(!o){n.push(s);continue}let l=r.get(o);(!l||a(s)>a(l))&&r.set(o,s)}return[...r.values(),...n].sort((s,o)=>a(o)-a(s))}var $s="https://archive.org/metadata/",Es=[".mp3",".m4a",".aac",".ogg",".oga",".opus",".webm",".weba",".flac",".wav"],Ts=[".mp4",".m4v",".ogv",".webm",".mov"],Cs=/(h\.?264|mpeg-?4|ogg\s*video|web ?m|quicktime|matroska)/i,Is=t=>t==="video"?Ts:Es,Ps=t=>new RegExp("("+t.map(a=>"\\"+a).join("|")+")$","i");function Ds(t){return t.source==="derivative"&&t.original?t.original:t.name}function Us(t,a){for(let r of a){let n=t.find(s=>s.name&&s.name.toLowerCase().endsWith(r));if(n)return n}return null}var xi={NOT_IN_COPYRIGHT:"Public domain",PUBLIC_DOMAIN:"Public domain",IN_COPYRIGHT:"In copyright",UNKNOWN:"Rights unknown"};function Ms(t){let a=/creativecommons\.org\/(licenses|publicdomain)\/([a-z0-9-]+)(?:\/([0-9.]+))?/i.exec(t||"");if(!a)return"";let r=a[2].toLowerCase();return a[1].toLowerCase()==="publicdomain"||r==="zero"||r==="mark"?"Public domain (CC)":`CC ${r.toUpperCase()}${a[3]?" "+a[3]:""}`}function Rs(t,a,r){let n=Ms(t);return n||(r&&xi[r]?xi[r]:a?a.length>70?a.slice(0,67)+"\u2026":a:r?r.replace(/_/g," ").toLowerCase():t?"Licensed (see IA)":"")}function Si(t){if(!t)return null;let a=l=>Array.isArray(l)?l[0]:l,r=a(t.licenseurl)||"",n=(a(t.rights)||"").toString().trim(),s=a(t["possible-copyright-status"])||"",o=Rs(r,n,s);return o?{label:o,licenseUrl:r,rights:n,status:s}:null}async function Li(t,a=null,r={}){if(!t)return[];let n=Is(r.mediaType),s=Ps(n),o=await fetch(`${$s}${t}`);if(!o.ok)throw new Error(`IA metadata ${o.status} for ${t}`);let l=await o.json();if(!l.metadata)throw new Error(`Empty metadata for ${t}`);let u=l.metadata||{};if(u["access-restricted-item"]==="true"||u["access-restricted"]==="true"||u.is_dark==="true")return[];let v=Si(u),y=`https://archive.org/details/${t}`,m=l.files||[],b=new Map;for(let F of m){if(!F.name||!s.test(F.name)||F.private==="true")continue;let j=Ds(F);b.has(j)||b.set(j,[]),b.get(j).push(F)}let g=Array.isArray(u.creator)?u.creator[0]:u.creator,f=g?String(g).trim():"",D=/^(various(\s+artists?)?|v\.?a\.?)$/i.test(f)?"":f,I=[];for(let F of b.values()){let j=Us(F,n);if(!j)continue;let ce=j.length||F.find(C=>C.length)?.length,ne=j.title||F.find(C=>C.title)?.title,xe=j.bitrate||F.find(C=>C.bitrate)?.bitrate,ze=j.artist||j.creator||F.find(C=>C.artist)?.artist||F.find(C=>C.creator)?.creator||"",Ke=String(ze).trim()||D;I.push({url:`https://archive.org/download/${t}/${encodeURIComponent(j.name)}`,name:ne||j.name.replace(/\.[^.]+$/,""),time:Ns(ce),artist:Ke,_rights:v,_detailUrl:y,_lengthSec:ki(ce),_bitrate:xe!=null?parseFloat(xe):NaN})}return a?I.filter(F=>!(a.minTrackDurationSec>0&&Number.isFinite(F._lengthSec)&&F._lengthSec<a.minTrackDurationSec||a.minTrackBitrateKbps>0&&Number.isFinite(F._bitrate)&&F._bitrate<a.minTrackBitrateKbps)):I}function Ns(t){if(!t)return"";if(/^\d+:\d+/.test(t))return t.split(":").slice(-2).join(":");let a=parseFloat(t);if(!isFinite(a))return"";let r=Math.floor(a/60),n=Math.floor(a%60);return`${r}:${n.toString().padStart(2,"0")}`}import{Namespace as Fe,graph as _t,Fetcher as Dr,sym as R,st as P,literal as Q,UpdateManager as _i,parse as Bt}from"rdflib";function za(t,a={}){let r=a.element||Fs(),n=a.tag||a.element&&typeof a.element.getAttribute=="function"&&a.element.getAttribute("side")||"default";if(r&&typeof r.fetchFor=="function")try{let o=r.fetchFor(t,n);if(typeof o=="function")return o}catch{}let s=typeof window<"u"&&window.SolidWebComponents?.adoptedFetch;return typeof s=="function"?s:typeof globalThis.fetch=="function"?globalThis.fetch.bind(globalThis):void 0}function Fs(){return typeof document>"u"?null:document.querySelector("sol-login")}var Bl=5*60*1e3;var st=Fe("http://www.w3.org/2004/02/skos/core#"),lt=Fe("http://www.w3.org/2000/01/rdf-schema#"),oe=Fe("http://www.w3.org/1999/02/22-rdf-syntax-ns#"),ft=Fe("http://www.w3.org/2001/XMLSchema#"),O=Fe("http://purl.org/dc/terms/"),ye=Fe("http://xmlns.com/foaf/0.1/"),J=Fe("http://purl.org/ontology/mo/"),se=Fe("http://www.w3.org/ns/dcat#"),q=Fe("http://schema.org/"),Rr=Fe("http://www.w3.org/ns/oa#"),Je=Fe("http://www.w3.org/ns/solid/terms#"),zs=Fe("http://purl.org/dc/dcmitype/"),Fr=J("MusicArtist"),jt=J("Release"),Ur=J("Track"),qt=q("MusicPlaylist"),Bs=J("Genre");function $e(t){let a=new URL("./",t);return{libraryDoc:R(t),agentsDoc:R(new URL("agents.ttl",a).href),genresDoc:R(new URL("genres.ttl",a).href),releasesDoc:R(new URL("releases.ttl",a).href),releasesIndexDoc:R(new URL("releases.ttl",a).href),releasesCatalog:R(new URL("releases.ttl",a).href+"#it"),playlistsDoc:R(new URL("playlists.ttl",a).href),playlistsCatalog:R(new URL("playlists.ttl",a).href+"#it"),releasesDirUrl:new URL("releases/",a).href,playlistsDirUrl:new URL("playlists/",a).href,musicRootUri:new URL("genres.ttl",a).href+"#Music"}}function zr(t){return String(t).trim().replace(/[^\w]+/g,"_").replace(/^_+|_+$/g,"").slice(0,80)||"Playlist"}function js(t,a,r){let n=$e(a),s=n.libraryDoc,o=new Set;for(let v of t.match(n.playlistsCatalog,se("dataset"),null))o.add(v.object.value.split("#")[0]);for(let v of t.match(s,lt("seeAlso"),null))o.add(v.object.value);let l=zr(r),u=n.playlistsDirUrl+l,p=1;for(;o.has(u);)u=n.playlistsDirUrl+l+"_"+p,p++;return u.slice(n.playlistsDirUrl.length)}function qs(t,a,r,n){let s=new Set(n||[]);for(let p of t.match(a.releasesCatalog,se("dataset"),null))s.add(p.object.value.split("#")[0]);for(let p of t.match(a.releasesDoc,lt("seeAlso"),null))s.add(p.object.value);let o=zr(r).toLowerCase()||"release",l=a.releasesDirUrl+o,u=1;for(;s.has(l);)l=a.releasesDirUrl+o+"_"+u++;return l}function qa(t,a,r){let n="/"+String(a)+"/",s=(String(r).match(/\//g)||[]).length,o=s?"../".repeat(s):"./";return String(t).replace(/<(https?:\/\/[^>\s]+)>/g,(l,u)=>{let p=u.indexOf(n);if(p<0)return l;let v=u.slice(p+n.length);return v?`<${o}${v}>`:l})}var Br="omp-spine-v1",Os=7*24*60*60*1e3,Oa=()=>typeof caches<"u";async function Hs(t){if(!Oa())return null;try{let a=await caches.open(Br),r=await a.match(t);if(!r)return null;let n=Number(r.headers.get("x-omp-cached-at")||0);return n&&Date.now()-n>Os?(a.delete(t),null):await r.text()}catch{return null}}async function Gs(t,a,r="text/turtle"){if(!(!Oa()||a==null))try{await(await caches.open(Br)).put(t,new Response(a,{headers:{"Content-Type":r,"x-omp-cached-at":String(Date.now())}}))}catch{}}function Nr(...t){Oa()&&caches.open(Br).then(a=>{for(let r of t)r&&a.delete(String(r).split("#")[0]).catch(()=>{})}).catch(()=>{})}async function $i(t,{shared:a=!1,lazyReleases:r=!1,lazyPlaylists:n=!1}={}){let s=a?we.store:_t(),o=a?we.storeFetcher:new Dr(s),l=new URL(t,window.location.href).href,u=(()=>{try{let m=$e(l);return{releases:m.releasesDoc.value,playlists:m.playlistsDoc.value}}catch{return{}}})(),p=u.releases||null,v=a&&Oa();async function y(m){let b=String(m).split("#")[0];if(!(a&&we.isLoaded(b))){if(v){let g=await Hs(b);if(g!=null)try{Bt(g,s,b,"text/turtle"),we.markLoaded(b);return}catch{}}if(await o.load(b),a&&we.markLoaded(b),v)try{let g=we.serialize(R(b),s,b,"text/turtle");typeof g=="string"&&g.length&&await Gs(b,g)}catch{}}}try{await y(l);let m=8,b=new Set([l]),g=D=>{let I=[R(D),R(D.split("#")[0]+"#it")],F=D.split("#")[0],ce=r&&p&&F===p||n&&u.playlists&&F===u.playlists?[se("catalog"),se("themeTaxonomy")]:[lt("seeAlso"),se("dataset"),se("catalog"),se("themeTaxonomy")],ne=[];for(let xe of I)for(let ze of ce)for(let Ke of s.match(xe,ze,null))try{ne.push(new URL(Ke.object.value,D).href.split("#")[0])}catch{}return ne.filter(xe=>xe&&!b.has(xe)&&!/\.(meta|acl)$/i.test(xe))},f=g(l);for(;f.length;){let D=[];for(let I=0;I<f.length;I+=m){let F=f.slice(I,I+m).filter(j=>b.has(j)?!1:(b.add(j),!0));await Promise.all(F.map(async j=>{try{await y(j),D.push(...g(j))}catch(ce){console.warn("seeAlso load failed:",j,ce)}}))}f=D.filter(I=>!b.has(I))}return{store:s,baseURI:l,fetcher:o,loadDocs:async D=>{let I=[...new Set((D||[]).map(j=>j&&j.split("#")[0]))].filter(j=>j&&(a?!we.isLoaded(j):!b.has(j))),F=0;for(let j=0;j<I.length;j+=m){let ce=I.slice(j,j+m).filter(ne=>b.has(ne)?!1:(b.add(ne),!0));await Promise.all(ce.map(async ne=>{try{a&&we.isLoaded(ne)||(await o.load(ne),a&&we.markLoaded(ne)),F++}catch(xe){console.warn("lazy doc load failed:",ne,xe)}}))}return F}}}catch(m){throw console.error("Error loading RDF:",m),m}}async function Ei(t,a){let r=_t(),n=async o=>{let l=await t(o,{headers:{Accept:"text/turtle"}});if(!l||l.ok===!1)throw new Error(`fetch ${o} \u2192 ${l&&l.status}`);let u=await l.text(),p=(l.headers?.get?.("Content-Type")||"text/turtle").split(";")[0].trim();Bt(u,r,o.split("#")[0],p||"text/turtle")};await n(a);let s=r.any(R(a),Je("publicTypeIndex"))?.value||r.match(null,Je("publicTypeIndex"),null)[0]?.object?.value||null;if(!s)return{url:null,typeIndex:null,reason:"no solid:publicTypeIndex on profile"};await n(s);for(let o of r.match(null,Je("forClass"),J("Release"))){let l=r.any(o.subject,Je("instance"))?.value;if(l)return{url:l,typeIndex:s};let u=r.any(o.subject,Je("instanceContainer"))?.value;if(u)return{url:new URL("index.ttl",u).href,typeIndex:s}}return{url:null,typeIndex:s,reason:"no mo:Release TypeRegistration"}}async function jr(t,a){let r=_t(),n=await t(a,{headers:{Accept:"text/turtle"}});if(n&&n.ok!==!1){let u=(n.headers?.get?.("Content-Type")||"text/turtle").split(";")[0].trim();Bt(await n.text(),r,a.split("#")[0],u||"text/turtle")}let s=Fe("http://www.w3.org/ns/pim/space#"),o=[],l=u=>{if(!u)return;let p=u.endsWith("/")?u:u+"/";o.includes(p)||o.push(p)};for(let u of r.match(R(a),s("storage"),null))l(u.object?.value);for(let u of r.match(null,s("storage"),null))l(u.object?.value);return l(new URL("/",a).href),o}async function Ba(t,a,r){let n=await t(a,{method:"PATCH",headers:{"Content-Type":"application/sparql-update"},body:r});if(!n||n.ok===!1)throw new Error(`PATCH ${a} \u2192 ${n&&n.status}`)}async function Ti(t,a){let r="http://www.w3.org/ns/solid/terms#",n=Fe("http://www.w3.org/ns/pim/space#"),s=_t();try{let v=await t(a,{headers:{Accept:"text/turtle"}});if(v&&v.ok!==!1){let y=(v.headers?.get?.("Content-Type")||"text/turtle").split(";")[0].trim();Bt(await v.text(),s,a.split("#")[0],y||"text/turtle")}}catch{}let o=s.any(R(a),Je("publicTypeIndex"))?.value||s.match(null,Je("publicTypeIndex"),null)[0]?.object?.value||null;if(o)return o;let l=s.any(R(a),n("storage"))?.value||s.match(null,n("storage"),null)[0]?.object?.value||new URL("/",a).href,u=l.endsWith("/")?l:l+"/",p=new URL("settings/publicTypeIndex.ttl",u).href;try{let v=await t(p,{method:"PUT",headers:{"Content-Type":"text/turtle"},body:`@prefix solid: <${r}>.
<${p}> a solid:TypeIndex, solid:ListedDocument.
`});return!v||v.ok===!1?null:(await Ba(t,a.split("#")[0],`INSERT DATA { <${a}> <${r}publicTypeIndex> <${p}> . }`),p)}catch{return null}}function Ci(t,a){let r=String(a||"").replace(/[^A-Za-z0-9_-]/g,"-")||"lib";return`${t.split("#")[0]}#omp-lib-${r}`}async function Ii(t,a){let r=_t(),n=async u=>{let p=await t(u,{headers:{Accept:"text/turtle"}});if(!p||p.ok===!1)throw new Error(`fetch ${u} \u2192 ${p&&p.status}`);let v=(p.headers?.get?.("Content-Type")||"text/turtle").split(";")[0].trim();Bt(await p.text(),r,u.split("#")[0],v||"text/turtle")};await n(a);let s=r.any(R(a),Je("publicTypeIndex"))?.value||r.match(null,Je("publicTypeIndex"),null)[0]?.object?.value||null;if(!s)return{typeIndex:null,libraries:[]};await n(s);let o=[],l=new Set;for(let u of r.match(null,Je("forClass"),J("Release"))){let p=r.any(u.subject,Je("instance"))?.value;if(!p||l.has(p))continue;l.add(p);let v=r.any(u.subject,lt("label"))?.value||r.any(u.subject,O("title"))?.value||"";o.push({url:p,label:v,reg:u.subject.value})}return{typeIndex:s,libraries:o}}async function Ha(t,a,{id:r,url:n,label:s}){if(!a||!n)throw new Error("registerPodLibrary: typeIndex and url required");let o="http://www.w3.org/ns/solid/terms#",l=Ci(a,r),u=(s||"").replace(/[\\"]/g,"\\$&");await Ba(t,a,`DELETE { <${l}> ?p ?o } INSERT { <${l}> a <${o}TypeRegistration> ; <${o}forClass> <http://purl.org/ontology/mo/Release> ; <${o}instance> <${n}> ; <http://www.w3.org/2000/01/rdf-schema#label> "${u}" . } WHERE { OPTIONAL { <${l}> ?p ?o } }`)}async function Pi(t,a,{id:r,url:n}){if(!a)throw new Error("unregisterPodLibrary: typeIndex required");let s="http://www.w3.org/ns/solid/terms#",o=Ci(a,r);await Ba(t,a,`DELETE { <${o}> ?p ?o } WHERE { <${o}> ?p ?o }`),n&&await Ba(t,a,`DELETE { ?r ?p ?o } WHERE { ?r <${s}forClass> <http://purl.org/ontology/mo/Release> ; <${s}instance> <${n}> ; ?p ?o . }`)}function qr(t){return t+"#Favorites"}var Or=[Fr,J("MusicGroup"),J("SoloMusicArtist"),J("Label"),ye("Agent"),ye("Organization"),ye("Person"),ye("Group")],Ai={audio:{nodeTypes:Or,nameProp:ye("name"),genreProp:J("genre")},video:{nodeTypes:[q("Collection")],nameProp:q("name"),genreProp:q("genre")}},Ks=t=>Ai[t]||Ai.audio;function Di(t,a){let r=R(a.split("#")[0]+"#it"),n=t.any(r,O("type"))||t.any(R(a),O("type"));return n&&n.value===zs("MovingImage").value?"video":"audio"}function Ws(t,a=Or){let r=new Set,n=[];for(let s of a)for(let o of t.match(null,oe("type"),s)){let l=o.subject.value;r.has(l)||(r.add(l),n.push(o.subject))}return n}function Hr(t,a,r="audio"){let n=$e(a),s=Ks(r),o=R(a.split("#")[0]+"#it"),u=t.any(o,se("themeTaxonomy"))||t.any(R(a),se("themeTaxonomy"))||R(n.musicRootUri),p=t.match(null,st("topConceptOf"),u).map(y=>({id:y.subject.value,label:t.any(y.subject,st("prefLabel"))?.value||"Unnamed Genre"})),v=[];for(let y of Ws(t,s.nodeTypes)){let m=t.any(y,s.genreProp)?.value;if(!m)continue;let b=t.any(y,O("source"));v.push({node:y,label:t.any(y,s.nameProp)?.value||"Untitled",topic:m,url:t.any(y,se("landingPage"))?.value||null,source:null,sourcePlaylist:b?b.value:null,localData:!!b})}for(let y of t.match(null,oe("type"),qt)){let m=y.subject,b=t.match(m,q("itemListElement"),null).map(g=>{let f=parseInt(t.any(g.object,q("position"))?.value,10);return{track:t.any(g.object,q("item")),pos:Number.isFinite(f)?f:Number.MAX_SAFE_INTEGER}}).filter(g=>g.track).sort((g,f)=>g.pos-f.pos);for(let{track:g}of b){let f=t.any(g,O("isPartOf"))||null,S=t.any(g,O("title"))?.value||"",D=f&&t.any(f,O("title"))?.value||"",I=t.any(g,ye("maker"))||(f?t.any(f,ye("maker")):null),F=I?I.termType==="Literal"?I.value:t.any(I,ye("name"))?.value||"":"",j=t.any(g,J("item"))?.value,ce=f&&t.any(f,se("landingPage"))?.value||null,ne=[F,D,S].filter(Boolean),xe=ne.length?ne.join(" \u2014 "):S||"Untitled";v.push({node:g,label:xe,topic:m.value,url:j||null,source:ce,artist:F,album:D,name:S})}}return{genres:p,bookmarks:v}}function Gr(t,a){let r=a?new URL("./",a).href:null,n=new Set,s=[];for(let o of t.match(null,oe("type"),qt)){let l=o.subject;if(r&&!l.value.startsWith(r)||n.has(l.value))continue;n.add(l.value);let u=t.any(l,O("title"))?.value||t.any(l,lt("label"))?.value||l.value.replace(/^.*\//,"")||"Untitled playlist",p=t.any(l,ye("maker"))?.value||"",v=t.any(l,O("description"))?.value||"",y=t.any(l,Rr("styleClass")),m=t.match(null,O("source"),l)[0]?.subject;s.push({id:l.value,name:u,maker:p,description:v,hidden:y?y.value==="hidden":!1,artistNode:m||null,label:p?`${u} (${p})`:u})}return s}var At=!1;function Kr(t){At=!!t;try{console.info("[omp] setSolidWriteAuthed \u2192",At)}catch{}}try{typeof globalThis<"u"&&(globalThis.__OMP=globalThis.__OMP||{},globalThis.__OMP.writeAuthed=()=>At,globalThis.__OMP.isRdfStore=t=>t===we.store)}catch{}function Vs(t){if(t===we.store&&we.storeFetcher&&t.fetcher!==we.storeFetcher&&(t.fetcher=we.storeFetcher),!t.updater)try{new _i(t)}catch{}return t.updater}async function _e(t,a,r,n){r=r||[],n=n||[];try{console.info("[omp] runUpdate path:",t===we.store&&At?"pod-bypass":t===we.store?"UpdateManager (rdf.store but NOT authed-flag)":"UpdateManager (private store)","\xB7 isRdfStore="+(t===we.store)+" solidWriteAuthed="+At)}catch{}if(t===we.store&&At){let u=new Map,p=(y,m)=>{let b=y&&y.why&&y.why.value;b&&(u.has(b)||u.set(b,{del:[],ins:[]}),u.get(b)[m].push(y))};for(let y of r)p(y,"del");for(let y of n)p(y,"ins");if(!u.size)return{ok:!0,err:null};let v=y=>`${y.subject.toNT()} ${y.predicate.toNT()} ${y.object.toNT()} .`;for(let[y,m]of u){let b=[];m.del.length&&b.push(`DELETE DATA {
${m.del.map(v).join(`
`)}
}`),m.ins.length&&b.push(`INSERT DATA {
${m.ins.map(v).join(`
`)}
}`);let g=b.join(` ;
`);try{let S=await za(y)(y,{method:"PATCH",headers:{"Content-Type":"application/sparql-update"},body:g});if(!S||S.ok===!1){let D=`PATCH ${y} \u2192 ${S&&S.status}`;return console.warn("Persistence failed (store NOT updated):",D),{ok:!1,err:D}}}catch(f){let S=f&&(f.message||String(f));return console.warn("Persistence failed (store NOT updated):",S),{ok:!1,err:S}}Nr(y);for(let f of m.del)t.remove(f);for(let f of m.ins)t.add(f.subject,f.predicate,f.object,f.why)}return{ok:!0,err:null}}let s=Vs(t);if(!s)return{ok:!1,err:"no UpdateManager available"};let o=()=>new Promise(u=>{try{s.update(r,n,(p,v,y)=>{u({ok:v,err:v?null:y})})}catch(p){u({ok:!1,err:p.message})}}),l=await o();if(!l.ok&&/uneditable|editing protocol|make changes/i.test(String(l.err))){let u=ua(t),p=new Set;for(let v of[...r,...n]){let y=v&&v.why;y&&y.value&&p.add(y.value)}for(let v of p)try{await u.load(v,{force:!0})}catch(y){console.warn("force-load failed",v,y?.message||y)}l=await o()}if(l.ok){let u=new Set;for(let p of[...r,...n]){let v=p&&p.why&&p.why.value;v&&u.add(v)}Nr(...u)}else console.warn("Persistence failed (store NOT updated):",l.err);return l}function ua(t){return t===we.store?we.storeFetcher:(t.fetcher||(t.fetcher=new Dr(t)),t.fetcher)}async function Ui(t,a,r,{body:n,contentType:s}={}){try{let o;if(t===we.store&&At){let u={method:a};n!=null&&(u.body=n),s&&(u.headers={"Content-Type":s}),o=await za(r)(r,u)}else{let u=n!=null?{body:n,contentType:s}:{};o=await ua(t).webOperation(a,r,u)}let l=o.ok!==!1;return l&&Nr(r),{ok:l,err:l?null:`${a} ${o.status}`}}catch(o){return{ok:!1,err:o.message||String(o)}}}async function Ga(t,a,r,n="text/turtle"){return Ui(t,"PUT",a,{body:r,contentType:n})}async function fa(t,a){return Ui(t,"DELETE",a)}function Ge(t){return'"'+String(t).replace(/\\/g,"\\\\").replace(/"/g,'\\"')+'"'}async function Mi(t,{title:a="New library"}={}){let r=t.endsWith("/")?t:t+"/",n=_t(),s={"index.ttl":`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

<>
    a <#Library>, dcat:Catalog ;
    dct:title ${Ge(a)} .

<#it>
    a dcat:Catalog ;
    dct:title ${Ge(a)} ;
    dcat:catalog <./releases.ttl#it>, <./playlists.ttl#it> ;
    dcat:dataset <./agents.ttl#it> ;
    dcat:themeTaxonomy <./genres.ttl#Music> .
`,"agents.ttl":`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .

<#it>
    a dcat:Dataset ;
    dct:title "Artists" .
`,"genres.ttl":`@prefix skos: <http://www.w3.org/2004/02/skos/core#> .

<#Music>
    a skos:ConceptScheme ;
    skos:prefLabel "Music" .
`,"releases.ttl":`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

<#it>
    a dcat:Catalog ;
    dct:title ${Ge(a+" \u2014 releases")} .
`,"playlists.ttl":`@prefix dct: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .

<#it>
    a dcat:Catalog ;
    dct:title ${Ge(a+" \u2014 playlists")} .
`};for(let[o,l]of Object.entries(s)){let u=await Ga(n,r+o,l);if(!u.ok)return{ok:!1,err:`PUT ${o}: ${u.err}`,url:r+"index.ttl"}}return{ok:!0,url:r+"index.ttl"}}function Ri(t,a){let r=a?Ot(a):null,n=new Set;for(let s of t.match(null,oe("type"),qt)){let o=s.subject.value.split("#")[0];o&&o!==r&&n.add(o)}return[...n]}function Ka(t,a){let r=new Set((a||[]).map(s=>s.split("#")[0])),n=new Set;for(let s of t.match(null,q("item"),null)){let o=s.why&&s.why.value;if(!o||!r.has(o.split("#")[0]))continue;let l=s.object&&s.object.value;l&&n.add(l.split("#")[0])}return[...n]}function Ni(t,a){let r=$e(a),n=new Set;for(let s of t.match(r.releasesCatalog,se("dataset"),null))s.object?.value&&n.add(s.object.value.split("#")[0]);for(let s of t.match(r.releasesDoc,lt("seeAlso"),null))s.object?.value&&n.add(s.object.value.split("#")[0]);return[...n]}function Wr(t,a){let r=$e(a),n=new Set;for(let s of t.match(r.playlistsCatalog,se("dataset"),null))s.object?.value&&n.add(s.object.value.split("#")[0]);for(let s of t.match(r.playlistsDoc,lt("seeAlso"),null))s.object?.value&&n.add(s.object.value.split("#")[0]);return[...n]}async function Vr(t,a,r,n){let s=a.endsWith("/")?a:a+"/",o=0,l=0,u=[],p=0;for(let v of r){p++,n?.(p,r.length,v.relPath);let y=s+v.relPath;if(v.skipIfExists)try{let m=await t(y,{method:"HEAD"});if(m&&m.status===200){l++;continue}}catch{}try{let m=await t(y,{method:"PUT",headers:{"Content-Type":v.contentType||"text/turtle"},body:v.body}),b=!!m&&m.ok===!0,g=b?"2xx":"";if(!b&&m)try{let f=await t(y,{method:"GET",headers:{Accept:"*/*"}});b=!!f&&(f.ok===!0||f.status===304),g=`verified-get(${f?f.status:"no-resp"})`}catch(f){g=`verify-threw(${f.message||f})`}if(b)o++;else{let f="";try{f=(await m.text()).slice(0,120)}catch{}let S=`${v.relPath} \u2192 ${m?`${m.status} ${m.type||""}`:"no response"} [${g}] ${f}`.trim();u.push(S),console.warn("[install] PUT FAIL",S)}}catch(m){let b=`${v.relPath}: ${m.message||m}`;u.push(b),console.warn("[install] PUT THREW",b)}}return{ok:u.length===0,put:o,skipped:l,failed:u}}function ja(t,a,r){return(t.statementsMatching(a,null,null)[0]||t.statementsMatching(null,null,a)[0])?.why||r}function Fi(t,a){if(!a)return null;for(let r of t.match(null,ye("name"),Q(a)))for(let n of Or)if(t.holds(r.subject,oe("type"),n))return r.subject;return null}async function zi(t,a,r){let n=$e(a),s=n.genresDoc,o=zr(r),l=s.value+"#"+o,u=1;for(;t.any(R(l),null,null);)l=s.value+"#"+o+"_"+u,u++;let p=R(l),v=R(n.musicRootUri),y=[P(p,oe("type"),st("Concept"),s),P(p,oe("type"),Bs,s),P(p,st("prefLabel"),Q(r),s),P(p,st("topConceptOf"),v,s)];return{...await _e(t,s.value,[],y),id:l,label:r}}async function Bi(t,a,r){let n=$e(a),s=n.genresDoc,o=n.agentsDoc,l=R(r),u=t.match(l,null,null).map(y=>P(y.subject,y.predicate,y.object,s)),p=await _e(t,s.value,u,[]);if(!p.ok)return p;let v=t.match(null,J("genre"),l).map(y=>y.subject);if(v.length){let y=[];for(let b of v)for(let g of t.match(b,null,null))y.push(P(g.subject,g.predicate,g.object,o));let m=await _e(t,o.value,y,[]);if(!m.ok)return m}return{ok:!0}}async function ji(t,a,r,n){let o=$e(a).genresDoc,l=R(r),u=t.any(l,st("prefLabel")),p=u?[P(l,st("prefLabel"),u,o)]:[],v=[P(l,st("prefLabel"),Q(n),o)];return _e(t,o.value,p,v)}async function qi(t,a,r,n,s){let l=$e(a).agentsDoc,u=crypto.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`,p=R(`urn:uuid:${u}`),v=[P(p,oe("type"),Fr,l),P(p,ye("name"),Q(n),l),P(p,J("genre"),R(r),l)];return s&&v.push(P(p,se("landingPage"),R(s),l)),{...await _e(t,l.value,[],v),node:p}}async function Oi(t,a,r){let s=$e(a).agentsDoc,o=t.match(r,null,null).map(l=>P(l.subject,l.predicate,l.object,s));return _e(t,s.value,o,[])}async function Yr(t,a,r,n){let o=$e(a).agentsDoc,l=t.any(r,ye("name")),u=l?[P(r,ye("name"),l,o)]:[],p=[P(r,ye("name"),Q(n),o)];return _e(t,o.value,u,p)}async function Jr(t,a,r){typeof r=="string"&&(r={name:r});let{name:n="Untitled playlist",maker:s="",description:o=""}=r||{},l=$e(a),u=js(t,a,n),p=l.playlistsDirUrl+u,v=["@prefix dct: <http://purl.org/dc/terms/> .","@prefix dcat: <http://www.w3.org/ns/dcat#> .","@prefix foaf: <http://xmlns.com/foaf/0.1/> .","@prefix schema: <http://schema.org/> .","","<>","    a schema:ItemList, schema:MusicPlaylist, dcat:Dataset ;","    dct:isPartOf <../playlists.ttl#it> ;","    schema:itemListOrder schema:ItemListOrderAscending ;",`    dct:title ${Ge(n)}`];s&&v.push(`    ; foaf:maker ${Ge(s)}`),o&&v.push(`    ; dct:description ${Ge(o)}`),v.push("    .","");let y=v.join(`
`),m=s?`${n} (${s})`:n,b=await Ga(t,p,y);if(!b.ok)return{ok:!1,err:b.err,id:p,label:m};let g=P(l.playlistsCatalog,se("dataset"),R(p),l.playlistsDoc),f=await _e(t,l.playlistsDoc.value,[],[g]);if(!f.ok)return await fa(t,p),{...f,id:p,label:m};try{await ua(t).load(p,{force:!0})}catch(D){console.warn("Could not reload new playlist file for protocol detection:",D)}let S=R(p);return t.add(S,oe("type"),q("ItemList"),S),t.add(S,oe("type"),qt,S),t.add(S,oe("type"),se("Dataset"),S),t.add(S,q("itemListOrder"),q("ItemListOrderAscending"),S),t.add(S,O("isPartOf"),l.playlistsCatalog,S),t.add(S,O("title"),Q(n),S),s&&t.add(S,ye("maker"),Q(s),S),o&&t.add(S,O("description"),Q(o),S),{ok:!0,id:p,label:m,name:n,maker:s,description:o}}function Ot(t){return $e(t).playlistsDirUrl+"deleted"}async function Ys(t,a){let r=$e(a),n=Ot(a),s=R(n);if(t.holds(s,oe("type"),qt))return{ok:!0,id:n};let o=["@prefix dct: <http://purl.org/dc/terms/> .","@prefix dcat: <http://www.w3.org/ns/dcat#> .","@prefix schema: <http://schema.org/> .","","<>","    a schema:ItemList, schema:MusicPlaylist, dcat:Dataset ;","    dct:isPartOf <../playlists.ttl#it> ;","    schema:itemListOrder schema:ItemListOrderAscending ;",'    dct:title "Deleted" .',""].join(`
`),l=await Ga(t,n,o);if(!l.ok)return{ok:!1,err:l.err,id:n};let u=P(r.playlistsCatalog,se("dataset"),s,r.playlistsDoc),p=await _e(t,r.playlistsDoc.value,[],[u]);if(!p.ok)return await fa(t,n).catch(()=>{}),{...p,id:n};try{await ua(t).load(n,{force:!0})}catch(v){console.warn("Could not reload Deleted-bin file for protocol detection:",v)}return t.add(s,oe("type"),q("ItemList"),s),t.add(s,oe("type"),qt,s),t.add(s,oe("type"),se("Dataset"),s),t.add(s,q("itemListOrder"),q("ItemListOrderAscending"),s),t.add(s,O("isPartOf"),r.playlistsCatalog,s),t.add(s,O("title"),Q("Deleted"),s),{ok:!0,id:n}}async function Hi(t,a,r,n={}){let s=R(r),o=[],l=[];if(n.name!=null){for(let u of[O("title"),lt("label"),st("prefLabel")]){let p=t.any(s,u);p&&o.push(P(s,u,p,s))}l.push(P(s,O("title"),Q(n.name),s))}if(n.maker!=null){for(let u of t.match(s,ye("maker"),null))o.push(P(u.subject,u.predicate,u.object,s));n.maker&&l.push(P(s,ye("maker"),Q(n.maker),s))}if(n.description!=null){for(let u of t.match(s,O("description"),null))o.push(P(u.subject,u.predicate,u.object,s));n.description&&l.push(P(s,O("description"),Q(n.description),s))}return!o.length&&!l.length?{ok:!0}:_e(t,s.value,o,l)}async function Gi(t,a,r){let n=$e(a),s=R(r),o=Ot(a);if(r!==o){let p=[];for(let v of t.match(s,q("itemListElement"),null)){let y=t.any(v.object,q("item"));if(!y)continue;let m=t.any(y,J("item"))?.value;if(!m)continue;let b=t.any(y,O("isPartOf"))||t.match(null,J("track"),y)[0]?.subject;p.push({url:m,source:b&&t.any(b,se("landingPage"))?.value||null,name:t.any(y,O("title"))?.value||"",album:b&&t.any(b,O("title"))?.value||""})}if(p.length){let v=await Ys(t,a);if(!v.ok)return v;let y=await Wa(t,a,o,p);if(!y.ok)return y}}let l=P(n.playlistsCatalog,se("dataset"),s,n.playlistsDoc),u=await _e(t,n.playlistsDoc.value,[l],[]);if(!u.ok)return u;await fa(t,r).catch(()=>{});for(let p of t.match(s,null,null))t.remove(p);for(let p of t.match(null,null,s))t.remove(p);return{ok:!0}}async function Wa(t,a,r,n,s={}){if(!n||!n.length)return{ok:!0,nodes:[],skipped:0};let o=$e(a),l=R(r),u=!!s.inlineTracks,p=L=>String(L).padStart(2,"0"),v=new Set;for(let L of t.match(l,q("itemListElement"),null)){let M=t.any(L.object,q("item")),K=M&&t.any(M,J("item"))?.value;K&&v.add(K)}let y=new Set,m=n.filter(L=>!L||!L.url||v.has(L.url)||y.has(L.url)?!1:(y.add(L.url),!0)),b=n.length-m.length;if(!m.length)return{ok:!0,nodes:[],added:[],skipped:b};if(u){let ue=function(Y,Ee,Be){if(!Y&&!Ee)return null;if(Y&&K.has(Y))return K.get(Y);if(Y&&le.has(Y))return le.get(Y).node;M+=1;let Te=R(`${l.value}#a${p(M)}`),We=[P(Te,oe("type"),jt,l)];return Ee&&We.push(P(Te,O("title"),Q(Ee),l)),Y&&We.push(P(Te,se("landingPage"),R(Y),l)),Be&&We.push(P(Te,ye("maker"),Q(Be),l)),le.set(Y||`__nolp:${Te.value}`,{node:Te,inserts:We}),Te},L=0,M=0,K=new Map,X=Y=>Y&&Y.value&&Y.value.startsWith(l.value+"#");for(let Y of t.match(l,q("itemListElement"),null)){let Ee=t.any(Y.object,q("item"));if(X(Ee)){let Te=Ee.value.match(/#t(\d+)$/);Te&&(L=Math.max(L,parseInt(Te[1],10)))}let Be=Ee&&t.any(Ee,O("isPartOf"));if(X(Be)){let Te=Be.value.match(/#a(\d+)$/);Te&&(M=Math.max(M,parseInt(Te[1],10)));let We=t.any(Be,se("landingPage"))?.value;We&&K.set(We,Be)}}let le=new Map,ve=0,ke=0;for(let Y of t.match(l,q("itemListElement"),null)){let Ee=parseInt(t.any(Y.object,q("position"))?.value,10);Number.isFinite(Ee)&&(ve=Math.max(ve,Ee));let Be=Y.object.value.match(/#e(\d+)$/);Be&&(ke=Math.max(ke,parseInt(Be[1],10)))}let he=[],re=[],mt=[];m.forEach((Y,Ee)=>{let Be=Y.album||"",Te=Y.artist||"",We=Y.source||null,ha=ue(We,Be,Te);L+=1;let Xe=R(`${l.value}#t${p(L)}`);he.push(P(Xe,oe("type"),Ur,l)),Y.name&&he.push(P(Xe,O("title"),Q(Y.name),l)),Te&&he.push(P(Xe,ye("maker"),Q(Te),l)),he.push(P(Xe,J("item"),R(Y.url),l));let ht=Mr(Y.time);Number.isFinite(ht)&&ht>0&&he.push(P(Xe,J("duration"),Q(String(ht),void 0,ft("decimal")),l)),ha&&he.push(P(Xe,O("isPartOf"),ha,l));let Et=R(`${l.value}#e${p(ke+Ee+1)}`);he.push(P(l,q("itemListElement"),Et,l),P(Et,oe("type"),q("ListItem"),l),P(Et,q("position"),Q(String(ve+Ee+1),void 0,ft("integer")),l),P(Et,q("item"),Xe,l)),re.push(Xe),mt.push(Y)});let tt=[];for(let Y of le.values())tt.push(...Y.inserts);let pa=[...tt,...he],ma=120;for(let Y=0;Y<pa.length;Y+=ma){let Ee=await _e(t,l.value,[],pa.slice(Y,Y+ma));if(!Ee.ok)return{...Ee,nodes:re,added:mt,skipped:b}}return{ok:!0,nodes:re,added:mt,skipped:b}}let g=new Map;for(let L of t.match(null,se("landingPage"),null)){if(!t.holds(L.subject,oe("type"),jt))continue;let M=ja(t,L.subject,o.releasesDoc);g.set(L.object.value,{releaseNode:L.subject,fileDoc:R(M.value)})}let f=new Map;for(let[L,M]of g)for(let K of t.match(M.releaseNode,J("track"),null)){let X=t.any(K.object,J("item"))?.value;X&&f.set(`${L}
${X}`,K.object)}let S=new Set,D=(L,M)=>{let K=L&&L.match(/archive\.org\/details\/(.+?)\/?$/);return K?decodeURIComponent(K[1]):M.split("/").pop().replace(/\$?\.ttl$/,"")},I=new Map,F=L=>{let M=I.get(L.fileDoc.value);if(M==null){M=0;for(let K of t.match(L.releaseNode,J("track"),null)){let X=K.object.value.match(/#t(\d+)$/);X&&(M=Math.max(M,parseInt(X[1],10)))}}return M+=1,I.set(L.fileDoc.value,M),L.fileDoc.value+"#t"+p(M)},j=new Map,ce=new Map,ne=[],xe=[];for(let L of m){let M=L.source||null,K=L.url,X=M?`${M}
${K}`:null,le=X?f.get(X):null;if(!le&&M&&g.has(M)){let ue=g.get(M);le=R(F(ue));let ve=ce.get(ue.fileDoc.value)||{fileDoc:ue.fileDoc,inserts:[]};ve.inserts.push(P(le,oe("type"),Ur,ue.fileDoc)),L.name&&ve.inserts.push(P(le,O("title"),Q(L.name),ue.fileDoc)),ve.inserts.push(P(le,J("item"),R(K),ue.fileDoc));let ke=Mr(L.time);Number.isFinite(ke)&&ke>0&&ve.inserts.push(P(le,J("duration"),Q(String(ke),void 0,ft("decimal")),ue.fileDoc)),ve.inserts.push(P(le,O("isPartOf"),ue.releaseNode,ue.fileDoc)),ve.inserts.push(P(ue.releaseNode,J("track"),le,ue.fileDoc)),ce.set(ue.fileDoc.value,ve),X&&f.set(X,le)}if(!le){let ue=M||`urn:nolp:${K}`,ve=j.get(ue);if(!ve){let ke=qs(t,o,L.album||L.name||"release",S);S.add(ke),ve={fileUrl:ke,lp:M,ident:D(M,ke),releaseNode:R(ke+"#it"),title:L.album||"(untitled album)",artist:L.artist||"",tracks:[]},j.set(ue,ve)}le=R(`${ve.fileUrl}#t${p(ve.tracks.length+1)}`),ve.tracks.push({node:le,name:L.name,dl:K,dur:Mr(L.time)}),X&&f.set(X,le)}ne.push(le),xe.push(L)}let ze=L=>({...L,nodes:ne,added:xe,skipped:b});for(let L of j.values()){let M=L.artist?Fi(t,L.artist):null,K=L.artist?M?`<${M.value}>`:Ge(L.artist):null,X=["a mo:Release, dcat:Dataset",`dct:title ${Ge(L.title)}`,`dct:identifier ${Ge(L.ident)}`,"dct:isPartOf <../releases.ttl#it>"];L.lp&&X.push(`dcat:landingPage <${L.lp}>`),X.push("mo:track "+L.tracks.map(re=>`<#t${p(L.tracks.indexOf(re)+1)}>`).join(", ")),K&&X.push(`foaf:maker ${K}`);let le=["@prefix dct: <http://purl.org/dc/terms/> .","@prefix mo: <http://purl.org/ontology/mo/> .","@prefix dcat: <http://www.w3.org/ns/dcat#> .","@prefix foaf: <http://xmlns.com/foaf/0.1/> .","",`<#it>
    `+X.join(` ;
    `)+" .",""];L.tracks.forEach((re,mt)=>{let tt=["a mo:Track",`dct:title ${Ge(re.name||"")}`];Number.isFinite(re.dur)&&re.dur>0&&tt.push(`mo:duration ${Ge(String(re.dur))}`),tt.push(`mo:item <${re.dl}>`),tt.push("dct:isPartOf <#it>"),le.push(`<#t${p(mt+1)}>
    `+tt.join(` ;
    `)+" .","")});let ue=await Ga(t,L.fileUrl,le.join(`
`));if(!ue.ok)return ze(ue);let ve=[P(o.releasesCatalog,se("dataset"),L.releaseNode,o.releasesDoc)],ke=await _e(t,o.releasesDoc.value,[],ve);if(!ke.ok)return await fa(t,L.fileUrl).catch(()=>{}),ze(ke);try{await ua(t).load(L.fileUrl,{force:!0})}catch(re){console.warn("reload new release file failed:",re?.message||re)}let he=R(L.fileUrl);t.add(L.releaseNode,oe("type"),jt,he),t.add(L.releaseNode,oe("type"),se("Dataset"),he),t.add(L.releaseNode,O("title"),Q(L.title),he),t.add(L.releaseNode,O("identifier"),Q(L.ident),he),t.add(L.releaseNode,O("isPartOf"),o.releasesCatalog,he),L.lp&&t.add(L.releaseNode,se("landingPage"),R(L.lp),he),L.artist&&t.add(L.releaseNode,ye("maker"),M||Q(L.artist),he);for(let re of L.tracks)t.add(re.node,oe("type"),Ur,he),re.name&&t.add(re.node,O("title"),Q(re.name),he),t.add(re.node,J("item"),R(re.dl),he),Number.isFinite(re.dur)&&re.dur>0&&t.add(re.node,J("duration"),Q(String(re.dur),void 0,ft("decimal")),he),t.add(re.node,O("isPartOf"),L.releaseNode,he),t.add(L.releaseNode,J("track"),re.node,he)}for(let L of ce.values()){let M=await _e(t,L.fileDoc.value,[],L.inserts);if(!M.ok)return ze(M)}let Ke=0,C=0;for(let L of t.match(l,q("itemListElement"),null)){let M=parseInt(t.any(L.object,q("position"))?.value,10);Number.isFinite(M)&&(Ke=Math.max(Ke,M));let K=L.object.value.match(/#e(\d+)$/);K&&(C=Math.max(C,parseInt(K[1],10)))}let G=[];ne.forEach((L,M)=>{let K=R(`${l.value}#e${p(C+M+1)}`);G.push(P(l,q("itemListElement"),K,l),P(K,oe("type"),q("ListItem"),l),P(K,q("position"),Q(String(Ke+M+1),void 0,ft("integer")),l),P(K,q("item"),L,l))});let Z=160;for(let L=0;L<G.length;L+=Z){let M=await _e(t,l.value,[],G.slice(L,L+Z));if(!M.ok)return ze(M)}return{ok:!0,nodes:ne,added:xe,skipped:b}}async function Ki(t,a,r,n){let s=R(r),o=[],l=null;for(let y of t.match(s,q("itemListElement"),null)){let m=y.object,b=t.any(m,q("item")),g=parseInt(t.any(m,q("position"))?.value,10);if((b&&t.any(b,J("item"))?.value)===n&&!l){l={ent:m,trk:b,pos:g};continue}o.push({ent:m,trk:b,pos:Number.isFinite(g)?g:Number.MAX_SAFE_INTEGER})}if(!l)return{ok:!0};let u=[P(s,q("itemListElement"),l.ent,s),P(l.ent,oe("type"),q("ListItem"),s),P(l.ent,q("position"),Q(String(l.pos),void 0,ft("integer")),s),P(l.ent,q("item"),l.trk,s)],p=[];o.sort((y,m)=>y.pos-m.pos).forEach((y,m)=>{let b=m+1;y.pos!==b&&(u.push(P(y.ent,q("position"),Q(String(y.pos),void 0,ft("integer")),s)),p.push(P(y.ent,q("position"),Q(String(b),void 0,ft("integer")),s)))});let v=await _e(t,s.value,u,p);if(!v.ok)return v;if(a&&r===Ot(a))try{let y=$e(a),m=s,b=t.any(l.trk,O("isPartOf"))||t.match(null,J("track"),l.trk)[0]?.subject;if(b&&t.holds(b,oe("type"),jt)){let g=t.match(b,J("track"),null).map(S=>S.object),f=!1;e:for(let S of g)for(let D of t.match(null,q("item"),S)){let I=t.match(null,q("itemListElement"),D.subject)[0]?.subject;if(I&&I.value!==m.value){f=!0;break e}}if(!f){let S=ja(t,b,y.releasesDoc),D=[];for(let I of t.match(y.releasesCatalog,se("dataset"),b))D.push(P(I.subject,I.predicate,I.object,y.releasesDoc));for(let I of t.match(y.releasesDoc,lt("seeAlso"),null))I.object.value===S.value&&D.push(P(I.subject,I.predicate,I.object,y.releasesDoc));D.length&&await _e(t,y.releasesDoc.value,D,[]),await fa(t,S.value).catch(()=>{});for(let I of g){for(let F of t.match(I,null,null))t.remove(F);for(let F of t.match(null,null,I))t.remove(F)}for(let I of t.match(b,null,null))t.remove(I);for(let I of t.match(null,null,b))t.remove(I)}}}catch(y){console.warn("Deleted-bin release GC failed (orphan left for sweep):",y?.message||y)}return{ok:!0}}async function Wi(t,a,r,n={}){let s=$e(a),o=ja(t,r,s.releasesDoc),l=[],u=[];if(n.title!=null){for(let p of t.match(r,O("title"),null))l.push(P(p.subject,p.predicate,p.object,o));n.title&&u.push(P(r,O("title"),Q(n.title),o))}if(n.artist!=null){for(let p of t.match(r,ye("maker"),null))l.push(P(p.subject,p.predicate,p.object,o));n.artist&&u.push(P(r,ye("maker"),Q(n.artist),o))}if(n.album!=null){let p=t.match(null,J("track"),r)[0]?.subject;if(p){let v=ja(t,p,o);for(let y of t.match(p,O("title"),null))l.push(P(y.subject,y.predicate,y.object,v));n.album&&u.push(P(p,O("title"),Q(n.album),v))}}return!l.length&&!u.length?{ok:!0}:_e(t,o.value,l,u)}function Vi(t,a){let r=t.match(null,J("track"),a)[0]?.subject;if(!r)return 0;let n=t.match(r,J("track"),null).length;return Math.max(0,n-1)}function Xr(t,a){let r=[],n=new Set,s=l=>{t.holds(l,oe("type"),jt)&&(n.has(l.value)||(n.add(l.value),r.push({name:t.any(l,O("title"))?.value||t.any(l,se("landingPage"))?.value||l.value,url:l.value,_local:!0,_releaseNode:l})))},o=t.any(a,O("source"));if(o){for(let l of t.match(o,q("itemListElement"),null)){let u=t.any(l.object,q("item")),p=u&&t.any(u,O("isPartOf"));p&&s(p)}return r}for(let l of t.match(null,ye("maker"),a))s(l.subject);return r}function Yi(t,a){let r=[];for(let n of t.match(a,J("track"),null)){let s=n.object,o=t.any(s,J("item"))?.value;if(!o)continue;let l=t.any(s,J("duration"))?.value;r.push({url:o,name:t.any(s,O("title"))?.value||s.value,time:Js(l),node:s,_lengthSec:l!=null?parseFloat(l):NaN,_bitrate:NaN})}return r}function Js(t){let a=parseFloat(t);if(!Number.isFinite(a)||a<=0)return"";let r=Math.floor(a/60),n=Math.floor(a%60);return`${r}:${String(n).padStart(2,"0")}`}async function Ji(t,a,r,n={}){let o=$e(a).agentsDoc,l=R(r),u=(n.name||t.any(l,O("title"))?.value||"Untitled Artist").trim(),p=n.genreId;if(!p)return{ok:!1,err:"a genre is required"};let v=new Set;for(let S of t.match(l,q("itemListElement"),null)){let D=t.any(S.object,q("item")),I=D&&t.any(D,O("isPartOf"));I&&t.holds(I,oe("type"),jt)&&v.add(I.value)}let y=t.match(null,O("source"),l)[0]?.subject||Fi(t,u),m=y||R(`urn:uuid:${crypto.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`}`),b=y?t.statementsMatching(y,null,null).filter(S=>(S.why?.value||o.value)===o.value):[],g=[P(m,oe("type"),Fr,o),P(m,ye("name"),Q(u),o),P(m,J("genre"),R(p),o),P(m,O("source"),l,o)],f=await _e(t,o.value,b,g);return f.ok?{ok:!0,node:m,name:u,genreId:p,albumCount:v.size,relinked:!!y}:{...f,node:null}}async function Qr(t,a,r){let s=$e(a).agentsDoc,o=R(r),l=t.match(null,O("source"),o)[0]?.subject;if(!l)return{ok:!0,node:null};let u=t.statementsMatching(l,null,null).filter(v=>(v.why?.value||s.value)===s.value),p=await _e(t,s.value,u,[]);return p.ok?(await Zr(t,a,r,!1).catch(()=>{}),{ok:!0,node:l}):{...p,node:l}}async function Zr(t,a,r,n){let s=R(r),o=t.statementsMatching(s,Rr("styleClass"),null),l=n?[P(s,Rr("styleClass"),Q("hidden"),s)]:[];return!o.length&&!l.length?{ok:!0}:_e(t,s.value,o,l)}function Mr(t){if(!t)return NaN;let a=String(t).trim();if(!a)return NaN;if(/^[0-9.]+$/.test(a))return parseFloat(a);let r=a.split(":").map(Number);return r.some(n=>!Number.isFinite(n))?NaN:r.length===3?r[0]*3600+r[1]*60+r[2]:r.length===2?r[0]*60+r[1]:r[0]}function Xi(t){let a=String(t).trim();if(!a)return null;let r=a.match(/archive\.org\/details\/([^\/?\s#]+)/);return r?{id:r[1],url:`https://archive.org/details/${r[1]}`}:/^[a-zA-Z0-9._-]+$/.test(a)?{id:a,url:`https://archive.org/details/${a}`}:null}var nc=(()=>{try{return/[?&](code|state)=/.test(location.search)}catch{return!1}})();function Xs({libraryConfigs:t,libs:a,host:r}){let n=()=>yt()[0]?.mediaType||"audio",s=r?.getAttribute?.("storage-ns")||"",o=s?":"+s:"",l=!!s,u=!!r?.hasAttribute?.("favourites-only"),p=()=>n()==="video"?"MovingImage":"Sound",v=new Set,y=[],m=Vn({mediaType:n(),panel:l}),{container:b,audio:g,status:f,trackCount:S,nowPlaying:D,filmIntro:I,filmIntroTitle:F,filmIntroLength:j,filmIntroAbout:ce,filmIntroRights:ne,prevBtn:xe,playBtn:ze,nextBtn:Ke,seekSlider:C,timeCur:G,timeDur:Z,volumeSlider:L,sourcesList:M,favouritesList:K,librariesList:X,genreList:le,artistList:ue,albumList:ve,trackTable:ke,trackHead:he,trackBody:re,trackEmpty:mt,randomizeBtn:tt,clearTracksBtn:pa,helpMenuItem:ma,helpLinkMenuItem:Y,loginHelpMenuItem:Ee,filtersMenuItem:Be,savePlaylistMenuItem:Te,installPodMenuItem:We,updateAppMenuItem:ha,viewDeletedMenuItem:Xe,addPlaylistBtn:ht,addSourceBtn:Et,addGenreBtn:Xa,addArtistBtn:Qa,genreColumnFooter:Ht,artistColumnFooter:Gt,themeToggle:Kt,fontSizeBtn:ba,setMenuOpen:at}=m,Tt=document.documentElement,ga=()=>document.querySelector("sol-default");function Za(){return Tt.getAttribute("data-theme")||ga()?.getAttribute("theme")||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}function er(){return Tt.getAttribute("data-fontsize")||ga()?.getAttribute("fontsize")||"medium"}function sn(){let e=Za()!=="light";if(Kt){Kt.setAttribute("aria-checked",e?"true":"false");let c=Kt.querySelector(".gear-theme-ico"),d=Kt.querySelector(".gear-theme-label");c&&(c.textContent=e?"\u{1F319}":"\u2600\uFE0F"),d&&(d.textContent=e?"Dark mode":"Light mode")}let i=er();if(ba){let c=ba.querySelector(".gear-fontsize-label");c&&(c.textContent="Text size: "+i[0].toUpperCase()+i.slice(1));let d=ba.querySelector(".gear-fontsize-ico");d&&(d.style.fontSize=i==="small"?"0.8rem":i==="large"?"1.2rem":"1rem")}}let tr=["small","medium","large"];function oo(e){Tt.setAttribute("data-theme",e);try{localStorage.setItem("omp:theme",e)}catch{}document.dispatchEvent(new CustomEvent("omp:appearance"))}function so(e){Tt.setAttribute("data-fontsize",e);try{localStorage.setItem("omp:fontsize",e)}catch{}document.dispatchEvent(new CustomEvent("omp:appearance"))}ga()?.hasAttribute("theme")||Tt.setAttribute("data-theme",Za()),ga()?.hasAttribute("fontsize")||Tt.setAttribute("data-fontsize",er()),Kt?.addEventListener("click",()=>oo(Za()==="light"?"dark":"light")),ba?.addEventListener("click",()=>{so(tr[(tr.indexOf(er())+1)%tr.length])}),document.addEventListener("omp:appearance",sn),sn();function lo(){try{return!!document.querySelector("sol-default")?.hasAttribute("solid-kitchen")}catch{return!1}}function Wt(){return document.querySelector("sol-login")}function ya(){let e=Wt();return!!(e&&e.isLoggedIn)}function rt(){return ya()||lo()}function va(){let e=!rt();b.classList.toggle("guest-mode",e);let i=ya(),c=i&&Wt()?.webId||"",d=b.querySelector(".manage-btn");d&&(d.classList.toggle("logged-in",i),d.title=c||"Menu");try{r?.dispatchEvent(new CustomEvent("omp:access",{detail:{guest:e,real:i,webId:c}}))}catch{}}function ar(e,i){return e.map(c=>({...c,_lib:i.config.id}))}let bt=[],te=[],Me=[],Ie=new Set,gt=new Set;function yt(){return a.filter(e=>e.store&&t.find(i=>i.id===e.config.id)?.enabled)}function nt(){let e=yt();bt=e.flatMap(i=>ar(i.genres,i)),te=e.flatMap(i=>ar(i.bookmarks,i)),Me=e.flatMap(i=>ar(i.playlists,i)),Ie=new Set(Me.map(i=>i.id)),gt=new Set(e.map(i=>qr(i.baseURI)))}function rr(e=n()){return e==="video"?{genre:"Film Types",artist:"Collections",album:"Movies",addGenre:"+ Add film type",addArtist:"+ Add collection",allGenre:"(All film types)",allArtist:"(All collections)",allAlbum:"(All movies)",find:"Find a film\u2026",chooseArtist:"Choose a collection to see films.",loadingAlbums:"Loading films\u2026",noAlbums:"No films found."}:{genre:"Genres",artist:"Artists",album:"Albums",addGenre:"+ Add genre",addArtist:"+ Add artist",allGenre:"(All genres)",allArtist:"(All artists)",allAlbum:"(All albums)",find:"Find artist\u2026",chooseArtist:"Choose an artist to see albums.",loadingAlbums:"Loading albums\u2026",noAlbums:"No albums found."}}function ln(){let e=n();b.classList.toggle("media-video",e==="video"),b.classList.toggle("media-audio",e!=="video");let i=rr(e);for(let x of["genre","artist","album"]){let k=b.querySelector(`[data-column="${x}"] .ia-column-header`);k&&(k.textContent=i[x])}Xa&&(Xa.textContent=i.addGenre),Qa&&(Qa.textContent=i.addArtist),ot.setAllLabel(i.allGenre),Ze.setAllLabel(i.allArtist),be.setAllLabel(i.allAlbum);let c=b.querySelector(".ia-artist-search-input");c&&(c.placeholder=i.find);let d=b.querySelector(".ia-artist-search"),h=b.querySelector(".ia-nowplaying"),w=b.querySelector(".ia-toolbar");d&&(e==="video"&&h&&d.parentElement!==h?h.appendChild(d):e!=="video"&&w&&d.parentElement===h&&w.appendChild(d)),Ze.getSelection().size===0&&!et&&U==="library"&&be.setMessage(i.chooseArtist),b.classList.toggle("has-video",e==="video"&&Yt)}function Qe(e){if(!e?.store)return;let i=Hr(e.store,e.baseURI,e.mediaType);e.genres=i.genres,e.bookmarks=i.bookmarks,e.playlists=Gr(e.store,e.baseURI),nt()}async function wa(e,i){if(!e?.store||typeof e.loadDocs!="function"||!i?.length)return!1;let c=0;try{c=await e.loadDocs(i)}catch(d){console.warn("[lazy] release load failed:",d?.message||d)}return c&&Qe(e),c>0}function co(e,i){return e?.store?Ka(e.store,[String(i).split("#")[0]]):[]}function je(){return yt()[0]||null}function xa(e){return a.find(i=>i.config.id===e)||null}let Ve=null,vt=!1,ct=!1,Ct=!1,Ye=null;function nr(){nt(),qe(),ge(),De(),Pe(),dt(),U="library",ut("library")}function cn(){nt(),qe(),ge(),De(),Pe(),dt(),ut(U)}async function uo(e){for(let d=a.length-1;d>=0;d--)a[d].config.solid&&a.splice(d,1);for(let d=t.length-1;d>=0;d--)t[d].solid&&t.splice(d,1);Ve||(Ve=t.map(d=>[d.id,d.enabled])),t.forEach(d=>{d.enabled=!1});let i={id:"solid",label:"My Pod",url:e,enabled:!0,solid:!0};t.push(i);let c=await pt(i);if(!c.store){let d=t.indexOf(i);if(d>=0&&t.splice(d,1),Ve){for(let[h,w]of Ve){let x=t.find(k=>k.id===h);x&&(x.enabled=w)}Ve=null}for(let h of t){if(h.solid||!h.enabled||a.some(k=>k.config.id===h.id&&k.store))continue;let w=await pt(h),x=a.findIndex(k=>k.config.id===h.id);x>=0?a[x]=w:a.push(w)}return vt=!1,ct=!1,nr(),{ok:!1,err:c.error}}a.push(c);try{let d=new URL(e,location.href).href,h=w=>w&&!w.solid&&w.url&&(()=>{try{return new URL(w.url,location.href).href===d}catch{return!1}})();for(let w=a.length-1;w>=0;w--)h(a[w].config)&&a.splice(w,1);for(let w=t.length-1;w>=0;w--)h(t[w])&&t.splice(w,1);Ve&&(Ve=Ve.filter(([w])=>t.some(x=>x.id===w)))}catch(d){console.warn("[pod] self-hosted dedupe skipped:",d?.message||d)}return vt=!!(Ce&&Ce.isLoggedIn),ct=!vt,Ct=!1,nr(),{ok:!0,authed:vt}}function ll(){ao();for(let e=a.length-1;e>=0;e--)a[e].config.solid&&a.splice(e,1);for(let e=t.length-1;e>=0;e--)t[e].solid&&t.splice(e,1);if(Ve){for(let[e,i]of Ve){let c=t.find(d=>d.id===e);c&&(c.enabled=i)}Ve=null}else t.forEach(e=>{e.enabled=!0});vt=!1,ct=!1,Ct=!1,nr()}let It="random",Vt="off",fo=!1,ir=!1,U="library",Pt=[];nt();let dn="ia-player:state"+o;s&&b.classList.add("panel-instance"),t.length===1&&b.classList.add("single-library");let wt=null,or=!1;function po(){try{let e=localStorage.getItem(dn);return e?JSON.parse(e):null}catch(e){return console.warn("Could not read saved state:",e),null}}function un(e){try{localStorage.setItem(dn,JSON.stringify(e))}catch(i){console.warn("Could not write state:",i)}}let fn=new Set(["title","artist","album"]);function mo(){let e={};return ke&&ke.querySelectorAll("col").forEach(i=>{i.style.width&&!fn.has(i.dataset.col)&&(e[i.dataset.col]=i.style.width)}),e}function ho(e){if(!(!e||!ke))for(let[i,c]of Object.entries(e)){if(fn.has(i))continue;let d=ke.querySelector(`col[data-col="${CSS.escape(i)}"]`);d&&(d.style.width=c)}}function pn(){let e=na?.getSort?.()??{col:null,dir:"asc"};return{shuffle:It==="random",repeat:Vt,volume:g.volume,source:U,genreSel:[...ot.getSelection()],artistSel:[...Ze.getSelection()],albumSel:[...be.getSelection()],sortCol:e.col,sortDir:e.dir,columnWidths:mo(),sourcesWidth:b.style.getPropertyValue("--ia-sources-width")||"",browserHeight:b.style.getPropertyValue("--ia-browser-height")||"",libraryTracks:ie.map(i=>({id:i.id,url:i.url,name:i.name,artist:i.artist||"",album:i.album||"",albumUrl:i.albumUrl||"",time:i.time||"",_lib:i._lib})),currentTrackUrl:Se?.url||null,currentTime:Se&&g.src===Se.url&&Number.isFinite(g.currentTime)?g.currentTime:0}}function Ae(){or||(wt&&clearTimeout(wt),wt=setTimeout(()=>{wt=null,un(pn())},400))}function bo(){wt&&(clearTimeout(wt),wt=null),un(pn())}window.addEventListener("beforeunload",bo);async function go(){let e=po();if(e){or=!0;try{typeof e.volume=="number"&&(g.volume=Math.min(1,Math.max(0,e.volume)),L.value=String(g.volume)),wr(e.shuffle?"random":"ordered"),Un(e.repeat||"off"),ho(e.columnWidths),e.sourcesWidth&&b.style.setProperty("--ia-sources-width",e.sourcesWidth),e.browserHeight&&b.style.setProperty("--ia-browser-height",e.browserHeight),e.sortCol&&na.setSort&&na.setSort(e.sortCol,e.sortDir),Array.isArray(e.genreSel)&&e.genreSel.length&&ot.setSelection(e.genreSel,{notify:!1}),ge(),Array.isArray(e.artistSel)&&e.artistSel.length&&Ze.setSelection(e.artistSel,{notify:!1});let i=new Set(t.filter(d=>d.enabled).map(d=>d.id));Array.isArray(e.libraryTracks)&&e.libraryTracks.length&&(ie=e.libraryTracks.map(d=>({...d})).filter(d=>!d._lib||i.has(d._lib)));let c=e.source&&e.source!=="library"&&Ie.has(e.source);if(e.source==="favorites"?(U="favorites",it.setSelection(["favorites"],{notify:!1}),b.classList.add("source-favorites"),Cn(),Ea()):c?(U=e.source,it.setSelection([e.source],{notify:!1}),ta(e.source)):(e.source&&e.source!=="library"&&e.source!=="favorites"&&(Jt=e.source),U="library",N=ie,Oe=kt(),fe()),Qt(),c||(await De(),Array.isArray(e.albumSel)&&e.albumSel.length&&be.setSelection(e.albumSel,{notify:!1})),e.currentTrackUrl){let d=ie.find(h=>h.url===e.currentTrackUrl)||N.find(h=>h.url===e.currentTrackUrl);if(d&&(!d._lib||i.has(d._lib))){Se=d,Yt=n()==="video",b.classList.toggle("has-video",Yt),Ma(D,Dn(d)),fe(),g.src=d.url;let h=Number.isFinite(e.currentTime)&&e.currentTime>0?e.currentTime:0;if(h>0){let w=()=>{g.removeEventListener("loadedmetadata",w);try{g.currentTime=h}catch{}};g.addEventListener("loadedmetadata",w)}g.load()}}}finally{or=!1}}}let N=[],ie=[],Dt=null,ka=!1,Se=null,Yt=!1,Jt=null,xt=new Map,Ut=new Map;function Sa(e){e&&xt.delete(e)}function sr(e){let i=Me.find(c=>c.id===e);i?.artistNode&&Sa(i.artistNode.value)}let mn="omp-player:quality-filter"+o,La={minTrackDurationSec:180,minTrackBitrateKbps:0,minItemRuntimeSec:0,minDownloads:0,blockedCollections:[],applyToCatalogArtists:!1};function yo(){try{let e=localStorage.getItem(mn);if(!e)return{...La};let i=JSON.parse(e);return{...La,...i}}catch{return{...La}}}function vo(e){try{localStorage.setItem(mn,JSON.stringify(e))}catch(i){console.warn("Could not persist filter:",i)}}let Mt=yo();function lr(e){return e[Math.floor(Math.random()*e.length)]}function wo(e){return e?.match(/(?:\/details\/|archive\.org\/details\/)([^/?]+)/)?.[1]??null}function Rt(e){return e.node?.value||e.url}function Xt(e,i){return e.label.localeCompare(i.label,void 0,{sensitivity:"base"})}function xo(e){return/\b40[13]\b|unauthor|forbidden|not allowed|permission|credential/i.test(String(e||""))}function cr(){let e=Wt();if(!e)return!1;if(!l)try{at(!0)}catch{}try{e.scrollIntoView?.({block:"nearest",inline:"nearest"});let i=e.shadowRoot&&e.shadowRoot.querySelector(".auth-btn");if(i)return i.click(),!0;if(typeof e._handleClick=="function")return e._handleClick(),!0;if(e.issuers&&e.issuers[0])return e.login(e.issuers[0]),!0}catch{}return!1}function ko(e){if(!ct)return!1;let i=!!(Ce&&Ce.isLoggedIn);return $(f,i?`"${e}" not saved \u2014 your pod denied the write (no permission). Changes stay in this browser only.`:`"${e}" not saved \u2014 log in to save to your pod. Changes stay in this browser only.`),Ct||i||(Ct=!0,confirm(`Couldn't save "${e}" to your pod.

You're in guest mode (not signed in). This change needs a Solid login to save \u2014 creating playlists works without one, but editing the library does not.

Log in now?

OK = Log in (you'll need to redo this change after signing in)
Cancel = keep working in this browser (changes won't be saved)`)&&(cr()||$(f,'Open the gear menu and click "Log in" to sign in to your pod.'))),!0}function Ue(e,i){if(e&&e.ok)return!0;let c=e?.err||"persistence failed";return console.warn(`checkSaved: ${i}:`,e),ct&&xo(c)?ko(i):$(f,`Couldn't ${i}: ${c}. No changes saved.`),!1}function _a(e){return`<button type="button" class="ia-src-edit ia-row-kebab" data-action="edit" aria-label="Edit ${H(e)}" aria-haspopup="menu" title="Edit" tabindex="-1">\u22EF</button>`}function hn(e,i,{onCommit:c}){if(!e)return;let d=e.innerHTML;e.innerHTML=`<input type="text" class="ia-row-rename" value="${H(i)}" aria-label="Rename" spellcheck="false">`;let h=e.querySelector("input");h.focus(),h.select();let w=!1,x=()=>{e.innerHTML=d},k=()=>{if(w)return;w=!0;let A=h.value.trim();A&&A!==i?c(A):x()},E=()=>{w||(w=!0,x())};h.addEventListener("keydown",A=>{A.stopPropagation(),A.key==="Enter"?(A.preventDefault(),k()):A.key==="Escape"&&(A.preventDefault(),E())}),h.addEventListener("click",A=>A.stopPropagation()),h.addEventListener("dblclick",A=>A.stopPropagation()),h.addEventListener("mousedown",A=>A.stopPropagation()),h.addEventListener("blur",k)}let bn=Lt(X,{onChange:e=>Lo(e),showAll:!1,multiSelect:!1,allowDeselect:!1,renderItemActions:e=>_a(e.label),onItemAction:(e,i,c)=>{e==="edit"&&Co(i,c)}}),it=Lt(M,{onChange:e=>ut([...e][0]||"library"),showAll:!1,multiSelect:!1,allowDeselect:!0,renderItemActions:e=>_a(e.label),onItemAction:(e,i,c)=>{e==="edit"&&wn(i,c)},onItemDrop:(e,i)=>Ro(e,i)}),gn=Lt(K,{onChange:e=>{let i=[...e][0];if(!i)return;let c=y.find(d=>(d.item||d.link)===i);c&&So(c)},showAll:!1,multiSelect:!1,allowDeselect:!0,renderItemActions:()=>rt()?'<button type="button" class="ia-row-favdel" data-action="favdel" title="Remove from the communal favourites" aria-label="Remove favourite" tabindex="-1">\u2715</button>':"",onItemAction:(e,i)=>{e==="favdel"&&confirm("Remove this favourite from the communal wall?")&&Ca(i)}});function yn(){let e=y.map(i=>({id:i.item||i.link,label:i.canonicalTitle||"Untitled",title:i.contributors?.length?`Favourited by ${i.contributors.map(c=>c.name).join(", ")}`:"",_fav:i})).sort((i,c)=>i.label.localeCompare(c.label,void 0,{sensitivity:"base"}));gn.setItems(e),gn.setMessage(e.length?null:n()==="video"?"No favourite films yet \u2014 tap \u2606 on a film.":"No favourites yet \u2014 tap \u2606 on a track.")}function So(e){let i=e.link||e.item,c=e.canonicalTitle||"Untitled";if(n()==="video"){Ln({url:i,name:c});return}He({id:i,url:i,name:c,album:"Community Favorites",albumUrl:"",time:"",artist:""})}function dt(){let e=c=>c==="video"?"\u{1F3AC}":"\u{1F3B5}";bn.setItems(t.map(c=>{let d=a.find(w=>w.config.id===c.id),h=d&&d.mediaType||c.mediaType||"audio";return{id:c.id,label:`${e(h)} ${c.label}`}}));let i=t.filter(c=>c.enabled).map(c=>c.id);bn.setSelection(i,{notify:!1})}dt();function Pe(){let e=Me.filter(i=>!i.hidden&&!i.id.endsWith("/playlists/deleted")).map(i=>({id:i.id,label:i.label,title:i.description||""}));it.setItems(e),e.some(i=>i.id===U)?it.setSelection([U],{notify:!1}):(U==="favorites"&&(U="library"),it.setSelection([],{notify:!1})),Qt()}function Qt(){b.classList.toggle("viewing-playlist",Ie.has(U)),b.classList.toggle("viewing-library",U==="library")}Pe(),yn(),u&&(b.classList.add("favourites-only"),ht&&(ht.hidden=!0));function Nt(){if(!s){on(t);for(let e of t)e.url&&!e.solid&&el(e.url,e.enabled)}}async function Lo(e){t.forEach(i=>{i.enabled=e.has(i.id)}),Nt();for(let i of t){if(!i.enabled)continue;let c=a.findIndex(d=>d.config.id===i.id);c>=0&&a[c].unloaded&&($(f,`Loading "${i.label}"\u2026`),a[c]=await pt(i),$(f,a[c].error?`Could not load "${i.label}": ${a[c].error}`:`Loaded "${i.label}".`))}nt(),ln(),U!=="library"&&U!=="favorites"&&!Ie.has(U)&&(U="library"),ot.setSelection([],{notify:!1}),Ze.setSelection([],{notify:!1}),be.setSelection([],{notify:!1}),N=ie,qe(),ge(),De(),Pe(),U==="library"?(N=ie,Oe=kt(),fe()):U==="favorites"?Tn():ta(U)}async function dr(e){if(!(!Ye||!Ye.typeIndex||!e||e.solid||!e.url))try{await Ha(Ye.authedFetch,Ye.typeIndex,{id:e.id,url:new URL(e.url,location.href).href,label:e.label})}catch(i){console.warn("type-index register failed (kept locally):",i?.message||i)}}async function _o(e){if(!(!Ye||!Ye.typeIndex||!e))try{await Pi(Ye.authedFetch,Ye.typeIndex,{id:e.id,url:e.url?new URL(e.url,location.href).href:null})}catch(i){console.warn("type-index unregister failed:",i?.message||i)}}async function cl(e,i){let c;try{c=await Ii(e,i)}catch(k){console.warn("listRegisteredLibraries failed:",k?.message||k);return}let d=c.typeIndex;if(Ye=d?{authedFetch:e,webId:i,typeIndex:d}:null,!d)return;let h=new Set(c.libraries.map(k=>k.url));for(let k of t){if(k.solid||!k.url)continue;let E=new URL(k.url,location.href).href;if(!h.has(E))try{await Ha(e,d,{id:k.id,url:E,label:k.label})}catch(A){console.warn("push register failed:",A?.message||A)}}let w=new Set(t.filter(k=>k.url).map(k=>new URL(k.url,location.href).href)),x=!1;for(let k of c.libraries){if(w.has(k.url))continue;let E={id:Qi(),label:k.label||k.url,url:k.url,enabled:no(k.url,!1)},A=await pt(E);if(A.error){console.warn("discovered library failed to load:",k.url,A.error);continue}a.push(A),t.push(E),x=!0}x&&(Nt(),nt(),dt(),Pe(),qe(),ge(),De(),U==="library"&&(N=ie,fe()))}async function vn(e,i){let d={id:Qi(),label:e,url:i,enabled:!0};$(f,`Loading "${e}"\u2026`);let h=await pt(d);if(h.error){$(f,`Could not load "${e}": ${h.error}`);return}a.push(h),t.push(d),Nt(),nt(),dt(),Pe(),qe(),ge(),De(),await dr(d),$(f,Ye?`Added "${e}" (registered on your pod).`:`Added "${e}".`)}async function Ao(e){let i=t.find(E=>!E.solid&&$t(E.url)),d=new URL(i?i.url:"./libraries/_/index.ttl",location.href).href.match(/^(.*\/libraries\/)/)?.[1];if(!d){$(f,"Could not locate the libraries/ root.");return}let h=new Set(t.map(E=>(E.url||"").match(/\/libraries\/([^/]+)\//)?.[1]).filter(Boolean)),w=Zi(e);for(let E=2;h.has(w);E++)w=`${Zi(e)}_${E}`;let x=d+w+"/";$(f,`Creating library "${e}"\u2026`);let k=await Mi(x,{title:e});if(!k.ok){$(f,`Couldn't create "${e}": ${k.err}`);return}await vn(e,k.url)}function $o(e,i){let c=t.find(d=>d.id===e);c&&(c.label=i,Nt(),dt(),dr(c))}async function Eo(e,i){let c=t.find(w=>w.id===e);if(!c)return;c.url=i,Nt(),$(f,`Reloading "${c.label}" from ${i}\u2026`);let d=await pt(c),h=a.findIndex(w=>w.config.id===e);h>=0?a[h]=d:a.push(d),nt(),dt(),Pe(),qe(),ge(),De(),U==="library"&&(N=ie,fe()),await dr(c),d.error?$(f,`Could not load: ${d.error}`):$(f,`Reloaded "${c.label}".`)}function To(e){let i=t.findIndex(h=>h.id===e);if(i<0)return;let c=t[i];_o(c),t.splice(i,1);let d=a.findIndex(h=>h.config.id===e);d>=0&&a.splice(d,1),Nt(),ie=ie.filter(h=>h._lib!==e),nt(),dt(),Pe(),qe(),ge(),De(),U==="library"&&(N=ie,fe())}function Co(e,i){let c=t.find(d=>d.id===e);c&&ni({title:"Edit library",values:{label:c.label,url:c.url},canDelete:t.length>1,onSave:async({label:d,url:h})=>{d!==c.label&&$o(e,d),h!==c.url&&await Eo(e,h)},onDelete:()=>{if(!confirm(`Delete library "${c.label}"?
Its contents stay on disk; only this player will forget about it.`))return!1;To(e)}})}function wn(e,i){if(!Ie.has(e))return;let c=Me.find(_=>_.id===e);if(!c)return;let d=Ft(e);if(!d)return;function h(_,T,z){for(let ae=te.length-1;ae>=0;ae--)te[ae].node&&te[ae].node.value===_.value&&te.splice(ae,1);te.push({node:_,label:T,topic:z,url:null,source:null,localData:!0,sourcePlaylist:e,_lib:d.config.id})}async function w(){let _=bt.filter(B=>!gt.has(B.id));if(!_.length){$(f,"Add a genre first \u2014 a converted artist needs one.");return}let T=(prompt("Artist name:",c.name)||"").trim();if(!T)return;let z=_.slice().sort(Xt),ae=prompt(`Genre? Enter a number:
`+z.map((B,pe)=>`  ${pe+1}. ${B.label}`).join(`
`),"1");if(ae==null)return;let V=z[parseInt(ae,10)-1];if(!V){$(f,"Conversion cancelled \u2014 no valid genre picked.");return}let ee=await Ji(d.store,d.baseURI,e,{name:T,genreId:V.id});Ue(ee,`convert "${c.name}" to an artist`)&&(c.artistNode=ee.node,h(ee.node,T,V.id),Sa(ee.node.value),ge(),De(),$(f,`${ee.relinked?"Relinked":"Converted"} "${c.name}" \u2192 artist "${T}" (${ee.albumCount} album${ee.albumCount===1?"":"s"}). Playlist kept.`))}async function x(){if(!confirm(`Unlink the artist from "${c.name}"?
The playlist and its tracks stay; it just stops also appearing as an artist.`))return!1;let _=await Qr(d.store,d.baseURI,e);if(Ue(_,`unlink artist from "${c.name}"`)){if(_.node){for(let T=te.length-1;T>=0;T--)te[T].node&&te[T].node.value===_.node.value&&te.splice(T,1);Sa(_.node.value)}c.artistNode=null,c.hidden=!1,ge(),De(),Pe(),$(f,`Unlinked artist from "${c.name}". Playlist kept.`)}}async function k(){if(!confirm(`Delete playlist "${c.name}"?`))return!1;let _=await Gi(d.store,d.baseURI,e);if(!Ue(_,`delete playlist "${c.name}"`))return;for(let z=te.length-1;z>=0;z--)te[z].topic===e&&te.splice(z,1);let T=Me.findIndex(z=>z.id===e);T>=0&&Me.splice(T,1),Ie.delete(e),U===e&&(U="library",ut("library")),Pe()}let A=!rt()?[]:[c.artistNode?{label:"Unlink artist",onClick:x}:{label:"Convert to artist\u2026",onClick:w},{label:"Remove playlist",danger:!0,onClick:k}];Lr({title:"Edit playlist",values:{name:c.name,maker:c.maker,description:c.description},actions:A,onSave:async({name:_,maker:T,description:z})=>{let ae=await Hi(d.store,d.baseURI,e,{name:_,maker:T,description:z});if(!Ue(ae,`edit playlist "${c.name}"`))return;if(c.artistNode&&_&&_!==c.name){let ee=await Yr(d.store,d.baseURI,c.artistNode,_);if(!Ue(ee,`update linked artist "${c.name}" \u2192 "${_}"`))return}let V=T?`${_} (${T})`:_;Qe(d),Pe(),ge(),$(f,`Updated "${V}".`)}})}function Io(e){return le.querySelector(`.ia-listbox-item[data-id="${CSS.escape(e)}"]`)}function Po(e){return ue.querySelector(`.ia-listbox-item[data-id="${CSS.escape(e)}"]`)}function Do(e){return te.find(i=>Rt(i)===e)}function Uo(e,i){let c=bt.find(d=>d.id===e);c&&la(i,[{id:"rename",label:"Rename"},{id:"delete",label:"Delete"}],async d=>{let h=zo(e);if(h){if(d==="rename")hn(Io(e),c.label,{onCommit:async w=>{let x=await ji(h.store,h.baseURI,e,w);if(!Ue(x,`rename genre "${c.label}"`)){qe();return}Qe(h),qe(),ge()}});else if(d==="delete"){let w=te.filter(E=>E.topic===e&&Aa(E)).length,x=w?`Delete genre "${c.label}" and its ${w} artist${w===1?"":"s"}?`:`Delete genre "${c.label}"?`;if(!confirm(x))return;let k=await Bi(h.store,h.baseURI,e);if(!Ue(k,`delete genre "${c.label}"`))return;Qe(h),qe(),ge(),De()}}})}function Mo(e,i){let c=Do(e);if(!c)return;if(c.sourcePlaylist&&Ie.has(c.sourcePlaylist)){let w=c.sourcePlaylist,x=Me.find(_=>_.id===w),k=Ft(w),E=fr(c),A=[{id:"edit",label:"Edit playlist\u2026"},{id:"toggle-hide",label:x?.hidden?"Show in Playlists":"Hide from Playlists"},{id:"unlink",label:"Unlink artist"},{id:"visit-ia",label:"Visit on the Internet Archive"}];la(i,A,async _=>{if(_==="visit-ia"){window.open(E,"_blank","noopener");return}if(_==="edit"){wn(w);return}if(k){if(_==="toggle-hide"){let T=!x?.hidden,z=await Zr(k.store,k.baseURI,w,T);if(!Ue(z,`${T?"hide":"show"} playlist "${x?.name||""}"`))return;x&&(x.hidden=T),T&&U===w&&(U="library",ut("library")),Pe(),$(f,T?`"${x?.name}" hidden from Playlists (still an artist).`:`"${x?.name}" shows in Playlists again.`)}else if(_==="unlink"){if(!confirm(`Unlink the artist from "${x?.name}"?
The playlist and its tracks stay; it just stops appearing as an artist.`))return;let T=await Qr(k.store,k.baseURI,w);if(!Ue(T,`unlink artist from "${x?.name||""}"`))return;let z=te.indexOf(c);z>=0&&te.splice(z,1),T.node&&Sa(T.node.value),x&&(x.artistNode=null,x.hidden=!1),ge(),De(),Pe(),$(f,`Unlinked artist from "${x?.name}". Playlist kept.`)}}});return}let d=fr(c);la(i,[{id:"rename",label:"Rename"},{id:"delete",label:"Delete"},{id:"visit-ia",label:"Visit on the Internet Archive"}],async w=>{if(w==="visit-ia"){window.open(d,"_blank","noopener");return}let x=$a(c);if(x){if(w==="rename")hn(Po(e),c.label,{onCommit:async k=>{let E=await Yr(x.store,x.baseURI,c.node,k);if(!Ue(E,`rename artist "${c.label}"`)){ge();return}Qe(x),ge()}});else if(w==="delete"){if(!confirm(`Delete artist "${c.label}"?`))return;let k=await Oi(x.store,x.baseURI,c.node);if(!Ue(k,`delete artist "${c.label}"`))return;Qe(x),ge(),De()}}})}function xn(){if(Ht.querySelector(".ia-column-addform"))return;Ht.innerHTML=`
      <form class="ia-column-addform" autocomplete="off">
        <input type="text" class="ia-column-addinput" placeholder="Genre name" aria-label="New genre name" required>
        <button type="submit" class="ia-column-addsave" aria-label="Add">\u2713</button>
        <button type="button" class="ia-column-addcancel" aria-label="Cancel">\u2717</button>
      </form>
    `;let e=Ht.querySelector("form"),i=e.querySelector("input"),c=()=>kn();i.focus(),e.addEventListener("submit",async d=>{d.preventDefault();let h=i.value.trim();if(!h){c();return}let w=je();if(!w){$(f,"Enable a library first."),c();return}let x=await zi(w.store,w.baseURI,h);kn(),Ue(x,`add genre "${h}"`)&&(bt.push({id:x.id,label:h,_lib:w.config.id}),qe())}),e.querySelector(".ia-column-addcancel").addEventListener("click",c),i.addEventListener("keydown",d=>{d.key==="Escape"&&c()})}function kn(){Ht.innerHTML='<button type="button" class="ia-add-genre-btn">+ Add genre</button>',Ht.querySelector(".ia-add-genre-btn").addEventListener("click",xn)}Xa.addEventListener("click",xn);function Sn(){if(Gt.querySelector(".ia-column-addform"))return;let e=bt.filter(k=>!gt.has(k.id));if(!e.length){$(f,"Add a genre first.");return}let i=e.slice().sort(Xt).map(k=>`<option value="${H(k.id)}">${H(k.label)}</option>`).join("");Gt.innerHTML=`
      <form class="ia-column-addform ia-column-addartist" autocomplete="off">
        <input type="text" class="ia-column-addinput" placeholder="archive.org URL or ID" aria-label="Artist URL or ID" required>
        <select class="ia-column-addselect" aria-label="Genre">${i}</select>
        <button type="submit" class="ia-column-addsave" aria-label="Add">\u2713</button>
        <button type="button" class="ia-column-addcancel" aria-label="Cancel">\u2717</button>
      </form>
    `;let c=Gt.querySelector("form"),d=c.querySelector("input"),h=c.querySelector("select"),w=[...ot.getSelection()];w.length===1&&e.some(k=>k.id===w[0])&&(h.value=w[0]);let x=()=>ur();d.focus(),c.addEventListener("submit",async k=>{k.preventDefault();let E=d.value.trim();if(!E){x();return}let A=Xi(E),_;if(A)_=A.url;else try{_=new URL(E).href}catch{$(f,`Not a valid URL: "${E}". Enter a full http(s) URL or an archive.org item id.`),d.focus(),d.select();return}let T=A?A.id:(prompt("Display name for this artist:","")||"").trim();if(!T){x();return}let z=h.value,ae=je();if(!ae){$(f,"Enable a library first."),x();return}let V;try{V=await qi(ae.store,ae.baseURI,z,T,_)}catch(ee){ur(),$(f,`Couldn't add artist "${T}": ${ee.message||ee}`);return}ur(),Ue(V,`add artist "${T}"`)&&(te.push({node:V.node,label:T,topic:z,url:_,source:null,_lib:ae.config.id}),ge())}),c.querySelector(".ia-column-addcancel").addEventListener("click",x),d.addEventListener("keydown",k=>{k.key==="Escape"&&x()})}function ur(){Gt.innerHTML='<button type="button" class="ia-add-artist-btn">+ Add artist</button>',Gt.querySelector(".ia-add-artist-btn").addEventListener("click",Sn)}Qa.addEventListener("click",Sn),Et.addEventListener("click",async()=>{let e=prompt(`Add a library:

  1 = create a new empty library
  2 = add an existing one by URL`,"1");if(e!=null)if(e.trim()==="1"){let i=prompt("New library name:");if(!i||!i.trim())return;await Ao(i.trim())}else{let i=prompt("Library RDF URL (its index.ttl):");if(!i||!i.trim())return;let c=i.trim().split("/").filter(Boolean).pop()||"Library",d=prompt("Display name:",c);if(!d||!d.trim())return;await vn(d.trim(),i.trim())}});async function Ro(e,i){if(!Ie.has(e))return;let c=i.getData("application/x-ia-tracks");if(!c)return;let d;try{d=JSON.parse(c)}catch{return}if(!Array.isArray(d)||!d.length)return;let h=d.map(T=>N.find(z=>z.id===T)).filter(Boolean);if(!h.length)return;let w=Ft(e);if(!w)return;$(f,`Adding ${h.length} track${h.length===1?"":"s"} to playlist\u2026`);let x=h.map(T=>({label:[T.artist,T.album,T.name].filter(Boolean).join(" \u2014 ")||T.name,url:T.url,source:T.albumUrl,artist:T.artist,album:T.album,name:T.name,time:T.time})),k=!rt(),E=await Wa(w.store,w.baseURI,e,x,{inlineTracks:k}),A=E.added||[];A.forEach((T,z)=>{te.push({node:E.nodes?.[z],label:T.label,topic:e,url:T.url,source:T.source,_lib:w.config.id})});let _=E.skipped||0;if(E.ok)A.length?$(f,`Added ${A.length} track${A.length===1?"":"s"}`+(_?` (${_} already in playlist)`:"")+"."):$(f,_?`All ${_} track${_===1?"":"s"} already in this playlist.`:"Nothing to add.");else{let T=E.err||"persistence failed";$(f,A.length?`Saved ${A.length} track${A.length===1?"":"s"}, then the server failed: ${T}. Retry to add the rest.`:`Couldn't add tracks to playlist: ${T}. No changes saved.`),console.warn("add tracks to playlist (partial/failed):",E)}A.length&&sr(e),U===e&&ta(e)}ht.addEventListener("click",()=>{if(!rt()){$(f,"Sign in to create playlists.");return}let e=je();if(!e){$(f,"Enable a library to add playlists.");return}Lr({title:"New playlist",values:{name:`Playlist ${Me.length+1}`,maker:"jeffz",description:""},onSave:async({name:i,maker:c,description:d})=>{let h=await Jr(e.store,e.baseURI,{name:i,maker:c,description:d});Ue(h,`add playlist "${i}"`)&&(Me.push({id:h.id,name:h.name,maker:h.maker,description:h.description,label:h.label,_lib:e.config.id}),Ie.add(h.id),Pe(),$(f,`Added playlist "${h.label}". Drag tracks onto it to fill it.`))}})});function ut(e){U=e,Dt=null,ka=!1,b.classList.remove("source-no-browser"),b.classList.remove("source-favorites"),e==="library"?(N=ie,Oe=kt(),fe()):e==="favorites"?(b.classList.add("source-favorites"),Tn()):Ie.has(e)?(ta(e),$(f,"Tip: select tracks (Shift/Ctrl-click) and press Delete to remove them.")):(U="library",Pe(),N=ie,fe()),Qt(),Ae()}let ot=Lt(le,{onChange:Ko,allLabel:"(All genres)",renderItemActions:e=>gt.has(e.id)?"":_a(e.label),onItemAction:(e,i,c)=>{e==="edit"&&Uo(i,c)}});function fr(e){let i=e.url||"";if(/(?:^|\/\/)(?:www\.)?archive\.org\//.test(i))return i;let c=`${e.label||""} AND mediatype:${n()==="video"?"movies":"audio"}`;return`https://archive.org/search?query=${encodeURIComponent(c)}`}function No(e){let i=fr(e),c="Visit on the Internet Archive",d=`<button type="button" class="ia-row-ialink" data-action="ialink" data-url="${H(i)}" title="${c}" aria-label="${c}" tabindex="-1">\u2197</button>`;return _a(e.label)+d}let Ze=Lt(ue,{onChange:Wo,allLabel:"(All artists)",renderItemActions:No,onItemAction:(e,i,c)=>{if(e==="edit")Mo(i,c);else if(e==="ialink"){let d=c?.dataset?.url;d&&window.open(d,"_blank","noopener")}}}),be=Lt(ve,{onChange:Vo,allLabel:"(All albums)",renderItemActions:e=>{if(n()!=="video")return"";let i=!!e._album&&v.has(e._album.url);return`<button type="button" class="ia-row-fav${i?" on":""}" data-action="fav" title="Add to the communal favourites" aria-label="Favourite" tabindex="-1">${i?"\u2605":"\u2606"}</button>`},onItemAction:(e,i)=>{e==="fav"&&qo(i)}});function qe(){let e=bt.filter(i=>!gt.has(i.id)).map(i=>({id:i.id,label:i.label,title:i.label})).sort(Xt);ot.setItems(e)}function Aa(e){return!gt.has(e.topic)&&!Ie.has(e.topic)}function Fo(e){return gt.has(e.topic)}function zo(e){let i=bt.find(c=>c.id===e);return i?xa(i._lib):je()}function $a(e){return e._lib?xa(e._lib):je()}function Ft(e){let i=Me.find(c=>c.id===e);return i?xa(i._lib):je()}function Bo(e){let i=te.find(c=>Fo(c)&&c.url===e);return i?xa(i._lib):je()}async function Ea(){try{y=(await Fa()).filter(i=>i.bucket===p()),v=new Set(y.flatMap(i=>[i.item,i.link].filter(Boolean)))}catch{}try{fe(),jo(),yn()}catch{}}function jo(){n()==="video"&&be.setItems(be.getItems())}function qo(e){let c=be.getItems().find(d=>d.id===e)?._album;if(c){if(v.has(c.url)){Ca(c.url);return}r?.dispatchEvent(new CustomEvent("item-favourite",{detail:{item:c.url,bucket:"MovingImage",schemaType:"VideoObject",name:c.name||c.url,link:c.url,download:!1,thumbnail:c.thumbnail||""},bubbles:!0,composed:!0}))}}async function Ln(e){let i=e.url||"";if(/\/download\//.test(i)||/\.(mp4|m4v|ogv|ogg|webm|mov|mkv|avi|mpe?g)(\?|#|$)/i.test(i)){let w={id:i,url:i,name:e.name||i,time:"",artist:"",album:e.name||"",albumUrl:""};He(w,{autoplay:!1}),hr(w,{name:e.name});return}let d={url:i,name:e.name};$(f,"Loading film\u2026");let h=null;try{h=In(await Zt(d))}catch{}if(!h){$(f,""),ra(`Can't play \u201C${e.name}\u201D \u2014 no playable video found at the Internet Archive.`);return}$(f,""),He(h,{autoplay:!1}),hr(h,d)}function Oo(e){if(!e||!e.url)return;if(Ta(e.url)){Ca(e.url);return}let i=n()==="video";r?.dispatchEvent(new CustomEvent("item-favourite",{detail:{item:e.url,bucket:i?"MovingImage":"Sound",schemaType:i?"VideoObject":"AudioObject",name:e.name||e.url,link:e.url,download:!0},bubbles:!0,composed:!0}))}function Ta(e){return v.has(e)}async function Ca(e){let i=y.find(d=>d.item===e||d.link===e);if(!i)return!1;let c=0;for(let d of i.contributors||[])if(d.file)try{await da(d.file),c++}catch(h){$(f,`Couldn't remove favourite: ${h.message}`)}return c&&document.dispatchEvent(new CustomEvent("omp:favourited")),c>0}function pr(){let e=ot.getSelection();return e.size===0?te.filter(Aa):te.filter(i=>e.has(i.topic)&&Aa(i))}function mr(e){if(!e)return!1;if(e.sourcePlaylist)return!0;let i=d=>(d||"").trim().toLowerCase(),c=i(e.label);for(let d of Me)if(d.name&&i(d.name)===c||d.maker&&i(d.maker)===c)return!0;if(e.localData&&e.node){let d=$a(e);try{return!!d?.store&&Xr(d.store,e.node).length>0}catch{return!1}}return!1}function ge(){let i=pr().map(w=>({id:Rt(w),label:w.label,title:w.label,url:w.url,_b:w})),c=i.filter(w=>mr(w._b)).sort(Xt),d=i.filter(w=>!mr(w._b)).sort(Xt),h=n()==="video";d.forEach((w,x)=>{w.className="ia-item-raw",w.ariaLabel=`${w.label} \u2014 raw archive.org search, not curated`,x===0&&!h&&(w.section="Raw \u2014 uncurated archive.org searches")}),Ze.setItems([...c,...d])}async function _n(e){let i=Rt(e);if(xt.has(i))return xt.get(i);if(e.localData&&e.node){let h=$a(e);if(h?.store){let w=(async()=>{let x=e.sourcePlaylist?Ka(h.store,[String(e.sourcePlaylist).split("#")[0]]):Ni(h.store,h.baseURI);return await wa(h,x)&&ge(),Xr(h.store,e.node).map(E=>({...E,_artist:e}))})();return xt.set(i,w),w}}let c=Ir(e.url);if(!c){let h=Promise.resolve([]);return xt.set(i,h),h}let d=Pr(c,Mt,{mediaType:n()}).then(h=>h.map(w=>({...w,_artist:e}))).catch(h=>(console.error("getAlbums",h),[]));return xt.set(i,d),d}let Ia=0,et=null;function Ho(){return ve.closest(".ia-column")}function Pa(e){let i=Ho();if(!i)return;let c=i.querySelector(".ia-album-note");if(!e){c?.remove();return}c||(c=document.createElement("div"),c.className="ia-album-note",i.querySelector(".ia-column-header")?.after(c)),c.textContent=e}function An(){et&&(et=null,Pa(""))}function $n(){be.setItems(et.map(e=>{let i=n()==="video"?e.name:`${e._artist.label} \u2014 ${e.name}`;return{id:e.url,label:i,title:i,_album:e}}))}async function De(){if(U==="favorites")return;if(et){$n(),St();return}let e=rr(),i=Ze.getSelection();if(i.size===0){be.setMessage(e.chooseArtist),St();return}let c=++Ia;be.setMessage(e.loadingAlbums);let h=pr().filter(k=>i.has(Rt(k))),w=await Promise.all(h.map(_n));if(c!==Ia)return;let x=w.flat();if(!x.length){be.setMessage(e.noAlbums),St();return}be.setItems(x.map(k=>{let E=n()==="video"?k.name:`${k._artist.label} \u2014 ${k.name}`;return{id:k.url,label:E,title:E,_album:k}})),(Dt||ka)&&n()!=="video"&&be.setSelection(x.map(k=>k.url),{notify:!1}),St()}async function Zt(e){let i=e.url;if(Ut.has(i))return Ut.get(i);if(e._local&&e._releaseNode){let A=$a(e._artist);if(A?.store){let _=String(e._releaseNode.value||e._releaseNode).split("#")[0],T=(async()=>(await wa(A,[_]),Yi(A.store,e._releaseNode).map(z=>({id:z.url,url:z.url,name:z.name,time:z.time||"",artist:e._artist?.label||"",album:e.name,albumUrl:e.url,node:z.node||null,_lib:e._artist?._lib}))))();return Ut.set(i,T),T}}let c=wo(e.url);if(!c)return Promise.resolve([]);let d=Array.isArray(e._creator)?e._creator[0]:e._creator,h=d?String(d).trim():"",x=/^(various(\s+artists?)?|v\.?a\.?)$/i.test(h)?"":h,k=e._artist?.label||"",E=Li(c,Mt,{mediaType:n()}).then(A=>(A||[]).map(_=>({id:_.url,url:_.url,name:_.name,time:_.time||"",artist:_.artist||x||k,album:e.name,albumUrl:e.url,_lib:e._artist?._lib,_rights:_._rights||e._rights||null,_detailUrl:_._detailUrl||e._detailUrl||e.url||""}))).catch(A=>(console.error("getTracks",A),[]));return Ut.set(i,E),E}let En=0,Oe="Choose an album to add tracks.";function kt(){return Ze.getSelection().size===0?"Choose an artist to see albums.":be.getSelection().size===0?"Choose an album to add tracks.":"No tracks in selected album(s)."}async function St(){if(U!=="library"||n()==="video")return;let e=be.getSelection();if(!e.size){N=ie,Oe=kt(),fe();return}let i=++En;ie.length||(Oe="Loading tracks\u2026",N=ie,fe());let d=be.getItems().filter(k=>e.has(k.id)).map(k=>k._album),h=await Promise.all(d.map(Zt));if(i!==En)return;let w=new Set(ie.map(k=>k.id)),x=h.flat().filter(k=>!w.has(k.id));x.length&&(ie=ie.concat(x),Ae()),N=ie,Oe=kt(),oa(),fe()}function Tn(){if(n()==="video"){br(),b.classList.remove("has-video");try{g.pause()}catch{}}Cn(),Ea()}function Cn(){let e=new Map(ie.map(i=>[i.url,i]));N=y.map(i=>{let c=i.item||i.link,d=e.get(c)||i.link&&e.get(i.link)||i.item&&e.get(i.item);return d||{id:c,url:i.link||i.item,name:i.canonicalTitle||"Untitled",time:"",artist:"",album:"Favorites",albumUrl:"",thumbnail:i.thumbnail||""}}),Oe=u?"No favourite films yet \u2014 tap \u2606 on a film to add one.":"No favourites yet \u2014 tap \u2606 on a track to add one.",oa(),fe()}function Go(e){let i=e.name||"",c=e.artist||"",d=e.album||"";if(!i&&!c&&!d){let h=(e.label||"").split(" \u2014 ");h.length>=3?(c=h[0],d=h[1],i=h.slice(2).join(" \u2014 ")):h.length===2?(d=h[0],i=h[1]):i=e.label||""}return{id:e.url,url:e.url,name:i||e.label,artist:c,album:d,albumUrl:e.source||"",time:"",node:e.node||null,_lib:e._lib}}let ea=0;function ta(e){let i=++ea,c=Ft(e);if(c?.loadDocs){let d=co(c,e),h=te.some(w=>w.topic===e&&w.url);if(d.length&&!h){N=[],Oe="Loading playlist\u2026",fe(),wa(c,d).then(()=>{i!==ea||U!==e||(Da(e,i),ge())}).catch(()=>{i===ea&&U===e&&Da(e,i)});return}d.length&&wa(c,d).then(w=>{w&&i===ea&&U===e&&Da(e,i)}).catch(()=>{})}Da(e,i)}function Da(e,i){N=te.filter(h=>h.topic===e).map(Go),Oe="This playlist is empty.",oa(),fe();let d=new Map;for(let h of N)h.albumUrl&&(d.has(h.albumUrl)||d.set(h.albumUrl,[]),d.get(h.albumUrl).push(h));for(let[h,w]of d){let x={url:h,name:w[0].album||"",_artist:{label:w[0].artist||""}};Zt(x).then(k=>{if(i!==ea)return;let E=new Map(k.map(_=>[_.url,_])),A=!1;for(let _ of w){let T=E.get(_.url);T&&(T.time&&!_.time&&(_.time=T.time,A=!0),T.name&&_.name!==T.name&&(_.name=T.name,A=!0))}A&&U===e&&(oa(),fe())}).catch(()=>{})}}function fe(){let e=U==="favorites",i=rt();if(Qn(re,mt,N,{currentTrackId:Se?.id,isFav:c=>Ta(c.url),favouritable:!0,wallDelete:e&&i,emptyMessage:Oe,useKebab:c=>e||!c.node?!1:Fn(c)?!0:!!(c.albumUrl&&/(?:^|\/\/)(?:www\.)?archive\.org\//.test(c.albumUrl))}),Nn?.applySelection(),S){let c=N.length;if(!c)S.textContent="";else{let d=0;for(let E of N)d+=ia(E.time);let h=Math.round(d/60),w=Math.floor(h/60),x=h%60,k=d>0?w>0?` \xB7 ${w}h ${String(x).padStart(2,"0")}m`:` \xB7 ${x}m`:"";S.textContent=`${c} track${c===1?"":"s"}${k}`}}}function aa(){return U==="library"?!1:(U="library",it.setSelection([],{notify:!1}),Qt(),!0)}function Ko(e){aa(),An(),ge(),De(),Ae()}function Wo(e){if(aa(),An(),Dt=null,ka=!1,e&&e.size===1){let i=pr().filter(c=>e.has(Rt(c)));i.length===1&&(ka=mr(i[0]),i[0].sourcePlaylist&&(Dt=i[0].sourcePlaylist))}De(),Ae()}function Vo(e){if(n()==="video"){Yo(e);return}aa()&&(ie=[]),St(),Ae()}function In(e){if(!e||!e.length)return null;let i=e[0],c=ia(i.time);for(let d of e){let h=ia(d.time);h>c&&(i=d,c=h)}return i}let Pn=0;async function Yo(e){aa();let i=[...e],c=i[i.length-1];if(!c){N=[],fe(),Ae();return}be.setSelection([c],{notify:!1});let h=be.getItems().find(E=>E.id===c)?._album;if(!h)return;let w=++Pn;$(f,"Loading film\u2026");let x=await Zt(h);if(w!==Pn)return;let k=In(x);if(!k){$(f,""),ra(`Can't play \u201C${h.name}\u201D \u2014 no playable video found at the Internet Archive.`);return}N=[k],$(f,""),He(k,{autoplay:!1}),hr(k,h),Ae()}let Jo=null;function hr(e,i){if(!I)return;F.textContent=i?.name||e.album||e.name||"Untitled",j.textContent=e.time?`Running time: ${e.time}`:"";let c=e.albumUrl||i?.url||"";if(ce.innerHTML=c?`See more about this film at the <a href="${H(c)}" target="_blank" rel="noopener">Internet Archive</a>`:"",ne){let d=e._rights||i?._rights||null;ne.textContent=`\u2696 ${d?d.label:"Rights unknown"}`}Jo={track:e,album:i},b.classList.add("film-intro")}function br(){b.classList.remove("film-intro")}if(I){let e=()=>{br(),g.play().catch(()=>{})};I.addEventListener("click",e),I.addEventListener("keydown",i=>{(i.key==="Enter"||i.key===" ")&&(i.preventDefault(),e())}),g.addEventListener("play",br)}function Xo(){Se&&(Pt.push({track:Se}),Pt.length>200&&Pt.shift())}let gr=null;function ra(e,i={}){let c=b.querySelector(".ia-notice");c||(c=document.createElement("div"),c.className="ia-notice",c.setAttribute("role","alert"),c.innerHTML='<span class="ia-notice-icon" aria-hidden="true">\u26A0</span><span class="ia-notice-msg"></span><button type="button" class="ia-notice-close" aria-label="Dismiss">\u2715</button>',c.querySelector(".ia-notice-close").addEventListener("click",()=>yr()),b.appendChild(c)),c.querySelector(".ia-notice-msg").textContent=e,c.classList.add("show"),clearTimeout(gr),i.sticky||(gr=setTimeout(yr,i.duration||4e3))}function yr(){clearTimeout(gr),b.querySelector(".ia-notice")?.classList.remove("show")}function He(e,i={}){if(!e)return;yr();let c=i.autoplay!==!1;Se&&Se.id!==e.id&&!i.fromHistory&&Xo(),Se=e,c&&(fo=!0),g.src=e.url,g.load(),Yt=n()==="video",b.classList.toggle("has-video",Yt),Ma(D,Dn(e)),$(f,""),Ae(),fe(),c&&g.play().catch(d=>{if(d.name==="NotAllowedError"||d.name==="AbortError"){console.warn("Playback deferred:",d.name),$(f,"Press \u25B6 to start playback");return}$(f,`Error playing ${e.name}`),ra(`Can't play \u201C${e.name}\u201D. The media may be unavailable or in an unsupported format.`),console.error("Playback error:",d)})}function Dn(e){let i=e.albumUrl?` <a class="ia-link" href="${H(e.albumUrl)}" target="_blank" rel="noopener">[IA]</a>`:"",c=e._rights?` \xB7 <span class="ia-np-rights">\u2696 ${H(e._rights.label)}</span>`:"";if(n()==="video")return`Now playing: ${H(e.album||e.name||"Untitled")}${c}${i}`;let d=[e.artist,e.album,e.name].filter(Boolean).map(H),h=N.findIndex(x=>x.id===e.id),w=h>=0&&N.length>1?` (${h+1}/${N.length})`:"";return`Now playing: ${d.join(" \u2014 ")}${w}${c}${i}`}async function Ua(){let e=te.filter(i=>Aa(i)&&i.url);if(!(!e.length||ir)){ir=!0;try{for(let i=0;i<6;i++){let c=lr(e),d=await _n(c);if(!d.length)continue;let h=lr(d),w=await Zt(h);if(!w.length)continue;let x=lr(w);U!=="library"&&(it.setSelection(["library"],{notify:!1}),ut("library")),ot.setSelection([c.topic],{notify:!1}),ge(),Ze.setSelection([Rt(c)],{notify:!1}),await De(),be.setSelection([h.url],{notify:!1}),await St(),He(x);return}$(f,"Could not find a random track to play")}finally{ir=!1}}}function Qo(){return Se?N.findIndex(e=>e.id===Se.id):-1}function vr(){if(It==="random"){Ua();return}if(Vt==="one"&&Se){g.currentTime=0,g.play().catch(()=>{});return}let e=Qo();if(e<0){N[0]&&He(N[0]);return}if(e+1<N.length){He(N[e+1]);return}if(Vt==="all"&&N[0]){He(N[0]);return}$(f,"Reached the end of the list")}function Zo(){if(!Pt.length){$(f,"No previous track");return}let e=Pt.pop();He(e.track,{fromHistory:!0})}function wr(e){It=e,Ae()}function Un(e){Vt=e,Ae()}Jn(ke),ke.addEventListener("mouseup",()=>Ae());let Mn=b.querySelector(".ia-sources-resize");Mn&&Mn.addEventListener("mousedown",e=>{e.preventDefault();let i=e.clientX,c=b.querySelector(".ia-sources")?.offsetWidth||260,d=w=>{let x=Math.max(140,Math.min(600,c+(w.clientX-i)));b.style.setProperty("--ia-sources-width",x+"px")},h=()=>{document.removeEventListener("mousemove",d),document.removeEventListener("mouseup",h),b.classList.remove("resizing-sources"),Ae()};document.addEventListener("mousemove",d),document.addEventListener("mouseup",h),b.classList.add("resizing-sources")});let Rn=b.querySelector(".ia-browser-resize");Rn&&Rn.addEventListener("mousedown",e=>{e.preventDefault();let i=e.clientY,c=b.querySelector(".ia-browser")?.offsetHeight||220,d=w=>{let x=Math.max(120,Math.min(640,c+(w.clientY-i)));b.style.setProperty("--ia-browser-height",x+"px")},h=()=>{document.removeEventListener("mousemove",d),document.removeEventListener("mouseup",h),b.classList.remove("resizing-browser"),Ae()};document.addEventListener("mousemove",d),document.addEventListener("mouseup",h),b.classList.add("resizing-browser")});let Ce=Wt();if(Ce){let e=!ro;ro=!0,e&&(Ce._manualInit=!0,Ce.addEventListener("click",()=>{try{Ce.isLoggedIn||en()}catch{}},!0)),document.addEventListener("omp:reapply-gating",va);let i=!1,c=async d=>{$(f,"Loading library from your pod\u2026");let h=await uo(d);return h.ok||$(f,`Couldn't load the pod library: ${h.err}. Staying on the local library.`),!!h.ok};document.addEventListener("sol-login",async d=>{let h=d.detail?.webId||Ce.webId||"";if(!h)return;let w=rl();if(w){try{let x=(w.search||"")+(w.hash||"");x&&location.search+location.hash!==x&&Pt.replaceState(null,"",location.pathname+x)}catch{}ao()}console.info("[omp] sol-login handler upgrade fired: webId=",h);try{Kr(!0),vt=!0,ct=!1,Ct=!1;let x=yt().find(k=>k.store&&!k.config.solid&&$t(k.config.url));if(x){try{to(h,new URL(x.config.url,location.href).href)}catch{}Qe(x)}cn(),va(),$(f,`Signed in: ${h} \u2014 your library is now writable.`)}catch(x){console.warn("[omp] pod login upgrade failed:",x),$(f,`Signed in, but: ${x.message}.`)}if(e&&!i&&il()){i=!0,setTimeout(async()=>{try{await qn()}finally{i=!1}},1500);return}if(e&&!i&&sl()){i=!0,setTimeout(async()=>{try{await On()}finally{i=!1}},1500);return}}),document.addEventListener("sol-logout",()=>{Ye=null,Kr(!1),vt=!1,ct=!0,Ct=!1;let d=yt().find(h=>h.store&&!h.config.solid&&$t(h.config.url));d&&Qe(d),cn(),va(),$(f,"Signed out. Viewing in guest mode \u2014 you may browse, search, listen, and favourite anything.")}),e&&Promise.resolve().then(()=>Ce.initialize()).then(()=>document.dispatchEvent(new CustomEvent("omp:reapply-gating"))).catch(d=>console.warn("sol-login init skipped (no auth library?):",d?.message||d)),Ce.isLoggedIn||(ct=!0,$(f,"Viewing in guest mode. You may browse, search, listen, and favourite anything."))}let xr=b.querySelector(".ia-artist-search");if(xr){let e=xr.querySelector("input");xr.addEventListener("submit",async i=>{i.preventDefault();let c=e.value.trim();if(!c)return;let d=je(),h=new URL("https://archive.org/search");h.searchParams.set("query",`creator:"${c}"`),h.searchParams.append("and[]",`mediatype:"${n()==="video"?"movies":"audio"}"`),aa(),ot.setSelection([],{notify:!1}),Ze.setSelection([],{notify:!1}),it.setSelection([],{notify:!1}),Qt(),et=[],Pa(`Searching \u201C${c}\u201D\u2026`),be.setMessage("Searching\u2026");let w=++Ia,x=[];try{x=await Pr(Ir(h.href),Mt,{mediaType:n()})}catch(E){console.error("find-artist search",E)}if(w!==Ia)return;let k={label:c,_lib:d?.config.id};if(et=x.map(E=>({...E,_artist:k})),!et.length){Pa(""),be.setMessage(`No audio results for \u201C${c}\u201D.`);return}Pa("Temporary search results \u2014 add tracks to a playlist to keep them."),$n(),St(),$(f,`${et.length} result${et.length===1?"":"s"} for \u201C${c}\u201D.`)})}let na=Xn(he,{onSort:()=>{oa(),fe(),Ae()}});function ia(e){if(!e)return 0;let i=String(e).split(":").map(Number);if(i.length===2)return i[0]*60+i[1];if(i.length===3)return i[0]*3600+i[1]*60+i[2];let c=parseFloat(e);return isFinite(c)?c:0}function es(e,i,c){if(c==="time")return ia(e.time)-ia(i.time);if(c==="fav"){let w=Ta(e.url)?1:0,x=Ta(i.url)?1:0;return w-x}let d=(e[c]||"").toString(),h=(i[c]||"").toString();return d.localeCompare(h,void 0,{sensitivity:"base",numeric:!0})}function oa(){let{col:e,dir:i}=na.getSort();if(!e)return;let c=i==="asc"?1:-1;N=N.slice().sort((d,h)=>c*es(d,h,e)),U==="library"&&(ie=N)}let Nn=Yn(re,{onPlay:e=>{let i=N.find(c=>c.id===e);if(i){if(It==="random"&&wr("ordered"),n()==="video"){Ln(i);return}He(i)}},onRemove:(e,i)=>{zn(e,i)},onEdit:(e,i)=>{ts(e,i)},onFavourite:e=>Oo(e)});Ea(),document.addEventListener("omp:favourited",Ea);function Fn(e){return!e||!e.node?!1:rt()?!0:U&&Ie.has(U)?e.node.value.startsWith(U+"#"):!1}function ts(e,i){let c=N.find(E=>E.id===e);if(!c)return;let d=c.albumUrl||"",h=/(?:^|\/\/)(?:www\.)?archive\.org\//.test(d),w=U&&Ie.has(U),x=[];Fn(c)&&x.push({id:"edit",label:"Edit\u2026"}),h&&x.push({id:"visit",label:"Visit on the Internet Archive"}),x.push({id:"remove",label:w?"Remove from playlist":"Remove from list",danger:!0});let k=E=>{if(E==="visit"){d&&window.open(d,"_blank","noopener");return}if(E==="remove"){zn([e],{fromButton:!0});return}if(E==="edit"){as(e);return}};if(x.length<=1){k(x[0]?.id||"remove");return}la(i,x,k)}async function as(e){let i=N.find(w=>w.id===e);if(!i||!i.node){$(f,"Can't edit this track (no RDF node).");return}let c=Ft(U)||je();if(!c)return;let d=Vi(c.store,i.node),h=U&&Ie.has(U);ii({values:{title:i.name,artist:i.artist,album:i.album},siblingCount:d,actions:[],onSave:async({title:w,artist:x,album:k})=>{let E=await Wi(c.store,c.baseURI,i.node,{title:w,artist:x,album:k});if(!Ue(E,`edit "${i.name}"`))return;let A=te.find(_=>_.node&&_.node.value===i.node.value);if(A&&(A.name=w,A.artist=x,A.album=k,A.label=[x,k,w].filter(Boolean).join(" \u2014 ")||w),k!=null)for(let _ of te)_.source&&i.albumUrl&&_.source===i.albumUrl&&(_.album=k,_.label=[_.artist,_.album,_.name].filter(Boolean).join(" \u2014 ")||_.name);if(h)sr(U),ta(U);else{for(let _ of N)_.node&&_.node.value===i.node.value&&(_.name=w,_.artist=x),k!=null&&i.albumUrl&&_.albumUrl===i.albumUrl&&(_.album=k);i.albumUrl&&Ut.delete(i.albumUrl),fe()}$(f,`Updated "${w}".`)}})}async function zn(e,i={}){if(!e||!e.length)return;let c=new Set(e);if(U==="library"&&!Dt){ie=ie.filter(A=>!c.has(A.id)),N=ie,Oe=kt(),fe(),Ae();return}if(U==="favorites"){if((i.fromButton||e.length>1)&&!confirm(e.length===1?"Remove this favourite from the communal wall?":`Remove ${e.length} favourites from the communal wall?`))return;let _=N.filter(T=>c.has(T.id));for(let T of _)await Ca(T.url);return}let d=U==="library"?Dt:null;if(i.fromButton||e.length>1){let A=d||U,_=Me.find(z=>z.id===A)?.label||(U==="favorites"?"Favorites":"this playlist"),T=e.length===1?`Remove this track from "${_}"?`:`Remove ${e.length} tracks from "${_}"?`;if(!confirm(T))return}let w=N.filter(A=>c.has(A.id)),x=U==="favorites"?qr(je()?.baseURI):d||U,k=[];for(let A of w){let _=U==="favorites"?Bo(A.url):Ft(x);if(!_)continue;let T=await Ki(_.store,_.baseURI,x,A.url);if(Ue(T,`remove "${A.name}" from playlist`)){k.push(A);for(let z=te.length-1;z>=0;z--)if(te[z].url===A.url&&te[z].topic===x){te.splice(z,1);break}}}let E=new Set(k.map(A=>A.id));N=N.filter(A=>!E.has(A.id)),d&&(ie=ie.filter(A=>!E.has(A.id))),k.length&&U!=="favorites"&&sr(x),fe()}Zn({audio:g,playBtn:ze,prevBtn:xe,nextBtn:Ke,seekSlider:C,timeCur:G,timeDur:Z,volumeSlider:L},{onPlayToggle:()=>{if(!Se){N[0]?He(N[0]):Ua();return}if(!g.src||g.src!==Se.url){He(Se);return}g.paused?g.play().catch(()=>{}):g.pause()},onPrev:()=>Zo(),onNext:()=>vr()}),g.addEventListener("volumechange",()=>Ae());let Bn=0;g.addEventListener("timeupdate",()=>{let e=Date.now();e-Bn<5e3||(Bn=e,Ae())}),g.addEventListener("pause",()=>Ae());let sa=0,rs=5;g.addEventListener("playing",()=>{sa=0}),g.addEventListener("error",()=>{if(!g.src||!Se)return;let e=g.error;if(console.warn("Audio error",e?.code,e?.message,"for",Se.url),sa++,sa>=rs){$(f,`Stopped: ${sa} tracks in a row couldn't be played.`),ra(`Stopped \u2014 ${sa} items in a row couldn't be played. The source may be offline.`,{sticky:!0});return}$(f,`Skipped (couldn't play "${Se.name}")`),n()==="video"&&ra(`Can't play \u201C${Se.name}\u201D. The media may be unavailable or in an unsupported format.`),It==="random"?Ua():vr()}),g.addEventListener("ended",()=>{if(Vt==="one"){g.currentTime=0,g.play().catch(()=>{});return}if(It==="random"){Ua();return}vr()}),ma.addEventListener("click",()=>{at(!1),Ra()}),Y?.addEventListener("click",()=>{at(!1),Ra({url:"./assets/ia-help.html",title:"Help",useBundle:!1,size:"large"})}),Ee?.addEventListener("click",()=>{at(!1),Ra({url:"./assets/ia-login-help.html",title:"Solid login help",useBundle:!1,size:"large"})}),Xe?.addEventListener("click",()=>{at(!1);let e=je();if(!e?.store){$(f,"Enable a library to view deleted items.");return}for(let c of yt())Qe(c);let i=Ot(e.baseURI);if(!Ie.has(i)){$(f,"Nothing has been deleted yet.");return}ut(i)});async function jn(){let e=location.href.split("#")[0].split("?")[0],i=/\/[^/]*\.[^/]+$/.test(e)?e:new URL("index.html",e.endsWith("/")?e:e+"/").href,c=await fetch(i),d=await c.text();if(!c.ok||!/<html[\s>]|<ia-player[\s>]|<script[\s>]/i.test(d))throw new Error(`won't install: ${i} returned ${c.status} and not HTML (${d.length} bytes). The app page must be reachable as a file, not a container listing.`);d=d.replace(/(?:\.?\/)?(?:dist\/)?ia-player(?:\.esm)?\.js/g,"./ia-player.js"),d=d.replace(/(<sol-default\b[^>]*?)\s+solid-kitchen\b(\s*=\s*(?:"[^"]*"|'[^']*'|\S+))?/gi,"$1").replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?window\.SolidKitchen(?:(?!<\/script>)[\s\S])*?<\/script>\s*/gi,"").replace(/window\.SolidKitchen\s*=\s*true/gi,"window.SolidKitchen = false");let h="";for(let k of document.querySelectorAll("script[src]")){let E=k.getAttribute("src")||"";if(/ia-player(?:\.esm)?\.js(?:[?#]|$)/.test(E)){h=k.src;break}}h||(h=new URL("dist/ia-player.js",i).href);let w=await fetch(h),x=await w.text();if(!w.ok||x.length<1e3||!/customElements|function|=>/.test(x))throw new Error(`won't install: ${h} returned ${w.status} and not the JS bundle (${x.length} bytes).`);return[{relPath:"index.html",body:d,contentType:"text/html"},{relPath:"ia-player.js",body:x,contentType:"text/javascript"}]}async function ns(e){let i=e.baseURI,c=i.slice(0,i.lastIndexOf("/")+1),d=c.replace(/\/$/,"").split("/").pop()||"library",h=`libraries/${d}/`,w=e.config?.label||d;if(e.loadDocs)try{await e.loadDocs(Wr(e.store,e.baseURI))}catch(V){console.warn("[install] playlist force-load failed",V?.message||V)}let x=[],k=[],E=[];for(let V of Ri(e.store,e.baseURI)){if(!V.startsWith(c)){console.warn("[install] SKIP playlist outside library",V);continue}let ee=V.slice(c.length);try{let B=await fetch(V),pe=qa(await B.text(),d,ee);x.push({relPath:h+ee,body:pe,contentType:"text/turtle",skipIfExists:!0}),k.push(`<./${ee}>`),E.push(V)}catch(B){console.warn("[install] gather playlist FAILED",V,B?.message||B)}}let A=[];for(let V of Ka(e.store,E)){if(!V.startsWith(c)){console.warn("[install] SKIP release outside library",V);continue}let ee=V.slice(c.length);try{let B=await fetch(V),pe=qa(await B.text(),d,ee);x.push({relPath:h+ee,body:pe,contentType:"text/turtle",skipIfExists:!0}),A.push(`<./${ee}>`)}catch(B){console.warn("[install] gather release FAILED",V,B?.message||B)}}let _=A.map(V=>V.replace(/>$/,"#it>")),T=`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(w+" \u2014 releases")}${_.length?` ;
    dcat:dataset ${_.join(`,
                 `)}`:""} .
`,z=`@prefix dct: <http://purl.org/dc/terms/>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
<#it>
    a dcat:Catalog ;
    dct:title ${JSON.stringify(w+" \u2014 playlists")}${k.length?` ;
    dcat:dataset ${k.join(`,
                 `)}`:""} .
`,ae=[{relPath:h+"releases.ttl",body:T,contentType:"text/turtle"},{relPath:h+"playlists.ttl",body:z,contentType:"text/turtle"}];for(let V of["index.ttl","agents.ttl","genres.ttl"]){let ee=await fetch(c+V);if(!ee.ok)throw new Error(`couldn't read ${V} (${ee.status})`);let B=qa(await ee.text(),d,V);ae.push({relPath:h+V,body:B,contentType:"text/turtle"})}return{files:[...ae,...x],podLibPrefix:h,title:w}}function is(){let e=[...document.querySelectorAll("ia-player[src]")].map(i=>{try{return new URL(i.getAttribute("src"),location.href).href}catch{return null}}).filter(i=>i&&$t(i));if(!e.length){let i=t.find(c=>!c.solid&&$t(c.url));i&&e.push(new URL(i.url,location.href).href)}return[...new Set(e)]}async function qn(){if(at(!1),!Ce||!Ce.isLoggedIn){nl(),en(),$(f,"Choose your Solid provider to sign in \u2014 the install resumes automatically once you\u2019re signed in."),cr()||$(f,'Open the gear menu and click "Log in" to sign in, then choose Install on my Pod again.');return}let e=Ce.webId,i=Ce.fetchFor(e),c=is();if(!c.length){$(f,"No local library available to install.");return}let d=[];try{d=await jr(i,e)}catch{}d.length||(d=[new URL("/",e).href]);let h=d.map((B,pe)=>`  ${pe+1}. ${B}`).join(`
`),w=prompt(`Install Open Media Player \u2014 choose where it goes.

Enter a number, or type a full container URL:

`+h,"1");if(w==null||!w.trim())return;let x,k=parseInt(w,10);if(Number.isInteger(k)&&d[k-1]?x=d[k-1]:/^https?:\/\/.+/.test(w.trim())&&(x=w.trim()),!x){$(f,"Install cancelled \u2014 no valid location chosen.");return}let E=x.endsWith("/")?x:x+"/",A=prompt("Confirm or edit the install location:",new URL("open_media_player/",E).href);if(!A||!A.trim())return;let _=A.trim();_.endsWith("/")||(_+="/");let T=[];try{T=await jn()}catch(B){$(f,`Couldn't read the app files to install: ${B.message}`);return}let z=[];for(let B of c){let pe=a.find(Re=>Re.baseURI===B&&Re.store);if(!pe)try{pe=await pt({id:B,url:B,enabled:!0})}catch{pe=null}if(!pe||!pe.store){console.warn("[install] skipping unreadable library",B);continue}try{let Re=await ns(pe);T.push(...Re.files),z.push({podLibPrefix:Re.podLibPrefix,title:Re.title})}catch(Re){$(f,`Couldn't prepare ${B} to install: ${Re.message}`);return}}if(!z.length){$(f,"No readable libraries to install.");return}console.info(`[install] writing ${T.length} files (${z.length} libraries) to ${_}`),$(f,`Installing ${T.length} files to ${_}\u2026`);let ae=await Vr(i,_,T,(B,pe,Re)=>{(B===pe||B%10===0)&&$(f,`Installing ${B}/${pe}: ${Re}`)}),V=!1;try{let B=(await Ei(i,e)).typeIndex;if(B||(B=await Ti(i,e)),B){for(let pe of z){let Re=_+pe.podLibPrefix+"index.ttl";await Ha(i,B,{id:"omp-pod-"+pe.podLibPrefix.replace(/[^a-z0-9]+/gi,"-").replace(/-+$/,""),url:Re,label:`${pe.title} (my pod)`}),to(e,Re)}V=!0}}catch(B){console.warn("type-index record skipped:",B?.message||B)}let ee=V?" Registered in your type index.":" (type index not updated).";$(f,ae.ok?`Installed ${z.length} ${z.length===1?"library":"libraries"} \u2014 open ${_}index.html (${ae.put} written${ae.skipped?`, ${ae.skipped} kept`:""}).${ee}`:`Installed ${ae.put} files with ${ae.failed.length} problem(s): ${ae.failed.slice(0,3).join("; ")}${ee}`)}We?.addEventListener("click",qn);async function On(){if(at(!1),!Ce||!Ce.isLoggedIn){ol(),en(),$(f,"Choose your Solid provider to sign in \u2014 the app update resumes automatically once you\u2019re signed in."),cr()||$(f,'Open the gear menu and click "Log in" to sign in, then choose Update app on Pod again.');return}let e=Ce.webId,i=Ce.fetchFor(e),c="",d=tl();if(d){let B=d.indexOf("libraries/");B>0&&(c=d.slice(0,B))}let h=[];try{h=await jr(i,e)}catch{}h.length||(h=[new URL("/",e).href]);let w=h.map((B,pe)=>`  ${pe+1}. ${B}`).join(`
`),x=prompt(`Update app on Pod \u2014 choose where the app lives.

Enter a number, or type a full container URL:

`+w,"1");if(x==null||!x.trim())return;let k,E=parseInt(x,10);if(Number.isInteger(E)&&h[E-1]?k=h[E-1]:/^https?:\/\/.+/.test(x.trim())&&(k=x.trim()),!k){$(f,"Update cancelled \u2014 no valid location chosen.");return}let A=k.endsWith("/")?k:k+"/",_=(()=>{let B=location.href.split("#")[0].split("?")[0];return B.endsWith("/")?B:B.slice(0,B.lastIndexOf("/")+1)})(),T=(()=>{try{if(new URL(_).origin===new URL(A).origin&&!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(_))return _}catch{}if(c)try{if(new URL(c).origin===new URL(A).origin)return c}catch{}return new URL("open_media_player/",A).href})(),z=prompt("Confirm the existing install location to overwrite:",T);if(!z||!z.trim())return;let ae=z.trim();ae.endsWith("/")||(ae+="/");let V;try{V=await jn()}catch(B){$(f,`Couldn't read the app files: ${B.message}`);return}$(f,`Updating app (${V.length} files) at ${ae}\u2026`);let ee=await Vr(i,ae,V,(B,pe,Re)=>$(f,`Updating ${B}/${pe}: ${Re}`));$(f,ee.ok?`App updated \u2014 hard-reload ${ae}index.html (${ee.put} files written).`:`App update: ${ee.put} written, ${ee.failed.length} problem(s): ${ee.failed.slice(0,3).join("; ")}`)}ha?.addEventListener("click",On),Be?.addEventListener("click",()=>{at(!1),ti({filter:Mt,onSave:e=>{Mt=e===null?{...La}:e,vo(Mt),xt.clear(),Ut.clear(),De(),$(f,"Filter updated.")}})}),tt?.addEventListener("click",e=>{if(e.stopPropagation(),!N.length){$(f,"Nothing to randomize \u2014 the tracklist is empty.");return}let i=N;for(let c=i.length-1;c>0;c--){let d=Math.floor(Math.random()*(c+1));[i[c],i[d]]=[i[d],i[c]]}na?.clear?.(),fe(),$(f,`Randomized ${i.length} track${i.length===1?"":"s"}.`),Ae()}),pa?.addEventListener("click",e=>{if(e.stopPropagation(),U!=="library"){$(f,"Clear tracklist only applies to the Library view. Use the playlist menu to delete a playlist.");return}g.pause(),g.removeAttribute("src"),g.load(),ie=[],N=[],Se=null,be.setSelection([],{notify:!1}),Nn?.clearSelection?.(),Oe=kt(),fe(),Ma(D,""),$(f,"Library queue cleared."),Ae()}),Te?.addEventListener("click",async()=>{if(at(!1),!N.length){$(f,"Nothing to save \u2014 pick some albums first.");return}let e=je();if(!e){$(f,"Enable a library to save playlists.");return}let i=`Playlist ${Me.length+1}`,c=prompt("Save current tracks as a playlist named:",i);if(!c||!c.trim())return;let d=c.trim();$(f,`Saving playlist "${d}"\u2026`);try{let w=(await Jr(e.store,e.baseURI,d)).id;Me.push({id:w,label:d,_lib:e.config.id}),Ie.add(w);let x=N.map(E=>({label:[E.artist,E.album,E.name].filter(Boolean).join(" \u2014 ")||E.name,url:E.url,source:E.albumUrl})),k=await Wa(e.store,e.baseURI,w,x,{inlineTracks:!rt()});N.forEach((E,A)=>{te.push({node:k.nodes?.[A],label:x[A].label,topic:w,url:E.url,source:E.albumUrl,_lib:e.config.id})}),$(f,`Saved playlist "${d}" (${N.length} track${N.length===1?"":"s"}). Click it in Sources to view.`),Pe()}catch(h){console.error("Save playlist failed:",h),$(f,`Could not save playlist: ${h.message}`)}}),wr("ordered"),Un("off"),ln(),qe(),ge(),be.setMessage(rr().chooseArtist),fe(),va(),go();function os(){for(let e of yt()){if(!e.loadDocs)continue;let i=Wr(e.store,e.baseURI);i.length&&e.loadDocs(i).then(c=>{if(c&&(Qe(e),Pe(),ge(),Jt&&Ie.has(Jt)&&U==="library")){let d=Jt;Jt=null,it.setSelection([d],{notify:!1}),ut(d)}}).catch(c=>console.warn("background playlist load failed:",c))}}return(window.requestIdleCallback||(e=>setTimeout(e,300)))(()=>os()),r.appAction=e=>{let i={help:".gear-help-link",about:".gear-help",loginHelp:".gear-login-help",filters:".gear-filters",viewDeleted:".gear-view-deleted",installPod:".gear-install-pod",updateApp:".gear-update-app"}[e];i&&b.querySelector(i)?.click()},r.appState=()=>({guest:!rt(),real:ya(),webId:ya()&&Wt()?.webId||"",mediaType:n()}),r.getMediaElement=()=>g,b}var Ya="ia-player:libraries";function Qi(){return"lib-"+(crypto.randomUUID?.()??Date.now().toString(36)+Math.random().toString(36).slice(2,6))}function Zi(t){return String(t).toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"").replace(/_+/g,"_").replace(/^_|_$/g,"")||"library"}function Qs(t){if(typeof t!="string")return t;let a=t.replace("/ia-music-library/","/libraries/internet_archive_music/");return(a==="./ia-music.ttl"||a.endsWith("/ia-music.ttl"))&&(a=a.replace(/(^|\/)ia-music\.ttl$/,(r,n)=>`${n}libraries/internet_archive_music/index.ttl`)),a}function $t(t){try{return new URL(t,location.href).origin===location.origin}catch{return!1}}function Zs(t){try{let a=localStorage.getItem(Ya);if(a){let r=JSON.parse(a),n=Array.isArray(r)?r.filter(s=>s&&!s.solid):[];if(n.length){let s=!1;for(let o of n){let l=Qs(o.url);l!==o.url&&(o.url=l,s=!0),o.id==="default"&&o.label==="Internet Archive"&&(o.label="Internet Archive Music",s=!0),o.enabled=$t(o.url)}return s&&on(n),n}}}catch(a){console.warn("Could not read library configs from localStorage:",a)}return[{id:"default",label:"Internet Archive Music",url:t,enabled:!0}]}function on(t){try{localStorage.setItem(Ya,JSON.stringify((t||[]).filter(a=>a&&!a.solid)))}catch(a){console.warn("Could not write library configs to localStorage:",a)}}var tn="omp:lib-enabled";function el(t,a){if(t)try{let r=JSON.parse(localStorage.getItem(tn)||"{}");r[t]=!!a,localStorage.setItem(tn,JSON.stringify(r))}catch(r){console.warn("rememberLibEnabled failed:",r)}}function no(t,a){try{let r=JSON.parse(localStorage.getItem(tn)||"{}");return t in r?!!r[t]:a}catch{return a}}var eo="omp:pod-library",io="omp:pod-library:last";function to(t,a){try{let r=JSON.parse(localStorage.getItem(eo)||"{}");r[t]=a,localStorage.setItem(eo,JSON.stringify(r))}catch(r){console.warn("podLibRemember failed:",r)}try{localStorage.setItem(io,a)}catch{}}function tl(){try{return localStorage.getItem(io)||null}catch{return null}}var Ja="omp:auth-inflight",al=12e4;function en(){try{localStorage.setItem(Ja,JSON.stringify({search:location.search,hash:location.hash,t:Date.now()}))}catch{}}function rl(){try{let t=JSON.parse(localStorage.getItem(Ja)||"null");return t?Date.now()-(t.t||0)>al?(localStorage.removeItem(Ja),null):t:null}catch{return null}}function ao(){try{localStorage.removeItem(Ja)}catch{}}var an="omp:install-pending";function nl(){try{localStorage.setItem(an,"1")}catch{}}function il(){try{let t=localStorage.getItem(an);return t&&localStorage.removeItem(an),!!t}catch{return!1}}var rn="omp:updateapp-pending";function ol(){try{localStorage.setItem(rn,"1")}catch{}}function sl(){try{let t=localStorage.getItem(rn);return t&&localStorage.removeItem(rn),!!t}catch{return!1}}async function pt(t){try{let a=!!t.solid||$t(t.url),{store:r,baseURI:n,loadDocs:s}=await $i(t.url,{shared:a,lazyReleases:!0,lazyPlaylists:!0}),o=Di(r,n),{genres:l,bookmarks:u}=Hr(r,n,o),p=Gr(r,n);return{config:t,store:r,baseURI:n,loadDocs:s,mediaType:o,genres:l,bookmarks:u,playlists:p,error:null}}catch(a){return console.error("Failed to load library",t.url,a),{config:t,store:null,baseURI:null,loadDocs:null,mediaType:"audio",genres:[],bookmarks:[],playlists:[],error:a.message}}}var ro=!1;async function Va(t,a){try{console.info("[omp] BUILD","0.1.0 2026-06-09T19:46:40.555Z")}catch{}if(si(t),a.length>1){let r=a.map(n=>no(n.url,n.enabled));r.filter(Boolean).length===1&&a.forEach((n,s)=>{n.enabled=r[s]})}try{let r=o=>({config:o,store:null,baseURI:null,genres:[],bookmarks:[],playlists:[],error:null,unloaded:!0}),n=await Promise.all(a.map(o=>o.enabled?pt(o):Promise.resolve(r(o)))),s=Xs({libraryConfigs:a,libs:n,host:t});ci(t,s)}catch(r){console.error("Initialization error:",r),li(t,r.message)}}var nn=class extends HTMLElement{static get observedAttributes(){return["src","source"]}connectedCallback(){this._mounted||(this._mounted=!0,!this.hasAttribute("defer")&&this.ensureLoaded())}ensureLoaded(){this._loaded||(this._loaded=!0,this._loadFromConfig())}attributeChangedCallback(a,r,n){!this._mounted||a!=="src"&&a!=="source"||r===n||localStorage.getItem(Ya)||this._loadFromConfig()}_loadFromConfig(){let a=this.getAttribute("src")||this.getAttribute("source"),r=this.getAttribute("storage-ns");if(r&&a){Va(this,[{id:r,label:r,url:a,enabled:!0}]);return}if(!a&&!localStorage.getItem(Ya)){oi(this,s=>{let o=[{id:"default",label:"Internet Archive Music",url:s,enabled:!0}];on(o),Va(this,o)});return}let n=Zs(a||"./libraries/internet_archive_music/index.ttl");Va(this,n)}reload(a){Va(this,a)}};customElements.get("ia-player")||customElements.define("ia-player",nn);wi();
