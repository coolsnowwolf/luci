'use strict';
'require view';
'require poll';
'require request';
'require network';
'require fs';
'require ui';
'require rpc';
'require tools.prng as random';

function parseIwDevMap(stdout) {
	const byPhy = {};
	let currentPhy = null;

	for (const rawLine of String(stdout || '').split(/\n/)) {
		const phyMatch = rawLine.match(/^\s*phy#(\d+)\s*$/);
		const ifMatch = rawLine.match(/^\s*Interface\s+(\S+)\s*$/);

		if (phyMatch) {
			currentPhy = `phy${phyMatch[1]}`;
			byPhy[currentPhy] ??= [];
			continue;
		}

		if (currentPhy && ifMatch)
			byPhy[currentPhy].push(ifMatch[1]);
	}

	return Object.entries(byPhy).reduce((map, entry) => {
		const phy = entry[0];
		const ifaces = entry[1];
		const preferred = ifaces.find((ifname) => !/^wifi\d+$/.test(ifname)) || ifaces[0];
		const temp = `tmpsta${phy.replace(/^phy/, '')}`;

		ifaces.forEach((ifname) => {
			map[ifname] = {
				phy: phy,
				preferred: preferred,
				temp: temp
			};
		});

		return map;
	}, {});
}

function decodeIwSSID(raw) {
	const value = String(raw || '');
	const bytes = [];
	let hasEscapes = false;
	let hasWideChars = false;

	if (value === '')
		return null;

	for (let i = 0; i < value.length;) {
		if (value[i] == '\\' && value[i + 1] == 'x' && i + 3 < value.length) {
			const hex = value.substr(i + 2, 2);
			const byte = parseInt(hex, 16);

			if (!isNaN(byte)) {
				bytes.push(byte);
				i += 4;
				hasEscapes = true;
				continue;
			}
		}

		const code = value.charCodeAt(i++);

		if (code > 0xff) {
			hasWideChars = true;
			continue;
		}

		if (code !== 0)
			bytes.push(code & 0xff);
	}

	if (hasWideChars)
		return value.replace(/\u0000+/g, '').trim() || null;

	if (!bytes.length)
		return null;

	try {
		if ((hasEscapes || bytes.some((byte) => byte >= 0x80)) && typeof(TextDecoder) == 'function')
			return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).trim() || null;
	}
	catch (e) {
	}

	return String.fromCharCode.apply(null, bytes).replace(/\u0000+/g, '').trim() || null;
}

function frequencyToChannel(freq) {
	freq = +freq;

	if (isNaN(freq) || freq <= 0)
		return null;
	if (freq == 2484)
		return 14;
	if (freq >= 2412 && freq <= 2472)
		return Math.round((freq - 2407) / 5);
	if (freq >= 5000 && freq <= 5895)
		return Math.round((freq - 5000) / 5);
	if (freq >= 5955 && freq <= 7115)
		return Math.round((freq - 5950) / 5);

	return null;
}

function deriveBand(res) {
	const freq = +res.mhz;
	const channel = +res.channel;

	if (!isNaN(freq) && freq >= 5955)
		return 6;
	if (!isNaN(freq) && freq >= 5000)
		return 5;
	if (!isNaN(freq) && freq >= 2400)
		return 2;
	if (!isNaN(channel) && channel >= 36)
		return 5;
	if (!isNaN(channel) && channel >= 1 && channel <= 14)
		return 2;

	return null;
}

function normalizeScanResult(res) {
	const out = Object.assign({}, res);

	out.ssid = decodeIwSSID(out.ssid);
	out.channel = +out.channel || frequencyToChannel(out.mhz);
	out.mhz = +out.mhz || null;
	out.band = deriveBand(out);
	out.mode = out.mode || 'Master';

	return out;
}

function parseChannelWidth(widthText) {
	const value = String(widthText || '');

	if (/80\+80/i.test(value))
		return 8080;
	if (/160/i.test(value))
		return 160;
	if (/80/i.test(value))
		return 80;
	if (/20 or 40/i.test(value))
		return 40;

	return 20;
}

function parseIwScan(stdout) {
	const results = [];
	const lines = String(stdout || '').split(/\n/);
	let current = null;
	let section = null;

	function finishCurrent() {
		if (!current?.bssid || current.signal == null)
			return;

		results.push(normalizeScanResult(current));
	}

	for (const rawLine of lines) {
		const line = rawLine.trim();
		const bssMatch = line.match(/^BSS\s+([0-9a-f:]{17})\b/i);

		if (bssMatch) {
			finishCurrent();
			current = {
				bssid: bssMatch[1].toUpperCase(),
				mode: 'Master'
			};
			section = null;
			continue;
		}

		if (!current || line === '')
			continue;

		const freqMatch = line.match(/^freq:\s*(\d+)/i);
		if (freqMatch) {
			current.mhz = +freqMatch[1];
			if (current.channel == null)
				current.channel = frequencyToChannel(current.mhz);
			continue;
		}

		const signalMatch = line.match(/^signal:\s*(-?\d+(?:\.\d+)?)\s*dBm/i);
		if (signalMatch) {
			current.signal = Math.round(parseFloat(signalMatch[1]));
			continue;
		}

		const ssidMatch = line.match(/^SSID:\s*(.*)$/);
		if (ssidMatch) {
			current.ssid = decodeIwSSID(ssidMatch[1]);
			continue;
		}

		const capabilityMatch = line.match(/^capability:\s*([A-Z-]+)/i);
		if (capabilityMatch) {
			if (/IBSS/i.test(capabilityMatch[1]))
				current.mode = 'Ad-Hoc';
			else if (/ESS/i.test(capabilityMatch[1]))
				current.mode = 'Master';
			continue;
		}

		if (/^HT operation:/i.test(line)) {
			current.ht_operation ??= {};
			section = 'ht';
			continue;
		}

		if (/^VHT operation:/i.test(line)) {
			current.vht_operation ??= {};
			section = 'vht';
			continue;
		}

		if (/^HE operation:/i.test(line)) {
			current.he_operation ??= {};
			section = 'he';
			continue;
		}

		if (/^EHT operation:/i.test(line)) {
			current.eht_operation ??= {};
			section = 'eht';
			continue;
		}

		if (section == 'ht') {
			const primaryMatch = line.match(/primary channel:\s*(\d+)/i);
			const offsetMatch = line.match(/secondary channel offset:\s*(below|above|no secondary)/i);
			const widthMatch = line.match(/STA channel width:\s*(20 MHz|any)/i);

			if (primaryMatch) {
				current.channel = +primaryMatch[1];
				continue;
			}

			if (offsetMatch) {
				current.ht_operation.secondary_channel_offset = offsetMatch[1] == 'no secondary' ? 'none' : offsetMatch[1];
				if (offsetMatch[1] == 'above' || offsetMatch[1] == 'below')
					current.ht_operation.channel_width = 2040;
				continue;
			}

			if (widthMatch && widthMatch[1] == '20 MHz')
				current.ht_operation.channel_width = 20;
		}
		else if (section == 'vht') {
			const widthMatch = line.match(/channel width:\s*([0-9]+)\s*\(([^)]+)\)/i);
			const center1Match = line.match(/center freq segment 1:\s*(\d+)/i);
			const center2Match = line.match(/center freq segment 2:\s*(\d+)/i);

			if (widthMatch) {
				current.vht_operation.channel_width = parseChannelWidth(widthMatch[2]);
				continue;
			}

			if (center1Match) {
				current.vht_operation.center_freq_1 = +center1Match[1];
				continue;
			}

			if (center2Match) {
				current.vht_operation.center_freq_2 = +center2Match[1];
				continue;
			}
		}
		else if (section == 'he') {
			const widthMatch = line.match(/channel width:\s*(20|40|80|160|320)\s*MHz/i);
			const center1Match = line.match(/center freq segment 1:\s*(\d+)/i);
			const center2Match = line.match(/center freq segment 2:\s*(\d+)/i);

			if (widthMatch) {
				current.he_operation.channel_width = +widthMatch[1];
				continue;
			}

			if (center1Match) {
				current.he_operation.center_freq_1 = +center1Match[1];
				continue;
			}

			if (center2Match) {
				current.he_operation.center_freq_2 = +center2Match[1];
				continue;
			}
		}
		else if (section == 'eht') {
			const widthMatch = line.match(/channel width:\s*(320)\s*MHz/i);
			const center2Match = line.match(/center freq segment 2:\s*(\d+)/i);

			if (widthMatch) {
				current.eht_operation.channel_width = +widthMatch[1];
				continue;
			}

			if (center2Match)
				current.eht_operation.center_freq_2 = +center2Match[1];
		}
	}

	finishCurrent();

	return results;
}

function getSignalPercent(res) {
	const qv = +res.quality;
	const qm = +res.quality_max;

	if (qv > 0 && qm > 0)
		return Math.floor((100 / qm) * qv);
	if (res.signal != null)
		return Math.max(0, Math.min(100, Math.round(((+res.signal) + 110) / 70 * 100)));

	return 0;
}

return view.extend({
	callFrequencyList: rpc.declare({
		object: 'iwinfo',
		method: 'freqlist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	callNetworkDevices: rpc.declare({
		object: 'luci-rpc',
		method: 'getNetworkDevices',
		expect: { devices: [] }
	}),

	cachedNetworkDevices: null,
	cachedNetworkDevicesPromise: null,

	scanViaIw(scanIfname) {
		const attempts = [
			[ 'dev', scanIfname, 'scan' ],
			[ 'dev', scanIfname, 'scan', 'ap-force' ],
			[ 'dev', scanIfname, 'scan', 'dump' ]
		];
		let index = 0;

		const tryNext = () => {
			if (index >= attempts.length)
				return [];

			return L.resolveDefault(fs.exec('/usr/sbin/iw', attempts[index++]), null).then((res) => {
				const parsed = parseIwScan(res?.stdout);

				if (parsed.length)
					return parsed;

				return tryNext();
			}).catch(() => tryNext());
		};

		return tryNext();
	},

	cleanupTemporaryScanIface(tempIfname) {
		return L.resolveDefault(fs.exec('/usr/sbin/ip', [ 'link', 'set', tempIfname, 'down' ]), null)
			.then(() => L.resolveDefault(fs.exec('/usr/sbin/iw', [ 'dev', tempIfname, 'del' ]), null));
	},

	scanViaTemporaryIface(phy, tempIfname) {
		return this.cleanupTemporaryScanIface(tempIfname)
			.then(() => fs.exec('/usr/sbin/iw', [ 'phy', phy, 'interface', 'add', tempIfname, 'type', 'station' ]))
			.then(() => fs.exec('/usr/sbin/ip', [ 'link', 'set', tempIfname, 'up' ]))
			.then(() => this.scanViaIw(tempIfname))
			.finally(L.bind(this.cleanupTemporaryScanIface, this, tempIfname));
	},

	loadNetworkDevices(forceReload) {
		if (forceReload) {
			this.cachedNetworkDevices = null;
			this.cachedNetworkDevicesPromise = null;
		}

		if (this.cachedNetworkDevices)
			return Promise.resolve(this.cachedNetworkDevices);

		if (this.cachedNetworkDevicesPromise)
			return this.cachedNetworkDevicesPromise;

		this.cachedNetworkDevicesPromise = this.callNetworkDevices().then((devices) => {
			this.cachedNetworkDevices = devices || [];
			this.cachedNetworkDevicesPromise = null;

			return this.cachedNetworkDevices;
		}).catch((err) => {
			this.cachedNetworkDevicesPromise = null;
			throw err;
		});

		return this.cachedNetworkDevicesPromise;
	},

	resolveScanDevice(radioDev, forceReload) {
		return this.loadNetworkDevices(forceReload).then((devices) => {
			const apDevice = devices.find((dev) => dev.wireless &&
				dev.wireless.radio == radioDev.getName() &&
				dev.type !== 'wifi' &&
				dev.type !== 'radio');

			return apDevice?.device || radioDev.getName();
		});
	},

	getScanResultsForRadio(radioDev) {
		return this.resolveScanDevice(radioDev).then((scanIfname) => {
			const iwDev = this.iwDevMap?.[scanIfname] || this.iwDevMap?.[radioDev.getName()];
			const scanTasks = [];

			if (iwDev?.phy)
				scanTasks.push(() => this.scanViaTemporaryIface(iwDev.phy, iwDev.temp));

			scanTasks.push(() => this.scanViaIw(scanIfname));

			const tryNext = (index) => {
				if (index >= scanTasks.length)
					return [];

				return Promise.resolve(scanTasks[index]()).then((results) => {
					if (Array.isArray(results) && results.length)
						return results;

					return tryNext(index + 1);
				}).catch(() => tryNext(index + 1));
			};

			return tryNext(0);
		});
	},

	render_signal_badge(signalPercent, signalValue) {
		let icon, title, value;

		if (signalPercent < 0)
			icon = L.resource('icons/signal-none.svg');
		else if (signalPercent == 0)
			icon = L.resource('icons/signal-000-000.svg');
		else if (signalPercent < 25)
			icon = L.resource('icons/signal-000-025.svg');
		else if (signalPercent < 50)
			icon = L.resource('icons/signal-025-050.svg');
		else if (signalPercent < 75)
			icon = L.resource('icons/signal-050-075.svg');
		else
			icon = L.resource('icons/signal-075-100.svg');

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

	add_wifi_to_graph(chan_analysis, res, scanCache, channels, channel_width) {
		const offset_tbl = chan_analysis.offset_tbl;
		const height = chan_analysis.graph.offsetHeight - 2;
		const step = chan_analysis.col_width;
		const height_diff = (height-(height-(res.signal*-4)));

		if (scanCache[res.bssid].color == null)
			scanCache[res.bssid].color = random.derive_color(res.bssid);

		if (scanCache[res.bssid].graph == null || scanCache[res.bssid].graph === undefined) {
			const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			const color = scanCache[res.bssid].color;

			line.setAttribute('style', 'fill:'+color+'4f'+';stroke:'+color+';stroke-width:0.5');
			text.setAttribute('style', 'fill:'+color+';font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #000');
			text.appendChild(document.createTextNode(res.ssid || res.bssid));

			group.appendChild(line);
			group.appendChild(text);

			chan_analysis.graph.firstElementChild.appendChild(group);
			scanCache[res.bssid].graph = { group : group, line : line, text : text };
		}

		channels.forEach(function(channel) {
			if (channel_width > 2) {
				if (!("main" in scanCache[res.bssid].graph)) {
					const main = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
					main.setAttribute('style', 'fill:url(#GradientVerticalCenteredBlack)');
					scanCache[res.bssid].graph.group.appendChild(main);
					chan_analysis.graph.firstElementChild.lastElementChild.appendChild(main);
					scanCache[res.bssid].graph["main"] = main;
				}
				const main_offset = offset_tbl[res.channel];
				const points = [
					(main_offset-(step*(2  )))+','+height,
					(main_offset-(step*(2-1)))+','+height_diff,
					(main_offset+(step*(2-1)))+','+height_diff,
					(main_offset+(step*(2  )))+','+height
				];
				scanCache[res.bssid].graph.main.setAttribute('points', points);
			}

			const chan_offset = offset_tbl[channel];
			const points = [
				(chan_offset-(step*(channel_width  )))+','+height,
				(chan_offset-(step*(channel_width-1)))+','+height_diff,
				(chan_offset+(step*(channel_width-1)))+','+height_diff,
				(chan_offset+(step*(channel_width  )))+','+height
			];

			scanCache[res.bssid].graph.text.setAttribute('x', offset_tbl[res.channel]-step);
			scanCache[res.bssid].graph.text.setAttribute('y', height_diff - 2);
			scanCache[res.bssid].graph.line.setAttribute('points', points);
			scanCache[res.bssid].graph.group.style.zIndex = res.signal*-1;
			scanCache[res.bssid].graph.group.style.opacity = res.stale ? '0.5' : null;
		})
	},

	create_channel_graph(chan_analysis, freq_tbl, band) {
		const columns = (band != 2) ? freq_tbl.length * 4 : freq_tbl.length + 3;
		const chan_graph = chan_analysis.graph;
		const G = chan_graph.firstElementChild;
		const step = (chan_graph.offsetWidth - 2) / columns;
		let curr_offset = step;

		function createGraphHLine(graph, pos, width, dash) {
			const elem = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			elem.setAttribute('x1', pos);
			elem.setAttribute('y1', 0);
			elem.setAttribute('x2', pos);
			elem.setAttribute('y2', '100%');
			elem.setAttribute('style', 'stroke:black;stroke-width:'+width+';stroke-dasharray:'+dash);
			graph.appendChild(elem);
		}

		function createGraphText(graph, pos, text) {
			const elem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			elem.setAttribute('y', 15);
			elem.setAttribute('style', 'fill:#eee; font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #000');
			elem.setAttribute('x', pos + 5);
			elem.appendChild(document.createTextNode(text));
			graph.appendChild(elem);
		}

		chan_analysis.col_width = step;

		createGraphHLine(G,curr_offset, 0.1, 1);
		for (let i=0; i< freq_tbl.length;i++) {
			const channel = freq_tbl[i]
			chan_analysis.offset_tbl[channel] = curr_offset+step;

			if (band != 2) {
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

			if ((band != 2) && freq_tbl[i+1]) {
				const next_channel = freq_tbl[i+1];
				/* Check if we are transitioning to another 5/6Ghz band range */
				if ((next_channel - channel) == 4) {
					for (let j=1; j < 4; j++) {
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
			if (!this.radios[this.active_tab].loadedOnce)
				this.handleScanRefresh();
		}, this));
	},

	handleScanRefresh() {
		if (!this.active_tab)
			return;

		const radio = this.radios[this.active_tab];
		let q;

		return this.getScanResultsForRadio(radio.dev).then(L.bind(function(results) {
			const table = radio.table;
			const chan_analysis = radio.graph;
			const scanCache = radio.scanCache;
			const band = radio.band;

			const rows = [];

			for (let res of results) {
				if (scanCache[res.bssid] == null)
					scanCache[res.bssid] = {};

				scanCache[res.bssid].data = res;
				scanCache[res.bssid].data.stale = false;
			}

			for (let k in scanCache)
				if (scanCache[k].data.stale)
					results.push(scanCache[k].data);

			results.sort(function(a, b) {
				const channelDiff = (+a.channel || 0) - (+b.channel || 0);
				const ssidA = a.ssid || '';
				const ssidB = b.ssid || '';
				const bssidA = a.bssid || '';
				const bssidB = b.bssid || '';

				if (channelDiff)
					return channelDiff;
				if (ssidA < ssidB)
					return -1;
				if (ssidA > ssidB)
					return 1;
				if (bssidA < bssidB)
					return -1;
				if (bssidA > bssidB)
					return 1;

				return 0;
			});

			for (let res of results) {
				q = getSignalPercent(res);
				const s = res.stale ? 'opacity:0.5' : '';
				const center_channels = [res.channel];
				let chan_width = 2;

				/* Skip WiFi not supported by the current band */
				if (band != res.band)
					continue;
				if (chan_analysis.offset_tbl[res.channel] == null)
					continue;

				res.channel_width = "20 MHz";
				if (res.ht_operation != null) {
					/* Detect 40 MHz operation by looking for the presence of
					 * a secondary channel. */
					if (res.ht_operation.secondary_channel_offset == "below") {
						res.channel_width = "40 MHz";
						chan_width = 4; /* 40 MHz Channel Used */
						center_channels[0] -= 2;
					} else if (res.ht_operation.secondary_channel_offset == "above") {
						res.channel_width = "40 MHz";
						chan_width = 4; /* 40 MHz Channel Used */
						center_channels[0] += 2;
					} else {
						/* Fallback to 20 MHz due to discovery of other APs on the
						 * same channel (802.11n coexistence mechanism). */
						if (res.ht_operation.channel_width == 2040)
							res.channel_width = "20 MHz (40 MHz Intolerant)";
					}
				}

				/* if channel_width <= 40, refer to HT (above) for actual channel width,
				 * as vht_operation.channel_width == 40 really only means that the used
				 * bandwidth is <= 40 and could be 20 Mhz as well */
				if (res.vht_operation?.channel_width > 40) {
					center_channels[0] = res.vht_operation.center_freq_1;
					if (res.vht_operation.channel_width == 80) {
						chan_width = 8;
						res.channel_width = "80 MHz";

						/* If needed, adjust based on the 802.11ac Wave 2 interop workaround. */
						if (res.vht_operation.center_freq_2) {
							const diff = Math.abs(res.vht_operation.center_freq_2 -
							                    res.vht_operation.center_freq_1);

							if (diff == 8) {
								chan_width = 16;
								res.channel_width = "160 MHz";
								center_channels.push(res.vht_operation.center_freq_2);
							} else if (diff > 8) {
								chan_width = 8;
								res.channel_width = "80+80 MHz";
								center_channels.push(res.vht_operation.center_freq_2);
							}
						}
					} else if (res.vht_operation.channel_width == 8080) {
						res.channel_width = "80+80 MHz";
						chan_width = 8;
						center_channels.push(res.vht_operation.center_freq_2);
					} else if (res.vht_operation.channel_width == 160) {
						res.channel_width = "160 MHz";
						chan_width = 16;
					}
				}

				if (res.he_operation?.channel_width > 20) {
					center_channels[0] = res.he_operation.center_freq_1;
					chan_width = res.he_operation.channel_width / 10;
					switch (res.he_operation.channel_width) {
						case 40:
							res.channel_width = "40 MHz";
							break;
						case 80:
							res.channel_width = "80 MHz";
							break;
						case 160:
							res.channel_width = "160 MHz";
							center_channels.push(res.he_operation.center_freq_2);
							break;
					}
				}

				if (res.eht_operation?.channel_width == 320) {
					chan_width = 32;
					res.channel_width = "320 MHz";
					center_channels.push(res.eht_operation.center_freq_2);
				}

				this.add_wifi_to_graph(chan_analysis, res, scanCache, center_channels, chan_width);

				rows.push([
					E('span', { 'style': s }, this.render_signal_badge(q, res.signal)),
					E('span', { 'style': s }, [
						E('span', { 'style': 'color:'+scanCache[res.bssid].color }, '⬤ '),
						(res.ssid != null) ? '%h'.format(res.ssid) : E('em', _('hidden'))
					]),
					E('span', { 'style': s }, '%d'.format(res.channel)),
					E('span', { 'style': s }, '%h'.format(res.channel_width)),
					E('span', { 'style': s }, '%h'.format(res.mode)),
					E('span', { 'style': s }, '%h'.format(res.bssid))
				]);

				scanCache[res.bssid].data.stale = true;
			}

			cbi_update_table(table, rows);

			if (!radio.loadedOnce) {
				radio.loadedOnce = true;
				poll.stop();
			}
		}, this))
	},

	radios: {},

	loadSVG(src) {
		return request.get(src).then(function(response) {
			if (!response.ok)
				throw new Error(response.statusText);

			return E('div', {
				'id': 'channel_graph',
				'style': 'width:100%;height:400px;border:1px solid #000;background:#fff'
			}, E(response.text()));
		});
	},

	load() {
		return Promise.all([
			this.loadSVG(L.resource('svg/channel_analysis.svg')),
			L.resolveDefault(fs.exec('/usr/sbin/iw', [ 'dev' ]), null),
			network.getWifiDevices().then(L.bind(function(data) {
				const tasks = [], ret = [];

				for (let d of data) {
					ret[d.getName()] = { dev : d };

					tasks.push(this.callFrequencyList(d.getName())
					.then(L.bind(function(radio, data) {
						ret[radio.getName()].freq = data;
					}, this, d)));
				}

				return Promise.all(tasks).then(function() { return ret; })
			}, this))
		]).then((data) => {
			this.iwDevMap = parseIwDevMap(data[1]?.stdout);

			return [ data[0], data[2] ];
		});
	},

	render([svg, wifiDevs]) {
		const h2 = E('div', {'class' : 'cbi-title-section'}, [
			E('h2', {'class': 'cbi-title-field'}, [ _('Channel Analysis') ]),
			E('div', {'class': 'cbi-title-buttons'  }, [
				E('button', {
					'class': 'cbi-button cbi-button-edit',
					'click': ui.createHandlerFn(this, 'handleScanRefresh')
				}, [ _('Refresh Channels') ])])
			]);

		const tabs = E('div', {}, E('div'));

		for (let ifname in wifiDevs) {
			const bands = {
				[2] : { title: '2.4GHz', channels: [] },
				[5] : { title: '5GHz', channels: [] },
				[6] : { title: '6GHz', channels: [] },
			};

			/* Split FrequencyList in Bands */
			wifiDevs[ifname].freq.forEach(function(freq) {
				const band = deriveBand(freq);

				if (bands[band])
					bands[band].channels.push(freq.channel);
			});

			for (let band in bands) {
				if (bands[band].channels.length == 0)
					continue;

				const csvg = svg.cloneNode(true);
				const table = E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th col-2 middle center' }, _('Signal')),
						E('th', { 'class': 'th col-4 middle left' }, _('SSID')),
						E('th', { 'class': 'th col-2 middle center hide-xs' }, _('Channel')),
						E('th', { 'class': 'th col-3 middle left' }, _('Channel Width')),
						E('th', { 'class': 'th col-2 middle left hide-xs' }, _('Mode')),
						E('th', { 'class': 'th col-3 middle left hide-xs' }, _('BSSID'))
					])
				]),
				tab = E('div', { 'data-tab': ifname+band, 'data-tab-title': ifname+' ('+bands[band].title+')' },
						[E('br'),csvg,E('br'),table,E('br')]),
				graph_data = {
					graph: csvg,
					offset_tbl: {},
					col_width: 0,
					tab: tab,
				};

				this.radios[ifname+band] = {
					dev: wifiDevs[ifname].dev,
					band: band,
					graph: graph_data,
					table: table,
					scanCache: {},
					loadedOnce: false,
				};

				cbi_update_table(table, [], E('em', { class: 'spinning' }, _('Starting wireless scan...')));

				tabs.firstElementChild.appendChild(tab)

				requestAnimationFrame(L.bind(this.create_channel_graph, this, graph_data, bands[band].channels, band));
			}
		}

		ui.tabs.initTabGroup(tabs.firstElementChild.childNodes);

		const activePane = Array.from(tabs.firstElementChild.childNodes).find((pane) => pane.getAttribute('data-tab-active') == 'true');
		this.active_tab = activePane?.getAttribute('data-tab') || null;

		this.pollFn = L.bind(this.handleScanRefresh, this);
		poll.add(this.pollFn);

		if (this.active_tab)
			poll.start();

		return E('div', {}, [h2, tabs]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
