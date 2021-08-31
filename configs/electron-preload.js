const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld(
  'ipcRenderer',
  {
    init: (go) => {
      ipcRenderer.on('gotoSubject',(event,uri)=>{
        go(uri);
      });
    }
  }
)
