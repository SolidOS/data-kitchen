// Publish sol-components' ESM inrupt auth build onto a window global.
//
// sol-login reads the Inrupt auth library from window.solidClientAuthn. sc ships
// it only as an ESM build (which sets no global), so this module imports that
// build and assigns the global — no separately-vendored UMD bundle to drift. The
// global is consumed lazily (at session creation, AuthManager._makeSession), so
// this module runs well before it's needed.
//
// Externalized from an inline <script type="module"> in index.html so the page
// can carry a strict Content-Security-Policy (script-src 'self', no
// 'unsafe-inline'). Served from src/ (engine), so it loads as a 'self' script.
import * as inrupt from '/node_modules/sol-components/dist/vendor/@inrupt-solid-client-authn-browser.js';
if (!window.solidClientAuthn) window.solidClientAuthn = inrupt;
