const path                 = require('path')
const fs                   = require('fs')
const jsonfile             = require('jsonfile');
const {ipcRenderer,remote} = require('electron')
const ns                   = require('solid-namespace')
const BrowserFS            = require("./bundles/browserfs.min.js")
const SolidRest            = require("./bundles/solid-rest/dist/main.js")
const SolidFileStorage     = require('./bundles/solid-rest/src/file.js')
const SolidBrowserFS       = require('./bundles/solid-rest/src/browserFS.js')
const SolidFileClient      = require("./bundles/solid-file-client.bundle.js")
const kitchen              = require('./assets/Kitchen.js')

/* Manage Files
*/
async function manageFiles(e) {
  const fc = new SolidFileClient(SolidAuthClient,{enableLogging:true})
  let r;
  e.preventDefault()
  let c={} 
  c.action = getRadioVal( document.getElementById('fileManager'), 'action' );
  c.acl = getRadioVal( document.getElementById('fileManager'), 'acl' );
  c.merge = getRadioVal( document.getElementById('fileManager'), 'merge' );
  c.sourceUri = document.getElementById('sourceUri').value
  c.targetUri = document.getElementById('targetUri').value
  if(!c.sourceUri){
    alert("Sorry, you must specify a source URI!")
    return false;
  }
  else {
    c.sourceUri = mungeURI(c.sourceUri)
  }
  if(c.action==="delete"){
    r = window.confirm(`Are you sure you want to delete ${c.sourceUri}?`)
    if(!r) return false
    r = await fc.delete(c.sourceUri)
    alert(r.status+" "+r.statusText)
  }
  else if(c.action==="copy"||c.action==="move"){
    if(!c.targetUri ){
      alert("Sorry, you must specify a source and a target!")
    }
    else {
      c.targetUri = mungeURI(c.targetUri)
      r = window.confirm(
        `Are you sure you want to ${c.action} ${c.sourceUri} to ${c.targetUri}?`
      )
      if(!r) return false
      let opts = {}
      if(c.merge==="source") opts.merge = "keep_source"
      if(c.merge==="target") opts.merge = "keep_target"
      if(c.acl==="no") opts.withAcl = false
      console.log( opts )
      try {
        r = await fc[c.action](c.sourceUri,c.targetUri,opts)
      }
      catch(e){alert(e)}
      alert(r.status+" "+r.statusText)
    }
  }
  return false;
  function getRadioVal(form, name) {
    var val;
    var radios = form.elements[name];
    for (var i=0, len=radios.length; i<len; i++) {
      if ( radios[i].checked ) {
        val = radios[i].value;
        break;
      }
    }
    return val;
  }
}

/* Initialize Solid-Rest and friends, go to START_PAGE
*/
async function init(){

  let cfg = await kitchen.getConfig()

  if(typeof solid === "undefined") solid = {}
  solid.auth   = solid.auth || SolidAuthClient

  solid.rest   = new SolidRest(
    [
      new SolidBrowserFS(),
      new SolidFileStorage(),
      // could add other solid-rest backend plugins here
    ]
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
  solid.rest.storage("bfs").initBackends({
      '/HTML5FS'   : { fs: "HTML5FS"  , options:{size:5} },
      '/IndexedDB' : { fs: "IndexedDB", options:{storeName:"bfs"}}
      //  '/Dropbox' : { fs: "Dropbox", options:{client: dropCli} }
  })
  solid.auth.trackSession(async session => {
    let loginButton  = document.getElementById('loginButton')
    let logoutButton = document.getElementById('logoutButton')
    if (!session) {
      logoutButton.style.display="none"
      loginButton.style.display="inline-block"
    }
    else {
      loginButton.style.display="none"
      logoutButton.style.display="inline-block"
      logoutButton.title = session.webId
    }
  })
  kitchen.makeContextMenu()
  kitchen.showKitchenPage(cfg.startPage)
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
    kitchen.showKitchenPage(uriField.value,'dataBrowser')
  }
}, false)
goButton.addEventListener('click', ()=>{kitchen.showKitchenPage()}, false);
window.document.title = "Solid Data Kitchen"
/*
  get menu slection from main.js top menu and dispatch it
*/
ipcRenderer.on('kitchen.showKitchenPage', (event, uri, pageType) => {
    return kitchen.showKitchenPage(uri,pageType)
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
initial = initial || "./public/"
uriField.value = initial

init()

/* END */
