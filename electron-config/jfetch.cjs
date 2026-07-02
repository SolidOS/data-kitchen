'use strict';

// JSON fetch helper for the CSS account API, shared by seed-account.cjs (owner
// account provisioning) and idp-grant.cjs (the durable client-credentials grant).
// Returns { status, json } with json null on a non-JSON body.
async function jfetch(url, { method = 'GET', body, gateToken, cookie } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (gateToken) headers['x-dk-token'] = gateToken;
  if (cookie) headers.cookie = cookie;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

module.exports = { jfetch };
