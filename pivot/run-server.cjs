// Starts the bundled pivot server from the pre-compiled config
// (dist/create-app.cjs — see compile-config.cjs for why it's pre-compiled).
// No componentsjs scanning happens at startup; this is plain instantiation.
//
//   node run-server.cjs [rootFilePath] [port]
//
// rootFilePath defaults to the repo root (one level up), port to 8000.
//
// When dk fronts CSS with the routing server, CSS listens on an internal port
// but must still advertise the PUBLIC origin in the URLs it generates (Location,
// container listings, LDP Link headers). Set DK_CSS_BASEURL to that public
// origin in that case; otherwise it derives from the listen port as before.

const path = require('path');
const net = require('node:net');
const { makeGate } = require('../electron-config/gate.cjs');

// Token gate (see gate.cjs). Set when spawned by the app; absent in standalone
// dev runs, where makeGate becomes a no-op and the server stays open.
const gate = makeGate(process.env.DK_GATE_TOKEN);

// Every request/upgrade must pass the gate before CSS sees it. CSS offers no
// hook for this, so wrap the server's emit — that catches listeners no matter
// when CSS attaches them.
function gateServer(server) {
  const origEmit = server.emit;
  server.emit = function (type, ...args) {
    if (type === 'request' && gate(args[0], args[1])) return true;
    if (type === 'upgrade' && !gate.upgradeOk(args[0])) { args[1].destroy(); return true; }
    return origEmit.call(this, type, ...args);
  };
}

// Loopback only. CSS 7.x calls server.listen(port) with no host argument and has
// no config variable for one, so it would bind every interface. This process runs
// nothing but the CSS server, so pin every numeric listen() here to 127.0.0.1.
const origListen = net.Server.prototype.listen;
net.Server.prototype.listen = function (port, ...rest) {
  if (typeof port === 'number') {
    gateServer(this);
    return origListen.call(this, port, '127.0.0.1', ...rest);
  }
  return origListen.call(this, port, ...rest);
};

const createApp = require('./dist/create-app.cjs');

const rootFilePath = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const port = Number(process.argv[3] || 8000);
const baseUrl = process.env.DK_CSS_BASEURL || `http://localhost:${port}/`;

const VAR = 'urn:solid-server:default:variable:';

async function main() {
  const app = createApp({
    [`${VAR}baseUrl`]: baseUrl,
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
  console.log(`pivot server listening on http://localhost:${port}/ (baseUrl ${baseUrl}) serving ${rootFilePath}`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
