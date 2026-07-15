'use strict';

// dk single-origin routing front (in-process variant of router/index.cjs).
//
// dk's renderer loads the editable app DEFINITION (index.html + dk-pod/dk/…)
// from the writable pod (CSS) and the read-only ENGINE (sol-components,
// dk's bundle, plugin dist, assets) from a shipped dir, and
// references the engine by plain relative paths — so both must appear under ONE
// origin. This server is that origin (:8000): engine path prefixes are served
// from engineDir; everything else is reverse-proxied to CSS (the pod).
//
// The engine/pod routing primitives are SHARED with the desktop router via
// server-core.cjs (a sibling symlink to the repo-root file, so the flat mobile
// bundle can require it). No gate on mobile (loopback, in-app sandbox). Binds
// 127.0.0.1 via main.js's listen() shim (call listen(port) with no host).

const http = require('node:http');
const { isEnginePath, serveEngine, proxyToCss, forwardUpgrade } = require('./server-core.cjs');

function start(publicPort, cssPort, engineDir, log) {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if ((req.method === 'GET' || req.method === 'HEAD') && isEnginePath(pathname)) {
      return serveEngine(req, res, pathname, engineDir);
    }
    proxyToCss(req, res, cssPort);
  });

  // CSS uses websockets for change notifications; forward upgrades to the pod.
  server.on('upgrade', (req, socket, head) => forwardUpgrade(req, socket, head, cssPort));

  server.listen(publicPort, () =>
    log('router on http://127.0.0.1:' + publicPort + '/ — engine ' + engineDir + ', pod via :' + cssPort));
  return server;
}

module.exports = { start };
