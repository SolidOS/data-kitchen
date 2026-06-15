--------
# TO-DO
--------
9. Settings expansion
For part B, I want these groupings and settings on the settings page

Data Kitchen
  color
  font
  proxy
  help document
  issuers (first one is default issuer) shld also capture add an issuer in dropdown
Data Kitchen Browser
  pathsToHide
  editKeys
Electron
  width
  height 
  position
Pivot
  port
  proxy port
  internal port
  root (changing initiates move-my-pod)

note : default tab shld not be news, it shld be whichever tab is first


CLAUDE: IGNORE EVERYTHING BELOW HERE

----------
# THOUGHTS
----------
* news: way to add new feeds, edit labels
* add Forum to Solid Resources
* rename Data Kitchen Pod Browser



customize menu item shld lead to
  a submenu that lets users add/remove tabs & actions, edit tab-action settingss, edit the electron/pivot configs

daughter app - an app that shares resources from main app

guest app - an external app displayed in main app


* To use an attribute from another component library, 
  * 1. declare in the CI script tag you want to use the attribute
'''
''
  * 2. use it
--------
# DONE
--------
8.
we currently serve CSS with an automated login/identity; however there is no concept of the pod owner; we should be provisioning a  
  pod similarly to the way community.net does; the template for the user-pod is at /home/jeff/data-kitchen-user which you have perms   
  for; so that would eventually be copied into the dk-pod folder when user names its root;  it would include profile/card and thus     
  have a webid for the user - http://localhost:port/dk-pod/profile/card#me; so this should work for mashlib - it should be able to act 
  as logged in with that webid;  it would also be nice to let other apps use the pod but thye often want to login on their own - so    
  we need the user to be able to fill in that apps login form and submit it and have it work against the localhost but with a dummy    
  password like !secret which isn't acutally used, instead the login is via the token that dk already has    

7. Refine Plugins
* the customize button should show subtabs:
  1. Define the main menu tabs
  2. Choose plugins the menu should access
* and a tab action button "save"
* 1 shld open the menu-manager
* 2 shld open plugins-manager
* plugins manager page
  * avail as is
  * remove 3rd column
  * expand 2nd column to be same size as avail
  * 2nd col should show menus and button area as drop targets containing current things in them

6. Refine plugin-manager
* use/avail should be side by side
* sol-include is not a plugin - it can't be added to a menu, it does nothing by itself
* spruce up the display - get some icons (public domain or open license only) for the components, write brief descriptions

5. Manage Plugins
* I want sol-plugins-available be its own "Manage Plugins" menu item
* It should have a "Plugins to Use" box and a "Plugins Available" box
* Users shld be able to drag between the two
* Users shld be able to drag manifests into Plugins Available
* Users shld be able to input a string of a manifest's url
* Form should auto-save
* The list of Plugins To Use is what should be in a linked but separate "Manage Menus" menu item
* Propose a plan

## 4. i want help and settings and the dropdown menu to be context sensitive to what plugin is currently in the active pane; there shld be a standard way for a plugin's manifest to point to its help file and shape file if it has one; propose solutions 
  
## 3. you totally misunderstood what i meant about the solid-resources and dev-tools - they should be plugins and
  they should have tabs on the main tabset but their submenus should be on the page loaded with the plugin


## 2. remove the home tab, news should be first and should be selected automatically if nothing else is specified as selected on startup;
* remove the SolidOS tab but not the plugin
* Solid Resources & DevTools submenus should not be part of the tabs menu, they are part of the plugin, not the chrome, so maybe have their html page should 
* lazy load media ie no music playlists until user selects music tab


## 1. data-kitchen is an electron app that packages a solid server, a proxy, and an app containing multiple subapps that access the server
it will eventually replace the current version of https://github.com/solidOS/data-kitchen, which i control

dk =  /home/jeff/solid/data-kitchen - where everything should end up, eventually a repo

other libraries dk should use

el =  /home/jeff/solid/electron - the electron/pivot/proxy code shld mv to dk/
ci =  /home/jeff/solid/component-interop - broker dk/index.html should use with script tag
sc =  /home/jeff/solid/sol-components - the components which underpin almost everything
omp = /home/jeff/solid/open_media_player - see below

el now opens to /home/jeff/data-kitchen/index.html

instead i want it to open to something that looks and feels like omp, omp will cease to exist on its own

omp has an issue it needs cleaned up - it hides html and components in its js; this shld be extracted; there and every where else inthe project should use sol-components wherever advisable and should always have their full attributes rather than have js populate them and html/text/md should be kept in html/text/md files and included with sol-include

definition: mini-app is a complex component that fulfills many functions e.g. ia-player,sol-feed with threePanel

this new index would be a sol-tab shell like omp that provides access to mini-apps

there should be visual systems that
  1. support creating a menu structure (just the names of menu items and subemenus, not what they do)
  2. support creating a button bar  (just the names of buttons, not what they do)
  3. show available miniapps, user drags and drops them into menu structure or button-bar item

script then creates the html/rdf from the resulting menu; same mechanism to edit an existing menu

I give you permission to read in all of the mentioned folders

I'd like you to create a plan for all this and to get it all into main of the dk remote repo 

If possible, ask me questions up front as I'll be going to bed and letting you work.



