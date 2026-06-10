// Starts the bundled pivot server from the pre-compiled config
// (dist/create-app.cjs — see compile-config.cjs for why it's pre-compiled).
// No componentsjs scanning happens at startup; this is plain instantiation.
//
//   node run-server.cjs [rootFilePath] [port]
//
// rootFilePath defaults to the repo root (one level up), port to 3000.

const path = require('path');
const createApp = require('./dist/create-app.cjs');

const rootFilePath = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const port = Number(process.argv[3] || 3000);

const VAR = 'urn:solid-server:default:variable:';

async function main() {
  const app = createApp({
    [`${VAR}baseUrl`]: `http://localhost:${port}/`,
    [`${VAR}port`]: port,
    [`${VAR}rootFilePath`]: rootFilePath,
    [`${VAR}loggingLevel`]: 'info',
    [`${VAR}showStackTrace`]: false,
    [`${VAR}confirmMigration`]: false,
    [`${VAR}seedConfig`]: undefined,
    [`${VAR}socket`]: undefined,
    [`${VAR}workers`]: 1,
  });
  await app.start();
  console.log(`pivot server listening on http://localhost:${port}/ serving ${rootFilePath}`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
