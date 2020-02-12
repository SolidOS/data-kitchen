const path     = require('path')
const fs       = require('fs')
const jsonfile = require('jsonfile');

const Auth     = require('../bundles/solid-auth-cli/')
const Rest     = require('../bundles/solid-rest/')
const File     = require('../bundles/solid-rest/src/file.js')
const Bfs      = require('../bundles/solid-rest/src/browserFS.js')
const Sparql   = require("../bundles/rdf-easy.js")
const FileCli  = require("../bundles/solid-file-client.bundle.js")


class Kitchen {

  constructor() {
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
    
  */
  async init(){
    this.auth   = new Auth( new Rest([ new File(), new Bfs() ]) )
    this.auth.rest.storage("bfs").initBackends({ 
      '/HTML5FS'   : { fs: "HTML5FS"  , options:{size:5} },
      '/IndexedDB' : { fs: "IndexedDB", options:{storeName:"bfs"} }
    })
    this.fc     = new FileCli(this.auth,{enableLogging:true})
    this.sparql = new Sparql( this.auth )

    window.SolidRest = this.auth.rest
    this.cfg = await this.getConfig()
    this.makeContextMenu()
    this.showKitchenPage(this.cfg.startPage)
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
      let term = ary[1]
      prefix = this.sparql.expand[prefix]
      if(!prefix) {
        alert("Sorry, couldn't expand "+uri)
        return false
      }
      return (term) ? prefix + term : prefix.replace(/#$/,'')
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
    cfg.LOCAL_BASE = (cfg.LOCAL_BASE && cfg.LOCAL_BASE.length===0) ? null : cfg.LOCAL_BASE
    cfg.LOCAL_BASE = this.LOCAL_BASE 
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
      label: `Move up a level from current URI`,
      click: ()=>{self.moveUp()}
    }))
    menu2.append(new MenuItem (
      { role: 'toggledevtools' }
    ))
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      // e.g. if(e.srcElement.nodeName==="TEXTAREA"){}
      let self = this
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
  this.refreshLoginStatus()
  document.getElementById("versionsFooter").style.display="none"
  if(typeof uri != "string"){
    uri = uriField.value
  }
  uri = this.mungeURI(uri)
  if(!uri) return
  let pages = [
    'fileManager','queryForm', 'sessionForm',
    'dataBrowser','localBrowser','webBrowser'
  ]
  for(var p of pages){
    if( document.body.classList.contains(p) ){
      this.lastPageType = p  // so we can backup
      document.body.classList.remove(p)
    }
  }
  // an embedded form
  // 
  if(pageType==="fileManager"||pageType==="queryForm"){
    document.body.classList.add(pageType)
  }
  else if(pageType==="sessionForm"){
    document.body.classList.add("sessionForm")
    await this.createSessionForm()
  }
  // an installation HTML file like assets/about.html (not localhost)
  // 
  else if( uri !="none" && !uri.match(/^(http|file|app)/) ){
    document.body.classList.add('webBrowser')
    uri = "file://" + path.join(this.installDir,uri)
    document.getElementById('webBrowser').src = uri
  }
  // a web page from a remote site or localhost
  // 
  else if(pageType==="webBrowser"){
    document.body.classList.add('webBrowser')
    document.getElementById('webBrowser').src = uri
//    remote.getCurrentWindow().loadURL(uri)
  }
  // a databrowser location
  // 
  else {
    document.body.classList.add('dataBrowser')
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
  return false
}

/* LOGIN &  SESSION MANAGEMENT
*/
  async login (credentials) {
    document.getElementById("loggingInNotice").style.display="block"
    await this.auth.login( credentials )
    await this.refreshLoginStatus()
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
  let query    = document.getElementById('sparqlQuery').value
  if(all){
    query = "SELECT * WHERE ( ?subject ?predicate ?object. )"
    document.getElementById('sparqlQuery').value = query
  }
  if(!endpoint||!query){return alert("You must supply an endpoint and a query.")}
  let results
  alert(`querying ${endpoint} ${query} `)
  try {
    results  = await this.sparql.query(endpoint,query)
  }
  catch(e){
    alert("Error querying SPARQL : "+e);return false
  }
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
      term = term.replace(this.LOCAL_BASE,'./').replace(this.REMOTE_BASE,'/')
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
