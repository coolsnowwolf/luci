const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/status/channel_analysis.js'), 'utf8');
const execCalls = [];
let devices = [];
const frequencies = [];
let execResult = {code: 0, stdout: ''};
const view = new Function('view', 'rpc', 'L', 'fs', 'network', source)(
 {extend: o => o}, {declare: () => () => {}},
 {resolveDefault: (p, fallback) => p.catch(() => fallback), resource: p => p},
 {exec: async (cmd, args) => {execCalls.push([cmd, args]); return execResult;}},
 {getWifiDevices: async () => devices}
);
view.updateScanButton = () => {};
const dev = (name, type) => ({getName: () => name, get: () => type});
(async () => {
 const mt = dev('ra', 'mt_dbdc');
 mt.getScanList = async () => [{ssid:'mtwifi'}];
 assert.deepEqual(await view.getScanResultsForRadio(mt), [{ssid:'mtwifi'}]);
 String.prototype.format = function(...args) {let i=0;return this.replace(/%s/g,()=>args[i++]);};
 global._ = s => s;
 const qca = dev('wifi0', 'qcawificfg80211');
 view.iwDevMap = {wifi0: {phy:'phy0', preferred:'ath0', temp:'tmpsta0'}};
 qca.getWifiNetworks = async () => [{getMode:()=> 'ap',getIfname:()=> 'wifi0.network1'}];
 assert.equal(await view.resolveScanDevice(qca), 'ath0');
 assert.deepEqual(await view.getScanResultsForRadio(qca), []);
 assert.deepEqual(execCalls, [['/usr/sbin/iw', ['dev','ath0','scan','ap-force']]], 'QCA scans a real VAP without creating a temporary STA');
 execResult = {code:237, stderr:'No such device'};
 await assert.rejects(view.getScanResultsForRadio(qca), /No such device/);
 execResult = {code:0, stdout:'scan aborted!'};
 await assert.rejects(view.getScanResultsForRadio(qca), /scan aborted/);
 await assert.rejects(view.resolveScanDevice(dev('wifi2', 'qcawifi')), /No active wireless interface/);
 execResult = {code:0, stdout:'BSS 00:11:22:33:44:55(on ath0)\n\tfreq: 2412\n\tsignal: -42.00 dBm\n\tSSID: test\n'};
 const scan = await view.getScanResultsForRadio(qca);
 assert.equal(scan[0].band,2);
 assert.equal(scan[0].signal,-42);

 // Frequency queries must also use real VAPs, including a third QCA radio.
 devices = [qca,dev('wifi2','qcawifi'),dev('radio0','mac80211')];
 execResult = {code:0,stdout:'phy#7\n\tInterface tmpsta7\n\tInterface ath2\n\tInterface wifi2\nphy#0\n\tInterface ath0\n\tInterface wifi0\n'};
 view.loadSVG = async () => 'svg';
 view.callFrequencyList = async name => {frequencies.push(name);return [];};
 await view.load();
 assert.deepEqual(frequencies, ['ath0','ath2','radio0']);
 assert.equal(await view.resolveScanDevice(dev('wifi2','qcawifi')), 'ath2');
 const generic=dev('radio0','mac80211');
 generic.getWifiNetworks=async()=>[{getMode:()=> 'ap',getIfname:()=> 'wlan0'}];
 assert.equal(await view.resolveScanDevice(generic),'wlan0');
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
