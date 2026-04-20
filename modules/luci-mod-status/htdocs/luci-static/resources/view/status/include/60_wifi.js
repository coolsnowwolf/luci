'use strict';
'require baseclass';
'require dom';
'require network';
'require uci';
'require fs';
'require rpc';
'require firewall';

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

const callIwinfoDevices = rpc.declare({
	object: 'iwinfo',
	method: 'devices',
	expect: { devices: [] }
});

function isQcaWifiHwtype(hwtype) {
	return (hwtype == 'qcawifi' || hwtype == 'qcawificfg80211');
}

function pushUnique(list, value) {
	if (value && list.indexOf(value) < 0)
		list.push(value);
}

function getQcaFallbackIfname(device, section) {
	if (/^ath\d+$/.test(String(section || '')))
		return section;

	if (/^wifi\d+$/.test(String(device || '')))
		return 'ath' + device.replace(/^wifi/, '');

	return null;
}

function buildIwinfoDeviceLookup(devices) {
	const lookup = Object.create(null);

	for (const device of L.toArray(devices))
		if (device)
			lookup[device] = true;

	return lookup;
}

function getResolvedIwinfoDeviceName(net, deviceLookup) {
	const ifname = net.getIfname();
	const section = net.getName();
	const device = net.getWifiDeviceName();
	const fallback = getQcaFallbackIfname(device, section);

	for (const candidate of [ ifname, section, fallback, device ])
		if (candidate && deviceLookup[candidate])
			return candidate;

	return null;
}

function buildIwinfoResolver(radios, networks, devices) {
	const deviceLookup = buildIwinfoDeviceLookup(devices);
	const aliasMap = Object.create(null);
	const queryTargets = [];
	const radioTargets = Object.create(null);

	function registerTarget(target) {
		if (target && deviceLookup[target])
			pushUnique(queryTargets, target);
	}

	function registerAlias(alias, target) {
		if (alias && target && deviceLookup[target] && aliasMap[alias] == null)
			aliasMap[alias] = target;
	}

	networks.forEach((net) => {
		const target = getResolvedIwinfoDeviceName(net, deviceLookup);
		const ifname = net.getIfname();
		const section = net.getName();
		const device = net.getWifiDeviceName();
		const fallback = getQcaFallbackIfname(device, section);

		if (target && radioTargets[device] == null)
			radioTargets[device] = target;

		registerTarget(target);
		registerAlias(ifname, target);
		registerAlias(section, target);
		registerAlias(fallback, target);
		registerAlias(device, target);
	});

	radios.forEach((radio) => {
		const name = radio.getName();
		const target = radioTargets[name] || (deviceLookup[name] ? name : null);

		registerTarget(target);
		registerAlias(name, target);
	});

	return {
		deviceLookup,
		aliasMap,
		queryTargets
	};
}

function isNetworkDisabled(net) {
	return (net.get('disabled') == '1' || uci.get('wireless', net.getWifiDeviceName(), 'disabled') == '1');
}

function getRadioDisplayType(radio, iwinfoInfoMap) {
	const hwtype = uci.get('wireless', radio.getName(), 'type');
	const hwmode = uci.get('wireless', radio.getName(), 'hwmode') || '';
	const info = iwinfoInfoMap?.[radio.getName()];
	const hwname = info?.hardware?.name;
	let name = radio.getI18n().replace(/^Generic | Wireless Controller .+$/g, '');

	if (hwname && hwname != 'Generic Atheros')
		name = hwname;

	if (name && !/^unknown$/i.test(name) && !/^802\.11unknown$/i.test(name))
		return name;

	if (isQcaWifiHwtype(hwtype)) {
		if (/^11be/.test(hwmode))
			return 'Qualcomm Atheros Wi-Fi 7';
		if (/^11ax/.test(hwmode))
			return 'Qualcomm Atheros Wi-Fi 6';
		if (/^11ac/.test(hwmode))
			return 'Qualcomm Atheros Wi-Fi 5';
		return 'Qualcomm Atheros Wireless';
	}

	return name || _('Unknown');
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

function getDisplayEncryption(net) {
	const encryption = net.getActiveEncryption();

	if (encryption && encryption != '-')
		return encryption;

	return formatConfigEncryption(getConfigEncryptionValue(net.getName(), uci.get('wireless', net.getWifiDeviceName(), 'type')));
}

function getDisplayBSSID(net) {
	const bssid = uci.get('wireless', net.getName(), 'macaddr') ||
		uci.get('wireless', net.getWifiDeviceName(), 'macaddr') ||
		net.getBSSID() || net.getActiveBSSID();

	if (bssid && bssid != '00:00:00:00:00:00')
		return String(bssid).toUpperCase();

	return bssid || null;
}

function getDisplayChannel(net) {
	let channel = net.getChannel();

	if (channel != null && channel !== '' && channel !== 'auto')
		return +channel;

	channel = uci.get('wireless', net.getWifiDeviceName(), 'channel');

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

function getDisplayFrequency(net, channel, iwinfoInfoMap) {
	const candidates = getIwinfoInfoCandidates(net);

	for (const candidate of candidates) {
		const info = iwinfoInfoMap?.[candidate];
		const mhz = +(info?.channel || 0) > 0 ? +(info?.frequency || 0) : +(info?.frequency || 0);

		if (!isNaN(mhz) && mhz > 0)
			return '%.03f'.format(mhz / 1000);
	}

	const frequency = net.getFrequency();
	const hwmode = uci.get('wireless', net.getWifiDeviceName(), 'hwmode') || '';

	if (frequency != null && frequency !== '')
		return frequency;

	return getDerivedFrequencyGHz(hwmode, channel);
}

function normalizeIwinfoBitRate(rate) {
	rate = +rate;

	if (isNaN(rate) || rate <= 0)
		return null;

	return (rate > 100000) ? (rate / 1000) : rate;
}

function getIwinfoInfoCandidates(net) {
	const candidates = [];
	const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');
	const ifname = net.getIfname();
	const section = net.getName();
	const device = net.getWifiDeviceName();
	const fallback = getQcaFallbackIfname(device, section);

	for (const candidate of [ ifname, section ]) {
		if (candidate && candidates.indexOf(candidate) < 0)
			candidates.push(candidate);
	}

	if (isQcaWifiHwtype(hwtype) && fallback) {
		if (candidates.indexOf(fallback) < 0)
			candidates.push(fallback);
	}

	if (device && candidates.indexOf(device) < 0)
		candidates.push(device);

	return candidates;
}

function getDisplayBitRate(net, iwinfoInfoMap) {
	let rate = net.getBitRate();

	if (rate != null && rate > 0)
		return rate;

	for (const candidate of getIwinfoInfoCandidates(net)) {
		rate = normalizeIwinfoBitRate(iwinfoInfoMap?.[candidate]?.bitrate);

		if (rate != null)
			return rate;
	}

	return null;
}

function getNonDefaultCountryCode(candidates) {
	for (const candidate of candidates) {
		const country = String(candidate || '').toUpperCase();

		if (country && country != '00')
			return country;
	}

	return null;
}

function getDisplayCountryCode(net, iwinfoInfoMap) {
	const candidates = getIwinfoInfoCandidates(net);

	const infoCountry = getNonDefaultCountryCode(candidates.map((candidate) => iwinfoInfoMap?.[candidate]?.country));

	if (infoCountry)
		return infoCountry;

	const runtimeCountry = getNonDefaultCountryCode([ net.getCountryCode() ]);

	if (runtimeCountry)
		return runtimeCountry;

	const configCountry = getNonDefaultCountryCode([ uci.get('wireless', net.getWifiDeviceName(), 'country') ]);

	if (configCountry)
		return configCountry;

	for (const candidate of getIwinfoInfoCandidates(net)) {
		const country = iwinfoInfoMap?.[candidate]?.country;

		if (country)
			return country;
	}

	return net.getCountryCode() || uci.get('wireless', net.getWifiDeviceName(), 'country') || '00';
}

function getDisplayNoise(net, iwinfoInfoMap) {
	let noise = net.getNoise();

	if (noise != null && noise !== 0)
		return noise;

	for (const candidate of getIwinfoInfoCandidates(net)) {
		noise = iwinfoInfoMap?.[candidate]?.noise;

		if (noise != null && noise !== 0)
			return noise;
	}

	return null;
}

function getDisplayTXPower(net, iwinfoInfoMap) {
	const configured = +uci.get('wireless', net.getWifiDeviceName(), 'txpower');
	const radioDisabled = (uci.get('wireless', net.getWifiDeviceName(), 'disabled') == '1');

	if (radioDisabled)
		return null;

	let txpower = net.getTXPower();

	if (txpower != null && txpower > 0)
		return txpower;

	for (const candidate of getIwinfoInfoCandidates(net)) {
		txpower = iwinfoInfoMap?.[candidate]?.txpower;

		if (txpower != null && txpower > 0)
			return txpower;
	}

	return (!isNaN(configured) && configured > 0) ? configured : null;
}

function getDisplaySignalPercent(net, is_assoc) {
	const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');
	const disabled = isNetworkDisabled(net);

	if (disabled)
		return -1;
	if (isQcaWifiHwtype(hwtype) && net.getMode() == 'ap')
		return is_assoc ? 100 : 0;
	if (net.isUp())
		return net.getSignalPercent();

	return is_assoc ? 0 : -1;
}

function getDisplaySignalValue(net, is_assoc, iwinfoInfoMap) {
	const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');

	if (isQcaWifiHwtype(hwtype) && net.getMode() == 'ap' && is_assoc)
		return getDisplayTXPower(net, iwinfoInfoMap);

	return net.getSignal();
}

function getDisplayNoiseValue(net, is_assoc, iwinfoInfoMap) {
	const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');

	if (isQcaWifiHwtype(hwtype) && net.getMode() == 'ap' && is_assoc)
		return null;

	return getDisplayNoise(net, iwinfoInfoMap);
}

function isDisplayAssociated(net, assocCount) {
	const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');
	const mode = net.getMode();
	const bssid = getDisplayBSSID(net);
	const channel = getDisplayChannel(net);
	const disabled = isNetworkDisabled(net);

	if (bssid && bssid != '00:00:00:00:00:00' && channel && net.getActiveMode() != 'Unknown' && !disabled)
		return true;
	if (isQcaWifiHwtype(hwtype) && !disabled && mode == 'ap' && channel)
		return true;
	if (assocCount > 0)
		return true;

	return false;
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

function getAssocListCandidates(net, resolver) {
	const candidates = [];
	const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');
	const ifname = net.getIfname();
	const section = net.getName();
	const device = net.getWifiDeviceName();
	const fallback = getQcaFallbackIfname(device, section);

	if (resolver?.aliasMap) {
		for (const candidate of [ ifname, section, fallback, device ])
			pushUnique(candidates, resolver.aliasMap[candidate]);

		if (candidates.length)
			return candidates;
	}

	for (const candidate of [ ifname, section ])
		pushUnique(candidates, candidate);

	if (isQcaWifiHwtype(hwtype))
		pushUnique(candidates, fallback);

	return candidates;
}

return baseclass.extend({
	title: _('Wireless'),
	disableCache: true,

	WPSTranslateTbl: {
		Disabled: _('Disabled'),
		Active: _('Active'),
		'Timed-out': _('Timed-out'),
		Overlap: _('Overlap'),
		Unknown: _('Unknown')
	},

	callSessionAccess: rpc.declare({
		object: 'session',
		method: 'access',
		params: [ 'scope', 'object', 'function' ],
		expect: { 'access': false }
	}),

	loadIwinfoResolver(radios, networks) {
		return L.resolveDefault(callIwinfoDevices(), {}).then((res) => {
			return buildIwinfoResolver(radios, networks, res?.devices);
		}).catch(() => ({
			deviceLookup: Object.create(null),
			aliasMap: Object.create(null),
			queryTargets: []
		}));
	},

	loadIwinfoInfoMap(resolver) {
		return Promise.all(resolver.queryTargets.map((name) =>
			L.resolveDefault(callIwinfoInfoCompat(name), null).then((info) => [ name, info ])
		)).then((entries) => {
			const map = {};

			for (const [ name, info ] of entries)
				if (info != null)
					map[name] = info;

			for (const alias in resolver.aliasMap) {
				const target = resolver.aliasMap[alias];

				if (target && map[target] != null)
					map[alias] = map[target];
			}

			return map;
		});
	},

	getAssocListForNetwork(net) {
		const hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type');
		const candidates = getAssocListCandidates(net, this.iwinfoResolver);
		const resolvedIfname = candidates[0];
		const useResolvedIfname = (isQcaWifiHwtype(hwtype) && resolvedIfname && resolvedIfname != net.getIfname());
		const assocPromise = useResolvedIfname
			? L.resolveDefault(callIwinfoAssoclistCompat(resolvedIfname), [])
			: L.resolveDefault(net.getAssocList(), []);
		const fallbackCandidates = useResolvedIfname ? candidates.slice(1) : candidates;

		return assocPromise.then((entries) => {
			if (Array.isArray(entries) && entries.length)
				return entries;

			return probeAssocListCandidates(fallbackCandidates, callIwinfoAssoclistCompat).then((compatEntries) => {
				if (Array.isArray(compatEntries) && compatEntries.length)
					return compatEntries;

				if (!isQcaWifiHwtype(hwtype) || net.getMode() != 'ap')
					return [];

				return probeAssocListCandidates(fallbackCandidates, callWlanconfigAssoclistCompat);
			});
		});
	},

	wifirate(rate) {
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
	},

	handleDelClient(wifinet, mac, ev, cmd) {
		const exec = cmd || 'disconnect';

		dom.parent(ev.currentTarget, '.tr').style.opacity = 0.5;
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		/* Disconnect client before adding to maclist */
		wifinet.disconnectClient(mac, true, 5, 60000);

		if (exec == 'addlist') {
			wifinet.maclist.push(mac);

			uci.set('wireless', wifinet.sid, 'maclist', wifinet.maclist);

			return uci.save()
				.then(L.bind(L.ui.changes.init, L.ui.changes))
				.then(L.bind(L.ui.changes.displayChanges, L.ui.changes));
		}
	},

	handleGetWPSStatus(wifinet) {
		return rpc.declare({
			object: 'hostapd.%s'.format(wifinet),
			method: 'wps_status',
		})()
	},

	handleCallWPS(wifinet, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		return rpc.declare({
			object: 'hostapd.%s'.format(wifinet),
			method: 'wps_start',
		})();
	},

	handleCancelWPS(wifinet, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		return rpc.declare({
			object: 'hostapd.%s'.format(wifinet),
			method: 'wps_cancel',
		})();
	},

	renderbox(radio, networks) {
		let chan = null;
		let freq = null;
		let rate = null;
		let coco = null;
		let noise = null;
		let tx_power = null;
		const badges = [];

		for (let i = 0; i < networks.length; i++) {
			const net = networks[i];
			const assocCount = net.assoclist?.length || 0;
			const is_assoc = isDisplayAssociated(net, assocCount);
			const quality = getDisplaySignalPercent(net, is_assoc);
			const signalValue = getDisplaySignalValue(net, is_assoc, this.iwinfoInfoMap);
			const noiseValue = getDisplayNoiseValue(net, is_assoc, this.iwinfoInfoMap);
			const bssid = getDisplayBSSID(net);
			const encryption = getDisplayEncryption(net);

			let icon;
			if (net.isDisabled())
				icon = L.resource('icons/signal-none.svg');
			else if (quality <= 0)
				icon = L.resource('icons/signal-000-000.svg');
			else if (quality < 25)
				icon = L.resource('icons/signal-000-025.svg');
			else if (quality < 50)
				icon = L.resource('icons/signal-025-050.svg');
			else if (quality < 75)
				icon = L.resource('icons/signal-050-075.svg');
			else
				icon = L.resource('icons/signal-075-100.svg');

			let WPS_button = null;

			if (net.isWPSEnabled) {
				if (net.wps_status == 'Active') {
					WPS_button = E('button', {
						'class' : 'cbi-button cbi-button-remove',
						'click': L.bind(this.handleCancelWPS, this, net.getIfname()),
					}, [ _('Stop WPS') ])
				} else {
					WPS_button = E('button', {
						'class' : 'cbi-button cbi-button-apply',
						'click': L.bind(this.handleCallWPS, this, net.getIfname()),
					}, [ _('Start WPS') ])
				}
			}

			const badge = renderBadge(
				icon,
				(signalValue != null && noiseValue != null)
					? '%s: %d dBm / %s: %d dBm / %s: %d%%'.format(_('Signal'), signalValue, _('Noise'), noiseValue, _('Quality'), quality)
					: (signalValue != null)
						? '%s: %d dBm / %s: %d%%'.format(_('Signal'), signalValue, _('Quality'), quality)
						: '%s: %d%%'.format(_('Quality'), quality),
				_('SSID'), net.getActiveSSID() || '?',
				_('Mode'), net.getActiveMode(),
				_('BSSID'), is_assoc ? (bssid || '-') : null,
				_('Encryption'), is_assoc ? encryption : null,
				_('Associations'), is_assoc ? (assocCount || '-') : null,
				null, is_assoc ? null : E('em', net.isDisabled() ? _('Wireless is disabled') : _('Wireless is not associated')),
				_('WPS status'), this.WPSTranslateTbl[net.wps_status],
				'', WPS_button
			);

			badges.push(badge);

			chan = (chan != null) ? chan : getDisplayChannel(net);
			coco = (coco != null) ? coco : getDisplayCountryCode(net, this.iwinfoInfoMap);
			freq = (freq != null) ? freq : getDisplayFrequency(net, chan, this.iwinfoInfoMap);
			rate = (rate != null) ? rate : getDisplayBitRate(net, this.iwinfoInfoMap);
			noise = (noise != null) ? noise : getDisplayNoise(net, this.iwinfoInfoMap);
			tx_power = (tx_power != null) ? tx_power : getDisplayTXPower(net, this.iwinfoInfoMap);
		}

		return E('div', { class: 'ifacebox' }, [
			E('div', { class: 'ifacebox-head center ' + (radio.isUp() ? 'active' : '') },
				E('strong', radio.getName())),
			E('div', { class: 'ifacebox-body left' }, [
				L.itemlist(E('span'), [
					_('Type'), getRadioDisplayType(radio, this.iwinfoInfoMap),
					_('Bitrate'), rate ? '%d %s'.format(rate, _('Mbit/s')) : null,
					_('Channel'), chan ? '%d (%.3f %s)'.format(chan, freq, _('GHz')) : null,
					_('Country Code'), coco ? '%s'.format(coco) : null,
					_('Noise'), noise ? '%.2f %s'.format(noise, _('dBm')) : null,
					_('TX Power'), tx_power ? '%.2f %s'.format(tx_power, _('dBm')): null,
				]),
				E('div', {}, badges)
			])
		]);
	},

	isWPSEnabled: {},

	load() {
		return Promise.all([
			network.getWifiDevices(),
			network.getWifiNetworks(),
			network.getHostHints(),
			this.callSessionAccess('access-group', 'luci-mod-status-index-wifi', 'read'),
			this.callSessionAccess('access-group', 'luci-mod-status-index-wifi', 'write'),
			firewall.getZones(),
			L.hasSystemFeature('wifi') ? L.resolveDefault(uci.load('wireless')) : L.resolveDefault(),
		]).then(L.bind(data => {
			const tasks = [];
			const radios_networks_hints = data[1];
			const hasWPS = L.hasSystemFeature('hostapd', 'wps');
			const hasReadPermission = data[3];

			return this.loadIwinfoResolver(data[0], data[1]).then(L.bind((resolver) => {
				this.iwinfoResolver = resolver;

				for (let i = 0; i < radios_networks_hints.length; i++) {
					radios_networks_hints[i].assoclist = [];

					if (hasReadPermission) {
						tasks.push(this.getAssocListForNetwork(radios_networks_hints[i]).then(L.bind((net, list) => {
							net.assoclist = list.sort((a, b) => { return a.mac > b.mac });
						}, this, radios_networks_hints[i])));
					}

					if (hasWPS && uci.get('wireless', radios_networks_hints[i].sid, 'wps_pushbutton') == '1') {
						radios_networks_hints[i].isWPSEnabled = true;
						tasks.push(L.resolveDefault(this.handleGetWPSStatus(radios_networks_hints[i].getIfname()), null)
							.then(L.bind((net, data) => {
								net.wps_status = data ? data.pbc_status : _('No Data');
						}, this, radios_networks_hints[i])));
					}
				}

				tasks.push(this.loadIwinfoInfoMap(resolver).then(L.bind((map) => {
					this.iwinfoInfoMap = map;
				}, this)));

				return Promise.all(tasks).then(() => {
					return data;
				});
			}, this));
		}, this));
	},

	render(data) {
		const radios = data[0];
		const networks = data[1];
		const hosthints = data[2];
		const hasReadPermission = data[3];
		const hasWritePermission = data[4];
		const zones = data[5];

		const table = E('div', { 'class': 'network-status-table' });

		for (let i = 0; i < radios.sort((a, b) => { a.getName() > b.getName() }).length; i++)
			table.appendChild(this.renderbox(radios[i],
				networks.filter(net => { return net.getWifiDeviceName() == radios[i].getName() })));

		if (!table.lastElementChild)
			return null;

		const assoclist = E('table', { 'class': 'table assoclist', 'id': 'wifi_assoclist_table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th nowrap' }, _('Network')),
				E('th', { 'class': 'th hide-xs' }, _('MAC address')),
				E('th', { 'class': 'th' }, _('Host')),
				E('th', { 'class': 'th' }, '%s / %s'.format(_('Signal'), _('Noise'))),
				E('th', { 'class': 'th' }, '%s / %s'.format(_('RX Rate'), _('TX Rate')))
			])
		]);

		const rows = [];

		for (let i = 0; i < networks.length; i++) {
			const macfilter = uci.get('wireless', networks[i].sid, 'macfilter');
			const maclist = {};

			if (macfilter != null && macfilter != 'disable') {
				networks[i].maclist = L.toArray(uci.get('wireless', networks[i].sid, 'maclist'));
				for (let j = 0; j < networks[i].maclist.length; j++) {
					const mac = networks[i].maclist[j].toUpperCase();
					maclist[mac] = true;
				}
			}

			for (let k = 0; k < networks[i].assoclist.length; k++) {
				const bss = networks[i].assoclist[k];
				const name = hosthints.getHostnameByMACAddr(bss.mac);
				const ipv4 = hosthints.getIPAddrByMACAddr(bss.mac);
				const ipv6 = hosthints.getIP6AddrByMACAddr(bss.mac);

				let icon;
				const q = Math.min((bss.signal + 110) / 70 * 100, 100);
				if (q == 0)
					icon = L.resource('icons/signal-000-000.svg');
				else if (q < 25)
					icon = L.resource('icons/signal-000-025.svg');
				else if (q < 50)
					icon = L.resource('icons/signal-025-050.svg');
				else if (q < 75)
					icon = L.resource('icons/signal-050-075.svg');
				else
					icon = L.resource('icons/signal-075-100.svg');

				let sig_title, sig_value;

				if (bss.noise) {
					sig_value = '%d/%d\xa0%s'.format(bss.signal, bss.noise, _('dBm'));
					sig_title = '%s: %d %s / %s: %d %s / %s %d'.format(
						_('Signal'), bss.signal, _('dBm'),
						_('Noise'), bss.noise, _('dBm'),
						_('SNR'), bss.signal - bss.noise);
				}
				else {
					sig_value = '%d\xa0%s'.format(bss.signal, _('dBm'));
					sig_title = '%s: %d %s'.format(_('Signal'), bss.signal, _('dBm'));
				}

				let hint;

				if (name && ipv4 && ipv6)
					hint = '%s <span class="hide-xs">(%s, %s)</span>'.format(name, ipv4, ipv6);
				else if (name && (ipv4 || ipv6))
					hint = '%s <span class="hide-xs">(%s)</span>'.format(name, ipv4 || ipv6);
				else
					hint = name || ipv4 || ipv6 || '?';

				const row = [
					E('span', {
						'class': 'ifacebadge',
						'title': networks[i].getI18n(),
						'data-ifname': networks[i].getIfname(),
						'data-ssid': networks[i].getActiveSSID()
					}, [
						E('img', { 'src': L.resource('icons/wifi.svg'), 'style': 'width:32px;height:32px' }),
						E('span', {}, [
							' ', networks[i].getShortName(),
							E('small', {}, [ ' (', networks[i].getIfname(), ')' ])
						])
					]),
					bss.mac,
					hint,
					E('span', {
						'class': 'ifacebadge',
						'title': sig_title,
						'data-signal': bss.signal,
						'data-noise': bss.noise
					}, [
						E('img', { 'src': icon }),
						E('span', {}, [
							' ', sig_value
						])
					]),
					E('span', {}, [
						E('span', this.wifirate(bss.rx)),
						E('br'),
						E('span', this.wifirate(bss.tx))
					])
				];

				if (bss.vlan) {
					const desc = bss.vlan.getI18n();
					const vlan_network = bss.vlan.getNetwork();
					let vlan_zone;

					if (vlan_network)
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

				if (networks[i].isClientDisconnectSupported() && hasWritePermission) {
					if (assoclist.firstElementChild.childNodes.length < 6)
						assoclist.firstElementChild.appendChild(E('th', { 'class': 'th cbi-section-actions' }));

					if (macfilter != null && macfilter != 'disable' && !maclist[bss.mac]) {
						row.push(new L.ui.ComboButton('button', {
								'addlist': macfilter == 'allow' ?  _('Add to Whitelist') : _('Add to Blacklist'),
								'disconnect': _('Disconnect')
							}, {
								'click': L.bind(this.handleDelClient, this, networks[i], bss.mac),
								'sort': [ 'disconnect', 'addlist' ],
								'classes': {
									'addlist': 'btn cbi-button cbi-button-remove',
									'disconnect': 'btn cbi-button cbi-button-remove'
								}
							}).render()
						)
					}
					else {
						row.push(E('button', {
							'class': 'cbi-button cbi-button-remove',
							'click': L.bind(this.handleDelClient, this, networks[i], bss.mac)
						}, [ _('Disconnect') ]));
					}
				}
				else {
					row.push('-');
				}

				rows.push(row);
			}
		}

		cbi_update_table(assoclist, rows, E('em', _('No information available')));

		return E([
			table,
			hasReadPermission ? E('h3', _('Associated Stations')) : E([]),
			hasReadPermission ? assoclist : E([])
		]);
	}
});
