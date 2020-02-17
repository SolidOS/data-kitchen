"use strict";

const N3 = require('n3');
const newEngine = require('@comunica/actor-init-sparql-rdfjs').newEngine;

const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

class RdfQuery {

  constructor(auth) {
    this._fetch = auth.fetch;
    this.parser = new N3.Parser();
    this.store = new N3.Store();
    this._prefixStr = this._getPrefixes();
    this.comunica = newEngine();
  }

  setPrefix(prefix, url) {
    this.prefix[prefix] = url;
  }
  getPrefix(prefix) {
    return this.prefix[prefix];
  }

  async value(dataUrl, sparqlStr) {
    return await this.query(dataUrl, sparqlStr, "want1");
  }

  _prepSparql(source, sparql) {
    if (!sparql) sparql = "SELECT * WHERE {?subject ?predicate ?object.}";
    sparql = sparql.replace(/\<\>/, "<" + source + ">");
    sparql = `PREFIX : <${source}#>\n` + this._prefixStr + sparql;
    return sparql;
  }

  async query(dataUrl, sparqlStr, wanted) {
    return new Promise(async resolve => {
      sparqlStr = this._prepSparql(dataUrl, sparqlStr);
      if (Array.isArray(dataUrl)) {
        return await this._multiQuery(dataUrl, sparqlStr, wanted);
      }
      let store = this.store;
      if (dataUrl) {
        dataUrl = dataUrl.replace(/#[^#]*$/, '');
        this.store = new N3.Store();
        store = await this.loadFromUrl(dataUrl);
      }
      const queryCfg = {
        sources: [{ type: "rdfjsSource", value: this.store }],
        baseIRI: dataUrl
        //    sparqlStr = `PREFIX : <#>\n` + this._prefixStr + sparqlStr
      };const result = await this.comunica.query(sparqlStr, queryCfg);

      var allData = [];
      result.bindingsStream.on('data', data => {
        let rec = {};
        for (var v of result.variables) {
          if (wanted === "want1") return resolve(data.get(v).value);
          rec[v.replace(/^\?/, '')] = data.get(v).value;
        }
        allData.push(rec);
      });
      result.bindingsStream.on('end', data => {
        return resolve(allData);
      });
    });
  }

  async loadFromString(string, url) {
    return new Promise(async resolve => {
      await this._load(string, url);
      return resolve(this.store);
    });
  }

  async load(url) {
    let store = await this.loadFromUrl(url);
    store.query = this.query;
    return store;
  }

  async loadFromUrl(url) {
    const res = await this._fetch(url);
    if (!res.ok) {
      throw res;
    }
    const string = await res.text();
    this.store = await this._load(string, url);
    return this.store;
  }

  async _load(string, url) {
    return new Promise(async resolve => {
      let quads = await this._parse(string, url);
      this.store.addQuads(quads);
      return resolve(this.store);
    });
  }

  async _parse(string, url) {
    let store = [];
    const parser = new N3.Parser({ baseIRI: url });
    return new Promise(async resolve => {
      parser.parse(string, (err, quad, prefixes) => {
        if (quad) {
          store.push(quad);
        }
        if (err) return resolve(err);
        resolve(store);
      });
    });
  }

  async createOrReplace(url, turtle, rdfType = "text/turtle") {
    try {
      await this._fetch(url, {
        method: "PUT",
        body: turtle,
        headers: { "Content-Type": rdfType }
      });
    } catch (err) {
      throw err;
    }
  }

  async update(url, sparql) {
    try {
      return await this._fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: sparql
      });
    } catch (err) {
      throw err;
    }
  }

  /**
   *  lifted from solid-namespace package
   */
  _getPrefixes() {
    let aliases = {
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
      xsd: 'http://www.w3.org/2001/XMLSchema#'
    };
    let prefixStr = "";
    for (var a in aliases) {
      prefixStr = prefixStr + `PREFIX ${a}: <${aliases[a]}>\n`;
    }
    this.prefix = aliases;
    return prefixStr;
  }

}

module.exports = RdfQuery;
// export default RdfQuery