// Wormhole guard — the app shell must never run inside a frame (opening
// /index.html from a SolidOS listing would load the whole app recursively).
// When framed, redirect the frame to the /dk-pod/ container (its own view).
//
// Externalized from an inline <script> in index.html so the page can carry a
// strict Content-Security-Policy (script-src 'self', no 'unsafe-inline'). Kept
// as a classic, parser-blocking script referenced FIRST in <head>, so it still
// runs before any other script or the app bundle loads.
// Auth-error loop breaker (must run before the frame redirect below): a failed
// SILENT re-login (prompt=none) bounces back here as
// ?error=interaction_required&state=… . The stored solid-client-authn session
// that triggered it is dead — the IdP wants an interactive login — but left in
// localStorage it re-arms the same silent attempt from every mashlib page (the
// Android SolidOS refresh loop: /dk-pod/ databrowser → IdP → here → /dk-pod/ →
// …). Drop the dead session so the bounce is one-shot; the next real sign-in
// rewrites these keys. A successful login bounce (?code=…) is untouched.
try {
  const q = new URLSearchParams(location.search);
  if (q.has('error') && q.has('state')) {
    localStorage.removeItem('solidClientAuthn:currentSession');
    localStorage.removeItem('solidClientAuthn:currentUrl');
  }
} catch (_) { /* storage unavailable — nothing to break */ }

if (window.top !== window) {
  try { window.stop(); } catch (_) {}
  location.replace(location.origin + '/dk-pod/');
}
