'use strict';

// Minimal, dependency-free gunzip + tar extractor.
//
// The CSS dependency tree is ~19.5k files; shipping them as individual APK
// assets makes builds crawl and the on-device copy slow/fragile. Instead we
// ship one node_modules.tar.gz asset and extract it here on first run.
//
// Handles what GNU `tar czf` produces: regular files ('0'/NUL), directories
// ('5'), GNU long names ('L' / "././@LongLink"), and the ustar name+prefix
// split. Other entry types (symlinks etc.) are skipped — the pure-JS npm tree
// has none.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function extractTarGz(tgzPath, destDir) {
  const raw = fs.readFileSync(tgzPath);
  // Auto-detect gzip (magic 1f 8b). The Android asset pipeline may decompress a
  // `.gz` asset, so the file on disk could be either gzipped or a raw tar.
  const buf = (raw[0] === 0x1f && raw[1] === 0x8b) ? zlib.gunzipSync(raw) : raw;

  const readStr = (start, len) => {
    let end = start;
    const max = start + len;
    while (end < max && buf[end] !== 0) end++;
    return buf.toString('utf8', start, end);
  };

  let offset = 0;
  let longName = null;
  let count = 0;

  while (offset + 512 <= buf.length) {
    // Two consecutive zero blocks mark the end; a single zero block header is
    // enough to stop.
    if (buf[offset] === 0) break;

    const name = readStr(offset, 100);
    const size = parseInt(readStr(offset + 124, 12).trim(), 8) || 0;
    const typeByte = buf[offset + 156];
    const typeflag = typeByte === 0 ? '0' : String.fromCharCode(typeByte);
    const prefix = readStr(offset + 345, 155);

    const dataStart = offset + 512;
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (typeflag === 'L') {
      // GNU long name: the data is the real path for the NEXT entry.
      longName = buf.toString('utf8', dataStart, dataStart + size).replace(/\0+$/, '');
      continue;
    }

    const fullName = longName || (prefix ? prefix + '/' + name : name);
    longName = null;
    if (!fullName) continue;

    const outPath = path.join(destDir, fullName);
    if (typeflag === '5') {
      fs.mkdirSync(outPath, { recursive: true });
    } else if (typeflag === '0') {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buf.subarray(dataStart, dataStart + size));
      count++;
    }
    // else: skip symlinks/hardlinks/devices (none in this tree)
  }
  return count;
}

module.exports = { extractTarGz };
