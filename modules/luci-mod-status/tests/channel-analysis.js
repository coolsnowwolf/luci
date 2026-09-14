const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/status/channel_analysis.js'), 'utf8');
const view = new Function('view', 'rpc', 'L', 'fs', source)(
 {extend: o => o}, {declare: () => () => {}},
 {resolveDefault: (p, fallback) => p.catch(() => fallback)}, {}
);
view.updateScanButton = () => {};
const dev = (name, type) => ({getName: () => name, get: () => type});
(async () => {
 const mt = dev('ra', 'mt_dbdc');
 mt.getScanList = async () => [{ssid:'mtwifi'}];
 assert.deepEqual(await view.getScanResultsForRadio(mt), [{ssid:'mtwifi'}]);
 const qca = dev('wifi0', 'qcawificfg80211');
 qca.getWifiNetworks = async () => [{getMode:()=> 'ap',getIfname:()=> 'ath0'}];
 assert.equal(await view.resolveScanDevice(qca), 'ath0');
 let calls = [], release;
 view.getScanResultsForRadio = d => {
  calls.push(d.getName());
  return new Promise(resolve => {release = resolve;});
 };
 const first = view.requestRadioScan(mt);
 assert.strictEqual(view.requestRadioScan(mt), first, 'duplicate requests share the pending scan');
 const second = view.requestRadioScan(qca);
 await Promise.resolve();
 assert.deepEqual(calls, ['ra'], 'radios scan serially');
 release([{ssid:'one'}]);
 await first;
 await Promise.resolve();
 assert.deepEqual(calls, ['ra','wifi0']);
 release([]);
 await second;
 const third = view.requestRadioScan(mt);
 await Promise.resolve();
 assert.equal(calls.length,3);
 release([]);
 await third;
 view.getScanResultsForRadio = () => Promise.reject(Error('busy'));
 await assert.rejects(view.requestRadioScan(mt), /busy/);
 assert.equal(view.scanStates.ra.pending,null,'failure releases lock');
 view.getScanResultsForRadio = async () => [{ssid:'recovered'}];
 assert.deepEqual(await view.requestRadioScan(mt), [{ssid:'recovered'}], 'retry immediately after failure');
 console.log('channel analysis: mtwifi backend, QCA interface resolution, serialization, coalescing, immediate rescan and error recovery passed');
})().catch(e => {console.error(e);process.exit(1)});
