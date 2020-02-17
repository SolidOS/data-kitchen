const auth=require('solid-auth-cli')
const SparqlWizard = require('../')
const sw = new SparqlWizard(auth)
const {sparqlExamples,brokenExamples} = require("./mark-examples.js")

async function main(){

  for( ex of sparqlExamples ){
      try{
        console.log( ex.description )
        let results = sw.query( ex.endpoint, ex.sparqlText )
        console.log( results ? results.length : "no results")
      }
      catch(e){}
  }

}
main()
