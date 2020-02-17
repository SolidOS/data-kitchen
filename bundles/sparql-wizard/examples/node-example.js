const auth=require('solid-auth-cli')
const SparqlWizard = require('../')
const sw = new SparqlWizard(auth)

const base         = "file:///var/www/html/solid/data-kitchen/myPod"
const profile      = base + "/profile/card"
const container    = base + "/public/"
const worldArtists = "file://"+process.cwd()+"/examples/artists.ttl"
const givenUrl     = base + "/public/"
const newDoc       = base + "/public/test/newDoc.ttl"

async function main(){

  // get the user name from a profile
  //
  console.log( 
    await sw.value(profile,`SELECT ?name WHERE { :me foaf:name ?name. }`) 
  )

  // log all trusted apps with Write permission
  //
  let apps = await sw.query( profile, `SELECT ?appName WHERE { 
     ?app acl:origin ?appName. 
     ?app acl:mode acl:Write.
  }`)
  for(var a of apps){ console.log(a.appName) }

  // log names of African Women Musicans from a list of world artists
  //
  let artists = await sw.query( worldArtists, `SELECT ?name WHERE { 
     ?artist mo:origin     "Africa"; 
             schema:gender "female";
             rdf:type      mo:MusicArtist;
             rdfs:label    ?name.
  }`)
  for(var a of artists){ console.log(a.name) }

  // another way to find African women artists
  //
  artists = await sw.query( worldArtists, `SELECT ?name WHERE { 
    ?arist mo:origin "Africa"; schema:gender ?gender; rdfs:label ?name.
    FILTER (?gender = "female")
  }`)
  for(var a of artists){ console.log(a.name) }

  // log the containers within a container
  //
  let files = await sw.query( container, `SELECT ?url WHERE { 
    <> ldp:contains ?url. 
    ?url rdf:type ldp:Container.
  }`)
  for(var f of files){ console.log(f.url) }

  // log the containers within a container
  //
  files = await sw.query( container, `SELECT ?url ?size WHERE { 
    <> ldp:contains ?url. 
    OPTIONAL {?url stat:size ?size.}
  }`)
  for(var f of files){ console.log(f.url,f.size) }


return
  // log all triples in a profile document (or any document)
  //
  let all_triples = await sw.query( profile )
  // for(var t of all_triples){ console.log(t.subject,t.predicate,t.object) }

}
main()
