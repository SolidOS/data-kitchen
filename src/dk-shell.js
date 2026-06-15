// dk is loaded directly as a module (index.html: <script type="module"
// src="dist/dk.bundle.js">), AFTER the component-interop loader tag. The loader
// reads sol-components' manifest + dk's, injects the importmap, and import()s
// every sol-* component dk uses — the basic/pod family, the dashboard widgets,
// login/query, and the rdf editing stack (the rdf-bundle). So this module pulls
// in NO sol-* components or libs itself; it just waits for the loader to finish,
// then wires up dk's own modules.
//
// IMPORTANT: keep this a fire-and-forget async IIFE, NOT a top-level await.
// component-interop sets window.ComponentInterop.ready synchronously from the
// <head> tag (before this module runs), so the guard below is always defined;
// the IIFE pattern also keeps dk out of any import-chain deadlock if the bundle
// is ever loaded via the loader instead. We wait on ComponentInterop.ready —
// sol-components aliases window.SolidWebComponents to the same object once a sol
// module runs, but ComponentInterop is the one guaranteed present here.
(async () => {
  const interop = (typeof window !== 'undefined')
    ? (window.ComponentInterop || window.SolidWebComponents)
    : null;
  if (interop?.ready) {
    await interop.ready;
  }

  await import('../plugins/podz/dk-podz.js');
  await import('../plugins/solidos/dk-solidos.js');
  await import('../plugins/calendar/dk-calendar-popout.js');
  await import('./dk-settings-applier.js');
  // <dk-config-settings>: the Electron + Pivot groups of the settings page,
  // edited over the preload IPC bridge (electron-config.jsonld).
  await import('./dk-config-settings.js');
  // <dk-issuers-editor>: the sign-in issuer list (solid:oidcIssuer) on the
  // settings page's Data Kitchen group.
  await import('./dk-issuers-editor.js');
  // Register the local pod owner as a logged-in session BEFORE the auth router
  // and any widget's first authed fetch, so the app reads as the owner (and
  // podz can discover the pod).
  await import('./dk-owner-session.js');
  await import('./dk-auth-router.js');
  await import('./dk-auth-indicator.js');
  // Page wiring around the topmost <sol-tabs> (tab reactions, chrome
  // commands, mini player, gating). Replaces the old sol-menu nav-state.
  await import('./dk-tabs-shell.js');
  // The RDF side of the shell (rdf-first): build the #Bar / #Chrome launchers
  // from ui-data/data-kitchen-main-menu.ttl at load, live-update the running shell in place after a
  // Customize save, and self-heal #Chrome.
  await import('./dk-tabs-rdf.js');
})();
