// Wormhole guard — the app shell must never run inside a frame (opening
// /index.html from a SolidOS listing would load the whole app recursively).
// When framed, redirect the frame to the /dk-pod/ container (its own view).
//
// Externalized from an inline <script> in index.html so the page can carry a
// strict Content-Security-Policy (script-src 'self', no 'unsafe-inline'). Kept
// as a classic, parser-blocking script referenced FIRST in <head>, so it still
// runs before any other script or the app bundle loads.
if (window.top !== window) {
  try { window.stop(); } catch (_) {}
  location.replace(location.origin + '/dk-pod/');
}
