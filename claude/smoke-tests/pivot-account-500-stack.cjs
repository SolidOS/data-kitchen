// Diagnostic: reproduce the /.account/ HTML 500 with full stack traces, in
// isolation from the running app. Spins up the bundled pivot config (the SAME
// compiled dist/create-app.cjs the app uses) with showStackTrace:true, no gate,
// rooted at a throwaway temp dir (the /.account/ endpoint is independent of pod
// content), then prints what to curl. Kill with Ctrl-C.
//
//   node claude/smoke-tests/pivot-account-500-stack.cjs [port]
//
// Then in another shell:
//   curl -s -H 'Accept: text/html' http://localhost:8020/.account/ -o /dev/null -w '%{http_code}\n'
// and watch THIS process's stderr for the CSS stack trace.

const path = require('path');
const fs = require('fs');
const os = require('os');

const createApp = require(path.join(__dirname, '..', '..', 'pivot', 'dist', 'create-app.cjs'));

const port = Number(process.argv[2] || 8020);
const rootFilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-pivot-diag-'));
const baseUrl = `http://localhost:${port}/`;
const VAR = 'urn:solid-server:default:variable:';

async function main() {
  const app = createApp({
    [`${VAR}baseUrl`]: baseUrl,
    [`${VAR}port`]: port,
    [`${VAR}rootFilePath`]: rootFilePath,
    [`${VAR}loggingLevel`]: 'debug',
    [`${VAR}showStackTrace`]: true,
    [`${VAR}confirmMigration`]: false,
    [`${VAR}seedConfig`]: undefined,
    [`${VAR}socket`]: undefined,
    [`${VAR}workers`]: 1,
  });
  await app.start();
  console.log(`DIAG pivot listening ${baseUrl} (root ${rootFilePath}) — showStackTrace ON, no gate`);
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
