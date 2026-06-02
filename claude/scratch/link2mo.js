import { readFileSync, writeFileSync } from 'fs';

const prefixes = `
@prefix mo: <http://purl.org/ontology/mo/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

function parseUILink(text) {
  const links = [];
  const linkPattern = /<([^>]+)>\s+a\s+ui:Link;([^.]+)\./gs;
  
  let match;
  while ((match = linkPattern.exec(text)) !== null) {
    const subject = `<${match[1]}>`;
    const props = match[2];
    
    const link = { subject };
    
    const formatMatch = /dct:format\s+"([^"]+)"|dct:format\s+<([^>]+)>/i.exec(props);
    if (formatMatch) link.format = formatMatch[1] || formatMatch[2];
    
    const subjectMatch = /dct:subject\s+<([^>]+)>/i.exec(props);
    if (subjectMatch) link.genre = `<${subjectMatch[1]}>`;
    
    const labelMatch = /ui:label\s+"([^"]+)"/i.exec(props);
    if (labelMatch) link.label = labelMatch[1];
    
    const hrefMatch = /ui:href\s+<([^>]+)>/i.exec(props);
    if (hrefMatch) link.href = `<${hrefMatch[1]}>`;
    
    links.push(link);
  }
  
  return links;
}

function convertUILinkToMORelease(link) {
  const artistURI = `<urn:artist:${encodeURIComponent(link.label)}>`;
  const recordURI = `<urn:record:${link.subject.replace(/[<>]/g, '')}>`;
  
  return `
${link.subject} a mo:Release ;
    dc:title "${link.label}" ;
    foaf:maker ${artistURI} ;
    mo:genre ${link.genre} ;
    mo:record ${recordURI} .

${recordURI} a mo:Record ;
    mo:available_as ${link.href} .

${link.href} a mo:AudioFile ;
    dc:format "${link.format}" .

${artistURI} a mo:MusicGroup ;
    foaf:name "${link.label}" .

${link.genre} a mo:Genre .
`;
}

function convertFile(inputPath, outputPath) {
  const input = readFileSync(inputPath, 'utf-8');
  const links = parseUILink(input);
  
  let output = prefixes + '\n';
  
  for (const link of links) {
    output += convertUILinkToMORelease(link);
  }
  
  writeFileSync(outputPath, output.trim(), 'utf-8');
  console.log(`Converted ${links.length} records from ${inputPath} to ${outputPath}`);
}

const [inputFile, outputFile] = process.argv.slice(2);

if (!inputFile || !outputFile) {
  console.error('Usage: node converter.js <input.ttl> <output.ttl>');
  process.exit(1);
}

convertFile(inputFile, outputFile);
