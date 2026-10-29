// Apple Silicon notice for the Intel (x64) mac build.
//
// On an Apple Silicon Mac the x64 app runs under Rosetta, where the bundled
// server can be too slow to start (2.4.0 on GitHub's Apple Silicon runner: the
// server's 6 s startup lock expired). Older update checks only know the x64 zip,
// so an Apple Silicon Mac updating from one of them lands here. Before any
// server starts, say so and offer the releases page, which carries the
// -mac-arm64 zip. "Continue" keeps going; "Don't show this again" is kept as a
// marker file in userData.
//
// Env gate: DK_ROSETTA_NOTICE=0 skips it (the packaged smoke boot).
const { app, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const RELEASES_URL = 'https://github.com/SolidOS/data-kitchen/releases/latest';
const DISMISSED = 'rosetta-notice-dismissed';

// True for an x64 build running translated on Apple Silicon.
function needsRosettaNotice({ platform, arch, translated }) {
  return platform === 'darwin' && arch === 'x64' && !!translated;
}

// Shows the notice when it applies. Resolves true when the user went to get the
// Apple Silicon version (the app is quitting), false otherwise.
async function rosettaNotice() {
  if (process.env.DK_ROSETTA_NOTICE === '0') return false;
  if (!needsRosettaNotice({
    platform: process.platform, arch: process.arch, translated: app.runningUnderARM64Translation,
  })) return false;
  const marker = path.join(app.getPath('userData'), DISMISSED);
  if (fs.existsSync(marker)) return false;

  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: 'warning',
    title: 'Apple Silicon Mac',
    message: 'This copy of Data Kitchen is for Intel Macs.',
    detail: 'Your Mac has an Apple Silicon chip. This copy runs on it only through '
      + 'Apple\'s Rosetta translation, which is much slower and can stop the app '
      + 'from starting. The Apple Silicon version runs at full speed: download the '
      + 'file ending in -mac-arm64.zip from the releases page, then replace this '
      + 'copy with it. Your pod and settings are kept.',
    buttons: ['Get the Apple Silicon version', 'Continue with this copy'],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: 'Don\'t show this again',
  });
  if (response === 0) {
    await shell.openExternal(RELEASES_URL);
    app.quit();
    return true;
  }
  if (checkboxChecked) {
    try { fs.writeFileSync(marker, new Date().toISOString() + '\n'); } catch { /* shows again next launch */ }
  }
  return false;
}

module.exports = {
  rosettaNotice,
  // exported for unit tests
  needsRosettaNotice,
};
