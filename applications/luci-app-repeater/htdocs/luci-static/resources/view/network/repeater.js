'use strict';
'require view';
'require dom';
'require form';
'require fs';
'require network';
'require firewall';
'require poll';
'require rpc';
'require uci';
'require ui';

const callFrequencyList = rpc.declare({
	object: 'iwinfo',
	method: 'freqlist',
	params: [ 'device' ],
	expect: { results: [] }
});

const callIwinfoInfo = rpc.declare({
	object: 'iwinfo',
	method: 'info',
	params: [ 'device' ],
	expect: { }
});

const callWirelessStatus = rpc.declare({
	object: 'network.wireless',
	method: 'status',
	expect: { }
});

const callNetworkInterfaceDump = rpc.declare({
	object: 'network.interface',
	method: 'dump',
	expect: { interface: [] }
});

const UNSET_MARKER = '__unset__';

function next_free_sid(offset) {
	let sid = 'wifinet' + offset;

	while (uci.get('wireless', sid))
		sid = 'wifinet' + (++offset);

	return sid;
}

function getConfiguredBand(hwmode, channel, bandval) {
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

function getFrequencyListBand(entry, hwmode) {
	const mhz = +entry.mhz;
	const channel = +entry.channel;
	const band = +entry.band;

	if (!isNaN(mhz)) {
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
		if (channel >= 1 && channel <= 233 && /^11bea/.test(String(hwmode || '')))
			return '6g';
	}

	if (band == 2 || band == 5 || band == 6)
		return '%dg'.format(band);

	return null;
}

function bandToLabel(band) {
	switch (band) {
	case '2g':
		return _('2.4 GHz');
	case '5g':
		return _('5 GHz');
	case '6g':
		return _('6 GHz');
	default:
		return _('Unknown');
	}
}

function bandSortKey(band) {
	switch (band) {
	case '2g':
		return 0;
	case '5g':
		return 1;
	case '6g':
		return 2;
	default:
		return 99;
	}
}

function humanEncryption(enc) {
	switch (enc) {
	case 'none':
		return _('Open / None');
	case 'owe':
		return _('OWE');
	case 'wep-open':
		return _('WEP Open System');
	case 'wep-shared':
		return _('WEP Shared Key');
	case 'psk':
		return _('WPA-PSK');
	case 'psk2':
		return _('WPA2-PSK');
	case 'psk-mixed':
		return _('WPA/WPA2-PSK Mixed');
	case 'sae':
		return _('WPA3-SAE');
	case 'sae-mixed':
		return _('WPA2/WPA3-SAE Mixed');
	default:
		return enc || '-';
	}
}

function isOpenEncryption(enc) {
	return enc == 'none' || enc == 'owe';
}

function isWepEncryption(enc) {
	return enc == 'wep-open' || enc == 'wep-shared';
}

function needsCipher(enc) {
	return enc == 'psk' || enc == 'psk2' || enc == 'psk-mixed' || enc == 'sae' || enc == 'sae-mixed';
}

function normalizeCipherValue(value, enc) {
	value = String(value || 'auto').toLowerCase();

	if (!needsCipher(enc))
		return 'auto';

	if (value == 'aes')
		value = 'ccmp';
	else if (value == 'tkip+aes' || value == 'aes+tkip' || value == 'ccmp+tkip')
		value = 'tkip+ccmp';

	if (enc == 'sae' || enc == 'sae-mixed') {
		if (value == 'auto' || value == 'tkip' || value == 'tkip+ccmp')
			return 'ccmp';
	}

	switch (value) {
	case 'auto':
	case 'ccmp':
	case 'ccmp256':
	case 'gcmp':
	case 'gcmp256':
	case 'tkip':
	case 'tkip+ccmp':
		return value;
	default:
		return 'auto';
	}
}

function buildEncryptionValue(enc, cipher) {
	const normalizedCipher = normalizeCipherValue(cipher, enc);

	if (!needsCipher(enc) || normalizedCipher == 'auto')
		return enc;

	return '%s+%s'.format(enc, normalizedCipher);
}

function summarizeScanCipher(bss) {
	const enc = L.isObject(bss?.encryption) ? bss.encryption : null;
	const ciphers = L.toArray(enc?.ciphers).map((cipher) => String(cipher || '').toLowerCase());

	if (ciphers.includes('tkip') && (ciphers.includes('ccmp') || ciphers.includes('aes')))
		return 'tkip+ccmp';
	if (ciphers.includes('ccmp256'))
		return 'ccmp256';
	if (ciphers.includes('gcmp256'))
		return 'gcmp256';
	if (ciphers.includes('gcmp'))
		return 'gcmp';
	if (ciphers.includes('ccmp') || ciphers.includes('aes'))
		return 'ccmp';
	if (ciphers.includes('tkip'))
		return 'tkip';

	return 'auto';
}

function summarizeScanEncryption(bss) {
	const enc = L.isObject(bss?.encryption) ? bss.encryption : null;

	if (!enc)
		return 'none';

	if (Array.isArray(enc.wep))
		return 'wep-open';

	const auths = L.toArray(enc.authentication);
	const wpa = L.toArray(enc.wpa);

	if (auths.includes('owe'))
		return 'owe';

	if (auths.includes('sae') && auths.includes('psk'))
		return 'sae-mixed';

	if (auths.includes('sae'))
		return 'sae';

	if (auths.includes('psk')) {
		const hasWpa1 = wpa.includes(1);
		const hasWpa2 = wpa.includes(2);

		if (hasWpa1 && hasWpa2)
			return 'psk-mixed';
		if (hasWpa2)
			return 'psk2';
		if (hasWpa1)
			return 'psk';
	}

	return (auths.length == 0 && wpa.length == 0) ? 'none' : null;
}

function formatSignal(bss) {
	const quality = +bss?.quality;
	const qualityMax = +bss?.quality_max;
	const percent = (quality > 0 && qualityMax > 0) ? Math.floor((100 / qualityMax) * quality) : 0;
	const signal = (bss?.signal != null) ? '%s dBm'.format(bss.signal) : '-';

	return '%s%% / %s'.format(percent, signal);
}

function parseIpAddress(netStatus) {
	const addr = L.toArray(netStatus?.['ipv4-address'])[0];
	return addr ? '%s/%s'.format(addr.address, addr.mask) : null;
}

function parseFailure(lines, ifname, ssid) {
	const candidates = lines.filter((line) => {
		if (!line)
			return false;

		return line.includes('wpa_supplicant') ||
			(ifname && line.includes(ifname)) ||
			(ssid && line.includes(ssid));
	});

	for (let i = candidates.length - 1; i >= 0; i--) {
		const line = candidates[i];

		if (/WRONG_KEY|pre-shared key may be incorrect|4-Way Handshake failed/i.test(line))
			return _('Password may be incorrect');

		if (/ASSOC-REJECT|denied association|association request to the driver failed/i.test(line))
			return _('The access point rejected association');

		if (/authentication with .* timed out|AUTH_FAILED|auth_failures/i.test(line))
			return _('Authentication failed or timed out');

		if (/No network configuration found|ssid not found|network not found/i.test(line))
			return _('Target SSID was not found');

		if (/SSID-TEMP-DISABLED.*CONN_FAILED/i.test(line))
			return _('Unable to complete the connection attempt');

		if (/CTRL-EVENT-SSID-TEMP-DISABLED/i.test(line))
			return line.replace(/^.*CTRL-EVENT-SSID-TEMP-DISABLED\s*/, '');
	}

	if (candidates.length > 0)
		return candidates[candidates.length - 1].replace(/^.*wpa_supplicant[^:]*:\s*/, '');

	return null;
}

function findNetStatus(dump, name) {
	const ifaces = L.toArray(dump?.interface);

	for (let iface of ifaces)
		if (iface.interface == name)
			return iface;

	return null;
}

function findWifiRuntime(radioStatus, wifiSid, networkName) {
	const ifaces = L.toArray(radioStatus?.interfaces);

	for (let iface of ifaces) {
		if (iface.section == wifiSid)
			return iface;

		if (L.toArray(iface?.config?.network).includes(networkName))
			return iface;
	}

	return null;
}

return view.extend({
	scanPollFn: null,
	radioMeta: null,
	selectedScan: null,
	map: null,

	load: async function() {
		await Promise.all([
			uci.load('repeater'),
			uci.load('wireless'),
			uci.load('network'),
			uci.load('firewall')
		]);

		const radios = await network.getWifiDevices();
		const meta = [];

		for (let radio of radios) {
			const devname = radio.getName();
			const hwmode = radio.ubus('dev', 'config', 'hwmode') || uci.get('wireless', devname, 'hwmode');
			const band = radio.ubus('dev', 'config', 'band') ||
				uci.get('wireless', devname, 'band') ||
				getConfiguredBand(hwmode, radio.ubus('dev', 'config', 'channel') || uci.get('wireless', devname, 'channel'), null);
			const freqlist = await L.resolveDefault(callFrequencyList(devname), []);
			const bands = [];

			for (let entry of freqlist) {
				const bandName = getFrequencyListBand(entry, hwmode);

				if (bandName && bands.indexOf(bandName) == -1)
					bands.push(bandName);
			}

			if (bands.length == 0 && band)
				bands.push(band);

			bands.sort((a, b) => bandSortKey(a) - bandSortKey(b));

			meta.push({
				name: devname,
				radio: radio,
				bands: bands,
				band: bands[0] || band || '2g'
			});
		}

		meta.sort((a, b) => {
			return (bandSortKey(a.band) - bandSortKey(b.band)) ||
				L.naturalCompare(a.name, b.name);
		});

		return meta;
	},

	getFormValue: function(optionName, sectionId) {
		const res = this.map?.lookupOption(optionName, sectionId || 'main');
		return res ? res[0].formvalue(sectionId || 'main') : null;
	},

	setFormValue: function(optionName, value) {
		const res = this.map?.lookupOption(optionName, 'main');

		if (!res)
			return;

		const opt = res[0];
		const uiElem = opt.getUIElement('main');
		const node = document.getElementById(opt.cbid('main'));

		if (uiElem && typeof(uiElem.setValue) == 'function')
			uiElem.setValue(value);
		else if (node != null)
			node.value = value;

		if (node != null)
			node.dispatchEvent(new Event('change', { bubbles: true }));

		this.map.checkDepends();
	},

	handleScanStartStop: function(ev) {
		const btn = ev.currentTarget;

		if (btn.getAttribute('data-state') == 'stop') {
			if (this.scanPollFn)
				poll.remove(this.scanPollFn);

			btn.firstChild.data = _('Start refresh');
			btn.setAttribute('data-state', 'start');
		}
		else {
			poll.add(this.scanPollFn);
			btn.firstChild.data = _('Stop refresh');
			btn.setAttribute('data-state', 'stop');
			btn.classList.add('spinning');
			btn.disabled = true;
		}
	},

	handleScanAbort: function(ev) {
		const md = dom.parent(ev.target, 'div[aria-modal="true"]');

		if (md) {
			md.style.maxWidth = '';
			md.style.maxHeight = '';
		}

		ui.hideModal();

		if (this.scanPollFn)
			poll.remove(this.scanPollFn);

		this.scanPollFn = null;
	},

	handleUseScanResult: function(radioName, bss) {
		const detectedEnc = summarizeScanEncryption(bss);
		const detectedCipher = summarizeScanCipher(bss);

		this.selectedScan = Object.assign({ radio: radioName }, bss);

		this.setFormValue('ssid', bss.ssid || '');
		this.setFormValue('bssid', bss.bssid || '');

		if (detectedEnc != null) {
			this.setFormValue('encryption', detectedEnc);
			this.setFormValue('cipher', needsCipher(detectedEnc) ? detectedCipher : 'auto');
		}
		else
			ui.addNotification(null, E('p', _('The selected network uses an enterprise or unsupported authentication mode. You may need to configure it manually.')), 'warning');

		if (isOpenEncryption(detectedEnc) || isWepEncryption(detectedEnc))
			this.setFormValue('key', '');

		ui.hideModal();

		if (this.scanPollFn)
			poll.remove(this.scanPollFn);

		this.scanPollFn = null;
	},

	handleScanRefresh: function(radio, scanCache, table, stop) {
		return radio.getScanList().then(L.bind(function(results) {
			const rows = [];

			for (let result of results)
				scanCache[result.bssid] = result;

			for (let bssid in scanCache)
				if (scanCache[bssid].stale)
					results.push(scanCache[bssid]);

			results.sort(function(a, b) {
				const diff = (b.quality - a.quality) || (a.channel - b.channel);

				if (diff)
					return diff;

				if (a.ssid < b.ssid)
					return -1;
				if (a.ssid > b.ssid)
					return 1;
				if (a.bssid < b.bssid)
					return -1;
				if (a.bssid > b.bssid)
					return 1;

				return 0;
			});

			results.forEach((res) => {
				const staleStyle = res.stale ? 'opacity:0.5' : null;
				const detectedEnc = summarizeScanEncryption(res);

				rows.push([
					E('span', { style: staleStyle }, formatSignal(res)),
					E('span', { style: staleStyle }, res.ssid || E('em', _('hidden'))),
					E('span', { style: staleStyle }, '%s'.format(res.channel ?? '-')),
					E('span', { style: staleStyle }, res.bssid || '-'),
					E('span', { style: staleStyle }, detectedEnc ? humanEncryption(detectedEnc) : network.formatWifiEncryption(res.encryption)),
					E('div', { 'class': 'right' }, E('button', {
						'class': 'cbi-button cbi-button-action important',
						'click': ui.createHandlerFn(this, 'handleUseScanResult', radio.getName(), res)
					}, _('Use this network')))
				]);

				res.stale = true;
			});

			cbi_update_table(table, rows, E('em', _('No networks found nearby.')));

			stop.disabled = false;
			stop.style.display = '';
			stop.classList.remove('spinning');
		}, this));
	},

	handleScan: function(radio) {
		const table = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Signal')),
				E('th', { 'class': 'th' }, _('SSID')),
				E('th', { 'class': 'th hide-xs' }, _('Channel')),
				E('th', { 'class': 'th hide-xs' }, _('BSSID')),
				E('th', { 'class': 'th' }, _('Encryption')),
				E('th', { 'class': 'th cbi-section-actions right' }, ' ')
			])
		]);

		const stop = E('button', {
			'class': 'btn',
			'click': L.bind(this.handleScanStartStop, this),
			'style': 'display:none',
			'data-state': 'stop'
		}, _('Stop refresh'));

		cbi_update_table(table, [], E('em', { class: 'spinning' }, _('Starting wireless scan...')));

		const md = ui.showModal(_('Wireless Scan'), [
			table,
			E('div', { 'class': 'right' }, [
				stop,
				' ',
				E('button', {
					'class': 'btn',
					'click': ui.createHandlerFn(this, 'handleScanAbort')
				}, _('Dismiss'))
			])
		]);

		md.style.maxWidth = '90%';
		md.style.maxHeight = 'none';

		this.scanPollFn = L.bind(this.handleScanRefresh, this, radio, {}, table, stop);

		poll.add(this.scanPollFn);
		poll.start();
	},

	handleScanButton: function(ev) {
		const radioName = this.getFormValue('device');
		const radio = this.radioMeta?.[radioName]?.radio;

		if (!radio) {
			ui.addNotification(null, E('p', _('Please choose a wireless radio first.')), 'warning');
			return;
		}

		return this.handleScan(radio);
	},

	handleStopPrompt: function() {
		return ui.showModal(_('Stop Wireless Repeater'), [
			E('p', _('This will remove the wireless station, the generated network interface, and related firewall bindings created by this app.')),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-negative important',
					'click': ui.createHandlerFn(this, 'handleStopConfirm')
				}, _('Stop'))
			])
		]);
	},

	handleStopConfirm: function() {
		const sectionId = 'main';

		this.selectedScan = null;

		ui.showModal(null, [
			E('p', { 'class': 'spinning' }, _('Cleaning up repeater configuration...'))
		]);

		return this.clearPreviouslyAppliedConfig(sectionId).then(L.bind(function() {
			uci.set('repeater', sectionId, 'applied', '0');
			uci.set('repeater', sectionId, 'managed_network', '0');
			uci.set('repeater', sectionId, 'wireless_sid', 'repeater_sta');
			uci.unset('repeater', sectionId, 'network_name');
			uci.unset('repeater', sectionId, 'zone_name');
			uci.unset('repeater', sectionId, 'band');

			return this.map.data.save();
		}, this)).then(function() {
			ui.changes.apply(true);
		});
	},

	ensureNamedSection: function(config, type, sid) {
		const section = uci.get(config, sid);

		if (section == null) {
			uci.add(config, type, sid);
			return sid;
		}

		if (section['.type'] == type)
			return sid;

		return null;
	},

	restoreManagedOption: function(config, section, option, value) {
		if (value == null || value == UNSET_MARKER)
			uci.unset(config, section, option);
		else
			uci.set(config, section, option, value);
	},

	clearRadioOverrideState: function(sectionId) {
		uci.unset('repeater', sectionId, 'applied_device');
		uci.unset('repeater', sectionId, 'saved_channel');
		uci.unset('repeater', sectionId, 'saved_htmode');
		uci.unset('repeater', sectionId, 'radio_override');
	},

	restorePreviousRadioState: function(sectionId) {
		if (uci.get('repeater', sectionId, 'radio_override') != '1') {
			this.clearRadioOverrideState(sectionId);
			return;
		}

		const oldDevice = uci.get('repeater', sectionId, 'applied_device');

		if (oldDevice && uci.get('wireless', oldDevice)) {
			this.restoreManagedOption('wireless', oldDevice, 'channel', uci.get('repeater', sectionId, 'saved_channel'));
			this.restoreManagedOption('wireless', oldDevice, 'htmode', uci.get('repeater', sectionId, 'saved_htmode'));
		}

		this.clearRadioOverrideState(sectionId);
	},

	rememberCurrentRadioState: function(sectionId, device) {
		uci.set('repeater', sectionId, 'applied_device', device);
		uci.set('repeater', sectionId, 'saved_channel', uci.get('wireless', device, 'channel') ?? UNSET_MARKER);
		uci.set('repeater', sectionId, 'saved_htmode', uci.get('wireless', device, 'htmode') ?? UNSET_MARKER);
		uci.set('repeater', sectionId, 'radio_override', '1');
	},

	clearPreviouslyAppliedConfig: async function(sectionId) {
		const wifiSid = uci.get('repeater', sectionId, 'wireless_sid') || 'repeater_sta';
		const networkName = uci.get('repeater', sectionId, 'network_name');
		const managedNetwork = uci.get('repeater', sectionId, 'managed_network') == '1';

		this.restorePreviousRadioState(sectionId);

		if (uci.get('wireless', wifiSid)?.['.type'] == 'wifi-iface')
			uci.remove('wireless', wifiSid);

		if (networkName && managedNetwork) {
			await firewall.deleteNetwork(networkName);

			if (uci.get('network', networkName)?.['.type'] == 'interface')
				uci.remove('network', networkName);
		}
	},

	configureFirewallZone: async function(zoneName, networkName, role) {
		let zone = await firewall.getZone(zoneName);

		if (!zone) {
			zone = await firewall.addZone(zoneName);

			if (zoneName == 'wan' || role == 'wan') {
				zone.set('input', 'REJECT');
				zone.set('output', 'ACCEPT');
				zone.set('forward', 'REJECT');
				zone.set('masq', '1');
				zone.set('mtu_fix', '1');

				const lanZone = await firewall.getZone('lan');
				if (lanZone)
					lanZone.addForwardingTo(zoneName);
			}
			else {
				zone.set('input', 'ACCEPT');
				zone.set('output', 'ACCEPT');
				zone.set('forward', 'ACCEPT');
			}
		}

		if (networkName && networkName != 'lan') {
			await firewall.deleteNetwork(networkName);
			zone.addNetwork(networkName);
		}
		else if (zoneName == 'lan') {
			zone.addNetwork('lan');
		}
	},

	applyRadioSettingsFromScan: function(device, scan) {
		if (!scan || scan.radio != device)
			return false;

		const radio = this.radioMeta?.[device]?.radio;
		const htmodes = radio ? radio.getHTModes() : null;

		if (scan.vht_operation && htmodes && htmodes.indexOf('VHT20') !== -1) {
			for (let width = scan.vht_operation.channel_width; width >= 20; width /= 2) {
				if (htmodes.indexOf('VHT' + width) !== -1) {
					uci.set('wireless', device, 'htmode', 'VHT' + width);
					break;
				}
			}
		}
		else if (scan.ht_operation && htmodes && htmodes.indexOf('HT20') !== -1) {
			const width = (scan.ht_operation.secondary_channel_offset == 'no secondary') ? 20 : 40;
			uci.set('wireless', device, 'htmode', 'HT' + width);
		}

		if (scan.channel != null)
			uci.set('wireless', device, 'channel', '%s'.format(scan.channel));

		return true;
	},

	saveRepeater: async function() {
		const sectionId = 'main';
		const device = uci.get('repeater', sectionId, 'device');
		const role = uci.get('repeater', sectionId, 'role') || 'wan';
		const ssid = uci.get('repeater', sectionId, 'ssid');
		const bssid = uci.get('repeater', sectionId, 'bssid');
		const encryption = uci.get('repeater', sectionId, 'encryption') || 'none';
		const cipher = normalizeCipherValue(uci.get('repeater', sectionId, 'cipher'), encryption);
		const key = uci.get('repeater', sectionId, 'key');
		let wifiSid = uci.get('repeater', sectionId, 'wireless_sid') || 'repeater_sta';
		const networkName = (role == 'wan') ? 'repeater_wwan' : 'lan';
		const zoneName = (role == 'wan') ? 'wan' : 'lan';

		if (!device)
			throw new Error(_('A wireless radio must be selected.'));

		if (!ssid)
			throw new Error(_('SSID must not be empty.'));

		if (!this.radioMeta?.[device])
			throw new Error(_('The selected radio is not available.'));

		if (!isOpenEncryption(encryption) && !key)
			throw new Error(_('A password or key is required for the selected encryption mode.'));

		await this.clearPreviouslyAppliedConfig(sectionId);

		if (!this.ensureNamedSection('wireless', 'wifi-iface', wifiSid))
			wifiSid = next_free_sid(uci.sections('wireless', 'wifi-iface').length);

		if (!this.ensureNamedSection('wireless', 'wifi-iface', wifiSid))
			throw new Error(_('Unable to create the managed wireless station section.'));

		if (this.applyRadioSettingsFromScan(device, this.selectedScan &&
			this.selectedScan.radio == device &&
			this.selectedScan.ssid == ssid &&
			(!bssid || this.selectedScan.bssid == bssid) ? this.selectedScan : null))
			this.rememberCurrentRadioState(sectionId, device);
		else
			this.clearRadioOverrideState(sectionId);

		uci.unset('wireless', device, 'disabled');
		uci.set('wireless', wifiSid, 'device', device);
		uci.set('wireless', wifiSid, 'mode', 'sta');
		uci.set('wireless', wifiSid, 'network', networkName);
		uci.set('wireless', wifiSid, 'ssid', ssid);
		uci.set('wireless', wifiSid, 'disabled', '0');
		uci.unset('wireless', wifiSid, 'wds');
		uci.unset('wireless', wifiSid, 'key');
		uci.unset('wireless', wifiSid, 'key1');

		if (bssid)
			uci.set('wireless', wifiSid, 'bssid', bssid);
		else
			uci.unset('wireless', wifiSid, 'bssid');

		if (encryption == 'none' || encryption == 'owe') {
			uci.set('wireless', wifiSid, 'encryption', encryption);
			uci.unset('repeater', sectionId, 'key');
		}
		else if (isWepEncryption(encryption)) {
			uci.set('wireless', wifiSid, 'encryption', encryption);
			uci.set('wireless', wifiSid, 'key', '1');
			uci.set('wireless', wifiSid, 'key1', key);
		}
		else {
			uci.set('wireless', wifiSid, 'encryption', buildEncryptionValue(encryption, cipher));
			uci.set('wireless', wifiSid, 'key', key);
		}

		uci.set('repeater', sectionId, 'cipher', cipher);

		if (role == 'wan') {
			this.ensureNamedSection('network', 'interface', networkName);
			uci.set('network', networkName, 'proto', 'dhcp');
			uci.unset('network', networkName, 'ipaddr');
			uci.unset('network', networkName, 'netmask');
			uci.unset('network', networkName, 'gateway');
			uci.unset('network', networkName, 'dns');
			uci.set('repeater', sectionId, 'managed_network', '1');
		}
		else {
			if (!uci.get('network', 'lan'))
				throw new Error(_('LAN interface was not found. Please create network.lan first.'));

			uci.set('repeater', sectionId, 'managed_network', '0');
		}

		await this.configureFirewallZone(zoneName, networkName, role);

		uci.set('repeater', sectionId, 'wireless_sid', wifiSid);
		uci.set('repeater', sectionId, 'network_name', networkName);
		uci.set('repeater', sectionId, 'zone_name', zoneName);
		uci.set('repeater', sectionId, 'band', this.radioMeta[device].band || '');
		uci.set('repeater', sectionId, 'applied', '1');
	},

	getStatusFromLog: function(ifname, ssid) {
		return L.resolveDefault(fs.exec_direct('/sbin/logread', [ '-e', 'wpa_supplicant' ]), '').then((res) => {
			const lines = String(res || '').trim().split(/\n/).filter(Boolean);
			return parseFailure(lines, ifname, ssid);
		});
	},

	collectStatus: async function() {
		const sectionId = 'main';
		const device = uci.get('repeater', sectionId, 'device');
		const role = uci.get('repeater', sectionId, 'role') || 'wan';
		const ssid = uci.get('repeater', sectionId, 'ssid');
		const applied = uci.get('repeater', sectionId, 'applied') == '1';
		const networkName = uci.get('repeater', sectionId, 'network_name') || (role == 'wan' ? 'repeater_wwan' : 'lan');
		const wifiSid = uci.get('repeater', sectionId, 'wireless_sid') || 'repeater_sta';

		if (!device || !ssid)
			return {
				state: 'idle',
				text: _('Not configured'),
				detail: _('Choose a radio, scan for an SSID, then save and apply the settings.')
			};

		if (!applied)
			return {
				state: 'stopped',
				text: _('Stopped'),
				detail: _('The repeater is not currently running. Click Save & Apply to start it again.')
			};

		const [wirelessStatus, networkDump] = await Promise.all([
			callWirelessStatus(),
			callNetworkInterfaceDump()
		]);
		const radioStatus = wirelessStatus[device];
		const wifiRuntime = findWifiRuntime(radioStatus, wifiSid, networkName);
		const ifname = wifiRuntime?.ifname || null;
		const linkInfo = ifname ? await L.resolveDefault(callIwinfoInfo(ifname), null) : null;
		const netStatus = findNetStatus(networkDump, networkName);
		const ipaddr = parseIpAddress(netStatus);
		const connectedBssid = linkInfo?.bssid;
		const connectedSsid = linkInfo?.ssid;
		const signal = (linkInfo?.signal != null && linkInfo.signal !== 0) ? '%s dBm'.format(linkInfo.signal) : null;
		const isConnected = !!(connectedSsid && connectedSsid != 'unknown' && connectedBssid && connectedBssid != '00:00:00:00:00:00');

		if (isConnected) {
			if (role == 'wan' && netStatus && !netStatus.up) {
				return {
					state: 'dhcp',
					text: _('Connected to %s, waiting for DHCP').format(connectedSsid),
					detail: [ connectedBssid, signal ].filter(Boolean).join(' / ')
				};
			}

			return {
				state: 'connected',
				text: _('Connected to %s').format(connectedSsid),
				detail: [
					connectedBssid,
					signal,
					role == 'wan' && ipaddr ? _('IP: %s').format(ipaddr) : null,
					role == 'lan' && ifname ? _('Bridged through %s').format(ifname) : null
				].filter(Boolean).join(' / ')
			};
		}

		if (radioStatus?.pending || netStatus?.pending) {
			return {
				state: 'pending',
				text: _('Authenticating / connecting...'),
				detail: ifname ? _('Wireless interface: %s').format(ifname) : _('The station interface is starting.')
			};
		}

		const failure = await this.getStatusFromLog(ifname, ssid);

		return {
			state: failure ? 'failed' : 'disconnected',
			text: failure ? _('Connection failed') : _('Not connected'),
			detail: failure || _('The repeater station is not associated with the selected SSID.')
		};
	},

	renderStatus: function(status) {
		const box = document.getElementById('repeater-status');

		if (!box)
			return;

		let textNode;

		if (status.state == 'pending' || status.state == 'dhcp')
			textNode = E('em', { 'class': 'spinning' }, status.text);
		else
			textNode = E('strong', status.text);

		box.replaceChildren(
			E('div', { 'class': 'cbi-value-field' }, [ textNode ]),
			E('div', {
				'class': 'cbi-value-description',
				'style': status.state == 'failed' ? 'color:#b94a48' :
					(status.state == 'connected' ? 'color:#2d8a34' : '')
			}, status.detail || '-')
		);
	},

	pollStatus: function() {
		return this.collectStatus()
			.then(L.bind(this.renderStatus, this))
			.catch(L.bind(function(err) {
				this.renderStatus({
					state: 'failed',
					text: _('Unable to query repeater status'),
					detail: err.message || '%s'.format(err)
				});
			}, this));
	},

	handleSave: function() {
		if (!this.map)
			return Promise.resolve();

		return this.map.save(L.bind(this.saveRepeater, this));
	},

	handleSaveApply: function(ev, mode) {
		return this.handleSave().then(() => {
			ui.changes.apply(mode == '0');
		});
	},

	handleReset: function() {
		return this.map ? this.map.reset() : Promise.resolve();
	},

	render: function(radios) {
		this.radioMeta = {};
		radios.forEach((meta) => { this.radioMeta[meta.name] = meta; });

		const m = new form.Map('repeater', _('Wireless Repeater'),
			_('Create a wireless client uplink, scan nearby access points, and attach the resulting station either to WAN or to LAN.'));
		let s, o;

		this.map = m;
		m.chain('wireless');
		m.chain('network');
		m.chain('firewall');

		s = m.section(form.NamedSection, 'main', 'repeater', _('Repeater Settings'));

		o = s.option(form.DummyValue, '_status', _('Connection Status'));
		o.renderWidget = function() {
			return E('div', { id: 'repeater-status' }, [
				E('div', { 'class': 'cbi-value-field' }, E('em', { 'class': 'spinning' }, _('Collecting status...')))
			]);
		};

		o = s.option(form.ListValue, 'device', _('Wireless Radio'),
			_('Choose the 2.4 GHz, 5 GHz, or 6 GHz radio that should work as the repeater station.'));
		for (let meta of radios) {
			const bandLabel = meta.bands.map(bandToLabel).join(' / ');
			o.value(meta.name, '%s (%s)'.format(meta.name, bandLabel));
		}
		o.rmempty = false;
		if (!uci.get('repeater', 'main', 'device') && radios[0])
			o.default = radios[0].name;

		o = s.option(form.ListValue, 'role', _('Attach As'),
			_('Attach the repeater client either as a WAN uplink or directly into LAN bridge mode.'));
		o.value('wan', _('WAN'));
		o.value('lan', _('LAN'));
		o.default = 'wan';
		o.rmempty = false;

		o = s.option(form.Button, '_scan', _('Wireless Scan'),
			_('Open a scan dialog similar to the standard wireless page and copy the selected SSID into the fields below.'));
		o.inputstyle = 'action';
		o.inputtitle = _('Scan');
		o.onclick = L.bind(this.handleScanButton, this);

		o = s.option(form.Button, '_stop', _('Stop Wireless Repeater'),
			_('Immediately remove the wireless station, the generated network interface, and related firewall bindings created by this app.'));
		o.inputstyle = 'remove';
		o.inputtitle = _('Stop');
		o.onclick = L.bind(this.handleStopPrompt, this);

		o = s.option(form.Value, 'ssid', _('Target SSID'),
			_('Filled automatically after scan, but you can also enter the SSID manually for hidden networks.'));
		o.rmempty = false;

		o = s.option(form.Value, 'bssid', _('Lock To BSSID'),
			_('Optional. If set, only the selected BSSID will be used instead of roaming between APs with the same SSID.'));
		o.datatype = 'macaddr';
		o.rmempty = true;

		o = s.option(form.ListValue, 'encryption', _('Encryption'),
			_('The detected encryption is filled automatically after scan. You can still adjust it before applying.'));
		o.value('none', humanEncryption('none'));
		o.value('owe', humanEncryption('owe'));
		o.value('wep-open', humanEncryption('wep-open'));
		o.value('wep-shared', humanEncryption('wep-shared'));
		o.value('psk', humanEncryption('psk'));
		o.value('psk2', humanEncryption('psk2'));
		o.value('psk-mixed', humanEncryption('psk-mixed'));
		o.value('sae', humanEncryption('sae'));
		o.value('sae-mixed', humanEncryption('sae-mixed'));
		o.default = 'psk2';
		o.rmempty = false;

		o = s.option(form.ListValue, 'cipher', _('Algorithm'),
			_('Choose the cipher algorithm used by the target wireless network, for example AES (CCMP).'));
		o.value('auto', _('auto'));
		o.value('ccmp', _('AES (CCMP)'));
		o.value('ccmp256', _('AES (CCMP-256)'));
		o.value('gcmp', _('AES (GCMP)'));
		o.value('gcmp256', _('AES (GCMP-256)'));
		o.value('tkip', _('TKIP'));
		o.value('tkip+ccmp', _('TKIP + AES (CCMP)'));
		o.default = 'auto';
		o.rmempty = false;
		o.depends('encryption', 'psk');
		o.depends('encryption', 'psk2');
		o.depends('encryption', 'psk-mixed');
		o.depends('encryption', 'sae');
		o.depends('encryption', 'sae-mixed');
		o.validate = function(section_id, value) {
			const enc = this.map.lookupOption('encryption', section_id)[0].formvalue(section_id);
			const normalizedValue = normalizeCipherValue(value, enc);

			if (!needsCipher(enc))
				return true;

			if ((enc == 'sae' || enc == 'sae-mixed') &&
			    (normalizedValue == 'tkip' || normalizedValue == 'tkip+ccmp'))
				return _('WPA3-SAE does not support TKIP. Please choose an AES-based algorithm.');

			return true;
		};

		o = s.option(form.Value, 'key', _('Password / Key'),
			_('Enter the WPA passphrase or WEP key for the selected network.'));
		o.password = true;
		o.rmempty = true;
		o.depends('encryption', 'wep-open');
		o.depends('encryption', 'wep-shared');
		o.depends('encryption', 'psk');
		o.depends('encryption', 'psk2');
		o.depends('encryption', 'psk-mixed');
		o.depends('encryption', 'sae');
		o.depends('encryption', 'sae-mixed');
		o.validate = function(section_id, value) {
			const enc = this.map.lookupOption('encryption', section_id)[0].formvalue(section_id);

			if (isOpenEncryption(enc))
				return true;

			if (!value)
				return _('A password or key is required.');

			if (isWepEncryption(enc) &&
			    !/^(?:[A-Fa-f0-9]{10}|[A-Fa-f0-9]{26}|[A-Fa-f0-9]{32}|.{5}|.{13}|.{16})$/.test(value))
				return _('Expecting a valid WEP key.');

			if (!isWepEncryption(enc) && !(value.length >= 8 || /^[A-Fa-f0-9]{64}$/.test(value)))
				return _('Expecting a WPA key with at least 8 characters.');

			return true;
		};

		o = s.option(form.DummyValue, '_note', _('Note'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			return _('LAN mode bridges the wireless client into the existing LAN network. Some chipsets may require 4addr/WDS support from the upstream access point.');
		};

		return m.render().then(L.bind(function(nodes) {
			poll.add(L.bind(this.pollStatus, this));
			this.pollStatus();
			return nodes;
		}, this));
	}
});
