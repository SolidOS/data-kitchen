// Runs first, synchronously, before paint: apply the user's SAVED theme / text
// size (their explicit localStorage choice) so there's no flash. The *default*
// when nothing is saved comes from <sol-default>'s RDF source (ui:colorScheme /
// ui:fontSize → the `color-scheme` / `font-size` attributes) and is resolved by
// CSS (see dk-chrome.css cascade, which suffix-matches the UI-vocab URI) — with
// the system preference as the final fallback. NOTE: the RDF-derived attributes
// arrive after a fetch, so on a brand-new profile (empty localStorage) first
// paint shows the system theme, then snaps to the RDF default once it resolves;
// returning users hit the localStorage path above and never flash. Dev write
// access is the `solid-kitchen` attribute on <sol-default>, read by the app;
// there is no window global any more.
(function () {
  try {
    var t = localStorage.getItem('dk:theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
    var f = localStorage.getItem('dk:fontsize');
    if (f) document.documentElement.setAttribute('data-fontsize', f);
  } catch (e) {}
})();

// One-shot: wipe podz's RETIRED sessionPods field (the pod list persists in
// settings RDF now — #Locations, synced by dk-locations-feed) and the
// last-viewed pod selection so the next dk load takes podz's fresh-session
// path. Bump the flag (v3 → v4 → …) to re-clear.
(function () {
  try {
    if (localStorage.getItem('dk-cleared-session-pods-v3')) return;
    var raw = localStorage.getItem('podz_v4');
    if (raw) {
      var blob = JSON.parse(raw);
      delete blob.sessionPods;
      delete blob.selection;
      localStorage.setItem('podz_v4', JSON.stringify(blob));
    }
    // Legacy keys, in case an old podz version still wrote them.
    localStorage.removeItem('podz_session_pods');
    localStorage.removeItem('podzPodSelection');
    localStorage.setItem('dk-cleared-session-pods-v3', '1');
  } catch (e) {}
})();
