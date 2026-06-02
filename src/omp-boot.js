// Runs first, synchronously, before paint: apply the user's SAVED theme / text
// size (their explicit localStorage choice) so there's no flash. The *default*
// when nothing is saved is declared on <sol-default theme=… fontsize=…> and
// resolved by CSS (see omp.css cascade) — and the system preference is the
// final fallback there. Dev write access is the `solid-kitchen` attribute on
// <sol-default>, read by the app; there is no window global any more.
(function () {
  try {
    var t = localStorage.getItem('omp:theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
    var f = localStorage.getItem('omp:fontsize');
    if (f) document.documentElement.setAttribute('data-fontsize', f);
  } catch (e) {}
})();
