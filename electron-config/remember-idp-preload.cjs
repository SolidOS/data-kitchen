// Preload for the dedicated "Remember this sign-in" window (remember-idp-window.html).
// The password the user types here goes straight to the MAIN process over IPC —
// it never reaches the app renderer. Main uses it transiently to mint a durable
// client-credential and discards it (electron-config/idp-grant.cjs).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rememberIdpDialog', {
  context: () => ipcRenderer.invoke('dk:remember-context'),         // { issuer }
  submit: (email, password) => ipcRenderer.invoke('dk:remember-submit', { email, password }),
  cancel: () => ipcRenderer.invoke('dk:remember-cancel'),
});
