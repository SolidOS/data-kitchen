'use strict';

// In-process bootstrap for the dk pod server on Android (Stage B).
//
// Desktop dk spawns three child Node processes (CSS/pivot, router, proxy).
// nodejs-mobile has no node binary to exec, so on Android we run everything in
// ONE process: this file starts the Community Solid Server (pivot) from the
// pre-compiled config. The CORS proxy + single-origin router are layered on in
// a later step.
//
// node_flutter copies this folder to <filesDir>/nodejs-project. The CSS
// dependency tree ships as node_modules.tar.gz (one asset) and is expanded
// next to this file on first run.

const path = require('path');
const net = require('node:net');
const fs = require('node:fs');
const dns = require('node:dns');
const http = require('node:http');
const https = require('node:https');

function log(m) { console.log('[dk-pod] ' + m); }

// nodejs-mobile can't reach the internet directly (its sockets don't route on
// this multi-network device, and even getaddrinfo('localhost') fails). So:
//   1. OUTBOUND http/https is routed through the Dart loopback forward proxy via
//      global agents (connect-agent.js) — Dart's sockets reach external + resolve
//      DNS. External hostnames are passed to Dart as strings, never resolved here.
//   2. The only DNS we still need is for DIRECT (loopback/private) connections —
//      mainly literal 'localhost'. A minimal lookup shim handles that; IPs pass
//      through. External names never reach this (the agent tunnels by name).
// undici's global fetch stays broken (unused); CSS uses node-fetch/http → routed.
function installNetworkFixes() {
  const lookup = (hostname, options, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    options = options || {};
    const ipv = net.isIP(hostname);
    if (hostname === 'localhost') {
      return process.nextTick(() => callback(null, options.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4));
    }
    if (ipv) {
      return process.nextTick(() => callback(null, options.all ? [{ address: hostname, family: ipv }] : hostname, ipv));
    }
    // Shouldn't happen — external names go through the proxy agent, not here.
    return process.nextTick(() => callback(new Error('ENOTFOUND ' + hostname)));
  };
  dns.lookup = lookup;
  if (dns.promises) {
    dns.promises.lookup = (hostname, options) => new Promise((resolve, reject) => {
      lookup(hostname, options || {}, (err, address, family) =>
        err ? reject(err) : resolve(options && options.all ? address : { address, family }));
    });
  }

  // Route all outbound http/https through the Dart forward proxy.
  try {
    const { httpAgent, httpsAgent } = require('./connect-agent.js');
    http.globalAgent = httpAgent;
    https.globalAgent = httpsAgent;
    log('outbound routed via Dart forward proxy (127.0.0.1:8011)');
  } catch (e) {
    log('connect-agent install failed: ' + (e && e.message || e));
  }
}
installNetworkFixes();
process.on('uncaughtException', (e) => log('uncaughtException: ' + ((e && e.stack) || e)));
process.on('unhandledRejection', (e) => log('unhandledRejection: ' + ((e && e.stack) || e)));

const PROJECT_DIR = __dirname;                              // <filesDir>/nodejs-project
const NODE_MODULES = path.join(PROJECT_DIR, 'node_modules');
// Neutral extension on purpose: the Android asset pipeline decompresses & renames
// a `.gz` asset, which breaks the copy. `.nmz` is marked noCompress in Gradle.
const TARBALL = path.join(PROJECT_DIR, 'node_modules.nmz');
const ENGINE_TARBALL = path.join(PROJECT_DIR, 'engine.nmz');     // dk read-only engine
const POD_SEED_TARBALL = path.join(PROJECT_DIR, 'pod-seed.nmz'); // dk app definition
const POD_ROOT = path.resolve(PROJECT_DIR, '..', 'pod');     // <filesDir>/pod (writable)
const ENGINE_DIR = path.resolve(PROJECT_DIR, '..', 'engine'); // <filesDir>/engine (read-only)

const PUBLIC_PORT = 8000;   // router origin — what the WebView loads (dk + mashlib)
const CSS_PORT = 8010;      // CSS/pivot behind the router
const PROXY_PORT = 8001;
// CSS must advertise the PUBLIC (router) origin in the URLs it generates
// (container listings, Location, WebID) since the app loads from the router.
const PUBLIC_ORIGIN = `http://localhost:${PUBLIC_PORT}/`;

// Expand the bundled tarballs into the writable filesDir. Each extraction's
// sentinel records the SOURCE TARBALL'S BYTE SIZE, and we re-extract whenever the
// current tarball's size differs from the recorded one — that is what makes an
// app update actually take effect:
//   • node_modules lives INSIDE nodejs-project, which node_flutter wipes &
//     re-copies whenever the APK's lastUpdateTime changes (i.e. every reinstall),
//     so its sentinel is already gone after an update and it re-extracts anyway.
//   • the dk ENGINE and POD live OUTSIDE nodejs-project (filesDir/engine,
//     filesDir/pod), which node_flutter never touches — so a bare "done" flag
//     there SURVIVES reinstalls and keeps serving the STALE tree (the bug that
//     used to need a manual `pm clear`). node_flutter does re-copy the .nmz on
//     reinstall, so keying the sentinel on the fresh tarball's size lets a
//     changed bundle re-extract on its own.
// (A pre-existing ISO-timestamp sentinel from the old scheme never equals a size,
// so it harmlessly forces exactly one re-extract on upgrade to this code.)
function tarballSize(tarball) {
  try { return String(fs.statSync(tarball).size); } catch (_) { return ''; }
}
function sentinelFresh(sentinelPath, fingerprint) {
  try { return fs.readFileSync(sentinelPath, 'utf8').trim() === fingerprint; }
  catch (_) { return false; }
}

function ensureNodeModules() {
  if (!fs.existsSync(TARBALL)) { log('FATAL: node_modules.nmz missing'); return; }
  const sentinel = path.join(NODE_MODULES, '.extracted');
  const fp = tarballSize(TARBALL);
  if (sentinelFresh(sentinel, fp)) return;
  log('extracting node_modules (first run or bundle changed)…');
  const t0 = Date.now();
  fs.rmSync(NODE_MODULES, { recursive: true, force: true });
  const { extractTarGz } = require('./untar.cjs');
  const n = extractTarGz(TARBALL, PROJECT_DIR);             // tar contains node_modules/…
  applyPatches();
  fs.writeFileSync(sentinel, fp);
  log(`extracted ${n} files in ${Date.now() - t0}ms`);
}

// Extract a bundled tarball into destDir, re-extracting when the bundle changes
// (sentinel = source tarball size; see ensureNodeModules). clearFirst wipes
// destDir before extracting — set it for the read-only ENGINE so files dropped
// from a newer bundle don't linger, but NOT for the writable POD, which is
// overlaid (the seed updates its own files while CSS's account/data store and
// any user pod content are preserved).
function ensureExtract(tarball, destDir, sentinelName, label, clearFirst) {
  if (!fs.existsSync(tarball)) { log('skip ' + label + ' — ' + path.basename(tarball) + ' missing'); return; }
  const sentinel = path.join(destDir, sentinelName);
  const fp = tarballSize(tarball);
  if (sentinelFresh(sentinel, fp)) return;
  log('extracting ' + label + ' (first run or bundle changed)…');
  const t0 = Date.now();
  if (clearFirst) fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const { extractTarGz } = require('./untar.cjs');
  const n = extractTarGz(tarball, destDir);
  fs.writeFileSync(sentinel, fp);
  log('extracted ' + label + ' (' + n + ' files) in ' + (Date.now() - t0) + 'ms');
}

// Overlay no-ICU compatibility patches onto the extracted tree. Each file in
// patches/ maps to node_modules/<same relative path>. See patches/marked.cjs.
function applyPatches() {
  const PATCHES = { 'marked.cjs': 'marked/lib/marked.cjs' };
  for (const [src, dest] of Object.entries(PATCHES)) {
    const from = path.join(PROJECT_DIR, 'patches', src);
    const to = path.join(NODE_MODULES, dest);
    try {
      if (fs.existsSync(from) && fs.existsSync(path.dirname(to))) {
        fs.copyFileSync(from, to);
        log('patched ' + dest);
      }
    } catch (e) { log('patch failed for ' + dest + ': ' + e.message); }
  }
}

// Loopback only: CSS calls server.listen(port) with no host and has no config
// for one, so pin every numeric listen() to 127.0.0.1 (as desktop run-server).
const origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, ...rest) {
  if (typeof port === 'number') return origListen.call(this, port, '127.0.0.1', ...rest);
  return origListen.call(this, port, ...rest);
};

const VAR = 'urn:solid-server:default:variable:';

async function main() {
  log('Node ' + process.version + ' / ' + process.arch + ' — booting pod server');
  ensureNodeModules();
  fs.mkdirSync(POD_ROOT, { recursive: true });
  // dk read-only engine (sol-components, component-interop, dk bundle, plugin
  // dist, assets) the router serves; and the dk app definition seeded into the
  // pod (index.html + dk-pod/dk/…). Both ship as separate tarballs; absent for a
  // mashlib-only build, in which case the router just fronts CSS.
  ensureExtract(ENGINE_TARBALL, ENGINE_DIR, '.engine-extracted', 'dk engine', true);
  ensureExtract(POD_SEED_TARBALL, POD_ROOT, '.dk-seeded', 'dk pod seed', false);

  // The mashlib-databrowser config (create-app-mobile.cjs) has relative
  // filePaths like ./node_modules/mashlib/dist/databrowser.html — resolved
  // against cwd at runtime. Point cwd at the project dir so they resolve.
  process.chdir(PROJECT_DIR);

  const createApp = require('./dist/create-app.cjs');
  const app = createApp({
    // Advertise the router origin: the app loads from :8000, so CSS-generated
    // URLs (listings, Location, WebID) must be same-origin with it.
    [`${VAR}baseUrl`]: PUBLIC_ORIGIN,
    [`${VAR}port`]: CSS_PORT,
    [`${VAR}rootFilePath`]: POD_ROOT,
    [`${VAR}loggingLevel`]: 'warn',
    [`${VAR}showStackTrace`]: false,
    [`${VAR}confirmMigration`]: false,
    [`${VAR}seedConfig`]: undefined,
    [`${VAR}socket`]: undefined,
    [`${VAR}workers`]: 1,
  });
  await app.start();

  // CORS proxy (loopback).
  try {
    require('./proxy.js').start(PROXY_PORT, log);
  } catch (e) {
    log('proxy failed to start: ' + (e && e.message || e));
  }

  // Single-origin router (:8000) fronting CSS — serves the dk engine from
  // ENGINE_DIR and proxies everything else to the pod. This is the origin the
  // WebView loads (dk at /index.html, mashlib databrowser at /).
  try {
    require('./router.js').start(PUBLIC_PORT, CSS_PORT, ENGINE_DIR, log);
  } catch (e) {
    log('router failed to start: ' + (e && e.message || e));
  }

  log('READY router on ' + PUBLIC_ORIGIN + ' (CSS :' + CSS_PORT + ', engine ' + ENGINE_DIR + ') node=' + process.version);
}

main().catch((e) => log('FATAL ' + (e && e.stack || e)));
