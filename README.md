# data-kitchen
The solid databrowser technology as a stand-alone electron app

This is an early version of using NSS as the engine.

## Installation & Usage
```
git clone -b dk-nss https://github.com/jeff-zucker/data-kitchen;
cd data-kitchen;
npm install;
npm run start
```
This will open NSS inside Electron.  Register a User and Login.  To see other parts of your file system, in the console, change into the pods folder and the folder for your user.  In that folder create a symlink to any other folder and now when you login, you will see that folder and its descendants listed.

For example if you are user alice and want to browse /home/alice, do something like this:  
```
  cd INSTALL_FOLDER/pods/alice.localhost
  ln -s /home/alice home
```











