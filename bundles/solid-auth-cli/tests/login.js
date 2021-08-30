var solid;
if( typeof(window) === "undefined") solid = { auth:require('../src') }

/* This script works in the browser using solid-auth-client
   and on the command line using solid-auth-cli.

   For both versions, change the settings below
      idp - your IDP
      resource - a text file that requires login
      expected - text you expect to find in that file

   For browser version: 
       open test.html
   For command line:
       run node test
*/
const idp      = "https://solid.community"
const resource = "https://jeffz.solid.community/public/private/hidden.html"
const expected = "only the owner"                                 

console.log("logging in ...")
login(idp).then( session => {
    console.log(`logged in as <${session.webId}>`)
    solid.auth.fetch(resource).then( response => {
        if (!response.ok) console.log(response.status+" "+response.statusText)
        response.text().then( content => {
            if( content.match(new RegExp(expected)) ) console.log("ok")
            else console.log("Got something , but not the right thing.")
        },e => console.log("Error parsing : "+e))
    },e => console.log("Error fetching : "+e))
},e => console.log("Error logging in : "+e))

async function login(idp) {
    session = await solid.auth.login(idp)
    if(session) return(session)
    else throw new Error()
}
