--------
# TO-DO
--------

CLAUDE: IGNORE EVERYTHING BELOW HERE

----------
# THOUGHTS
----------

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



