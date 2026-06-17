# Data-Kitchen desktop shell — native overlays & external content

This folder is the Electron layer that wraps the Data-Kitchen web app in a
desktop window. Most of it is plumbing (config, the bundled servers, seeding a
pod). The part that surprises people — and that has no obvious home in the web
code — is how **external web content is shown using native Electron views layered
over the app**, instead of in HTML iframes. This README documents that
subsystem.

> TL;DR: external sites (duck.ai, Bluesky, feed articles, search results) are
> NOT iframed. They render in native `WebContentsView`s painted *on top of* the
> app, positioned to line up with a region of the page. Because they're native,
> they don't obey the app's z-index/DOM, so their lifecycle has to be driven
> explicitly. Getting that lifecycle wrong is why a reader can "take over" the
> window.

## Why native views instead of iframes

Two reasons:

1. **Framing-blockers.** Many sites (`bsky.app`, most large apps) send
   `X-Frame-Options` / `frame-ancestors` headers that refuse to load in an
   iframe. A native `WebContentsView` is a real browser tab — nothing to refuse.
2. **Security isolation.** External content must never reach this machine's local
   servers (the bundled CSS pod, the no-auth CORS proxy). Native views get their
   own Electron `session` (cookie jar + request filter), which lets us cancel
   any request from external content to a loopback host. See **Sessions** below.

The cost: a native view is **not** part of the page's DOM. It always paints above
the app's HTML, ignores the app's z-index, and has no automatic tie to whatever
HTML element it's visually "inside." Everything about showing/hiding/positioning
it is done by hand over IPC.

## The window model

```
BaseWindow                          (the OS window; main.cjs)
└─ contentView                      (Electron's root child-view container)
   ├─ appView        WebContentsView  ← the Data-Kitchen web app, fills the window
   ├─ pane           WebContentsView  ← (optional) shadows an external <iframe>
   ├─ paneLoading    WebContentsView  ← (optional) "Loading…" cover over the pane
   ├─ readerContent  WebContentsView  ← (optional) a window.open'd external page
   └─ readerBar      WebContentsView  ← (optional) the reader's Back/Fwd/Reload/Close strip
```

`addChildView` appends **on top**. The app view is added first and kept sized to
the whole window (`fitAppView`, watchdog every 500 ms). The overlay views are
added/removed on demand by `ExternalViews` (`external-views.cjs`) and always sit
above the app.

## The three kinds of external content

| Kind | Triggered by | Native view(s) | Region it covers | Closed by |
|------|--------------|----------------|------------------|-----------|
| **reader** | `window.open(url)` (bar links like duck.ai/Bluesky, feed articles, search) **or** the app trying to navigate itself to an external URL | `readerContent` + `readerBar` | the whole tab-content region (`.sol-tabs-content`) | its own ✕/Esc, **or a tab switch** (see Lifecycle) |
| **pane** | the app mounting an external `<iframe>` in `#dk-content` (an in-app app, e.g. a Solid pod opened as a tab) | `pane` (+ `paneLoading` while it boots) | the iframe's own box (so the plugin's surrounding chrome stays visible) | the iframe losing its client rects (tab hidden / removed) |
| **login popup** | `window.open` whose frame name/features look like OIDC login | a **real** `BrowserWindow` | — | the user / the OIDC flow |

The login popup is deliberately a real OS window (not an overlay): a login flow
must be a true top-level browsing context. It runs on the **default** session so
it inherits the gate token and can complete against the local pod.

### reader (the one most likely to misbehave)

`ExternalViews.openReader(url)` lazily builds a content view + a toolbar strip
(`reader-chrome.html`, 40 px tall), stacks them over `_region()` (the
`.sol-tabs-content` rect last reported by the preload), and loads the URL.
The toolbar's buttons (`reader-chrome-preload.cjs`) send `dk:reader-back` /
`-forward` / `-reload` / `-close`; main pushes nav state back via
`dk:reader-state` so Back/Forward enable correctly.

It is a **single reused view** with no tie to any tab. That is the gotcha:
nothing about switching tabs in the app automatically dismisses it. See
**Lifecycle**.

### pane

`openPane(url, rect)` runs the external app on the **trusted-guest** session so
it can reach (and log into) the local pod's PUBLIC port. The preload shadows the
page's real `<iframe>` — it sets the iframe to `visibility:hidden` (keeping its
layout box) and reports that box as `dk:pane-rect`, so the native pane lines up
exactly. A `paneLoading` cover (`pane-loading.html`) hides the blank rectangle
until the app actually *paints* (it polls for a Flutter render root or any
sizable content, with a 10 s safety cap), because "network stopped" ≠ "painted."

## Geometry: how a native view knows where to sit

The preload (`preload.cjs`) measures the page and reports rects to main, throttled
to one `requestAnimationFrame`:

- `dk:content-rect` — the `.sol-tabs-content` element's rect (falls back to
  `#dk-content` before the tabset exists). This is the reader's region. Note the
  tab **bar** lives inside `#dk-content` *above* `.sol-tabs-content`, so reporting
  the inner region keeps the tab bar visible/clickable above the reader.
- `dk:pane-rect` — the tracked external iframe's own rect.

Re-reported on every relevant DOM mutation, on `ResizeObserver`, on `resize`, and
on capture-phase `scroll`, so the overlays stay glued as layout shifts.

## The suspend/resume guard (why your dropdown isn't "truncated")

Because native views paint above ALL of the app's HTML, any app-drawn popup that
overlaps the content region — a `sol-dropdown-button` popup, `sol-search` panel,
`dk-calendar-popout`, the inline help (`sol-button[open]`), a `sol-modal`, or the
`#dk-menu-pane` — would be occluded by the reader/pane.

The preload watches all those hosts (incrementally — custom elements upgrade
async, and submenu dropdowns are built from RDF *after* boot and rebuilt on a
Customize save, so the guard re-binds on every body mutation). When *any* of them
is open it sends `dk:overlays-suspend` (main removes the native views); when the
last one closes, `dk:overlays-resume` (main re-adds whatever was logically shown,
re-laying it out). `suspend()`/`resume()` preserve the `_paneShown` /
`_readerShown` flags so resume restores the correct state.

## Lifecycle — and the tab-switch gotcha

The **pane** is self-healing: its lifetime follows the iframe. When a tab switch
hides the iframe (no client rects), the preload sends `dk:pane-close`; showing it
again re-opens it. Good.

The **reader** is NOT self-healing. It's opened by `window.open` and, on its own,
only closes via its ✕/Esc. Nothing about navigating the *app* (switching tabs)
touches it. So without help, opening duck.ai/Bluesky and then switching tabs
leaves the reader floating over `.sol-tabs-content`: the destination tab paints
*underneath* it (looks like "nothing can paint"), and tab clicks register on the
bar above but the result is hidden (looks like "clicking tabs does odd things").

The fix lives in the renderer shell, not here: `src/dk-tabs-shell.js` calls
`window.dkElectron.closeReader()` from `onTab` on a real `sol-tab-change`.
It is deliberately in `onTab`, **not** in `dismissPanes()` — the bar-link click
that *opens* the reader also runs `dismissPanes()`, so closing there would race
the open shut. `onTab` only fires on an actual tab switch, never on a bar-link
click.

> Rule of thumb: any new way to switch what the app is showing must dismiss the
> reader (`dkElectron.closeReader()`). The reader has no DOM presence to hide it
> for you.

## Sessions & the gate token (security)

Three Electron sessions, increasingly trusted:

| Session (partition) | Used by | Loopback access | Gate token? |
|---------------------|---------|-----------------|-------------|
| `default` | the app view, the OIDC login popup | full (it IS the app) | yes — injected on PUBLIC + PROXY ports |
| `persist:trusted-guest` | **pane** (deliberately-opened apps) | **only** the pod's PUBLIC port | yes — PUBLIC port only, never the proxy |
| `persist:external` | **reader** + the pane-loading cover | **none** — every loopback request cancelled | no |

The local servers (front, CSS pivot, CORS proxy) require a per-install gate token
(`gate.cjs`); main injects `x-dk-token` only on default- and trusted-guest-session
requests to the allowed loopback ports (`installGateHeader`). The external session
cancels *all* loopback requests outright (`hardenedExternalSession`), and the
trusted-guest session cancels every loopback target except the pod's PUBLIC port
(`hardenedTrustedGuestSession`). Net effect: incidental external content can't
touch this machine; a deliberately-opened app can reach only the pod.

## IPC reference

Renderer → main (`ipcMain.on` in `main.cjs:wireIpc`):

| Channel | Sent by | Effect |
|---------|---------|--------|
| `dk:content-rect` | preload (rAF) | `setContentRect` — reader region |
| `dk:pane-rect` | preload (rAF) | `setPaneRect` — pane position |
| `dk:pane-open` | preload (iframe detected) | `openPane(url, rect)` |
| `dk:pane-close` | preload (iframe gone) | `closePane()` |
| `dk:overlays-suspend` / `-resume` | preload guard | `suspend()` / `resume()` |
| `dk:reader-back` / `-forward` / `-reload` | reader toolbar | navigate reader |
| `dk:reader-close` | reader toolbar **and** `dkElectron.closeReader()` (tab switch) | `closeReader()` |

Main → renderer:

| Channel | To | Payload |
|---------|----|---------|
| `dk:reader-state` | reader toolbar | `{canGoBack, canGoForward, url}` |

`contextBridge` surfaces (what page/JS can call):

- `window.dkElectron` (app, via `preload.cjs`): `restart`, `closeReader`,
  `moveMyPod`, `getConfig`, `saveConfig`, plus `isElectron`.
- `window.readerChrome` (reader toolbar, via `reader-chrome-preload.cjs`):
  `back`, `forward`, `reload`, `close`, `onState`.

## File map

| File | Role |
|------|------|
| `main.cjs` | window + app view, server lifecycle, `will-navigate` → reader, `setWindowOpenHandler` (login popup vs reader), gate-token header injection, all IPC wiring |
| `external-views.cjs` | the `ExternalViews` class: builds/positions/suspends the pane, pane-loading cover, and reader; the three hardened sessions |
| `preload.cjs` | app preload: reports content/pane rects, detects external iframes (open/close pane), the suspend/resume guard, the `dkElectron` bridge |
| `reader-chrome.html` | the reader's toolbar markup (Back/Forward/Reload/Close + URL) |
| `reader-chrome-preload.cjs` | toolbar bridge (`window.readerChrome`) |
| `pane-loading.html` | the "Loading…" cover shown over a booting pane |
| `config.cjs` | ports (PUBLIC/CSS-internal/proxy), pod root, read/write config |
| `gate.cjs` | per-install gate token for the local servers |
| `servers.cjs` | starts/stops the bundled front, CSS pivot, and CORS proxy |
| `seed*.cjs`, `pod-template.cjs` | first-run pod seeding |

## Related renderer code (not in this folder)

- `src/dk-tabs-shell.js` — reacts to tab changes; **closes the reader on tab
  switch** (`onTab` → `dkElectron.closeReader()`).
- `sol-components/web/sol-tabs.js` — `_buildLinkLauncher` renders a `ui:Link`
  plugin (duck.ai, Bluesky) as a bar button whose click is `window.open(href)`.
- `plugins/*.ttl` — `a ui:Link` plugins that become reader-opening bar links;
  `a ui:Component` plugins that mount in-page.
</content>
