// dk-tabs-shell — page-level wiring around the topmost <sol-tabs>: tab-change
// reactions, chrome actions, mini audio player, guest gating, and the help
// overlay. (Adapted from omp-shell when open_media_player was absorbed.)
// The tabs + panels are authored declaratively in html-first.html; here we
// react to <sol-tabs>'s sol-tab-change. Favourites are no longer a tab —
// each media tab surfaces its own favourites.

    // The body UI is authored declaratively in html-first.html and loaded by the
    // #dk-body <sol-include source="./html-first.html"> in index.html. (#dk-tabs
    // therefore appears asynchronously — see whenTabsReady.)

    let solTabs = null;   // assigned once the included <sol-tabs> exists
    const chrome  = document.querySelector('.omp-chrome');
    // The DEFAULT tab set; panels removed from the menu (pantry items a user
    // can re-add via Customize) simply resolve to null here, and re-added
    // ones work through paneForName/onTab regardless of this list.
    const PANEL_KEYS = ['news', 'music', 'movies', 'images', 'podz', 'solidos', 'home', 'solid-resources', 'dev-tools', 'customize'];
    const panelEl   = (key) => document.getElementById('panel-' + key);
    const allPanels = () => PANEL_KEYS.map(panelEl).filter(Boolean);
    let audioName = 'music';
    let current = 'news';
    const activePanel = () => panelEl(current);

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
      // Picking a tab dismisses the help overlay (the ? sol-button inline region).
      document.querySelector('.omp-help-launch')?.close?.();
      const el = paneForName(name)?.querySelector('[id^="panel-"]');
      if (el) current = el.id.replace(/^panel-/, '');
      el?.ensureLoaded?.();
      for (const k of PANEL_KEYS)
        if (k !== current && k !== audioName) panelEl(k)?.getMediaElement?.()?.pause?.();
      try { localStorage.setItem('dk:active-panel', current); } catch {}
      syncGating(); bindAudio(); updateMini();
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
      // The ☰ "Sign in…" item: start the same coalesced flow a 401 does —
      // sol-login listens for sol-auth-needed, surfaces itself ([active])
      // and runs the popup login. resolve is the protocol's completion
      // callback; the menu item has nothing to retry, so it's a no-op.
      signIn:      () => document.dispatchEvent(new CustomEvent('sol-auth-needed', {
        detail: { resolve: () => {} },
      })),
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
      if (canWrite()) panelEl('news')?.toggleAttribute('editable', true);
      // The appearance buttons arrived with the include — wire + sync them.
      wireAppearanceButtons();
      syncTheme();
      syncFontSize();

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
        syncGating(); bindMini(); bindAudio(); updateMini();
        if (++tries >= 12 || audioEl()?._ompMiniBound) clearInterval(settle);
      }, 400);
    });
