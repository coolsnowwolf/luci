'use strict';
'require baseclass';
'require dom';
'require network';
'require uci';
'require fs';
'require rpc';

return baseclass.extend({
	title: _('Wireless'),

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

	callIwinfoAssoclistCompat: rpc.declare({
		object: 'iwinfo',
		method: 'assoclist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	callIwinfoInfoCompat: rpc.declare({
		object: 'iwinfo',
		method: 'info',
		params: [ 'device' ],
		expect: { }
	}),

	cachedIwinfoInfoMap: null,
	cachedIwinfoInfoPromise: null,

	isQcaWifiHwtype: function(hwtype) {
		return (hwtype == 'qcawifi' || hwtype == 'qcawificfg80211');
	},

	getDisplayRadioName: function(radio) {
		var name = radio.getI18n().replace(/^Generic | Wireless Controller .+$/g, ''),
		    hwtype = uci.get('wireless', radio.getName(), 'type'),
		    hwmode = uci.get('wireless', radio.getName(), 'hwmode') || '';

		if (!/^unknown$/.test(name) && !/^802\.11unknown$/.test(name))
			return name;

		if (!this.isQcaWifiHwtype(hwtype))
			return name;

		if (/^11be/.test(hwmode))
			return 'Qualcomm Atheros Wi-Fi 7';

		if (/^11ax/.test(hwmode))
			return 'Qualcomm Atheros Wi-Fi 6';

		if (/^11ac/.test(hwmode))
			return 'Qualcomm Atheros Wi-Fi 5';

		return 'Qualcomm Atheros Wireless';
	},

	formatConfigEncryption: function(enc) {
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
	},

	getDisplayEncryption: function(net) {
		var encryption = net.getActiveEncryption();

		if (encryption && encryption != '-')
			return encryption;

		return this.formatConfigEncryption(uci.get('wireless', net.getName(), 'encryption'));
	},

	getDisplayBSSID: function(net) {
		var bssid = uci.get('wireless', net.getName(), 'macaddr') ||
			uci.get('wireless', net.getWifiDeviceName(), 'macaddr') ||
			net.getBSSID() || net.getActiveBSSID();

		if (bssid && bssid != '00:00:00:00:00:00')
			return String(bssid).toUpperCase();

		return bssid || null;
	},

	getDisplayTxPower: function(net) {
		var txpower = net.getTXPower();

		if (txpower != null && txpower > 0)
			return txpower;

		txpower = +uci.get('wireless', net.getWifiDeviceName(), 'txpower');

		return isNaN(txpower) ? null : txpower;
	},

	getDisplayChannel: function(net) {
		var channel = net.getChannel();

		if (channel != null && channel !== '' && channel !== 'auto')
			return +channel;

		channel = uci.get('wireless', net.getWifiDeviceName(), 'channel');

		if (channel != null && channel !== '' && channel !== 'auto')
			return +channel;

		return null;
	},

	getDerivedFrequencyGHz: function(hwmode, channel) {
		hwmode = String(hwmode || '');

		if (channel == null || isNaN(channel))
			return null;
		if (channel == 14)
			return 2.484;
		if (channel >= 1 && channel <= 13)
			return (2407 + channel * 5) / 1000;
		if (/^11axg|^11ng|^11beg/.test(hwmode) && channel >= 1 && channel <= 13)
			return (2407 + channel * 5) / 1000;
		if (channel >= 36 && channel <= 196)
			return (5000 + channel * 5) / 1000;
		if (channel >= 1 && channel <= 233)
			return (5950 + channel * 5) / 1000;

		return null;
	},

	getDisplayFrequency: function(net, channel) {
		var frequency = net.getFrequency(),
		    hwmode = uci.get('wireless', net.getWifiDeviceName(), 'hwmode') || '';

		if (frequency != null && frequency !== '')
			return frequency;

		return this.getDerivedFrequencyGHz(hwmode, channel);
	},

	normalizeIwinfoBitRate: function(rate) {
		rate = +rate;

		if (isNaN(rate) || rate <= 0)
			return null;

		return (rate > 100000) ? (rate / 1000) : rate;
	},

	getIwinfoInfoCandidates: function(net) {
		var candidates = [],
		    hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type'),
		    ifname = net.getIfname(),
		    section = net.getName(),
		    device = net.getWifiDeviceName();

		if (ifname)
			candidates.push(ifname);

		if (section && candidates.indexOf(section) < 0)
			candidates.push(section);

		if (this.isQcaWifiHwtype(hwtype) && /^wifi\d+$/.test(device)) {
			var fallback = section;

			if (!/^ath\d+$/.test(fallback))
				fallback = 'ath' + device.replace(/^wifi/, '');

			if (candidates.indexOf(fallback) < 0)
				candidates.push(fallback);
		}

		if (device && candidates.indexOf(device) < 0)
			candidates.push(device);

		return candidates;
	},

	loadIwinfoInfoMap: function(force) {
		if (force)
			this.cachedIwinfoInfoPromise = null;

		if (!force && this.cachedIwinfoInfoMap != null)
			return Promise.resolve(this.cachedIwinfoInfoMap);

		if (this.cachedIwinfoInfoPromise != null)
			return this.cachedIwinfoInfoPromise;

		var radios = uci.sections('wireless', 'wifi-device').map(function(s) { return s['.name']; }),
		    networks = uci.sections('wireless', 'wifi-iface').reduce(function(names, s) {
		    	var candidates = [ s['.name'], s.ifname ];

		    	for (var i = 0; i < candidates.length; i++)
		    		if (candidates[i] && names.indexOf(candidates[i]) < 0)
		    			names.push(candidates[i]);

		    	return names;
		    }, []),
		    devices = radios.concat(networks).filter(function(name, idx, list) {
		    	return !!name && list.indexOf(name) == idx;
		    });

		this.cachedIwinfoInfoPromise = Promise.all(devices.map(L.bind(function(name) {
			return L.resolveDefault(this.callIwinfoInfoCompat(name), null).then(function(info) {
				return [ name, info ];
			});
		}, this))).then(L.bind(function(entries) {
			var nextMap = {};

			for (var i = 0; i < entries.length; i++)
				if (entries[i][1] != null)
					nextMap[entries[i][0]] = entries[i][1];

			if (Object.keys(nextMap).length > 0 || this.cachedIwinfoInfoMap == null)
				this.cachedIwinfoInfoMap = nextMap;

			this.cachedIwinfoInfoPromise = null;
			return this.cachedIwinfoInfoMap || nextMap;
		}, this)).catch(L.bind(function() {
			this.cachedIwinfoInfoPromise = null;

			if (this.cachedIwinfoInfoMap != null)
				return this.cachedIwinfoInfoMap;

			this.cachedIwinfoInfoMap = {};
			return this.cachedIwinfoInfoMap;
		}, this));

		return this.cachedIwinfoInfoPromise;
	},

	getDisplayBitRate: function(net) {
		var rate = net.getBitRate(),
		    hwmode = uci.get('wireless', net.getWifiDeviceName(), 'hwmode') || '',
		    htmode = uci.get('wireless', net.getWifiDeviceName(), 'htmode') || '';

		if (rate != null && rate > 0)
			return rate;

		var candidates = this.getIwinfoInfoCandidates(net);

		for (var i = 0; i < candidates.length; i++) {
			var info = this.cachedIwinfoInfoMap ? this.cachedIwinfoInfoMap[candidates[i]] : null;

			rate = this.normalizeIwinfoBitRate(info != null ? info.bitrate : null);

			if (rate != null)
				return rate;
		}

		if (/^11be/.test(hwmode)) {
			switch (htmode) {
			case 'HT20':
			case 'EHT20':
				return 344.1;
			case 'HT40':
			case 'EHT40':
				return 688.2;
			case 'HT80':
			case 'EHT80':
				return 1441.2;
			case 'HT160':
			case 'EHT160':
				return 2882.4;
			case 'HT320':
			case 'EHT320':
				return 5764.7;
			}
		}

		if (/^11ax/.test(hwmode)) {
			switch (htmode) {
			case 'HT20':
			case 'HE20':
				return 286.8;
			case 'HT40':
			case 'HE40':
				return 573.5;
			case 'HT80':
			case 'HE80':
				return 1201.0;
			case 'HT160':
			case 'HE160':
				return 2402.0;
			}
		}

		if (/^11ac/.test(hwmode)) {
			switch (htmode) {
			case 'HT20':
			case 'VHT20':
				return 173.3;
			case 'HT40':
			case 'VHT40':
				return 400.0;
			case 'HT80':
			case 'VHT80':
				return 866.7;
			case 'HT160':
			case 'VHT160':
			case 'HT80_80':
				return 1733.3;
			}
		}

		if (/^11ng/.test(hwmode) || /^11na/.test(hwmode)) {
			switch (htmode) {
			case 'HT20':
				return 144.4;
			case 'HT40':
				return 300.0;
			}
		}

		return null;
	},

	getAssocListCandidates: function(net) {
		var candidates = [],
		    hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type'),
		    ifname = net.getIfname(),
		    section = net.getName();

		if (ifname)
			candidates.push(ifname);
		if (section && candidates.indexOf(section) < 0)
			candidates.push(section);

		if (this.isQcaWifiHwtype(hwtype) && /^wifi\d+$/.test(net.getWifiDeviceName())) {
			var fallback = section;

			if (!/^ath\d+$/.test(fallback))
				fallback = 'ath' + net.getWifiDeviceName().replace(/^wifi/, '');

			if (candidates.indexOf(fallback) < 0)
				candidates.push(fallback);
		}

		return candidates;
	},

	getAssocListForNetwork: function(net) {
		return net.getAssocList().then(L.bind(function(entries) {
			if (Array.isArray(entries) && entries.length)
				return entries;

			var candidates = this.getAssocListCandidates(net),
			    idx = 0;

			var tryNext = L.bind(function() {
				if (idx >= candidates.length)
					return [];

				return this.callIwinfoAssoclistCompat(candidates[idx++]).then(function(entries) {
					if (Array.isArray(entries) && entries.length)
						return entries;

					return tryNext();
				}).catch(function() {
					return tryNext();
				});
			}, this);

			return tryNext();
		}, this)).catch(L.bind(function() {
			var candidates = this.getAssocListCandidates(net),
			    idx = 0;

			var tryNext = L.bind(function() {
				if (idx >= candidates.length)
					return [];

				return this.callIwinfoAssoclistCompat(candidates[idx++]).then(function(entries) {
					if (Array.isArray(entries) && entries.length)
						return entries;

					return tryNext();
				}).catch(function() {
					return tryNext();
				});
			}, this);

			return tryNext();
		}, this));
	},

	isDisplayAssociated: function(net, hwtype, mode, bssid, channel, disabled) {
		if (bssid && bssid != '00:00:00:00:00:00' && channel && mode != 'Unknown' && !disabled)
			return true;

		if (this.isQcaWifiHwtype(hwtype) && !disabled && net.getMode() == 'ap' && channel)
			return true;

		return false;
	},

	isRadioDisplayUp: function(radio, networks) {
		var hwtype = uci.get('wireless', radio.getName(), 'type');

		if (radio.isUp())
			return true;

		if (!this.isQcaWifiHwtype(hwtype))
			return false;

		for (var i = 0; i < networks.length; i++)
			if (!networks[i].isDisabled() && uci.get('wireless', networks[i].getWifiDeviceName(), 'disabled') != '1')
				return true;

		return false;
	},

	wifirate: function(rt) {
		var s = '%.1f\xa0%s, %d\xa0%s'.format(rt.rate / 1000, _('Mbit/s'), rt.mhz, _('MHz')),
		    ht = rt.ht, vht = rt.vht,
			mhz = rt.mhz, nss = rt.nss,
			mcs = rt.mcs, sgi = rt.short_gi,
			he = rt.he, he_gi = rt.he_gi,
			he_dcm = rt.he_dcm,
			eht = rt.eht, eht_gi = rt.eht_gi,
			eht_dcm = rt.eht_dcm;

		if (ht || vht) {
			if (vht) s += ', VHT-MCS\xa0%d'.format(mcs);
			if (nss) s += ', VHT-NSS\xa0%d'.format(nss);
			if (ht)  s += ', MCS\xa0%s'.format(mcs);
			if (sgi) s += ', ' + _('Short GI').replace(/ /g, '\xa0');
		}

		if (he) {
			s += ', HE-MCS\xa0%d'.format(mcs);
			if (nss) s += ', HE-NSS\xa0%d'.format(nss);
			if (he_gi) s += ', HE-GI\xa0%d'.format(he_gi);
			if (he_dcm) s += ', HE-DCM\xa0%d'.format(he_dcm);
		}

		if (eht) {
			s += ', EHT-MCS\xa0%d'.format(mcs);
			if (nss) s += ', EHT-NSS\xa0%d'.format(nss);
			if (eht_gi) s += ', EHT-GI\xa0%d'.format(eht_gi);
			if (eht_dcm) s += ', EHT-DCM\xa0%d'.format(eht_dcm);
		}

		return s;
	},

	handleDelClient: function(wifinet, mac, ev, cmd) {
		var exec = cmd || 'disconnect';

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

	handleGetWPSStatus: function(wifinet) {
		return rpc.declare({
			object: 'hostapd.%s'.format(wifinet),
			method: 'wps_status',
		})()
	},

	handleCallWPS: function(wifinet, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		return rpc.declare({
			object: 'hostapd.%s'.format(wifinet),
			method: 'wps_start',
		})();
	},

	handleCancelWPS: function(wifinet, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		return rpc.declare({
			object: 'hostapd.%s'.format(wifinet),
			method: 'wps_cancel',
		})();
	},

	renderbox: function(radio, networks) {
		var chan = null,
		    freq = null,
		    rate = null,
		    badges = [];

		for (var i = 0; i < networks.length; i++) {
			var net = networks[i],
			    hwtype = uci.get('wireless', net.getWifiDeviceName(), 'type'),
			    mode = net.getActiveMode() || net.getMode(),
			    bssid = this.getDisplayBSSID(net),
			    channel = this.getDisplayChannel(net),
			    disabled = (net.isDisabled() || uci.get('wireless', net.getWifiDeviceName(), 'disabled') == '1'),
			    is_assoc = this.isDisplayAssociated(net, hwtype, mode, bssid, channel, disabled),
			    quality = (this.isQcaWifiHwtype(hwtype) && net.getMode() == 'ap') ? (is_assoc ? 100 : 0) : net.getSignalPercent(),
			    signalValue = (this.isQcaWifiHwtype(hwtype) && net.getMode() == 'ap' && is_assoc) ? this.getDisplayTxPower(net) : net.getSignal(),
			    activeSSID = net.getActiveSSID() || net.getSSID() || '?';

			var icon;
			if (disabled)
				icon = L.resource('icons/signal-none.png');
			else if (quality <= 0)
				icon = L.resource('icons/signal-0.png');
			else if (quality < 25)
				icon = L.resource('icons/signal-0-25.png');
			else if (quality < 50)
				icon = L.resource('icons/signal-25-50.png');
			else if (quality < 75)
				icon = L.resource('icons/signal-50-75.png');
			else
				icon = L.resource('icons/signal-75-100.png');

			var WPS_button = null;

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

			var badge = renderBadge(
				icon,
				(signalValue != null)
					? '%s: %d dBm / %s: %d%%'.format(_('Signal'), signalValue, _('Quality'), quality)
					: '%s: %d%%'.format(_('Quality'), quality),
				_('SSID'), activeSSID,
				_('Mode'), mode,
				_('BSSID'), is_assoc ? (bssid || '-') : null,
				_('Encryption'), is_assoc ? this.getDisplayEncryption(net) : null,
				_('Associations'), is_assoc ? (net.assoclist.length || '-') : null,
				null, is_assoc ? null : E('em', disabled ? _('Wireless is disabled') : _('Wireless is not associated')),
				_('WPS status'), this.WPSTranslateTbl[net.wps_status],
				'', WPS_button
			);

			badges.push(badge);

			chan = (chan != null) ? chan : channel;
			freq = (freq != null) ? freq : this.getDisplayFrequency(net, channel);
			rate = (rate != null) ? rate : this.getDisplayBitRate(net);
		}

		return E('div', { class: 'ifacebox' }, [
			E('div', { class: 'ifacebox-head center ' + (this.isRadioDisplayUp(radio, networks) ? 'active' : '') },
				E('strong', radio.getName())),
			E('div', { class: 'ifacebox-body left' }, [
				L.itemlist(E('span'), [
					_('Type'), this.getDisplayRadioName(radio),
					_('Channel'), chan ? '%d (%.3f %s)'.format(chan, freq, _('GHz')) : '-',
					_('Bitrate'), rate ? '%.1f %s'.format(rate, _('Mbit/s')) : '-',
				]),
				E('div', {}, badges)
			])
		]);
	},

	isWPSEnabled: {},

	load: function() {
		return Promise.all([
			network.getWifiDevices(),
			network.getWifiNetworks(),
			network.getHostHints(),
			this.callSessionAccess('access-group', 'luci-mod-status-index-wifi', 'read'),
			this.callSessionAccess('access-group', 'luci-mod-status-index-wifi', 'write'),
			uci.load('wireless')
		]).then(L.bind(function(data) {
			var tasks = [],
			    radios_networks_hints = data[1],
			    hasWPS = L.hasSystemFeature('hostapd', 'wps');

			tasks.push(this.loadIwinfoInfoMap().then(L.bind(function(map) {
				this.cachedIwinfoInfoMap = map || {};
			}, this)));

			for (var i = 0; i < radios_networks_hints.length; i++) {
				tasks.push(this.getAssocListForNetwork(radios_networks_hints[i]).then(L.bind(function(net, list) {
					net.assoclist = list.sort(function(a, b) { return a.mac.localeCompare(b.mac) });
				}, this, radios_networks_hints[i])));

				if (hasWPS && uci.get('wireless', radios_networks_hints[i].sid, 'wps_pushbutton') == '1') {
					radios_networks_hints[i].isWPSEnabled = true;
					tasks.push(L.resolveDefault(this.handleGetWPSStatus(radios_networks_hints[i].getIfname()), null)
						.then(L.bind(function(net, data) {
							net.wps_status = data ? data.pbc_status : _('No Data');
					}, this, radios_networks_hints[i])));
				}
			}

			return Promise.all(tasks).then(function() {
				return data;
			});
		}, this));
	},

	render: function(data) {
		var seen = {},
		    radios = data[0],
		    networks = data[1],
		    hosthints = data[2],
		    hasReadPermission = data[3],
		    hasWritePermission = data[4];

		var table = E('div', { 'class': 'network-status-table' });

		for (var i = 0; i < radios.sort(function(a, b) { a.getName() > b.getName() }).length; i++)
			table.appendChild(this.renderbox(radios[i],
				networks.filter(function(net) { return net.getWifiDeviceName() == radios[i].getName() })));

		if (!table.lastElementChild)
			return null;

		var assoclist = E('table', { 'class': 'table assoclist' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th nowrap' }, _('Network')),
				E('th', { 'class': 'th hide-xs' }, _('MAC address')),
				E('th', { 'class': 'th' }, _('Host')),
				E('th', { 'class': 'th' }, '%s / %s'.format(_('Signal'), _('Noise'))),
				E('th', { 'class': 'th' }, '%s / %s'.format(_('RX Rate'), _('TX Rate')))
			])
		]);

		var rows = [];

		for (var i = 0; i < networks.length; i++) {
			var macfilter = uci.get('wireless', networks[i].sid, 'macfilter'),
			    maclist = {};

			if (macfilter != null && macfilter != 'disable') {
				networks[i].maclist = L.toArray(uci.get('wireless', networks[i].sid, 'maclist'));
				for (var j = 0; j < networks[i].maclist.length; j++) {
					var mac = networks[i].maclist[j].toUpperCase();
					maclist[mac] = true;
				}
			}

			for (var k = 0; k < networks[i].assoclist.length; k++) {
				var bss = networks[i].assoclist[k],
				    name = hosthints.getHostnameByMACAddr(bss.mac),
				    ipv4 = hosthints.getIPAddrByMACAddr(bss.mac),
				    ipv6 = hosthints.getIP6AddrByMACAddr(bss.mac);

				var icon;
				var q = Math.min((bss.signal + 110) / 70 * 100, 100);
				if (q == 0)
					icon = L.resource('icons/signal-0.png');
				else if (q < 25)
					icon = L.resource('icons/signal-0-25.png');
				else if (q < 50)
					icon = L.resource('icons/signal-25-50.png');
				else if (q < 75)
					icon = L.resource('icons/signal-50-75.png');
				else
					icon = L.resource('icons/signal-75-100.png');

				var sig_title, sig_value;

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

				var hint;

				if (name && ipv4 && ipv6)
					hint = '%s <span class="hide-xs">(%s, %s)</span>'.format(name, ipv4, ipv6);
				else if (name && (ipv4 || ipv6))
					hint = '%s <span class="hide-xs">(%s)</span>'.format(name, ipv4 || ipv6);
				else
					hint = name || ipv4 || ipv6 || '?';

				var row = [
					E('span', {
						'class': 'ifacebadge',
						'title': networks[i].getI18n(),
						'data-ifname': networks[i].getIfname(),
						'data-ssid': networks[i].getActiveSSID()
					}, [
						E('img', { 'src': L.resource('icons/wifi.png') }),
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
