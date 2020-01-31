const {app, BrowserWindow, Menu} = require('electron')
const path = require('path')
const jsonfile = require('jsonfile');

console.log('@@ main.js argv[2] ' + process.argv[2])

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow


function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
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

  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
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
            'go2','file:///public/' 
          )
        }
      },
      { label: 'My in-browser IndexedDB',
        click: async () => {
          // This is how to load a browserFS storage area in the dataBrowser
          mainWindow.webContents.send(
            'go2','app://bfs/IndexedDB/' 
          )
        }
      },
      { label: 'My solid.community pod',
        click: async () => {
          // This is how to load a remote web page in the dataBrowser
          mainWindow.webContents.send(
            'go2','https://timbl.solid.community/' 
          )
        }
      },
      { label: 'My inrupt.net pod',
        click: async () => {
          // This is how to load a remote web page in the dataBrowser
          mainWindow.webContents.send(
            'go2','https://timbl.inrupt.net/'
          )
        }
      },
      { label: 'A sample DBPEDIA search',
        click: async () => {
          // This is how to search dbpedia
          mainWindow.webContents.send(
            'go2','http://dbpedia.org/data/Tim_Berners_Lee'
          )
        }
      },
     ]
  },
  // { role: 'customizeMenu' }
  { label: 'Customize',
     click: async () => {
       mainWindow.webContents.send(
         'go2web', 'assets/config.html'
       )
     }
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
            'go2web','https://solidproject.org/'
          )
        }
      },
      {
        label: 'About the Solid Data Kitchen',
        click: async () => {
          // This is how to load a local file in the web browser
          // file location (not a URL) is relative to install folder
          mainWindow.webContents.send(
            'go2web', 'assets/about.html'
          )
        }
      },
    ]
  }
]

const menu = Menu.buildFromTemplate(TEMPLATE)
Menu.setApplicationMenu(menu)
