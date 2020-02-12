const {ipcRenderer,remote} = require('electron')
const BrowserFS            = require("./bundles/browserfs.min.js")
const kitchen              = require('./assets/Kitchen.js')

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

/* initialize and start the kitchen */
kitchen.init()

/* END */
