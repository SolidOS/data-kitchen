// Repaints the chrome's Settings gear as the logged-in indicator:
// green tint + WebID surfaced as the gear's hover title. Listens on
// document for sol-login / sol-logout (both bubble + composed, so
// they reach us from any <sol-login> on the page including ones
// inside shadow trees like sol-pod).
//
// Coupled deliberately to the Settings sol-button (not sol-login's
// own UI) so the chrome can keep the login element itself hidden
// (display:none) except during an active sol-auth-needed flow.

const GEAR_AUTHED_CLASS = 'dk-chrome-authed';

function settingsButton() {
  for (const sb of document.querySelectorAll('sol-button')) {
    if (sb.getAttribute('name') === 'Settings') return sb;
  }
  return null;
}

function paintAuthed(webId) {
  const btn = settingsButton();
  if (!btn) return;
  btn.classList.add(GEAR_AUTHED_CLASS);
  if (webId) btn.setAttribute('title', webId);
}

function paintUnauthed() {
  const btn = settingsButton();
  if (!btn) return;
  btn.classList.remove(GEAR_AUTHED_CLASS);
  // Restore the original tooltip declared in markup; the chrome
  // sol-button is authored with title="Settings".
  btn.setAttribute('title', 'Settings');
}

document.addEventListener('sol-login', (e) => {
  const webId = e.detail?.webId || '';
  paintAuthed(webId);
});

document.addEventListener('sol-logout', () => {
  paintUnauthed();
});
