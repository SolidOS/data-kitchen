// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

const path=require('path')

console.log('renderer.js')
console.log('renderer.js panes ' + panes)

const ele = document.getElementById('solid-panes-version')

if (ele && panes.versionInfo) {
  ele.textContent = panes.versionInfo.npmInfo['solid-panes']
}

var remote = require('electron').remote // a la https://stackoverflow.com/questions/30815446/how-to-pass-command-line-argument-in-electron
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

function go ( event ) {
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
      "fileRoot" : path.join(__dirname,"/myPod")
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
  go()
}
init()
