// Central constants for the data-kitchen desktop shell.
//
// The web app lives at this repo's root and is served by a local Community
// Solid Server ("pivot") rooted at the repo, plus a CORS proxy. The renderer
// loads the app over HTTP (not file://) so the origin is real — same-origin
// checks, Solid auth and the importmap all depend on it.

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

const CSS_PORT   = 3000;
const PROXY_PORT = 3002;

module.exports = {
  REPO_ROOT,
  CSS_PORT,
  PROXY_PORT,
  CSS_ORIGIN:   `http://localhost:${CSS_PORT}`,
  PROXY_ORIGIN: `http://localhost:${PROXY_PORT}`,

  // What the app view loads.
  APP_URL: `http://localhost:${CSS_PORT}/index.html`,

  // Folder the CSS server serves as its root: the repo itself, whose root is
  // the web app (index.html). Override in dev with DK_POD_ROOT. If something
  // already answers on :3000 the lifecycle reuses it instead of spawning (see
  // servers.cjs). (Only ever passed to the spawned server as a string — the
  // shell never reads inside it.)
  POD_ROOT: process.env.DK_POD_ROOT || REPO_ROOT,

  // The element in the web app that hosts swapped-in content. External content
  // (menu iframes, search/feed readers) is overlaid with native views here
  // instead of being iframed.
  CONTENT_SELECTOR: '#dk-content',
};
