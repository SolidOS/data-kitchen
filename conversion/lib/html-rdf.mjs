/**
 * html-rdf — shared mappings for the HTML ⇄ RDF UI-config bridge
 * (claude/plans/PLAN-html-src-of-truth.md). One place defines the correspondence
 * so both directions (and the round-trip check) agree:
 *
 *   <sol-tabs> anchors          ⇄  ui:Menu of ui:Component tab parts
 *   <sol-dropdown-button><menu> ⇄  ui:Menu of command/link items (+ acl:Write)
 *   <sol-default> attrs          →  ui:colorScheme/ui:fontSize/ui:proxy
 *
 * Shape passed around: { tabs:[{local,label,name,attrs:[[k,v]…]}], tabsLabel,
 *   menu:{label, items:[{name,href,label,write}]}, settings:{theme,fontsize,proxy} }
 */
import puppeteer from 'puppeteer-core';
import rdflib from 'rdflib';

export const UI = 'http://www.w3.org/ns/ui#';
export const ACL = 'http://www.w3.org/ns/auth/acl#';
export const SCHEMA = 'http://schema.org/';

export const lit = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const attrKey = ([k]) => k;
const sortAttrs = (a) => [...a].sort((x, y) => attrKey(x).localeCompare(attrKey(y)));
/** Normalise a config shape for order-independent comparison (round-trip check). */
export function normalize(d) {
  return {
    tabsLabel: d.tabsLabel,
    tabs: (d.tabs || []).map((t) => ({ local: t.local, label: t.label, name: t.name, attrs: sortAttrs(t.attrs) })),
    // The ⋮ is dual-role: its menu is an inline <menu> in HTML and a `source`/
    // `data-from-rdf` pointer in RDF. Drop that pointer for comparison — the menu
    // itself is verified separately at the data level.
    actions: (d.actions || []).map((a) => ({
      tag: a.tag, label: a.label,
      attrs: sortAttrs(a.tag === 'sol-dropdown-button' ? a.attrs.filter(([k]) => k !== 'source' && k !== 'data-from-rdf') : a.attrs),
    })),
    menu: d.menu ? { label: d.menu.label, items: d.menu.items.map((i) => ({ name: i.name || null, href: i.href || null, label: i.label, write: !!i.write })) } : null,
    settings: d.settings || null,
  };
}

/** Deterministic local name for an action subject (from its omp-* class, else tag). */
function actionLocal(action, used) {
  const cls = (action.attrs.find(([k]) => k === 'class')?.[1] || '').split(/\s+/).find((c) => c.startsWith('omp-'));
  let base = (cls ? cls.replace(/^omp-/, '') : action.tag.replace(/^sol-/, '')) || 'action';
  base = base.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  let name = base, i = 2;
  while (used.has(name)) name = base + (i++);
  used.add(name);
  return name;
}

// ── HTML → shape (inert DOMParser in a headless page; no element upgrade) ────
export async function extractFromHtml(htmlText) {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    return await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const tabsEl = doc.querySelector('sol-tabs');
      const tabs = tabsEl ? [...tabsEl.querySelectorAll(':scope > a[href]')].map((a) => {
        const attrs = [];
        if (a.getAttribute('id')) attrs.push(['id', a.getAttribute('id')]);
        for (const at of [...a.attributes]) {
          if (!at.name.startsWith('data-')) continue;
          if (at.name === 'data-handler' || at.name === 'data-tab-id') continue;
          attrs.push([at.name.slice(5), at.value]);
        }
        attrs.push(['source', a.getAttribute('href')]);
        return { local: a.getAttribute('data-tab-id') || a.getAttribute('id'), label: (a.textContent || '').trim(), name: a.getAttribute('data-handler') || '', attrs };
      }) : [];
      const tabsLabel = (tabsEl && tabsEl.getAttribute('label')) || (doc.querySelector('title')?.textContent || '').trim() || 'Tabs';
      // Toolbar action launchers: the non-anchor children of <sol-tabs> (the
      // ?/A/🌙/<sol-login>/⋮ controls). tag → ui:name, direct text → ui:label,
      // every attribute → ui:attribute (+ a slot="actions" marker added on emit).
      const directText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
      const actions = tabsEl ? [...tabsEl.children]
        .filter((el) => el.matches('[slot="actions"]') || !el.matches('a[href]'))
        .map((el) => ({ tag: el.tagName.toLowerCase(), label: directText(el), attrs: [...el.attributes].map((a) => [a.name, a.value]) }))
        : [];
      const dd = doc.querySelector('sol-dropdown-button');
      let menu = null;
      if (dd) {
        const gateAll = dd.hasAttribute('if-logged-in');
        const label = dd.getAttribute('title') || dd.getAttribute('aria-label') || dd.getAttribute('label') || 'Menu';
        const items = [...dd.querySelectorAll('menu button[handler], menu a[href], menu li > button[handler], menu li > a[href]')].map((el) => ({
          name: el.getAttribute('handler') || null,
          href: el.tagName === 'A' ? el.getAttribute('href') : null,
          label: (el.textContent || '').trim(),
          write: gateAll || el.hasAttribute('if-logged-in') || el.hasAttribute('requires-write'),
        }));
        menu = { label, items };
      }
      const sd = doc.querySelector('sol-default');
      const settings = sd ? { theme: sd.getAttribute('theme'), fontsize: sd.getAttribute('fontsize'), proxy: sd.getAttribute('proxy') } : null;
      return { tabs, tabsLabel, actions, menu, settings };
    }, htmlText);
  } finally { await browser.close(); }
}

// ── shape → Turtle ───────────────────────────────────────────────────────────
export function tabsTtl({ tabs, tabsLabel, actions = [] }) {
  const used = new Set(tabs.map((t) => t.local));
  const acts = actions.map((a) => ({ ...a, local: actionLocal(a, used) }));
  const attrBlock = (pairs) => pairs.map(([k, v]) => `    [ schema:name ${lit(k)} ; schema:value ${lit(v ?? '')} ]`).join(' ,\n');
  const parts = [...tabs, ...acts].map((t) => `<#${t.local}>`).join(' ');
  let out = `@prefix ui:     <${UI}> .\n@prefix schema: <${SCHEMA}> .\n\n`;
  out += `# GENERATED from the declarative HTML by bin/html-to-rdf.mjs — do not hand-edit.\n`;
  out += `<#Tabs> a ui:Menu ; ui:label ${lit(tabsLabel)} ;\n  ui:orientation ui:Horizontal ;\n  ui:parts ( ${parts} ) .\n\n`;
  for (const t of tabs) {
    out += `<#${t.local}> a ui:Component ; ui:label ${lit(t.label)} ; ui:name ${lit(t.name)} ;\n  ui:attribute\n`;
    out += attrBlock(t.attrs) + ' .\n\n';
  }
  // Toolbar actions: ui:Component launchers marked slot="actions" so the
  // renderer puts them on the bar's action row instead of as tabs.
  for (const a of acts) {
    out += `<#${a.local}> a ui:Component ; ui:label ${lit(a.label)} ; ui:name ${lit(a.tag)} ;\n  ui:attribute\n`;
    out += attrBlock([['slot', 'actions'], ...a.attrs]) + ' .\n\n';
  }
  return out.trimEnd() + '\n';
}
export function menuTtl({ label, items }) {
  const local = (it) => it.name || (it.href || '').split(/[\/#?]/).filter(Boolean).pop() || 'item';
  const parts = items.map((it) => `<#${local(it)}>`).join(' ');
  let out = `@prefix ui:  <${UI}> .\n@prefix acl: <${ACL}> .\n\n`;
  out += `# GENERATED from the declarative HTML by bin/html-to-rdf.mjs — do not hand-edit.\n`;
  out += `<#More> a ui:Menu ; ui:label ${lit(label)} ;\n  ui:parts ( ${parts} ) .\n\n`;
  for (const it of items) {
    const bits = [`a ui:Component`, `ui:label ${lit(it.label)}`];
    if (it.name) bits.push(`ui:name ${lit(it.name)}`);
    if (it.href) bits.push(`ui:href <${it.href}>`);
    if (it.write) bits.push(`acl:mode acl:Write`);
    out += `<#${local(it)}> ${bits.join(' ; ')} .\n`;
  }
  return out.trimEnd() + '\n';
}
export function settingsTtl({ theme, fontsize, proxy }) {
  const SCHEME = { light: 'LightColorScheme', dark: 'DarkColorScheme' };
  const FONT = { small: 'SmallFont', medium: 'MediumFont', large: 'LargeFont' };
  const bits = [];
  if (theme && SCHEME[theme]) bits.push(`ui:colorScheme ui:${SCHEME[theme]}`);
  if (fontsize && FONT[fontsize]) bits.push(`ui:fontSize ui:${FONT[fontsize]}`);
  if (proxy) bits.push(`ui:proxy ${lit(proxy)}`);
  return `@prefix ui: <${UI}> .\n\n# GENERATED from <sol-default> by bin/html-to-rdf.mjs — do not hand-edit.\n<#Settings>\n  ${bits.join(' ;\n  ')} .\n`;
}

// ── Turtle → shape ───────────────────────────────────────────────────────────
const parseGraph = (text, base) => { const g = rdflib.graph(); rdflib.parse(text, g, base, 'text/turtle'); return g; };
const sym = (u) => rdflib.sym(u);
function listItems(store, node) {
  if (!node) return [];
  // rdflib parses `( a b c )` into a Collection term whose members are on
  // `.elements` (it does NOT necessarily materialise rdf:first/rest triples).
  if (Array.isArray(node.elements)) return node.elements;
  // Fallback: walk an explicit rdf:first/rest chain.
  const out = [];
  let n = node;
  const FIRST = sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#first');
  const REST = sym('http://www.w3.org/1999/02/22-rdf-syntax-ns#rest');
  const NIL = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil';
  while (n && n.value !== NIL) {
    const f = store.any(n, FIRST); if (f) out.push(f);
    n = store.any(n, REST);
  }
  return out;
}
export function parseTabsTtl(text, base = 'http://x/tabs.ttl') {
  const store = parseGraph(text, base);
  const menu = sym(base + '#Tabs');
  const label = store.any(menu, sym(UI + 'label'))?.value || 'Tabs';
  const partsNode = store.any(menu, sym(UI + 'parts'));
  const parts = partsNode ? listItems(store, partsNode) : [];
  const readAttrs = (c) => store.each(c, sym(UI + 'attribute')).map((b) => [
    store.any(b, sym(SCHEMA + 'name'))?.value, store.any(b, sym(SCHEMA + 'value'))?.value ?? '',
  ]);
  const tabs = [], actions = [];
  for (const c of parts) {
    const attrs = readAttrs(c);
    const isAction = attrs.some(([k, v]) => k === 'slot' && v === 'actions');
    const label = store.any(c, sym(UI + 'label'))?.value || '';
    const name = store.any(c, sym(UI + 'name'))?.value || '';
    if (isAction) {
      // strip the routing marker; the rest are the element's real attributes
      actions.push({ tag: name, label, attrs: attrs.filter(([k, v]) => !(k === 'slot' && v === 'actions')) });
    } else {
      tabs.push({ local: c.value.split('#').pop(), label, name, attrs });
    }
  }
  return { tabs, tabsLabel: label, actions };
}
export function parseSettingsTtl(text, base = 'http://x/settings.ttl') {
  const store = parseGraph(text, base);
  const s = sym(base + '#Settings');
  const localOf = (n) => (n ? n.value.split('#').pop() : null);
  const SCHEME = { LightColorScheme: 'light', DarkColorScheme: 'dark' };
  const FONT = { SmallFont: 'small', MediumFont: 'medium', LargeFont: 'large' };
  return {
    theme: SCHEME[localOf(store.any(s, sym(UI + 'colorScheme')))] || null,
    fontsize: FONT[localOf(store.any(s, sym(UI + 'fontSize')))] || null,
    proxy: store.any(s, sym(UI + 'proxy'))?.value || null,
  };
}
export function parseMenuTtl(text, base = 'http://x/menu.ttl') {
  const store = parseGraph(text, base);
  const menu = sym(base + '#More');
  const label = store.any(menu, sym(UI + 'label'))?.value || 'Menu';
  const partsNode = store.any(menu, sym(UI + 'parts'));
  const parts = partsNode ? listItems(store, partsNode) : [];
  const items = parts.map((c) => ({
    name: store.any(c, sym(UI + 'name'))?.value || null,
    href: store.any(c, sym(UI + 'href'))?.value || null,
    label: store.any(c, sym(UI + 'label'))?.value || '',
    write: store.holds(c, sym(ACL + 'mode'), sym(ACL + 'Write')),
  }));
  return { label, items };
}

// ── shape → HTML fragments (html-first authoring style) ──────────────────────────
const indent = (lines, n) => lines.map((l) => ' '.repeat(n) + l).join('\n');
const attrStr = ([k, v]) => (v === '' ? k : `${k}="${v}"`);
export function emitTabsHtml({ tabs, actions = [], menu = null }) {
  // Reverse of extract: source→href, id/local→id attr, name→data-handler,
  // other attrs→data-*. The bar button's per-room key is derived from `id` at
  // runtime (sol-tabs mirrors it as data-tab-id), so no separate data-tab-id is
  // authored. Standard attrs on the tag line; data-* each indented; > on its own line.
  const anchors = tabs.map((t) => {
    const byKey = Object.fromEntries(t.attrs.map(([k, v]) => [k, v]));
    const href = byKey.source ?? '';
    const idAttr = byKey.id != null ? ` id="${byKey.id}"` : (t.local ? ` id="${t.local}"` : '');
    const dataLines = [`data-handler="${t.name}"`];
    for (const [k, v] of t.attrs) {
      if (k === 'id' || k === 'source') continue;
      dataLines.push(v === '' ? `data-${k}` : `data-${k}="${v}"`);
    }
    return `<a href="${href}"${idAttr}\n` + indent(dataLines, 3) + `\n>${t.label}</a>`;
  });
  // Toolbar actions: rebuild each launcher element from its attributes. The ⋮
  // dropdown is dual-role — drop its menu pointer and nest the menu inline.
  const acts = actions.map((a) => {
    if (a.tag === 'sol-dropdown-button' && menu) {
      const attrs = a.attrs.filter(([k]) => k !== 'source' && k !== 'data-from-rdf');
      return `<${a.tag} ${attrs.map(attrStr).join(' ')}>\n  ${menuInner(menu)}\n</${a.tag}>`;
    }
    return `<${a.tag} ${a.attrs.map(attrStr).join(' ')}>${a.label}</${a.tag}>`;
  });
  return [...anchors, ...acts].join('\n');
}
function menuInner({ items }) {
  const allWrite = items.length > 0 && items.every((i) => i.write);
  const rows = items.map((it) => {
    const gate = !allWrite && it.write ? ' if-logged-in' : '';
    return it.href ? `  <a href="${it.href}"${gate}>${it.label}</a>` : `  <button handler="${it.name}"${gate}>${it.label}</button>`;
  }).join('\n');
  return `<menu>\n${rows}\n  </menu>`;
}
/** Settings RDF → the <sol-default> attribute list (the pre-paint runtime form). */
export function emitSolDefaultAttrs({ theme, fontsize, proxy }) {
  const a = [];
  if (proxy) a.push(`proxy="${proxy}"`);
  if (theme) a.push(`theme="${theme}"`);
  if (fontsize) a.push(`fontsize="${fontsize}"`);
  return `<sol-default ${a.join(' ')}></sol-default>`;
}
export function emitMenuHtml({ label, items }) {
  const allWrite = items.length > 0 && items.every((i) => i.write);
  const head = `<sol-dropdown-button class="omp-more" title="${label}" aria-label="${label}"\n   label="⋮"${allWrite ? '\n   if-logged-in' : ''}>`;
  return `${head}\n  ${menuInner({ items })}\n</sol-dropdown-button>`;
}
