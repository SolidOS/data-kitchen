const auth=require('solid-auth-cli')
const RDFeasy = require('../src')
const rdf = new RDFeasy(auth)

const account      = "https://jeffz.solid.community"
const profile      = account + "/profile/card"
const container    = account + "/public/Music/"
const worldArtists = "file://"+process.cwd()+"/examples/artists.ttl"
const givenUrl     = account + "/public/"
const newDoc       = account + "/public/test/newDoc.ttl"

async function main(){
  await auth.login()
  let url = "https://jeffz.solid.community/public/test/collection.ttl"
 
  await rdf.createOrReplace( url, 
      `@prefix : <#>.:thing :contains ("foo" "bar" "baz").`
  )
  await rdf.update( url, 
`		    
DELETE {
  ?list }
}
`
  )
  let results = await rdf.query( url,`
      SELECT ?member WHERE { ?list rdf:first ?member. }
  `)
   for(r of results){ console.log(r.member)}
//      SELECT * WHERE { ?list rdf:first ?member. }
//      `DELETE DATA { ?list rdf:first ?member. }`
//   console.log(results)
//      SELECT * WHERE { ?list rdf:rest*/rdf:first ?member . }
//      SELECT ?member WHERE { :thing :contains ?member . }  
//      SELECT * WHERE { ?list rdf:first ?member . }

}
main()

// SELECT * WHERE {  ?list rdf:rest*/rdf:first ?member . }
