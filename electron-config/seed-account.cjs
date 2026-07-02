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
const { jfetch } = require('./jfetch.cjs');

const OWNER_EMAIL = 'me@dk.local';
const OWNER_PASSWORD = '!secret';

/**
 * Provision the owner account for third-party `!secret` logins. Best-effort +
 * idempotent by checking ACTUAL state (login-first, link-aware) rather than a
 * flag — so it correctly links an account that exists but was never linked.
 * @param {object} o
 * @param {string} o.publicOrigin  e.g. "http://localhost:8000" (no trailing /)
 * @param {string} [o.gateToken]   x-dk-token value (absent in standalone dev)
 * @param {string} o.podRoot       pod root (to write the ownership challenge)
 */
async function seedOwnerAccount({ publicOrigin, gateToken, podRoot }) {
  const accountRoot = `${publicOrigin}/.account/`;
  const webId = `${publicOrigin}/dk-pod/profile/card#me`;

  // 1. Authenticate. Log in if the account already exists (avoids piling up
  //    empty accounts); otherwise create it + set the password.
  let cookie;
  const login = await jfetch(`${accountRoot}login/password/`, {
    method: 'POST', gateToken, body: { email: OWNER_EMAIL, password: OWNER_PASSWORD },
  });
  if (login.status < 400 && login.json?.authorization) {
    cookie = `css-account=${login.json.authorization}`;
  } else {
    const create = await jfetch(`${accountRoot}account/`, { method: 'POST', gateToken });
    if (!create.json?.authorization) throw new Error(`account create failed (HTTP ${create.status})`);
    cookie = `css-account=${create.json.authorization}`;
    const pwCreate = (await jfetch(accountRoot, { gateToken, cookie })).json?.controls?.password?.create;
    if (!pwCreate) throw new Error('password.create control missing');
    const pw = await jfetch(pwCreate, { method: 'POST', gateToken, cookie, body: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
    if (pw.status >= 400) throw new Error(`password create failed (HTTP ${pw.status}): ${pw.json?.message || ''}`);
  }

  // 2. Ensure the WebID is linked (the POST itself tells us the state).
  const linkWebId = (await jfetch(accountRoot, { gateToken, cookie })).json?.controls?.account?.webId;
  if (!linkWebId) throw new Error('webId link control missing');
  let link = await jfetch(linkWebId, { method: 'POST', gateToken, cookie, body: { webId } });
  if (link.status < 400) return { status: 'linked' };
  if (/already (registered|linked)/i.test(link.json?.message || '')) return { status: 'already-linked' };

  // 3. Ownership challenge: briefly add the token triple to the profile we own
  //    on disk (CSS fetches the now-public profile to verify it), then retry.
  const quad = link.json?.details?.quad;   // `<webid> <…#oidcIssuerRegistrationToken> "<token>".`
  if (!quad) throw new Error(`link WebID: no challenge quad (HTTP ${link.status}): ${link.json?.message || ''}`);
  const profile = path.join(podRoot, 'dk-pod', 'profile', 'card$.ttl');
  const original = fs.readFileSync(profile, 'utf8');
  fs.writeFileSync(profile, original.replace(/\s*$/, '\n') + quad + '\n');
  try {
    link = await jfetch(linkWebId, { method: 'POST', gateToken, cookie, body: { webId } });
    if (link.status >= 400) throw new Error(`link WebID after challenge failed (HTTP ${link.status}): ${link.json?.message || ''}`);
  } finally {
    fs.writeFileSync(profile, original);   // restore — drop the transient triple
  }
  return { status: 'linked' };
}

module.exports = { seedOwnerAccount, OWNER_EMAIL, OWNER_PASSWORD };
