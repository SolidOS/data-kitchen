#!/usr/bin/env bash
set -euo pipefail

# Config
APP_ID="com.example.emacslauncher"
PRODUCT_NAME="electron-demo"
ELECTRON_VERSION="^26.0.0"
ELECTRON_BUILDER_VERSION="^24.0.0"

echo "Creating project in $(pwd)"

# package.json (CommonJS) with electron-builder config
cat > package.json <<JSON
{
  "name": "emacs-launcher",
  "version": "1.0.0",
  "main": "main.js",
  "type": "commonjs",
  "scripts": {
    "start": "electron .",
    "dist": "electron-builder"
  },
  "devDependencies": {
    "electron": "${ELECTRON_VERSION}",
    "electron-builder": "${ELECTRON_BUILDER_VERSION}"
  },
  "build": {
    "appId": "${APP_ID}",
    "productName": "${PRODUCT_NAME}",
    "files": [
      "**/*"
    ],
    "directories": {
      "buildResources": "build"
    },
    "linux": {
      "target": [
        "AppImage",
        "deb",
        "rpm"
      ],
      "category": "Utility"
    },
    "win": {
      "target": [
        "portable",
        "nsis"
      ]
    },
    "mac": {
      "target": [
        "dmg",
        "zip"
      ]
    }
  }
}
JSON

# main.js (CommonJS) — launches /usr/bin/emacs
cat > main.js <<'JS'
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('launch-emacs', async () => {
  const emacsPath = '/usr/bin/emacs';
  try {
    const child = spawn(emacsPath, ['filename'], { detached: true, stdio: 'ignore' });
    child.unref();
    return { success: true };
  } catch (err) {
    return { success: false, message: String(err) };
  }
});
JS

# preload.js (CommonJS)
cat > preload.js <<'JS'
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  launchEmacs: () => ipcRenderer.invoke('launch-emacs')
});
JS

# index.html with CSP meta tag and externalized scripts/styles
cat > index.html <<'HTML'
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Launch Emacs</title>
    <!-- Strict Content Security Policy -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';">
  </head>
  <body>
    <h1>Launch Emacs</h1>
    <button id="launchBtn">Open /usr/bin/emacs</button>
    <p id="status"></p>
    <script src="./renderer.js"></script>
  </body>
</html>
HTML

# renderer.js (no Node APIs)
cat > renderer.js <<'JS'
const btn = document.getElementById('launchBtn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  status.textContent = 'Launching...';
  try {
    const res = await window.api.launchEmacs();
    status.textContent = res.success ? 'Emacs launched.' : 'Error: ' + (res.message || 'unknown');
  } catch (e) {
    status.textContent = 'IPC error: ' + e;
  }
});
JS

# Create a basic README
cat > README.md <<MD
# ${PRODUCT_NAME}

This Electron app launches /usr/bin/emacs with -nw when the button is clicked.

Notes:
- Uses CommonJS (require/module.exports).
- CSP is set in index.html to avoid unsafe-eval warnings.
- Packaging uses electron-builder; outputs depend on platform.

Usage:
1. npm install
2. npm start
3. npm run dist  # builds distributables via electron-builder
MD

# Optional build resources directory (icons placeholder)
mkdir -p build
cat > build/readme.txt <<TXT
Place platform icons here:
 - icon.png (linux)
 - icon.ico  (windows)
 - icon.icns (mac)
TXT

echo ""
echo "Installing dependencies (this may take a while)..."
npm install

echo ""
echo "Local dev run test available via: npm start"
echo "To build distributables use: npm run dist"
echo ""
echo "Notes:"
echo " - Building platform-specific binaries may require running on that platform (macOS code signing/notarization must run on macOS)."
echo " - AppImage is a good single-file option on Linux (produced when building linux AppImage)."
echo " - Ensure targets have /usr/bin/emacs or instruct users accordingly."
echo ""
echo "If you want, run 'npm run dist -- --linux AppImage' to build Linux AppImage now (this host must be Linux)."

# If running on Linux, optionally build AppImage automatically
if [ "$(uname -s)" = "Linux" ]; then
  echo ""
  echo "Detected Linux host — running electron-builder for AppImage..."
  npx electron-builder --linux AppImage || true
  echo "If build failed, inspect the error and run 'npm run dist' manually."
fi

echo ""
echo "Done."
