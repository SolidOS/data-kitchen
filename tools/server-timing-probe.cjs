// Starts a packaged app's bundled Solid server on a fresh, empty pod and times
// its startup: every lock it takes, every file lock underneath, every slow
// file read or write, and how long the event loop is ever blocked. Prints the
// lot and exits — 0 when the server came up, 1 when it failed or hung.
//
// Written for the mac-smoke failure of 2026-10-28 (the server quit with
// "Lock expired after 6000ms on …/.internal/setup/v6-migration" on GitHub's
// Mac while starting in under 2 s on Linux). Run it with the app's own binary
// as node, so it times the same runtime users get:
//
//   ELECTRON_RUN_AS_NODE=1 "<app>/Contents/MacOS/Solid Data Kitchen" \
//     tools/server-timing-probe.cjs "<app>/Contents/Resources/app/pivot"
//
// or with any node against a dev tree: node tools/server-timing-probe.cjs pivot
const path = require('path');
const fs = require('fs');
const os = require('os');

const pivot = path.resolve(process.argv[2] || path.join(__dirname, '..', 'pivot'));
const port = Number(process.env.PROBE_PORT || 18555);
const LIMIT_MS = Number(process.env.PROBE_LIMIT_S || 90) * 1000;
const t0 = Date.now();
const at = () => `+${String(Date.now() - t0).padStart(6)} ms`;
const say = (msg) => console.log(`[probe] ${at()} ${msg}`);

say(`runtime: node ${process.version} ${process.arch} on ${process.platform}` +
  (process.versions.electron ? `, electron ${process.versions.electron}` : ''));
say(`pivot: ${pivot}`);

// Event loop: a 50 ms ticker; any tick that arrives late means the loop was busy.
let lastTick = Date.now();
let maxLag = 0;
setInterval(() => {
  const lag = Date.now() - lastTick - 50;
  if (lag > maxLag) maxLag = lag;
  if (lag > 500) say(`event loop blocked ~${lag} ms`);
  lastTick = Date.now();
}, 50).unref();

const css = require(path.join(pivot, 'node_modules', '@solid', 'community-server'));

// Time a prototype's async methods; report calls slower than `slowMs`, and
// failures other than the 404s a fresh pod answers with.
function timeMethods(cls, names, slowMs) {
  for (const name of names) {
    const orig = cls.prototype[name];
    if (typeof orig !== 'function') { say(`(no ${cls.name}.${name} to time)`); continue; }
    cls.prototype[name] = async function (identifier, ...rest) {
      const start = Date.now();
      const what = `${cls.name}.${name} ${identifier?.path ?? ''}`;
      try {
        const out = await orig.call(this, identifier, ...rest);
        const ms = Date.now() - start;
        if (ms >= slowMs) say(`${ms} ms  ${what}`);
        return out;
      } catch (err) {
        const ms = Date.now() - start;
        if (err?.statusCode !== 404 || ms >= slowMs) {
          say(`${ms} ms FAILED  ${what}: ${err?.name ?? ''} ${err?.message ?? err}`);
        }
        throw err;
      }
    };
  }
}
timeMethods(css.WrappedExpiringReadWriteLocker, ['withReadLock', 'withWriteLock'], 250);
timeMethods(css.FileSystemResourceLocker, ['acquire', 'release'], 100);
timeMethods(css.FileDataAccessor, ['getData', 'getMetadata', 'writeDocument', 'writeContainer'], 100);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-probe-'));
say(`pod root: ${root} (realpath ${fs.realpathSync(root)})`);

const VAR = 'urn:solid-server:default:variable:';
const app = require(path.join(pivot, 'dist', 'create-app.cjs'))({
  [`${VAR}baseUrl`]: `http://localhost:${port}/`,
  [`${VAR}port`]: port,
  [`${VAR}rootFilePath`]: root,
  [`${VAR}loggingLevel`]: process.env.PROBE_LOG_LEVEL || 'debug',
  [`${VAR}showStackTrace`]: true,
  [`${VAR}confirmMigration`]: false,
  [`${VAR}seedConfig`]: undefined,
  [`${VAR}socket`]: undefined,
  [`${VAR}workers`]: 1,
});
say('server built from its compiled config');

function finish(code, why) {
  say(`${why}; longest event-loop stall ${maxLag} ms`);
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  process.exit(code);
}
setTimeout(() => finish(1, `still not up after ${LIMIT_MS / 1000} s`), LIMIT_MS).unref();
app.start().then(
  () => finish(0, 'server is up'),
  (err) => { say(`start failed: ${err?.stack ?? err}`); finish(1, 'server failed'); },
);
