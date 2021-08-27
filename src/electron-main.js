const {app, BrowserWindow, BrowserView, Menu} = require('electron');
const fs = require('fs/promises')
const path = require('path')
const electronReload = require('electron-reload')
const jsonfile = require('jsonfile');
const {getUserConfig,mungeMenu} = require('./electron-config.js');
let mainWindow;
var cfg,css;

let installDir = path.join(__dirname,"../");

// during development, live reload on change of any file
electronReload( installDir,{forceHardReset:true} );

async function getConfig(){
  cfg = await getUserConfig( path.join(__dirname,"../kitchen.json") ) || {};
  cfg.port ||= 3000;
  cfg.startPage = `http://localhost:${cfg.port}/`;
  cfg.icon = path.join(__dirname,"../ServerRoot/common/favicon.ico");
  cfg.webPreferences = {
    preload: path.join(__dirname, 'electron-preload.js'),
    nativeWindowOpen: true,
    nodeIntegration: false,
    contextIsolation: true,
  }
  return cfg;
}
getConfig().then( async (cfg)=>{
  await prepRootFilePath(cfg);
  spawnCSS(cfg);
});

async function prepRootFilePath(cfg){
  let tmplDir = path.join(__dirname,"../ServerRoot/common");
  let acl = path.join(tmplDir,"acl.tmpl");
  let meta = path.join(tmplDir,"meta.tmpl");
  let root = cfg.rootFilePath;
  let port = cfg.port;
  let jsFrom = path.join(tmplDir,'kitchen.js.tmpl')
  let jsTo = path.join(tmplDir,'kitchen.js')
  try {
    let jsString = await fs.readFile( jsFrom,{encoding:'utf8'} );
    jsString =  "var port ="+cfg.port+";\n"+jsString ;
    await fs.writeFile( jsTo, jsString );
  }
  catch(e){
    console.log("Could not create kitchen.js from "+js,e);
    process.exit();
  }
  try {
    await fs.copyFile( acl, path.join(root,".acl") );
    await fs.copyFile( meta, path.join(root,".meta") );
  }
  catch(e){
    console.log("Could not create "+path.join(root,".acl"),e);
    process.exit();
  }
}


/* ELECTRON STUFF
*/
app.on('ready', async ()=>{
/*
  actions that would happen here, are, instead, triggered once CSS is loaded
*/
})
app.on('close', function (e) {
  closeAll();
})
app.on('will-quit', function (e) {
  closeAll();
})
process.on('uncaughtException', function (error) {
  closeAll();
});

function closeAll(){
  if (process.platform !== 'darwin') app.quit()
}
app.on('activate', async function () {
  if (mainWindow === null) createWindow(cfg);
})
async function createWindow (cfg,css) {
 console.clear();
 console.log(`\nServing Data-Kitchen from ${cfg.rootFilePath} using port ${cfg.port}.\n`)
  mainWindow = new BrowserWindow(cfg)
  Menu.setApplicationMenu(
    Menu.buildFromTemplate( mungeMenu(cfg,mainWindow) )
  )
  //  mainWindow.removeMenu(); // NO TOP MENU
  if(cfg.devTools==1) mainWindow.webContents.openDevTools() /* DEV-TOOLS */
  mainWindow.loadURL(cfg.startPage)
/*
  mainwindow.webContents.session.clearStorageData([], function (data) {
    console.log(data);
  })
*/
  mainWindow.on('closed', function () { mainWindow = null })
}

/* START CSS IN A SEPARATE PROCESS, THEN START ELECTRON 
   -- user starts both with npm start and doesn't need to close CSS separately
*/
function spawnCSS(cfg){
  const cssStartPath = path.join(__dirname,"css-start.sh");
  var serverStarted=false;
  const { spawn } = require("child_process");
  css = spawn(cssStartPath,[cfg.rootFilePath,cfg.port]);
  css.stdout.on("data", data => {
    if( !serverStarted && data.toString().match(/Starting server/) ){
      serverStarted = true;
      createWindow(cfg,css);
    }
    console.log(`stdout: ${data}`);
  });
  css.stderr.on("data", data => {
    console.log(`stderr: ${data}`);
  });
  css.on('error', (error) => {
    //    console.log(`error: ${error.message}`);
    css.stdin.pause();
    css.kill();
  });
  css.on("close", code => {
    css.stdin.pause();
    css.kill();
  //    console.log(`error: ${code}`);
  });
}
/* END OF CSS STUFF */


// ENDS!
