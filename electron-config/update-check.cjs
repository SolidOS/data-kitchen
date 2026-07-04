// Startup update check against GitHub Releases (SolidOS/data-kitchen).
//
// Called fire-and-forget from main.cjs start(). Packaged builds only; any
// network/parse failure is a silent skip — the check must never get in the
// user's way. When a newer release exists the user is asked first, with the
// assurance (true — see config.cjs pod-root resolution) that updating touches
// only the app binary, never their pod/settings/logins:
//   - Linux AppImage: full auto — download beside the current AppImage,
//     verify sha512 (release's latest.json, when present), atomic rename over
//     the original (in place, so the beside-exe data-kitchen-home pod keeps
//     its association), offer restart.
//   - mac / win (unsigned zips can't safely self-replace a running app):
//     download to Downloads, verify, reveal in the file manager with a short
//     "quit and replace" instruction.
//
// Env gates: DK_UPDATE_CHECK=0 disables; DK_UPDATE_FORCE=1 enables in dev;
// DK_UPDATE_REPO overrides the source — either "owner/repo" or a full
// http(s) base URL whose /releases/latest returns the GitHub JSON shape
// (used by the mock-server test).
const { app, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const DEFAULT_REPO = 'SolidOS/data-kitchen';
const TIMEOUT_MS = 10_000;

// "v2.0.1" / "2.0" → [2,0,1] / [2,0]. Requires at least TWO dotted parts:
// the repo's legacy junk tags ("v.04" → bare "04") would otherwise parse as
// [4] and look NEWER than 2.x, offering a bogus downgrade. Null when no
// dotted version is found.
function parseVersion(tag) {
  const m = String(tag || '').match(/(\d+(?:\.\d+)+)/);
  if (!m) return null;
  return m[1].split('.').map(Number);
}

// Numeric per-part compare; missing parts count as 0. >0 → a newer than b.
function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d;
  }
  return 0;
}

// The release asset for this platform, by the Solid_Data_Kitchen-<ver>-<platform>
// naming convention. Returns the asset object or null.
function pickAsset(assets, platform = process.platform) {
  const suffix = {
    linux: '-linux.AppImage',
    darwin: '-mac-x64.zip',
    win32: '-win-x64.zip',
  }[platform];
  if (!suffix) return null;
  return (assets || []).find((a) => a && a.name && a.name.endsWith(suffix)) || null;
}

function releasesLatestUrl(repo) {
  return /^https?:\/\//.test(repo)
    ? repo.replace(/\/$/, '') + '/releases/latest'
    : `https://api.github.com/repos/${repo}/releases/latest`;
}

async function fetchJson(url, ua) {
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': ua },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

// Stream a (possibly redirected) asset to disk, reporting progress 0..1.
async function downloadTo(url, dest, ua, onProgress) {
  const r = await fetch(url, { headers: { 'user-agent': ua } });
  if (!r.ok || !r.body) throw new Error(`download ${url} → ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  let got = 0;
  const src = Readable.fromWeb(r.body);
  src.on('data', (c) => {
    got += c.length;
    if (total && onProgress) onProgress(got / total);
  });
  await pipeline(src, fs.createWriteStream(dest));
}

async function sha512Hex(file) {
  const h = crypto.createHash('sha512');
  await pipeline(fs.createReadStream(file), h);
  return h.digest('hex');
}

// The expected sha512 (hex) for this platform from the release's latest.json
// asset — null when the release doesn't carry one (older releases).
async function expectedSha512(release, platform, ua) {
  const manifest = (release.assets || []).find((a) => a.name === 'latest.json');
  if (!manifest) return null;
  try {
    const m = await fetchJson(manifest.browser_download_url, ua);
    const key = { linux: 'linux', darwin: 'mac', win32: 'win' }[platform];
    return m?.files?.[key]?.sha512 || null;
  } catch {
    return null;
  }
}

async function checkForUpdates(baseWindow) {
  if (process.env.DK_UPDATE_CHECK === '0') return;
  if (!app.isPackaged && process.env.DK_UPDATE_FORCE !== '1') return;

  const ua = `data-kitchen/${app.getVersion()}`;
  const repo = process.env.DK_UPDATE_REPO || DEFAULT_REPO;

  let release;
  try {
    release = await fetchJson(releasesLatestUrl(repo), ua);
  } catch (e) {
    console.warn('[update] check skipped:', e.message);   // offline / rate-limited / 404
    return;
  }
  const latest = parseVersion(release.tag_name);
  const current = parseVersion(app.getVersion());
  if (!latest || !current || compareVersions(latest, current) <= 0) return;

  const asset = pickAsset(release.assets);
  if (!asset) return;   // no artifact for this platform in that release
  const latestStr = latest.join('.');

  const { response } = await dialog.showMessageBox(baseWindow, {
    type: 'info',
    title: 'Update available',
    message: `Data Kitchen ${latestStr} is available (you have ${app.getVersion()}).`,
    detail: 'Updating replaces only the app itself — your pod, settings and '
      + 'logins live outside the app and are not touched.',
    buttons: ['Update now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;

  const appImage = process.env.APPIMAGE;
  const inPlace = process.platform === 'linux' && appImage && fs.existsSync(appImage);
  const destDir = inPlace ? path.dirname(appImage) : app.getPath('downloads');
  const dest = path.join(destDir, asset.name);

  try {
    const progress = (f) => { try { baseWindow.setProgressBar(f); } catch {} };
    await downloadTo(asset.browser_download_url, dest, ua, progress);
    try { baseWindow.setProgressBar(-1); } catch {}

    const want = await expectedSha512(release, process.platform, ua);
    if (want) {
      const got = await sha512Hex(dest);
      if (got !== want) throw new Error('checksum mismatch — download discarded');
    } else {
      console.warn('[update] no latest.json checksum in release; skipping verification');
    }

    if (inPlace) {
      fs.chmodSync(dest, 0o755);
      fs.renameSync(dest, appImage);   // atomic same-dir swap; pod folder beside it is untouched
      const { response: r2 } = await dialog.showMessageBox(baseWindow, {
        type: 'info',
        title: 'Update installed',
        message: `Data Kitchen ${latestStr} is installed.`,
        detail: 'Restart to start using it.',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (r2 === 0) { app.relaunch(); app.quit(); }
    } else {
      await dialog.showMessageBox(baseWindow, {
        type: 'info',
        title: 'Update downloaded',
        message: `Data Kitchen ${latestStr} was downloaded.`,
        detail: `Quit Data Kitchen and replace the old app with the new one `
          + `(keep it in the same folder as the old one):\n${dest}`,
        buttons: ['Show the file'],
      });
      shell.showItemInFolder(dest);
    }
  } catch (e) {
    try { baseWindow.setProgressBar(-1); } catch {}
    try { fs.rmSync(dest, { force: true }); } catch {}
    dialog.showErrorBox('Update failed', `The update could not be applied: ${e.message}\n`
      + 'Your current version keeps working; nothing was changed.');
  }
}

module.exports = {
  checkForUpdates,
  // exported for unit tests
  parseVersion, compareVersions, pickAsset, releasesLatestUrl,
};
