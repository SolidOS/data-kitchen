import { readFileSync, writeFileSync } from 'fs';

function replaceBlankNodesWithUUIDs(rdfString) {
  const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  const blankNodePattern = /\[\s*\n/g;
  const closingBracketPattern = /\n\s*\]/g;
  
  const uuidMap = new Map();
  let counter = 0;
  
  let result = rdfString.replace(blankNodePattern, () => {
    const uuid = uuidv4();
    const key = `__BLANK_${counter++}__`;
    uuidMap.set(key, uuid);
    return `${key}\n`;
  });
  
  result = result.replace(closingBracketPattern, () => '.');
  
  uuidMap.forEach((uuid, key) => {
    result = result.replace(key, `<urn:uuid:${uuid}>`);
  });
  
  return result;
}

const rdfData = readFileSync('ia-music.ttl', 'utf8');
const converted = replaceBlankNodesWithUUIDs(rdfData);

writeFileSync('ia-music-converted.ttl', converted, 'utf8');
console.log('Converted file saved to ia-music-converted.ttl');
