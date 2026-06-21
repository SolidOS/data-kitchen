// idp-grant.cjs — mint a CSS client-credential and run the headless DPoP
// `client_credentials` grant that turns it into authenticated fetches.
//
// This is the durable, no-popup, no-Authorize path of "remember this IdP":
//   - mintCredential(): drives the CSS account API (login → controls →
//     create-client-credential) to obtain a long-lived, revocable {id, secret}.
//     The account password is used transiently here and never persisted (the
//     vault stores only the resulting credential — see idp-vault.cjs).
//   - createGrantSession(): given a stored credential, manages a DPoP key pair +
//     access-token lifecycle and exposes .fetch(url, init) — a Solid-OIDC
//     DPoP-bound fetch identical in effect to an interactive session's fetch,
//     but obtained with zero user interaction.
//
// All of this runs in the Electron MAIN process. The access token and DPoP
// private key never leave it; the renderer only ever gets a proxied fetch.
//
// The DPoP plumbing (proof JWTs, the use_dpop_nonce retry dance) is hand-built
// because @inrupt/solid-client-authn-node is not installed — jose (already in
// the tree) provides the signing primitives.

'use strict';

const crypto = require('node:crypto');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');

// JSON helper for the CSS account API (mirrors seed-account.cjs).
async function jfetch(url, { method = 'GET', body, gateToken, cookie } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (gateToken) headers['x-dk-token'] = gateToken;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

// The HTTP URI for a DPoP proof's `htu` is the request URL without query/fragment.
function htuOf(url) { const u = new URL(url); return u.origin + u.pathname; }

// Build a DPoP proof JWT bound to (htm, htu), optionally carrying a server nonce
// and the access-token hash (`ath`, required on resource requests).
async function dpopProof({ keyPair, htm, htu, nonce, accessToken }) {
  const jwk = await exportJWK(keyPair.publicKey);
  const payload = { htu, htm, jti: crypto.randomUUID() };
  if (nonce) payload.nonce = nonce;
  if (accessToken) payload.ath = crypto.createHash('sha256').update(accessToken).digest('base64url');
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk })
    .setIssuedAt()
    .sign(keyPair.privateKey);
}

/**
 * Mint a durable client-credential for an issuer via its CSS account API.
 * The password is used only here and discarded by the caller.
 * @param {object} o
 * @param {string} o.origin     issuer origin, e.g. "https://solidcommunity.net"
 * @param {string} o.email      account email
 * @param {string} o.password   account password (transient — never stored)
 * @param {string} [o.webId]    WebID to bind; discovered from the account if absent
 * @param {string} [o.gateToken] x-dk-token, ONLY for the local gated origin
 * @param {string} [o.name]     human label for the credential
 * @returns {{clientId, secret, webId, tokenEndpoint, issuerOrigin}}
 */
async function mintCredential({ origin, email, password, webId, gateToken, name = 'data-kitchen' }) {
  const accountRoot = `${origin}/.account/`;

  const pre = (await jfetch(accountRoot, { gateToken })).json;
  const loginUrl = pre?.controls?.password?.login || `${accountRoot}login/password/`;
  const login = await jfetch(loginUrl, { method: 'POST', gateToken, body: { email, password } });
  if (login.status >= 400 || !login.json?.authorization) {
    throw new Error(`account login failed (HTTP ${login.status})`);
  }
  const cookie = `css-account=${login.json.authorization}`;

  const controls = (await jfetch(accountRoot, { gateToken, cookie })).json?.controls;
  const ccUrl = controls?.account?.clientCredentials;
  if (!ccUrl) throw new Error('clientCredentials control missing — issuer is not a CSS account API');

  let wid = webId;
  if (!wid) {
    const linkCtl = controls?.account?.webId;
    const links = linkCtl ? (await jfetch(linkCtl, { gateToken, cookie })).json?.webIdLinks : null;
    wid = links && Object.keys(links)[0];
    if (!wid) throw new Error('no WebID is linked to this account');
  }

  const made = await jfetch(ccUrl, { method: 'POST', gateToken, cookie, body: { name, webId: wid } });
  if (made.status >= 400 || !made.json?.secret) {
    throw new Error(`mint failed (HTTP ${made.status}): ${made.json?.message || ''}`);
  }
  const tokenEndpoint = await discoverTokenEndpoint(origin, gateToken);
  return { clientId: made.json.id, secret: made.json.secret, webId: wid, tokenEndpoint, resource: made.json.resource, issuerOrigin: origin };
}

/** Discover an issuer's OIDC token endpoint. gateToken only for the local origin. */
async function discoverTokenEndpoint(origin, gateToken) {
  const headers = { accept: 'application/json' };
  if (gateToken) headers['x-dk-token'] = gateToken;
  const res = await fetch(`${origin}/.well-known/openid-configuration`, { headers });
  const cfg = await res.json().catch(() => ({}));
  if (!cfg.token_endpoint) throw new Error('no token_endpoint in OIDC configuration');
  return cfg.token_endpoint;
}

/**
 * Revoke a credential server-side (best-effort), so forgetting truly unlinks it.
 * Needs the account password to re-authenticate, so this is only possible where we
 * still hold it (the local pod). The credential's `resource` URL is returned by
 * mintCredential and kept in the vault for exactly this.
 */
async function revokeCredentialViaAccount({ origin, email, password, gateToken, resource }) {
  if (!resource) return false;
  const accountRoot = `${origin}/.account/`;
  const pre = (await jfetch(accountRoot, { gateToken })).json;
  const loginUrl = pre?.controls?.password?.login || `${accountRoot}login/password/`;
  const login = await jfetch(loginUrl, { method: 'POST', gateToken, body: { email, password } });
  if (!login.json?.authorization) return false;
  const cookie = `css-account=${login.json.authorization}`;
  const res = await fetch(resource, { method: 'DELETE', headers: { cookie, ...(gateToken ? { 'x-dk-token': gateToken } : {}) } });
  return res.ok;
}

/**
 * Build a headless authenticated session from a stored credential. Manages one
 * DPoP key pair and a cached access token (re-granted on expiry/401), and
 * handles the use_dpop_nonce challenge on both the token and resource servers.
 * @param {{clientId, secret, webId, tokenEndpoint, issuerOrigin}} rec
 * @param {object} [o]
 * @param {string} [o.gateToken]   x-dk-token value
 * @param {string} [o.gatedOrigin] the origin x-dk-token applies to (local pod only)
 * @returns {{webId, issuer, fetch}}
 */
function createGrantSession(rec, { gateToken, gatedOrigin } = {}) {
  const { clientId, secret, webId, tokenEndpoint, issuerOrigin } = rec;
  const keyPairP = generateKeyPair('ES256');     // one DPoP key for this session
  let accessToken = null, expiresAt = 0, rsNonce = null;
  const gateFor = (url) => (gatedOrigin && new URL(url).origin === gatedOrigin) ? gateToken : undefined;

  async function requestToken(keyPair, nonce) {
    const proof = await dpopProof({ keyPair, htm: 'POST', htu: htuOf(tokenEndpoint), nonce });
    const headers = {
      authorization: 'Basic ' + Buffer.from(`${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
      dpop: proof,
    };
    const gate = gateFor(tokenEndpoint); if (gate) headers['x-dk-token'] = gate;
    const res = await fetch(tokenEndpoint, { method: 'POST', headers, body: 'grant_type=client_credentials&scope=webid' });
    if ((res.status === 400 || res.status === 401) && !nonce) {
      const n = res.headers.get('dpop-nonce');
      if (n) return requestToken(keyPair, n);
    }
    if (!res.ok) throw new Error(`token request failed (HTTP ${res.status}): ${await res.text().catch(() => '')}`);
    return res.json();
  }

  async function ensureToken(force) {
    const keyPair = await keyPairP;
    if (!force && accessToken && Date.now() < expiresAt - 30_000) return keyPair;
    const tok = await requestToken(keyPair, null);
    accessToken = tok.access_token;
    expiresAt = Date.now() + (Number(tok.expires_in) || 300) * 1000;
    return keyPair;
  }

  async function doFetch(url, init = {}, retried = false) {
    const keyPair = await ensureToken(false);
    const method = (init.method || 'GET').toUpperCase();
    const proof = await dpopProof({ keyPair, htm: method, htu: htuOf(url), accessToken, nonce: rsNonce });
    const headers = { ...(init.headers || {}), authorization: `DPoP ${accessToken}`, dpop: proof };
    const gate = gateFor(url); if (gate) headers['x-dk-token'] = gate;
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401 && !retried) {
      const n = res.headers.get('dpop-nonce');
      if (n) { rsNonce = n; return doFetch(url, init, true); }   // server wants a nonce
      await ensureToken(true);                                    // or the token expired
      return doFetch(url, init, true);
    }
    return res;
  }

  // Force a fresh grant to confirm the credential still works (e.g. not revoked)
  // before we register the session for use; returns the bound WebID.
  async function warmup() { await ensureToken(true); return webId; }

  return { webId, issuer: issuerOrigin, fetch: doFetch, warmup };
}

module.exports = { mintCredential, discoverTokenEndpoint, revokeCredentialViaAccount, createGrantSession };
