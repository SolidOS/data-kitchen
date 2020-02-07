const path             = require('path')
const fs               = require('fs')
const jsonfile         = require('jsonfile');
const ns               = require('solid-namespace')
const SparqlFiddle     = require("../bundles/rdf-easy.js")
const SolidFileClient  = require("../bundles/solid-file-client.bundle.js")
const SolidRest        = require("../bundles/solid-rest/dist/main.js")
const SolidFileStorage = require('../bundles/solid-rest/src/file.js')
const SolidBrowserFS   = require('../bundles/solid-rest/src/browserFS.js')

class Kitchen {

  constructor() {
    this.clickedOn = null
  }

  /* Initialize Solid-Rest and friends, go to START_PAGE
  */
  async init(){
    let cfg = await this.getConfig()
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
    this.makeContextMenu()
    this.showKitchenPage(cfg.startPage)
  }

  /* URI shortcuts
  */
  mungeURI(uri){
    uri === uri || ""
    if( uri.startsWith("./") && this.LOCAL_BASE ){
      uri = uri.replace(/^\.\//,'')
      return `${this.LOCAL_BASE}${uri}`
    }
    else if ( uri.startsWith("/") && this.REMOTE_BASE ){
      uri = uri.replace(/^\//,'')
      return `${this.REMOTE_BASE}${uri}`
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

  async getConfig(){
    let upDir = process.platform.match(/^win/) ? "..\\" : "../"
    let installDir = path.join(__dirname,upDir)
    installDir = process.platform.match(/^win/) 
      ? installDir.replace(/^.:/,'')
      : installDir
    this.installDir = installDir
    const configFile = path.join(installDir,"config.json")
    const defaultConfigFile = path.join(installDir,"config.default.json")
    let cfg
    try{ cfg = await jsonfile.readFileSync( configFile ) }
    catch(e){if(!e.toString().match("ENOENT"))console.log(e)}
    if(typeof cfg ==="undefined"){
      try{  cfg = await jsonfile.readFileSync( defaultConfigFile ) }
      catch(e){console.log(e)}
    }
    cfg = cfg || {}
    cfg.startPage = cfg.startPage || "assets/quick-tour.html"
    this.REMOTE_BASE = cfg.REMOTE_BASE
    this.LOCAL_BASE 
        =  cfg.LOCAL_BASE 
        || "file://" + path.join( installDir,"/myPod/" )
    return cfg
  }
  makeContextMenu() {
    let self = this
    const {Menu, MenuItem} = remote
    const menu = new Menu()
    menu.append(new MenuItem ({
      label: 'Save this item to pod or local file',
      click() { 
          self.kitchenSave( self.clickedOn )
      }
    }))
    menu.append(new MenuItem ({
      label: 'Query this item as a SPARQL endpoint',
      click() { 
          self.kitchenQuery( self.clickedOn )
      }
    }))
    menu.append(new MenuItem ({
      label: 'Rebase DataBrowser to this item',
      click() { 
        self.showKitchenPage( self.clickedOn, 'dataBrowser' )
      }
    }))
    menu.append(new MenuItem (
      { type: 'separator' }
    ))
    menu.append(new MenuItem ({
      label: `Move up a level from current URI`,
      click: ()=>{self.moveUp()}
    }))
    menu.append(new MenuItem (
      { role: 'toggledevtools' }
    ))
    const menu2 = new Menu()
    menu2.append(new MenuItem ({
      label: `Move up a level (from current URI)`,
      click: ()=>{self.moveUp()}
    }))
    menu2.append(new MenuItem (
      { role: 'toggledevtools' }
    ))
    window.addEventListener('contextmenu', (e) => {
      let self = this
      e.preventDefault()
      let attrs = e.path[0].attributes
      if( attrs.length===0 ) return false // not link or item
      let clickedOn = null
      if(attrs.href) clickedOn = attrs.href.nodeValue    // link
      else if(attrs.about) clickedOn=attrs.about.nodeValue  // dataBrowser item
      else {
        menu2.popup(remote.getCurrentWindow())
        return false
      }
      if(clickedOn) {
        self.clickedOn = clickedOn.replace(/</,'').replace(/>/,'')
      }
      menu.popup(remote.getCurrentWindow())
    }, false)
  } 
/*
   Handle requests for pages
   pageType = dataBrowser  - the mashlib dataBrowser
              webBrowser   - a remote or localhost web page
              localBroswer - a local page not served from localhost or dataBrowser
              fileManager  - form to copy/move/delete files
              queryForm    - form to send SPARQL queries
*/
async showKitchenPage(uri,pageType){
  document.getElementById("versionsFooter").style.display="none"
  document.getElementById("kitchenMenu").style.display="none"
  if(typeof uri != "string"){
    uri = uriField.value
  }
  uri = this.mungeURI(uri)
  let pages = {
    fileManager  : document.getElementById('fileManager'),
    queryForm    : document.getElementById('queryForm'),
    webBrowser   : document.getElementById('webBrowser'),
    dataBrowser  : document.getElementById('dataBrowser'),
    localBrowser : document.getElementById('localBrowser'),
  }
  for(var p in pages){
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
    uri = path.join(this.installDir,uri)
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

  moveUp() { 
    let parent = uriField.value.match(/#/)
      ? uriField.value.replace(/#.*$/,'')
      : uriField.value.replace(/\/$/,'').replace(/[^\/]*$/,'')
    this.showKitchenPage( parent, 'dataBrowser' )
    return false
  }
  async clearQuery (event) {
    event.preventDefault()
    document.getElementById("sparqlEndpoint").innerText = ""
    document.getElementById("sparqlQuery").value = ""
    return false
  }
  async kitchenSave (uri) {
    uri = uri || uriField.value
    await this.showKitchenPage("none","fileManager");
    document.getElementById("sourceUri").value = uri
    document.getElementById("targetUri").value = ""
  }
  async kitchenQuery (uri) {
    uri = uri || uriField.value
    await this.showKitchenPage("none","queryForm");
    document.getElementById("sparqlEndpoint").value = uri
  }
  async kitchenLogin () {
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
  async kitchenLogout () {
    await solid.auth.logout()
  }

async handleQuery(event,all){
  event.preventDefault()
  const sparql = new SparqlFiddle( solid.auth )
  let endpoint = this.mungeURI(document.getElementById('sparqlEndpoint').value)
  let query    = document.getElementById('sparqlQuery').value
  if(all){
    query = "SELECT * WHERE ( ?subject ?predicate ?object. )"
    document.getElementById('sparqlQuery').value = query
  }
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
  for(var c in columnHeads){
    topRow += `<th>${columnHeads[c]}</th>`
  }
  table += `<tr>${topRow}</tr>`
  let addRow = true
  for(var r in results){
    let row = ""
    addRow = true;
    for(var k in columnHeads){
      let uri = results[r][columnHeads[k]]
      if(typeof uri === "undefined") uri = "";
      let ary = uri.split(/#/)
      let term = ary[1] || uri
      term = term.replace(this.LOCAL_BASE,'./').replace(this.REMOTE_BASE,'/').replace("http://www.iana.org/assignments/link-relations/",'')
      let title = uri
      let click = `kitchen.showKitchenPage('${uri}','dataBrowser')`
      if( !uri.match(/^(http|file|app)/) ){
        if(term.match(/^n/)) { console.warn(term); addRow=false}
        row += `<td title="${title}">${term}</td>`      }
      else {
        row += 
         `<td><a href="#" onclick="${click}" title="${title}">${term}</a></td>`
      }
    }
    if(addRow) table += `<tr>${row}</tr>`
  }
  table += "</table>"
  document.getElementById('queryResults').innerHTML = table
  return false
}

/* Manage Files
*/
async manageFiles(e) {
  const fc = new SolidFileClient(solid.auth,{enableLogging:true})
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
    c.sourceUri = this.mungeURI(c.sourceUri)
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
      c.targetUri = this.mungeURI(c.targetUri)
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

}
module.exports = new Kitchen()
