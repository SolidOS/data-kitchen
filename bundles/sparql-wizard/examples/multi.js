const auth=require('solid-auth-cli')
const RDFeasy = require('../')
const rdf = new RDFeasy(auth)

const account      = "https://jeffz.solid.community"
const profile      = account + "/profile/card"
const container    = account + "/public/Music/"
const worldArtists = "file://"+process.cwd()+"/examples/artists.ttl"
const artists2     = "file://"+process.cwd()+"/examples/artists2.ttl"
const givenUrl     = account + "/public/"
const newDoc       = account + "/public/test/newDoc.ttl"

async function main(){

  let results = await rdf.query([worldArtists,artists2],`
      SELECT  ?n WHERE {
        ?s ?p mo:MusicArtist; rdfs:label ?n.
      }
  `)
   for(var r of results){console.log(r.n)}

}
main()
