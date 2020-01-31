// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const path=require('path')
const fs=require('fs')

console.log('renderer.js')
console.log('renderer.js panes ' + panes)

const START_PAGE = "assets/about.html"
const FILE_ROOT = path.join(__dirname,"/myPod")

var ele = document.getElementById('solid-panes-version')
if (ele && panes.versionInfo) {
  ele.textContent = panes.versionInfo.npmInfo['solid-panes']
}
ele = document.getElementById('kitchen-version')
if (ele) {
  ele.textContent = "1.0.0, jz-fork"
}

var remote = require('electron').remote // a la https://stackoverflow.com/questions/30815446/how-to-pass-command-line-argument-in-electron

// this allows us to get commands from the top Menu (defined in main.js)
//
var ipcRenderer = require('electron').ipcRenderer

var arguments = remote.getGlobal('commandlineArgs')
console.log(' @@ renderer.js arguments ', arguments);

const UI = panes.UI
const $rdf = UI.rdf
const dom = document
// $rdf.Fetcher.crossSiteProxyTemplate = self.origin + '/xss?uri={uri}';

var uri = window.location.href;
window.document.title = uri;
var kb = UI.store;
var outliner = panes.getOutliner(dom)

ipcRenderer.on('go2web', (event, uri) => {
    return go2web(uri)
})

// we open web pages in a separate frame 
// so as not to kill the dataBrowser javaScript
// local files displayed as pages also need  a frame
//
let db = document.getElementById('dataBrowser')
let wb = document.getElementById('webBrowser')
let lb = document.getElementById('localBrowser')
let tb = document.getElementById('outline')

// local files don't like to be served in an iframe
// so we use a different way to display them
function go2web( uri ){
    wb.style.display ="none"
    tb.style.display ="none"
    lb.style.display ="none"
    if( !uri.match(/^(http|file|app)/) ){
      document.body.style.overflowY="auto"
//      lb.style.overflow="auto"
      let newContent = fs.readFileSync(uri)      
      lb.style.display ="block"
      lb.innerHTML = newContent
    }
    else {
      document.body.style.overflowY="hidden"
      wb.style.overflowY="hidden"
      wb.style.display ="block"
      wb.src = uri
    }
}

ipcRenderer.on('go2', (event, uri) => {
  tb.style.display ="block"
  wb.style.display ="none"
  lb.style.display ="none"
  window.document.title = uri;
  uriField.value = uri
  var subject = kb.sym(uri);
  outliner.GotoSubject(subject, true, undefined, true, undefined);
})

function go ( event ) {
  tb.style.display ="block"
  wb.style.display ="none"
  lb.style.display ="none"
  let uri = $rdf.uri.join(uriField.value, window.location.href)
  console.log("User field " + uriField.value)
  console.log("User requests " + uri)

  // const params = new URLSearchParams(location.search)
  // params.set('uri', uri);
  // window.history.replaceState({}, '', `${location.pathname}?${params}`);

  var subject = kb.sym(uri);
  // UI.widgets.makeDraggable(icon, subject) // beware many handlers piling up
  outliner.GotoSubject(subject, true, undefined, true, undefined);
}

const uriField = dom.getElementById('uriField')
const goButton = dom.getElementById('goButton')
uriField.addEventListener('keyup', function (e) {
  if (e.keyCode === 13) {
    go(e)
  }
}, false)

goButton.addEventListener('click', go, false);

async function init(){
  const SolidFileStorage=require('./bundles/solid-rest/src/file.js')
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
      "fileRoot" : FILE_ROOT
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
  // initial = new URLSearchParams(self.location.search).get("uri")
  let initial
  if (arguments && arguments[2]) { // Electron command line
    initial = arguments[2]
  }
  initial = initial || "file:///public/"
  if (initial) {
    uriField.value = initial
  } else {
    console.log('ready for user input')
  }
  // go() // load initial
  go2web(START_PAGE) // load about page
}
init()
