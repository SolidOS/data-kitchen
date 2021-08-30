/* index.js
 * this is the electron main process
 * it starts up the NSS server
 * then it initializes and displays the startURL in a Chromium window
*/
const {app,BrowserWindow,Menu,globalShortcut} = require('electron')
const url = require('url');
const path = require('path');
const server = require('express')();
const fs = require('fs');

server.all('/*',(req,res,next)=>{
  //
  // DENY ALL EXTERNAL REQUESTS BASED ON SOCKET CONNECTION
  //
  var origin = req.connection.remoteAddress;
  if(!origin.match(/^(127.0.0.1)|(::ffff:127.0.0.1)|(::1)$/)){
    res.append('status',400);
    res.append('statusText',"Bad Request!");
    console.log("Attempt to access from external source!!!!!!!");
    res.send();
    return;
  }
  let pathAry = req.path.split('/');
  if(req.path.match('/apps')){
    const appFolder = path.join(__dirname,"apps");
    const app = pathAry[2];
    const appPath = path.join(appFolder,app);
    if( app.match(/\.html$/) ) {
      let content = fs.readFileSync(appPath,'utf8');
      res.send(content);
    }
    else {
      execShellCommand(appPath).then( (r)=>{ console.log(r); res.send(r) });
    }
  }
  else { 
    next();
  }
});

function execShellCommand(cmd) {
  const exec = require("child_process").exec;
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 500 }, (error, stdout, stderr) => {
      if (error) {
        console.warn(error);
      } else if (stdout) {
          resolve(stdout);
      } else {
        console.log(stderr);
      }
    });
  });
}

const startCli = require('./node_modules/solid-server/bin/lib/cli');


async function startServer(){
  await startCli(server);
}

const winWidth = 1024;
const winHeight = 700;

async function createWindow () {
    await startServer();
    const clientWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      webPreferences: {
        resizable:true,
        fullScreenable:true,
        nodeIntegration:true,
        contextIsolation : true,
        sandbox : true,
      }
    });
    Menu.setApplicationMenu(null);
    globalShortcut.register('Shift+CommandOrControl+I', () => {
      clientWindow.webContents.toggleDevTools();
    })
    clientWindow.loadFile( 'client/data-kitchen.html' );
}

app.whenReady().then( ()=>{
  createWindow();
})

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
