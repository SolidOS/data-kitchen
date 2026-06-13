// Seed the personal-pod TEMPLATE into <podRoot>/dk-pod/ — the owner's Solid pod
// (profile/card#me WebID, settings/type-indexes, inbox, public, ACLs).
//
// The template (vendored at <engine>/pod-template/, a curated copy of the
// solidcommunity.net-style new-pod template) ships with placeholder origin
// `http://localhost:3000/data-kitchen-user/`. We rewrite it to the live public
// origin + `/dk-pod/` at copy time, so the WebID becomes
// `<publicOrigin>/dk-pod/profile/card#me` and the OIDC issuer `<publicOrigin>/`.
//
// Reconciliation/idempotency/user-edit handling is shared with the app-definition
// seeder via seed-core. The owner's pod files become USER-owned the moment the
// user (or SolidOS/a form) edits them, so re-seeding never clobbers their data.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { reconcileTree } = require('./seed-core.cjs');

// Junk in the source template we never ship/seed.
const SKIP_DIRS = new Set(['test']);
const isBackup = (name) => name.endsWith('~');

// Text resources whose placeholder origin must be rewritten. Dot-named ACL/meta
// files have no extension, so match them by basename too.
const TEXT_RE = /\.(ttl|acl|meta|markdown|md|txt|json|svg)$/i;
function isText(rel) {
  const base = path.basename(rel);
  return TEXT_RE.test(rel) || base === '.acl' || base === '.meta';
}

// publicOrigin has no trailing slash, e.g. "http://localhost:8000".
function rewriteOrigin(publicOrigin) {
  return (buf, rel) => {
    if (!isText(rel)) return buf;                 // binaries (logo.svg is text-ish but harmless to scan)
    let s = buf.toString('utf8');
    // Longer, more specific replacement first.
    s = s.split('http://localhost:3000/data-kitchen-user/').join(`${publicOrigin}/dk-pod/`);
    // Remaining bare-origin refs (the solid:oidcIssuer value).
    s = s.split('http://localhost:3000/').join(`${publicOrigin}/`);
    return Buffer.from(s, 'utf8');
  };
}

/**
 * Seed/reconcile the pod template into <podRoot>/dk-pod/.
 * @param {string} templateDir  e.g. path.join(ENGINE_DIR, 'pod-template')
 * @param {string} podRoot      CSS root file path (served at publicOrigin/)
 * @param {string} publicOrigin e.g. "http://localhost:8000" (no trailing slash)
 * @param {string} baselineFile JSON baseline path (separate from the app-def baseline)
 */
function seedPodTemplate(templateDir, podRoot, publicOrigin, baselineFile) {
  return reconcileTree(templateDir, path.join(podRoot, 'dk-pod'), {
    skipDirs: SKIP_DIRS,
    skipFile: isBackup,
    transform: rewriteOrigin(publicOrigin),
    baselineFile,
  });
}

// Announce the pod owner at the SERVER ROOT so SolidOS/podz can DISCOVER it.
// podz's discoverOwnerWebIds() (sol-components/core/pod-ops.js) scans the origin
// root's `.meta` (via the GET / `rel="describedby"` Link) for a `solid:owner`
// triple — it does NOT consult the logged-in session. Without this, podz shows
// "no pods found". CSS merges this custom triple with its auto-generated
// containment metadata and preserves it across writes (verified). From the
// owner WebID, getStoragesFromWebIds() reads `space:storage` → /dk-pod/.
function seedRootOwnerMeta(podRoot, publicOrigin) {
  const webId = `${publicOrigin}/dk-pod/profile/card#me`;
  const triple = `<./> solid:owner <${webId}>.`;
  const desired = `@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n${triple}\n`;
  const metaPath = path.join(podRoot, '.meta');
  let current = '';
  try { current = fs.readFileSync(metaPath, 'utf8'); } catch {}
  if (current.includes(`solid:owner <${webId}>`)) return 'kept';
  if (current && !/solid:owner/.test(current)) {        // foreign .meta — append, don't clobber
    // The appended triple uses solid:; declare the prefix unless the existing
    // .meta already does, else the merged file is invalid Turtle and CSS 500s
    // on every write (it parses .meta on writes).
    const pfx = /@prefix\s+solid:/.test(current) ? '' : '@prefix solid: <http://www.w3.org/ns/solid/terms#>.\n';
    fs.writeFileSync(metaPath, pfx + current.replace(/\s*$/, '\n') + triple + '\n');
    return 'appended';
  }
  fs.writeFileSync(metaPath, desired);                  // absent or stale-origin owner → (re)write
  return current ? 'rewritten' : 'written';
}

module.exports = { seedPodTemplate, seedRootOwnerMeta };
