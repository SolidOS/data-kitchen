// Persist the active dk view (menu item or top-bar button name) to
// localStorage and restore it on next load.
//
// sol-tab-activate is the canonical "something just mounted into the dk
// content target" event — fired by component-mount.js for sol-menu leaves,
// sol-button (Help / Settings), and anything else using the shared mount
// helper. We treat its `detail.name` as the routing key.

const KEY = 'dk-nav-current';

// Read once at module load so the auto-select that sol-menu fires on
// connect (saving "Home" before we get a chance to restore) doesn't
// clobber the value we want to restore.
let savedAtBoot = null;
try { savedAtBoot = localStorage.getItem(KEY); } catch (_) {}

let restoreDone = false;

function save(name) {
  if (!restoreDone || !name) return;
  try { localStorage.setItem(KEY, name); } catch (_) {}
}

document.addEventListener('sol-tab-activate', (e) => save(e.detail?.name));

function restore() {
  if (restoreDone) return;
  restoreDone = true;
  if (!savedAtBoot) return;

  const menu = document.querySelector('sol-menu');
  if (menu?.activeItem === savedAtBoot) return;

  // Try a menu leaf first. menu.select() silently no-ops if `savedAtBoot`
  // isn't one of its items, so we check activeItem afterwards to know
  // whether the menu took it.
  if (typeof menu?.select === 'function') {
    menu.select(savedAtBoot);
    if (menu.activeItem === savedAtBoot) return;
  }

  // Fall back to a top-bar sol-button (e.g. Help, Settings).
  const btn = document.querySelector(`sol-button[name="${CSS.escape(savedAtBoot)}"]`);
  if (btn) btn.click();
}

// sol-menu fires sol-menu-change once on connect after its initial
// auto-select — that's our cue that the menu is ready to accept a new
// select(). Run restore exactly once.
document.addEventListener('sol-menu-change', restore, { once: true });

// Fallback in case the menu never emits a change event (e.g. no leaves
// resolved from RDF) — run on full window load if we haven't already.
window.addEventListener('load', () => setTimeout(restore, 100));
