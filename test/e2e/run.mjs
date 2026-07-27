// E2E runner — drives the REAL shell and asserts the RDF-first UI actually
// paints. This needs a live environment (the pod served by pivot), so it is a
// SEPARATE script from `npm test`, run with `npm run test:e2e`.
//
// Two modes, auto-detected:
//   • If an Electron dk app is already exposing CDP on :9222
//     (electron . --remote-debugging-port=9222), the CDP harnesses run against
//     it (no servers started here).
//   • Otherwise the BASE VARIANT is assembled to a temp dir (the exact seeded
//     tree a release ships — not the working repo, whose dk-pod/ is the
//     owner's personal pod) and pivot serves it on :3050. The port is not
//     :3000 — that is the machine's standing pod server, which serves ~/solid
//     and must never be reused (or killed) for tests.
//
// The server-mode harness lives beside this runner (tracked); the CDP
// harnesses live in claude/smoke-tests/ (local-only). This runner just
// provisions, sequences, and aggregates them.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const SMOKE = join(root, 'claude', 'smoke-tests');
const E2E_PORT = process.env.DK_E2E_PORT || '3050';

// harness file → the servers it expects (started here if not already up).
const CDP_HARNESSES = [join(SMOKE, 'verify-settings.mjs')];
const SERVER_HARNESSES = [join(here, 'verify-unified-shell.mjs')];

function run(file, env = {}) {
  return new Promise((resolve) => {
    console.log(`\n──▶ ${file}`);
    const p = spawn(process.execPath, [file], { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit' });
    p.on('exit', (code) => resolve({ file: file.split('/').pop(), ok: code === 0 }));
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
let assembled = null;
const results = [];

if (cdpUp) {
  console.log('• detected a running dk app on CDP :9222 — using CDP harnesses');
  for (const h of CDP_HARNESSES) results.push(await run(h));
} else {
  console.log(`• no CDP app; assembling the base variant and booting pivot (:${E2E_PORT})`);
  if (await reachable(`http://localhost:${E2E_PORT}/`)) {
    console.error(`✖ :${E2E_PORT} is already in use — set DK_E2E_PORT to a free port`);
    process.exit(2);
  }
  assembled = mkdtempSync(join(tmpdir(), 'dk-e2e-'));
  execFileSync(process.execPath, ['--preserve-symlinks', join(root, 'tools', 'assemble-variant.mjs'), 'base', assembled], { stdio: 'inherit' });
  // The assembled tree is POD content; the shell's own code ships as electron
  // app resources — supply it from the repo so the page can boot.
  for (const d of ['node_modules', 'src', 'dist', 'assets']) symlinkSync(join(root, d), join(assembled, d));
  servers.push(startServer(['pivot/run-server.cjs', assembled, E2E_PORT]));
  if (!(await waitUntil(`http://localhost:${E2E_PORT}/index.html`))) {
    console.error(`✖ pivot did not come up on :${E2E_PORT}`);
    servers.forEach((s) => s.kill('SIGKILL'));
    rmSync(assembled, { recursive: true, force: true });
    process.exit(2);
  }
  for (const h of SERVER_HARNESSES) results.push(await run(h, { DK_E2E_PORT: E2E_PORT }));
}
servers.forEach((s) => s.kill('SIGKILL'));
if (assembled) rmSync(assembled, { recursive: true, force: true });

console.log('\n=== e2e summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.file}`);
const failed = results.filter((r) => !r.ok).length;
process.exit(failed ? 1 : 0);
