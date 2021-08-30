const auth=require('solid-auth-cli')
const RDFeasy = require('../src')
const rdf = new RDFeasy(auth)

async function main(){
  let session = await auth.login()
  let profile = session.webId.replace(/#[^#]*$/,"")
  /* 
   * open the profile associated with the user's webId
   * find the user's preferencesFile location
   * open the preferencesFile, find the user's email address
   */
  let prefs = await rdf.value( profile, `SELECT ?p WHERE { 
      :me space:preferencesFile ?p. 
  }`)
  console.log( await rdf.value( prefs, `SELECT ?m WHERE {
      <${profile}#me> foaf:mbox ?m.
  }` ) )
}
main()
