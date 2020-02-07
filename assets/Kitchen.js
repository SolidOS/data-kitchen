const SparqlFiddle = require("../bundles/rdf-easy.js")

class Kitchen {

  constructor(){
    this.clickedOn = null
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
    cfg.startPage = cfg.startPage || "assets/about.html"
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
      label: 'Save to pod or local file',
      click() { 
          self.kitchenSave( self.clickedOn )
      }
    }))
    menu.append(new MenuItem ({
      label: 'Query as a SPARQL endpoint',
      click() { 
          self.kitchenQuery( self.clickedOn )
      }
    }))
    menu.append(new MenuItem ({
      label: 'Rebase DataBrowser here',
      click() { 
        self.showKitchenPage( self.clickedOn, 'dataBrowser' )
      }
    }))
    menu.append(new MenuItem (
      { type: 'separator' }
    ))
    menu.append(new MenuItem (
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
        console.warn(attrs); return false
      }
      if(clickedOn) {
        self.clickedOn = clickedOn.replace(/</,'').replace(/>/,'')
        menu.popup(remote.getCurrentWindow())
      }
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

async handleQuery(event){
  event.preventDefault()
  const sparql = new SparqlFiddle( solid.auth )
  let endpoint = this.mungeURI(document.getElementById('sparqlEndpoint').value)
  let query    = document.getElementById('sparqlQuery').value
  if(!endpoint||!query){return alert("You must supply an endpoint and a query.")}
  let results
  try {
    results  = await sparql.query(endpoint,query)
  }
  catch(e){
    alert(e);return false
  }
  alert(`querying ${endpoint} ${query} `)
  let columnHeads = Object.keys(results[0]).reverse()
  let table = "<table>"
  let topRow = ""
  for(var c in columnHeads){
    topRow += `<th>${columnHeads[c]}</th>`
  }
  table += `<tr>${topRow}</tr>`
  for(var r in results){
    let row = ""
    for(var k in columnHeads){
      let uri = results[r][columnHeads[k]]
      if(typeof uri === "undefined") uri = "";
      if(row.length===0 && uri.startsWith("n")) { row+="none";continue }
      let ary = uri.split(/#/)
      let term = ary[1] || uri
      term = term.replace(this.LOCAL_BASE,'./').replace(this.REMOTE_BASE,'/').replace("http://www.iana.org/assignments/link-relations/",'')
      let title = uri
      uri = `kitchen.showKitchenPage('${uri}','dataBrowser')`
      row += `<td><a href="#" onclick="${uri}" title="${title}">${term}</a></td>`
    }
    if(row.startsWith("none")) continue
    table += `<tr>${row}</tr>`
  }
  table += "</table>"
  document.getElementById('queryResults').innerHTML = table
  return false
}

}
module.exports = new Kitchen()
