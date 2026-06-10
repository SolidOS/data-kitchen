// Bundled-server lifecycle: a no-auth Community Solid Server ("pivot") on :3000
// and a CORS proxy on :3002, started with the app and killed on quit.
//
// The dev workflow usually already runs CSS on :3000, so each server is only
// spawned if its port is not already answering — otherwise we reuse what's
// there (and leave it running on quit, since we didn't start it).

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { REPO_ROOT, CSS_PORT, PROXY_PORT, POD_ROOT } = require('./config.cjs');

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
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    await waitForPort(PROXY_PORT, { tries: 30 });
  }

  async ensureCss() {
    if (await portAnswers(CSS_PORT)) { this.log(`[css] already up on :${CSS_PORT} — reusing`); return; }
    // The server runs out of pivot/ — its own dependency tree, the cwd that
    // customise-me.json's ./node_modules/mashlib paths resolve against, and a
    // PRE-COMPILED config (pivot/dist/create-app.cjs) so startup does no
    // componentsjs module scanning (see pivot/compile-config.cjs for why).
    // process.execPath is the Electron binary; ELECTRON_RUN_AS_NODE makes it
    // behave as plain node.
    const cwd = path.join(REPO_ROOT, 'pivot');
    this._spawn('css', process.execPath, [
      path.join(cwd, 'run-server.cjs'),
      POD_ROOT,
      String(CSS_PORT),
    ], { cwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    await waitForPort(CSS_PORT, { tries: 90 });
  }

  // CSS serves the app, so it's the hard dependency we wait on. The proxy is
  // only needed for CORS-restricted fetches, so it's best-effort and must not
  // delay opening the window if it's slow or its deps aren't installed yet.
  async start() {
    this.ensureProxy().catch((e) => this.log(`[proxy] not started: ${e.message}`));
    try {
      await this.ensureCss();
    } catch (e) {
      this.log(`[css] not started: ${e.message}`);
    }
    this.log('servers ready (or reusing existing)');
  }

  stop() {
    for (const child of this.children) {
      try { child.kill('SIGTERM'); } catch (_) {}
    }
    this.children = [];
  }
}

module.exports = { Servers, portAnswers };
