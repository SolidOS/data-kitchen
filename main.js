const {app, BrowserWindow, Menu} = require('electron')
const path = require('path')
const jsonfile = require('jsonfile');
let mainWindow

app.on('ready', async ()=>{
  cfg = await getConfig()
  Menu.setApplicationMenu(
      Menu.buildFromTemplate( mungeMenu(cfg) )
  )
  createWindow(cfg)
})
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', function () {
  if (mainWindow === null) createWindow()
})
async function createWindow (cfg) {
  mainWindow = new BrowserWindow(await getWindow(cfg))
  mainWindow.loadFile('index.html')
  mainWindow.webContents.openDevTools() /* DEV-TOOLS */
  mainWindow.on('closed', function () { mainWindow = null })
}
/* THIS IS THE END OF THE ELECTRON METHODS
 * BELOW HERE JUST GETS DATA FOR THEM
*/


if (process.argv) {
  console.log('@@ main.js argv[2] ' + process.argv[2])
  global.commandlineArgs = process.argv.slice()
  console.log(
    'main.js: saved args in various places: '+global.commandlineArgs.join(', ')
  )
}
async function getWindow (cfg) {
  cfg = cfg || await getConfig()
  return {
    width: cfg.width,
    height: cfg.height,
    x: cfg.windowX,
    y: cfg.windowY,
    icon:path.join(__dirname,"myPod/favicon.png"),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nativeWindowOpen: true,
      nodeIntegration: true
    }
  }
}
function mungeMenu(cfg){
  let newBM = []
  if( cfg.bookmarks ){
    for(var b=0;b<cfg.bookmarks.length;b++){
      let uri = cfg.bookmarks[b].uri
      newBM.push({
        label : cfg.bookmarks[b].label,
        click : async () => {
          mainWindow.webContents.send( 'kitchen.showKitchenPage', uri, 'dataBrowser' )
        }
      })
    }
  }
  let myMenu = getMenu()
  for(var i=0;i<myMenu.length;i++){
    if(myMenu[i].label==="Bookmarks"){
      myMenu[i].submenu=newBM
    }
  }
  return myMenu
}
async function getConfig(){
  const configFile        = path.join(__dirname,"config.json")
  const defaultConfigFile = path.join(__dirname,"config.default.json")
  let cfg
  try{ 
    cfg = await jsonfile.readFileSync( configFile ) 
  }
  catch(e){
    if(!e.toString().match("ENOENT"))console.log(e)
  }
  if(typeof cfg ==="undefined"){
    try{
      cfg = await jsonfile.readFileSync( defaultConfigFile ) 
    }
    catch(e){console.log(e)}
  }
  cfg = cfg || {}
  cfg.width  = cfg.windowWidth  || 800
  cfg.height = cfg.windowHeight || 600
  cfg.windowX = typeof cfg.windowX==="string" ? undefined : cfg.windowX
  cfg.windowy = typeof cfg.windowY==="string" ? undefined : cfg.windowY
  return cfg
}
function getMenu() {
  const isMac = process.platform === 'darwin'
  return [
  // { role: 'appMenu' }
  ...(isMac ? [{
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideothers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }] : []),
  // { role: 'fileMenu' }
  {
    label: 'File',
    submenu: [
      {
        label: 'Manage files',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', 'assets/file.html', 'fileManager'
          )
        }
      },
      isMac ? { role: 'close' } : { role: 'quit' },
    ]
  },
  // { role: 'editMenu' }
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? [
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [
            { role: 'startspeaking' },
            { role: 'stopspeaking' }
          ]
        }
      ] : [
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ])
    ]
  },
  // { role: 'viewMenu' }
  {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forcereload' },
      { role: 'toggledevtools' },
      { type: 'separator' },
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  // { role: 'bookmarksMenu' }
  {
    label: 'Bookmarks',
    submenu: [
      { label: 'My local files',
        click: async () => {
          // This is how to load a local file in the dataBrowser
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','./public/','dataBrowser'
          )
        }
      },
      { label: 'My in-browser IndexedDB',
        click: async () => {
          // This is how to load a browserFS storage area in the dataBrowser
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','app://bfs/IndexedDB/', 'dataBrowser'
          )
        }
      },
      { label: 'My solid.community pod',
        click: async () => {
          // This is how to load a remote web page in the dataBrowser
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://timbl.solid.community/public/','dataBrowser'
          )
        }
      },
      { label: 'My inrupt.net pod',
        click: async () => {
          // This is how to load a remote web page in the dataBrowser
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://timbl.inrupt.net/public/','dataBrowser'
          )
        }
      },
      { label: 'A sample Ontology search',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','@ldp','dataBrowser'
          )
        }
      },
      { label: 'A sample DBPEDIA search',
        click: async () => {
          // This is how to search dbpedia
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','http://dbpedia.org/data/Tim_Berners_Lee','dataBrowser'
          )
        }
      },
     ]
  },
  // { role: 'dataBrowserMenu' }
  {
    label: 'DataBrowser',
    click: async () => {
      mainWindow.webContents.send(
            'kitchen.showKitchenPage', "none" , 'dataBrowser'
      )
    },
  },
  // { role: 'sparqlMenu' }
  {
    label: 'Query',
    click: async () => {
      mainWindow.webContents.send(
            'kitchen.showKitchenPage','','queryForm'
      )
    },
  },
  // { role: 'help' }
  {
    label: "Help",
    submenu: [
      {
        label: 'About Solid',
        click: async () => {
          // This is how to load a remote web page in the web browser
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://solidproject.org/', 'webBrowser'
          )
        }
      },
      {
        label: 'About the Solid Data Kitchen',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', 'assets/about.html'
          )
        }
      },
    ]
  }
]

}




/*
function openExternal(path,program){
  var child = require('child_process').execFile;
  var executablePath = "/usr/bin/emacs24"
  var parameters = ["-nw",path];
  child( executablePath, parameters, (err,data)=>{
     console.log(err)
     console.log(data.toString());
  });
}
*/


