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

## Technical Details of the RDF and SHACL

Not needed for using Data Kitchen, but if you're curious, see [An RDF based architecture for code-free, user-managed UI and plugins](overview.md)

## Special Note on Logging-In

The local pod is protected by the electron/flutter router which sits in front of a pivot/css that does not require authentication.  The protection comes from the router, not from login authenticatin.  All apps still need to be manually authorized but the login itself is a dummy. This works seamlessly for Data Kitchen native apps like the Data Kitchen Pod Browser, but other apps may need to observe a login flow.  If an app asks you for a login to your Data Kitchen Pod, use these values:
```
user: me@dk.local
pass: !secret
```

## Reaching your pod from outside the app

The local pod sits behind a gate (see *Special Note on Logging-In*), so a plain
browser tab or a plain `curl` gets turned away. Two supported ways in:

### Open dk in your web browser

Right-click on a Data Kitchen page and choose **Open dk in Browser**. That opens
the running app in your normal browser, already admitted — you get the same
Data Kitchen, with your bookmarks, extensions and devtools.

The link carries a short-lived one-time nonce (`?dk-bless=…`) rather than the
gate token itself, so the durable token never lands in your browser history or
address bar. The nonce is valid for two minutes and the gate strips it from the
URL once it has set the session cookie. Re-run the menu item whenever you need a
fresh tab. Right-clicking a link — on a dk page or in an embedded external view
— also offers **Open Link in Browser** for that one link.

### `bin/dk-curl` — curl the pod from the shell

[`bin/dk-curl`](bin/dk-curl) is `curl` with the gate token attached, so you can
read and write the running pod from a terminal exactly as an app would. It
doesn't weaken the gate — it presents the same token the app injects, read from
`~/.config/data-kitchen/gate-token` (the app generates it on first run).

```sh
bin/dk-curl /dk-pod/profile/card                     # read
bin/dk-curl -i /dk-pod/dk/data/data-kitchen-settings.ttl
bin/dk-curl -X PUT -H 'content-type: text/turtle' \
            --data-binary @note.ttl /dk-pod/dk/scratch/note.ttl
bin/dk-curl -X DELETE /dk-pod/dk/scratch/note.ttl
```

The **last** argument is the target: `/dk-pod/…` (also `dk-pod/…` or
`./dk-pod/…`) resolves against `DK_BASE`, while a full `http(s)://` URL is used
as-is. Everything else passes straight through to curl, so all its flags work.
`DK_BASE` defaults to `http://localhost:8000` (the routed origin — the real
path); set `DK_BASE=http://localhost:8010` to talk to the CSS pod server
directly.

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

Many thanks to Alain Bourgeois (@bourgeoa) and Robert Kahn for debugging assistance.

## Transparency

Although most of this app was designed prior to my use of AI, this version includes refactoring and new code created using a carefully monitored claude Opus 4.8.

## License

MIT (c) 2019,2026, Jeff Zucker
