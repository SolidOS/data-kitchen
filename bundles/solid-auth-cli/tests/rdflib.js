#!/usr/bin/env node
const solid   = { auth:require('solid-auth-cli') }
const $rdf    = require('rdflib')
const store   = $rdf.graph()                 
const fetcher = $rdf.fetcher(store,{fetch:solid.auth.fetch})

var file = "https://jeffz.solid.community/profile/card#me"
var expected_predicate = store.sym("http://xmlns.com/foaf/0.1/name")
var expected_object    = store.literal("Jeff Zucker")

solid.auth.login().then( session => {
    fetcher.load(file).then(function(response) {
        var ok = store.each(store.sym(file),expected_predicate,expected_object)
        if(ok.length) console.log("ok");
        else console.log("fail : got something but not the right thing.")
    },e => console.log("Error fetching : "+e))
},e => console.log("Error logging in : "+e))

/* END */
