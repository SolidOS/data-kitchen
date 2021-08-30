const {app, BrowserWindow, BrowserView, Menu} = require('electron')
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
  if(cfg.devTools==1)
    mainWindow.webContents.openDevTools() /* DEV-TOOLS */
  mainWindow.loadFile('index.html')
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
    width: cfg.windowWidth,
    height: cfg.windowHeight,
    x: cfg.windowLeft,
    y: cfg.windowTop,
    icon:path.join(__dirname,"myPod/favicon.png"),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nativeWindowOpen: true,
      webviewTag: true,
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
  const configFile        = path.join(__dirname,"../data-kitchen-config.json")
  const defaultConfigFile = path.join(__dirname,"config.json")
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
    catch(e){console.log(e); return {} }
  }
  cfg = cfg || {}
  cfg.windowWidth  = Number(cfg.windowWidth)  || 800
  cfg.windowHeight = Number(cfg.windowHeight) || 600
  cfg.windowLeft   = cfg.windowLeft==="0" ? 0 : Number(cfg.windowLeft)
  cfg.windowTop    = cfg.windowTop==="0" ? 0  : Number(cfg.windowTop)
  cfg.windowLeft = cfg.windowLeft<0 ? null : cfg.windowLeft
  cfg.windowTop = cfg.windowTop<0 ? null : cfg.windowTop
  return cfg
}
function getMenu() {
  const isMac = process.platform === 'darwin'
  return [
  // { role: 'dataBrowserMenu' }
  {
    label: 'The Kitchen',
    submenu: [
      { label: 'DataBrowser',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', "none" , 'dataBrowser'
          )
        }
      },
      { label: 'SPARQL Query',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','none','queryForm'
          )
        }
      },
      { label: 'File Manager',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', 'none', 'fileManager'
          )
        }
      },
      { label: 'Session/Login Manager',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', 'none', 'sessionForm'
          )
        }
      },
      { label: 'Settings Manager',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', 'none', 'settingsForm'
          )
        }
      },
    ]
  },
  // { role: 'toolsMenu' }
  {
    label: 'Tools',
    submenu: [
      { label: 'Install kitchen updates',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://jeff-zucker.github.io/data-kitchen.html','webBrowser'
          )
        }
      },
      { role: 'toggledevtools' },
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
  // { role: 'help' }
  {
    label: "Help",
    submenu: [
      {
        label: 'Welcome to the Kitchen',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage', 'assets/welcome.html'
          )
        }
      },
      {
        label: 'DataBrowser User Guide',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://github.com/solid/userguide', 'webBrowser' )
        }
      },
      {
        label: 'Report Issues on this fork of the kitchen',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://github.com/jeff-zucker/data-kitchen/issues', 'webBrowser' )
        }
      },
/*
      {
        label: 'Submit an issue on this fork of the kitchen',
        click: async () => {
          mainWindow.webContents.send(
            'kitchen.showKitchenPage','https://github.com/solid/userguide', 'webBrowser' )
        }
      },
*/
      {
        label: 'About Solid',
        submenu: [
          { label: 'Solid : solidproject.org',
            click: async () => {
              mainWindow.webContents.send(
                'kitchen.showKitchenPage',
                'https://solidproject.org/',
                'webBrowser'      
              )
            }
          },
          { label: 'This Week in Solid',
            click: async () => {
              mainWindow.webContents.send(
                'kitchen.showKitchenPage',
                'https://solidproject.org/this-week-in-solid',
                'webBrowser'      
              )
            }
          },
          { label: 'Solid Gitter Chat',
            click: async () => {
              mainWindow.webContents.send(
                'kitchen.showKitchenPage',
                'https://gitter.im/solid/chat',
                'webBrowser'      
              )
            }
          },
          { label: 'Solid Forum',
            click: async () => {
              mainWindow.webContents.send(
                'kitchen.showKitchenPage',
                'https://forum.solidproject.org/latest',
                'webBrowser'      
              )
            }
          },
        ]
      } 
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


