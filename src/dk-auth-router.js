// dk-auth-router exports `dkFetch(url, init?)`. Components that do ad-hoc
// authenticated fetches at dk level import it; it routes through the shared
// AuthManager's solFetch, which picks the session that covers the request's
// origin (the local owner for the local pod, the one remote OIDC session for a
// remote pod) and prompts on a 401.
// (Formerly window.dkFetch — a module export since 2026-07-14; every consumer
// lives in dk's own bundle.)

function findAuthManager() {
  // dk no longer mounts a sol-login of its own — login UIs live inside embedded
  // apps (podz mounts sol-login inside its sol-pod shadow root). The page-wide
  // singleton is reachable through the swc bundle's AuthManager.shared accessor
  // regardless of whether any sol-login element is currently in the DOM. Fall
  // back to DOM probing so dev surfaces that DO mount a sol-login still work if
  // the bundle hasn't loaded yet.
  return window.SolidWebComponents?.AuthManager?.shared
      ?? document.querySelector('sol-login')?.auth
      ?? null;
}

// dkFetch routes through swc's solFetch so a 401 anywhere in dk (calendar
// PATCH, sol-feed bookmark write, hand-written widget POSTs) triggers a
// <sol-login> auto-prompt + retry, and an already-covered request uses the
// right session with no prompt.
export async function dkFetch(url, init) {
  const am = findAuthManager();
  if (!am) return fetch(url, init);
  const { solFetch } = await import('sol-components/core/auth-fetch.js');
  return solFetch(url, init);
}
