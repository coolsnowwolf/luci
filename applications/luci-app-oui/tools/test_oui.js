/* SPDX-License-Identifier: GPL-2.0-only */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/oui/oui.js'), 'utf8');
function setup(fail = false) {
 let requests = 0;
 const document = {
  currentScript: { src: 'http://router/luci-static/resources/oui/oui.js?v=1' },
  createElement() { return { style: {}, remove() { this.removed = true; } }; }
 };
 const data = { vendors: [['asus', 'ASUS'], ['apple', 'Apple']], prefixes: {
  '001122': 0, '0011223': 1, '001122334': 0, '0011224': null
 }};
 const ctx = { window: {}, document, Promise, XMLHttpRequest: function() {
  this.open = (method, url, async) => { assert(async); assert(url.startsWith('http://router/luci-static/resources/oui/vendors-')); };
  this.send = () => { requests++; this.status = fail ? 404 : 200; this.responseText = JSON.stringify(data); this.onload(); };
 }};
 vm.runInNewContext(source, ctx);
 const node = () => ({ children: [], querySelector() { return this.children[0]; }, insertBefore(img) { this.children.unshift(img); } });
 return { oui: ctx.window.luciOUI, node, requests: () => requests };
}
(async () => {
 let t = setup();
 for (const mac of [null, '', '02:11:22:00:00:00', '01:11:22:00:00:00', 'FF:FF:FF:FF:FF:FF', '001122', '00:11-22:33:44:55'])
  t.oui.decorate(t.node(), mac);
 assert.equal(t.requests(), 0, 'invalid or private MACs must not fetch data');
 for (let octet = 0; octet < 256; octet++) {
  const mac = octet.toString(16).padStart(2, '0') + ':11:22:33:44:55';
  if (!(octet & 3)) continue;
  const n = t.node(); t.oui.decorate(n, mac);
  assert(n.children[0].src.endsWith((octet & 3) === 2 ? '/phone.svg' : '/computer.svg'));
 }
 for (const mac of ['a6-11-22-33-44-55', 'AE1122334455', 'BA:71:BE:00:00:01']) {
  const n = t.node(); t.oui.decorate(n, mac, true);
  assert(n.children[0].src.endsWith('/phone.svg'), 'private MAC must take precedence over fnOS');
  n.children[0].onerror(); assert(n.children[0].src.endsWith('/computer.svg'));
 }
 assert.equal(t.requests(), 0, 'phone icons must not fetch the OUI database');
 const cases = [['00:11:22:00:00:00','ASUS'],['00-11-22-35-00-00','Apple'],['001122334455','ASUS'],['00:11:22:40:00:00',null],['00:AB:CD:00:00:00',null]];
 const nodes = cases.map(([mac]) => { const n=t.node(); t.oui.decorate(n,mac); return n; });
 await Promise.resolve(); await Promise.resolve();
 cases.forEach(([mac, brand], i) => { assert.equal(nodes[i].children[0]?.title ?? null, brand || 'Unknown vendor'); t.oui.decorate(nodes[i],mac); assert(nodes[i].children.length <= 1); });
 assert.equal(t.requests(), 1, 'polls share one database request');
 nodes[0].children[0].onerror(); assert(nodes[0].children[0].src.endsWith('/computer.svg'));
 nodes[0].children[0].onerror(); assert(nodes[0].children[0].removed);
 t.oui.setDevices([{mac:'00:AB:CD:00:00:01',vendor:'apple'}, {mac:'00:AB:CD:00:00:03',vendor:'../../bad'}]);
 const exact=t.node(), other=t.node(), unsafe=t.node();
 t.oui.decorate(exact,'00:AB:CD:00:00:01');
 t.oui.decorate(other,'00:AB:CD:00:00:02');
 t.oui.decorate(unsafe,'00:AB:CD:00:00:03');
 assert.equal(exact.children[0].title,'Apple');
 assert.equal(other.children[0].title,'Unknown vendor','OEM overrides must not affect other devices in the same OUI');
 assert.equal(unsafe.children[0].title,'Unknown vendor');
 const fnos=t.node();
 t.oui.decorate(fnos,'B8:71:BE:00:00:01',true);
 assert.equal(fnos.children[0].title,'fnOS / FygoOS');
 assert(fnos.children[0].src.endsWith('/fnos.svg'));
 const overridden=t.node();
 t.oui.decorate(overridden,'00:11:22:00:00:00',true);
 assert.equal(overridden.children[0].title,'fnOS / FygoOS');
 fnos.children[0].onerror();
 assert(fnos.children[0].src.endsWith('/computer.svg'));
 t=setup(true);
 t.oui.decorate(t.node(),'00:11:22:00:00:00'); await Promise.resolve();
 t.oui.decorate(t.node(),'00:11:22:00:00:00'); await Promise.resolve();
 assert.equal(t.requests(),1,'failed lookups must not retry every poll');
 // Exercise the optional LuCI integration, including URL construction.
 const statusSource = fs.readFileSync(path.join(__dirname, '../../../modules/luci-mod-status/htdocs/luci-static/resources/view/status/include/40_dhcp.js'), 'utf8');
 let enabled = false, scripts = [];
 const doc = { createTextNode: text => ({ text }), createElement: () => ({}), head: { appendChild: s => scripts.push(s) } };
 const L = { resolveDefault: p => Promise.resolve(p).catch(() => null), hasSystemFeature: () => enabled, resource: name => {
  assert(!name.includes('?'), 'L.resource rejects query strings');
  return '/luci-static/resources/' + name;
 }};
 const view = new Function('baseclass','rpc','L','_','E','document','window','uci', statusSource)(
  { extend: o => o }, { declare: () => () => {} }, L, s => s,
  (tag, attrs, children) => ({ tag, children }), doc, {}, { load: () => Promise.resolve(), sections: () => [] }
 );
 assert.equal(view.renderHostname('host', '00:11:22:00:00:00').children[0].text, 'host');
 assert.equal(scripts.length, 0);
 enabled = true;
 const host = view.renderHostname('<img src=x>', '00:11:22:00:00:00');
 assert.equal(host.children[0].text, '<img src=x>');
 assert.equal(scripts[0].src, '/luci-static/resources/oui/oui.js?v=10');
 view.renderHostname('host2', '00:11:22:00:00:01');
 assert.equal(scripts.length, 1);
 console.log('OUI runtime and optional integration checks passed');
})();
