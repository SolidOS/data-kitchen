// dk-auth-router parses the URL fragment for `auth=<tag>` and exports
// `dkFetch(url, init?)` (+ `getActiveAuthTag()`). Components that do
// ad-hoc authenticated fetches at dk level import dkFetch; it routes
// via the shared AuthManager so the active tag's session is used. When
// no tag is set, AuthManager.fetchFor walks all sessions in
// registration order and uses the first that covers the origin.
// (Formerly window.dkFetch / window.dkActiveAuthTag — module exports
// since 2026-07-14; every consumer lives in dk's own bundle.)

function parseHashTag() {
  const h = location.hash || '';
  // Match `#auth=foo` or `#…&auth=foo`. The fragment is opaque to the
  // browser, so we just scan for the pattern.
  const m = h.match(/(?:^|[#&])auth=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function findAuthManager() {
  // dk no longer mounts a sol-login of its own — login UIs live inside
  // embedded apps (podz mounts sol-login inside its sol-pod shadow
  // root, future apps follow the same pattern). The page-wide singleton
  // is reachable through the swc bundle's AuthManager.shared accessor
  // regardless of whether any sol-login element is currently in the
  // DOM. Fall back to DOM probing so dev surfaces that DO mount a
  // sol-login still work if the bundle hasn't loaded yet.
  return window.SolidWebComponents?.AuthManager?.shared
      ?? document.querySelector('sol-login')?.auth
      ?? null;
}

let activeAuthTag = null;
export function getActiveAuthTag() { return activeAuthTag; }

function updateActiveTag() {
  const tag = parseHashTag();
  activeAuthTag = tag;  // may be null — fetchFor handles that
  document.dispatchEvent(new CustomEvent('dk-active-auth-change', {
    bubbles: false,
    detail: { tag },
  }));
}

// dkFetch routes through swc's solFetch so a 401 anywhere in dk
// (calendar PATCH, sol-feed bookmark write, hand-written widget POSTs)
// triggers the chrome's <sol-login> auto-prompt + retry. The active
// auth tag (from #auth=…) is threaded through as `init.authTag` so
// AuthManager picks the right session when multiple are active.
export async function dkFetch(url, init) {
  const am = findAuthManager();
  if (!am) return fetch(url, init);
  const { solFetch } = await import('sol-components/core/auth-fetch.js');
  const merged = { ...(init || {}), authTag: activeAuthTag || undefined };
  return solFetch(url, merged);
}

updateActiveTag();
window.addEventListener('hashchange', updateActiveTag);
