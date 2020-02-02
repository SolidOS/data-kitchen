const path                 = require('path')
const fs                   = require('fs')
const jsonfile             = require('jsonfile');
const {ipcRenderer,remote} = require('electron')
const BrowserFS            = require("./bundles/browserfs.min.js")
const SolidRest            = require("./bundles/solid-rest/dist/main.js")
const SolidFileStorage     = require('./bundles/solid-rest/src/file.js')
const SolidBrowserFS       = require('./bundles/solid-rest/src/browserFS.js')

/*
   Handle requests for pages
   pageType = dataBrowser  - the mashlib dataBrowser
              webBrowser   - a remote or localhost web page
              localBroswer - a local page not served from localhost or dataBrowser
              fileManager  - form to copy/move/delete files
              queryForm    - form to send SPARQL queries
*/
async function showKitchenPage(uri,pageType){
/*
  if(typeof uri!="string") {
 uri = ""
//    uri = uriField.value || ""
    pageType = 'dataBrowser'
  }
*/
  if(typeof uri != "string"){
    uri = uriField.value
  }
  let pages = {
    fileManager  : document.getElementById('fileManager'),
    queryForm    : document.getElementById('queryForm'),
    webBrowser   : document.getElementById('webBrowser'),
    dataBrowser  : document.getElementById('dataBrowser'),
    localBrowser : document.getElementById('localBrowser'),
  }
  for(p in pages){
    pages[p].style.display = "none"
  }
  // an embedded form
  // 
  if(pageType==="fileManager"||pageType==="queryForm"){
    pages[pageType].style.display="block"
  }
  // an installation HTML file like assets/about.html (not localhost)
  // 
  else if( uri !="none" && !uri.match(/^(http|file|app)/) ){
    document.body.style.overflowY="auto"
    let newContent = fs.readFileSync(uri)      
    pages.localBrowser.innerHTML = newContent
    pages.localBrowser.style.display = "block"

  }
  // a web page from a remote site or localhost
  // 
  else if(pageType==="webBrowser"){
    document.body.style.overflowY="hidden"
    document.body.style.margin=0
    pages.webBrowser.style.overflowY="hidden"
    pages.webBrowser.style.display ="block"
    pages.webBrowser.src = uri
  }
  // a databrowser location
  // 
  else {
    pages['dataBrowser'].style.display="block"
    if(uri==="none") return
    uriField.value = uri
    console.log("User field " + uriField.value)
    console.log("User requests " + uri)
    // const params = new URLSearchParams(location.search)
    // params.set('uri', uri);
    // window.history.replaceState({}, '', `${location.pathname}?${params}`);
    var subject = kb.sym(uri);
    // UI.widgets.makeDraggable(icon, subject) // beware many handlers piling up
    outliner.GotoSubject(subject, true, undefined, true, undefined);
  }
}

/* Initialize Solid-Rest and friends, go to START_PAGE
*/
async function init(){
  const configFile = path.join(__dirname,"config.json")
  const defaultConfigFile = path.join(__dirname,"config.default.json")
  let cfg
  try{ cfg = await jsonfile.readFileSync( configFile ) }
  catch(e){if(!e.toString().match("ENOENT"))console.log(e)}
  if(typeof cfg ==="undefined"){
     try{  cfg = await jsonfile.readFileSync( defaultConfigFile ) }
     catch(e){console.log(e)}
  }
  cfg=cfg||{}
  cfg.startPage = cfg.startPage || "assets/about.html"
  cfg.fileRoot = cfg.fileRoot || path.join(__dirname,"/myPod")

  window.FILE_ROOT = cfg.fileRoot
  window.solidRestInstance = new SolidRest(
    [
      new SolidBrowserFS(),
      new SolidFileStorage(),
      // could add other solid-rest backend plugins here
    ],
    {
      /* this defines where file:/// points to
       * it should contain profile and settings files like a pod
       */
      "fileRoot" : window.FILE_ROOT
    }
  )
  /* Solid Rest backends intialization
    - localStorage is included by default
    - one could add other browserFS backend plugins here
    - ./bundles has a Dropbox SDK that could be used for a backend
    - once initialized, address these spaces with the mountpoints like this:
        app://bfs/IndexedDB/  app://bfs/HTML5FS/  app://bfs/Dropbox/, etc.
    - HTML5FS is the native file API currently only implemented in chrome
        and requires enabling in chrome://flags
  */
  window.solidRestInstance.storage("bfs").initBackends({
      '/HTML5FS'   : { fs: "HTML5FS"  , options:{size:5} },
      '/IndexedDB' : { fs: "IndexedDB", options:{storeName:"bfs"}}
      //  '/Dropbox' : { fs: "Dropbox", options:{client: dropCli} }
  })
  showKitchenPage(cfg.startPage)
}

/* Set up The Tabulator
*/
const UI = panes.UI
const $rdf = UI.rdf
const dom = document
var kb = UI.store;
var outliner = panes.getOutliner(dom)
// $rdf.Fetcher.crossSiteProxyTemplate = self.origin + '/xss?uri={uri}';
console.log('renderer.js')
console.log('renderer.js panes ' + panes)

/* Fill in version info 
*/
var ele = document.getElementById('solid-panes-version')
if (ele && panes.versionInfo) {
  ele.textContent = panes.versionInfo.npmInfo['solid-panes']
}
ele = document.getElementById('kitchen-version')
if (ele) {
  ele.textContent = "1.0.0, jz-fork"
}

/* define window : buttons, listeners, title
*/
const uriField = dom.getElementById('uriField')
const goButton = dom.getElementById('goButton')
uriField.addEventListener('keyup', function (e) {
  if (e.keyCode === 13) {
    showKitchenPage(uriField.value,'dataBrowser')
  }
}, false)
goButton.addEventListener('click', showKitchenPage, false);
window.document.title = "Solid Data Kitchen"
/*
  get menu slection from main.js top menu and dispatch it
*/
ipcRenderer.on('showKitchenPage', (event, uri, pageType) => {
    return showKitchenPage(uri,pageType)
})


/* Get command line arguements, intitialize uriField
*/
// get command=line arguments a la https://stackoverflow.com/questions/30815446/how-to-pass-command-line-argument-in-electron
var arguments = remote.getGlobal('commandlineArgs')
console.log(' @@ renderer.js arguments ', arguments);
// initial = new URLSearchParams(self.location.search).get("uri")
let initial
if (arguments && arguments[2]) { // Electron command line
  initial = arguments[2]
}
initial = initial || "file:///public/"
uriField.value = initial

init()

/* END */
