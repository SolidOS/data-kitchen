module.exports.sparqlExamples =
[{ description: '<nothing selected>', endpoint: '', options: {}, sparqlText: ''},

{ description: 'Chart Bar (Japanese Prefecture Area)', endpoint: 'https://dbpedia.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX yago: <http://dbpedia.org/class/yago/>
PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>

SELECT ?pref ?area
WHERE {
  ?s a yago:WikicatPrefecturesOfJapan ;
     rdfs:label ?pref ;
     dbpedia-owl:areaTotal ?area_total .
  FILTER (lang(?pref) = 'en')
  BIND ((?area_total / 1000 / 1000) AS ?area)
}
ORDER BY DESC(?area)`},

{ description: 'Chart Pie (Japanese Prefecture Area)', endpoint: 'https://dbpedia.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX yago: <http://dbpedia.org/class/yago/>
PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>

SELECT ?pref ?area
WHERE {
  ?s a yago:WikicatPrefecturesOfJapan ;
     rdfs:label ?pref ;
     dbpedia-owl:areaTotal ?area_total .
  FILTER (lang(?pref) = 'en')
  BIND ((?area_total / 1000 / 1000) AS ?area)
}
ORDER BY DESC(?area)
`},

{ description: 'Graph Force (History of programming languages)', endpoint: 'https://dbpedia.org/sparql', options: {}, sparqlText: 'https://dbpedia.org/sparql', options: {}, sparqlText: `# https://en.wikipedia.org/wiki/History_of_programming_languages
# https://en.wikipedia.org/wiki/Perl
# http://dbpedia.org/page/Perl
# http://dbpedia.org/sparql

PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
PREFIX dbpprop: <http://dbpedia.org/property/>
PREFIX dbpedia: <http://dbpedia.org/resource/>

SELECT DISTINCT ?lang1 ?lang2 ?lang1label ?lang2label ?lang1value ?lang2value ?lang1year ?lang2year
WHERE {
?lang1 rdf:type dbpedia-owl:ProgrammingLanguage ;
        rdfs:label ?lang1name ;
        dbpprop:year ?lang1year .
?lang2 rdf:type dbpedia-owl:ProgrammingLanguage ;
        rdfs:label ?lang2name ;
        dbpprop:year ?lang2year .
?lang1 dbpedia-owl:influenced ?lang2 .
FILTER (?lang1 != ?lang2)
FILTER (LANG(?lang1name) = 'en')
FILTER (LANG(?lang2name) = 'en')
BIND (replace(?lang1name, " .programming language.", "") AS ?lang1label)
BIND (replace(?lang2name, " .programming language.", "") AS ?lang2label)
FILTER (?lang1year > 1950 && ?lang1year < 2020)
FILTER (?lang2year > 1950 && ?lang2year < 2020)
# To render older language larger than newer
BIND ((2020 - ?lang1year) AS ?lang1value)
BIND ((2020 - ?lang2year) AS ?lang2value)
}`},

{ description: 'Graph Sankey ()', endpoint: 'https://dbpedia.org/sparql', options: {}, sparqlText: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
PREFIX dbpprop: <http://dbpedia.org/property/>
PREFIX dbpedia: <http://dbpedia.org/resource/>

SELECT DISTINCT ?parent ?parent_name ?child ?child_name
WHERE {
  VALUES ?root { dbpedia:Fortran }
  ?root   rdf:type dbpedia-owl:ProgrammingLanguage ;
          rdfs:label ?root_label .
  ?parent rdf:type dbpedia-owl:ProgrammingLanguage ;
          rdfs:label ?parent_label ;
          dbpprop:year ?parent_year .
  ?child  rdf:type dbpedia-owl:ProgrammingLanguage ;
          rdfs:label ?child_label ;
          dbpprop:year ?child_year .
  ?root   dbpedia-owl:influenced* ?child .
  ?parent dbpedia-owl:influenced ?child .
  FILTER (?parent_year > 1950 && ?parent_year < 2020)
  FILTER (?child_year > 1950 && ?child_year < 2020)
  FILTER (?parent_year < ?child_year)
  FILTER (?root != ?child)
  FILTER (?parent != ?child)
  FILTER (LANG(?root_label) = 'en')
  FILTER (LANG(?parent_label) = 'en')
  FILTER (LANG(?child_label) = 'en')
  BIND (replace(?parent_label, " .programming language.", "") AS ?parent_name)
  BIND (replace(?child_label, " .programming language.", "") AS ?child_name)
}
`},

{ description: 'Map Named (Japanese Prefecture Area)', endpoint: 'https://dbpedia.org/sparql', options: {}, sparqlText: `PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX yago: <http://dbpedia.org/class/yago/>

SELECT DISTINCT ?s ?label ?population ?area (?density AS ?size)
WHERE {
  ?s a yago:WikicatPrefecturesOfJapan ;
     rdfs:label ?label ;
     dbpedia-owl:populationTotal ?population ;
     dbpedia-owl:areaTotal ?area .
  BIND (xsd:float(?population)/xsd:float(?area/1000000) AS ?density)
  FILTER (lang(?label) = 'ja' )
}
ORDER BY DESC(?density)
`},

{ description: 'Table Hash (Lookup SPARQL info)', endpoint: 'https://dbpedia.org/sparql', options: {}, sparqlText: `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX dbp: <http://dbpedia.org/property/>
PREFIX dbr: <http://dbpedia.org/resource/>

SELECT ?language ?description ?developer ?paradigm ?version
WHERE {
  VALUES ?language { "SPARQL"@en }
  ?s rdf:type dbo:ProgrammingLanguage ;
     rdfs:label ?language ;
     rdfs:comment ?description ;
     dbo:developer/rdfs:label ?developer ;
     dbp:paradigm/rdfs:label ?paradigm ;
     dbo:latestReleaseVersion ?version .
  FILTER (lang(?description) = 'en')
  FILTER (lang(?developer) = 'en')
  FILTER (lang(?paradigm) = 'en')
}
LIMIT 1`},

{ description: 'Chart Scatterplot (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX id_tax:<http://identifiers.org/taxonomy/>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>
PREFIX stats:  <http://togogenome.org/stats/>
PREFIX up: <http://purl.uniprot.org/core/>
PREFIX ipr: <http://purl.uniprot.org/interpro/>

SELECT DISTINCT ?organism ?label ?length ?genes (COUNT(DISTINCT ?protein) AS ?hks)
{
  {
    SELECT DISTINCT ?organism ?up_tax ?label ?length ?genes
    WHERE
    {
      # Cyanobacteria (1117)
      ?organism a tax:Taxon ;
        rdfs:subClassOf+ id_tax:1117 ;
        stats:sequence_length ?length ;
        stats:gene ?genes ;
        tax:scientificName ?label .
        BIND (IRI(REPLACE(STR(?organism), "http://identifiers.org/taxonomy/", "http://purl.uniprot.org/taxonomy/")) AS ?up_tax)
    }
  }
  ?up_tax a up:Taxon .
  ?protein up:organism ?up_tax ;
    a up:Protein .
  # Signal transduction histidine kinase (IPR005467)
  ?protein rdfs:seeAlso ipr:IPR005467 .
} GROUP BY ?organism ?label ?length ?genes ORDER BY ?length
`},

{ description: 'Tree Map (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>

SELECT DISTINCT ?root_name ?parent_name ?child_name
FROM <http://togogenome.org/graph/taxonomy>
WHERE
{
  VALUES ?root_name { "Tardigrada" }
  ?root tax:scientificName ?root_name .
  ?child rdfs:subClassOf+ ?root .
  ?child rdfs:subClassOf ?parent .
  ?child tax:scientificName ?child_name .
  ?parent tax:scientificName ?parent_name .
}
`},

{ description: 'Tree Map zoom (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX up: <http://purl.uniprot.org/core/>
PREFIX ec: <http://purl.uniprot.org/enzyme/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX taxon:<http://purl.uniprot.org/taxonomy/>

SELECT (REPLACE(STR(?root), ".*/", "") AS ?root_label)
        (REPLACE(STR(?parent), ".*/", "") AS ?parent_label)
        (REPLACE(STR(?enzyme), ".*/", "") AS ?enzyme_label)
        (COUNT(?protein) AS ?value)
FROM <http://togogenome.org/graph/uniprot>
WHERE
{
        VALUES ?root { ec:1.-.-.- }
        ?root a up:Enzyme .
        ?root skos:narrowerTransitive* ?enzyme .
        ?parent skos:narrowerTransitive ?enzyme .
        ?protein up:enzyme ?enzyme .
        # Homo sapiens (9606)
        ?protein up:organism taxon:9606
}
GROUP BY ?root ?parent ?enzyme ORDER BY ?enzyme
`},

{ description: 'Tree Sunburst (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>

SELECT DISTINCT ?root_name ?parent_name ?child_name
FROM <http://togogenome.org/graph/taxonomy>
WHERE
{
  VALUES ?root_name { "Tardigrada" }
  ?root tax:scientificName ?root_name .
  ?child rdfs:subClassOf+ ?root .
  ?child rdfs:subClassOf ?parent .
  ?child tax:scientificName ?child_name .
  ?parent tax:scientificName ?parent_name .
}
`},

{ description: 'Tree Round (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>

SELECT DISTINCT ?root_name ?parent_name ?child_name
FROM <http://togogenome.org/graph/taxonomy>
WHERE
{
  VALUES ?root_name { "Hypsibiidae" }
  ?root tax:scientificName ?root_name .
  ?child rdfs:subClassOf+ ?root .
  ?child rdfs:subClassOf ?parent .
  ?child tax:scientificName ?child_name .
  ?parent tax:scientificName ?parent_name .
}
`},
  
{ description: 'Tree Dendogram (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>

SELECT DISTINCT ?root_name ?parent_name ?child_name
FROM <http://togogenome.org/graph/taxonomy>
WHERE
{
  VALUES ?root_name { "Tardigrada" }
  ?root tax:scientificName ?root_name .
  ?child rdfs:subClassOf+ ?root .
  ?child rdfs:subClassOf ?parent .
  ?child tax:scientificName ?child_name .
  ?parent tax:scientificName ?parent_name .
}`},

{ description: 'Tree Circlepack (biohackathon/Tardigrada)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>

SELECT DISTINCT ?root_name ?parent_name ?child_name
FROM <http://togogenome.org/graph/taxonomy>
WHERE
{
  VALUES ?root_name { "Tardigrada" }
  ?root tax:scientificName ?root_name .
  ?child rdfs:subClassOf+ ?root .
  ?child rdfs:subClassOf ?parent .
  ?child tax:scientificName ?child_name .
  ?parent tax:scientificName ?parent_name .
}`},

{ description: 'Table HTML (disable CORS)', endpoint: 'http://togostanza.org/sparql', options: {}, sparqlText: `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX id_tax:<http://identifiers.org/taxonomy/>
PREFIX tax: <http://ddbj.nig.ac.jp/ontologies/taxonomy/>
PREFIX stats:  <http://togogenome.org/stats/>
PREFIX up: <http://purl.uniprot.org/core/>
PREFIX ipr: <http://purl.uniprot.org/interpro/>

SELECT DISTINCT ?organism ?label ?length ?genes (COUNT(DISTINCT ?protein) AS ?hks)
{
  {
    SELECT DISTINCT ?organism ?up_tax ?label ?length ?genes
    WHERE
    {
      # Cyanobacteria (1117)
      ?organism a tax:Taxon ;
        rdfs:subClassOf+ id_tax:1117 ;
        stats:sequence_length ?length ;
        stats:gene ?genes ;
        tax:scientificName ?label .
        BIND (IRI(REPLACE(STR(?organism), "http://identifiers.org/taxonomy/", "http://purl.uniprot.org/taxonomy/")) AS ?up_tax)
    }
  }
  ?up_tax a up:Taxon .
  ?protein up:organism ?up_tax ;
    a up:Protein .
  # Signal transduction histidine kinase (IPR005467)
  ?protein rdfs:seeAlso ipr:IPR005467 .
} GROUP BY ?organism ?label ?length ?genes ORDER BY ?length`},
];

module.exports.brokenExamples = [

{ description: 'No Turtle? Map Coord ()', endpoint: 'http://www.ebi.ac.uk/rdf/services/sparql', options: {}, sparqlText: `PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX biosd-terms: <http://rdf.ebi.ac.uk/terms/biosd/>
PREFIX sio: <http://semanticscience.org/resource/>

# Samples reporting latitude and longitude
SELECT DISTINCT ?item ?lat ?lng
WHERE {
  ?item biosd-terms:has-sample-attribute ?lat_value, ?lng_value .

  ?lat_value
    dc:type ?lat_label;
    sio:SIO_000300 ?lat . # sio:has value

  FILTER ( LCASE ( STR ( ?lat_label ) ) = "latitude" ) .

  ?lng_value
    dc:type ?lng_label;
    sio:SIO_000300 ?lng . # sio:has value

  FILTER ( LCASE ( STR ( ?lng_label ) ) = "longitude" ) .
} LIMIT 1000`},

];
