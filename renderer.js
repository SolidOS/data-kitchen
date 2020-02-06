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
const SparqlFiddle         = require("./bundles/rdf-easy.js")
let LOCAL_BASE
let REMOTE_BASE

/*
   Handle requests for pages
   pageType = dataBrowser  - the mashlib dataBrowser
              webBrowser   - a remote or localhost web page
              localBroswer - a local page not served from localhost or dataBrowser
              fileManager  - form to copy/move/delete files
              queryForm    - form to send SPARQL queries
*/
async function showKitchenPage(uri,pageType){
  document.getElementById("versionsFooter").style.display="none"
  document.getElementById("kitchenMenu").style.display="none"
  if(typeof uri != "string"){
    uri = uriField.value
  }
  uri = mungeURI(uri)
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
    document.getElementById("versionsFooter").style.display="block"
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
    document.getElementById("kitchenMenu").style.display="block"
    document.getElementById("saveButton").style.display="inline-block"
    document.getElementById("logoutButton").style.display="inline-block"
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

/* URI shortcuts
*/
function mungeURI(uri){
  uri === uri || ""
  if( uri.startsWith("./") && LOCAL_BASE ){
    uri = uri.replace(/^\.\//,'')
    return `${LOCAL_BASE}${uri}`
  }
  else if ( uri.startsWith("/") && REMOTE_BASE ){
    uri = uri.replace(/^\//,'')
    return `${REMOTE_BASE}${uri}`
  }
  else if ( uri.startsWith("@") ){
    let ary = uri.split(/:/)
    let prefix = ary[0].replace(/@/,'')
    let term = ary[1] ? ary[1] : ""
    try{
      uri = UI.ns[prefix](term).uri
      if(!term)  uri = uri.replace(/#$/,'')
      return uri
    }
    catch(e) {alert("Sorry, couldn't expand "+uri)}
  }
  return uri
}  

async function handleQuery(evemt){
  event.preventDefault()
  const sparql = new SparqlFiddle( solid.auth )
  let endpoint = mungeURI(document.getElementById('sparqlEndpoint').value)
  let query    = document.getElementById('sparqlQuery').value
  if(!endpoint||!query){return alert("You must supply an endpoint and a query.")}
  let results
  try {
    results  = await sparql.query(endpoint,query)
  }
  catch(e){
    alert(e);return false
  }
  console.log(`querying ${endpoint} ${query} `)
  let columnHeads = Object.keys(results[0]).reverse()
  let table = "<table>"
  let topRow = ""
  for(c in columnHeads){
    topRow += `<th>${columnHeads[c]}</th>`
  }
  table += `<tr>${topRow}</tr>`
  for(r in results){
    let row = ""
    for(k in columnHeads){
      let uri = results[r][columnHeads[k]]
      if(typeof uri === "undefined") uri = "";
      if(row.length===0 && uri.startsWith("n")) { row+="none";continue }
      let ary = uri.split(/#/)
      let term = ary[1] || uri
      term = term.replace(LOCAL_BASE,'./').replace(REMOTE_BASE,'/').replace("http://www.iana.org/assignments/link-relations/",'')
      let title = uri
      uri = `showKitchenPage('${uri}','dataBrowser')`
      row += `<td><a href="#" onclick="${uri}" title="${title}">${term}</a></td>`
    }
    if(row.startsWith("none")) continue
    table += `<tr>${row}</tr>`
  }
  table += "</table>"
  document.getElementById('queryResults').innerHTML = table
  return false
}
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

  let button = {
    loginButton  : document.getElementById('loginButton'),
    logoutButton : document.getElementById('logoutButton'),
  }

  async function kitchenSave () {
    await showKitchenPage("none","fileManager");
    document.getElementById("sourceUri").value = uriField.value
    document.getElementById("targetUri").value = ""
  }
  async function kitchenQuery () {
    await showKitchenPage("none","queryForm");
    document.getElementById("sparqlEndpoint").value = uriField.value
  }
  async function kitchenLogin () {
    await solid.auth.logout()
    const popupUri = 'https://solid.community/common/popup.html'
    const session = await solid.auth.popupLogin({popupUri:popupUri})
    if (session) {
      // Make authenticated request to the server to establish a session cookie
      const {status} = await solid.auth.fetch(location)
      if (status === 401) {
        alert(`Invalid login.`)
        await solid.auth.logout()
      }
    }
  }
  async function kitchenLogout () {
    await solid.auth.logout()
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
  LOCAL_BASE = cfg.LOCAL_BASE 
  if(!LOCAL_BASE){
    LOCAL_BASE = "file://" + path.join(__dirname,"/myPod/")
  }
  REMOTE_BASE = cfg.REMOTE_BASE

  cfg.startPage = cfg.startPage || "assets/about.html"

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
    if (!session) {
      button.logoutButton.style.display="none"
      button.loginButton.style.display="block"
    }
    else {
      button.loginButton.style.display="none"
      button.logoutButton.style.display="block"
      button.logoutButton.title = session.webId
    }
  })
  showKitchenPage(cfg.startPage)
}
// SELECT ?uri WHERE (<> ldp:contains ?uri)
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
initial = initial || "./public/"
uriField.value = initial

init()

/* END */
