const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/status/include/60_wifi.js'), 'utf8');
let config, calls, enumerated;
const uci = {
 get: (pkg, section, key) => config[section]?.[key],
 sections: (pkg, type) => Object.entries(config).filter(([, s]) => s['.type'] == type).map(([name, s]) => ({'.name': name, ...s}))
};
const view = new Function('baseclass', 'rpc', 'uci', 'L', '_', source)(
 {extend: o => o},
 {declare: spec => async (...args) => {
  calls.push([spec.method, ...args]);
  return spec.method == 'devices' ? enumerated : [];
 }}, uci,
 {toArray: x => x || [], resolveDefault: (p, fallback) => p.catch(() => fallback)}, s => s
);
function setup() {
 config = {
  wifi0: {'.type':'wifi-device', type:'qcawificfg80211', disabled:'1'},
  wifi1: {'.type':'wifi-device', type:'qcawifi', disabled:'1'},
  ath0: {'.type':'wifi-iface', device:'wifi0'},
  ath1: {'.type':'wifi-iface', device:'wifi1'}
 };
 calls = [];
 enumerated = ['wifi0', 'wifi1'];
}
function radios() { return uci.sections('wireless', 'wifi-device').map(s => ({getName: () => s['.name']})); }
function networks() { return uci.sections('wireless', 'wifi-iface').map(s => ({
 getName: () => s['.name'], getWifiDeviceName: () => s.device,
 getIfname: () => s.device + '.network1', get: key => s[key],
 getAssocList: async () => {calls.push(['net-assoc', s['.name']]); return [];}
})); }
(async () => {
 setup();
 let resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, []);
 await view.loadIwinfoInfoMap(resolver);
 for (const net of networks()) assert.deepEqual(await view.getAssocListForNetwork(net), []);
 assert.deepEqual(calls, [], 'disabled radios must issue no iwinfo or association queries');
 config.wifi0.disabled = '0';
 resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, ['ath0']);
 assert.equal(resolver.aliasMap.wifi0, 'ath0');
 config.ath0.disabled = '1';
 resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, [], 'disabled VAP is excluded even on an enabled radio');
 config.ath0.disabled = '0';
 config.ath0.ifname = 'custom0';
 resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, ['custom0']);
 delete config.ath0;
 resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, [], 'no VAP must not fall back to the bare QCA radio');
 setup();
 config.radio0 = {'.type':'wifi-device', type:'mac80211'};
 enumerated.push('radio0');
 resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, ['radio0']);
 assert.deepEqual(calls, [['devices']], 'mixed setups retain generic enumeration');
 config.wifi0.disabled = '0';
 resolver = await view.loadIwinfoResolver(radios(), networks());
 assert.deepEqual(resolver.queryTargets, ['radio0'], 'mixed setups must not probe bare QCA radios');
 console.log('Wi-Fi status: disabled radios/VAPs, active VAP, custom ifname, missing VAP and mixed backends passed');
})().catch(e => {console.error(e); process.exit(1);});
