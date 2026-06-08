import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--disable-gpu'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
await page.goto('http://localhost:8081/', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 3500));
await page.evaluate(() => document.querySelector('sol-button[name=Settings]').shadowRoot.querySelector('.sol-button-trigger').click());
await new Promise(r => setTimeout(r, 3500));
const diag = await page.evaluate(() => {
  const kb = window.solidLogic.store;
  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const UI = 'http://www.w3.org/ns/ui#';
  return {
    statements: kb.statements.length,
    classOfColorScheme: kb.statements.filter(s => s.subject.value === UI + 'ColorScheme').map(s => s.predicate.value + ' → ' + s.object.value),
    instancesByType: kb.statements.filter(s => s.predicate.value === RDF_TYPE && s.object.value && s.object.value.startsWith(UI)).map(s => s.subject.value + ' a ' + s.object.value),
    typesAll: [...new Set(kb.statements.filter(s => s.predicate.value === RDF_TYPE).map(s => s.object.value))].slice(0, 20),
    samplePrefsTriples: kb.statements.filter(s => s.subject.value.includes('dk-prefs')).map(s => s.subject.value + ' ' + s.predicate.value + ' ' + s.object.value),
  };
});
console.log(JSON.stringify(diag, null, 2));
await browser.close();
