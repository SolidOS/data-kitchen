'use strict';

// Allow-list for the dkfile: protocol. dkfile: streams a local file to the
// (http-origin) app view so the player can play in-place audio — but on its own it
// would serve ANY absolute path that isFile(), and a track's mo:item file:// URL is
// attacker-influenceable (imported/remote RDF). So a pod doc with
// mo:item file:///etc/passwd could read any local file as "audio".
//
// Fix: dkfile: only serves files UNDER a directory the user explicitly imported
// ("Import music" folder picks). Roots are persisted in userData so playback keeps
// working across restarts.

const fs = require('node:fs');
const path = require('node:path');

const FILE = 'dkfile-roots.json';

// Resolve symlinks + `..` so a link inside an allowed root can't point outside it.
function real(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(String(p || '')); }
}

// Is filePath inside root? (both realpath-resolved).
function pathUnderRoot(filePath, root) {
  if (!filePath || !root) return false;
  const f = real(filePath);
  const r = real(root);
  return f === r || f.startsWith(r + path.sep);
}

class LibraryRoots {
  constructor(userDataDir) {
    this._file = userDataDir ? path.join(userDataDir, FILE) : null;
    this._roots = [];
    if (this._file) {
      try {
        const j = JSON.parse(fs.readFileSync(this._file, 'utf8'));
        if (Array.isArray(j)) this._roots = j.filter((x) => typeof x === 'string');
      } catch { /* absent/unreadable → empty */ }
    }
  }

  add(root) {
    if (typeof root !== 'string' || !root) return;
    const norm = path.resolve(root);
    if (this._roots.includes(norm)) return;
    this._roots.push(norm);
    if (this._file) {
      try {
        fs.mkdirSync(path.dirname(this._file), { recursive: true });
        fs.writeFileSync(this._file, JSON.stringify(this._roots));
      } catch { /* best-effort persistence */ }
    }
  }

  isAllowed(filePath) {
    return this._roots.some((r) => pathUnderRoot(filePath, r));
  }

  get roots() { return this._roots.slice(); }
}

module.exports = { LibraryRoots, pathUnderRoot };
