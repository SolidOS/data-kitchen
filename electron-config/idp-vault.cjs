// idp-vault.cjs — encrypted, per-issuer store for durable login credentials.
//
// Backs the "remember this IdP" feature: when the user has authenticated to a
// CSS-based issuer, we mint a long-lived client-credential ({id, secret}; see
// idp-grant.cjs) and keep it HERE so a later visit can log in headlessly with no
// popup. The raw account password is NEVER stored — only the revocable
// client-credential is.
//
// At-rest protection: each per-issuer record is encrypted as a whole with
// Electron's safeStorage (OS keychain / credential vault) and the file is written
// 0o600 in userData — outside any pod root — exactly like the gate token
// (servers.cjs). Decryption only ever happens in the main process, on demand;
// plaintext secrets never reach the renderer (the renderer gets a proxied fetch,
// not the token — see src/dk-idp-proxy-session.js).
//
// File: <userData>/idp-credentials.json
//   { "<issuerOrigin>": { "enc": "<base64 of safeStorage.encryptString(JSON)>" } }
// where the encrypted JSON is { clientId, secret, webId, tokenEndpoint }.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

const VAULT_FILE = 'idp-credentials.json';

function vaultPath() {
  return path.join(app.getPath('userData'), VAULT_FILE);
}

// Normalise an issuer to its bare origin key: lowercase scheme+host+port, no
// trailing slash or path. "https://solidcommunity.net/" -> "https://solidcommunity.net".
function issuerKey(issuer) {
  return new URL(issuer).origin;
}

// safeStorage needs the OS keychain to be available; on some headless Linux
// desktops it is not, in which case Tier 2 is simply unavailable (the caller
// falls back to a normal login and the UI says so).
function isAvailable() {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
}

function readAll() {
  try { return JSON.parse(fs.readFileSync(vaultPath(), 'utf8')); } catch { return {}; }
}

function writeAll(obj) {
  const p = vaultPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Encrypt and store the client-credential record for an issuer.
 * @param {string} issuer  issuer URL or origin
 * @param {{clientId:string, secret:string, webId:string, tokenEndpoint:string}} record
 */
function putCredential(issuer, record) {
  if (!isAvailable()) throw new Error('safeStorage unavailable — cannot store credential');
  const enc = safeStorage.encryptString(JSON.stringify(record)).toString('base64');
  const all = readAll();
  all[issuerKey(issuer)] = { enc };
  writeAll(all);
}

/**
 * Decrypt and return the stored record for an issuer, or null if there is none
 * (or it can't be decrypted, e.g. keychain changed / safeStorage unavailable).
 * @returns {{clientId:string, secret:string, webId:string, tokenEndpoint:string}|null}
 */
function getCredential(issuer) {
  if (!isAvailable()) return null;
  const entry = readAll()[issuerKey(issuer)];
  if (!entry || !entry.enc) return null;
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(entry.enc, 'base64')));
  } catch {
    return null;
  }
}

/** Drop an issuer's stored credential (does NOT revoke it server-side — see idp-grant.cjs). */
function forgetCredential(issuer) {
  const all = readAll();
  const key = issuerKey(issuer);
  if (!(key in all)) return false;
  delete all[key];
  writeAll(all);
  return true;
}

/** The issuer origins that currently have a stored credential (no secrets). */
function listIssuers() {
  return Object.keys(readAll());
}

module.exports = { isAvailable, issuerKey, putCredential, getCredential, forgetCredential, listIssuers };
