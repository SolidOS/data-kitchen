// dk-idp-proxy-session — an AuthManager session whose fetch runs in Electron main.
//
// Backs "remember this IdP": when the user picks a previously-remembered issuer,
// main holds a durable, headless DPoP session (electron-config/idp-grant.cjs) and
// we register THIS object under the right side tag so AuthManager routes that
// issuer's requests through it. Every .fetch() is proxied over IPC to main, which
// attaches the auth; the renderer never sees the access token or DPoP key.
//
// Same shape AuthManager expects as dk-owner-session.js:
//   { info: { isLoggedIn, webId, issuer, sessionId }, fetch, logout }.

// Flatten a fetch() call's headers/method/body into something structured-clone
// safe for the IPC bridge (Headers → plain object; string/ArrayBuffer bodies pass
// through — Solid writes are turtle/sparql strings).
function serializeInit(input, init) {
  const i = init || {};
  const headers = {};
  const src = i.headers || (typeof input !== 'string' && input && input.headers);
  if (src) {
    if (Array.isArray(src)) for (const [k, v] of src) headers[k] = v;
    else if (typeof src.forEach === 'function') src.forEach((v, k) => { headers[k] = v; });
    else Object.assign(headers, src);
  }
  const method = i.method || (typeof input !== 'string' && input && input.method) || 'GET';
  return { method, headers, body: i.body };
}

/**
 * @param {string} issuer  issuer origin main keyed the session under
 * @param {string} webId   the bound WebID
 */
export function createMainProxySession(issuer, webId) {
  return {
    info: { isLoggedIn: true, webId, issuer, sessionId: `dk-idp:${issuer}`, clientAppId: null },
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const r = await window.dkElectron.idpFetch(issuer, url, serializeInit(input, init));
      // r is plain data (a Response can't cross contextBridge intact) — rebuild
      // a real Response here in the main world.
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
    },
    // "Remember" persists until the user explicitly forgets the issuer; a plain
    // logout just drops the in-memory session (the consumer removes it from
    // AuthManager), leaving the vault so a later click re-logs-in silently.
    logout: async () => {},
  };
}
