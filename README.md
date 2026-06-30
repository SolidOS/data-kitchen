# Solid Data Kitchen - pod in a box

<b style="color:red">Work In Progress</b> - everything should work but help may be sketchy.

This native electron app for Linux, Windows, and Mac turns your computer into a Solid pod only you can access. It mounts a local version of Pivot/CSS, a proxy server and the Data-Kitchen frontend. Data Kitchen comes pre-loaded with dozens of Solid apps and widgets as well as a wide variety of open source resources including players for the Internet Archive and Wikimedia, and access to Mastodon, Peertube, and many more.  

No setup or install needed, just download and run. Downloads for Linux, Windows, and macOS available at https://solidOS.github.io/data-kitchen/downloads.html

## Features

* Entire UI is saved as RDF and is editable through forms
  * All menus, buttons, and interactions in the UI shell are user customizable
  * No RDF or coding knowledge is required of the end user
  * Forms can be auto-generated from SHACL using solid-ui forms
  * Form submissions are self-validating against the SHACL 
* A plugin system lets users mount plugins by drag and drop
* Plugins can share auth, store, and other features
  * Currently with DK-browser, SolidOS, and Dokeili - login once, all three are authenticated
* A dual-panel pod browser supports
  * simultaneous logins to multiple WebIDs
  * drag & drop to copy & move between pods
  * login auth saved in your OS's keychain - login once, then nevermore
* Live visual graphs for RDF, Markdown, and Mermaid
* Import music from local files and the Internat Archive
* Listen to music while visiting any tab
* User can use home pod without logging in - it is secure behind a data-kitchen/electron gate
* User can safely browse remote pods - data-kitchen/electron firewalls external fetches - they can't reach your pod even if coming from your own machine
* Customizable native app triggers (run Claude Code or any native app with a click)
* Runs flutter apps from ANU

## Android (experimental)

An Android port lives in [`mobile/`](mobile/) — a Flutter app that runs the same
CSS/pivot pod + router + proxy on the phone (via nodejs-mobile) and renders
either the dk shell or the SolidOS/mashlib databrowser in a WebView. See
[`mobile/README.md`](mobile/README.md).

## License

MIT (c) 2019,2026, Jeff Zucker
