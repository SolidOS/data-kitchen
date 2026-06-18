// E2E runner — drives the REAL shell and asserts the RDF-first UI actually
// paints. This needs a live environment (the pod served by pivot), so it is a
// SEPARATE script from `npm test`, run with `npm run test:e2e`.
//
// Two modes, auto-detected:
//   • If an Electron dk app is already exposing CDP on :9222
//     (electron . --remote-debugging-port=9222), the CDP harnesses run against
//     it (no servers started here).
//   • Otherwise pivot (:3000) + proxy (:3002) are booted from the repo and the
//     headless-browser harnesses run against them.
//
// The harnesses themselves live in claude/smoke-tests/ (already exit-code
// driven). This runner just provisions, sequences, and aggregates them.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SMOKE = join(root, 'claude', 'smoke-tests');

// harness file → the servers it expects (started here if not already up).
const CDP_HARNESSES = ['verify-settings.mjs'];
const SERVER_HARNESSES = ['verify-unified-shell.mjs'];

function run(file) {
  return new Promise((resolve) => {
    console.log(`\n──▶ ${file}`);
    const p = spawn(process.execPath, [join(SMOKE, file)], { cwd: root, stdio: 'inherit' });
    p.on('exit', (code) => resolve({ file, ok: code === 0 }));
  });
}

function startServer(args, env = {}) {
  const p = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {});
  p.stderr.on('data', () => {});
  return p;
}

async function reachable(url) {
  try { await fetch(url); return true; } catch { return false; }
}
async function waitUntil(url, tries = 120, delay = 250) {
  for (let i = 0; i < tries; i++) { if (await reachable(url)) return true; await new Promise((r) => setTimeout(r, delay)); }
  return false;
}

const cdpUp = await reachable('http://localhost:9222/json');
const servers = [];
let harnesses;

if (cdpUp) {
  console.log('• detected a running dk app on CDP :9222 — using CDP harnesses');
  harnesses = CDP_HARNESSES;
} else {
  console.log('• no CDP app; booting pivot (:3000) + proxy (:3002)');
  servers.push(startServer(['pivot/run-server.cjs', '.', '3000']));
  servers.push(startServer(['proxy/index.cjs'], { DK_PROXY_PORT: '3002', DK_PUBLIC_PORT: '3000' }));
  if (!(await waitUntil('http://localhost:3000/index.html'))) {
    console.error('✖ pivot did not come up on :3000 — is the pod seeded? (see skills.md)');
    servers.forEach((s) => s.kill('SIGKILL'));
    process.exit(2);
  }
  harnesses = SERVER_HARNESSES;
}

const results = [];
for (const h of harnesses) results.push(await run(h));
servers.forEach((s) => s.kill('SIGKILL'));

console.log('\n=== e2e summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file}`);
const failed = results.filter((r) => !r.ok).length;
process.exit(failed ? 1 : 0);
