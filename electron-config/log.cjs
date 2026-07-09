'use strict';

// Mirror console output to a file. A packaged app — above all the Windows
// zip — has no terminal, so everything main logs (server spawn lines, seed
// results, load failures) vanishes exactly when a user needs it to diagnose
// a blank window. initFileLog() hooks console.log/warn/error to also append
// timestamped lines to <userData>/dk.log; the previous run is kept once as
// dk.log.old. Logging must never break the app: every write is best-effort.

const fs = require('fs');
const path = require('path');
const util = require('util');

let logPath = null;
let stream = null;

function initFileLog(dir) {
  if (logPath) return logPath;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'dk.log');
    try { fs.renameSync(file, path.join(dir, 'dk.log.old')); } catch (_) { /* first run */ }
    stream = fs.createWriteStream(file, { flags: 'a' });
    stream.on('error', () => { /* disk full / perms — keep console-only */ });
    for (const level of ['log', 'warn', 'error']) {
      const orig = console[level].bind(console);
      console[level] = (...args) => {
        orig(...args);
        try {
          const line = args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ');
          stream.write(`${new Date().toISOString()} ${line}\n`);
        } catch (_) { /* never let logging throw into callers */ }
      };
    }
    logPath = file;
  } catch (_) { logPath = null; }
  return logPath;
}

function getLogPath() { return logPath; }

module.exports = { initFileLog, getLogPath };
