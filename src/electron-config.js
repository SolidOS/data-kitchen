const jsonfile = require('jsonfile');
const path = require('path')

module.exports.getUserConfig = async function(configFile){
  try{ 
    cfg = await jsonfile.readFileSync( configFile ) 
  }
  catch(e){
    console.log("Could not load config file kitchen.json: ",e);
    process.exit();
  }
  cfg = cfg || {}
  cfg.width  ||=  1024
  cfg.height ||=  768
  if(cfg.left === "center") cfg.left = null;
  if(cfg.top === "center") cfg.top = null;
  cfg.rootFilePath = cfg.rootFilePath || "../";
  cfg.port = cfg.port || 3000;
  let parent = path.join(__dirname,"../");
  if(!cfg.rootFilePath.startsWith("/")) cfg.rootFilePath = path.join(parent,cfg.rootFilePath);
  
  return cfg;
}

module.exports.mungeMenu = function(cfg,mainWindow){
  let newBM = []
  if( cfg.bookmarks ){
    for(var b=0;b<cfg.bookmarks.length;b++){
      let url = cfg.bookmarks[b].url
      newBM.push({
        label : cfg.bookmarks[b].label,
        click : async () => {
          mainWindow.webContents.send( 'gotoSubject', url )
        }
      })
    }
  }
  let myMenu = getMenu(cfg,mainWindow)
  for(var i=0;i<myMenu.length;i++){
    if(myMenu[i].label==="Bookmarks"){
      myMenu[i].submenu=newBM
    }
  }
  return myMenu
}
function getMenu(cfg,mainWindow) {
  const isMac = process.platform === 'darwin'
  return [
  // { role: 'dataBrowserMenu' }
  {
    label: 'The Kitchen',
    submenu: [
      { label: 'DataBrowser',
        click: async () => { mainWindow.webContents.send( 
          'gotoSubject',cfg.startPage
        )}
      },
      { label: 'File Manager',
        enabled : false,
        click: async () => {
          mainWindow.webContents.send(
            'gotoSubject', 'none', 'fileManager'
          )
        }
      },
      { label: 'SPARQL Query',
        enabled : false,
        click: async () => {
          mainWindow.webContents.send(
            'gotoSubject','none','queryForm'
          )
        }
      },
      { label:'Exit',
         click() { closeAll() } 
      },
    ]
  },
  // { role: 'toolsMenu' }
  {
    label: 'Tools',
    submenu: [
     { label: 'Reload Data Kitchen',
        accelerator: "CmdOrCtrl+R", 
        click() {
          mainWindow.reload();
          mainWindow.loadURL(
            cfg.startPage
          )
        } 
      },
      { label: 'Clear Cache',
        click: async () => {
          // alert('clearing cache ...')
          mainWindow.webContents.session.clearCache(() => {
            // alert('cache is cleared')
            mainWindow.webContents.session.clearStorageData()
          });
        }
      },
      { label: 'Install Kitchen Updates',
        enabled : false,
        click: async () => {
          mainWindow.webContents.send(
            'https://jeff-zucker.github.io/data-kitchen.html'
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
        click: async () => { mainWindow.loadURL( cfg.startPage ) }
      },
      { label: 'My solid.community pod',
        click: async () => { mainWindow.loadURL(
          'https://jeff-zucker.solidcommunity.net/public/'
        )}
      },
      { label: 'My inrupt.net pod',
        click: async () => { mainWindow.loadURL(
          'https://pod.inrupt.com/jeff-zucker/public/'
        )}
      },
     ]
  },
  // { role: 'help' }
  {
    label: "Help",
    submenu: [
      {
        label: 'Welcome to the Kitchen',
        enabled : false,
        click: async () => {
          mainWindow.webContents.send(
            'gotoSubject', 'assets/welcome.html'
          )
        }
      },
      {
        enabled : false,
        label: 'DataBrowser User Guide',
        click: async () => {
          mainWindow.webContents.send(
            'gotoSubject','https://github.com/solid/userguide', 'webBrowser' )
        }
      },
      {
        label: 'Report Issues on this fork of the kitchen',
        enabled : false,
        click: async () => {
          mainWindow.webContents.send(
            'gotoSubject','https://github.com/jeff-zucker/data-kitchen/issues', 'webBrowser' )
        }
      },
      {
        label: 'About Solid',
        submenu: [
          { label: 'Solid : solidproject.org',
        enabled : false,
            click: async () => {
              mainWindow.webContents.send(
                'gotoSubject',
                'https://solidproject.org/',
                'webBrowser'      
              )
            }
          },
          { label: 'This Week in Solid',
        enabled : false,
            click: async () => {
              mainWindow.webContents.send(
                'gotoSubject',
                'https://solidproject.org/this-week-in-solid',
                'webBrowser'      
              )
            }
          },
          { label: 'Solid Gitter Chat',
        enabled : false,
            click: async () => {
              mainWindow.webContents.send(
                'gotoSubject',
                'https://gitter.im/solid/chat',
                'webBrowser'      
              )
            }
          },
          { label: 'Solid Forum',
        enabled : false,
            click: async () => {
              mainWindow.webContents.send(
                'gotoSubject',
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
