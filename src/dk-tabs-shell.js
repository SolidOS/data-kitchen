// dk-tabs-shell — page-level wiring around the topmost <sol-tabs>: tab-change
// reactions, chrome actions, mini audio player, guest gating, the help
// overlay, and CONTEXT: help / settings / the ☰ menu follow the active
// plugin via its plugins/<id>/manifest.ttl (schema:softwareHelp,
// dct:conformsTo, optional #Menu). (Adapted from omp-shell when
// open_media_player was absorbed.)
// The tabs + panels are authored declaratively in html-first.html; here we
// react to <sol-tabs>'s sol-tab-change. Favourites are no longer a tab —
// each media tab surfaces its own favourites.

    import { rdf } from 'sol-components/core/rdf.js';
    import { loadRdfStore } from 'sol-components/core/rdf-utils.js';
    import { displayItem } from 'sol-components/core/display-target.js';

    // The body UI is authored declaratively in html-first.html and loaded by the
    // #dk-body <sol-include source="./html-first.html"> in index.html. (#dk-tabs
    // therefore appears asynchronously — see whenTabsReady.)

    let solTabs = null;   // assigned once the included <sol-tabs> exists
    const chrome  = document.querySelector('.omp-chrome');
    // The DEFAULT tab set; panels removed from the menu (pantry items a user
    // can re-add via Customize) simply resolve to null here, and re-added
    // ones work through paneForName/onTab regardless of this list.
    const PANEL_KEYS = ['news', 'music', 'movies', 'images', 'podz', 'solidos', 'home', 'dev-tools', 'customize'];
    const panelEl   = (key) => document.getElementById('panel-' + key);
    const allPanels = () => PANEL_KEYS.map(panelEl).filter(Boolean);
    let audioName = 'music';
    let current = 'news';
    const activePanel = () => panelEl(current);

    // ----- plugin context (manifest-driven) -----
    // Each plugin MAY ship plugins/<id>/manifest.ttl declaring its help file
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
        const docUrl = new URL(`plugins/${id}/manifest.ttl`, document.baseURI).href;
        const store = await loadRdfStore(docUrl);
        const doc = rdf.sym(docUrl);
        info = {
          help:  store.any(doc, rdf.sym(SCHEMA_HELP))?.value || null,
          shape: store.any(doc, rdf.sym(DCT_CONFORMS))?.value || null,
          menuUri: store.any(rdf.sym(`${docUrl}#Menu`), rdf.sym(UI_PARTS))
            ? `plugins/${id}/manifest.ttl#Menu` : null,
        };
      } catch { info = null; }   // no manifest — perfectly fine
      manifestCache.set(id, info);
      return info;
    }

    // Point the chrome at the active plugin: the ? button's source and the
    // ☰ menu's context-source. Defaults stay DECLARED in html-first.html;
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
          attrs: [['source', './pages/settings.html'], ['trusted', '']],
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

    // React to a tab switch: load the active panel, pause the panels we left
    // (except the audio one — it plays on under the mini player), remember it.
    function onTab(name) {
      // Picking a tab dismisses the help overlay (the ? sol-button inline
      // region) and the ☰ menu pane (#dk-menu-pane, the data-for region the
      // ☰ component items display in).
      document.querySelector('.omp-help-launch')?.close?.();
      const menuPane = document.getElementById('dk-menu-pane');
      if (menuPane) menuPane.hidden = true;
      const el = paneForName(name)?.querySelector('[id^="panel-"]');
      if (el) current = el.id.replace(/^panel-/, '');
      el?.ensureLoaded?.();
      for (const k of PANEL_KEYS)
        if (k !== current && k !== audioName) panelEl(k)?.getMediaElement?.()?.pause?.();
      try { localStorage.setItem('dk:active-panel', current); } catch {}
      syncGating(); bindAudio(); updateMini();
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
    // choice or the toggle) → declared default (<sol-default theme>) → system
    // preference. The CSS cascade applies the same precedence for paint; this
    // mirrors it so the toggle/icon reflect what's actually showing.
    function effectiveTheme() {
      const explicit = docEl.getAttribute('data-theme');
      if (explicit) return explicit;
      const declared = solDefault()?.getAttribute('theme');
      if (declared) return declared;
      try { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; }
    }
    // Live lookups — the buttons arrive with the html-first include, usually
    // AFTER this module evaluates; a captured const would stay null.
    const themeBtn = () => document.querySelector('.omp-theme');
    function syncTheme() {
      const btn = themeBtn();
      if (btn) btn.textContent = effectiveTheme() === 'light' ? '☀️' : '🌙';
    }
    function toggleTheme() {
      const next = effectiveTheme() === 'light' ? 'dark' : 'light';
      docEl.setAttribute('data-theme', next);
      try { localStorage.setItem('dk:theme', next); } catch {}
      syncTheme();
      document.dispatchEvent(new CustomEvent('omp:appearance'));
    }
    const SIZES = ['small', 'medium', 'large'];
    function effectiveFontSize() {
      return docEl.getAttribute('data-fontsize')
          || solDefault()?.getAttribute('fontsize')
          || 'medium';
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

    // The ⋮ menu is a <sol-dropdown-button source="./data/menu.ttl#More"> (see
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
    const audioEl = () => panelEl(audioName)?.getMediaElement?.();
    let seeking = false;
    function updateMini() {
      const bar = miniBar(); if (!bar) return;
      const el = audioEl();
      const hide = (current === audioName) || !(el && el.src);
      bar.hidden = hide;
      if (hide || !el) return;
      const play = miniPlay(); if (play) play.textContent = el.paused ? '▶' : '⏸';
      const seek = miniSeek();
      if (seek && !seeking) {
        const d = el.duration || 0;
        seek.value = d ? Math.round((el.currentTime / d) * 1000) : 0;
      }
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
    // <sol-tabs> builds its panels asynchronously (the html-first include);
    // wait for them, then wire tab reactions + restore the last-used tab.
    function whenTabsReady(cb) {
      if (panelEl('news')) return cb();
      let n = 0;
      const t = setInterval(() => {
        if (panelEl('news') || ++n > 60) { clearInterval(t); cb(); }
      }, 50);
    }
    whenTabsReady(() => {
      solTabs = document.getElementById('dk-tabs');
      for (const el of allPanels()) el.addEventListener('omp:access', syncGating);
      solTabs.addEventListener('sol-tab-change', (e) => onTab(e.detail?.name));
      // The ☰ menu pane (declared in index.html with its data-for claims) is
      // re-homed into the tab content area so it overlays the panes — the
      // same re-homing sol-tabs does for the bar/chrome launchers. Mounting
      // into it (mountInTarget fires sol-tab-activate) un-hides it; picking
      // a tab hides it again (onTab above).
      const menuPane = document.getElementById('dk-menu-pane');
      if (menuPane && solTabs.body) {
        solTabs.body.appendChild(menuPane);
        menuPane.addEventListener('sol-tab-activate', () => { menuPane.hidden = false; });
      }
      if (canWrite()) panelEl('news')?.toggleAttribute('editable', true);
      // The appearance buttons arrived with the include — wire + sync them.
      wireAppearanceButtons();
      syncTheme();
      syncFontSize();
      applyContext();

      // News is the startup tab unless a saved choice says otherwise (a
      // saved key for a since-removed tab falls through to the first tab).
      let saved = 'news';
      try { saved = localStorage.getItem('dk:active-panel') || 'news'; } catch {}
      const savedName = nameForKey(saved);
      if (savedName && savedName !== solTabs.activeTab) solTabs.switchTab(savedName);
      else onTab(solTabs.activeTab);   // sync state for the already-active tab
      syncGating();

      // Idle-warm only the panels NOT marked defer — media tabs (music,
      // movies) and the heavy pod tools stay fully lazy: nothing of theirs
      // (playlists, libraries, bundles) loads until the user opens the tab.
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
      idle(() => { for (const el of allPanels()) if (!el.hasAttribute('defer')) el.ensureLoaded?.(); });

      // Panels mount async — retry gating + audio binding until ready.
      let tries = 0;
      const settle = setInterval(() => {
        syncGating(); bindMini(); bindAudio(); updateMini(); wireMenuState();
        if (++tries >= 12 || audioEl()?._ompMiniBound) clearInterval(settle);
      }, 400);
    });
