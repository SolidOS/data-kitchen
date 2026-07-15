// dk-owner-session — register the local pod OWNER as a logged-in session.
//
// data-kitchen's local CSS runs allow-all behind the gate token (gate.cjs — the
// REAL access control), so the app already reads/writes the pod without a login.
// What was missing is IDENTITY: with no session, AuthManager.getWebId() is null,
// so podz shows "no pods found", the chrome reads logged-out, and owner-only UI
// stays hidden.
//
// Approach (A): synthesize a local session for the owner WebID
// (<origin>/dk-pod/profile/card#me, seeded by electron-config/pod-template.cjs).
// Its `.fetch` is plain window.fetch — the gate header/cookie authorizes the
// traffic; no OIDC token is involved. This is a presentational/functional
// overlay over the gate, NOT WebAC enforcement.

const origin = location.origin;
const OWNER_WEBID = `${origin}/dk-pod/profile/card#me`;

// AuthManager session shape (see node_modules/sol-components/core/auth-core.js):
// { info: { isLoggedIn, webId, issuer, sessionId }, fetch }. sessionCoversOrigin
// matches the webId/issuer host (incl. port) against the request origin — and we
// derive both from location.origin, so the session covers every same-origin
// (i.e. local pod) request and never claims external origins.
const ownerSession = {
  info: {
    isLoggedIn: true,
    webId: OWNER_WEBID,
    issuer: `${origin}/`,
    sessionId: 'dk-owner',
    clientAppId: null,
  },
  fetch: (input, init) => window.fetch(input, init),
  // A consumer may call logout(); make it a harmless no-op — the gate, not this
  // session, controls access, so "logging out" of a synthetic session is moot.
  logout: async () => {},
};

function register() {
  const am = window.SolidWebComponents?.AuthManager?.shared;
  if (!am) return false;
  // 'default' is the tag AuthManager.getWebId()/dkFetch use when no
  // `#auth=` tag is set. Embedded logins (podz, SolidOS) register under their
  // own side tags, so this never clobbers a real session the user establishes —
  // and we only seed 'default' if nothing logged-in already holds it.
  if (!am.sessions.get('default')?.info?.isLoggedIn) {
    am.sessions.set('default', ownerSession);
  }
  // dk mounts no <sol-login>, so the chrome (dk-auth-indicator) and any pod
  // discovery that waits on a login event need an explicit nudge.
  document.dispatchEvent(new CustomEvent('sol-login', {
    bubbles: true,
    composed: true,
    detail: { webId: OWNER_WEBID, issuer: ownerSession.info.issuer, side: 'default' },
  }));
  return true;
}

// The swc bundle (hence AuthManager) is ready by the time dk-shell imports this
// (after solLoadReady); retry briefly in case the namespace alias lags.
if (!register()) {
  let tries = 0;
  const timer = setInterval(() => {
    if (register() || ++tries > 20) clearInterval(timer);
  }, 100);
}

export { OWNER_WEBID };
