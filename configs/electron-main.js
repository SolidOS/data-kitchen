const {app, BrowserWindow, BrowserView, Menu} = require('electron');
const fs = require('fs/promises')
const path = require('path')
const electronReload = require('electron-reload')
const jsonfile = require('jsonfile');
const {getUserConfig,mungeMenu} = require('./electron-config.js');
let mainWindow;
var cfg,css;

let installDir = path.join(__dirname,"../");
let tmplDir = path.join(installDir,"templates");
let assetsDir = path.join(installDir,"assets");

// during development, live reload on change of any file
electronReload( installDir,{forceHardReset:true} );

async function getConfig(){
  let kFrom = path.join(tmplDir,'kitchen.json.tmpl')
  let kTo = path.join(installDir,'kitchen.json')
  try {
    await fs.copyFile( kFrom, kTo );
  }
  catch(e){
    console.log("Could not create kitchen.js from "+js,e);
    process.exit();
  }
  cfg = await getUserConfig( path.join(installDir,"kitchen.json") ) || {};
  cfg.port ||= 3000;
  cfg.startPage = `http://localhost:${cfg.port}/`;
  cfg.icon = path.join(installDir,"assets/favicon.ico");
  cfg.webPreferences = {
    preload: path.join(installDir, 'configs/electron-preload.js'),
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
  let root = cfg.rootFilePath;
  let port = cfg.port;
  let rootProfile = path.join(root,"profile") ;

  let aclFrom = path.join(tmplDir,"acl.tmpl");
  let aclTo   = path.join(root,".acl");
  let metaFrom = path.join(tmplDir,"meta.tmpl");
  let metaTo = path.join(root,".meta");
  let jsFrom = path.join(tmplDir,'kitchen.js.tmpl')
  let pFrom = path.join(tmplDir,'profile')
  let jsTo = path.join(assetsDir,'kitchen.js')
  let profileFrom = path.join(tmplDir,"profile/card$.ttl");

  let settingsFrom = path.join(pFrom,"settings") ;
  let settingsTo = path.join(rootProfile,"settings") ;

  // copy munged kitchen.js templates to assets
  try {
    let jsString = await fs.readFile( jsFrom,{encoding:'utf8'} );
    jsString =  "var port ="+cfg.port+";\n"+jsString ;
    await fs.writeFile( jsTo, jsString );
  }
  catch(e){
    console.log("Could not create kitchen.js from "+js,e);
    process.exit();
  }
  // copy acl & meta templates to rootFilePath
  // and kitchen.json to installDir
  try {
    await fs.copyFile( aclFrom, aclTo );
    await fs.copyFile( metaFrom, metaTo );
    await fs.mkdir( rootProfile );
  }
  catch(e){}
  try {
    await fs.mkdir( settingsTo );
  }
  catch(e){}
  try {
    if( await fs.access(path.join(rootProfile,"card$.ttl")) ) {}
  }
  catch(e){
      await fs.copyFile( profileFrom, rootProfile+"/card$.ttl" );
  }
  try {
    if( await fs.access( path.join(settingsTo,"prefs.ttl") ) ) {}
  }
  catch(e){
      await fs.copyFile( path.join(settingsFrom,'prefs.ttl'), path.join(settingsTo,"prefs.ttl" ) );
      await fs.copyFile( path.join(settingsFrom,'privateTypeIndex.ttl'), path.join(settingsTo,"privateTypeIndex.ttl" ) );
      await fs.copyFile( path.join(settingsFrom,'publicTypeIndex.ttl'), path.join(settingsTo,"publicTypeIndex.ttl" ) );
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
