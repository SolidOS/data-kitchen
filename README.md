# Data-Kitchen over CSS (WiP)

The Data Kitchen is a stand-alone desktop app that provides the user with a SolidOS (mashlib) Databrowser capable of private no-auth access to their own file system and also authenticated access to pods on any kind of Solid server. The current impelementation is an electron app that serves the local file system via a pre-provisioned Community-Solid-Server (CSS) with the SolidOS Databrowser as front end. See [pretty picture](./Data-Kitchen.png) if you like visuals.

**Note Bene** : This is using an unfinished, not yet fully tested branch of SolidOS that @jaxoncreed is updating to spec-compliant authentication flow. So expect (and please [report](https://github.com/solid/solidos/issues/40)) glitches.

Please ping me (@jeff-zucker) in the chat or via issue with any problems or suggestions.

## Installing
```text
git clone --branch dk-css https://github.com/solid/data-kitchen.git
change into the data-kitchen folder
npm ci
```

## Configuring
The [kitchen.json](./kitchen.json) file will eventually be JSON-LD with a solid-ui forms-based frontend.  For now it's plain JSON and you need to edit it manully.  You MUST configure the rootFilePath (the place you want to view as the root of your local files) and you may configure the port, the size and position of the initial window.  You can also set bookmarks (handy for testing on various servers).

## Running 
```text
change into the data-kitchen folder
npm start
```

## Differences from the standard Databrowser

The banner changes color depending on wether you are viewing a private offline resource, an online resource without authentication, and an online resource with authentication.

Note that local files follow local preferences set in /LocalKitchenUser/settings/prefs.ttl.  You should not be prompted for login on local files. The top menu provides bookmarks and other resources not found in the standard databrowser.
There are many more features in the works, see [checklist of currently supported and planned features](https://github.com/solid/solidos/issues/40).

## Dirty Details

If you want to look under the hood, see [kitchen.html](./ServerRoot/common/kitchen.html) (which is a version of *mashlib/dist/browse.html*) and the  [electron and CSS specific modifications](./src/).

copyright (c) 2021 Jeff Zucker, MIT license.