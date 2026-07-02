// Bundled-server lifecycle, started with the app and killed on quit:
//   - router  (:8000, PUBLIC_PORT)  — single-origin front; engine static + pod proxy
//   - pivot   (:8010, CSS_INTERNAL_PORT) — no-auth CSS, the pod root, behind router
//   - proxy   (:8001, PROXY_PORT)   — CORS proxy
// Ports override via DK_PUBLIC_PORT / DK_CSS_INTERNAL_PORT / DK_PROXY_PORT.
//
// Each server is only spawned if its port is not already answering — otherwise
// we reuse what's there (and leave it running on quit, since we didn't start it).

const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { app } = require('electron');
const {
  REPO_ROOT, PUBLIC_PORT, CSS_INTERNAL_PORT, PROXY_PORT,
  PUBLIC_ORIGIN, ENGINE_DIR, POD_ROOT,
} = require('./config.cjs');
const { seedDefinition, seedMediaPlugins } = require('./seed.cjs');
const { seedPodTemplate, seedRootOwnerMeta } = require('./pod-template.cjs');
const { seedOwnerAccount } = require('./seed-account.cjs');

// Per-install gate secret (see gate.cjs). Created on first launch, kept in
// userData — outside any pod root — and handed to the spawned servers via env.
let gateToken = null;
function getGateToken() {
  if (gateToken) return gateToken;
  const file = path.join(app.getPath('userData'), 'gate-token');
  try { gateToken = fs.readFileSync(file, 'utf8').trim(); } catch (_) {}
  if (!gateToken) {
    gateToken = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, gateToken + '\n', { mode: 0o600 });
  }
  return gateToken;
}

function portAnswers(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: 'localhost', port, path: '/', timeout: 1200 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function waitForPort(port, { tries = 90, interval = 1000 } = {}) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = async () => {
      if (await portAnswers(port)) return resolve();
      if (++n >= tries) return reject(new Error(`port ${port} never came up`));
      setTimeout(tick, interval);
    };
    tick();
  });
}

class Servers {
  constructor({ log = console.log } = {}) {
    this.log = log;
    this.children = [];   // only the ones WE spawned (so we only kill those)
  }

  _spawn(label, command, args, opts) {
    this.log(`[${label}] spawn: ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    child.stdout.on('data', (d) => this.log(`[${label}] ${String(d).trimEnd()}`));
    child.stderr.on('data', (d) => this.log(`[${label}] ${String(d).trimEnd()}`));
    child.on('error', (e) => this.log(`[${label}] error: ${e.message}`));
    child.on('close', (code) => this.log(`[${label}] exited (${code})`));
    this.children.push(child);
    return child;
  }

  async ensureProxy() {
    if (await portAnswers(PROXY_PORT)) { this.log(`[proxy] already up on :${PROXY_PORT}`); return; }
    // process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE makes it
    // behave as plain node so the proxy script runs without a second runtime.
    this._spawn('proxy', process.execPath, [path.join(REPO_ROOT, 'proxy', 'index.cjs')], {
      cwd: path.join(REPO_ROOT, 'proxy'),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DK_GATE_TOKEN: getGateToken() },
    });
    await waitForPort(PROXY_PORT, { tries: 30 });
  }

  async ensureCss() {
    if (await portAnswers(CSS_INTERNAL_PORT)) { this.log(`[css] already up on :${CSS_INTERNAL_PORT} — reusing`); return; }
    // The server runs out of pivot/ — its own dependency tree, the cwd that
    // customise-me.json's ./node_modules/mashlib paths resolve against, and a
    // PRE-COMPILED config (pivot/dist/create-app.cjs) so startup does no
    // componentsjs module scanning (see pivot/compile-config.cjs for why).
    // It listens on the INTERNAL port but advertises the PUBLIC origin (the
    // router fronts it), so Location/LDP URLs it generates point at the router.
    // process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE makes it
    // behave as plain node.
    const cwd = path.join(REPO_ROOT, 'pivot');
    this._spawn('css', process.execPath, [
      path.join(cwd, 'run-server.cjs'),
      POD_ROOT,
      String(CSS_INTERNAL_PORT),
    ], { cwd, env: {
      ...process.env, ELECTRON_RUN_AS_NODE: '1',
      DK_GATE_TOKEN: getGateToken(), DK_CSS_BASEURL: `${PUBLIC_ORIGIN}/`,
    } });
    await waitForPort(CSS_INTERNAL_PORT, { tries: 90 });
  }

  async ensureRouter() {
    if (await portAnswers(PUBLIC_PORT)) { this.log(`[router] already up on :${PUBLIC_PORT} — reusing`); return; }
    this._spawn('router', process.execPath, [path.join(REPO_ROOT, 'router', 'index.cjs')], {
      cwd: path.join(REPO_ROOT, 'router'),
      env: {
        ...process.env, ELECTRON_RUN_AS_NODE: '1', DK_GATE_TOKEN: getGateToken(),
        DK_PUBLIC_PORT: String(PUBLIC_PORT),
        DK_CSS_INTERNAL_PORT: String(CSS_INTERNAL_PORT),
        DK_ENGINE_DIR: ENGINE_DIR,
      },
    });
    await waitForPort(PUBLIC_PORT, { tries: 30 });
  }

  // Seed the editable app definition into the pod root if it lives somewhere
  // other than the engine dir and is missing files (never overwrites edits).
  seed() {
    // App definition → index.html + dk.manifest.json at root, the rest under
    // dk-pod/dk/. Runs in dev too (dest differs from the engine source).
    try {
      const baselineFile = path.join(app.getPath('userData'), 'seed-baseline.json');
      const { written, updated, kept } = seedDefinition(ENGINE_DIR, POD_ROOT, baselineFile);
      this.log(`[seed] ${written} new, ${updated} updated, ${kept} kept (user-edited) — ${POD_ROOT}`);
      // Media plugins (ia-player / omp-images) ship in the open-media-player
      // package; seed their pod content from there (same destinations as when
      // they lived in plugins/ — see seed.cjs).
      const ompDir = path.join(ENGINE_DIR, 'node_modules', 'open-media-player');
      const m = seedMediaPlugins(ompDir, POD_ROOT, baselineFile);
      this.log(`[seed omp] ${m.written} new, ${m.updated} updated, ${m.kept} kept (user-edited)`);
    } catch (e) {
      this.log(`[seed] failed: ${e.message}`);
    }
    // Personal pod: always seeded into <podRoot>/dk-pod/ — the template lives in
    // a distinct engine dir (pod-template/), so this runs in dev too (that's how
    // the owner WebID + storage exist for podz to discover).
    try {
      const baselineFile = path.join(app.getPath('userData'), 'pod-seed-baseline.json');
      const { written, updated, kept } = seedPodTemplate(
        path.join(ENGINE_DIR, 'pod-template'), POD_ROOT, PUBLIC_ORIGIN, baselineFile);
      // Announce the owner at the root so podz/SolidOS can discover the pod.
      const ownerMeta = seedRootOwnerMeta(POD_ROOT, PUBLIC_ORIGIN);
      this.log(`[seed:pod] ${written} new, ${updated} updated, ${kept} kept; owner-meta ${ownerMeta} — ${POD_ROOT}/dk-pod`);
    } catch (e) {
      this.log(`[seed:pod] failed: ${e.message}`);
    }
  }

  // The router is what the app loads from, so it's the hard dependency we wait
  // on (and CSS behind it). The proxy is only needed for CORS-restricted fetches,
  // so it's best-effort and must not delay opening the window.
  async start() {
    this.seed();
    this.ensureProxy().catch((e) => this.log(`[proxy] not started: ${e.message}`));
    try {
      await this.ensureCss();
      await this.ensureRouter();
      this.seedAccount();   // best-effort, fire-and-forget once CSS + router are up
    } catch (e) {
      this.log(`[startup] problem: ${e.message}`);
    }
    this.log('servers ready (or reusing existing)');
  }

  // Provision the local owner account (owner@localhost.invalid / "!secret")
  // linked to the pod owner WebID, so THIRD-PARTY Solid apps can complete their
  // own OIDC login against this server and act as the owner. The gate stays the
  // real access control; "!secret" just lets the standard login form complete.
  // Best-effort + idempotent (userData flag) — never blocks startup.
  seedAccount() {
    seedOwnerAccount({ publicOrigin: PUBLIC_ORIGIN, gateToken: getGateToken(), podRoot: POD_ROOT })
      .then((r) => this.log(`[seed:account] ${r.status}`))
      .catch((e) => this.log(`[seed:account] failed: ${e.message}`));
  }

  stop() {
    for (const child of this.children) {
      try { child.kill('SIGTERM'); } catch (_) {}
    }
    this.children = [];
  }
}

module.exports = { Servers, portAnswers, getGateToken };
