const {Menu, MenuItem,BrowserView} = remote
const exec     = require('child_process').exec;
const path     = require('path')
const fs       = require('fs')
const TabGroup = require("electron-tabs")

const Rest     = require('../bundles/solid-rest/')
const File     = require('../bundles/solid-rest/src/file.js')
const Bfs      = require('../bundles/solid-rest/src/browserFS.js')
const Sparql   = require("../bundles/rdf-easy.js")
const FileCli  = require("../bundles/solid-file-client.bundle.js")
let tab

class Kitchen {

  constructor() {
    this.version = "1.0.1"
    this.clickedOn = null
  }

  /* Initialize Solid-Rest and friends
     - localStorage is included by default
     - one could add other browserFS backend plugins here
     - ./bundles has a Dropbox SDK that could be used for a backend
     - once initialized, address these spaces with the mountpoints like this:
           app://bfs/IndexedDB/  app://bfs/HTML5FS/  app://bfs/Dropbox/, etc.
     - HTML5FS is the native file API currently only implemented in chrome
       and requires enabling in chrome://flags
     Here's the flow:
       We instantiate solid-rest with solid-rest-file and solid-rest-browserFS
       Then we initialize the browserFS backends
       Then we instantiate solid-auth-cli with that rest 
       Then we instantiate solid-file-client and sparql-fiddle with that auth
    
      this.auth   = new Auth( new Rest([ new File(), new Bfs() ]) )
  */
  async init(){
    this.auth = require('../bundles/solid-auth-cli.js')
    this.auth.rest = this.auth.setRestHandlers([ new File(), new Bfs() ])
    this.auth.rest.storage("bfs").initBackends({ 
      '/HTML5FS'   : { fs: "HTML5FS"  , options:{size:5} },
      '/IndexedDB' : { fs: "IndexedDB", options:{storeName:"bfs"} }
    })
    this.fc     = new FileCli(this.auth,{enableLogging:true})
    this.sparql = new Sparql( this.auth, $rdf )

    window.SolidRest = this.auth.rest
    this.cfg = await this.getConfig()
    await this.makeContextMenu()
    await this.makeTabs()
    if(this.lastVisited)
      await this.showKitchenPage(this.lastVisited,'dataBrowser')
    else
      await this.showKitchenPage(this.cfg.startPage)
    this.checkForUpdates()
  }
  async checkForUpdates(){
    let body = await this.auth.fetch(
      "https://jeff-zucker.github.io/data-kitchen-version.txt"
    )
    let latestVersion = await body.text()
    let thisVersion = Number(this.version.replace(/.*\./,''))
    latestVersion = latestVersion.replace(/\s/g,'')
    console.log(`latest kitchen : <${latestVersion}>`)
    console.log(`this kitchen   : <${this.version}>`)
    latestVersion = Number(latestVersion.replace(/.*\./,''))
    if( thisVersion < latestVersion ){
       alert("There is a newer version of Data Kitchen. Use the Tools menu to read more or install.")
    }
  }
  async getConfig(){
    this.lastVisited = window.localStorage.getItem('kitchenLastVisited')
    let installDir = path.join(__dirname,"../")
    installDir = installDir.replace(/\\/g,"/")
    installDir = process.platform.match(/^win/) 
      ? installDir.replace(/^.:/,'')
      : installDir
    this.installDir = installDir
    this.configFile = "file://"+path.join( this.installDir, "config.ttl" )
    this.configAlt  = "file://"+path.join( this.installDir, "../data-kitchen-config.ttl" )
    this.configAltJSON = path.join( this.installDir, "../data-kitchen-config.json" )
    this.configJSON = path.join( this.installDir, "config.json" )
    
    let cfg = await this.loadSettings()
    cfg.startPage = cfg.startPage && cfg.startPage.length>1 ? cfg.startPage :
      "assets/welcome.html"
    cfg.localBase=cfg.localBase && cfg.localBase.length>1 ? cfg.localBase : 
      "file://"+path.join(this.installDir,"/myPod/")
    this.cfg=cfg
    return cfg
  }
  async loadSettings(){
    this.rconf = require('../bundles/rdf-config.js')
    let res = await this.auth.fetch(this.configAlt)
    if(res.status==200){
      this.configFile = this.configAlt
      this.configJSON = this.configAltJSON
    }
    return await this.rconf.loadSettings(this.configFile)
  }
  async manageSettings(){
    await this.rconf.editSettings(this.configFile)
  }
  async settings2json() {
    const cfg = await this.rconf.loadSettings(this.rconf.formDoc.uri)
    try {
      await require('jsonfile').writeFileSync( this.configJSON, cfg )    
    }
    catch(e) { alert("Error saving as JSON : "+e) }
  }

  /* URI shortcuts
  */
  mungeURI(uri){
    uri === uri || ""
    if( uri.startsWith("./") && this.cfg.localBase ){
      uri = uri.replace(/^\.\//,'')
      uri = `${this.cfg.localBase}${uri}`
    }
    else if ( uri.startsWith("/") && this.cfg.remoteBase ){
      uri = uri.replace(/^\//,'')
      uri = `${this.cfg.remoteBase}${uri}`
    }
    else if ( uri.startsWith("@") ){
      let ary = uri.split(/:/)
      let prefix = ary[0].replace(/@/,'')
      let term = ary[1]
      prefix = this.sparql.expand(prefix)
      if(!prefix) {
        alert("Sorry, couldn't expand "+uri)
        return false
      }
      return (term) ? prefix + term : prefix.replace(/#$/,'')
    }  
    try {
      let urlObj = new URL (uri)
      uri = urlObj.href
    }
    catch(e){
      if( uri.match(/^(http|file|app)/) ){
        alert("Bad URI"+e.code)
      }
    }
    return uri
  }  

/* TABS
*/
  makeTabs() {
    let tabGroup = new TabGroup()
    let tab = tabGroup.addTab({
      title: "WebView",
      src: this.cfg.startPage,
      visible:true,
      closable:false,
      active:false,
    })
    this.tabGroup = tabGroup
//    let tab = this.tabGroup.getTabByPosition(1)
//    tab.activate()
    // this.hideTabs()
  }
  showTab(uri){
    document.body.classList.add('webview')
    document.getElementById("kitchenTabContent").style.display="block"
    let tab = this.tabGroup.getTabByPosition(1)
//    tab.on("webview-ready",(tab)=>{
//alert(9)
      tab.activate()
      let wb = tab.webview
      wb.src=uri
//    })
  }
  hideTabs(){
    document.getElementById("kitchenTabContent").style.display="none"
  }

/* CONTEXT MENUS
*/
  makeContextMenu() {
    let self = this
    let menu = new Menu()
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
    menu.append(new MenuItem ({
      label: `Move up a level from current URI`,
      click: ()=>{self.moveUp()}
    }))
    const menu2 = new Menu()
    menu2.append(new MenuItem ({
      label: `Move up a level from current URI`,
      click: ()=>{self.moveUp()}
    }))
    menu2.append(new MenuItem (
      { role: 'toggledevtools' }
    ))
    function getEditors(menu){
      let newBM = []
      if( self.cfg.editors ){
        for(var b=0;b<self.cfg.editors.length;b++){
          let com = self.cfg.editors[b].path
          newBM.push({
            label : self.cfg.editors[b].name,
            click : async () => {
              let fn = self.clickedOn.replace("file://","")
              self.execute( com+' '+fn, (output)=>{
                console.log(output)
              })
            }
          })
        }
      }
      menu.append(new MenuItem ({
        label: `Edit with`,
        submenu:newBM
      }))
      return menu
    }
    menu = getEditors(menu)
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      // e.g. if(e.srcElement.nodeName==="TEXTAREA"){}
      let self = this
      let attrs = e.path[0].attributes
      if( attrs.length===0 ) attrs = {} // not link or item
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

       execute(command, params, callback) {
          exec(command, params, (error, stdout, stderr) => { 
            if(error) alert(error)
            else callback(stdout); 
          });
        };

/*
   Handle requests for pages
   pageType = dataBrowser  - the mashlib dataBrowser
              webBrowser   - a remote or localhost web page
              localBroswer - a local page not served from localhost or dataBrowser
              fileManager  - form to copy/move/delete files
              queryForm    - form to send SPARQL queries
*/
async showKitchenPage(uri,pageType){
  this.refreshLoginStatus()
  if(typeof uri != "string"){
    uri = uriField.value
  }
  uri = this.mungeURI(uri)
  if(!uri) return
  let pages = [
    'fileManager','queryForm', 'sessionForm', 'webview',
    'dataBrowser','localBrowser','webBrowser', 'settingsForm'
  ]
  for(var p of pages){
    if( document.body.classList.contains(p) ){
      this.lastPageType = p  // so we can backup
      if(p==="settingsForm") this.settings2json()
      document.body.classList.remove(p)
    }
  }
  this.hideTabs()
  // an embedded form
  // 
  if(pageType==="fileManager"||pageType==="queryForm"||pageType==="settingsForm"){
    document.body.classList.add(pageType)
    if(pageType==="settingsForm") await this.manageSettings()
  }
  else if(pageType==="sessionForm"){
    document.body.classList.add("sessionForm")
    await this.createSessionForm()
  }
  // an installation HTML file like assets/about.html (not localhost)
  // 
  else if( uri !="none" && !uri.match(/^(http|file|app)/) ){
    uri = "file://" + path.join(this.installDir,uri)
    this.showTab(uri)
  }
  // a web page from a remote site or localhost
  // 
  else if(pageType==="webBrowser"){
    this.showTab(uri);
  }
  // a databrowser location
  // 
  else {
    document.body.classList.add('dataBrowser')
    if(uri==="none") return
    uriField.value = uri
    window.localStorage.setItem('kitchenLastVisited',uri)
    console.log("User field " + uriField.value)
    console.log("User requests " + uri)
    // const params = new URLSearchParams(location.search)
    // params.set('uri', uri);
    // window.history.replaceState({}, '', `${location.pathname}?${params}`);
    var subject = kb.sym(uri);
    // UI.widgets.makeDraggable(icon, subject) // beware many handlers piling up
    try {
      outliner.GotoSubject(subject, true, undefined, true, undefined);
    }
    catch(e) { alert(e) }
  }
  return false
}

/* LOGIN &  SESSION MANAGEMENT
*/


  async login (credentials) {
    document.getElementById("loggingInNotice").style.display="block"
    try {
      await this.auth.login( credentials )
      await this.refreshLoginStatus()
    }
    catch(e){ alert(e) }
    document.getElementById("loggingInNotice").style.display="none"
    this.returnFromSessionForm()
  }
  async logout () {
    await this.auth.logout()
    await this.refreshLoginStatus()
    this.returnFromSessionForm()
  }
  async refreshLoginStatus(){
    let session = await this.auth.currentSession() 
//    let session = await SolidAuthClient.currentSession() 
    this.webId = (session) ? session.webId : null
    let displayId = (this.webId) ? this.webId : "none"
    document.getElementById("kitchenWebId").innerHTML = "&lt;"+displayId+"&gt;"
    document.getElementById("kitchenLoginButton").innerHTML = this.webId ? "Change" : "Login"
  }
  async createSessionForm(){
    let self = this
    let form   = document.getElementById("sessionForm")
    let idArea = document.getElementById("kitchenStoredIdentities")
    if( this.cfg.identities && this.cfg.identities.length > 0) {
console.warn(this.cfg)
      idArea.innerHTML = ""
      let newIds = [];
      for(var c of this.cfg.identities){
        newIds.push({
          username : c.username,
          idp : c.idp,
          password : c.password
        })  
      }
      for(var i=0;i<newIds.length;i++){
          let id = newIds[i]
          idArea.innerHTML = idArea.innerHTML + 
          `<button onclick="kitchen.useStoredIdentity(event,`+i+`)">`
         +`${id.username}.${id.idp}</button> `
      }
      self.identities = newIds
    }
    else {
       idArea.innerHTML=`store identities in config.json to autofill this form`
    }
  }
  returnFromSessionForm(){
    document.body.classList.remove("sessionForm")
    document.body.classList.add(this.lastPageType)
  }
  async handleSessionForm(event,type){
    event.preventDefault()
    let u = document.getElementById("kitchenUsername")
    let i = document.getElementById("kitchenIDP")
    let p = document.getElementById("kitchenPassword")
    if(type==="cancel"){
      this.returnFromSessionForm()
      return false
    }
    if(type==="logout"){
      this.logout()
      return false
    }
    if(type==="reset"){
      u.value=""; i.value=""; p.value=""
      return false
    }
    if( !u.value || !i.value || !p.value ) {
      alert("You must fill in all fields!")
      return false
    }
    await this.login({
      username : u.value,
           idp : i.value,
      password : p.value
    })   
    return false
  }
  async useStoredIdentity(event,idNum){
    event.preventDefault()
    let id = this.identities[idNum]
    if(!id || !id.username || !id.idp) return false
    document.getElementById("kitchenUsername").value = id.username || ""
    document.getElementById("kitchenIDP").value = id.idp || ""
    document.getElementById("kitchenPassword").value = id.password || ""
    if( id.password ) {
      await this.login(id)
      return false
    }
    return false
  }
/* END OF SESSION MANAGEMENT */

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
async handleQuery(event,all){
  event.preventDefault()
  let endpoint = this.mungeURI(document.getElementById('sparqlEndpoint').value)
  document.getElementById('sparqlEndpoint').value=endpoint
  let query    = document.getElementById('sparqlQuery').value
  if(all){
    query = "SELECT ?subject ?predicate ?object WHERE { ?subject ?predicate ?object. }"
    document.getElementById('sparqlQuery').value = query
  }
  if(!endpoint||!query){return alert("You must supply an endpoint and a query.")}
  let results
  // alert(`querying ${endpoint} ${query} `)
  try {
    results  = await this.sparql.query(endpoint,query)
  }
  catch(e){
    alert("Error querying SPARQL : "+e);return false
  }
  if(!results || !results.length) {
    document.getElementById('queryResults').innerHTML = "no results found"
    return false
  }
  let columnHeads = Object.keys(results[0])
  columnHeads = columnHeads.reverse() // only for rdflib
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
//      let ary = uri.split(/#/)
//      let term = ary[1] || uri
let term = uri
      if(term.match('http://www.w3.org/ns/iana/media-types/')){
        term = term.replace('http://www.w3.org/ns/iana/media-types/','')
      }
      if(term.match('#')){
        term = term.replace(/.*\//,'')
      }
      term = term.replace('#',':')
      term = term.replace(this.cfg.localBase,'./').replace(this.cfg.remoteBase,'/')
      term = term.replace('22-rdf-syntax-ns','rdf')
      term = term.replace("http://www.iana.org/assignments/link-relations/",'link:')
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

/* FORMS

// load settings from a Turtle file into a Javascript array
//
   const rconf = require('rdf-config.js')
   const settings = rconf.loadSettings('http://example.org/settings.ttl')
   console.log( settings.windowHeight ) // or other settings

// present an HTML form to edit settings, automatically save edits
//
   const rconfig = require('rdf-config.js')
   rconfig.editForm('http://example.org/settings.ttl')
*/

/* Manage Files
*/
async manageFiles(e) {
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
    if(!c.sourceUri) return
  }
  if(c.action==="delete"){
    r = window.confirm(`Are you sure you want to delete ${c.sourceUri}?`)
    if(!r) return false
    r = await this.fc.delete(c.sourceUri)
    alert(r.status+" "+r.statusText)
  }
  else if(c.action==="copy"||c.action==="move"){
    if(!c.targetUri ){
      alert("Sorry, you must specify a source and a target!")
    }
    else {
      c.targetUri = this.mungeURI(c.targetUri)
      if(!c.targetUri) return
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
        r = await this.fc[c.action](c.sourceUri,c.targetUri,opts)
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
