const {app, BrowserWindow, Menu} = require('electron')
const path = require('path')
const jsonfile = require('jsonfile');

console.log('@@ main.js argv[2] ' + process.argv[2])

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

async function createWindow () {

  /* get configs
  */
  const configFile = path.join(__dirname,"config.json")
  const defaultConfigFile = path.join(__dirname,"config.default.json")
  let cfg
  try{ cfg = await jsonfile.readFileSync( configFile ) }
  catch(e){if(!e.toString().match("ENOENT"))console.log(e)}
  if(typeof cfg ==="undefined"){
     try{  cfg = await jsonfile.readFileSync( defaultConfigFile ) }
     catch(e){console.log(e)}
  }
  console.log(cfg)
  cfg = cfg || {}
  cfg.width  = cfg.windowWidth  || 800
  cfg.height = cfg.windowHeight || 600
  cfg.windowX = typeof cfg.windowX==="string" ? undefined : cfg.windowX
  cfg.windowy = typeof cfg.windowY==="string" ? undefined : cfg.windowY

  /* Create the browser window.
  */
  mainWindow = new BrowserWindow({
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
  })

  if (process.argv) {
    global.commandlineArgs = process.argv.slice()
    console.log('main.js: saved args in various places: ' + global.commandlineArgs.join(', '))
  }

  /* load the main page */
  mainWindow.loadFile('index.html')
  // mainWindow.webContents.openDevTools()
  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

    app.on('ready', createWindow)
    app.on('window-all-closed', function () {
        // On macOS it is common for applications and their menu bar
        // to stay active until the user quits explicitly with Cmd + Q
        if (process.platform !== 'darwin') app.quit()
    })
    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (mainWindow === null) createWindow()
    })

const isMac = process.platform === 'darwin'

// The TEMPLATE variable holds the top level menu options
// Edit as you wish
//
const TEMPLATE = [
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
            'showKitchenPage', 'assets/file.html', 'fileManager'
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
            'showKitchenPage','./public/','dataBrowser'
          )
        }
      },
      { label: 'My in-browser IndexedDB',
        click: async () => {
          // This is how to load a browserFS storage area in the dataBrowser
          mainWindow.webContents.send(
            'showKitchenPage','app://bfs/IndexedDB/', 'dataBrowser'
          )
        }
      },
      { label: 'My solid.community pod',
        click: async () => {
          // This is how to load a remote web page in the dataBrowser
          mainWindow.webContents.send(
            'showKitchenPage','https://timbl.solid.community/','dataBrowser'
          )
        }
      },
      { label: 'My inrupt.net pod',
        click: async () => {
          // This is how to load a remote web page in the dataBrowser
          mainWindow.webContents.send(
            'showKitchenPage','https://timbl.inrupt.net/','dataBrowser'
          )
        }
      },
      { label: 'A sample DBPEDIA search',
        click: async () => {
          // This is how to search dbpedia
          mainWindow.webContents.send(
            'showKitchenPage','http://dbpedia.org/data/Tim_Berners_Lee','dataBrowser'
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
            'showKitchenPage', "none" , 'dataBrowser'
      )
    },
  },
  // { role: 'sparqlMenu' }
  {
    label: 'Query',
    click: async () => {
      mainWindow.webContents.send(
            'showKitchenPage','assets/sparql.html','queryForm'
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
            'showKitchenPage','https://solidproject.org/', 'webBrowser'
          )
        }
      },
      { label: 'How to customize Data Kitchen',
          click: async () => {
            mainWindow.webContents.send(
              'showKitchenPage', 'assets/config.html'
            )
          }
      },
      { label: 'Using URI shortcuts',
          click: async () => {
            mainWindow.webContents.send(
              'showKitchenPage', 'assets/uri.html'
            )
          }
      },
      {
        label: 'About the Solid Data Kitchen',
        click: async () => {
          mainWindow.webContents.send(
            'showKitchenPage', 'assets/about.html'
          )
        }
      },
    ]
  }
]

const menu = Menu.buildFromTemplate(TEMPLATE)
Menu.setApplicationMenu(menu)
