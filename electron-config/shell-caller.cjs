// shell-caller — is an IPC call coming from dk's own shell document?
//
// The app view's preload runs in the main frame only (no
// nodeIntegrationInSubFrames), so embedded content — SolidOS, dokieli,
// includes, previews — never sees the bridge. The one way another document
// could reach it is by replacing the shell through a same-origin top-level
// navigation. Nothing in dk does that today; this keeps it true.

// The shell is served at / and /index.html (router/index.cjs stamps the CSP
// on exactly those two).
const SHELL_PATHS = new Set(['/', '/index.html']);

function isShellUrl(url, appOrigin) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!appOrigin || u.origin !== appOrigin) return false;
  return SHELL_PATHS.has(u.pathname);
}

/**
 * @param {object} event  an ipcMain event
 * @param {string} appOrigin  the app's own origin
 */
function isShellCaller(event, appOrigin) {
  const frame = event && event.senderFrame;
  if (!frame) return false;
  // A sub-frame is never the shell, even at a shell URL.
  const main = event.sender && event.sender.mainFrame;
  if (main && frame !== main) return false;
  return isShellUrl(frame.url, appOrigin);
}

module.exports = { isShellCaller, isShellUrl, SHELL_PATHS };
