// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// All of the Node.js APIs are available in this process.

console.log('renderer.js')
console.log('renderer.js panes ' + panes)

const ele = document.getElementById('solid-panes-version')

if (ele && panes.versionInfo) {
  ele.textContent = panes.versionInfo.npmInfo['solid-panes']
}

var remote = require('electron').remote // a la https://stackoverflow.com/questions/30815446/how-to-pass-command-line-argument-in-electron
var arguments = remote.getGlobal('commandlineArgs')
const redirectUrl = remote.getGlobal('redirectUrl')
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
let initial
if (arguments && arguments[2]) { // Electron command line
  initial = arguments[2]
}
// initial = new URLSearchParams(self.location.search).get("uri")
if (initial) {
  uriField.value = initial
  go()
} else {
  console.log('ready for user input')
}

// Add the Login Buttons
const loginButtonArea = document.getElementById("loginButtonArea");
UI.authn.authSession.handleIncomingRedirect({
  url: redirectUrl,
  restorePreviousSession: true,
}).then(() => {
  if (!UI.authn.authSession.info.isLoggedIn) {
    // HACK This is a really ugly way to add a login box.
    // TODO make it prettier
    loginButtonArea.appendChild(UI.authn.loginStatusBox(document, null, {}))
  }
})
UI.authn.authSession.onLogin(() => {
  loginButtonArea.innerHTML = '';
  loginButtonArea.appendChild(UI.authn.loginStatusBox(document, null, {}))
  // HACK doing this doesn't automatically refresh pages. But, it doesn't work
  // in the previous version of the data browser, so for now I'm moving on
  // To test this, navigate to a folder view, then log in. It will not automatically
  // redirect
  go()
})
UI.authn.authSession.onSessionRestore(() => {
  loginButtonArea.innerHTML = '';
  loginButtonArea.appendChild(UI.authn.loginStatusBox(document, null, {}))
  go()
})
