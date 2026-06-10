// Preload for the reader overlay's toolbar (reader-chrome.html). Exposes the
// toolbar buttons to main and lets main push navigation state back.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('readerChrome', {
  back:    () => ipcRenderer.send('dk:reader-back'),
  forward: () => ipcRenderer.send('dk:reader-forward'),
  reload:  () => ipcRenderer.send('dk:reader-reload'),
  close:   () => ipcRenderer.send('dk:reader-close'),
  onState: (cb) => ipcRenderer.on('dk:reader-state', (_e, s) => cb(s)),
});
