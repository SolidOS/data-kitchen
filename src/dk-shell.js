// dk is loaded directly as a module (index.html: <script type="module"
// src="dist/dk.bundle.js">), AFTER the sol-load bootstrap tag. sol-load
// injects the import map (which also resolves THIS bundle's externals —
// rdflib, sol-components/*, …) and imports every component named in its
// data-components — the basic/pod/form bundles, the bar widgets, login,
// and the managers. So this module pulls in NO sol-* components itself; it
// waits for the loader to finish, then wires up dk's own modules.
//
// IMPORTANT: keep this a fire-and-forget async IIFE, NOT a top-level await.
// sol-load sets window.solLoadReady synchronously from its <head> tag
// (before this module runs), so the guard below is always defined. The
// ComponentInterop fallback keeps dk bootable under ci-driven hosts.
(async () => {
  const ready = (typeof window !== 'undefined')
    ? (window.solLoadReady
       || (window.ComponentInterop || window.SolidWebComponents)?.ready)
    : null;
  if (ready) {
    await ready;
  }

  // Pod locations: seed the shared pod registry from settings RDF
  // (#Locations, schema:position order) BEFORE podz / dk-solidos mount, so
  // their discovery results append after the configured list instead of
  // racing it. Two-way: the feed also persists runtime discoveries back
  // into the settings doc.
  await import('./dk-locations-feed.js');
  await import('../plugins/podz/dk-podz.js');
  await import('../plugins/solidos/dk-solidos.js');
  await import('../plugins/solidos/dk-dokieli.js');
  await import('./dk-settings-applier.js');
  // <dk-config-settings>: the Electron + Pivot groups of the settings page,
  // edited over the preload IPC bridge (electron-config.jsonld).
  await import('./dk-config-settings.js');
  // <dk-plugin-settings>: per-plugin settings groups on the settings page,
  // RDF-driven and gated on catalog in-use status.
  await import('./dk-plugin-settings.js');
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
  // Feed the sign-in issuer list from settings (the #Issuers positioned list,
  // edited on the settings page's rolodex) into every <sol-login> — each pod's
  // login and any standalone one — so issuers are user-configured, not hardcoded.
  await import('./dk-issuers-feed.js');
})();
