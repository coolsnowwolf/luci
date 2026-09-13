/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const luci = path.resolve(__dirname, '../../..');
const baseclass = { extend: o => o };
const validation = new Function('baseclass', fs.readFileSync(path.join(luci, 'modules/luci-base/htdocs/luci-static/resources/validation.js'), 'utf8'))(baseclass);
const source = fs.readFileSync(path.join(luci, 'modules/luci-mod-status/htdocs/luci-static/resources/view/status/include/40_dhcp.js'), 'utf8');
const L = { bind: (fn, ctx) => fn.bind(ctx), hasSystemFeature: () => false, resolveDefault: (p, fallback) => Promise.resolve(p).catch(() => fallback), toArray: x => x == null ? [] : Array.isArray(x) ? x : [x] };
let cells = [], calls = 0, polls = [], reply;
const document = {querySelectorAll: selector => selector.startsWith('#status_leases') ? [] : cells};
const poll = {add: (fn, interval) => polls.push({fn, interval})};
const rpc = {declare: spec => addresses => {
 assert.equal(spec.object, 'luci.client-rates');
 assert.deepEqual(addresses, ['192.168.0.2']);
 calls++;
 return reply;
}};
const view = new Function('baseclass','rpc','L','_','validation','poll','document','E', source)(baseclass, rpc, L, s=>s, validation, poll, document, (tag, attrs, text) => ({tag,attrs,text}));
// Formatting is supplied by LuCI; check its numeric sorting key separately.
String.prototype.format = function(value) { return String(value) + ' B/s'; };
const lease = {ipaddr:'192.168.0.2', macaddr:'aa:bb:cc:dd:ee:ff',ip6addrs:['2001:db8::2/128']};
const hints = {hosts: {'AA:BB:CC:DD:EE:FF':{ipaddrs:['192.168.0.2'],ip6addrs:['2001:0db8:0:0:0:0:0:2']}}};
assert.deepEqual(view.clientAddresses(lease,hints), ['192.168.0.2','2001:db8:0:0:0:0:0:2']);
const rates={rates:{'192.168.0.2':{ready:true,upload:100,download:200},'2001:db8:0:0:0:0:0:2':{ready:true,upload:300,download:400}}};
assert.equal(view.renderRate(lease,hints,rates,'upload')[0],400);
assert.equal(view.renderRate(lease,hints,rates,'download')[0],600);
assert.equal(view.renderRate(lease,hints,{},'upload')[1],'-');
assert.deepEqual(view.clientAddresses({ipaddr:'invalid'}, {hosts:{}}),[]);
const mac = 'AA:BB:CC:DD:EE:FF';
const totals = {...rates, totals:{[mac]:123456}};
assert.equal(view.rateValue(view.clientAddresses(lease,hints),totals,'total',mac)[0],123456);
assert.equal(view.rateValue(['192.168.0.2'],totals,'total',mac)[0],123456);
assert.equal(view.rateValue([],totals,'total',mac.toLowerCase())[0],123456);
assert.equal(view.rateValue([],{},'total',mac)[1],'-');
assert.equal(view.rateValue([], {totals:{[mac]:0}}, 'total',mac)[0],0);
const web = ports => ({clients:{'192.168.0.2':{mac, ready:true, ports}}});
assert.equal(view.clientURL(lease, web([4430,443,8080,80])), 'http://192.168.0.2/');
assert.equal(view.clientURL(lease, web([443,8080])), 'http://192.168.0.2:8080/');
assert.equal(view.clientURL(lease, web([4430,443])), 'https://192.168.0.2/');
assert.equal(view.clientURL(lease, web([4430])), 'https://192.168.0.2:4430/');
assert.equal(view.clientURL(lease, web([5666,443,5667])), 'http://192.168.0.2:5666/');
assert.equal(view.clientURL(lease, web([5667])), 'https://192.168.0.2:5667/');
assert.equal(view.clientURL(lease, web([])), null);
assert.equal(view.clientURL(lease, web([22])), null);
assert.equal(view.clientURL({...lease,macaddr:'00:11:22:33:44:55'}, web([80])), null);
assert.equal(view.clientURL({...lease,ipaddr:'javascript:alert(1)'}, web([80])), null);
assert.equal(view.clientURL(lease, {}), null);
const link = view.renderClientIP(lease, web([5666,443]));
assert.equal(link.tag, 'a');
assert.equal(link.text, lease.ipaddr);
assert.equal(link.attrs.href, 'http://192.168.0.2:5666/');
assert.equal(link.attrs.target, '_blank');
assert.equal(link.attrs.style, 'text-decoration:underline');
assert.equal(view.renderClientIP(lease, web([])), lease.ipaddr);
console.log('traffic UI: address normalization, no double-counting, directions and warm-up passed');

(async () => {
 view.render([{}, {}]);
 view.render([{}, {}]);
 assert.equal(polls.length, 1);
 assert.equal(polls[0].interval, 2);
 await view.refreshRates();
 assert.equal(calls, 0); // No mounted table means no background requests.
 function cell(direction) {
  return {dataset:{addresses:'["192.168.0.2"]', direction},
   closest() {return {setAttribute: (name, value) => {this.sort = value;}};}};
 }
 cells = [cell('upload'), cell('download')];
 reply = new Promise(resolve => {global.resolveRates = resolve;});
 const pending = view.refreshRates();
 // Simulate the normal status poll replacing the table during the RPC.
 const oldCells = cells;
 cells = [cell('upload'), cell('download')];
 global.resolveRates({rates:{'192.168.0.2':{ready:true,upload:100,download:200}}});
 await pending;
 assert.equal(calls, 1);
 assert.equal(cells[0].textContent, '100 B/s');
 assert.equal(cells[1].sort, 200);
 assert.equal(oldCells[0].textContent, undefined);
 reply = Promise.reject(new Error('unavailable'));
 await view.refreshRates();
 assert.equal(cells[0].textContent, '-');
 assert.equal(cells[0].sort, -1);
 console.log('traffic UI: independent polling, deduplication, row replacement and error fallback passed');
})().catch(e => {console.error(e); process.exitCode = 1;});
