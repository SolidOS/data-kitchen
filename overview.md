# An RDF based architecture for code-free, user-managed UI and plugins

If we use RDF to store an app's configuration settings and its interactive UI elements and we use SHACL to auto-generate forms for each of those, we gain the ability to let users do extensive customizations entirely through forms, i.e. code-free. If we further apply the same RDF/SHACL/form-generation approach to plugins, users gain the ability to directly customize a variety of widgets and apps.

We can think of an app as a host and its interactive UI as a way of activating plugins - smaller bits of code that perform specific functions. Thinking of it this way allows us to look at plugins as things user can add to or remove from the host app and customize in other ways. What follows is a description of shapes that can be used to integrate plugins with host apps.

These shapes are meant to support host apps in which

* interactive UI elements including plugins, menus, buttons, etc are stored in RDF and shaped by SHACL
* all user actions are through the UI and forms, no coding or RDF knowledge required
* users can add, edit, categorize, and remove plugins in a personal plugin catalog
* users can associate plugins in the catalog with a host app UI element (menu,tab,button,etc.) which will activate them
* users can decide where the activated plugin is displayed (inline,iframe,floating window,modal,etc.)
* there is support for  integration of the plugin's help and data-entry into a unified help/data-entry system

[Solid Data Kitchen](https://github.com/SolidOS/data-kitchen#-solid-data-kitchen---pod-in-a-box) is a complete working example of a host app matching this decription and using the shapes.  In particular look at the Customize page (click hamburger menu in upper right) which presents a drag and drop plugin manager and the Settings page (same hamburger menu) which presents an integrated configuration manager for a number of plugins.

## The informal discussion below is based on these formal elements :
* [The ui: ontology](https://www.w3.org/ns/ui) — the terms used here were [merged into the W3C namespace](https://github.com/w3c/ns/pull/35) on 2026-07-21
* [The Menu and Plugin Shapes in SHACL](https://github.com/jeff-zucker/sol-components/blob/main/shapes/menu.shacl)

**Issues and PRs related to the UI as RDF approach outlined here should be filed against those resources.**

The Menu and Plugin shapes are also available as [SHACLC](https://github.com/jeff-zucker/sol-components/blob/main/shapes/menu.shaclc)

See also
* [An example plugin catalog following the shape](https://github.com/SolidOS/data-kitchen/blob/main/ui-data/data-kitchen-plugins-catalog.ttl)

## The Menu Shape

### `rdf:type ui:Menu`
Exactly one - A collection of named actions which may be displayed as a visual menu or set of tabs or other UI.

### `ui:label`
Exactly one - The display label for the menu.

### `ui:orientation`
Exactly one - The orientation of the menu; a `ui:Orientation` instance e.g. `ui:Vertical`

### `ui:region`
Zero or one - The target for menu items; a `ui:Region` instance e.g. `ui:Modal`. Note: it should be expected that a menu or tab component will have its own display region which will be, by default, where its items are displayed when selected.  This predicate is for situations in which the user wants to override the default and send menu output elsewhere. This predicate can also occur on menu items to override that item's display region rather than the whole menu.

### `schema:itemListElement`
Zero or more - The menu items.  Each one points at either a `ui:Menu` (a submenu of the menu it occurs in) or a `ui:Plugin` (an action to be performed).  Note : when ordered, menus are stored with positioned slots for each item rather than as an rdf first-rest Collection.  This means that changes in order are atomic and can be handled with patch rather than needing to PUT the entire file.

## The Plugin Shape

### `rdf:type ui:Plugin` 
Exactly one - A plugin is a widget or app that can be called from a host app either by importing an external URL, by running an internal command, or by adding a custom element (web component) to the DOM.

### `schema:additionalType`
Exactly one, must be one of
* `ui:Link`      (plugin loads by including an external IRI e.g. in an iframe or via transclusion)
* `ui:Command`   (plugin loads by executing a command in the host script)
* `ui:Component` (plugin loads by including a custom-element web component)

### `schema:url`
Exactly one - the plugin's IRI. In the case of a `ui:Command`, the IRI should point to an RDF document containing the app's command registry as a fragment; e.g. `https://example.com/commands.ttl#help` might point at a showHelp() function. The actual call to the command is not externally available.

### `schema:additionalProperty`
Zero or more - parameters used to refine the plugin. The range of this predicate is `schema:PropertyValue`, which is made up of `schema:name` and `schema:value`. These key/value pairs can be used by the host app to send parameters to a command or script or pre-populate attributes for a component.

### `ui:label`
A string, exactly one, required - the display name of the plugin on menus and buttons.

### `ui:icon`
An IRI, optional, at most one.

### `schema:description`
A string, optional, at most one - a brief description of the plugin

###	`schema:keywords`
A string, zero or more - tags or topics associated with the plugin

### `dcterms:publisher`
Exactly one, required - name of component's publisher/maintainer

### `schema:softwareHelp`
Zero or one - IRI of the plugin's HTML help page. When provided, the host can integrate the plugin's help with other parts of the host's help system.

### `dcterms:conformsTo`
Zero or one - IRI of SHACL shape of the plugin's data.  When provided, the host can auto-generate forms for the plugin's settings and other data.

### `dcterms:references`
Zero or one - IRI of the plugin's RDF data storage. When provided, the storage location for auto-generated forms.

### `dcterms:source`
Zero or one - IRI of the plugin's manifest, if it has one.

## How the shapes can be used

A plugin record matching the shape described above can be used to

* populate a description card supporting a user managed plugin-picker
* populate a menu or button label
* respond to host UI actions
    * activate the plugin, passing its parameters
	* display the plugin's help page
	* call up the plugin's settings/data-entry form (auto-generated)
* support user customization
    * choose which menu or button the plugin is assoiated with
	* choose what region the activated plugin is shown in
	* assign it a new label or icon
	* change where its data is stored
