const auth  = require('../../solid-auth-cli')
const SolidRest         = require('../src/rest.js')
const SolidFileStorage  = require('../src/file.js')
const rest = new SolidRest([ new SolidFileStorage() ])

// fetch = auth.fetch
// const uri = "https://jeffz.solid.community/index.html"

const uri = "file://"+process.cwd()+"/"

async function run(){
    let response = await rest.fetch(uri);
    console.log(response.headers)
    console.log(response.headers.get('content-type'))
    response = await rest.fetch(uri+"headers.js");
    console.log(response.headers)
    console.log(response.headers.get('content-type'))
}
run()
