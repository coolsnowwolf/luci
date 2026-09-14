/* SPDX-License-Identifier: Apache-2.0 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const luci = path.resolve(__dirname, '../../..');
const baseclass = { extend: o => o };
const validation = new Function('baseclass', fs.readFileSync(path.join(luci, 'modules/luci-base/htdocs/luci-static/resources/validation.js'), 'utf8'))(baseclass);
const source = fs.readFileSync(path.join(luci, 'modules/luci-mod-status/htdocs/luci-static/resources/view/status/include/40_dhcp.js'), 'utf8');
const L = { bind: (fn, ctx, ...args) => fn.bind(ctx, ...args), hasSystemFeature: () => false, resolveDefault: (p, fallback) => Promise.resolve(p).catch(() => fallback), toArray: x => x == null ? [] : Array.isArray(x) ? x : [x] };
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
const fnosClient = {macaddr: lease.macaddr, activeAddresses:['192.168.0.3', lease.ipaddr, '2001:db8::2']};
assert.equal(view.isFnosClient(fnosClient, web([5666])), true);
assert.equal(view.isFnosClient(fnosClient, web([5667])), true);
assert.equal(view.isFnosClient(fnosClient, web([80,443])), false);
assert.equal(view.isFnosClient(fnosClient, {}), false);
assert.equal(view.isFnosClient({...fnosClient, activeAddresses:[]}, web([5666])), false);
assert.equal(view.isFnosClient({...fnosClient, macaddr:'00:11:22:33:44:55'}, web([5666])), false);
assert.equal(view.isFnosClient(fnosClient, {clients:{[lease.ipaddr]:{mac,ready:false,ports:[5666]}}}), false);
const link = view.renderClientIP(lease, web([5666,443]));
assert.equal(link.tag, 'a');
assert.equal(link.text, lease.ipaddr);
assert.equal(link.attrs.href, 'http://192.168.0.2:5666/');
assert.equal(link.attrs.target, '_blank');
assert.equal(link.attrs.style, 'text-decoration:underline');
assert.equal(view.renderClientIP(lease, web([])), lease.ipaddr);
const arp = `IP address HW type Flags HW address Mask Device
192.168.0.2 0x1 0x2 aa:bb:cc:dd:ee:ff * br-lan
192.168.0.8 0x1 0x6 00:11:22:33:44:66 * br-lan
192.168.0.9 0x1 0x0 00:11:22:33:44:77 * br-lan
192.168.9.1 0x1 0x2 00:11:22:33:44:88 * eth1
192.168.0.10 0x1 0x2 00:00:00:00:00:00 * br-lan
192.168.0.11 0x1 0x2 01:00:5e:00:00:01 * br-lan
invalid 0x1 0x2 00:11:22:33:44:99 * br-lan`;
const arpClients=view.arpLeases(arp);
assert.equal(arpClients.length,2);
assert.equal(arpClients[0].macaddr,mac);
assert.equal(view.arpLeases('').length,0);
assert.equal(view.mergeLeases(arpClients,[],{hosts:{}}).length,2);
assert.equal(view.mergeLeases([{macaddr:mac,ipaddr:'192.168.0.2'},...arpClients],[],{hosts:{}}).length,2);
// One row per known MAC, with all family addresses and original reservation IDs.
const v4 = [
 {macaddr:mac.toLowerCase(), hostname:'desktop', ipaddr:'192.168.0.2'},
 {macaddr:mac, hostname:'desktop', ipaddr:'192.168.0.3'},
 {macaddr:'00:11:22:33:44:55', hostname:'desktop', ipaddr:'192.168.0.4'}
];
const v6 = [
 {macaddr:mac, hostname:'desktop', ip6addr:'2001:db8::2', ip6addrs:['2001:db8::2/128'], duid:'DUID1', iaid:'01', interface:'br-lan'},
 {macaddr:mac.toLowerCase(), ip6addrs:['2001:0db8:0:0:0:0:0:2/128','2001:db8::3/128'], duid:'DUID1', iaid:'01'},
 {hostname:'desktop', ip6addrs:['2001:db8::4/128'], duid:'opaque'},
 {hostname:'desktop', ip6addrs:['2001:db8::5/128'], duid:'another'}
];
const input = JSON.stringify([v4,v6]);
const merged = view.mergeLeases(v4,v6,{hosts:{}});
assert.equal(merged.length,4); // Equal names with unknown or different MACs stay separate.
assert.equal(merged[0].macaddr,mac);
assert.deepEqual(merged[0].ipaddrs,['192.168.0.2','192.168.0.3']);
assert.deepEqual(merged[0].ip6addrs,['2001:db8::2','2001:db8::3/128']);
assert.equal(merged[0].leases6.length,1);
assert.equal(merged[0].leases6[0].duid,'DUID1');
assert.equal(merged[0].leases6[0].iaid,'01');
assert.deepEqual(merged[0].interfaces,['br-lan']);
assert.equal(JSON.stringify([v4,v6]),input);
const combined = view.mergeLeases([v4[0]],[v6[0]],hints)[0];
assert.deepEqual(view.clientAddresses(combined,hints),view.clientAddresses(lease,hints));
assert.equal(view.rateValue(view.clientAddresses(combined,hints),totals,'download',mac)[0],600);
assert.equal(view.rateValue(view.clientAddresses(combined,hints),totals,'total',mac)[0],123456);
const inferred = view.mergeLeases([v4[0]],[{...v6[0],macaddr:null}],hints);
assert.equal(inferred.length,1);
assert.equal(inferred[0].leases6[0].macaddr,mac);
const conflicting = {hosts:{...hints.hosts,'00:11:22:33:44:55':hints.hosts[mac]}};
assert.equal(view.mergeLeases([v4[0]],[{...v6[0],macaddr:null}],conflicting).length,2);
assert.equal(view.mergeLeases([],[{macaddr:'00:00:00:00:00:00'},{}],{hosts:{}}).length,2);
assert.deepEqual(view.mergeLeases([],[],{hosts:{}}),[]);
const archived = view.mergeLeases([{...v4[0],_historical:true}], [{...v6[0],_historical:true}], hints)[0];
assert.equal(archived.ipaddrs[0],'192.168.0.2');
assert.equal(archived.ip6addrs[0],'2001:db8::2');
assert.equal(archived.activeAddresses.length,0);
assert.equal(archived.leases.length,0);
assert.equal(view.clientAddresses(archived,hints).length,0);
assert.equal(view.rateValue([],totals,'total',mac)[0],123456);
const returned = view.mergeLeases([v4[0],{...v4[0],_historical:true}],[],hints);
assert.equal(returned.length,1);
assert.equal(returned[0].leases.length,1);
assert.equal(returned[0].ipaddrs.length,1);
const unknownHistory = view.mergeLeases([], [v6[2], {...v6[2],_historical:true}], {hosts:{}});
assert.equal(unknownHistory.length,1);
assert.equal(unknownHistory[0].leases6.length,1);
const old4=view.handleCreateStaticLease, old6=view.handleCreateStaticLease6;
view.handleCreateStaticLease=record=>record;
view.handleCreateStaticLease6=record=>record;
view.isDUIDIAIDStatic={'duid1%01':true};
const actions=view.leaseActions(combined).text;
assert.equal(actions.length,2);
assert.equal(actions[0].attrs.click().ipaddr,'192.168.0.2');
assert.equal(actions[1].attrs.click().duid,'DUID1');
assert.equal(actions[1].attrs.disabled,true);
view.handleCreateStaticLease=old4; view.handleCreateStaticLease6=old6;
console.log('traffic UI: MAC lease merging, unknown/conflicting identities and reservation actions passed');
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
