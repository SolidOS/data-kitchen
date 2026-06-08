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

  await import('./dk-podz.js');
  await import('./dk-solidos.js');
  await import('./dk-calendar-popout.js');
  await import('./dk-settings-applier.js');
  await import('./dk-auth-router.js');
  await import('./dk-auth-indicator.js');
  await import('./dk-nav-state.js');
})();
