'use strict';
'require view';
'require poll';
'require request';
'require fs';
'require network';
'require ui';
'require rpc';
'require tools.prng as random';

return view.extend({
	cachedNetworkDevices: null,
	cachedNetworkDevicesPromise: null,

	callFrequencyList : rpc.declare({
		object: 'iwinfo',
		method: 'freqlist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	callNetworkDevices : rpc.declare({
		object: 'luci-rpc',
		method: 'getNetworkDevices',
		expect: { '': {} }
	}),

	callScan : rpc.declare({
		object: 'iwinfo',
		method: 'scan',
		params: [ 'device' ],
		nobatch: true,
		expect: { results: [] }
	}),

	isQcaRadio: function(radio) {
		var hwtype = radio.dev.get('type');
		return (hwtype == 'qcawifi' || hwtype == 'qcawificfg80211');
	},

	freqToChannel: function(freq) {
		freq = +freq;

		if (freq == 2484)
			return 14;
		else if (freq >= 2412 && freq < 2484)
			return Math.round((freq - 2407) / 5);
		else if (freq >= 5000 && freq < 5950)
			return Math.round((freq - 5000) / 5);
		else if (freq >= 5955)
			return Math.round((freq - 5950) / 5);

		return null;
	},

	decodeQcaSSID: function(ssid) {
		var value = String(ssid || ''),
		    bytes = [],
		    i, m;

		if (value == '')
			return '';

		for (i = 0; i < value.length; i++) {
			if (value.charAt(i) == '\\' && value.charAt(i + 1) == 'x' &&
			    (m = value.substring(i + 2, i + 4).match(/^[0-9a-fA-F]{2}$/))) {
				bytes.push(parseInt(m[0], 16));
				i += 3;
			}
			else {
				var code = value.charCodeAt(i);
				if (code >= 0 && code <= 0xFF)
					bytes.push(code);
			}
		}

		while (bytes.length && bytes[bytes.length - 1] === 0)
			bytes.pop();

		if (!bytes.length)
			return '';

		try {
			return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
		}
		catch (e) {
			try {
				return decodeURIComponent(escape(String.fromCharCode.apply(null, bytes)));
			}
			catch (e2) {
				return value;
			}
		}
	},

	parseQcaScanDump: function(stdout) {
		var blocks = String(stdout || '').split(/\n(?=BSS\s+)/),
		    results = [];

		for (var i = 0; i < blocks.length; i++) {
			var block = blocks[i],
			    lines = block.split(/\n/),
			    entry = null,
			    in_ht = false,
			    in_vht = false,
			    m;

			if (!(m = lines[0].match(/^BSS\s+([0-9a-f:]{17})/i)))
				continue;

			entry = {
				bssid: m[1].toUpperCase(),
				mode: 'Master',
				quality_max: 100
			};

			for (var j = 1; j < lines.length; j++) {
				var line = lines[j];

				if ((m = line.match(/^\s*SSID:\s*(.*)$/))) {
					entry.ssid = this.decodeQcaSSID(m[1] || '');
					in_ht = false;
					in_vht = false;
				}
				else if ((m = line.match(/^\s*signal:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*dBm/i))) {
					entry.signal = Math.round(parseFloat(m[1]));
					entry.quality = Math.max(0, Math.min(100, entry.signal + 100));
					in_ht = false;
					in_vht = false;
				}
				else if ((m = line.match(/^\s*freq:\s*([0-9]+)/i))) {
					entry.mhz = +m[1];
					entry.channel = this.freqToChannel(entry.mhz);
					in_ht = false;
					in_vht = false;
				}
				else if ((m = line.match(/^\s*\*\s*primary channel:\s*([0-9]+)/i))) {
					entry.channel = +m[1];
				}
				else if (/^\s*HT operation:/i.test(line)) {
					in_ht = true;
					in_vht = false;
				}
				else if (/^\s*VHT operation:/i.test(line)) {
					in_vht = true;
					in_ht = false;
					if (entry.vht_operation == null)
						entry.vht_operation = {};
				}
				else if (in_ht && (m = line.match(/^\s*\*\s*secondary channel offset:\s*(above|below)/i))) {
					entry.ht_operation = {
						channel_width: 2040,
						secondary_channel_offset: m[1].toLowerCase()
					};
				}
				else if (in_vht && (m = line.match(/^\s*\*\s*channel width:\s*[0-9]+\s*\(([^)]+)\)/i))) {
					var width = m[1];

					if (/80\+80/i.test(width))
						entry.vht_operation.channel_width = 8080;
					else if (/160/i.test(width))
						entry.vht_operation.channel_width = 160;
					else if (/80/i.test(width))
						entry.vht_operation.channel_width = 80;
				}
				else if (in_vht && (m = line.match(/^\s*\*\s*center freq segment 1:\s*([0-9]+)/i))) {
					entry.vht_operation = entry.vht_operation || {};
					entry.vht_operation.center_freq_1 = +m[1];
				}
				else if (in_vht && (m = line.match(/^\s*\*\s*center freq segment 2:\s*([0-9]+)/i))) {
					entry.vht_operation = entry.vht_operation || {};
					entry.vht_operation.center_freq_2 = +m[1];
				}
				else if (/^\S/.test(line)) {
					in_ht = false;
					in_vht = false;
				}
			}

			if (entry.channel != null && entry.signal != null)
				results.push(entry);
		}

		return results;
	},

	runQcaScanCommand: function(scanDevice, args) {
		return L.resolveDefault(fs.exec_direct('/usr/sbin/iw', args), '').then(L.bind(function(stdout) {
			return this.parseQcaScanDump(stdout);
		}, this));
	},

	getQcaScanList: function(scanDevice) {
		var commands = [
			[ 'dev', scanDevice, 'scan' ],
			[ 'dev', scanDevice, 'scan', 'ap-force' ],
			[ 'dev', scanDevice, 'scan', 'dump' ]
		],
		    best = [];

		return commands.reduce(L.bind(function(promise, args) {
			return promise.then(L.bind(function(results) {
				if (results.length > 1)
					return results;

				return this.runQcaScanCommand(scanDevice, args).then(function(scanResults) {
					if (scanResults.length > results.length)
						best = scanResults;

					return scanResults.length > 1 ? scanResults : best;
				});
			}, this));
		}, this), Promise.resolve(best));
	},

	loadNetworkDevices: function(force) {
		if (!force && this.cachedNetworkDevices != null)
			return Promise.resolve(this.cachedNetworkDevices);

		if (!force && this.cachedNetworkDevicesPromise != null)
			return this.cachedNetworkDevicesPromise;

		this.cachedNetworkDevicesPromise = this.callNetworkDevices().then(L.bind(function(devices) {
			this.cachedNetworkDevices = devices || {};
			this.cachedNetworkDevicesPromise = null;
			return this.cachedNetworkDevices;
		}, this)).catch(L.bind(function() {
			this.cachedNetworkDevices = {};
			this.cachedNetworkDevicesPromise = null;
			return this.cachedNetworkDevices;
		}, this));

		return this.cachedNetworkDevicesPromise;
	},

	resolveScanDevice: function(radio) {
		return this.loadNetworkDevices(radio.forceRefreshDeviceMap).then(function(ifaces) {
			var radioName = radio.dev.getName(),
			    radioMac = String(radio.dev.get('macaddr') || '').toUpperCase();

			radio.forceRefreshDeviceMap = false;

			for (var name in ifaces) {
				var peer = ifaces[name],
				    peerMac = String(peer.mac || '').toUpperCase();

				if (name == radioName || /^(wifi|radio)\d+/.test(name))
					continue;

				if (!peer || peer.wireless !== true)
					continue;

				if (!peerMac || !radioMac || peerMac !== radioMac)
					continue;

				return name;
			}

			return radioName;
		});
	},

	render_signal_badge: function(signalPercent, signalValue) {
		var icon, title, value;

		if (signalPercent < 0)
			icon = L.resource('icons/signal-none.png');
		else if (signalPercent == 0)
			icon = L.resource('icons/signal-0.png');
		else if (signalPercent < 25)
			icon = L.resource('icons/signal-0-25.png');
		else if (signalPercent < 50)
			icon = L.resource('icons/signal-25-50.png');
		else if (signalPercent < 75)
			icon = L.resource('icons/signal-50-75.png');
		else
			icon = L.resource('icons/signal-75-100.png');

		value = '%d\xa0%s'.format(signalValue, _('dBm'));
		title = '%s: %d %s'.format(_('Signal'), signalValue, _('dBm'));

		return E('div', {
			'class': 'ifacebadge',
			'title': title,
			'data-signal': signalValue
		}, [
			E('img', { 'src': icon }),
			value
		]);
	},

	add_wifi_to_graph: function(chan_analysis, res, scanCache, channels, channel_width) {
		var offset_tbl = chan_analysis.offset_tbl,
			height = chan_analysis.graph.offsetHeight - 2,
			step = chan_analysis.col_width,
			height_diff = (height-(height-(res.signal*-4)));

		if (scanCache[res.bssid].color == null)
			scanCache[res.bssid].color = random.derive_color(res.bssid);

		if (scanCache[res.bssid].graph == null)
			scanCache[res.bssid].graph = [];

		channels.forEach(function(channel) {
			if (scanCache[res.bssid].graph[i] == null) {
				var group = document.createElementNS('http://www.w3.org/2000/svg', 'g'),
					line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'),
					text = document.createElementNS('http://www.w3.org/2000/svg', 'text'),
					color = scanCache[res.bssid].color;

				line.setAttribute('style', 'fill:'+color+'4f'+';stroke:'+color+';stroke-width:0.5');
				text.setAttribute('style', 'fill:'+color+';font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #000');
				text.appendChild(document.createTextNode(res.ssid || res.bssid));

				group.appendChild(line)
				group.appendChild(text)

				chan_analysis.graph.firstElementChild.appendChild(group);
				scanCache[res.bssid].graph[i] = { group : group, line : line, text : text };
			}
			if (channel_width > 2) {
				if (!("main" in scanCache[res.bssid].graph[i])) {
					var main = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
					main.setAttribute('style', 'fill:url(#GradientVerticalCenteredBlack)');
					scanCache[res.bssid].graph[i].group.appendChild(main)
					chan_analysis.graph.firstElementChild.lastElementChild.appendChild(main);
					scanCache[res.bssid].graph[i]["main"] = main;
				}
				var main_offset = offset_tbl[res.channel],
					points = [
					(main_offset-(step*(2  )))+','+height,
					(main_offset-(step*(2-1)))+','+height_diff,
					(main_offset+(step*(2-1)))+','+height_diff,
					(main_offset+(step*(2  )))+','+height
				];
				scanCache[res.bssid].graph[i].main.setAttribute('points', points);
			}

			var chan_offset = offset_tbl[channel],
				points = [
				(chan_offset-(step*(channel_width  )))+','+height,
				(chan_offset-(step*(channel_width-1)))+','+height_diff,
				(chan_offset+(step*(channel_width-1)))+','+height_diff,
				(chan_offset+(step*(channel_width  )))+','+height
			];

			scanCache[res.bssid].graph[i].text.setAttribute('x', offset_tbl[res.channel]-step);
			scanCache[res.bssid].graph[i].text.setAttribute('y', height_diff - 2);
			scanCache[res.bssid].graph[i].line.setAttribute('points', points);
			scanCache[res.bssid].graph[i].group.style.zIndex = res.signal*-1;
			scanCache[res.bssid].graph[i].group.style.opacity = res.stale ? '0.5' : null;
		})
	},

	create_channel_graph: function(chan_analysis, freq_tbl, freq) {
		var is5GHz = freq == '5GHz',
		    columns = is5GHz ? freq_tbl.length * 4 : freq_tbl.length + 3,
		    chan_graph = chan_analysis.graph,
		    G = chan_graph.firstElementChild,
		    step = (chan_graph.offsetWidth - 2) / columns,
		    curr_offset = step;

		function createGraphHLine(graph, pos, width, dash) {
			var elem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			elem.setAttribute('x1', pos);
			elem.setAttribute('y1', 0);
			elem.setAttribute('x2', pos);
			elem.setAttribute('y2', '100%');
			elem.setAttribute('style', 'stroke:black;stroke-width:'+width+';stroke-dasharray:'+dash);
			graph.appendChild(elem);
		}

		function createGraphText(graph, pos, text) {
			var elem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			elem.setAttribute('y', 15);
			elem.setAttribute('style', 'fill:#eee; font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #000');
			elem.setAttribute('x', pos + 5);
			elem.appendChild(document.createTextNode(text));
			graph.appendChild(elem);
		}

		chan_analysis.col_width = step;

		createGraphHLine(G,curr_offset, 0.1, 1);
		for (var i=0; i< freq_tbl.length;i++) {
			var channel = freq_tbl[i]
			chan_analysis.offset_tbl[channel] = curr_offset+step;

			if (is5GHz) {
				createGraphHLine(G,curr_offset+step, 0.1, 3);
				if (channel < 100)
					createGraphText(G,curr_offset-(step/2), channel);
				else
					createGraphText(G,curr_offset-step, channel);
			} else {
				createGraphHLine(G,curr_offset+step, 0.1, 0);
				createGraphText(G,curr_offset+step, channel);
			}
			curr_offset += step;

			if (is5GHz && freq_tbl[i+1]) {
				var next_channel = freq_tbl[i+1];
				/* Check if we are transitioning to another 5Ghz band range */
				if ((next_channel - channel) == 4) {
					for (var j=1; j < 4; j++) {
						chan_analysis.offset_tbl[channel+j] = curr_offset+step;
						if (j == 2)
							createGraphHLine(G,curr_offset+step, 0.1, 0);
						else
							createGraphHLine(G,curr_offset+step, 0.1, 1);
						curr_offset += step;
					}
				} else {
					chan_analysis.offset_tbl[channel+1] = curr_offset+step;
					createGraphHLine(G,curr_offset+step, 0.1, 1);
					curr_offset += step;

					chan_analysis.offset_tbl[next_channel-2] = curr_offset+step;
					createGraphHLine(G,curr_offset+step, 0.5, 0);
					curr_offset += step;

					chan_analysis.offset_tbl[next_channel-1] = curr_offset+step;
					createGraphHLine(G,curr_offset+step, 0.1, 1);
					curr_offset += step;
				}
			}
		}
		createGraphHLine(G,curr_offset+step, 0.1, 1);

		chan_analysis.tab.addEventListener('cbi-tab-active', L.bind(function(ev) {
			this.active_tab = ev.detail.tab;

			if (this.radios[this.active_tab] && !this.radios[this.active_tab].loadedOnce)
				this.handleScanRefresh();
		}, this));
	},

	handleScanRefresh: function() {
		if (!this.active_tab)
			return;

		var radio = this.radios[this.active_tab];

		if (radio.scanPromise)
			return radio.scanPromise;

		radio.scanPromise = this.resolveScanDevice(radio).then(L.bind(function(scanDevice) {
			radio.scanDevice = scanDevice;

			if (this.isQcaRadio(radio))
				return this.getQcaScanList(scanDevice);

			return this.callScan(scanDevice);
		}, this)).then(L.bind(function(data) {
			var results = data,
			    table = radio.table,
			    chan_analysis = radio.graph,
			    scanCache = radio.scanCache;

			var rows = [];

			for (var i = 0; i < results.length; i++) {
				if (scanCache[results[i].bssid] == null)
					scanCache[results[i].bssid] = {};

				scanCache[results[i].bssid].data = results[i];
				scanCache[results[i].bssid].data.stale = false;
			}

			for (var k in scanCache)
				if (scanCache[k].data.stale)
					results.push(scanCache[k].data);

			results.sort(function(a, b) {
				if (a.channel - b.channel)
					return 1;

				if (a.ssid < b.ssid)
					return -1;
				else if (a.ssid > b.ssid)
					return 1;

				if (a.bssid < b.bssid)
					return -1;
				else if (a.bssid > b.bssid)
					return 1;
			});

			for (var i = 0; i < results.length; i++) {
				var res = results[i],
					qv = res.quality || 0,
					qm = res.quality_max || 0,
					q = (qv > 0 && qm > 0) ? Math.floor((100 / qm) * qv) : 0,
					s = res.stale ? 'opacity:0.5' : '',
					center_channels = [res.channel],
					chan_width = 2;

				/* Skip WiFi not supported by the current band */
				if (chan_analysis.offset_tbl[res.channel] == null)
					continue;

				res.channel_width = "20 MHz";
				if (res.ht_operation != null)
					if (res.ht_operation.channel_width == 2040) { /* 40 MHz Channel Enabled */
						if (res.ht_operation.secondary_channel_offset == "below") {
							res.channel_width = "40 MHz";
							chan_width = 4; /* 40 MHz Channel Used */
							center_channels[0] -= 2;
						} else if (res.ht_operation.secondary_channel_offset == "above") {
							res.channel_width = "40 MHz";
							chan_width = 4; /* 40 MHz Channel Used */
							center_channels[0] += 2;
						} else {
							res.channel_width = "20 MHz (40 MHz Intolerant)";
						}
					}

				if (res.vht_operation != null) {
					center_channels[0] = res.vht_operation.center_freq_1;
					if (res.vht_operation.channel_width == 80) {
						chan_width = 8;
						res.channel_width = "80 MHz";
					} else if (res.vht_operation.channel_width == 8080) {
						res.channel_width = "80+80 MHz";
						chan_width = 8;
						center_channels.push(res.vht_operation.center_freq_2);
					} else if (res.vht_operation.channel_width == 160) {
						res.channel_width = "160 MHz";
						chan_width = 16;
					}
				}

				this.add_wifi_to_graph(chan_analysis, res, scanCache, center_channels, chan_width);

				rows.push([
					E('span', { 'style': s }, this.render_signal_badge(q, res.signal)),
					E('span', { 'style': s }, [
						E('span', { 'style': 'color:'+scanCache[results[i].bssid].color }, '⬤ '),
						(res.ssid != null && res.ssid !== '') ? '%h'.format(res.ssid) : E('em', _('hidden'))
					]),
					E('span', { 'style': s }, '%d'.format(res.channel)),
					E('span', { 'style': s }, '%h'.format(res.channel_width)),
					E('span', { 'style': s }, '%h'.format(res.mode)),
					E('span', { 'style': s }, '%h'.format(res.bssid))
				]);

				scanCache[results[i].bssid].data.stale = true;
			}

			cbi_update_table(table, rows);

			if (!radio.loadedOnce)
				radio.loadedOnce = true;
		}, this)).catch(function(err) {
			radio.forceRefreshDeviceMap = true;
			ui.addNotification(null, E('p', _('Wireless channel scan failed.')), 'danger');
			throw err;
		}).finally(function() {
			radio.scanPromise = null;
		});

		return radio.scanPromise;
	},

	radios : {},

	loadSVG : function(src) {
		return request.get(src).then(function(response) {
			if (!response.ok)
				throw new Error(response.statusText);

			return E('div', {
				'id': 'channel_graph',
				'style': 'width:100%;height:400px;border:1px solid #000;background:#fff'
			}, E(response.text()));
		});
	},

	load: function() {
		return Promise.all([
			this.loadSVG(L.resource('svg/channel_analysis.svg')),
			network.getWifiDevices().then(L.bind(function(data) {
				var tasks = [], ret = [];

				for (var i = 0; i < data.length; i++) {
					ret[data[i].getName()] = { dev : data[i] };

					tasks.push(this.callFrequencyList(data[i].getName())
					.then(L.bind(function(radio, data) {
						ret[radio.getName()].freq = data;
					}, this, data[i])));
				}

				return Promise.all(tasks).then(function() { return ret; })
			}, this))
		]);
	},

	render: function(data) {
		var svg = data[0],
		    wifiDevs = data[1];

		var h2 = E('div', {'class' : 'cbi-title-section'}, [
			E('h2', {'class': 'cbi-title-field'}, [ _('Channel Analysis') ])
		]);

		var tabs = E('div', {}, E('div'));

		for (var ifname in wifiDevs) {
			var freq_tbl = {
				['2.4GHz'] : [],
				['5GHz'] : [],
			};

			/* Split FrequencyList in Bands */
			wifiDevs[ifname].freq.forEach(function(freq) {
				if (freq.mhz >= 5000) {
					freq_tbl['5GHz'].push(freq.channel);
				} else {
					freq_tbl['2.4GHz'].push(freq.channel);
				}
			});

			for (var freq in freq_tbl) {
				if (freq_tbl[freq].length == 0)
					continue;

				var csvg = svg.cloneNode(true),
				table = E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th col-2 middle center' }, _('Signal')),
						E('th', { 'class': 'th col-4 middle left' }, _('SSID')),
						E('th', { 'class': 'th col-2 middle center hide-xs' }, _('Channel')),
						E('th', { 'class': 'th col-3 middle left' }, _('Channel Width')),
						E('th', { 'class': 'th col-2 middle left hide-xs' }, _('Mode')),
						E('th', { 'class': 'th col-3 middle left hide-xs' }, _('BSSID'))
					])
				]),
				tab = E('div', { 'data-tab': ifname+freq, 'data-tab-title': ifname+' ('+freq+')' },
						[E('br'),csvg,E('br'),table,E('br')]),
				graph_data = {
					graph: csvg,
					offset_tbl: {},
					col_width: 0,
					tab: tab,
				};

				this.radios[ifname+freq] = {
					dev: wifiDevs[ifname].dev,
					graph: graph_data,
					table: table,
						scanCache: {},
						loadedOnce: false,
						scanPromise: null,
						scanDevice: ifname,
						forceRefreshDeviceMap: true,
					};

				cbi_update_table(table, [], E('em', { class: 'spinning' }, _('Starting wireless scan...')));

				tabs.firstElementChild.appendChild(tab)

				requestAnimationFrame(L.bind(this.create_channel_graph, this, graph_data, freq_tbl[freq], freq));
			}
		}

		ui.tabs.initTabGroup(tabs.firstElementChild.childNodes);

		this.pollFn = L.bind(this.handleScanRefresh, this);
		poll.add(this.pollFn);
		poll.start();

		this.active_tab = Object.keys(this.radios)[0] || null;
		if (this.active_tab != null)
			requestAnimationFrame(L.bind(this.handleScanRefresh, this));

		return E('div', {}, [h2, tabs]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
