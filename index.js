const { app, BrowserView, BrowserWindow } = require('electron')
const url = require('url');
const path = require('path');

const startCli = require('./node_modules/solid-server/bin/lib/cli');

async function startServer(){
  const server = null; // or could be an express app
  await startCli(server);
}

const winWidth = 800;
const winHeight = 600;

async function createWindow () {
    await startServer();
    const clientUrl = 'https://localhost:9119/'
    const clientWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      webPreferences: {
        resizable:true,
        fullScreenable:true,
        contextIsolation : true,
        sandbox : true,
      }
    });
    // clientWindow.webContents.openDevTools();
    clientWindow.loadURL( clientUrl )
}
app.whenReady().then(createWindow)

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    event.preventDefault()
    callback(true)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    process.exit();
  }
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
// THE END!
