if(typeof window==="undefined") $rdf = require('rdflib')

class RDFeasy {

  constructor(auth){
    this._prefixStr = this._getPrefixes()
    this._auth = auth
  }

  async _multiQuery(sources,query){
    this.store = $rdf.graph()
//    this.fetcher = $rdf.fetcher(this.store,{fetch:this._auth.fetch})
    this.fetcher = $rdf.fetcher(this.store)
    for(var source of sources){
      await this.fetcher.load(source)
    }
    return await this.query(null,query)
  }

  async query(dataUrl,sparqlStr){
    sparqlStr = this._prepSparql(dataUrl,sparqlStr)
    if(Array.isArray(dataUrl)) { 
      return await this._multiQuery(dataUrl,sparqlStr) 
    }
    return await this._runQuery( dataUrl, sparqlStr, "array" )
  }
  async value(source,sparql){
    sparql = this._prepSparql(source,sparql)
    return await this._runQuery( source, sparql, "value" )
  }

  async _runQuery(dataUrl,sparqlStr,outputFormat){
    try {
      if(dataUrl) await this._load(dataUrl)
    }
    catch(e){console.warn("SPARQL Fetch Error : "+dataUrl+" "+e);return []}
    let results = await this._execute(sparqlStr)
    if(outputFormat.match(/array/i)){ return results }
    else if(outputFormat.match(/value/i)) {
       if(!results || results.length < 1) return ""
       let key = ( Object.keys(results[0])[0]  )
       return( results[0][key] )
    }
  }

  async _execute(sparql){ 
    let self = this
    return new Promise(async(resolve, reject)=>{ try{
      let preparedQuery = $rdf.SPARQLToQuery(sparql,false,self.store)
      let wanted = preparedQuery.vars
      let resultAry = []
      self.store.query(preparedQuery, async(results) =>  {
        if(typeof(results)==="undefined") { reject("No results.") }
        let row = await this._rowHandler(wanted,results) 
        if(row) resultAry.push(row)
      }, {} , function(){return resolve(resultAry)} )
    }catch(e){console.warn("SPARQL Parse Error : "+e)}})
  }

  async _rowHandler(wanted,results){
    let row = {}
    for(var r in results){
      let found = false
      let got = r.replace(/^\?/,'')
      if(wanted.length){
        for(var w in wanted){
          if(got===wanted[w].label){ found=true; continue }
        }
        if(!found) continue
      } 
      row[got]=results[r].value
    }
    return(row)
  }

  _prepSparql(source,sparql){
    if(!sparql) sparql = "SELECT * WHERE {?subject ?predicate ?object.}"
    sparql=sparql.replace(/\<\>/,"<"+source+">")
    sparql = `PREFIX : <${source}#>\n` + this._prefixStr + sparql
    return sparql
  }

  async _load(url){
    this.store = $rdf.graph()
//    this.fetcher = $rdf.fetcher(this.store,{fetch:this._auth.fetch})
    this.fetcher = $rdf.fetcher(this.store)
    await this.fetcher.load(url)
  }

  async createOrReplace(url,turtle,rdfType="text/turtle"){
    try {
      await this._auth.fetch(url,{
         method: "PUT",
           body: turtle,
        headers: {"Content-Type": rdfType}
      })
    } catch (err) {
       throw err
    }
  }

  async update(url,sparql){
    try {
      return await this._auth.fetch(url,{
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: sparql
      })
    } catch (err) {
       throw err
    }
  }

 /**
  *  lifted from solid-namespace package
  */
 _getPrefixes(){
  this.expand = {
  acl: 'http://www.w3.org/ns/auth/acl#',
  arg: 'http://www.w3.org/ns/pim/arg#',
  cal: 'http://www.w3.org/2002/12/cal/ical#',
  contact: 'http://www.w3.org/2000/10/swap/pim/contact#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dct: 'http://purl.org/dc/terms/',
  doap: 'http://usefulinc.com/ns/doap#',
  foaf: 'http://xmlns.com/foaf/0.1/',
  http: 'http://www.w3.org/2007/ont/http#',
  httph: 'http://www.w3.org/2007/ont/httph#',
  icalTZ: 'http://www.w3.org/2002/12/cal/icaltzd#', // Beware: not cal:
  ldp: 'http://www.w3.org/ns/ldp#',
  link: 'http://www.w3.org/2007/ont/link#',
  linkr: 'http://www.iana.org/assignments/link-relations/',
  log: 'http://www.w3.org/2000/10/swap/log#',
  media: 'http://www.iana.org/assignments/media-types/',
  meeting: 'http://www.w3.org/ns/pim/meeting#',
  mo: 'http://purl.org/ontology/mo/',
  owl: 'http://www.w3.org/2002/07/owl#',
  pad: 'http://www.w3.org/ns/pim/pad#',
  patch: 'http://www.w3.org/ns/pim/patch#',
  qu: 'http://www.w3.org/2000/10/swap/pim/qif#',
  trip: 'http://www.w3.org/ns/pim/trip#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  rss: 'http://purl.org/rss/1.0/',
  sched: 'http://www.w3.org/ns/pim/schedule#',
  schema: 'http://schema.org/', // @@ beware confusion with documents no 303
  sioc: 'http://rdfs.org/sioc/ns#',
  solid: 'http://www.w3.org/ns/solid/terms#',
  space: 'http://www.w3.org/ns/pim/space#',
  stat: 'http://www.w3.org/ns/posix/stat#',
  tab: 'http://www.w3.org/2007/ont/link#',
  tabont: 'http://www.w3.org/2007/ont/link#',
  ui: 'http://www.w3.org/ns/ui#',
  vcard: 'http://www.w3.org/2006/vcard/ns#',
  wf: 'http://www.w3.org/2005/01/wf/flow#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
}
  let prefixStr=""
  for(var a in this.exapnd){
    prefixStr = prefixStr+`PREFIX ${a}: <${this.expand[a]}>\n`
  }
  return prefixStr
}

}

module.exports = exports = RDFeasy
