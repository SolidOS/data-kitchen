// dk-tabs-shell — page-level wiring around the topmost <sol-tabs>: tab-change
// reactions, chrome actions, mini audio player, guest gating, the help
// overlay, and CONTEXT: help / settings / the ☰ menu follow the active
// plugin via its plugins/<id>/manifest.jsonld (schema:softwareHelp,
// dct:conformsTo, optional #Menu). (Adapted from omp-shell when
// open_media_player was absorbed.)
// The tabs + panels are modeled in ui-data/data-kitchen-main-menu.ttl (rdf-first; rendered by
// <sol-tabs from-rdf> + dk-tabs-rdf); here we react to <sol-tabs>'s
// sol-tab-change. Favourites are no longer a tab — each media tab surfaces
// its own favourites.

    import { rdf } from 'sol-components/core/rdf.js';
    import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
    import { displayItem } from 'sol-components/core/display-target.js';
    import { solFetch } from 'sol-components/core/auth-fetch.js';

    // The body UI is modeled in ui-data/data-kitchen-main-menu.ttl and rendered by the inline
    // <sol-tabs id="dk-tabs" from-rdf="./dk-pod/dk/ui-data/data-kitchen-main-menu.ttl#Tabs"> in index.html.
    // (Its panels therefore appear asynchronously — see whenTabsReady.)

    let solTabs = null;   // assigned once the included <sol-tabs> exists
    const chrome  = document.querySelector('.omp-chrome');
    // The DEFAULT tab set; panels removed from the menu (pantry items a user
    // can re-add via Customize) simply resolve to null here, and re-added
    // ones work through paneForName/onTab regardless of this list.
    const PANEL_KEYS = ['news', 'music', 'movies', 'images', 'podz', 'solidos', 'customize'];
    const panelEl   = (key) => document.getElementById('panel-' + key);
    const allPanels = () => PANEL_KEYS.map(panelEl).filter(Boolean);
    let audioName = 'music';
    let current = '';
    const activePanel = () => panelEl(current);

    // ----- plugin context (manifest-driven) -----
    // Each plugin MAY ship plugins/<id>/manifest.jsonld declaring its help file
    // (schema:softwareHelp), its settings shape (dct:conformsTo), and ☰ menu
    // contributions (<#Menu> a ui:Menu). The id is the first path segment
    // under plugins/ in the active panel's source attribute.
    const SCHEMA_HELP  = 'http://schema.org/softwareHelp';
    const DCT_CONFORMS = 'http://purl.org/dc/terms/conformsTo';
    const UI_PARTS     = 'http://www.w3.org/ns/ui#parts';
    const manifestCache = new Map();   // id → {help, shape, menuUri} | null

    function pluginIdFor(el) {
      const src = el?.getAttribute?.('source') || '';
      const m = src.match(/(?:^|\/)plugins\/([^/]+)\//);
      return m ? m[1] : null;
    }

    async function pluginManifest(id) {
      if (!id) return null;
      if (manifestCache.has(id)) return manifestCache.get(id);
      let info = null;
      try {
        const docUrl = new URL(`dk-pod/dk/plugins/${id}/manifest.jsonld`, document.baseURI).href;
        const store = await loadRdfStore(docUrl);
        const doc = rdf.sym(docUrl);
        info = {
          help:  store.any(doc, rdf.sym(SCHEMA_HELP))?.value || null,
          shape: store.any(doc, rdf.sym(DCT_CONFORMS))?.value || null,
          menuUri: store.any(rdf.sym(`${docUrl}#Menu`), rdf.sym(UI_PARTS))
            ? `dk-pod/dk/plugins/${id}/manifest.jsonld#Menu` : null,
        };
      } catch { info = null; }   // no manifest — perfectly fine
      manifestCache.set(id, info);
      return info;
    }

    // Point the chrome at the active plugin: the ? button's source and the
    // ☰ menu's context-source. Defaults stay declared in ui-data/data-kitchen-main-menu.ttl#Chrome;
    // this only follows the documented context, and falls back to them.
    async function applyContext() {
      const panel = activePanel();
      const info = await pluginManifest(pluginIdFor(panel));
      if (panel !== activePanel()) return;   // tab changed while loading

      const helpBtn = document.querySelector('.omp-help-launch');
      if (helpBtn) {
        if (!helpBtn._dkDefaults) {
          helpBtn._dkDefaults = {
            source: helpBtn.getAttribute('source'),
            owner: helpBtn.getAttribute('if-logged-in'),
          };
        }
        if (info?.help) {
          helpBtn.setAttribute('source', info.help);
          helpBtn.removeAttribute('if-logged-in');
        } else {
          helpBtn.setAttribute('source', helpBtn._dkDefaults.source);
          if (helpBtn._dkDefaults.owner) helpBtn.setAttribute('if-logged-in', helpBtn._dkDefaults.owner);
        }
      }

      const more = document.querySelector('sol-dropdown-button.omp-more');
      if (more) {
        if (info?.menuUri) more.setAttribute('context-source', info.menuUri);
        else more.removeAttribute('context-source');
      }
    }

    // ☰ Settings…: the active plugin's shape (sol-form over the panel's own
    // source) when declared, else the global settings page. Mounted through
    // the same displayItem/modal machinery every menu item uses.
    async function openSettings() {
      const launcher = document.querySelector('sol-dropdown-button.omp-more');
      const panel = activePanel();
      const info = await pluginManifest(pluginIdFor(panel));
      const panelSource = panel?.getAttribute?.('source');
      if (info?.shape && panelSource) {
        displayItem({
          launcher, id: 'MoreSettings', name: 'Settings', tag: 'sol-form',
          attrs: [['shape', info.shape], ['source', panelSource]],
        });
      } else {
        displayItem({
          launcher, id: 'MoreSettings', name: 'Settings', tag: 'sol-include',
          attrs: [['source', './dk-pod/dk/pages/settings.html'], ['trusted', '']],
        });
      }
    }

    // sol-tabs pane ↔ panel-key bridge.
    function paneForName(name) {
      for (const p of solTabs.querySelectorAll(':scope > .sol-tabs-content > .sol-tabs-pane'))
        if (p.dataset.tabName === name) return p;
      return null;
    }
    function nameForKey(key) {
      return panelEl(key)?.closest('.sol-tabs-pane')?.dataset.tabName || null;
    }
    // Re-home the mini-player into the tab bar, centred between the tabs and the
    // right-aligned action launchers: insert it just before the .sol-tabs-launch
    // group. Both it (margin-left:auto, see dk-chrome.css) and the launch group
    // (its own auto margin) absorb the free space equally, so the mini lands in
    // the middle of the gap, at tab-bar height.
    //
    // We HOLD the element reference: sol-tabs._renderBar / applyLaunchers (and a
    // Customize save) do `bar.innerHTML = ''`, which would DESTROY a mini moved
    // into the bar and orphan querySelector('.omp-mini'). Keeping the ref lets us
    // re-insert the same element, and a MutationObserver re-homes it after any
    // such rebuild — so the mini can't be permanently lost.
    let miniEl = null, miniObserver = null;
    function homeMini() {
      if (!miniEl) miniEl = document.querySelector('.omp-mini');
      const bar = solTabs?.querySelector(':scope > .sol-tabs-bar');
      if (!miniEl || !bar) return;
      const launch = bar.querySelector(':scope > .sol-tabs-launch');
      if (!(miniEl.parentElement === bar && miniEl.nextElementSibling === launch)) {
        if (launch) bar.insertBefore(miniEl, launch);
        else bar.appendChild(miniEl);
      }
      if (!miniObserver) {
        miniObserver = new MutationObserver(() => homeMini());
        miniObserver.observe(bar, { childList: true });
      }
    }

    // The submenu dropdown launcher (sol-dropdown-button) for a tab, found by
    // its title (set to the tab name in sol-tabs._buildSubmenuDropdown). Null
    // for a plain content tab. Used to persist/replay a submenu's pick.
    function submenuDropdownFor(name) {
      const bar = solTabs.querySelector(':scope > .sol-tabs-bar');
      return bar
        ? [...bar.querySelectorAll(':scope > sol-dropdown-button')]
            .find((d) => d.getAttribute('title') === name) || null
        : null;
    }

    // React to a tab switch: load the active panel, pause the panels we left
    // (except the audio one — it plays on under the mini player), remember it.
    // Dismiss the help overlay (the ? sol-button inline region) and the ☰ menu
    // pane (#dk-menu-pane — Customize / Manage Plugins / Settings), forgetting
    // the pane choice so a reload returns to the tab, not the pane. Shared by a
    // tab pick (onTab) and a bar action-link click: that click opens the native
    // reader, which the preload guard keeps SUSPENDED while the pane is open —
    // so the pane must go for the reader to appear.
    function hideMenuPane() {
      const menuPane = document.getElementById('dk-menu-pane');
      if (menuPane) menuPane.hidden = true;
      try { localStorage.removeItem('dk:menu-pane-item'); } catch {}
    }
    function dismissPanes() {
      document.querySelector('.omp-help-launch')?.close?.();
      hideMenuPane();
    }
    function onTab(name) {
      dismissPanes();
      // Close the native reader overlay on a real tab switch. A bar action-link
      // (duck.ai, bluesky) or a feed/search window.open mounts the reader above
      // .sol-tabs-content with no tie to the tab beneath it; without this it
      // floats on, occluding whatever tab we switch to. Done HERE (not in
      // dismissPanes) because the bar-link click also runs dismissPanes — and
      // that click is what OPENS the reader, so closing there would race it
      // shut. onTab only fires on sol-tab-change, never on a bar-link click.
      // (Electron only; a no-op in the browser, where window.open is a new tab.)
      window.dkElectron?.closeReader?.();
      const pane = paneForName(name);
      // The active plugin's panel- id: inside the VISIBLE dropdown wrapper for a
      // submenu pick, else anywhere in the pane for a plain content tab.
      const el = pane?.querySelector(':scope > [data-menu-item]:not([hidden]) [id^="panel-"]')
              || pane?.querySelector('[id^="panel-"]');
      if (el) current = el.id.replace(/^panel-/, '');
      el?.ensureLoaded?.();
      // A submenu-dropdown pick mounts its plugin under a <div data-menu-item>
      // with no panel- id, and not always marked `defer` (ia-player is, but
      // omp-images isn't), so the lookup above misses it. Drive ensureLoaded on
      // the VISIBLE dropdown-mounted plugin too (idempotent) — else its content
      // (libraries/topics/playlists) never loads.
      pane?.querySelectorAll(':scope > [data-menu-item]:not([hidden]) > *')
        .forEach((d) => d.ensureLoaded?.());
      for (const k of PANEL_KEYS)
        if (k !== current && k !== audioName) panelEl(k)?.getMediaElement?.()?.pause?.();
      // Persist the active tab AND, for a submenu, its visible pick — a reload
      // returns to the same submenu page by replaying the pick (it's lazy-
      // mounted, so the bare panel key can't resolve it). See the restore block.
      try {
        localStorage.setItem('dk:active-panel', current);
        localStorage.setItem('dk:active-tab', name);
        const pick = pane?.querySelector(':scope > [data-menu-item]:not([hidden])')?.dataset.menuItem;
        if (submenuDropdownFor(name) && pick) localStorage.setItem('dk:active-pick', pick);
        else localStorage.removeItem('dk:active-pick');
        // When the active pick IS the audio panel (music), remember its submenu
        // + pick so a reload can background-resume it from any tab (see restore).
        if (current === audioName && submenuDropdownFor(name) && pick) {
          localStorage.setItem('dk:audio-tab', name);
          localStorage.setItem('dk:audio-pick', pick);
        }
      } catch {}
      syncGating(); bindAudio(); updateMini(); homeMini();
      applyContext();   // help / ☰ follow the active plugin (async, guarded)
    }

    // Help is fully declarative now: the ? <sol-button region="inline"> in
    // index.html toggles assets/omp-help{,-owner}.html into the tab content
    // area (login-aware via if-logged-in). The only behaviour wired here is
    // dismissing it when a tab is picked (see onTab → .omp-help-launch.close()).

    // ----- appearance (document-level; shared by all panels) -----
    const docEl = document.documentElement;
    const solDefault = () => document.querySelector('sol-default');
    // The EFFECTIVE theme = explicit override (<html data-theme>, from a saved
    // choice or the toggle) → declared default → system preference. The declared
    // default now comes from the RDF-derived `color-scheme` attribute (a full
    // UI-vocab URI, e.g. …#DarkColorScheme); map its local name back to the short
    // value via THEME_TERM. SystemColorScheme (and a missing attribute) fall
    // through to the live system preference. The CSS cascade applies the same
    // precedence for paint; this mirrors it so the toggle/icon reflect reality.
    function effectiveTheme() {
      const explicit = docEl.getAttribute('data-theme');
      if (explicit) return explicit;
      const scheme = solDefault()?.getAttribute('color-scheme');
      const declared = scheme && Object.keys(THEME_TERM).find((k) => scheme.endsWith(THEME_TERM[k]));
      if (declared && declared !== 'system') return declared;
      try { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; }
    }
    // Live lookups — the buttons are built from ui-data/data-kitchen-main-menu.ttl (dk-tabs-rdf),
    // usually AFTER this module evaluates; a captured const would stay null.
    const themeBtn = () => document.querySelector('.omp-theme');
    function syncTheme() {
      const btn = themeBtn();
      if (btn) btn.textContent = effectiveTheme() === 'light' ? '☀️' : '🌙';
    }
    function toggleTheme() {
      const next = effectiveTheme() === 'light' ? 'dark' : 'light';
      docEl.setAttribute('data-theme', next);
      try { localStorage.setItem('dk:theme', next); } catch {}
      persistAppearance('colorScheme', THEME_TERM[next]);
      syncTheme();
      document.dispatchEvent(new CustomEvent('omp:appearance'));
    }
    // Persist a toggle's choice into the settings RDF (the <sol-default>
    // source document, ui-data/data-kitchen-settings.ttl) so it survives beyond
    // this profile's localStorage and follows the pod. localStorage stays as
    // the before-first-paint cache (dk-boot). Guests: the PUT fails, the
    // local toggle still applies.
    const UI_NS = 'http://www.w3.org/ns/ui#';
    const THEME_TERM = { light: 'LightColorScheme', dark: 'DarkColorScheme', system: 'SystemColorScheme' };
    const FONT_TERM  = { small: 'SmallFont', medium: 'MediumFont', large: 'LargeFont' };
    let persistQueue = Promise.resolve();
    function persistAppearance(predicateLocal, termLocal) {
      if (!termLocal) return;
      persistQueue = persistQueue.then(async () => {
        const src = solDefault()?.getAttribute('source') || 'dk-pod/dk/ui-data/data-kitchen-settings.ttl#Settings';
        const docUrl = new URL(src.split('#')[0], document.baseURI).href;
        const subject = rdf.sym(`${docUrl}#${src.split('#')[1] || 'Settings'}`);
        const store = await loadRdfStore(docUrl, solFetch);
        const doc = rdf.sym(docUrl);
        store.removeMatches(subject, rdf.sym(UI_NS + predicateLocal), null);
        store.add(subject, rdf.sym(UI_NS + predicateLocal), rdf.sym(UI_NS + termLocal), doc);
        const turtle = await rdf.serialize(doc, store, docUrl, 'text/turtle');
        const res = await solFetch(docUrl, {
          method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: turtle,
        });
        if (!res || res.ok === false) throw new Error(`PUT ${docUrl} → ${res && res.status}`);
        // The toggle just rewrote the settings doc — re-sync the live defaults
        // and any OPEN settings form so they reflect the new value (neither
        // watches the file; without this they'd keep showing the old choice).
        const sd = solDefault();
        if (sd && typeof sd.reload === 'function') { try { await sd.reload(); } catch (_) {} }
        document.querySelectorAll('.dk-settings sol-form').forEach((f) => {
          if (typeof f.reload === 'function') { try { f.reload(); } catch (_) {} }
        });
      }).catch((e) => console.warn('[dk] appearance not saved to settings RDF:', e.message));
    }
    const SIZES = ['small', 'medium', 'large'];
    function effectiveFontSize() {
      const explicit = docEl.getAttribute('data-fontsize');
      if (explicit) return explicit;
      // Declared default from the RDF-derived `font-size` attribute (full URI,
      // e.g. …#MediumFont) → map its local name back via FONT_TERM.
      const fs = solDefault()?.getAttribute('font-size');
      const declared = fs && Object.keys(FONT_TERM).find((k) => fs.endsWith(FONT_TERM[k]));
      return declared || 'medium';
    }
    const fontBtn = () => document.querySelector('.omp-fontsize');
    function syncFontSize() {
      const size = effectiveFontSize();
      const btn = fontBtn();
      if (btn) {
        btn.dataset.size = size;
        const title = 'Text size: ' + size[0].toUpperCase() + size.slice(1) + ' (click to change)';
        btn.title = title;
        // The hover tooltip comes from the INNERMOST title attribute — the
        // sol-button's shadow trigger carries its own (copied from markup at
        // build), which would mask the synced one. Keep it in step.
        btn.shadowRoot?.querySelector('button')?.setAttribute('title', title);
      }
    }
    function cycleFontSize() {
      const cur = effectiveFontSize();
      const next = SIZES[(SIZES.indexOf(cur) + 1) % SIZES.length];
      docEl.setAttribute('data-fontsize', next);
      try { localStorage.setItem('dk:fontsize', next); } catch {}
      persistAppearance('fontSize', FONT_TERM[next]);
      syncFontSize();
      document.dispatchEvent(new CustomEvent('omp:appearance'));
    }
    // The sol-button chrome routes through the sol-command registry below;
    // a plain <button> (legacy) would need a direct click listener instead —
    // wired in whenTabsReady once the include has landed.
    function wireAppearanceButtons() {
      const t = themeBtn(), f = fontBtn();
      if (t && t.tagName !== 'SOL-BUTTON' && !t._dkWired) { t._dkWired = true; t.addEventListener('click', toggleTheme); }
      if (f && f.tagName !== 'SOL-BUTTON' && !f._dkWired) { f._dkWired = true; f.addEventListener('click', cycleFontSize); }
    }
    document.addEventListener('omp:appearance', () => { syncTheme(); syncFontSize(); });

    // ☰ menu items that mirror live appearance state. The dropdown renders its
    // items once from menu.ttl; rewrite the "Text size" and "Theme" labels to
    // the current value whenever the popup opens (and on appearance changes while
    // it's open). Matched by label PREFIX so it's idempotent across re-opens.
    function syncMenuState(popup) {
      if (!popup) return;
      for (const btn of popup.querySelectorAll('button')) {
        const t = (btn.textContent || '').trim();
        if (t.startsWith('Text size')) {
          const s = effectiveFontSize();
          btn.textContent = `Text size: ${s[0].toUpperCase()}${s.slice(1)}`;
        } else if (t.startsWith('Theme')) {
          btn.textContent = effectiveTheme() === 'light' ? 'Theme: Light ☀️' : 'Theme: Dark 🌙';
        }
      }
    }
    // Hook the ☰ popup once its shadow exists (the dropdown upgrades async, so
    // the settle loop retries until this returns true).
    function wireMenuState() {
      const dd = document.querySelector('sol-dropdown-button.omp-more');
      const popup = dd && dd.shadowRoot && dd.shadowRoot.querySelector('.sol-dd-popup');
      if (!popup) return false;
      if (dd._dkStateWired) return true;
      dd._dkStateWired = true;
      new MutationObserver(() => { if (!popup.hidden) syncMenuState(popup); })
        .observe(popup, { attributes: true, attributeFilter: ['hidden'] });
      document.addEventListener('omp:appearance', () => { if (!popup.hidden) syncMenuState(popup); });
      return true;
    }

    // The ⋮ menu is a <sol-dropdown-button source="./dk-pod/dk/ui-data/data-kitchen-hamburger-menu.ttl#More"> (see
    // index.html): it owns its open/close + popup, its items are command items
    // that dispatch sol-command (handled by COMMANDS below), and write-only items
    // are gated by CSS (.no-write … ::part(requires-write)) — see syncGating.

    // ----- mini audio player -----
    // Binds to the audio panel's media element; shows only when that audio is
    // loaded AND you're on a different tab. Just play/pause + progress. The
    // controls may be injected late (e.g. via <sol-include>), so everything
    // re-queries the DOM and tolerates them being absent.
    const miniBar  = () => document.querySelector('.omp-mini');
    const miniPlay = () => document.querySelector('.omp-mini-play');
    const miniSeek = () => document.querySelector('.omp-mini-seek');
    const miniTime = () => document.querySelector('.omp-mini-time');
    const audioEl = () => panelEl(audioName)?.getMediaElement?.();
    // Is the audio panel the view actually on screen? Keyed on layout, not the
    // `current` tracker: `current` only updates when the picked item carries a
    // panel-* id, and most menu items (apps, submenu picks) don't — leaving it
    // stale at 'music' and wrongly hiding the mini on every non-media item.
    // Keep-alive panes and hidden [data-menu-item] wrappers are display:none,
    // so offsetParent is null whenever the panel isn't the visible view.
    const audioPanelVisible = () => {
      const p = panelEl(audioName);
      return !!p && p.offsetParent !== null;
    };
    const fmtTime = (s) => Number.isFinite(s) && s >= 0
      ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00';
    let seeking = false;
    function updateMini() {
      const bar = miniBar(); if (!bar) return;
      const el = audioEl();
      const hide = audioPanelVisible() || !(el && el.src);
      bar.hidden = hide;
      if (hide || !el) return;
      // Hover tooltip: the current track (artist — album — title) from the panel.
      bar.title = panelEl(audioName)?.nowPlayingText?.() || '';
      const play = miniPlay(); if (play) play.textContent = el.paused ? '▶' : '⏸';
      const seek = miniSeek();
      if (seek && !seeking) {
        const d = el.duration || 0;
        seek.value = d ? Math.round((el.currentTime / d) * 1000) : 0;
      }
      const time = miniTime();
      if (time) time.textContent = `${fmtTime(el.currentTime)} / ${fmtTime(el.duration)}`;
    }
    function bindAudio() {
      const el = audioEl();
      if (!el || el._ompMiniBound) return;
      el._ompMiniBound = true;
      for (const ev of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'ended', 'emptied'])
        el.addEventListener(ev, updateMini);
      updateMini();
    }
    // Wire the mini-player controls once they exist; idempotent so the settle
    // loop can call it repeatedly as a late <sol-include> renders them.
    function bindMini() {
      const play = miniPlay();
      if (play && !play._ompBound) {
        play._ompBound = true;
        play.addEventListener('click', () => {
          const el = audioEl(); if (!el) return;
          if (el.paused) el.play().catch(() => {}); else el.pause();
        });
      }
      const seek = miniSeek();
      if (seek && !seek._ompBound) {
        seek._ompBound = true;
        seek.addEventListener('input', () => { seeking = true; });
        seek.addEventListener('change', () => {
          const el = audioEl();
          if (el && el.duration) el.currentTime = (seek.value / 1000) * el.duration;
          seeking = false;
        });
      }
    }

    // ----- write-access gating -----
    // Can the current user write? (A real Solid session OR the dev "kitchen"
    // flag — later this can become a real acl:Write check on the target.)
    // Kitchen mode is declared as `solid-kitchen` on <sol-default>; items needing
    // write expose part="requires-write" and are hidden via CSS (.no-write) when
    // the user can't write. In guest mode the whole ⋮ button is hidden (every
    // item requires write), so "View as guest" is a ONE-WAY preview that drops
    // the attribute — to return to owner mode on dev, reload the page.
    function canWrite() {
      return !!(document.querySelector('sol-login')?.isLoggedIn)
          || !!window.SolidWebComponents?.AuthManager?.shared?.getFirstLoggedIn()
          || !!solDefault()?.hasAttribute('solid-kitchen');
    }
    function syncGating() {
      const write = canWrite();
      document.body.classList.toggle('guest', !write);
      document.body.classList.toggle('no-write', !write);
      chrome?.classList.toggle('guest', !write);
      chrome?.classList.toggle('no-write', !write);
      const news = panelEl('news');
      if (news && news.hasAttribute('editable') !== write) {
        news.toggleAttribute('editable', write);
        if (news.isConnected && typeof news.reload === 'function') news.reload().catch(() => {});
      }
    }
    function enterGuestPreview() {
      solDefault()?.removeAttribute('solid-kitchen');   // drop dev write; reload restores it
      document.dispatchEvent(new CustomEvent('omp:reapply-gating'));
      syncGating();
    }

    // ----- commands (sol-command) -----
    // A bare-key handler (e.g. data-handler="toggleTheme") dispatches
    // `sol-command` on click. This registry maps those keys to behaviours —
    // it's the allow-list: an unregistered command is a no-op, and nothing
    // executes code that markup or RDF names. (The old omp Workspaces "podz"
    // command is gone — Podz is the <dk-podz> component tab now.)
    const COMMANDS = {
      guestView:     () => enterGuestPreview(),
      toggleTheme:   () => toggleTheme(),
      cycleFontSize: () => cycleFontSize(),
      // Developer reloads (☰ menu): soft = renderer reload (picks up the rebuilt
      // bundle/html/css/data); hard = relaunch the whole app (also main process +
      // bundled servers) via the dkElectron preload bridge → main app.relaunch.
      reloadApp:     () => location.reload(),
      restartApp:    () => window.dkElectron?.restart?.(),
      // "Move my pod" (owner): main shows a folder picker, copies the pod there,
      // persists the choice and relaunches. Electron-only (no-op in a browser).
      moveMyPod:     async () => {
        const r = await window.dkElectron?.moveMyPod?.();
        if (r && r.status === 'error') console.error('[dk] Move my pod failed:', r.message);
      },
      // The ☰ "Sign in…" item: start the same coalesced flow a 401 does —
      // sol-login listens for sol-auth-needed, surfaces itself ([active])
      // and runs the popup login. resolve is the protocol's completion
      // callback; the menu item has nothing to retry, so it's a no-op.
      signIn:      () => document.dispatchEvent(new CustomEvent('sol-auth-needed', {
        detail: { resolve: () => {} },
      })),
      settings:    () => openSettings(),
      filters:     () => activePanel()?.appAction?.('filters'),
      viewDeleted: () => activePanel()?.appAction?.('viewDeleted'),
      installPod:  () => activePanel()?.appAction?.('installPod'),
      updateApp:   () => activePanel()?.appAction?.('updateApp'),
    };
    document.addEventListener('sol-command', (e) => COMMANDS[e.detail?.command]?.(e.detail?.params, e.detail));

    // ----- boot -----
    syncTheme();
    syncFontSize();
    // <sol-tabs> builds its panels asynchronously (the from-rdf load of
    // ui-data/data-kitchen-main-menu.ttl); wait, then wire tab reactions + restore the last-used tab.
    function whenTabsReady(cb) {
      // Ready = the included <sol-tabs> exists and has built at least one pane.
      // (Don't key this on a specific tab like 'news' — any tab may be first,
      // and 'news' can be removed via Customize.)
      const ready = () => {
        const tabsEl = document.getElementById('dk-tabs');
        return tabsEl && tabsEl.querySelector(':scope > .sol-tabs-content > .sol-tabs-pane');
      };
      if (ready()) return cb();
      let n = 0;
      const t = setInterval(() => {
        if (ready() || ++n > 60) { clearInterval(t); cb(); }
      }, 50);
    }
    whenTabsReady(() => {
      solTabs = document.getElementById('dk-tabs');
      for (const el of allPanels()) el.addEventListener('omp:access', syncGating);
      // Only the MAIN tabset's changes are tab picks — a sub-tabset inside a
      // page (e.g. Customize's subtabs, living in the menu pane) bubbles the
      // same event and must not dismiss the pane or touch panel state.
      solTabs.addEventListener('sol-tab-change', (e) => { if (e.target === solTabs) onTab(e.detail?.name); });
      // A bar action-link button opens its site in the native reader; dismiss
      // the ☰ menu pane (Customize etc.) first, else the reader stays hidden
      // behind it (the preload guard blanks native overlays while it's open).
      solTabs.addEventListener('click', (e) => {
        if (e.target.closest?.('.sol-bar-link')) dismissPanes();
      });
      // Opening the help overlay (? button) likewise dismisses the ☰ menu pane,
      // so help shows over the tab content rather than stacked on Customize.
      // Hide the pane only — keep help OPEN (don't run the full dismiss, which
      // would close help). sol-button-activate fires {open:true} on show.
      document.addEventListener('sol-button-activate', (e) => {
        if (e.target?.classList?.contains('omp-help-launch') && e.detail?.open) hideMenuPane();
      });
      // The ☰ menu pane (declared in index.html with its data-for claims) is
      // re-homed into the tab content area so it overlays the panes — the
      // same re-homing sol-tabs does for the bar/chrome launchers. Mounting
      // into it (mountInTarget fires sol-tab-activate) un-hides it; picking
      // a tab hides it again (onTab above). The open item is remembered so a
      // reload while e.g. Manage Plugins is showing comes back to it.
      const menuPane = document.getElementById('dk-menu-pane');
      if (menuPane && solTabs.body) {
        solTabs.body.appendChild(menuPane);
        menuPane.addEventListener('sol-tab-activate', (e) => {
          menuPane.hidden = false;
          try { localStorage.setItem('dk:menu-pane-item', e.detail?.name || ''); } catch {}
        });
      }
      // Restore the pane item from before the reload. The ☰ dropdown loads
      // its RDF items asynchronously, so retry select() until the pane shows
      // (or give up quietly). Only component/link items restore — a command
      // pane (Settings) just falls back to the tab.
      let paneSaved = null;
      try { paneSaved = localStorage.getItem('dk:menu-pane-item'); } catch {}
      if (paneSaved && menuPane) {
        let tries = 0;
        const reopen = setInterval(() => {
          if (!menuPane.hidden || ++tries > 20) { clearInterval(reopen); return; }
          document.querySelector('sol-dropdown-button.omp-more')?.select?.(paneSaved);
        }, 400);
      }
      if (canWrite()) panelEl('news')?.toggleAttribute('editable', true);
      // The appearance buttons arrived with the include — wire + sync them.
      wireAppearanceButtons();
      syncTheme();
      syncFontSize();
      applyContext();

      // The FIRST tab is the startup default unless a saved choice says
      // otherwise. With no saved choice, targetTab stays null and we fall
      // through to onTab(solTabs.activeTab) below — and sol-tabs defaults
      // activeTab to the first tab. (A saved key for a since-removed tab also
      // resolves to null here and lands on the first tab.)
      let saved = '', savedTab = null, savedPick = null, audioTab = null, audioPick = null;
      try {
        saved = localStorage.getItem('dk:active-panel') || '';
        savedTab = localStorage.getItem('dk:active-tab');     // captured before
        savedPick = localStorage.getItem('dk:active-pick');   // onTab can clear it
        audioTab = localStorage.getItem('dk:audio-tab');      // the submenu + pick
        audioPick = localStorage.getItem('dk:audio-pick');    // that IS the music panel
      } catch {}
      // Prefer the persisted tab NAME — it covers submenu tabs, whose lazy
      // picks have no mounted panel to resolve by key; fall back to the panel-
      // key path for content tabs saved before dk:active-tab existed.
      const targetTab = savedTab || nameForKey(saved);

      // Poll a submenu's dropdown and select `pick` once its items load (they
      // arrive async); select() is a no-op until then. Runs `done` when mounted.
      const pollSelect = (tabName, pickName, done) => {
        let n = 0;
        const t = setInterval(() => {
          submenuDropdownFor(tabName)?.select?.(pickName);
          const mounted = paneForName(tabName)?.querySelector(':scope > [data-menu-item]');
          if (mounted || ++n >= 25) { clearInterval(t); done?.(); }
        }, 200);
      };
      // ia-player persists its track under ia-player:state:<ns>; true if music
      // had a loaded track to resume.
      const musicHasTrack = (() => {
        try {
          const s = JSON.parse(localStorage.getItem('ia-player:state:' + audioName) || 'null');
          return !!(s && s.currentTrackUrl);
        } catch { return false; }
      })();

      // Restore the active tab (+ its submenu pick, if any).
      if (savedTab && savedPick) pollSelect(savedTab, savedPick);
      if (targetTab && targetTab !== solTabs.activeTab) solTabs.switchTab(targetTab);
      else onTab(solTabs.activeTab);

      // Background-resume the music panel even when the active tab is something
      // else (e.g. News): mount it via its dropdown — which switches to that
      // submenu — then immediately re-assert the active tab (same tick, so no
      // flicker). ia-player's restoreState then seeks to the saved position and
      // the mini binds, so audio + the mini survive a reload from ANY tab.
      if (audioTab && audioPick && musicHasTrack
          && !(audioTab === savedTab && audioPick === savedPick)) {
        pollSelect(audioTab, audioPick, () => {
          if (targetTab && targetTab !== solTabs.activeTab) solTabs.switchTab(targetTab);
          bindAudio(); updateMini();   // bind the mini in case the settle loop ended
        });
      }
      syncGating();

      // Idle-warm only the panels NOT marked defer — media tabs (music,
      // movies) and the heavy pod tools stay fully lazy: nothing of theirs
      // (playlists, libraries, bundles) loads until the user opens the tab.
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
      idle(() => { for (const el of allPanels()) if (!el.hasAttribute('defer')) el.ensureLoaded?.(); });

      // Panels mount async — retry gating + audio binding until ready.
      let tries = 0;
      const settle = setInterval(() => {
        syncGating(); bindMini(); bindAudio(); updateMini(); wireMenuState(); homeMini();
        if (++tries >= 12 || audioEl()?._ompMiniBound) clearInterval(settle);
      }, 400);
      // A Customize save rebuilds the tab bar (sol-tabs._renderBar wipes it),
      // dropping the re-homed mini — put it back when that happens.
      document.addEventListener('sol-menu-built', homeMini);
    });
