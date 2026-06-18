// Spawn one of dk's bundled Node servers (router/proxy) as a child process for
// integration testing, and wait until it answers. No mocks — the real server
// code, the real gate, over a real socket on an ephemeral port.

import { spawn } from 'node:child_process';
import net from 'node:net';

/** An OS-assigned free TCP port. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Spawn `node <scriptPath>` with extra env. Returns the child process. */
export function startServer(scriptPath, env = {}) {
  const proc = spawn(process.execPath, [scriptPath], {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', () => {});   // drain so the pipe never blocks the child
  proc.stderr.on('data', () => {});
  return proc;
}

/** Poll `url` until any HTTP response comes back (server is listening). */
export async function waitForServer(url, { headers = {}, tries = 100, delay = 50 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url, { headers });
      return;                          // any status means the socket is up
    } catch {
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error(`server never came up: ${url}`);
}

/** Kill a child and wait for it to exit. */
export function stopServer(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null || proc.signalCode) return resolve();
    proc.once('exit', resolve);
    proc.kill('SIGKILL');
  });
}
