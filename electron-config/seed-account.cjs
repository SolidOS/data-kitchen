// seed-account.cjs — provision a LOCAL CSS account so THIRD-PARTY Solid apps
// can log in against this server (their own OIDC flow) with the dummy password
// "!secret" and come back as the pod owner.
//
// The local CSS is allow-all behind dk's gate (the real access control), and dk
// itself uses a synthetic session (src/dk-owner-session.js) — so dk needs no
// account. But a third-party app runs ITS OWN solid-client-authn against our
// origin, which requires a genuine OIDC login: an account with a password that
// owns the WebID. "!secret" is that password; it isn't a real secret (the gate
// is), it just lets the standard login form complete.
//
// We can't seed this via the normal account+pod seeding because our /dk-pod/
// folder already exists, so CSS's pod creation throws and rolls back the WebID
// link (see the Phase-5 spike). Instead we drive the account HTTP API to create
// the account + password and LINK THE EXISTING WebID, satisfying CSS's
// ownership-token challenge by briefly writing the token into the profile we
// own on disk. Flow validated against the CSS v7 account API (v0.5):
//   1. POST /.account/account/        → account + css-account cookie
//   2. POST <password.create> {email,password}
//   3. POST <webId link> {webId}      → 400 with an ownership-challenge triple
//   4. append that triple to the owner profile on disk
//   5. POST <webId link> {webId}      → 200, WebID linked + oidcIssuer set
//   6. restore the profile (remove the triple)
// Idempotent: a userData flag short-circuits, and "email already in use" is
// treated as already-provisioned.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const OWNER_EMAIL = 'owner@localhost.invalid';
const OWNER_PASSWORD = '!secret';

async function jfetch(url, { method = 'GET', body, gateToken, cookie } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (gateToken) headers['x-dk-token'] = gateToken;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

/**
 * Provision the owner account for third-party `!secret` logins. Best-effort:
 * resolves with a {status} object; throws only on an unexpected failure.
 * @param {object} o
 * @param {string} o.publicOrigin  e.g. "http://localhost:8000" (no trailing /)
 * @param {string} [o.gateToken]   x-dk-token value (absent in standalone dev)
 * @param {string} o.podRoot       pod root (to write the ownership challenge)
 * @param {string} [o.flagFile]    userData flag path for idempotency
 */
async function seedOwnerAccount({ publicOrigin, gateToken, podRoot, flagFile }) {
  if (flagFile && fs.existsSync(flagFile)) return { status: 'already' };
  const accountRoot = `${publicOrigin}/.account/`;
  const webId = `${publicOrigin}/dk-pod/profile/card#me`;

  // 1. create an account → authorization token (also the css-account cookie)
  const create = await jfetch(`${accountRoot}account/`, { method: 'POST', gateToken });
  const auth = create.json?.authorization;
  if (!auth) throw new Error(`account create failed (HTTP ${create.status})`);
  const cookie = `css-account=${auth}`;

  // discover the authenticated controls
  const ctrl = (await jfetch(accountRoot, { gateToken, cookie })).json?.controls || {};
  const pwCreate = ctrl.password?.create;
  const linkWebId = ctrl.account?.webId;
  if (!pwCreate || !linkWebId) throw new Error('authenticated account controls missing (password.create / webId)');

  // 2. add the password login
  const pw = await jfetch(pwCreate, { method: 'POST', gateToken, cookie, body: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
  if (pw.status >= 400) {
    if (/already|in use|taken/i.test(pw.json?.message || '')) {
      if (flagFile) try { fs.writeFileSync(flagFile, 'done\n'); } catch {}
      return { status: 'already' };
    }
    throw new Error(`password create failed (HTTP ${pw.status}): ${pw.json?.message || ''}`);
  }

  // 3. link the EXISTING WebID — expect the ownership-token challenge
  let link = await jfetch(linkWebId, { method: 'POST', gateToken, cookie, body: { webId } });
  if (link.status >= 400) {
    const quad = link.json?.details?.quad;   // e.g. `<webid> <…#oidcIssuerRegistrationToken> "<token>".`
    if (!quad) throw new Error(`link WebID: no challenge quad (HTTP ${link.status}): ${link.json?.message || ''}`);
    // 4. briefly add the challenge triple to the profile we own on disk
    const profile = path.join(podRoot, 'dk-pod', 'profile', 'card$.ttl');
    const original = fs.readFileSync(profile, 'utf8');
    fs.writeFileSync(profile, original.replace(/\s*$/, '\n') + quad + '\n');
    try {
      // 5. retry the link now that the proof is present
      link = await jfetch(linkWebId, { method: 'POST', gateToken, cookie, body: { webId } });
      if (link.status >= 400) throw new Error(`link WebID after challenge failed (HTTP ${link.status}): ${link.json?.message || ''}`);
    } finally {
      // 6. restore the profile (drop the transient triple)
      fs.writeFileSync(profile, original);
    }
  }
  if (flagFile) try { fs.writeFileSync(flagFile, 'done\n'); } catch {}
  return { status: 'linked' };
}

module.exports = { seedOwnerAccount, OWNER_EMAIL, OWNER_PASSWORD };
