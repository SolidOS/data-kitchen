# ![data-kitchen-logo](./assets/icons/dk-64.png) Solid Data Kitchen - pod in a box

<b style="color:red">Work In Progress</b> - everything should work but help may be sketchy.

This native app for Linux, Windows, Mac, and Android turns your computer, phone, or tablet into a Solid pod only you can access. It mounts a local version of Pivot/CSS, a proxy server and the Data-Kitchen frontend. Data Kitchen comes pre-loaded with dozens of Solid apps and widgets including SolidOS and a variety of open source resources - players for the Internet Archive and Wikimedia, access to Mastodon, Peertube, and more.

No setup or install needed, just download and run. Downloads for all platforms are on the [releases page](https://github.com/SolidOS/data-kitchen/releases/latest).

## Features

* A plugin system : mount apps and widgets by drag and drop
* A dual-panel pod browser
  * simultaneous logins to multiple WebIDs
  * drag & drop to copy & move between pods
  * login auth saved in your OS's keychain - login once, then nevermore
  * live visual graphs for RDF, Markdown, and Mermaid
* Entire UI is saved as RDF and is editable through forms
  * All menus, buttons, and interactions in the UI shell are user customizable
  * No RDF or coding knowledge is required of the end user
  * Forms can be auto-generated from SHACL using solid-ui forms
  * Form submissions are self-validating against the SHACL 
* App checks for new releases at startup and offers to update itself
* Showcase of dozens of Solid apps that work on local and remote pods without download
* Access to over a quarter of million open culture items

## Special Note on Logging-In

The local pod is protected by the electron/flutter router which sits in front of a pivot/css that does not require authentication.  The protection comes from the router, not from login authenticatin.  All apps still need to be manually authorized but the login itself is a dummy. This works seamlessly for Data Kitchen native apps like the Data Kitchen Pod Browser, but other apps may need to observe a login flow.  If an app asks you for a login to your Data Kitchen Pod, use these values:
```
user: me@dk.local
pass: !secret
```

## Android (experimental)

An Android port lives in [`mobile/`](mobile/) — a Flutter app that runs the same
CSS/pivot pod + router + proxy on the phone (via nodejs-mobile) and renders
either the dk shell or the SolidOS/mashlib databrowser in a WebView. See
[`mobile/README.md`](mobile/README.md).

## Troubleshooting

** The main log file is `dk.log`.** Every line the app and its bundled servers print is mirrored here, timestamped — this is the file to attach to any bug report. Locations:

- Linux: `~/.config/data-kitchen/dk.log`
- Windows: `C:\Users\<you>\AppData\Roaming\data-kitchen\dk.log`
- macOS: `~/Library/Application Support/data-kitchen/dk.log`

The previous run is kept alongside as `dk.log.old`, so a crash-then-relaunch doesn't destroy the evidence.

## Acknowledgements

Many thanks to Alain Bourgeois (@bourgeoa) for debugging assistance.

## Transparency

Although most of this app was designed prior to my use of AI, this version includes refactoring and new code created using a carefully monitored claude Opus 4.8.

## License

MIT (c) 2019,2026, Jeff Zucker
