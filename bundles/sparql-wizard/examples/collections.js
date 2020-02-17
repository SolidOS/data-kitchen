const auth=require('solid-auth-cli')
const $rdf = require('rdflib')
const RDFeasy = require('../src')
const rdf = new RDFeasy(auth)

const resource = "https://jeffz.solid.community/public/test/col.ttl"

async function main(){
  await auth.login()

  const store = $rdf.graph();
  const fetcher = $rdf.fetcher(store,{fetch:auth.fetch});
  const s = $rdf.sym(resource)
  const p = $rdf.sym(resource+"#mentions")
  const o1 = ["apple","banana"]
  const o2 = ["pear","peach"]
  store.add( s,p,o1 )
  fetcher.putBack(resource)
  let stmts = store.match(s,p)
  console.log(stmts[0].object.elements)
  store.remove( s,p,o1 )
  store.add( s,p,o2 )
  stmts = store.match(s,p)
  console.log(stmts[0].object.elements)
// console.log(await $rdf.serialize(s.uri, store, s.uri, 'text/turtle')); 
return

  await rdf.createOrReplace( resource, `
      @prefix : <#>.
      <> :mentions ("banana" "apple" "cherry").
  `)
  let collection = await rdf.query( resource, 
      `SELECT ?c ?d ?e WHERE { <> :mentions ?c ?d.}`
  )
console.log(await rdf.query(resource))
  for(co of collection)( console.log(co.c,co.d,co.e) )
}
main()
