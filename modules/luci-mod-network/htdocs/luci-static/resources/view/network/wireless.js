'use strict';
'require view';
'require dom';
'require poll';
'require fs';
'require ui';
'require rpc';
'require uci';
'require form';
'require network';
'require firewall';
'require tools.widgets as widgets';
'require uqr';

const isReadonlyView = !L.hasViewPermission();
const callIwinfoAssoclistCompat = rpc.declare({
	object: 'iwinfo',
	method: 'assoclist',
	params: [ 'device' ],
	expect: { results: [] }
});
const callIwinfoInfoCompat = rpc.declare({
	object: 'iwinfo',
	method: 'info',
	params: [ 'device' ],
	expect: {}
});

let cachedIwinfoInfoMap = null;
let cachedIwinfoInfoPromise = null;

function loadIwinfoInfoMap(force) {
	if (force)
		cachedIwinfoInfoPromise = null;

	if (!force && cachedIwinfoInfoMap != null)
		return Promise.resolve(cachedIwinfoInfoMap);

	if (cachedIwinfoInfoPromise != null)
		return cachedIwinfoInfoPromise;

	const radios = uci.sections('wireless', 'wifi-device').map((s) => s['.name']);
	const networks = uci.sections('wireless', 'wifi-iface').reduce((names, s) => {
		for (const candidate of [ s['.name'], s.ifname ]) {
			if (candidate && names.indexOf(candidate) < 0)
				names.push(candidate);
		}

		return names;
	}, []);
	const devices = radios.concat(networks).filter((name, index, list) => !!name && list.indexOf(name) === index);

	cachedIwinfoInfoPromise = Promise.all(devices.map((name) =>
		L.resolveDefault(callIwinfoInfoCompat(name), null).then((info) => [ name, info ])
	)).then((entries) => {
		const nextMap = {};

		for (const [ name, info ] of entries)
			if (info != null)
				nextMap[name] = info;

		if (Object.keys(nextMap).length > 0 || cachedIwinfoInfoMap == null)
			cachedIwinfoInfoMap = nextMap;

		cachedIwinfoInfoPromise = null;
		return cachedIwinfoInfoMap || nextMap;
	}).catch(() => {
		cachedIwinfoInfoPromise = null;

		if (cachedIwinfoInfoMap != null)
			return cachedIwinfoInfoMap;

		cachedIwinfoInfoMap = {};
		return cachedIwinfoInfoMap;
	});

	return cachedIwinfoInfoPromise;
}

function refreshIwinfoInfoMap() {
	return loadIwinfoInfoMap(true);
}

function count_changes(section_id) {
	const changes = ui.changes.changes?.wireless;
	if (!Array.isArray(changes)) return 0;

	return changes.reduce((count, [, id]) => count + (id === section_id), 0);
}

function isQcaWifiHwtype(hwtype) {
	return (hwtype == 'qcawifi' || hwtype == 'qcawificfg80211');
}

function isNetworkDisabled(radioNet) {
	return (radioNet.get('disabled') == '1' || uci.get('wireless', radioNet.getWifiDeviceName(), 'disabled') == '1');
}

function isRadioDisplayUp(radioDev, wifiNets) {
	const hwtype = uci.get('wireless', radioDev.getName(), 'type');

	if (radioDev.isUp())
		return true;

	if (!isQcaWifiHwtype(hwtype))
		return false;

	for (const wifiNet of wifiNets)
		if (!isNetworkDisabled(wifiNet))
			return true;

	return false;
}

function isNetworkDisplayUp(radioNet) {
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');

	if (radioNet.isUp())
		return true;

	if ((hwtype == 'mt_dbdc' || isQcaWifiHwtype(hwtype)) && radioNet.getMode() == 'ap')
		return !isNetworkDisabled(radioNet);

	return false;
}

function getRadioDisplayName(radioDev) {
	const name = radioDev.getI18n().replace(/ Wireless Controller .+$/, '');
	const hwtype = uci.get('wireless', radioDev.getName(), 'type');
	const hwmode = uci.get('wireless', radioDev.getName(), 'hwmode') || '';

	if (!/^Generic unknown$/.test(name) && !/^Generic 802\.11unknown$/.test(name))
		return name;

	if (!isQcaWifiHwtype(hwtype))
		return name;

	if (/^11be/.test(hwmode))
		return 'Qualcomm Atheros Wi-Fi 7';

	if (/^11ax/.test(hwmode))
		return 'Qualcomm Atheros Wi-Fi 6';

	if (/^11ac/.test(hwmode))
		return 'Qualcomm Atheros Wi-Fi 5';

	return 'Qualcomm Atheros Wireless';
}

function render_radio_badge(radioDev, wifiNets) {
	return E('div', { 'class': 'wireless-radio-badge' }, [
		E('img', { 'src': L.resource('icons/wifi%s.svg').format(isRadioDisplayUp(radioDev, wifiNets || []) ? '' : '_disabled') })
	]);
}

function buildSVGQRCode(data, code, options, dummy=false) {
	const opts = {
		pixelSize: 4,
		whiteColor: 'white',
		blackColor: 'black',
		ecc: 'M',
		...options
	};
	const svg = uqr.renderSVG(data, opts);
	if (dummy)
		return svg;
	else {
		code.style.opacity = '';
		dom.content(code, Object.assign(E(svg), { style: 'width:100%;height:auto' }));
	}
}

function formatConfigEncryption(enc) {
	enc = String(enc || '');

	if (enc == '' || enc == 'none')
		return _('None');
	if (enc == 'psk2' || enc.indexOf('psk2+') == 0)
		return 'WPA2-PSK';
	if (enc == 'psk' || enc.indexOf('psk+') == 0)
		return 'WPA-PSK';
	if (enc == 'psk-mixed' || enc.indexOf('psk-mixed+') == 0)
		return 'WPA-PSK/WPA2-PSK Mixed Mode';
	if (enc == 'sae' || enc.indexOf('sae+') == 0)
		return 'WPA3-SAE';
	if (enc == 'sae-mixed' || enc.indexOf('sae-mixed+') == 0)
		return 'WPA2-PSK/WPA3-SAE Mixed Mode';
	if (enc == 'wpa3' || enc.indexOf('wpa3+') == 0)
		return 'WPA3-EAP';
	if (enc == 'wpa3-mixed' || enc.indexOf('wpa3-mixed+') == 0)
		return 'WPA2-EAP/WPA3-EAP Mixed Mode';
	if (enc == 'wpa2' || enc.indexOf('wpa2+') == 0)
		return 'WPA2-EAP';
	if (enc == 'wpa' || enc.indexOf('wpa+') == 0)
		return 'WPA-EAP';
	if (enc == 'wep-open')
		return _('WEP Open System');
	if (enc == 'wep-shared')
		return _('WEP Shared Key');

	return enc;
}

function getConfigEncryptionValue(section_id, hwtype) {
	const enc = String(uci.get('wireless', section_id, 'encryption') || '');
	const sae = uci.get('wireless', section_id, 'sae');

	if (enc == 'wep')
		return 'wep-open';

	if (isQcaWifiHwtype(hwtype) && sae == '1') {
		if (enc == 'psk2' || enc.indexOf('psk2+') == 0)
			return 'sae-mixed';
		if (enc == 'sae' || enc.indexOf('sae+') == 0)
			return 'sae';
	}

	if (enc.match(/\+/))
		return enc.replace(/\+.+$/, '');

	return enc;
}

function getConfigCipherValue(section_id, hwtype) {
	const enc = String(uci.get('wireless', section_id, 'encryption') || '');
	const sae = uci.get('wireless', section_id, 'sae');
	let value = enc;

	if (!enc.match(/\+/))
		return ((isQcaWifiHwtype(hwtype) && sae == '1' && (enc == 'psk2' || enc == 'sae')) || enc == 'sae' || enc == 'sae-mixed') ? 'ccmp' : enc;

	value = enc.replace(/^[^+]+\+/, '');

	if (value == 'aes')
		value = 'ccmp';
	else if (value == 'tkip+aes' || value == 'aes+tkip' || value == 'ccmp+tkip')
		value = 'tkip+ccmp';

	return value;
}

function getDisplayEncryption(radioNet) {
	const encryption = radioNet.getActiveEncryption();

	if (encryption && encryption != '-')
		return encryption;

	return formatConfigEncryption(getConfigEncryptionValue(radioNet.getName(), uci.get('wireless', radioNet.getWifiDeviceName(), 'type')));
}

function getDisplayBSSID(radioNet) {
	const bssid = uci.get('wireless', radioNet.getName(), 'macaddr') ||
		uci.get('wireless', radioNet.getWifiDeviceName(), 'macaddr') ||
		radioNet.getBSSID() || radioNet.getActiveBSSID();

	if (bssid && bssid != '00:00:00:00:00:00')
		return String(bssid).toUpperCase();

	return bssid || null;
}

function getFtIdentifier(radioNet) {
	const bssid = getDisplayBSSID(radioNet);
	return bssid ? String(bssid).replace(/:/g, '').toUpperCase() : null;
}

function getConfiguredTxPower(radioNet) {
	const cfgvalue = +uci.get('wireless', radioNet.getWifiDeviceName(), 'txpower');
	return (!isNaN(cfgvalue) && cfgvalue > 0) ? cfgvalue : null;
}

function isPlausibleTxPowerValue(txpower, hwtype) {
	if (txpower == null || isNaN(txpower) || txpower <= 0)
		return false;
	if (isQcaWifiHwtype(hwtype) && txpower > 40)
		return false;

	return true;
}

function getDisplayTxPower(radioNet) {
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
	const txpower = radioNet.getTXPower();
	const cfgvalue = getConfiguredTxPower(radioNet);
	const iwinfo = cachedIwinfoInfoMap ? cachedIwinfoInfoMap[radioNet.getWifiDeviceName()] : null;

	if (isQcaWifiHwtype(hwtype)) {
		if (isPlausibleTxPowerValue(iwinfo != null ? iwinfo.txpower : null, hwtype))
			return iwinfo.txpower;
		if (isPlausibleTxPowerValue(txpower, hwtype))
			return txpower;
		if (isPlausibleTxPowerValue(cfgvalue, hwtype))
			return cfgvalue;
		return null;
	}

	if (isPlausibleTxPowerValue(txpower, hwtype))
		return txpower;
	if (isPlausibleTxPowerValue(iwinfo != null ? iwinfo.txpower : null, hwtype))
		return iwinfo.txpower;
	if (isPlausibleTxPowerValue(cfgvalue, hwtype))
		return cfgvalue;

	return null;
}

function getDisplayTxPowerLabel() {
	return _('Tx-Power');
}

function getDisplayChannel(radioNet) {
	let channel = radioNet.getChannel();

	if (channel != null && channel !== '' && channel !== 'auto')
		return +channel;

	channel = uci.get('wireless', radioNet.getWifiDeviceName(), 'channel');

	if (channel != null && channel !== '' && channel !== 'auto')
		return +channel;

	return null;
}

function getDerivedFrequencyGHz(hwmode, channel) {
	hwmode = String(hwmode || '');

	if (channel == null || isNaN(channel))
		return null;
	if (channel == 14)
		return '2.484';
	if (channel >= 1 && channel <= 13)
		return '%.03f'.format((2407 + channel * 5) / 1000);
	if (/^11axg|^11ng|^11beg/.test(hwmode) && channel >= 1 && channel <= 13)
		return '%.03f'.format((2407 + channel * 5) / 1000);
	if (channel >= 36 && channel <= 196)
		return '%.03f'.format((5000 + channel * 5) / 1000);
	if (channel >= 1 && channel <= 233)
		return '%.03f'.format((5950 + channel * 5) / 1000);

	return null;
}

function getDisplayFrequency(radioNet, channel) {
	const frequency = radioNet.getFrequency();
	const hwmode = uci.get('wireless', radioNet.getWifiDeviceName(), 'hwmode') || '';

	if (frequency != null && frequency !== '')
		return frequency;

	return getDerivedFrequencyGHz(hwmode, channel);
}

function getConfiguredBand(hwtype, hwmode, channel, bandval) {
	hwmode = String(hwmode || '');
	bandval = String(bandval || '');
	channel = +channel;

	if (bandval)
		return bandval;
	if (/^11bea/.test(hwmode))
		return (!isNaN(channel) && channel > 0 && channel < 36) ? '6g' : '5g';
	if (/^11beg|^11axg|^11ng|^11g|^11b/.test(hwmode))
		return '2g';
	if (/^11ac|^11axa|^11na|^11a/.test(hwmode))
		return '5g';
	if (/a/.test(hwmode))
		return '5g';
	if (/g|b/.test(hwmode))
		return '2g';

	return null;
}

function getConfiguredWirelessMode(hwtype, hwmode, htmode) {
	hwmode = String(hwmode || '');
	htmode = String(htmode || '');

	if (/^11be/.test(hwmode) || /^EHT/.test(htmode))
		return 'be';
	if (/^11ax/.test(hwmode) || /^HE/.test(htmode))
		return 'ax';
	if (/^11ac/.test(hwmode) || /^VHT/.test(htmode))
		return 'ac';
	if (/^11n/.test(hwmode) || /^HT/.test(htmode))
		return 'n';

	return '';
}

function getFrequencyListBand(entry, hwmode) {
	const mhz = +entry.mhz;
	const channel = +entry.channel;
	const band = +entry.band;

	if (!isNaN(mhz)) {
		if (mhz >= 58320)
			return '60g';
		if (mhz >= 5925)
			return '6g';
		if (mhz >= 5000)
			return '5g';
		if (mhz >= 2400)
			return '2g';
	}

	if (!isNaN(channel)) {
		if (channel == 14 || (channel >= 1 && channel <= 13))
			return '2g';
		if (channel >= 36 && channel <= 196)
			return '5g';
		if (channel >= 1 && channel <= 233 && /^11bea|^11beg/.test(String(hwmode || '')))
			return (/^11beg/.test(String(hwmode || ''))) ? '2g' : '6g';
		if (channel >= 1 && channel <= 233)
			return '6g';
	}

	if (band == 2 || band == 5 || band == 6 || band == 60)
		return '%dg'.format(band);

	return null;
}

function normalizeIwinfoBitRate(rate) {
	rate = +rate;

	if (isNaN(rate) || rate <= 0)
		return null;

	return (rate > 100000) ? (rate / 1000) : rate;
}

function getIwinfoInfoCandidates(radioNet) {
	const candidates = [];
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
	const ifname = radioNet.getIfname();
	const section = radioNet.getName();
	const device = radioNet.getWifiDeviceName();

	if (ifname)
		candidates.push(ifname);
	if (section && candidates.indexOf(section) < 0)
		candidates.push(section);

	if (isQcaWifiHwtype(hwtype) && /^wifi\d+$/.test(device)) {
		let fallback = section;

		if (!/^ath\d+$/.test(fallback))
			fallback = 'ath' + device.replace(/^wifi/, '');

		if (candidates.indexOf(fallback) < 0)
			candidates.push(fallback);
	}

	if (device && candidates.indexOf(device) < 0)
		candidates.push(device);

	return candidates;
}

function getDisplayIwinfoBitRate(radioNet) {
	for (const candidate of getIwinfoInfoCandidates(radioNet)) {
		const info = cachedIwinfoInfoMap ? cachedIwinfoInfoMap[candidate] : null;
		const rate = normalizeIwinfoBitRate(info != null ? info.bitrate : null);

		if (rate != null)
			return rate;
	}

	return null;
}

function getDisplayBitRate(radioNet) {
	let rate = radioNet.getBitRate();
	const hwmode = uci.get('wireless', radioNet.getWifiDeviceName(), 'hwmode') || '';
	const htmode = uci.get('wireless', radioNet.getWifiDeviceName(), 'htmode') || '';

	if (rate != null && rate > 0)
		return rate;

	rate = getDisplayIwinfoBitRate(radioNet);
	if (rate != null)
		return rate;

	if (/^11be/.test(hwmode)) {
		switch (htmode) {
		case 'HT20':
		case 'EHT20': return 344.1;
		case 'HT40':
		case 'EHT40': return 688.2;
		case 'HT80':
		case 'EHT80': return 1441.2;
		case 'HT160':
		case 'EHT160': return 2882.4;
		case 'HT320':
		case 'EHT320': return 5764.7;
		}
	}

	if (/^11ax/.test(hwmode)) {
		switch (htmode) {
		case 'HT20':
		case 'HE20': return 286.8;
		case 'HT40':
		case 'HE40': return 573.5;
		case 'HT80':
		case 'HE80': return 1201.0;
		case 'HT160':
		case 'HE160': return 2402.0;
		}
	}

	if (/^11ac/.test(hwmode)) {
		switch (htmode) {
		case 'HT20':
		case 'VHT20': return 173.3;
		case 'HT40':
		case 'VHT40': return 400.0;
		case 'HT80':
		case 'VHT80': return 866.7;
		case 'HT160':
		case 'VHT160':
		case 'HT80_80': return 1733.3;
		}
	}

	if (/^11ng/.test(hwmode) || /^11na/.test(hwmode)) {
		switch (htmode) {
		case 'HT20': return 144.4;
		case 'HT40': return 300.0;
		}
	}

	return null;
}

function getAssocListCandidates(radioNet) {
	const candidates = [];
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
	const ifname = radioNet.getIfname();
	const section = radioNet.getName();

	if (ifname)
		candidates.push(ifname);
	if (section && candidates.indexOf(section) < 0)
		candidates.push(section);

	if (isQcaWifiHwtype(hwtype) && /^wifi\d+$/.test(radioNet.getWifiDeviceName())) {
		let fallback = section;

		if (!/^ath\d+$/.test(fallback))
			fallback = 'ath' + radioNet.getWifiDeviceName().replace(/^wifi/, '');

		if (candidates.indexOf(fallback) < 0)
			candidates.push(fallback);
	}

	return candidates;
}

function parseWlanconfigRate(rate) {
	const match = String(rate || '').trim().match(/^([0-9]+(?:\.[0-9]+)?)([KMG])$/i);
	let value = match ? parseFloat(match[1]) : NaN;
	const unit = match ? match[2].toUpperCase() : null;

	if (isNaN(value) || unit == null)
		return null;

	if (unit == 'G')
		value *= 1000;
	else if (unit == 'K')
		value /= 1000;

	return Math.round(value * 1000);
}

function parseWlanconfigMode(mode) {
	const meta = { mhz: 20 };
	const match = String(mode || '').match(/_(EHT|HE|VHT|HT)(20|40|80|160|320|80_80)$/);

	if (!match)
		return meta;

	if (match[1] == 'HT')
		meta.ht = true;
	else if (match[1] == 'VHT')
		meta.vht = true;
	else if (match[1] == 'HE')
		meta.he = true;
	else if (match[1] == 'EHT')
		meta.eht = true;

	meta.mhz = (match[2] == '80_80') ? 160 : +match[2];
	return meta;
}

function parseWlanconfigAssoclist(stdout) {
	const lines = String(stdout || '').split(/\n/);
	const entries = [];
	let current = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (!line)
			continue;

		if (/^[0-9a-f]{2}(?::[0-9a-f]{2}){5}\b/i.test(line)) {
			const tokens = line.split(/\s+/);

			if (tokens.length < 9)
				continue;

			const mode = (tokens.length >= 4) ? tokens[tokens.length - 4] : '';
			const signal = parseInt(tokens[5], 10);
			const rxnss = parseInt(tokens[tokens.length - 3], 10);
			const txnss = parseInt(tokens[tokens.length - 2], 10);
			const rateMeta = parseWlanconfigMode(mode);
			const rx = Object.assign({ rate: parseWlanconfigRate(tokens[4]), mhz: rateMeta.mhz }, rateMeta);
			const tx = Object.assign({ rate: parseWlanconfigRate(tokens[3]), mhz: rateMeta.mhz }, rateMeta);

			if (!isNaN(rxnss))
				rx.nss = rxnss;
			if (!isNaN(txnss))
				tx.nss = txnss;

			current = {
				mac: tokens[0].toUpperCase(),
				signal: isNaN(signal) ? null : signal,
				noise: null,
				rx,
				tx
			};

			if (current.rx.rate != null && current.tx.rate != null)
				entries.push(current);

			continue;
		}

		if (!current)
			continue;

		const snr = line.match(/^SNR\s*:\s*(-?\d+)/i);
		if (snr != null && current.signal != null)
			current.noise = current.signal - parseInt(snr[1], 10);
	}

	return entries;
}

function callWlanconfigAssoclistCompat(device) {
	return L.resolveDefault(fs.exec_direct('/usr/sbin/wlanconfig', [ device, 'list', 'sta' ]), '').then(parseWlanconfigAssoclist);
}

function probeAssocListCandidates(candidates, probeFn) {
	let index = 0;

	function tryNext() {
		if (index >= candidates.length)
			return [];

		return probeFn(candidates[index++]).then((entries) => {
			if (Array.isArray(entries) && entries.length)
				return entries;

			return tryNext();
		}).catch(() => tryNext());
	}

	return tryNext();
}

function getAssocListForNetwork(radioNet) {
	const candidates = getAssocListCandidates(radioNet);
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');

	function tryFallbackAssoclist() {
		if (!isQcaWifiHwtype(hwtype) || radioNet.getMode() != 'ap')
			return [];

		return probeAssocListCandidates(candidates, callWlanconfigAssoclistCompat);
	}

	return radioNet.getAssocList().then((entries) => {
		if (Array.isArray(entries) && entries.length)
			return entries;

		return probeAssocListCandidates(candidates, callIwinfoAssoclistCompat).then((compatEntries) => {
			if (Array.isArray(compatEntries) && compatEntries.length)
				return compatEntries;

			return tryFallbackAssoclist();
		});
	}).catch(() => probeAssocListCandidates(candidates, callIwinfoAssoclistCompat).then((compatEntries) => {
		if (Array.isArray(compatEntries) && compatEntries.length)
			return compatEntries;

		return tryFallbackAssoclist();
	}));
}

function isDisplayAssociated(radioNet, hwtype, mode, bssid, channel, disabled) {
	if (bssid && bssid != '00:00:00:00:00:00' && channel && mode != 'Unknown' && !disabled)
		return true;
	if (isQcaWifiHwtype(hwtype) && !disabled && radioNet.getMode() == 'ap' && channel)
		return true;

	return false;
}

function getDisplaySignalPercent(radioNet, hwtype, is_assoc, disabled) {
	if (disabled)
		return -1;
	if (hwtype == 'mt_dbdc')
		return (radioNet.isUp() || is_assoc) ? 100 : -1;
	if (isQcaWifiHwtype(hwtype) && radioNet.getMode() == 'ap')
		return is_assoc ? 100 : 0;
	if (radioNet.isUp())
		return radioNet.getSignalPercent();

	return is_assoc ? 0 : -1;
}

function getDisplaySignalValue(radioNet, hwtype, is_assoc) {
	if ((hwtype == 'mt_dbdc' || (isQcaWifiHwtype(hwtype) && radioNet.getMode() == 'ap')) && is_assoc)
		return getDisplayTxPower(radioNet);

	return radioNet.getSignal();
}

function getDisplayNoiseValue(radioNet, hwtype, is_assoc) {
	if ((hwtype == 'mt_dbdc' || (isQcaWifiHwtype(hwtype) && radioNet.getMode() == 'ap')) && is_assoc)
		return null;

	return radioNet.getNoise();
}

function renderStatusRow(pairs, className) {
	const row = E('div', { 'class': className });
	let added = 0;

	for (const [ label, value ] of pairs) {
		if (value == null)
			continue;

		if (added++)
			row.appendChild(E('span', { 'class': 'wireless-status-sep' }, ' | '));

		row.appendChild(E('span', { 'class': 'nowrap' }, [
			E('strong', `${label}: `),
			value
		]));
	}

	return added ? row : null;
}

function render_signal_badge(signalPercent, signalValue, noiseValue, wrap, mode) {
	let icon = L.resource('icons/signal-075-100.svg'), title, value;

	switch(true) {
	case(signalPercent  < 0): icon = L.resource('icons/signal-none.svg'); 	break;
	case(signalPercent == 0): icon = L.resource('icons/signal-000-000.svg');		break;
	case(signalPercent < 25): icon = L.resource('icons/signal-000-025.svg'); 	break;
	case(signalPercent < 50): icon = L.resource('icons/signal-025-050.svg');	break;
	case(signalPercent < 75): icon = L.resource('icons/signal-050-075.svg');	break;
	}

	if (signalValue) {
		if (noiseValue) {
			value = `${signalValue}/${noiseValue}\xa0${_('dBm')}`;
			title = [
				`${_('Signal')}: ${signalValue} ${_('dBm')}`,
				`${_('Noise')}: ${noiseValue} ${_('dBm')}`,
				`${_('SNR')}: ${signalValue - noiseValue} ${_('dBm')}`
			].filter(Boolean).join(' / ');
		}
		else {
			value = `${signalValue}\xa0${_('dBm')}`;
			title = `${_('Signal')} ${signalValue} ${_('dBm')}`;
		}
	}
	else if (signalPercent > -1) {
		switch (mode) {
			case 'ap':
				title = _('No client associated');
				break;

			case 'sta':
			case 'adhoc':
			case 'mesh':
				title = _('Not associated');
				break;

			default:
				title = _('No RX signal');
		}

		if (noiseValue) {
			value = `---/${noiseValue}\xa0${_('dBm')}`;
			title = `${title} / ${_('Noise')}: ${noiseValue} ${_('dBm')}`;
		}
		else {
			value = `---\xa0${_('dBm')}`;
		}
	}
	else {
		value = E('em', {}, E('small', {}, [ _('disabled') ]));
		title = _('Interface is disabled');
	}

	return E('div', {
		'class': wrap ? 'center' : 'ifacebadge',
		'title': title,
		'data-signal': signalValue,
		'data-noise': noiseValue
	}, [
		E('img', { 'src': icon }),
		E('span', {}, [
			wrap ? E('br') : ' ',
			value
		])
	]);
}

function render_network_badge(radioNet) {
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
	const mode = radioNet.getActiveMode();
	const bssid = getDisplayBSSID(radioNet);
	const channel = getDisplayChannel(radioNet);
	const disabled = isNetworkDisabled(radioNet);
	const is_assoc = isDisplayAssociated(radioNet, hwtype, mode, bssid, channel, disabled);

	return render_signal_badge(
		getDisplaySignalPercent(radioNet, hwtype, is_assoc, disabled),
		getDisplaySignalValue(radioNet, hwtype, is_assoc),
		getDisplayNoiseValue(radioNet, hwtype, is_assoc), false, radioNet.getMode());
}

function render_radio_status(radioDev, wifiNets) {
	const name = getRadioDisplayName(radioDev);
	const node = E('div', [ E('big', {}, E('strong', {}, name)), E('div') ]);
	let channel, frequency, bitrate;

	wifiNets.forEach(wifiNet => {
		channel   = channel   ?? getDisplayChannel(wifiNet);
		frequency = frequency ?? getDisplayFrequency(wifiNet, channel);
		bitrate   = bitrate   ?? getDisplayBitRate(wifiNet);
	});

	if (isRadioDisplayUp(radioDev, wifiNets))
		L.itemlist(node.lastElementChild, [
			_('Channel'), `${channel || '?'} (${frequency || '?'} ${_('GHz')})`,
			_('Bitrate'), `${bitrate || '?'} ${_('Mbit/s')}`
		], ' | ');
	else
		node.lastElementChild.appendChild(E('em', _('Device is not active')));

	return node;
}

function render_network_status(radioNet) {
	const mode = radioNet.getActiveMode();
	const bssid = getDisplayBSSID(radioNet);
	const channel = getDisplayChannel(radioNet);
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
	const disabled = isNetworkDisabled(radioNet);
	const is_assoc = isDisplayAssociated(radioNet, hwtype, mode, bssid, channel, disabled);
	const is_mesh = (radioNet.getMode() == 'mesh');
	const changecount = count_changes(radioNet.getName());
	let status_text = null;

	if (changecount)
		status_text = E('a', {
			href: '#',
			click: L.bind(ui.changes.displayChanges, ui.changes)
		}, _('Interface has %d pending changes').format(changecount));
	else if (!is_assoc)
		status_text = E('em', disabled ? _('Wireless is disabled') : _('Wireless is not associated'));

	return L.itemlist(E('div'), [
		is_mesh ? _('Mesh ID') : _('SSID'), (is_mesh ? radioNet.getMeshID() : radioNet.getSSID()) ?? '?',
		_('Mode'),       mode,
		_('BSSID'),      (!changecount && is_assoc) ? bssid : null,
		_('Encryption'), (!changecount && is_assoc) ? getDisplayEncryption(radioNet) : null,
		'',            status_text
	], [ ' | ', E('br') ]);
}

function render_modal_status(node, radioNet) {
	if (!radioNet) return;

	const mode = radioNet.getActiveMode();
	const bssid = getDisplayBSSID(radioNet);
	const channel = getDisplayChannel(radioNet);
	const frequency = getDisplayFrequency(radioNet, channel);
	const bitrate = getDisplayBitRate(radioNet);
	const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
	const disabled = isNetworkDisabled(radioNet);
	const is_assoc = isDisplayAssociated(radioNet, hwtype, mode, bssid, channel, disabled);
	const noise = getDisplayNoiseValue(radioNet, hwtype, is_assoc);
	const txpower = getDisplayTxPower(radioNet);

	if (node == null)
		node = E('span', { 'class': 'ifacebadge large', 'data-network': radioNet.getName() }, [ E('small'), E('span') ]);

	dom.content(node.firstElementChild, render_signal_badge(
		getDisplaySignalPercent(radioNet, hwtype, is_assoc, disabled),
		getDisplaySignalValue(radioNet, hwtype, is_assoc), noise, true, radioNet.getMode()));

	L.itemlist(node.lastElementChild, [
		_('Mode'),       mode,
		_('SSID'),       radioNet.getSSID() ?? '?',
		_('BSSID'),      is_assoc ? bssid : null,
		_('Encryption'), is_assoc ? getDisplayEncryption(radioNet) : null,
		_('Channel'),    is_assoc ? `${channel} (${frequency ?? 0} ${_('GHz')})` : null,
		getDisplayTxPowerLabel(radioNet), (is_assoc && txpower != null) ? `${txpower} ${_('dBm')}` : null,
		_('Signal'),     (is_assoc && noise != null) ? `${radioNet.getSignal()} ${_('dBm')}` : null,
		_('Noise'),      (is_assoc && noise != null) ? `${noise} ${_('dBm')}` : null,
		_('Bitrate'),    is_assoc ? `${bitrate ?? 0} ${_('Mbit/s')}` : null,
		_('Country'),    is_assoc ? radioNet.getCountryCode() : null
	], [ ' | ', E('br'), E('br'), E('br'), E('br'), E('br'), ' | ', E('br'), ' | ' ]);

	if (!is_assoc)
		dom.append(node.lastElementChild, E('em', disabled ? _('Wireless is disabled') : _('Wireless is not associated')));

	return node;
}

function format_wifirate(rate) {
	let s = `${rate.rate / 1000}\xa0${_('Mbit/s')}, ${rate.mhz}\xa0${_('MHz')}`;

	if (rate?.ht || rate?.vht) s += [
		rate?.vht && `, VHT-MCS\xa0${rate?.mcs}`,
		rate?.nss && `, VHT-NSS\xa0${rate?.nss}`,
		rate?.ht  && `, MCS\xa0${rate?.mcs}`,
		rate?.short_gi && ', ' + _('Short GI').replace(/ /g, '\xa0')
	].filter(Boolean).join('');

	if (rate?.he) s += [
		`, HE-MCS\xa0${rate?.mcs}`,
		rate?.nss    && `, HE-NSS\xa0${rate?.nss}`,
		rate?.he_gi  && `, HE-GI\xa0${rate?.he_gi}`,
		rate?.he_dcm && `, HE-DCM\xa0${rate?.he_dcm}`
	].filter(Boolean).join('');

	if (rate?.eht) s += [
		`, EHT-MCS\xa0${rate?.mcs}`,
		rate?.nss    && `, EHT-NSS\xa0${rate?.nss}`,
		rate?.eht_gi  && `, EHT-GI\xa0${rate?.eht_gi}`,
		rate?.eht_dcm && `, EHT-DCM\xa0${rate?.eht_dcm}`
	].filter(Boolean).join('');

	return s;
}

function radio_restart(id, ev) {
	const row = document.querySelector('.cbi-section-table-row[data-sid="%s"]'.format(id));
	const dsc = row.querySelector('[data-name="_stat"] > div');
	const btn = row.querySelector('.cbi-section-actions button');

	btn.blur();
	btn.classList.add('spinning');
	btn.disabled = true;

	dsc.setAttribute('restart', '');
	dom.content(dsc, E('em', _('Device is restarting…')));
}

function network_updown(id, map, ev) {
	const radio = uci.get('wireless', id, 'device');
	const disabled = (uci.get('wireless', id, 'disabled') == '1') ||
	               (uci.get('wireless', radio, 'disabled') == '1');

	if (disabled) {
		uci.unset('wireless', id, 'disabled');
		uci.unset('wireless', radio, 'disabled');
	}
	else {
		uci.set('wireless', id, 'disabled', '1');

		let all_networks_disabled = true;
		const wifi_ifaces = uci.sections('wireless', 'wifi-iface');

		wifi_ifaces.forEach(wifi_iface => {
			if (wifi_iface.device == radio && wifi_iface.disabled != '1')
				all_networks_disabled = false;
		});

		if (all_networks_disabled)
			uci.set('wireless', radio, 'disabled', '1');
	}

	return map.save().then(function() {
		ui.changes.apply();
	});
}

function next_free_sid(offset) {
	let sid = 'wifinet' + offset;

	while (uci.get('wireless', sid))
		sid = 'wifinet' + (++offset);

	return sid;
}

function add_dependency_permutations(o, deps) {
	let res = [{}];

	Object.entries(deps).forEach(([key, list]) => {
		if (!Array.isArray(list)) return;

		res = list.flatMap(value => res.map(item => ({ ...item, [key]: value })));
	});

	res.forEach(dep => o.depends(dep));
}

// Define a class CBIWifiFrequencyValue that extends form.Value
var CBIWifiFrequencyValue = form.Value.extend({
	getDeviceSection: function(section_id) {
		return this.ucisection || section_id;
	},

	callFrequencyList: rpc.declare({
		object: 'iwinfo',
		method: 'freqlist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	load: function(section_id) {
		const device_section = this.getDeviceSection(section_id);
		const hwtype = uci.get('wireless', device_section, 'type');
		const hwval = uci.get('wireless', device_section, 'hwmode');
		const htval = uci.get('wireless', device_section, 'htmode');
		const chval = +uci.get('wireless', device_section, 'channel');
		const allow_auto = (hwtype == 'mt_dbdc' || uci.get('wireless', device_section, 'channel') == 'auto' || L.hasSystemFeature('hostapd', 'acs'));

		return Promise.all([
			network.getWifiDevice(device_section),
			this.callFrequencyList(device_section)
		]).then(L.bind(function(data) {
			const wifidevs = data[0];
			const freqlist = data[1];

			this.channels = {
				'2g': allow_auto ? [ 'auto', 'auto', { available: true } ] : [],
				'5g': allow_auto ? [ 'auto', 'auto', { available: true } ] : [],
				'6g': allow_auto ? [ 'auto', 'auto', { available: true } ] : [],
				'60g': []
			};

			for (const freq of freqlist) {
				const band = getFrequencyListBand(freq, hwval);

				if (!band || !Array.isArray(this.channels[band]))
					continue;

				this.channels[band].push(
					freq.channel,
					'%d (%d Mhz)'.format(freq.channel, freq.mhz),
					{ available: !(freq.restricted && freq.no_ir), no_outdoor: freq.no_outdoor }
				);
			}

			const hwmodelist = L.toArray(wifidevs ? wifidevs.getHWModes() : null)
				.reduce((obj, value) => { obj[value] = true; return obj; }, {});
			const htmodelist = L.toArray(wifidevs ? wifidevs.getHTModes() : null)
				.reduce((obj, value) => { obj[value] = true; return obj; }, {});

			const has_ac = hwmodelist.ac && (L.hasSystemFeature('hostapd', '11ac') || htmodelist.VHT20 || htmodelist.VHT40 || htmodelist.VHT80 || htmodelist.VHT160);
			const has_ax = hwmodelist.ax && (L.hasSystemFeature('hostapd', '11ax') || htmodelist.HE20 || htmodelist.HE40 || htmodelist.HE80 || htmodelist.HE160);
			const has_be = hwmodelist.be && (L.hasSystemFeature('hostapd', '11be') || htmodelist.EHT20 || htmodelist.EHT40 || htmodelist.EHT80 || htmodelist.EHT160 || htmodelist.EHT320);

			if (isQcaWifiHwtype(hwtype)) {
				const qca_has_be = has_be || /^11be/.test(hwval);
				const qca_has_ax = qca_has_be || has_ax || /^11ax/.test(hwval);
				const qca_has_ac = qca_has_ax || has_ac || /^11ac/.test(hwval);
				const qca_has_n = qca_has_ac || hwmodelist.n || /^11n/.test(hwval);
				const qca_has_htinfo = (Object.keys(htmodelist).length > 0);
				const qca_ht20 = !!(!qca_has_htinfo || htmodelist.HT20 || htmodelist.VHT20 || htmodelist.HE20 || htmodelist.EHT20 || /^HT20$/.test(htval));
				const qca_ht40 = !!(!qca_has_htinfo || htmodelist.HT40 || htmodelist.VHT40 || htmodelist.HE40 || htmodelist.EHT40 || /^HT40$/.test(htval));
				const qca_ht80 = !!(!qca_has_htinfo || htmodelist.VHT80 || htmodelist.HE80 || htmodelist.EHT80 || /^HT80$/.test(htval));
				const qca_ht160 = !!(htmodelist.VHT160 || htmodelist.HE160 || htmodelist.EHT160 || /^HT160$/.test(htval));
				const qca_ht320 = !!(htmodelist.EHT320 || /^HT320$/.test(htval));

				this.modes = [
					'', 'Legacy', { available: false },
					'n', 'N', { available: qca_has_n },
					'ac', 'AC', { available: qca_has_ac },
					'ax', 'AX', { available: qca_has_ax },
					'be', 'BE', { available: qca_has_be }
				];

				this.htmodes = {
					'': [ '', '-', { available: true } ],
					'n': [
						'HT20', '20 MHz', { available: qca_ht20 },
						'HT40', '40 MHz', { available: qca_ht40 }
					],
					'ac': [
						'HT20', '20 MHz', { available: qca_ht20 },
						'HT40', '40 MHz', { available: qca_ht40 },
						'HT80', '80 MHz', { available: qca_ht80 },
						'HT160', '160 MHz', { available: qca_ht160 },
						'HT80_80', '80+80 MHz', { available: /^HT80_80$/.test(htval) }
					],
					'ax': [
						'HT20', '20 MHz', { available: qca_ht20 },
						'HT40', '40 MHz', { available: qca_ht40 },
						'HT80', '80 MHz', { available: qca_ht80 },
						'HT160', '160 MHz', { available: qca_ht160 }
					],
					'be': [
						'HT20', '20 MHz', { available: qca_ht20 },
						'HT40', '40 MHz', { available: qca_ht40 },
						'HT80', '80 MHz', { available: qca_ht80 },
						'HT160', '160 MHz', { available: qca_ht160 },
						'HT320', '320 MHz', { available: qca_ht320 }
					]
				};

				this.bands = {
					'': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 },
						'6g', '6 GHz', { available: this.channels['6g'].length > 0 }
					],
					'n': [ '2g', '2.4 GHz', { available: this.channels['2g'].length > 0 } ],
					'ac': [ '5g', '5 GHz', { available: this.channels['5g'].length > 0 } ],
					'ax': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 }
					],
					'be': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 },
						'6g', '6 GHz', { available: this.channels['6g'].length > 0 }
					]
				};
			}
			else {
				this.modes = [
					'', 'Legacy', { available: hwmodelist.a || hwmodelist.b || hwmodelist.g },
					'n', 'N', { available: hwmodelist.n },
					'ac', 'AC', { available: has_ac },
					'ax', 'AX', { available: has_ax },
					'be', 'BE', { available: has_be }
				];

				this.htmodes = {
					'': [ '', '-', { available: true } ],
					'n': [
						'HT20', '20 MHz', { available: htmodelist.HT20 },
						'HT40', '40 MHz', { available: htmodelist.HT40 }
					],
					'ac': [
						'VHT20', '20 MHz', { available: htmodelist.VHT20 },
						'VHT40', '40 MHz', { available: htmodelist.VHT40 },
						'VHT80', '80 MHz', { available: htmodelist.VHT80 },
						'VHT160', '160 MHz', { available: htmodelist.VHT160 }
					],
					'ax': [
						'HE20', '20 MHz', { available: htmodelist.HE20 },
						'HE40', '40 MHz', { available: htmodelist.HE40 },
						'HE80', '80 MHz', { available: htmodelist.HE80 },
						'HE160', '160 MHz', { available: htmodelist.HE160 }
					],
					'be': [
						'EHT20', '20 MHz', { available: htmodelist.EHT20 },
						'EHT40', '40 MHz', { available: htmodelist.EHT40 },
						'EHT80', '80 MHz', { available: htmodelist.EHT80 },
						'EHT160', '160 MHz', { available: htmodelist.EHT160 },
						'EHT320', '320 MHz', { available: htmodelist.EHT320 }
					]
				};

				this.bands = {
					'': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 },
						'60g', '60 GHz', { available: this.channels['60g'].length > 0 }
					],
					'n': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 }
					],
					'ac': [ '5g', '5 GHz', { available: this.channels['5g'].length > 0 } ],
					'ax': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 },
						'6g', '6 GHz', { available: this.channels['6g'].length > 0 }
					],
					'be': [
						'2g', '2.4 GHz', { available: this.channels['2g'].length > 0 },
						'5g', '5 GHz', { available: this.channels['5g'].length > 0 },
						'6g', '6 GHz', { available: this.channels['6g'].length > 0 }
					]
				};
			}
		}, this));
	},

	// Set values in the select element
	setValues: function(sel, vals) {
		if (sel.vals)
			sel.vals.selected = sel.selectedIndex;

		sel.options.length = 0;

		for (let i = 0; vals && i < vals.length; i += 3)
			if (vals[i+2]?.available)
				sel.add(E('option', { value: vals[i] }, [ vals[i+1] ]));

		if (Number.isInteger(vals?.selected)) sel.selectedIndex = vals.selected;

		sel.parentNode.style.display = (sel.options.length <= 1) ? 'none' : '';
		sel.vals = vals;
	},

	toggleWifiMode: function(elem) {
		this.toggleWifiHTMode(elem);
		this.toggleWifiBand(elem);
	},

	toggleWifiHTMode: function(elem) {
		const mode = elem.querySelector('.mode');
		const bwdt = elem.querySelector('.htmode');

		this.setValues(bwdt, this.htmodes[mode.value]);
	},

	toggleWifiBand: function(elem) {
		const mode = elem.querySelector('.mode');
		const band = elem.querySelector('.band');

		this.setValues(band, this.bands[mode.value]);
		this.toggleWifiChannel(elem);

		this.map.checkDepends();
	},

	checkWifiChannelRestriction: function(elem) {
		const band = elem.querySelector('.band');
		const chan = elem.querySelector('.channel');
		const restricted_chan = elem.querySelector('.restricted_channel');
		const channels = this.channels[band.value];

		if (chan.selectedIndex < 0)
			return;

		const no_outdoor = channels[(chan.selectedIndex*3)+2].no_outdoor;
		restricted_chan.style.display = no_outdoor ? '': 'none';
	},

	toggleWifiChannel: function(elem) {
		const band = elem.querySelector('.band');
		const chan = elem.querySelector('.channel');

		this.setValues(chan, this.channels[band.value]);

		this.map.checkDepends();
		this.checkWifiChannelRestriction(elem);
	},

	setInitialValues: function(section_id, elem) {
		const mode = elem.querySelector('.mode');
		const band = elem.querySelector('.band');
		const chan = elem.querySelector('.channel');
		const bwdt = elem.querySelector('.htmode');
		const config_section = this.getDeviceSection(section_id);
		const hwtype = uci.get('wireless', config_section, 'type');
		const htval = uci.get('wireless', config_section, 'htmode');
		const hwval = uci.get('wireless', config_section, 'hwmode');
		const chval = uci.get('wireless', config_section, 'channel');
		const bandval = uci.get('wireless', config_section, 'band');

		this.setValues(mode, this.modes);

		if (isQcaWifiHwtype(hwtype))
			mode.value = getConfiguredWirelessMode(hwtype, hwval, htval);
		else if (/EHT20|EHT40|EHT80|EHT160|EHT320/.test(htval))
			mode.value = 'be';
		else if (/HE20|HE40|HE80|HE160/.test(htval))
			mode.value = 'ax';
		else if (/VHT20|VHT40|VHT80|VHT160/.test(htval))
			mode.value = 'ac';
		else if (/HT20|HT40/.test(htval))
			mode.value = 'n';
		else
			mode.value = '';

		this.toggleWifiMode(elem);

		if (isQcaWifiHwtype(hwtype)) {
			this.useBandOption = true;
			band.value = getConfiguredBand(hwtype, hwval, chval, bandval);
		}
		else if (hwval != null) {
			this.useBandOption = false;
			band.value = /a/.test(hwval) ? '5g': '2g';
		}
		else {
			this.useBandOption = true;
			band.value = bandval;
		}

		this.toggleWifiBand(elem);

		bwdt.value = htval;
		chan.value = chval ?? (chan.options[0] ? chan.options[0].value : 'auto');

		this.checkWifiChannelRestriction(elem);

		return elem;
	},

	renderWidget: function(section_id, option_index, cfgvalue) {
		const elem = E('div');

		dom.content(elem, [
			E('div', { 'class' : 'restricted_channel', 'style': 'display:none'}, [
				E('div', {'class': 'cbi-button alert-message warning disabled'}, _('Indoor Only Channel Selected'))
			]),
			E('label', { 'style': 'float:left; margin-right:3px' }, [
				_('Mode'), E('br'),
				E('select', {
					'class': 'mode',
					'style': 'width:auto',
					'change': L.bind(this.toggleWifiMode, this, elem),
					'disabled': (this.disabled != null) ? this.disabled : this.map.readonly
				})
			]),
			E('label', { 'style': 'float:left; margin-right:3px' }, [
				_('Band'), E('br'),
				E('select', {
					'class': 'band',
					'style': 'width:auto',
					'change': L.bind(this.toggleWifiBand, this, elem),
					'disabled': (this.disabled != null) ? this.disabled : this.map.readonly
				})
			]),
			E('label', { 'style': 'float:left; margin-right:3px' }, [
				_('Channel'), E('br'),
				E('select', {
					'class': 'channel',
					'style': 'width:auto',
					'change': L.bind(this.toggleWifiChannel, this, elem),
					'disabled': (this.disabled != null) ? this.disabled : this.map.readonly
				})
			]),
			E('label', { 'style': 'float:left; margin-right:3px' }, [
				_('Width'), E('br'),
				E('select', {
					'class': 'htmode',
					'style': 'width:auto',
					'change': L.bind(this.map.checkDepends, this.map),
					'disabled': (this.disabled != null) ? this.disabled : this.map.readonly
				})
			]),
			E('br', { 'style': 'clear:left' })
		]);

		return this.setInitialValues(section_id, elem);
	},

	cfgvalue: function(section_id) {
		const config_section = this.getDeviceSection(section_id);

		return [
			uci.get('wireless', config_section, 'htmode'),
			uci.get('wireless', config_section, 'hwmode') || uci.get('wireless', config_section, 'band'),
			uci.get('wireless', config_section, 'channel')
		];
	},

	formvalue: function(section_id) {
		const node = this.map.findElement('data-field', this.cbid(section_id));

		return [
			node.querySelector('.mode').value,
			node.querySelector('.htmode').value,
			node.querySelector('.band').value,
			node.querySelector('.channel').value
		];
	},

	write: function(section_id, value) {
		const config_section = this.getDeviceSection(section_id);
		const hwtype = uci.get('wireless', config_section, 'type');
		const mode = value[0];
		const htmode = value[1];
		const band = value[2];
		const channel = value[3];

		uci.set('wireless', config_section, 'htmode', htmode || null);

		if (isQcaWifiHwtype(hwtype)) {
			let hwmode = uci.get('wireless', config_section, 'hwmode');

			if (hwtype == 'qcawifi') {
				if (mode == 'ac')
					hwmode = '11ac';
				else if (mode == 'n')
					hwmode = '11ng';
			}
			else if (hwtype == 'qcawificfg80211') {
				switch (mode) {
				case 'be':
					hwmode = (band == '2g') ? '11beg' : '11bea';
					break;
				case 'ax':
					hwmode = (band == '2g') ? '11axg' : '11axa';
					break;
				case 'ac':
					hwmode = '11ac';
					break;
				case 'n':
					hwmode = '11ng';
					break;
				}
			}

			uci.set('wireless', config_section, 'hwmode', hwmode);
			uci.unset('wireless', config_section, 'band');
		}
		else if (this.useBandOption) {
			uci.set('wireless', config_section, 'band', band);
		}
		else {
			uci.set('wireless', config_section, 'hwmode', (band == '2g') ? '11g' : '11a');
		}

		uci.set('wireless', config_section, 'channel', channel);
	}
});

var CBIWifiTxPowerValue = form.ListValue.extend({
	callTxPowerList: rpc.declare({
		object: 'iwinfo',
		method: 'txpowerlist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	load: function(section_id) {
		return this.callTxPowerList(section_id).then(L.bind(function(pwrlist) {
			this.powerval = this.wifiNetwork ? getDisplayTxPower(this.wifiNetwork) : null;
			this.poweroff = this.wifiNetwork ? this.wifiNetwork.getTXPowerOffset() : null;

			this.value('', _('driver default'));

			for (let p of pwrlist)
				this.value(p.dbm, `${p.dbm} dBm (${p.mw} mW)`);

			return form.ListValue.prototype.load.apply(this, [section_id]);
		}, this));
	},

	renderWidget: function(section_id, option_index, cfgvalue) {
		const widget = form.ListValue.prototype.renderWidget.apply(this, [section_id, option_index, cfgvalue]);

		widget.firstElementChild.style.width = 'auto';

		dom.append(widget, E('span', [
			' - ', _('Current power'), ': ',
			E('span', [ this.powerval != null ? `${this.powerval} dBm` : E('em', _('unknown')) ]),
			this.poweroff ? ` + ${this.poweroff} dB offset = ${this.powerval != null ? this.powerval + this.poweroff : '?'} dBm` : ''
		]));

		return widget;
	}
});

var CBIWifiCountryValue = form.Value.extend({
	callCountryList: rpc.declare({
		object: 'iwinfo',
		method: 'countrylist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	load: function(section_id) {
		return this.callCountryList(section_id).then(L.bind(function(countrylist) {
			if (Array.isArray(countrylist) && countrylist.length > 0) {
				this.value('', _('driver default'));

				for (let c of countrylist)
					this.value(c.iso3166, `${c.iso3166} - ${c.country}`);
			}

			return form.Value.prototype.load.apply(this, [section_id]);
		}, this));
	},

	validate: function(section_id, formvalue) {
		if (formvalue != null && formvalue != '' && !/^[A-Z0-9][A-Z0-9]$/.test(formvalue))
			return _('Use ISO/IEC 3166 alpha2 country codes.');

		return true;
	},

	renderWidget: function(section_id, option_index, cfgvalue) {
		const typeClass = (this.keylist && this.keylist.length) ? form.ListValue : form.Value;
		return typeClass.prototype.renderWidget.apply(this, [section_id, option_index, cfgvalue]);
	}
});

return view.extend({
	poll_status: function(map, data) {
		const rows = map.querySelectorAll('.cbi-section-table-row[data-sid]');

		rows.forEach(row => {
			const section_id = row.getAttribute('data-sid');
			const radioDev = data[1].filter(function(d) { return d.getName() == section_id; })[0];
			const radioNet = data[2].filter(function(n) { return n.getName() == section_id; })[0];
			const badge = row.querySelector('[data-name="_badge"] > div');
			const stat = row.querySelector('[data-name="_stat"]');
			const btns = row.querySelectorAll('.cbi-section-actions button');
			const busy = btns[0].classList.contains('spinning') || btns[1].classList.contains('spinning') || btns[2].classList.contains('spinning');

			if (radioDev) {
				dom.content(badge, render_radio_badge(radioDev, data[2].filter(function(n) { return n.getWifiDeviceName() == radioDev.getName(); })));
				dom.content(stat, render_radio_status(radioDev, data[2].filter(function(n) { return n.getWifiDeviceName() == radioDev.getName(); })));
			}
			else {
				dom.content(badge, render_network_badge(radioNet));
				dom.content(stat, render_network_status(radioNet));
			}

			if (stat.hasAttribute('restart'))
				dom.content(stat, E('em', _('Device is restarting…')));

			btns[0].disabled = isReadonlyView || busy;
			btns[1].disabled = (isReadonlyView && radioDev) || busy;
			btns[2].disabled = isReadonlyView || busy;
		});

		const table = document.querySelector('#wifi_assoclist_table');
		const hosts = data[0];
		let trows = [];
		const radios = data[3];
		const zones = data[4];

		radios.forEach(zone => {
			const bss = zone;
			const name = hosts.getHostnameByMACAddr(bss.mac);
			const ipv4 = hosts.getIPAddrByMACAddr(bss.mac);
			const ipv6 = hosts.getIP6AddrByMACAddr(bss.mac);

			let hint;

			if (name && ipv4 && ipv6)
				hint = `${name} <span class="hide-xs">(${ipv4}, ${ipv6})</span>`;
			else if (name && (ipv4 ?? ipv6))
				hint = `${name} <span class="hide-xs">(${ipv4 || ipv6})</span>`;
			else
				hint = name || ipv4 || ipv6 || '?';

			let row = [
				E('span', {
					'class': 'ifacebadge',
					'data-ifname': bss.network.getIfname(),
					'data-ssid': bss.network.getSSID()
				}, [
					E('img', {
						'src': L.resource('icons/wifi%s.svg').format(isNetworkDisplayUp(bss.network) ? '' : '_disabled'),
						'title': bss.radio.getI18n()
					}),
					E('span', [
						` ${bss.network.getShortName()} `,
						E('small', `(${bss.network.getIfname()})`)
					])
				]),
				bss.mac,
				hint,
				render_signal_badge(Math.min((bss.signal + 110) / 70 * 100, 100), bss.signal, bss.noise),
				E('span', {}, [
					E('span', format_wifirate(bss.rx)),
					E('br'),
					E('span', format_wifirate(bss.tx))
				])
			];

			if (bss.vlan) {
				const desc = bss.vlan.getI18n();
				const vlan_network = bss.vlan.getNetwork();
				let vlan_zone;

				if (vlan_network && zones)
					for (let zone of zones)
						if (zone.getNetworks().includes(vlan_network))
							vlan_zone = zone;

				row[0].insertBefore(
					E('div', {
						'class' : 'zonebadge',
						'title' : desc,
						'style' : firewall.getZoneColorStyle(vlan_zone)
					}, [ desc ]), row[0].firstChild);
			}

			if (bss.network.isClientDisconnectSupported()) {
				if (table.firstElementChild.childNodes.length < 6)
					table.firstElementChild.appendChild(E('th', { 'class': 'th cbi-section-actions'}));

				row.push(E('button', {
					'class': 'cbi-button cbi-button-remove',
					'click': L.bind(function(net, mac, ev) {
						dom.parent(ev.currentTarget, '.tr').style.opacity = 0.5;
						ev.currentTarget.classList.add('spinning');
						ev.currentTarget.disabled = true;
						ev.currentTarget.blur();

						net.disconnectClient(mac, true, 5, 60000);
					}, this, bss.network, bss.mac),
					'disabled': isReadonlyView || null
				}, [ _('Disconnect') ]));
			}
			else {
				row.push('-');
			}

			trows.push(row);
		});

		cbi_update_table(table, trows, E('em', _('No information available')));

		const status = document.querySelector('.cbi-modal [data-name="_wifistat_modal"] .ifacebadge.large');

		if (status)
			render_modal_status(status, data[2].filter(function(n) { return n.getName() == status.getAttribute('data-network'); })[0]);

		return network.flushCache();
	},

	load: function() {
		return Promise.all([
			uci.changes(),
			uci.load('wireless'),
			uci.load('system'),
			firewall.getZones(),
		]);
	},

	checkAnonymousSections: function() {
		return uci.sections('wireless', 'wifi-iface').some(iface => iface['.anonymous']);
	},

	callUciRename: rpc.declare({
		object: 'uci',
		method: 'rename',
		params: [ 'config', 'section', 'name' ]
	}),

	render: function(data) {
		if (this.checkAnonymousSections())
			return this.renderMigration();
		else
			return this.renderOverview(data[3]);
	},

	handleMigration: function(ev) {
		const wifiIfaces = uci.sections('wireless', 'wifi-iface');
		let id_offset = 0;
		const tasks = [];

		wifiIfaces.forEach((iface) => {
			if (iface['.anonymous']) {
				const new_name = next_free_sid(id_offset);
				tasks.push(this.callUciRename('wireless', iface['.name'], new_name));
				id_offset = parseInt(new_name.substring(7), 10) + 1;
		    }
		});

		return Promise.all(tasks)
			.then(L.bind(ui.changes.init, ui.changes))
			.then(L.bind(ui.changes.apply, ui.changes));
	},

	renderMigration: function() {
		ui.showModal(_('Wireless configuration migration'), [
			E('p', _('The existing wireless configuration needs to be changed for LuCI to function properly.')),
			E('p', _('Upon pressing "Continue", anonymous "wifi-iface" sections will be assigned with a name in the form <em>wifinet#</em> and the network will be restarted to apply the updated configuration.')),
			E('div', { 'class': 'right' },
				E('button', {
					'class': 'btn cbi-button-action important',
					'click': ui.createHandlerFn(this, 'handleMigration')
				}, _('Continue')))
		]);
	},

	renderOverview: function(zones) {
		let m, s, o;

		m = new form.Map('wireless');
		m.chain('network');
		m.chain('firewall');

		s = m.section(form.GridSection, 'wifi-device', _('Wireless Overview'));
		s.anonymous = true;
		s.addremove = false;

		s.load = function() {
			return network.getWifiDevices().then(L.bind(function(radios) {
				this.radios = radios.sort(function(a, b) {
					return a.getName() > b.getName();
				});

				const tasks = [];

				radios.forEach(radio => {
					tasks.push(radio.getWifiNetworks());
				});

				return Promise.all(tasks);
			}, this)).then(L.bind(function(data) {
				this.wifis = [];

				data.forEach(d => {
					this.wifis.push.apply(this.wifis, d);
				});
			}, this));
		};

		s.cfgsections = function() {
			const rv = [];

			this.radios.forEach(radio => {
				rv.push(radio.getName());

				this.wifis.forEach(wifi => {
					if (wifi.getWifiDeviceName() == radio.getName())
						rv.push(wifi.getName());
				});
			});

			return rv;
		};

		s.modaltitle = function(section_id) {
			const radioNet = this.wifis.filter(function(w) { return w.getName() == section_id; })[0];
			return radioNet ? radioNet.getI18n() : _('Edit wireless network');
		};

		s.lookupRadioOrNetwork = function(section_id) {
			const radioDev = this.radios.filter(function(r) { return r.getName() == section_id; })[0];
			if (radioDev)
				return radioDev;

			const radioNet = this.wifis.filter(function(w) { return w.getName() == section_id; })[0];
			if (radioNet)
				return radioNet;

			return null;
		};

		s.renderRowActions = function(section_id) {
			const inst = this.lookupRadioOrNetwork(section_id);
			let btns;

			if (inst.getWifiNetworks) {
				btns = [
					E('button', {
						'class': 'cbi-button cbi-button-neutral',
						'title': _('Restart radio interface'),
						'click': ui.createHandlerFn(this, radio_restart, section_id)
					}, _('Restart')),
					E('button', {
						'class': 'cbi-button cbi-button-action important',
						'title': _('Find and join network'),
						'click': ui.createHandlerFn(this, 'handleScan', inst)
					}, _('Scan')),
					E('button', {
						'class': 'cbi-button cbi-button-add',
						'title': _('Provide new network'),
						'click': ui.createHandlerFn(this, 'handleAdd', inst)
					}, _('Add'))
				];
			}
			else {
				const isDisabled = (inst.get('disabled') == '1' ||
					uci.get('wireless', inst.getWifiDeviceName(), 'disabled') == '1');

				btns = [
					E('button', {
						'class': 'cbi-button cbi-button-neutral enable-disable',
						'title': isDisabled ? _('Enable this network') : _('Disable this network'),
						'click': ui.createHandlerFn(this, network_updown, section_id, this.map)
					}, isDisabled ? _('Enable') : _('Disable')),
					E('button', {
						'class': 'cbi-button cbi-button-action important',
						'title': _('Edit this network'),
						'click': ui.createHandlerFn(this, 'renderMoreOptionsModal', section_id)
					}, _('Edit')),
					E('button', {
						'class': 'cbi-button cbi-button-negative remove',
						'title': _('Delete this network'),
						'click': ui.createHandlerFn(this, 'handleRemove', section_id)
					}, _('Remove'))
				];
			}

			return E('td', { 'class': 'td middle cbi-section-actions' }, E('div', btns));
		};

		s.addModalOptions = function(s) {
			return network.getWifiNetwork(s.section).then(function(radioNet) {
				const hwtype = uci.get('wireless', radioNet.getWifiDeviceName(), 'type');
				const ifmode = radioNet.getMode();
				const have_mesh = L.hasSystemFeature('hostapd', 'mesh') || L.hasSystemFeature('wpasupplicant', 'mesh');
				let o, ss;

				o = s.option(form.SectionValue, '_device', form.NamedSection, radioNet.getWifiDeviceName(), 'wifi-device', _('Device Configuration'));
				o.modalonly = true;

				ss = o.subsection;
				ss.tab('general', _('General Setup'));
				ss.tab('advanced', _('Advanced Settings'));

				const isDisabled = (radioNet.get('disabled') == '1' ||
					uci.get('wireless', radioNet.getWifiDeviceName(), 'disabled') == 1);

				o = ss.taboption('general', form.DummyValue, '_wifistat_modal', _('Status'));
				o.cfgvalue = L.bind(function(radioNet) {
					return render_modal_status(null, radioNet);
				}, this, radioNet);
				o.write = function() {};

				o = ss.taboption('general', form.Button, '_toggle', isDisabled ? _('Wireless network is disabled') : _('Wireless network is enabled'));
				o.inputstyle = isDisabled ? 'apply' : 'reset';
				o.inputtitle = isDisabled ? _('Enable') : _('Disable');
				o.onclick = ui.createHandlerFn(s, network_updown, s.section, s.map);

				o = ss.taboption('general', CBIWifiFrequencyValue, '_freq', '<br />' + _('Operating frequency'), _('Some channels may be restricted to Indoor Only use by your Regulatory Domain. Make sure to follow this advice if a channel is reported as such.'));
				o.ucisection = s.section;

				if (hwtype == 'mac80211' || isQcaWifiHwtype(hwtype)) {
					o = ss.taboption('general', CBIWifiTxPowerValue, 'txpower', _('Maximum transmit power'), _('Specifies the maximum transmit power the wireless radio may use. Depending on regulatory requirements and wireless usage, the actual transmit power may be reduced by the driver.'));
					o.wifiNetwork = radioNet;
				}

				if (hwtype == 'mac80211') {
					o = ss.taboption('general', form.Flag, 'legacy_rates', _('Allow legacy 802.11b rates'), _('Legacy or badly behaving devices may require legacy 802.11b rates to interoperate. Airtime efficiency may be significantly reduced where these are used. It is recommended to not allow 802.11b rates where possible.'));
					o.depends({'_freq': '2g', '!contains': true});

					o = ss.taboption('general', CBIWifiCountryValue, 'country', _('Country Code'));
					o.wifiNetwork = radioNet;

					o = ss.taboption('advanced', form.ListValue, 'cell_density', _('Coverage cell density'), _('Configures data rates based on the coverage cell density. Normal configures basic rates to 6, 12, 24 Mbps if legacy 802.11b rates are not used else to 5.5, 11 Mbps. High configures basic rates to 12, 24 Mbps if legacy 802.11b rates are not used else to the 11 Mbps rate. Very High configures 24 Mbps as the basic rate. Supported rates lower than the minimum basic rate are not offered.'));
					o.value('0', _('Disabled'));
					o.value('1', _('Normal'));
					o.value('2', _('High'));
					o.value('3', _('Very High'));

					o = ss.taboption('advanced', form.Value, 'distance', _('Distance Optimization'), _('Distance to farthest network member in meters. Set only for distances above one kilometer; otherwise it is harmful.'));
					o.datatype = 'or(range(0,114750),"auto")';
					o.placeholder = 'auto';

					o = ss.taboption('advanced', form.Value, 'frag', _('Fragmentation Threshold'));
					o.datatype = 'min(256)';
					o.placeholder = _('off');

					o = ss.taboption('advanced', form.Value, 'rts', _('RTS/CTS Threshold'));
					o.datatype = 'uinteger';
					o.placeholder = _('off');

					o = ss.taboption('advanced', form.Flag, 'noscan', _('Force 40MHz mode'), _('Always use 40MHz channels even if the secondary channel overlaps. Using this option does not comply with IEEE 802.11n-2009!'));
					o.rmempty = true;

					o = ss.taboption('advanced', form.Flag, 'vendor_vht', _('Enable 256-QAM'), _('802.11n 2.4Ghz Only'));
					o.default = o.disabled;

					o = ss.taboption('advanced', form.Value, 'beacon_int', _('Beacon Interval'));
					o.datatype = 'range(15,65535)';
					o.placeholder = 100;
					o.rmempty = true;

					o = ss.taboption('advanced', form.Flag, 'rxldpc', _('Rx LDPC'), _('Low-Density Parity-Check'));
					o.default = '1';

					o = ss.taboption('advanced', form.Flag, 'ldpc', _('Tx LDPC'));
					o.depends({'rxldpc': '1'});
					o.default = '1';
				}
				else if (isQcaWifiHwtype(hwtype)) {
					o = ss.taboption('advanced', CBIWifiCountryValue, 'country', _('Country Code'));
					o.wifiNetwork = radioNet;
				}
				else if (hwtype == 'mt_dbdc') {
					o = ss.taboption('advanced', CBIWifiCountryValue, 'country', _('Country Code'));
					o.wifiNetwork = radioNet;

					o = ss.taboption('advanced', form.Flag, 'noscan', _('Force 40MHz mode'), _('Always use 40MHz channels even if the secondary channel overlaps. Using this option does not comply with IEEE 802.11n-2009!'));
					o.depends({ '_freq': '2g', '!contains': true });
					o.default = o.disabled;
					o.rmempty = false;

					o = ss.taboption('advanced', form.Flag, 'mu_beamformer', _('MU-MIMO'));

					if (uci.get('wireless', radioNet.getWifiDeviceName(), 'dbdc_main') == '1') {
						o = ss.taboption('advanced', form.Flag, 'whnat', _('Wireless HWNAT'));
						o.default = o.enabled;

						o = ss.taboption('advanced', form.Flag, 'bandsteering', _('Band Steering'));
						o.default = o.disabled;
					}

					o = ss.taboption('advanced', form.ListValue, 'twt', _('Target Wake Time'));
					o.value('', _('Disable'));
					o.value('1', _('Enable'));
					o.value('2', _('Force'));

					o = ss.taboption('general', form.ListValue, 'txpower', _('Maximum transmit power'));
					o.value('1', _('Very Low'));
					o.value('20', _('Low'));
					o.value('50', _('Normal'));
					o.value('100', _('High'));
					o.default = '100';
				}


				o = s.option(form.SectionValue, '_device', form.NamedSection, radioNet.getName(), 'wifi-iface', _('Interface Configuration'));
				o.modalonly = true;

				ss = o.subsection;
				ss.tab('general', _('General Setup'));
				ss.tab('encryption', _('Wireless Security'));
				ss.tab('macfilter', _('MAC-Filter'));
				ss.tab('advanced', _('Advanced Settings'));
				ss.tab('roaming', _('WLAN roaming'), _('Settings for assisting wireless clients in roaming between multiple APs: 802.11r, 802.11k and 802.11v'));

				o = ss.taboption('general', form.ListValue, 'mode', _('Mode') , !have_mesh ? '<a id="installmesh" href="%s" target="_blank" rel="noreferrer">%s</a>'
						.format(L.url('admin/system/package-manager') + '?query=wpad-mesh', _('802.11s? Install mesh wpad') ) : '');
				if (hwtype == 'mt_dbdc') {
					if (ifmode == 'ap')
						o.value('ap', _('Access Point'));
					else if (ifmode == 'sta')
						o.value('sta', _('Client'));
				}
				else {
					o.value('ap', _('Access Point'));
					o.value('sta', _('Client'));
					o.value('adhoc', _('Ad-Hoc'));
				}

				o = ss.taboption('general', form.Value, 'mesh_id', _('Mesh Id'));
				o.depends('mode', 'mesh');

				o = ss.taboption('advanced', form.Flag, 'mesh_fwding', _('Forward mesh peer traffic'));
				o.rmempty = false;
				o.default = '1';
				o.depends('mode', 'mesh');

				o = ss.taboption('advanced', form.Value, 'mesh_rssi_threshold', _('RSSI threshold for joining mesh'), _('0 = not using RSSI threshold, 1 = do not change driver default') + ' ' +
					_('Units: dBm. Where -255 is weakest, and -10 is strong.'));
				o.rmempty = false;
				o.default = '0';
				o.datatype = 'range(-255,1)';
				o.depends('mode', 'mesh');

				o = ss.taboption('general', form.Value, 'ssid', _('<abbr title="Extended Service Set Identifier">ESSID</abbr>'));
				o.datatype = 'maxlength(32)';
				o.depends('mode', 'ap');
				o.depends('mode', 'sta');
				o.depends('mode', 'adhoc');
				o.depends('mode', 'ahdemo');
				o.depends('mode', 'monitor');
				o.depends('mode', 'ap-wds');
				o.depends('mode', 'sta-wds');
				o.depends('mode', 'wds');

				o = ss.taboption('general', form.Value, 'bssid', _('<abbr title="Basic Service Set Identifier">BSSID</abbr>'));
				o.datatype = 'macaddr';

				o = ss.taboption('general', widgets.NetworkSelect, 'network', _('Network'), _('Choose the network(s) you want to attach to this wireless interface or fill out the <em>custom</em> field to define a new network.'));
				o.rmempty = true;
				o.multiple = true;
				o.novirtual = true;
				o.write = function(section_id, value) {
					return network.getDevice(section_id).then(L.bind(function(dev) {
						const old_networks = dev.getNetworks().reduce(function(o, v) { o[v.getName()] = v; return o; }, {});
						const new_networks = {};
						const values = L.toArray(value);
						const tasks = [];

						values.forEach(value => {

							new_networks[value] = true;

							if (old_networks[value])
								return;

							tasks.push(network.getNetwork(value).then(L.bind(function(name, net) {
								return net || network.addNetwork(name, { proto: 'none' });
							}, this, value)).then(L.bind(function(dev, net) {
								if (net) {
									if (!net.isEmpty()) {
										let target_dev = net.getDevice();

										/* Resolve parent interface of vlan */
										while (target_dev && target_dev.getType() == 'vlan')
											target_dev = target_dev.getParent();

										if (!target_dev || target_dev.getType() != 'bridge')
											net.set('type', 'bridge');
									}

									net.addDevice(dev);
								}
							}, this, dev)));
						});

						for (let name in old_networks)
							if (!new_networks[name])
								tasks.push(network.getNetwork(name).then(L.bind(function(dev, net) {
									if (net)
										net.deleteDevice(dev);
								}, this, dev)));

						return Promise.all(tasks);
					}, this));
				};

				let encr;
				if (hwtype == 'mac80211') {
					const mode = ss.children.find(obj => obj.option === 'mode');
					const bssid = ss.children.find(obj => obj.option === 'bssid');

					if (have_mesh) mode.value('mesh', '802.11s');
					mode.value('ahdemo', _('Pseudo Ad-Hoc (ahdemo)'));
					mode.value('monitor', _('Monitor'));

					bssid.depends('mode', 'adhoc');
					bssid.depends('mode', 'sta');
					bssid.depends('mode', 'sta-wds');

					o = ss.taboption('macfilter', form.ListValue, 'macfilter', _('MAC Address Filter'));
					o.depends('mode', 'ap');
					o.depends('mode', 'ap-wds');
					o.value('', _('disable'));
					o.value('allow', _('Allow listed only'));
					o.value('deny', _('Allow all except listed'));

					o = ss.taboption('macfilter', form.DynamicList, 'maclist', _('MAC-List'));
					o.datatype = 'macaddr';
					o.retain = true;
					o.depends('macfilter', 'allow');
					o.depends('macfilter', 'deny');
					o.load = function(section_id) {
						return network.getHostHints().then(L.bind(function(hints) {
							hints.getMACHints().map(L.bind(function(hint) {
								this.value(hint[0], hint[1] ? '%s (%s)'.format(hint[0], hint[1]) : hint[0]);
							}, this));

							return form.DynamicList.prototype.load.apply(this, [section_id]);
						}, this));
					};

					mode.value('ap-wds', '%s (%s)'.format(_('Access Point'), _('WDS')));
					mode.value('sta-wds', '%s (%s)'.format(_('Client'), _('WDS')));

					mode.write = function(section_id, value) {
						switch (value) {
						case 'ap-wds':
							uci.set('wireless', section_id, 'mode', 'ap');
							uci.set('wireless', section_id, 'wds', '1');
							break;

						case 'sta-wds':
							uci.set('wireless', section_id, 'mode', 'sta');
							uci.set('wireless', section_id, 'wds', '1');
							break;

						default:
							uci.set('wireless', section_id, 'mode', value);
							uci.unset('wireless', section_id, 'wds');
							break;
						}
					};

					mode.cfgvalue = function(section_id) {
						const mode = uci.get('wireless', section_id, 'mode');
						const wds = uci.get('wireless', section_id, 'wds');

						if (mode == 'ap' && wds)
							return 'ap-wds';
						else if (mode == 'sta' && wds)
							return 'sta-wds';

						return mode;
					};

					o = ss.taboption('general', form.Flag, 'hidden', _('Hide <abbr title="Extended Service Set Identifier">ESSID</abbr>'), _('Where the ESSID is hidden, clients may fail to roam and airtime efficiency may be significantly reduced.'));
					o.depends('mode', 'ap');
					o.depends('mode', 'ap-wds');

					o = ss.taboption('general', form.Flag, 'wmm', _('WMM Mode'), _('Where Wi-Fi Multimedia (WMM) Mode QoS is disabled, clients may be limited to 802.11a/802.11g rates.'));
					o.depends('mode', 'ap');
					o.depends('mode', 'ap-wds');
					o.default = o.enabled;

					/* https://w1.fi/cgit/hostap/commit/?id=34f7c699a6bcb5c45f82ceb6743354ad79296078  */
					/* multicast_to_unicast https://github.com/openwrt/openwrt/commit/7babb978ad9d7fc29acb1ff86afb1eb343af303a */
					o = ss.taboption('advanced', form.Flag, 'multicast_to_unicast_all', _('Multi To Unicast'), _('ARP, IPv4 and IPv6 (even 802.1Q) with multicast destination MACs are unicast to the STA MAC address. Note: This is not Directed Multicast Service (DMS) in 802.11v. Note: might break receiver STA multicast expectations.'));
					o.rmempty = true;

					o = ss.taboption('advanced', form.Flag, 'isolate', _('Isolate Clients'), _('Prevents client-to-client communication'));
					o.depends('mode', 'ap');
					o.depends('mode', 'ap-wds');

					o = ss.taboption('advanced', form.Flag, 'bridge_isolate', _('Isolate Bridge Port'), _('Prevents communication only with targets on isolated bridge ports (while allowing it with targets on non-isolated ones). This also prevents client-to-client communication on the same interface when the WiFi device is in AP mode.'));

					o = ss.taboption('advanced', form.Value, 'ifname', _('Interface name'), _('Override default interface name'));
					o.optional = true;
					o.datatype = 'netdevname';
					o.placeholder = radioNet.getIfname();
					if (/^radio\d+\.network/.test(o.placeholder))
						o.placeholder = '';

					const macaddr = uci.get('wireless', radioNet.getName(), 'macaddr');
					o = ss.taboption('advanced', form.Value, 'macaddr', _('MAC address'), _('Override default MAC address - the range of usable addresses might be limited by the driver'));
					o.value('', _('driver default (%s)').format(!macaddr ? radioNet.getActiveBSSID() : _('no override')));
					o.value('random', _('randomly generated'));
					o.datatype = "or('random',macaddr)";

					o = ss.taboption('advanced', form.Flag, 'short_preamble', _('Short Preamble'));
					o.default = o.enabled;

					o = ss.taboption('advanced', form.Value, 'dtim_period', _('DTIM Interval'), _('Delivery Traffic Indication Message Interval'));
					o.optional = true;
					o.placeholder = 2;
					o.datatype = 'range(1,255)';

					o = ss.taboption('advanced', form.Value, 'wpa_group_rekey', _('Time interval for rekeying GTK'), _('sec'));
					o.optional    = true;
					o.placeholder = 600;
					o.datatype    = 'uinteger';

					o = ss.taboption('advanced', form.Flag , 'skip_inactivity_poll', _('Disable Inactivity Polling'));
					o.optional    = true;
					o.datatype    = 'uinteger';

					o = ss.taboption('advanced', form.Value, 'max_inactivity', _('Station inactivity limit'), _('802.11v: BSS Max Idle. Units: seconds.'));
					o.optional    = true;
					o.placeholder = 300;
					o.datatype    = 'uinteger';

					o = ss.taboption('advanced', form.Value, 'max_listen_interval', _('Maximum allowed Listen Interval'));
					o.optional    = true;
					o.placeholder = 65535;
					o.datatype    = 'uinteger';

					o = ss.taboption('advanced', form.Flag, 'disassoc_low_ack', _('Disassociate On Low Acknowledgement'), _('Allow AP mode to disconnect STAs based on low ACK condition'));
					o.default = o.enabled;
				}
				else if (isQcaWifiHwtype(hwtype)) {
					const mode = ss.children.find(obj => obj.option === 'mode');
					const bssid = ss.children.find(obj => obj.option === 'bssid');

					mode.value('ap-wds', '%s (%s)'.format(_('Access Point'), _('WDS')));
					mode.value('sta-wds', '%s (%s)'.format(_('Client'), _('WDS')));
					mode.value('wds', _('Static WDS'));

					if (hwtype == 'qcawificfg80211' && have_mesh)
						mode.value('mesh', '802.11s');

					bssid.depends('mode', 'adhoc');
					bssid.depends('mode', 'sta');
					bssid.depends('mode', 'sta-wds');

					mode.write = function(section_id, value) {
						switch (value) {
						case 'ap-wds':
							uci.set('wireless', section_id, 'mode', 'ap');
							uci.set('wireless', section_id, 'wds', '1');
							break;
						case 'sta-wds':
							uci.set('wireless', section_id, 'mode', 'sta');
							uci.set('wireless', section_id, 'wds', '1');
							break;
						default:
							uci.set('wireless', section_id, 'mode', value);
							uci.unset('wireless', section_id, 'wds');
							break;
						}
					};

					mode.cfgvalue = function(section_id) {
						const currentMode = uci.get('wireless', section_id, 'mode');
						const wds = uci.get('wireless', section_id, 'wds');

						if (currentMode == 'ap' && wds)
							return 'ap-wds';
						if (currentMode == 'sta' && wds)
							return 'sta-wds';

						return currentMode;
					};
				}


				encr = o = ss.taboption('encryption', form.ListValue, 'encryption', _('Encryption'));
				o.depends('mode', 'ap');
				o.depends('mode', 'sta');
				o.depends('mode', 'adhoc');
				o.depends('mode', 'ahdemo');
				o.depends('mode', 'ap-wds');
				o.depends('mode', 'sta-wds');
				o.depends('mode', 'mesh');

				o.cfgvalue = function(section_id) {
					return getConfigEncryptionValue(section_id, hwtype);
				};

				o.write = function(section_id, value) {
					let e = this.section.children.filter(function(o) { return o.option == 'encryption'; })[0].formvalue(section_id);
					const co = this.section.children.filter(function(o) { return o.option == 'cipher'; })[0];
					let c = co.formvalue(section_id);
					let stored_e = e;

					if (value == 'wpa' || value == 'wpa2' || value == 'wpa3' || value == 'wpa3-mixed' || value == 'wpa3-192')
						uci.unset('wireless', section_id, 'key');

					if ((e == 'sae' || e == 'sae-mixed') && (!c || c == 'auto'))
						c = 'ccmp';

					if (isQcaWifiHwtype(hwtype)) {
						if (e == 'sae-mixed') {
							stored_e = 'psk2';
							uci.set('wireless', section_id, 'sae', '1');
						}
						else if (e == 'sae') {
							uci.set('wireless', section_id, 'sae', '1');
						}
						else {
							uci.unset('wireless', section_id, 'sae');
						}
					}

					if (co.isActive(section_id) && stored_e && (c == 'tkip' || c == 'ccmp' || c == 'ccmp256' || c == 'gcmp' || c == 'gcmp256' || c == 'tkip+ccmp'))
						stored_e += '+' + c;

					uci.set('wireless', section_id, 'encryption', stored_e);
				};

				o = ss.taboption('encryption', form.ListValue, 'cipher', _('Cipher'));
				o.depends('encryption', 'wpa');
				o.depends('encryption', 'wpa2');
				o.depends('encryption', 'wpa3');
				o.depends('encryption', 'wpa3-mixed');
				o.depends('encryption', 'wpa3-192');
				o.depends('encryption', 'psk');
				o.depends('encryption', 'sae');
				o.depends('encryption', 'psk2');
				o.depends('encryption', 'wpa-mixed');
				o.depends('encryption', 'psk-mixed');
				if (hwtype != 'mt_dbdc')
					o.depends('encryption', 'psk');
				o.value('auto', _('auto'));
				o.value('ccmp', _('Force CCMP (AES)'));
				o.value('ccmp256', _('Force CCMP-256 (AES)'));
				if (isQcaWifiHwtype(hwtype))
					o.value('gcmp', _('Force GCMP (AES)'));
				else
					o.value('gcmp', _('Force GCMP (AES)'));
				o.value('gcmp256', _('Force GCMP-256 (AES)'));
				o.value('tkip', _('Force TKIP'));
				o.value('tkip+ccmp', _('Force TKIP and CCMP (AES)'));
				o.write = ss.children.filter(function(o) { return o.option == 'encryption'; })[0].write;

				o.cfgvalue = function(section_id) {
					return getConfigCipherValue(section_id, hwtype);
				};


				const crypto_modes = [];

				if (hwtype == 'mac80211') {
					const has_supplicant = L.hasSystemFeature('wpasupplicant');
					const has_hostapd = L.hasSystemFeature('hostapd');

					// Probe EAP support
					const has_ap_eap = L.hasSystemFeature('hostapd', 'eap');
					const has_sta_eap = L.hasSystemFeature('wpasupplicant', 'eap');

					// Probe SAE support
					const has_ap_sae = L.hasSystemFeature('hostapd', 'sae');
					const has_sta_sae = L.hasSystemFeature('wpasupplicant', 'sae');

					// Probe OWE support
					const has_ap_owe = L.hasSystemFeature('hostapd', 'owe');
					const has_sta_owe = L.hasSystemFeature('wpasupplicant', 'owe');

					// Probe Suite-B support
					const has_ap_eap192 = L.hasSystemFeature('hostapd', 'suiteb192');
					const has_sta_eap192 = L.hasSystemFeature('wpasupplicant', 'suiteb192');

					// Probe WEP support
					const has_ap_wep = L.hasSystemFeature('hostapd', 'wep');
					const has_sta_wep = L.hasSystemFeature('wpasupplicant', 'wep');

					if (has_hostapd || has_supplicant) {
						crypto_modes.push(['psk2',      'WPA2-PSK',                    35]);
						crypto_modes.push(['psk-mixed', 'WPA-PSK/WPA2-PSK Mixed Mode', 22]);
						crypto_modes.push(['psk',       'WPA-PSK',                     12]);
					}
					else {
						encr.description = _('WPA-Encryption requires wpa_supplicant (for client mode) or hostapd (for AP and ad-hoc mode) to be installed.');
					}

					if (has_ap_sae || has_sta_sae) {
						crypto_modes.push(['sae',       'WPA3-SAE',                     31]);
						crypto_modes.push(['sae-mixed', 'WPA2-PSK/WPA3-SAE Mixed Mode', 30]);
					}

					if (has_ap_wep || has_sta_wep) {
						crypto_modes.push(['wep-open',   _('WEP Open System'), 11]);
						crypto_modes.push(['wep-shared', _('WEP Shared Key'),  10]);
					}

					if (has_ap_eap || has_sta_eap) {
						if (has_ap_eap192 || has_sta_eap192) {
							crypto_modes.push(['wpa3', 'WPA3-EAP', 33]);
							crypto_modes.push(['wpa3-mixed', 'WPA2-EAP/WPA3-EAP Mixed Mode', 32]);
							crypto_modes.push(['wpa3-192', 'WPA3-EAP 192-bit Mode', 36]);
						}

						crypto_modes.push(['wpa2', 'WPA2-EAP', 34]);
						crypto_modes.push(['wpa',  'WPA-EAP',  20]);
					}

					if (has_ap_owe || has_sta_owe) {
						crypto_modes.push(['owe', 'OWE', 1]);
					}

					encr.crypto_support = {
						'ap': {
							'wep-open': has_ap_wep || _('Requires hostapd with WEP support'),
							'wep-shared': has_ap_wep || _('Requires hostapd with WEP support'),
							'psk': has_hostapd || _('Requires hostapd'),
							'psk2': has_hostapd || _('Requires hostapd'),
							'psk-mixed': has_hostapd || _('Requires hostapd'),
							'sae': has_ap_sae || _('Requires hostapd with SAE support'),
							'sae-mixed': has_ap_sae || _('Requires hostapd with SAE support'),
							'wpa': has_ap_eap || _('Requires hostapd with EAP support'),
							'wpa2': has_ap_eap || _('Requires hostapd with EAP support'),
							'wpa3': has_ap_eap192 || _('Requires hostapd with EAP Suite-B support'),
							'wpa3-mixed': has_ap_eap192 || _('Requires hostapd with EAP Suite-B support'),
							'wpa3-192': has_ap_eap192 || _('Requires hostapd with EAP Suite-B support'),
							'owe': has_ap_owe || _('Requires hostapd with OWE support')
						},
						'sta': {
							'wep-open': has_sta_wep || _('Requires wpa-supplicant with WEP support'),
							'wep-shared': has_sta_wep || _('Requires wpa-supplicant with WEP support'),
							'psk': has_supplicant || _('Requires wpa-supplicant'),
							'psk2': has_supplicant || _('Requires wpa-supplicant'),
							'psk-mixed': has_supplicant || _('Requires wpa-supplicant'),
							'sae': has_sta_sae || _('Requires wpa-supplicant with SAE support'),
							'sae-mixed': has_sta_sae || _('Requires wpa-supplicant with SAE support'),
							'wpa': has_sta_eap || _('Requires wpa-supplicant with EAP support'),
							'wpa2': has_sta_eap || _('Requires wpa-supplicant with EAP support'),
							'wpa3': has_sta_eap192 || _('Requires wpa-supplicant with EAP Suite-B support'),
							'wpa3-mixed': has_sta_eap192 || _('Requires wpa-supplicant with EAP Suite-B support'),
							'wpa3-192': has_sta_eap192 || _('Requires wpa-supplicant with EAP Suite-B support'),
							'owe': has_sta_owe || _('Requires wpa-supplicant with OWE support')
						},
						'adhoc': {
							'wep-open': true,
							'wep-shared': true,
							'psk': has_supplicant || _('Requires wpa-supplicant'),
							'psk2': has_supplicant || _('Requires wpa-supplicant'),
							'psk-mixed': has_supplicant || _('Requires wpa-supplicant'),
						},
						'mesh': {
							'sae': has_sta_sae || _('Requires wpa-supplicant with SAE support')
						},
						'ahdemo': {
							'wep-open': true,
							'wep-shared': true
						},
						'wds': {
							'wep-open': true,
							'wep-shared': true
						}
					};

					encr.crypto_support['ap-wds'] = encr.crypto_support['ap'];
					encr.crypto_support['sta-wds'] = encr.crypto_support['sta'];

					encr.validate = function(section_id, value) {
						const modeopt = this.section.children.filter(function(o) { return o.option == 'mode'; })[0];
						const modeval = modeopt.formvalue(section_id);
						const modetitle = modeopt.vallist[modeopt.keylist.indexOf(modeval)];
						const enctitle = this.vallist[this.keylist.indexOf(value)];

						if (value == 'none')
							return true;

						if (!L.isObject(this.crypto_support[modeval]) || !this.crypto_support[modeval].hasOwnProperty(value))
							return _('The selected %s mode is incompatible with %s encryption').format(modetitle, enctitle);

						return this.crypto_support[modeval][value];
					};
				}
				else if (isQcaWifiHwtype(hwtype)) {
					crypto_modes.push(['psk2',      'WPA2-PSK',                    35]);
					crypto_modes.push(['psk-mixed', 'WPA-PSK/WPA2-PSK Mixed Mode', 22]);
					crypto_modes.push(['psk',       'WPA-PSK',                     12]);
					crypto_modes.push(['wep-open',  _('WEP Open System'),          11]);
					crypto_modes.push(['wep-shared', _('WEP Shared Key'),          10]);

					if (hwtype == 'qcawificfg80211') {
						crypto_modes.push(['sae',       'WPA3-SAE',                     31]);
						crypto_modes.push(['sae-mixed', 'WPA2-PSK/WPA3-SAE Mixed Mode', 30]);
						crypto_modes.push(['owe',       'OWE',                           1]);
					}
				}
				else if (hwtype == 'broadcom') {
					crypto_modes.push(['psk2',     'WPA2-PSK',                    33]);
					crypto_modes.push(['psk+psk2', 'WPA-PSK/WPA2-PSK Mixed Mode', 22]);
					crypto_modes.push(['psk',      'WPA-PSK',                     12]);
					crypto_modes.push(['wep-open',   _('WEP Open System'),        11]);
					crypto_modes.push(['wep-shared', _('WEP Shared Key'),         10]);
				}
				else if (hwtype == 'mt_dbdc') {
					crypto_modes.push(['psk2', 'WPA2-PSK', 35]);
					crypto_modes.push(['psk', 'WPA-PSK', 12]);
					crypto_modes.push(['sae', 'WPA3-SAE', 31]);
					crypto_modes.push(['owe', 'OWE', 1]);

					if (ifmode == 'ap') {
						crypto_modes.push(['psk-mixed', 'WPA-PSK/WPA2-PSK Mixed Mode', 22]);
						crypto_modes.push(['sae-mixed', 'WPA2-PSK/WPA3-SAE Mixed Mode', 36]);
					}
				}

				crypto_modes.push(['none',       _('No Encryption'),   0]);

				crypto_modes.sort(function(a, b) { return b[2] - a[2]; });

				crypto_modes.forEach(crypto_mode => {
					const security_level = (crypto_mode[2] >= 30) ? _('strong security')
						: (crypto_mode[2] >= 20) ? _('medium security')
							: (crypto_mode[2] >= 10) ? _('weak security') : _('open network');

					encr.value(crypto_mode[0], '%s (%s)'.format(crypto_mode[1], security_level));
				});

				// QR Code
				o = ss.taboption('encryption', form.DummyValue, '_qrops', _('QR Code'),
					_('SSID and passwords with URIencoded sequences (e.g. %20) may not work.'));
				o.modalonly = true;

				o.createWiFiPassword = function(section_id) {
					// https://www.wi-fi.org/system/files/WPA3%20Specification%20v3.5.pdf#page=33
					/*
					WIFI:T:WPA;S:mynetwork;P:mypass;;

					WIFI-qr = "WIFI:" [type ";"] [trdisable ";"] ssid ";" [hidden ";"] [id ";"] [password ";"] [public-key ";"] ";"

					Param 		Description
					type		"T:" *(unreserved) ; security type
					trdisable	"R:" *(HEXDIG) ; Transition Disable value
					ssid		"S:" *(printable / pct-encoded) ; SSID of the network
					hidden		"H:true" ; when present, indicates a hidden (stealth) SSID is used
					id			"I:" *(printable / pct-encoded) ; UTF-8 encoded password identifier, present if the password has an SAE password identifier
					password	"P:" *(printable / pct-encoded) ; password, present for password-based authentication
					public-key	"K:" *PKCHAR ; DER of ASN.1 SubjectPublicKeyInfo in compressed form and encoded in "base64" as per [6], present when the network supports SAE-PK, else absent

					printable = %x20-3a / %x3c-7e ; semi-colon excluded
					PKCHAR = ALPHA / DIGIT / %x2b / %x2f / %x3d
					*/

					function pctEncode(str) {
						const bytes = new TextEncoder().encode(str);
						let out = "";
						for (const b of bytes) {
							// printable = 0x20–0x3A and 0x3C–0x7E, but semicolon (0x3B) excluded
							// anything *within* this range %encoded should be treated as printable literal(?)
							// There seems to be a glaring bug in this WiFi spec. Ofc there are bugs. 
							// By not encoding the "%" character, a string literal % with two successive
							// digits is ambiguous. If the password contains "%20" which
							// should be interpreted literally ['%', '2', '0'] and not " ", some
							// clients interpret this as " ". YMMV.
							const printable = (b >= 0x20 && b <= 0x3A && b !== 0x3B)
								|| (b >= 0x3C && b <= 0x7E);

							if (printable) {
								out += String.fromCharCode(b);
							} else {
								out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
							}
						}
						return out;
					}

					const wifiSSID = this.section.formvalue(section_id, 'ssid'); // S
					const wifiEncr = this.section.formvalue(section_id, 'encryption'); // T
					const wifiKey  = this.section.formvalue(section_id, '_wpa_key'); // P
					const wifiHide = this.section.formvalue(section_id, 'hidden') === '1'; // H

					/* trdisable:
					0 WPA3-Personal
					1 SAE-PK
					2 WPA3-Enterprise
					3 WiFi-Enhanced Open */
					let trdisable = ''; // R
					switch (true) {
					case (wifiEncr === 'sae'): trdisable = 0; break; // 'sae' i.e. WPA3-Personal
					// case (???): trdisable = 1; break; // SAE-PK
					case (wifiEncr.startsWith('wpa3')): trdisable = 2; break; // 'wpa3*' i.e. WPA3-Enterprise
					case (wifiEncr === 'owe'): trdisable = 3; break; // 'open' i.e. WiFi-Enhanced Open
					default: trdisable = ''; break;
					}

					return [
						`WIFI:`,
						(wifiKey) ? `T:WPA;`: null, // absent indicates [open || Wi-Fi Enhanced Open ]
						(trdisable !== '') ? `R:${trdisable};` : null,
						`S:${wifiSSID};`,
						(wifiHide) ? `H:${wifiHide};` : null,
						(wifiKey) ? `P:${pctEncode(wifiKey)};`: null,
					].filter(Boolean).join('') + ';';
				};

				o.handleGenerateQR = function(section_id, ev) {
					const parent = s.map;
					const mapNode = document.querySelector('body.modal-overlay-active > #modal_overlay > .modal.cbi-modal > .cbi-map:not(.hidden)');
					const headNode = mapNode.parentNode.querySelector('h4');
					const wifiQRGenerator = this.createWiFiPassword.bind(this, section_id);

					return Promise.all([
						parent.save(null, true)
					]).then(function(data) {
						let qrm, qrs, qro;

						qrm = new form.JSONMap({ qrcode: {  } },
							null, _('Scan this QR code with the client device.'));
						qrm.parent = parent;

						qrs = qrm.section(form.NamedSection, 'qrcode');

						function handleQRParamChange(ev, section_id, value) {
							const code = this.map.findElement('.qr-code');
							const conf = this.map.findElement('.wifi-qr-code-content');
							const ecc = this.section.getUIElement(section_id, 'ecc');

							if (this.isValid(section_id)) {
								conf.firstChild.data = wifiQRGenerator(section_id);
								code.style.opacity = '.5';

								buildSVGQRCode(conf.firstChild.data, code, {ecc: ecc.getValue()});
							}
						};

						qro = qrs.option(form.ListValue, 'ecc', _('QR Error Correction Code Level'));
						qro.value('L', _('Low'));
						qro.value('M', _('Medium'));
						qro.value('Q', _('Quartile'));
						qro.value('H', _('High'));
						qro.onchange = handleQRParamChange;


						qro = qrs.option(form.DummyValue, 'output');
						qro.renderWidget = function() {
							const wifi_qr = wifiQRGenerator(section_id);
							const ecc = this.section.formvalue(section_id, 'ecc');

							return E('div', {
								'class': 'qr-code-display',
								'style': 'display:flex; flex-wrap:wrap; align-items:center; gap:.5em',
							}, [
								E('div', {
									'class': 'qr-code',
									// any width and height should be ~360: enough for QR with K: field and High ECC.
								}, [
									// fill initial QR code
									E(buildSVGQRCode(wifi_qr, null, {ecc: ecc || undefined}, true))
								]),
								E('pre', {
									'class': 'wifi-qr-code-content',
									'style': 'flex:1; overflow:auto; word-break:break-all; ',
									'click': function(ev) {
										const sel = window.getSelection();
										const range = document.createRange();

										range.selectNodeContents(ev.currentTarget);

										sel.removeAllRanges();
										sel.addRange(range);
									}
								}, [ wifi_qr ])
							]);
						};

						return qrm.render().then(function(nodes) {
							// stash the current dialogue style (visible)
							const dStyle = mapNode.style;
							// hide the current modal window
							mapNode.style.display = 'none';
							// stash the current button row style (visible)
							const bRowStyle = mapNode.nextElementSibling.style;
							// hide the [ Dismiss | Save ] button row
							mapNode.nextElementSibling.style.display = 'none';

							headNode.appendChild(E('span', [ ' » ', _('Generate WiFi QR…') ]));
							mapNode.parentNode.appendChild(E([], [
								nodes,
								E('div', {
									'class': 'right'
								}, [
									E('button', {
										'class': 'btn',
										'click': function() {
											// Remove QR code button (row)
											nodes.parentNode.removeChild(nodes.nextSibling);
											// Remove QR code form
											nodes.parentNode.removeChild(nodes);
											// unhide the WiFi modal dialogue
											mapNode.style = dStyle;
											// Revert button row style to visible again
											mapNode.nextSibling.style = bRowStyle;
											// Remove the H4 span (») title
											headNode.removeChild(headNode.lastChild);
										}
									}, [ _('Back to settings') ])
								])
							]));
						});
					});
				};

				o.cfgvalue = function(section_id, value) {
					return E('button', {
						'class': 'btn qr-code',
						'style': 'display:inline-flex;align-items:center;gap:.5em',
						'click': ui.createHandlerFn(this, 'handleGenerateQR', section_id),
					}, [
						// inject dummy QR code
						E(buildSVGQRCode('openwrt.org', null, {pixelSize: 1, ecc: 'L'}, true)),
						_('Generate QR…')
					]);
				};
				// End QR Code

				o = ss.taboption('encryption', form.Flag, 'ppsk', _('Enable Private PSK (PPSK)'), _('Private Pre-Shared Key (PPSK) allows the use of different Pre-Shared Key for each STA MAC address. Private MAC PSKs are stored on the RADIUS server.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'] });

				o = ss.taboption('encryption', form.Value, 'auth_server', _('RADIUS Authentication Server'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.rmempty = true;
				o.datatype = 'host(0)';

				o = ss.taboption('encryption', form.Value, 'auth_port', _('RADIUS Authentication Port'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.rmempty = true;
				o.datatype = 'port';
				o.placeholder = '1812';

				o = ss.taboption('encryption', form.Value, 'auth_secret', _('RADIUS Authentication Secret'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.rmempty = true;
				o.password = true;

				o = ss.taboption('encryption', form.Value, 'acct_server', _('RADIUS Accounting Server'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.datatype = 'host(0)';

				o = ss.taboption('encryption', form.Value, 'acct_port', _('RADIUS Accounting Port'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.datatype = 'port';
				o.placeholder = '1813';

				o = ss.taboption('encryption', form.Value, 'acct_secret', _('RADIUS Accounting Secret'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.password = true;

				/* extra RADIUS settings start */
				const attr_validate = function(section_id, value) {
					if (!value)
						return true;

					if (!/^[0-9]+(:s:.+|:d:[0-9]+|:x:([0-9a-zA-Z]{2})+)?$/.test(value) )
						return _('Must be in %s format.').format('<attr_id>[:<syntax:value>]');

					return true;
				};

				const req_attr_syntax = _('Format:') + '<code>&lt;attr_id&gt;[:&lt;syntax:value&gt;]</code>' + '<br />' +
					'<code>syntax: s = %s; '.format(_('string (UTF-8)')) + 'd = %s; '.format(_('integer')) + 'x = %s</code>'.format(_('octet string'));

				/* https://w1.fi/cgit/hostap/commit/?id=af35e7af7f8bb1ca9f0905b4074fb56a264aa12b */
				o = ss.taboption('encryption', form.DynamicList, 'radius_auth_req_attr', _('RADIUS Access-Request attributes'),
					_('Attributes to add/replace in each request.') + '<br />' + req_attr_syntax );
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.validate = attr_validate;
				o.placeholder = '126:s:Operator';

				o = ss.taboption('encryption', form.DynamicList, 'radius_acct_req_attr', _('RADIUS Accounting-Request attributes'),
					_('Attributes to add/replace in each request.') + '<br />' + req_attr_syntax );
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.validate = attr_validate;
				o.placeholder = '77:x:74657374696e67';

				o = ss.taboption('encryption', form.ListValue, 'dynamic_vlan', _('RADIUS Dynamic VLAN Assignment'), _('Required: Rejects auth if RADIUS server does not provide appropriate VLAN attributes.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.value('0', _('Disabled'));
				o.value('1', _('Optional'));
				o.value('2', _('Required'));
				o.write = function (section_id, value) {
					return this.super('write', [section_id, (value == 0) ? null: value]);
				};

				o = ss.taboption('encryption', form.Flag, 'per_sta_vif', _('RADIUS Per STA VLAN'), _('Each STA is assigned its own AP_VLAN interface.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });

				//hostapd internally defaults to vlan_naming=1 even with dynamic VLAN off
				o = ss.taboption('encryption', form.Flag, 'vlan_naming', _('RADIUS VLAN Naming'), _('Off: <code>vlanXXX</code>, e.g., <code>vlan1</code>. On: <code>vlan_tagged_interface.XXX</code>, e.g. <code>eth0.1</code>.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.enabled = '1';
				o.disabled = '0';
				o.default = o.enabled;

				o = ss.taboption('encryption', widgets.DeviceSelect, 'vlan_tagged_interface', _('RADIUS VLAN Tagged Interface'), _('E.g. eth0, eth1'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.size = 1;
				o.rmempty = true;
				o.multiple = false;
				o.noaliases = true;
				o.nocreate = true;
				o.noinactive = true;

				o = ss.taboption('encryption', form.Value, 'vlan_bridge', _('RADIUS VLAN Bridge Naming Scheme'), _('E.g. <code>br-vlan</code> or <code>brvlan</code>.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['1'] });
				o.rmempty = true;

				/* extra RADIUS settings end */

				o = ss.taboption('encryption', form.Value, 'dae_client', _('DAE-Client'), _('Dynamic Authorization Extension client.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.datatype = 'host(0)';

				o = ss.taboption('encryption', form.Value, 'dae_port', _('DAE-Port'), _('Dynamic Authorization Extension port.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.datatype = 'port';
				o.placeholder = '3799';

				o = ss.taboption('encryption', form.Value, 'dae_secret', _('DAE-Secret'), _('Dynamic Authorization Extension secret.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
				o.rmempty = true;
				o.password = true;

				//WPA(1) has only WPA IE. Only >= WPA2 has RSN IE Preauth frames.
				o = ss.taboption('encryption', form.Flag, 'rsn_preauth', _('RSN Preauth'), _('Robust Security Network (RSN): Allow roaming preauth for WPA2-EAP networks (and advertise it in WLAN beacons). Only works if the specified network interface is a bridge. Shortens the time-critical reassociation process.'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa2', 'wpa3', 'wpa3-mixed'] });


				o = ss.taboption('encryption', form.Value, '_wpa_key', _('Key'));
				add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'], ppsk: ['0'] });
				add_dependency_permutations(o, { mode: ['sta', 'adhoc', 'mesh', 'sta-wds'], encryption: ['psk', 'psk2', 'psk+psk2', 'psk-mixed'] });
				o.depends('encryption', 'sae');
				o.depends('encryption', 'sae-mixed');
				o.datatype = 'wpakey';
				o.rmempty = true;
				o.password = true;

				o.cfgvalue = function(section_id) {
					const key = uci.get('wireless', section_id, 'key');
					return /^[1234]$/.test(key) ? null : key;
				};

				o.write = function(section_id, value) {
					uci.set('wireless', section_id, 'key', value);
					uci.unset('wireless', section_id, 'key1');
					uci.unset('wireless', section_id, 'key2');
					uci.unset('wireless', section_id, 'key3');
					uci.unset('wireless', section_id, 'key4');
				};


				o = ss.taboption('encryption', form.ListValue, '_wep_key', _('Used Key Slot'));
				o.depends('encryption', 'wep-open');
				o.depends('encryption', 'wep-shared');
				o.value('1', _('Key #%d').format(1));
				o.value('2', _('Key #%d').format(2));
				o.value('3', _('Key #%d').format(3));
				o.value('4', _('Key #%d').format(4));

				o.cfgvalue = function(section_id) {
					const slot = +uci.get('wireless', section_id, 'key');
					return (slot >= 1 && slot <= 4) ? String(slot) : '';
				};

				o.write = function(section_id, value) {
					uci.set('wireless', section_id, 'key', value);
				};

				for (let slot = 1; slot <= 4; slot++) {
					o = ss.taboption('encryption', form.Value, 'key%d'.format(slot), _('Key #%d').format(slot));
					o.depends('encryption', 'wep-open');
					o.depends('encryption', 'wep-shared');
					o.datatype = 'wepkey';
					o.rmempty = true;
					o.password = true;

					o.write = function(section_id, value) {
						if (value != null && (value.length == 5 || value.length == 13))
							value = 's:%s'.format(value);
						uci.set('wireless', section_id, this.option, value);
					};
				}


				if (hwtype == 'mac80211') {

					// Probe 802.11r support (and EAP support as a proxy for Openwrt)
					const has_80211r = L.hasSystemFeature('hostapd', '11r') || L.hasSystemFeature('hostapd', 'eap');

					o = ss.taboption('roaming', form.Flag, 'ieee80211r', _('802.11r Fast Transition'), _('Enables fast roaming among access points that belong to the same Mobility Domain'));
					add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
					if (has_80211r)
						add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk2', 'psk-mixed', 'sae', 'sae-mixed'] });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'nasid', _('NAS ID'), _('Used for two different purposes: RADIUS NAS ID and 802.11r R0KH-ID. Not needed with normal WPA(2)-PSK.'));
					add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
					o.depends({ ieee80211r: '1' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'mobility_domain', _('Mobility Domain'), _('4-character hexadecimal ID'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = _('automatically derived from SSID');
					o.datatype = 'and(hexstring,length(4))';
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'reassociation_deadline', _('Reassociation Deadline'), _('time units (TUs / 1.024 ms) [1000-65535]'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = '20000';
					o.datatype = 'range(1000,65535)';
					o.rmempty = true;

					o = ss.taboption('roaming', form.ListValue, 'ft_over_ds', _('FT protocol'));
					o.depends({ ieee80211r: '1' });
					o.value('0', _('FT over the Air'));
					o.value('1', _('FT over DS'));
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'ft_psk_generate_local', _('Generate PMK locally'), _('When using a PSK, the PMK can be automatically generated. When enabled, the R0/R1 key options below are not applied. Disable this to use the R0 and R1 key options.'));
					add_dependency_permutations(o, { ieee80211r: ['1'], mode: ['ap', 'ap-wds'], encryption: ['psk2', 'psk-mixed'] });
					o.default = o.enabled;
					o.rmempty = false;

					o = ss.taboption('roaming', form.Value, 'r0_key_lifetime', _('R0 Key Lifetime'), _('minutes'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = '10000';
					o.datatype = 'uinteger';
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'r1_key_holder', _('R1 Key Holder'), _('6-octet identifier as a hex string - no colons'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = _('automatically derived from Mobility Domain and PSK');
					o.datatype = 'and(hexstring,length(12))';
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'pmk_r1_push', _('PMK R1 Push'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = '0';
					o.rmempty = true;

					o = ss.taboption('roaming', form.DynamicList, 'r0kh', _('External R0 Key Holder List'), _('List of R0KHs in the same Mobility Domain. <br />Format: MAC-address,NAS-Identifier,256-bit key as hex string. <br />This list is used to map R0KH-ID (NAS Identifier) to a destination MAC address when requesting PMK-R1 key from the R0KH that the STA used during the Initial Mobility Domain Association.'));
					o.depends({ ieee80211r: '1' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.DynamicList, 'r1kh', _('External R1 Key Holder List'), _ ('List of R1KHs in the same Mobility Domain. <br />Format: MAC-address,R1KH-ID as 6 octets with colons,256-bit key as hex string. <br />This list is used to map R1KH-ID to a destination MAC address when sending PMK-R1 key from the R0KH. This is also the list of authorized R1KHs in the MD that can request PMK-R1 keys.'));
					o.depends({ ieee80211r: '1' });
					o.rmempty = true;
					// End of 802.11r options

					// Probe 802.11k and 802.11v support via EAP support (full hostapd has EAP)
					if (L.hasSystemFeature('hostapd', 'eap')) {
						/* 802.11k settings start */
						o = ss.taboption('roaming', form.Flag, 'ieee80211k', _('802.11k RRM'), _('Radio Resource Measurement - Sends beacons to assist roaming. Not all clients support this.'));
						// add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk', 'psk2', 'psk-mixed', 'sae', 'sae-mixed'] });
						o.depends('mode', 'ap');
						o.depends('mode', 'ap-wds');

						o = ss.taboption('roaming', form.Flag, 'rrm_neighbor_report', _('Neighbour Report'), _('802.11k: Enable neighbor report via radio measurements.'));
						o.depends({ ieee80211k: '1' });
						o.default = o.enabled;

						o = ss.taboption('roaming', form.Flag, 'rrm_beacon_report', _('Beacon Report'), _('802.11k: Enable beacon report via radio measurements.'));
						o.depends({ ieee80211k: '1' });
						o.default = o.enabled;
						/* 802.11k settings end */

						/* 802.11v settings start */
						o = ss.taboption('roaming', form.ListValue, 'time_advertisement', _('Time advertisement'), _('802.11v: Time Advertisement in management frames.'));
						o.value('0', _('Disabled'));
						o.value('2', _('Enabled'));
						o.write = function (section_id, value) {
							return this.super('write', [section_id, (value == 2) ? value: null]);
						};

						//Pull current System TZ setting
						const tz = uci.get('system', '@system[0]', 'timezone');
						o = ss.taboption('roaming', form.Value, 'time_zone', _('Time zone'), _('802.11v: Local Time Zone Advertisement in management frames.'));
						o.value(tz);
						o.rmempty = true;

						o = ss.taboption('roaming', form.Flag, 'wnm_sleep_mode', _('WNM Sleep Mode'), _('802.11v: Wireless Network Management (WNM) Sleep Mode (extended sleep mode for stations).'));
						o.rmempty = true;

						/* wnm_sleep_mode_no_keys: https://git.openwrt.org/?p=openwrt/openwrt.git;a=commitdiff;h=bf98faaac8ed24cf7d3d93dd4fcd7304d109363b */
						o = ss.taboption('roaming', form.Flag, 'wnm_sleep_mode_no_keys', _('WNM Sleep Mode Fixes'), _('802.11v: Wireless Network Management (WNM) Sleep Mode Fixes: Prevents reinstallation attacks.'));
						o.rmempty = true;

						o = ss.taboption('roaming', form.Flag, 'bss_transition', _('BSS Transition'), _('802.11v: Basic Service Set (BSS) transition management.'));
						o.rmempty = true;

						/* in master, but not 21.02.1: proxy_arp */
						o = ss.taboption('roaming', form.Flag, 'proxy_arp', _('ProxyARP'), _('802.11v: Proxy ARP enables non-AP STA to remain in power-save for longer.'));
						o.rmempty = true;

						/* TODO: na_mcast_to_ucast is missing: needs adding to hostapd.sh - nice to have */
					}
					/* 802.11v settings end */
				}
				else if (isQcaWifiHwtype(hwtype)) {
					const roaming_encryptions = [ 'psk', 'psk2', 'psk-mixed' ];
					const ft_identifier = getFtIdentifier(radioNet);

					const applyFtIdentifierDefault = function(option, datatype) {
						if (ft_identifier)
							option.placeholder = ft_identifier;

						if (datatype)
							option.datatype = datatype;

						option.write = function(section_id, value) {
							value = String(value || '').trim() || ft_identifier;

							if (value)
								uci.set('wireless', section_id, this.option, value);
							else
								uci.unset('wireless', section_id, this.option);
						};

						option.remove = function(section_id) {
							if (ft_identifier)
								uci.set('wireless', section_id, this.option, ft_identifier);
							else
								uci.unset('wireless', section_id, this.option);
						};
					};

					if (hwtype == 'qcawificfg80211') {
						roaming_encryptions.push('sae');
						roaming_encryptions.push('sae-mixed');
					}

					o = ss.taboption('roaming', form.Flag, 'ieee80211k', _('802.11k'), _('Enables The 802.11k standard provides information to discover the best available access point'));
					add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: roaming_encryptions });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'rrm_neighbor_report', _('Neighbour Report'), _('802.11k: Enable neighbor report via radio measurements.'));
					o.depends({ ieee80211k: '1' });
					o.default = o.enabled;

					o = ss.taboption('roaming', form.Flag, 'rrm_beacon_report', _('Beacon Report'), _('802.11k: Enable beacon report via radio measurements.'));
					o.depends({ ieee80211k: '1' });
					o.default = o.enabled;

					o = ss.taboption('roaming', form.Flag, 'ieee80211v', _('802.11v'), _('Enables 802.11v allows client devices to exchange information about the network topology, facilitating overall improvement of the wireless network.'));
					add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: roaming_encryptions });
					o.rmempty = true;

					o = ss.taboption('roaming', form.ListValue, 'time_advertisement', _('Time advertisement'), _('802.11v: Time Advertisement in management frames.'));
					o.depends({ ieee80211v: '1' });
					o.value('0', _('Disabled'));
					o.value('2', _('Enabled'));
					o.write = function(section_id, value) {
						return this.super('write', [ section_id, (value == 2) ? value : null ]);
					};

					o = ss.taboption('roaming', form.Value, 'time_zone', _('Time zone'), _('802.11v: Local Time Zone Advertisement in management frames.'));
					o.depends({ time_advertisement: '2' });
					o.placeholder = uci.get('system', '@system[0]', 'timezone') || 'UTC8';
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'wnm_sleep_mode', _('WNM Sleep Mode'), _('802.11v: Wireless Network Management (WNM) Sleep Mode (extended sleep mode for stations).'));
					o.depends({ ieee80211v: '1' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'bss_transition', _('BSS Transition'), _('802.11v: Basic Service Set (BSS) transition management.'));
					o.depends({ ieee80211v: '1' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'ieee80211r', _('802.11r Fast Transition'), _('Enables fast roaming among access points that belong to the same Mobility Domain'));
					add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: roaming_encryptions });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'nasid', _('NAS ID'), _('Used for two different purposes: RADIUS NAS ID and 802.11r R0KH-ID. Not needed with normal WPA(2)-PSK.'));
					o.depends({ ieee80211r: '1' });
					o.rmempty = true;
					applyFtIdentifierDefault(o);

					o = ss.taboption('roaming', form.Value, 'mobility_domain', _('Mobility Domain'), _('4-character hexadecimal ID'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = '4f57';
					o.datatype = 'and(hexstring,length(4))';
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'reassociation_deadline', _('Reassociation Deadline'), _('time units (TUs / 1.024 ms) [1000-65535]'));
					o.depends({ ieee80211r: '1' });
					o.placeholder = '1000';
					o.datatype = 'range(1000,65535)';
					o.rmempty = true;

					o = ss.taboption('roaming', form.ListValue, 'ft_over_ds', _('FT protocol'));
					o.depends({ ieee80211r: '1' });
					o.value('1', _('FT over DS'));
					o.value('0', _('FT over the Air'));
					o.rmempty = true;

					o = ss.taboption('roaming', form.Flag, 'ft_psk_generate_local', _('Generate PMK locally'), _('When using a PSK, the PMK can be generated locally without inter AP communications'));
					o.depends({ ieee80211r: '1' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'r0_key_lifetime', _('R0 Key Lifetime'), _('minutes'));
					o.depends({ ieee80211r: '1', ft_psk_generate_local: '' });
					o.placeholder = '10000';
					o.datatype = 'uinteger';
					o.rmempty = true;

					o = ss.taboption('roaming', form.Value, 'r1_key_holder', _('R1 Key Holder'), _('6-octet identifier as a hex string - no colons'));
					o.depends({ ieee80211r: '1', ft_psk_generate_local: '' });
					o.rmempty = true;
					applyFtIdentifierDefault(o, 'and(hexstring,length(12))');

					o = ss.taboption('roaming', form.Flag, 'pmk_r1_push', _('PMK R1 Push'));
					o.depends({ ieee80211r: '1', ft_psk_generate_local: '' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.DynamicList, 'r0kh', _('External R0 Key Holder List'), _('List of R0KHs in the same Mobility Domain. <br />Format: MAC-address,NAS-Identifier,128-bit key as hex string. <br />This list is used to map R0KH-ID (NAS Identifier) to a destination MAC address when requesting PMK-R1 key from the R0KH that the STA used during the Initial Mobility Domain Association.'));
					o.depends({ ieee80211r: '1', ft_psk_generate_local: '' });
					o.rmempty = true;

					o = ss.taboption('roaming', form.DynamicList, 'r1kh', _('External R1 Key Holder List'), _('List of R1KHs in the same Mobility Domain. <br />Format: MAC-address,R1KH-ID as 6 octets with colons,128-bit key as hex string. <br />This list is used to map R1KH-ID to a destination MAC address when sending PMK-R1 key from the R0KH. This is also the list of authorized R1KHs in the MD that can request PMK-R1 keys.'));
					o.depends({ ieee80211r: '1', ft_psk_generate_local: '' });
					o.rmempty = true;
				}

				if (hwtype == 'mac80211') {
					o = ss.taboption('encryption', form.ListValue, 'eap_type', _('EAP-Method'));
					o.value('tls',  'TLS');
					o.value('ttls', 'TTLS');
					o.value('peap', 'PEAP');
					o.value('fast', 'FAST');
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });

					o = ss.taboption('encryption', form.Flag, 'ca_cert_usesystem', _('Use system certificates'), _("Validate server certificate using built-in system CA bundle,<br />requires the \"ca-bundle\" package"));
					o.enabled = '1';
					o.disabled = '0';
					o.default = o.disabled;
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });
					o.validate = function(section_id, value) {
						if (value == '1' && !L.hasSystemFeature('cabundle')) {
							return _("This option cannot be used because the ca-bundle package is not installed.");
						}
						return true;
					};

					o = ss.taboption('encryption', form.FileUpload, 'ca_cert', _('Path to CA-Certificate'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], ca_cert_usesystem: ['0'] });

					o = ss.taboption('encryption', form.Value, 'subject_match', _('Certificate constraint (Subject)'), _("Certificate constraint substring - e.g. /CN=wifi.mycompany.com<br />See `logread -f` during handshake for actual values"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });

					o = ss.taboption('encryption', form.DynamicList, 'altsubject_match', _('Certificate constraint (SAN)'), _("Certificate constraint(s) via Subject Alternate Name values<br />(supported attributes: EMAIL, DNS, URI) - e.g. DNS:wifi.mycompany.com"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });

					o = ss.taboption('encryption', form.DynamicList, 'domain_match', _('Certificate constraint (Domain)'), _("Certificate constraint(s) against DNS SAN values (if available)<br />or Subject CN (exact match)"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });

					o = ss.taboption('encryption', form.DynamicList, 'domain_suffix_match', _('Certificate constraint (Wildcard)'), _("Certificate constraint(s) against DNS SAN values (if available)<br />or Subject CN (suffix match)"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'] });

					o = ss.taboption('encryption', form.FileUpload, 'client_cert', _('Path to Client-Certificate'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['tls'] });

					o = ss.taboption('encryption', form.FileUpload, 'private_key', _('Path to Private Key'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['tls'] });

					o = ss.taboption('encryption', form.Value, 'private_key_passwd', _('Password of Private Key'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['tls'] });
					o.password = true;

					o = ss.taboption('encryption', form.ListValue, 'auth', _('Authentication'));
					o.value('PAP', 'PAP');
					o.value('CHAP', 'CHAP');
					o.value('MSCHAP', 'MSCHAP');
					o.value('MSCHAPV2', 'MSCHAPv2');
					o.value('EAP-GTC', 'EAP-GTC');
					o.value('EAP-MD5', 'EAP-MD5');
					o.value('EAP-MSCHAPV2', 'EAP-MSCHAPv2');
					o.value('EAP-TLS', 'EAP-TLS');
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['fast', 'peap', 'ttls'] });

					o.validate = function(section_id, value) {
						const eo = this.section.children.filter(function(o) { return o.option == 'eap_type'; })[0];
						const ev = eo.formvalue(section_id);

						if (ev != 'ttls' && (value == 'PAP' || value == 'CHAP' || value == 'MSCHAP' || value == 'MSCHAPV2'))
							return _('This authentication type is not applicable to the selected EAP method.');

						return true;
					};

					o = ss.taboption('encryption', form.Flag, 'ca_cert2_usesystem', _('Use system certificates for inner-tunnel'), _("Validate server certificate using built-in system CA bundle,<br />requires the \"ca-bundle\" package"));
					o.enabled = '1';
					o.disabled = '0';
					o.default = o.disabled;
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });
					o.validate = function(section_id, value) {
						if (value == '1' && !L.hasSystemFeature('cabundle')) {
							return _("This option cannot be used because the ca-bundle package is not installed.");
						}
						return true;
					};

					o = ss.taboption('encryption', form.FileUpload, 'ca_cert2', _('Path to inner CA-Certificate'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'], ca_cert2_usesystem: ['0'] });

					o = ss.taboption('encryption', form.Value, 'subject_match2', _('Inner certificate constraint (Subject)'), _("Certificate constraint substring - e.g. /CN=wifi.mycompany.com<br />See `logread -f` during handshake for actual values"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });

					o = ss.taboption('encryption', form.DynamicList, 'altsubject_match2', _('Inner certificate constraint (SAN)'), _("Certificate constraint(s) via Subject Alternate Name values<br />(supported attributes: EMAIL, DNS, URI) - e.g. DNS:wifi.mycompany.com"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });

					o = ss.taboption('encryption', form.DynamicList, 'domain_match2', _('Inner certificate constraint (Domain)'), _("Certificate constraint(s) against DNS SAN values (if available)<br />or Subject CN (exact match)"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });

					o = ss.taboption('encryption', form.DynamicList, 'domain_suffix_match2', _('Inner certificate constraint (Wildcard)'), _("Certificate constraint(s) against DNS SAN values (if available)<br />or Subject CN (suffix match)"));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });

					o = ss.taboption('encryption', form.FileUpload, 'client_cert2', _('Path to inner Client-Certificate'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });

					o = ss.taboption('encryption', form.FileUpload, 'private_key2', _('Path to inner Private Key'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });

					o = ss.taboption('encryption', form.Value, 'private_key2_passwd', _('Password of inner Private Key'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], auth: ['EAP-TLS'] });
					o.password = true;

					o = ss.taboption('encryption', form.Value, 'identity', _('Identity'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['fast', 'peap', 'tls', 'ttls'] });

					o = ss.taboption('encryption', form.Value, 'anonymous_identity', _('Anonymous Identity'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['fast', 'peap', 'tls', 'ttls'] });

					o = ss.taboption('encryption', form.Value, 'password', _('Password'));
					add_dependency_permutations(o, { mode: ['sta', 'sta-wds'], encryption: ['wpa', 'wpa2', 'wpa3', 'wpa3-mixed', 'wpa3-192'], eap_type: ['fast', 'peap', 'ttls'] });
					o.password = true;


					if (hwtype == 'mac80211') {
						// ieee802.11w options
						o = ss.taboption('encryption', form.ListValue, 'ieee80211w', _('802.11w Management Frame Protection'), _("Note: Some wireless drivers do not fully support 802.11w. E.g. mwlwifi may have problems"));
						o.value('0', _('Disabled'));
						o.value('1', _('Optional'));
						o.value('2', _('Required'));
						add_dependency_permutations(o, { mode: ['ap', 'ap-wds', 'sta', 'sta-wds'], encryption: ['owe', 'psk2', 'psk-mixed', 'sae', 'sae-mixed', 'wpa2', 'wpa3', 'wpa3-mixed'] });

						o.defaults = {
							'2': [{ encryption: 'sae' }, { encryption: 'owe' }, { encryption: 'wpa3' }, { encryption: 'wpa3-mixed' }],
							'1': [{ encryption: 'sae-mixed'}],
							'0': []
						};

						o.write = function(section_id, value) {
							if (value != this.default)
								return form.ListValue.prototype.write.call(this, section_id, value);
							else
								return form.ListValue.prototype.remove.call(this, section_id);
						};

						o = ss.taboption('encryption', form.Value, 'ieee80211w_max_timeout', _('802.11w maximum timeout'), _('802.11w Association SA Query maximum timeout'));
						o.depends('ieee80211w', '1');
						o.depends('ieee80211w', '2');
						o.datatype = 'uinteger';
						o.placeholder = '1000';
						o.rmempty = true;

						o = ss.taboption('encryption', form.Value, 'ieee80211w_retry_timeout', _('802.11w retry timeout'), _('802.11w Association SA Query retry timeout'));
						o.depends('ieee80211w', '1');
						o.depends('ieee80211w', '2');
						o.datatype = 'uinteger';
						o.placeholder = '201';
						o.rmempty = true;

						if (L.hasSystemFeature('hostapd', 'ocv') || L.hasSystemFeature('wpasupplicant', 'ocv')) {
							o = ss.taboption('encryption', form.ListValue, 'ocv', _('Operating Channel Validation'), _("Note: Workaround mode allows a STA that claims OCV capability to connect even if the STA doesn't send OCI or negotiate PMF."));
							o.value('0', _('Disabled'));
							o.value('1', _('Enabled'));
							o.value('2', _('Enabled (workaround mode)'));
							o.default = '0';
							o.depends('ieee80211w', '1');
							o.depends('ieee80211w', '2');

							o.validate = function(section_id, value) {
								const modeopt = this.section.children.filter(function(o) { return o.option == 'mode'; })[0];
								const modeval = modeopt.formvalue(section_id);

								if ((value == '2') && ((modeval == 'sta') || (modeval == 'sta-wds'))) {
									return _('Workaround mode can only be used when acting as an access point.');
								}

								return true;
							};
						}

						o = ss.taboption('encryption', form.Flag, 'wpa_disable_eapol_key_retries', _('Enable key reinstallation (KRACK) countermeasures'), _('Complicates key reinstallation attacks on the client side by disabling retransmission of EAPOL-Key frames that are used to install keys. This workaround might cause interoperability issues and reduced robustness of key negotiation especially in environments with heavy traffic load.'));
						add_dependency_permutations(o, { mode: ['ap', 'ap-wds'], encryption: ['psk2', 'psk-mixed', 'sae', 'sae-mixed', 'wpa2', 'wpa3', 'wpa3-mixed'] });

						if (L.hasSystemFeature('hostapd', 'wps') && L.hasSystemFeature('wpasupplicant')) {
							o = ss.taboption('encryption', form.Flag, 'wps_pushbutton', _('Enable WPS pushbutton, requires WPA(2)-PSK/WPA3-SAE'));
							o.enabled = '1';
							o.disabled = '0';
							o.default = o.disabled;
							o.depends('encryption', 'psk');
							o.depends('encryption', 'psk2');
							o.depends('encryption', 'psk-mixed');
							o.depends('encryption', 'sae');
							o.depends('encryption', 'sae-mixed');
						}
					}
				}
			});
		};

		s.handleRemove = function(section_id, ev) {
			const radioNet = this.lookupRadioOrNetwork(section_id);
			const radioName = radioNet.getWifiDeviceName();
			const hwtype = uci.get('wireless', radioName, 'type');
			const ifmode = radioNet.getMode();

			if (hwtype == 'mt_dbdc' && ifmode == 'ap') {
				const wifi_sections = uci.sections('wireless', 'wifi-iface');
				let mbssid_num = 0;

				for (let ws of wifi_sections) {
					if (ws.device == radioName && ws.mode == 'ap')
						mbssid_num++;
				}

				if (mbssid_num <= 1) {
					return ui.showModal(_('Wireless configuration error'), [
						E('p', _('At least one MBSSID needs to be reserved')),
						E('div', { 'class': 'right' }, E('button', {
							'class': 'btn',
							'click': ui.hideModal
						}, _('Close')))
					]);
				}
			}

			document.querySelector('.cbi-section-table-row[data-sid="%s"]'.format(section_id)).style.opacity = 0.5;
			return form.TypedSection.prototype.handleRemove.apply(this, [section_id, ev]);
		};

		s.handleScan = function(radioDev, ev) {
			const table = E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th col-2 middle center' }, _('Signal')),
					E('th', { 'class': 'th col-4 middle left' }, _('SSID')),
					E('th', { 'class': 'th col-2 middle center hide-xs' }, _('Channel')),
					E('th', { 'class': 'th col-2 middle left hide-xs' }, _('Mode')),
					E('th', { 'class': 'th col-3 middle left hide-xs' }, _('BSSID')),
					E('th', { 'class': 'th col-3 middle left' }, _('Encryption')),
					E('th', { 'class': 'th cbi-section-actions right' }, ' '),
				])
			]);

			const stop = E('button', {
				'class': 'btn',
				'click': L.bind(this.handleScanStartStop, this),
				'style': 'display:none',
				'data-state': 'stop'
			}, _('Stop refresh'));

			cbi_update_table(table, [], E('em', { class: 'spinning' }, _('Starting wireless scan...')));

			const md = ui.showModal(_('Join Network: Wireless Scan'), [
				table,
				E('div', { 'class': 'right' }, [
					stop,
					' ',
					E('button', {
						'class': 'btn',
						'click': L.bind(this.handleScanAbort, this)
					}, _('Dismiss'))
				])
			]);

			md.style.maxWidth = '90%';
			md.style.maxHeight = 'none';

			this.pollFn = L.bind(this.handleScanRefresh, this, radioDev, {}, table, stop);

			poll.add(this.pollFn);
			poll.start();
		};

		s.handleScanRefresh = function(radioDev, scanCache, table, stop) {
			return radioDev.getScanList().then(L.bind(function(results) {
				const rows = [];

				for (let r of results)
					scanCache[r.bssid] = r;

				for (let k in scanCache)
					if (scanCache[k].stale)
						results.push(scanCache[k]);

				results.sort(function(a, b) {
					const diff = (b.quality - a.quality) || (a.channel - b.channel);

					if (diff)
						return diff;

					if (a.ssid < b.ssid)
						return -1;
					else if (a.ssid > b.ssid)
						return 1;

					if (a.bssid < b.bssid)
						return -1;
					else if (a.bssid > b.bssid)
						return 1;
					return 0;
				});

				results.forEach(res => {
					const qv = res?.quality ?? 0;
					const qm = res?.quality_max ?? 0;
					const q = (qv > 0 && qm > 0) ? Math.floor((100 / qm) * qv) : 0;
					const s = res.stale ? 'opacity:0.5' : '';
					const ssid = (typeof res.ssid === 'string' && res.ssid.length > 0) ? document.createTextNode(`${res?.ssid}`) : null;

					rows.push([
						E('span', { 'style': s }, render_signal_badge(q, res?.signal, res?.noise)),
						E('span', { 'style': s }, ssid ?? E('em', _('hidden'))),
						E('span', { 'style': s }, `${res?.channel}`),
						E('span', { 'style': s }, `${res?.mode}`),
						E('span', { 'style': s }, `${res?.bssid}`),
						E('span', { 'style': s }, `${network.formatWifiEncryption(res?.encryption)}`),
						E('div', { 'class': 'right' }, E('button', {
							'class': 'cbi-button cbi-button-action important',
							'click': ui.createHandlerFn(this, 'handleJoin', radioDev, res)
						}, _('Join Network')))
					]);

					res.stale = true;
				});

				cbi_update_table(table, rows);

				stop.disabled = false;
				stop.style.display = '';
				stop.classList.remove('spinning');
			}, this));
		};

		s.handleScanStartStop = function(ev) {
			const btn = ev.currentTarget;

			if (btn.getAttribute('data-state') == 'stop') {
				if (this.pollFn)
					poll.remove(this.pollFn);
				btn.firstChild.data = _('Start refresh');
				btn.setAttribute('data-state', 'start');
			}
			else {
				poll.add(this.pollFn);
				btn.firstChild.data = _('Stop refresh');
				btn.setAttribute('data-state', 'stop');
				btn.classList.add('spinning');
				btn.disabled = true;
			}
		};

		s.handleScanAbort = function(ev) {
			const md = dom.parent(ev.target, 'div[aria-modal="true"]');
			if (md) {
				md.style.maxWidth = '';
				md.style.maxHeight = '';
			}

			ui.hideModal();
			if (this.pollFn)
				poll.remove(this.pollFn);
			this.pollFn = null;
		};

		s.handleJoinConfirm = function(radioDev, bss, form, ev) {
			const nameopt = L.toArray(form.lookupOption('name', '_new_'))[0];
			const passopt = L.toArray(form.lookupOption('password', '_new_'))[0];
			const ssidopt = L.toArray(form.lookupOption('ssid', '_new_'))[0];
			const bssidopt = L.toArray(form.lookupOption('bssid', '_new_'))[0];
			const zoneopt = L.toArray(form.lookupOption('zone', '_new_'))[0];
			const replopt = L.toArray(form.lookupOption('replace', '_new_'))[0];
			const nameval = (nameopt && nameopt.isValid('_new_')) ? nameopt.formvalue('_new_') : null;
			const passval = (passopt && passopt.isValid('_new_')) ? passopt.formvalue('_new_') : null;
			const ssidval = (ssidopt && ssidopt.isValid('_new_')) ? ssidopt.formvalue('_new_') : null;
			const bssidval = (bssidopt && bssidopt.isValid('_new_')) ? bssidopt.formvalue('_new_') : null;
			const zoneval = zoneopt ? zoneopt.formvalue('_new_') : null;
			const enc = L.isObject(bss.encryption) ? bss.encryption : null;
			const is_wep = (enc && Array.isArray(enc.wep));
			const is_psk = (enc && Array.isArray(enc.wpa) && L.toArray(enc.authentication).some(a => a == 'psk'));
			const is_sae = (enc && Array.isArray(enc.wpa) && L.toArray(enc.authentication).some(a => a == 'sae'));

			if (nameval == null || (passopt && passval == null))
				return;

			let section_id = null;

			return this.map.save(function() {
				const wifi_sections = uci.sections('wireless', 'wifi-iface');
				const hwtype = uci.get('wireless', radioDev.getName(), 'type');

				if (replopt.formvalue('_new_') == '1') {
					for (let ws of wifi_sections)
						if (ws.device == radioDev.getName())
							uci.remove('wireless', ws['.name']);
				}

				if (uci.get('wireless', radioDev.getName(), 'disabled') == '1') {
					for (let ws of wifi_sections)
						if (ws.device == radioDev.getName())
							uci.set('wireless', ws['.name'], 'disabled', '1');

					uci.unset('wireless', radioDev.getName(), 'disabled');

					if (hwtype == 'mt_dbdc') {
						for (let ws of wifi_sections) {
							if (ws.device == radioDev.getName() && ws.mode == 'sta') {
								section_id = ws['.name'];
								uci.unset('wireless', section_id, 'disabled');
							}
						}
					}
				}

				const htmodes = radioDev.getHTModes();

				if (bss.vht_operation && htmodes && htmodes.indexOf('VHT20') !== -1) {
					for (let w = bss.vht_operation.channel_width; w >= 20; w /= 2) {
						if (htmodes.indexOf('VHT'+w) !== -1) {
							uci.set('wireless', radioDev.getName(), 'htmode', 'VHT'+w);
							break;
						}
					}
				}
				else if (bss.ht_operation && htmodes && htmodes.indexOf('HT20') !== -1) {
					const w = (bss.ht_operation.secondary_channel_offset == 'no secondary') ? 20 : 40;
					uci.set('wireless', radioDev.getName(), 'htmode', 'HT'+w);
				}
				else {
					uci.remove('wireless', radioDev.getName(), 'htmode');
				}

				uci.set('wireless', radioDev.getName(), 'channel', bss.channel);

				if (!section_id) {
					section_id = next_free_sid(wifi_sections.length);

					uci.add('wireless', 'wifi-iface', section_id);
					uci.set('wireless', section_id, 'device', radioDev.getName());
					uci.set('wireless', section_id, 'mode', (bss.mode == 'Ad-Hoc') ? 'adhoc' : 'sta');
				}
				uci.set('wireless', section_id, 'network', nameval);

				if (bss.ssid != null) {
					uci.set('wireless', section_id, 'ssid', bss.ssid);

					if (bssidval == '1')
						uci.set('wireless', section_id, 'bssid', bss.bssid);
				}
				else if (bss.bssid != null) {
					uci.set('wireless', section_id, 'bssid', bss.bssid);
				}

				if (ssidval != null)
					uci.set('wireless', section_id, 'ssid', ssidval);

				if (is_sae) {
					uci.set('wireless', section_id, 'encryption', 'sae');
					uci.set('wireless', section_id, 'key', passval);
				}
				else if (is_psk) {
					for (let i = enc.wpa.length - 1; i >= 0; i--) {
						if (enc.wpa[i] == 2) {
							uci.set('wireless', section_id, 'encryption', 'psk2');
							break;
						}
						else if (enc.wpa[i] == 1) {
							uci.set('wireless', section_id, 'encryption', 'psk');
							break;
						}
					}

					uci.set('wireless', section_id, 'key', passval);
				}
				else if (is_wep) {
					uci.set('wireless', section_id, 'encryption', 'wep-open');
					uci.set('wireless', section_id, 'key', '1');
					uci.set('wireless', section_id, 'key1', passval);
				}
				else {
					uci.set('wireless', section_id, 'encryption', 'none');
				}

				return network.addNetwork(nameval, { proto: 'dhcp' }).then(function(net) {
					firewall.deleteNetwork(net.getName());

					const zonePromise = zoneval ?
						firewall.getZone(zoneval).then(function(zone) { return zone || firewall.addZone(zoneval); })
						: Promise.resolve();

					return zonePromise.then(function(zone) {
						if (zone)
							zone.addNetwork(net.getName());
					});
				});
			}).then(L.bind(function() {
				ui.showModal(null, E('p', { 'class': 'spinning' }, [ _('Loading data…') ]));

				return this.renderMoreOptionsModal(section_id);
			}, this));
		};

		s.handleJoin = function(radioDev, bss, ev) {
			if (this.pollFn)
				poll.remove(this.pollFn);
			const m2 = new form.Map('wireless');
			const s2 = m2.section(form.NamedSection, '_new_');
			const enc = L.isObject(bss.encryption) ? bss.encryption : null;
			const is_wep = (enc && Array.isArray(enc.wep));
			const is_psk = (enc && Array.isArray(enc.wpa) && L.toArray(enc.authentication).some(a => a == 'psk'  || a == 'sae'));
			let replace, passphrase, name, bssid, zone;

			function nameUsed(name) {
				const s = uci.get('network', name);
				if (s != null && s['.type'] != 'interface')
					return true;

				const net = (s != null) ? network.instantiateNetwork(name) : null;
				return (net != null && !net.isEmpty());
			}

			s2.render = function() {
				return Promise.all([
					{},
					this.renderUCISection('_new_')
				]).then(this.renderContents.bind(this));
			};

			if (bss.ssid == null) {
				name = s2.option(form.Value, 'ssid', _('Network SSID'), _('The correct SSID must be manually specified when joining a hidden wireless network'));
				name.rmempty = false;
			}

			replace = s2.option(form.Flag, 'replace', _('Replace wireless configuration'), _('Check this option to delete the existing networks from this radio.'));

			name = s2.option(form.Value, 'name', _('Name of the new network'),
				_('Name for OpenWrt network configuration. (No relation to wireless network name/SSID)') + '<br />' +
				_('The allowed characters are: <code>A-Z</code>, <code>a-z</code>, <code>0-9</code> and <code>_</code>'));
			name.datatype = 'uciname';
			name.default = 'wwan';
			name.rmempty = false;
			name.validate = function(section_id, value) {
				if (nameUsed(value))
					return _('The network name is already used');

				return true;
			};

			for (let i = 2; nameUsed(name.default); i++)
				name.default = 'wwan%d'.format(i);

			if (is_wep || is_psk) {
				passphrase = s2.option(form.Value, 'password', is_wep ? _('WEP passphrase') : _('WPA passphrase'), _('Specify the secret encryption key here.'));
				passphrase.datatype = is_wep ? 'wepkey' : 'wpakey';
				passphrase.password = true;
				passphrase.rmempty = false;
			}

			if (bss.ssid != null) {
				bssid = s2.option(form.Flag, 'bssid', _('Lock to BSSID'), _('Instead of joining any network with a matching SSID, only connect to the BSSID <code>%h</code>.').format(bss.bssid));
				bssid.default = '0';
			}

			zone = s2.option(widgets.ZoneSelect, 'zone', _('Create / Assign firewall-zone'), _('Choose the firewall zone you want to assign to this interface. Select <em>unspecified</em> to remove the interface from the associated zone or fill out the <em>custom</em> field to define a new zone and attach the interface to it.'));
			zone.default = 'wan';

			return m2.render().then(L.bind(function(nodes) {
				ui.showModal(_('Joining Network: %q').replace(/%q/, '"%h"'.format(bss.ssid)), [
					nodes,
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn',
							'click': ui.hideModal
						}, _('Cancel')), ' ',
						E('button', {
							'class': 'cbi-button cbi-button-positive important',
							'click': ui.createHandlerFn(this, 'handleJoinConfirm', radioDev, bss, m2)
						}, _('Submit'))
					])
				], 'cbi-modal').querySelector('[id="%s"] input[class][type]'.format((passphrase || name).cbid('_new_'))).focus();
			}, this));
		};

		s.handleAdd = function(radioDev, ev) {
			const hwtype = uci.get('wireless', radioDev.getName(), 'type');

			if (hwtype == 'mt_dbdc') {
				const wifi_sections = uci.sections('wireless', 'wifi-iface');
				let mbssid_num = 0;
				const max_mbssid_num = 16;

				for (let ws of wifi_sections) {
					if (ws.device == radioDev.getName() && ws.mode == 'ap')
						mbssid_num++;
				}

				if (mbssid_num >= max_mbssid_num) {
					return ui.showModal(_('Wireless configuration error'), [
						E('p', _('The number of MBSSID has reached the maximum')),
						E('p', _('Please delete the existing MBSSID and try again.')),
						E('div', { 'class': 'right' }, E('button', {
							'class': 'btn',
							'click': ui.hideModal
						}, _('Close')))
					]);
				}
			}

			const section_id = next_free_sid(uci.sections('wireless', 'wifi-iface').length);

			uci.unset('wireless', radioDev.getName(), 'disabled');

			uci.add('wireless', 'wifi-iface', section_id);
			uci.set('wireless', section_id, 'device', radioDev.getName());
			uci.set('wireless', section_id, 'mode', 'ap');
			uci.set('wireless', section_id, 'ssid', 'ImmortalWrt');
			uci.set('wireless', section_id, 'encryption', 'none');

			m.addedSection = section_id;
			return this.renderMoreOptionsModal(section_id);
		};

		o = s.option(form.DummyValue, '_badge');
		o.modalonly = false;
		o.textvalue = function(section_id) {
			const inst = this.section.lookupRadioOrNetwork(section_id);
			const node = E('div', { 'class': 'center' });

			if (inst.getWifiNetworks)
				node.appendChild(render_radio_badge(inst, this.section.wifis.filter(function(e) {
					return (e.getWifiDeviceName() == inst.getName());
				})));
			else
				node.appendChild(render_network_badge(inst));

			return node;
		};

		o = s.option(form.DummyValue, '_stat');
		o.modalonly = false;
		o.textvalue = function(section_id) {
			const inst = this.section.lookupRadioOrNetwork(section_id);

			if (inst.getWifiNetworks)
				return render_radio_status(inst, this.section.wifis.filter(function(e) {
					return (e.getWifiDeviceName() == inst.getName());
				}));
			else
				return render_network_status(inst);
		};

		return m.render().then(L.bind(function(m, nodes) {
			poll.add(L.bind(function() {
				const tasks = [ network.getHostHints(), network.getWifiDevices(), refreshIwinfoInfoMap() ];

				m?.children[0]?.cfgsections?.().forEach(s => {
					const row = nodes.querySelector('.cbi-section-table-row[data-sid="%s"]'.format(s));
					const dsc = row.querySelector('[data-name="_stat"] > div');
					const btns = row.querySelectorAll('.cbi-section-actions button');

					if (dsc.getAttribute('restart') == '') {
						dsc.setAttribute('restart', '1');
						tasks.push(fs.exec('/sbin/wifi', ['up', s]).catch(function(e) {
							ui.addNotification(null, E('p', e.message));
						}));
					}
					else if (dsc.getAttribute('restart') == '1') {
						dsc.removeAttribute('restart');
						btns[0].classList.remove('spinning');
						btns[0].disabled = false;
					}
				});

				return Promise.all(tasks)
					.then(L.bind(function(hosts_radios) {
						const tasks = [];

						hosts_radios[1].forEach(r => tasks.push(r.getWifiNetworks()) );

						return Promise.all(tasks).then(function(data) {
							hosts_radios[2] = [];

							for (const deviceNetworks of data)
								hosts_radios[2].push.apply(hosts_radios[2], deviceNetworks);

							return hosts_radios;
						});
					}, network))
					.then(L.bind(function(hosts_radios_wifis) {
						const tasks = [];

						hosts_radios_wifis[2].forEach(hrw => tasks.push(getAssocListForNetwork(hrw)) );

						return Promise.all(tasks).then(function(data) {
							hosts_radios_wifis[3] = [];

							for (let i = 0; i < data.length; i++) {
								const wifiNetwork = hosts_radios_wifis[2][i];
								const radioDev = hosts_radios_wifis[1].filter(function(d) { return d.getName() == wifiNetwork.getWifiDeviceName(); })[0];

								for (let dy of data[i])
									hosts_radios_wifis[3].push(Object.assign({ radio: radioDev, network: wifiNetwork }, dy));
							}

							return hosts_radios_wifis;
						});
					}, network))
					.then(L.bind(function(zones, data) {
						data.push(zones);
						return data;
					}, network, zones))
					.then(L.bind(this.poll_status, this, nodes));
			}, this), 5);

			const table = E('table', { 'class': 'table assoclist', 'id': 'wifi_assoclist_table' }, [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th nowrap' }, _('Network')),
					E('th', { 'class': 'th hide-xs' }, _('MAC address')),
					E('th', { 'class': 'th' }, _('Host')),
					E('th', { 'class': 'th' }, _('Signal / Noise')),
					E('th', { 'class': 'th' }, _('RX Rate / TX Rate'))
				])
			]);

			cbi_update_table(table, [], E('em', { 'class': 'spinning' }, _('Collecting data...')));

			return E([ nodes, E('h3', _('Associated Stations')), table ]);
		}, this, m));
	},

	handleReset: null
});
