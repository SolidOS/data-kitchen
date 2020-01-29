### Change in interface

* Viewing local files is now relative to a fileRoot which defaults to
  the myPod folder in your local install.  So if your install is
  in /home/me/data-kitchen/ the default fileRoot will be 
  "/home/me/data-kitchen/myPod" and a request
  for file:///public/ will look in /home/me/data-kitchen/myPod/public/.
  If you modify the fileRoot in renderer.js to "/home/me" a request
  for file:///public/ will look in /home/me/public.  (TBD - read this 
  from a config file)


### These things currenlty work using the dataBrowser in file: and app: spaces

* read and recognize profile and preferences
* modify .acl via the sharing pane
* read and display containers and resources
* create new containers and resources

### These things currenlty do NOT work in file: and app: spaces

* display of source and other panes - currently behaves as not logged in or not authorized ... maybe I should create a simulated login for local? or have panes-ui behave as if logged in for local (but where do that?).  Note : the green plus shows all panes and supports creating resources & containers in the file: and app: spaces.

### Question

* Do we want to lift the requirement in rdflib.updateManager that a localfile needs to have a "machineEditable" triple?

### Here's how my fork differs from solid/data-kitchen

* uses mashlib from panes 3.0.1 rather 2.0.2
* uses an updated (and not yet npm'd) solid-rest
  * see renderer.js.init for details of configuring solid-rest
* mashlib is changed as follows:
  * solid.auth.client has a patch to send file and app fetches to solid-rest
  * solid-ui.authn.offlineTestID handles file and app similar to localhost
  * rdflib.updateManager  handles file and app similar to localhost
