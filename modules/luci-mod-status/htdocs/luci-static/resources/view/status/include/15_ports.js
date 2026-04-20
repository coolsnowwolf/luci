'use strict';
'require baseclass';
'require fs';
'require ui';
'require uci';
'require rpc';
'require network';
'require firewall';

const callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] }
});

const callSwconfigPortState = rpc.declare({
	object: 'luci',
	method: 'getSwconfigPortState',
	params: [ 'switch' ],
	expect: { result: [] }
});

const callNetworkDeviceStatus = rpc.declare({
	object: 'network.device',
	method: 'status',
	params: [ 'name' ],
	expect: { '': {} }
});

function isString(v)
{
	return typeof(v) === 'string' && v !== '';
}

function parseBoardPortList(value)
{
	if (Array.isArray(value))
		return value.filter(isString);

	if (isString(value))
		return value.trim().split(/[\s,]+/).filter(isString);

	return [];
}

function addKnownPort(knownPorts, seenPorts, role, device, extra)
{
	if (!isString(device) || seenPorts[device])
		return;

	seenPorts[device] = true;

	const port = Object.assign({
		role,
		device,
		label: device
	}, extra || {});

	if (!port.netdev && !port.swstate)
		port.netdev = network.instantiateDevice(device);

	knownPorts.push(port);
}

function parseSwitchPortToken(token)
{
	if (!isString(token))
		return null;

	const match = token.match(/^(\d+)([a-z*]+)?$/i);

	return match ? { port: +match[1], flags: (match[2] || '').toLowerCase() } : null;
}

function appendSwitchMemberPorts(sw, ports, cpuPorts, memberPorts)
{
	for (const value of ports) {
		const token = parseSwitchPortToken(value);

		if (!token)
			continue;

		for (const port of sw.ports) {
			if (port.num != token.port)
				continue;

			if (isString(port.device))
				cpuPorts[port.device] = true;
			else
				memberPorts.push('%s:%d'.format(sw['.name'] || sw.name || '', token.port));

			break;
		}
	}
}

function buildLegacySwitchMappings(mapping, board)
{
	const switchVlans = uci.sections('network', 'switch_vlan');

	if (!L.isObject(board) || !L.isObject(board.switch))
		return;

	for (const section of switchVlans) {
		const swname = section.device;
		const sw = board.switch[swname];
		const vid = section.vid || section.vlan;

		if (!L.isObject(sw) || !/^[0-9]{1,4}$/.test(vid) || +vid > 4095)
			continue;

		const ports = L.toArray(section.ports);
		const cpuPorts = {};
		let memberPorts = [];

		sw['.name'] = swname;
		appendSwitchMemberPorts(sw, ports, cpuPorts, memberPorts);

		memberPorts = memberPorts.filter((port, index) => memberPorts.indexOf(port) === index);

		for (const cpuDev in cpuPorts)
			mapping['%s.%s'.format(cpuDev, vid)] = memberPorts;
	}

	for (const swname in board.switch) {
		const sw = board.switch[swname];

		if (!L.isObject(sw) || !Array.isArray(sw.roles) || !Array.isArray(sw.ports))
			continue;

		sw['.name'] = swname;

		for (const role of sw.roles) {
			if (!L.isObject(role) || !isString(role.device))
				continue;

			const cpuPorts = {};
			let memberPorts = [];

			appendSwitchMemberPorts(sw, parseBoardPortList(role.ports), cpuPorts, memberPorts);

			if (!cpuPorts[role.device])
				cpuPorts[role.device] = true;

			memberPorts = memberPorts.filter((port, index) => memberPorts.indexOf(port) === index);

			if (!mapping[role.device])
				mapping[role.device] = [];

			for (const port of memberPorts)
				if (mapping[role.device].indexOf(port) === -1)
					mapping[role.device].push(port);
		}
	}
}

function getSwitchPortLabel(board, switchName, portNum)
{
	const sw = L.isObject(board) && L.isObject(board.switch) ? board.switch[switchName] : null;

	if (!L.isObject(sw) || !Array.isArray(sw.ports))
		return '%s:%d'.format(switchName, portNum);

	for (let i = 0; i < sw.ports.length; i++) {
		if (sw.ports[i].num != portNum)
			continue;

		if (isString(sw.ports[i].label))
			return sw.ports[i].label;

		if (isString(sw.ports[i].role)) {
			let index = 1;

			for (let j = 0; j < i; j++)
				if (sw.ports[j].role == sw.ports[i].role)
					index++;

			return sw.ports[i].role + index;
		}

		break;
	}

	return '%s:%d'.format(switchName, portNum);
}

function addResolvedPort(knownPorts, seenPorts, role, device, mapping, board, swstate)
{
	const resolved = resolveVLANPorts(device, mapping);

	for (const value of resolved) {
		const match = value.match(/^([^:]+):(\d+)$/);

		if (match) {
			const switchName = match[1];
			const portNum = +match[2];
			const switchPorts = swstate[switchName] || {};

			addKnownPort(knownPorts, seenPorts, role, value, {
				label: getSwitchPortLabel(board, switchName, portNum),
				swstate: switchPorts[portNum] || {
					port: portNum,
					link: false,
					speed: 0,
					duplex: false,
					rx_bytes: 0,
					tx_bytes: 0,
					rx_packets: 0,
					tx_packets: 0
				}
			});
		}
		else {
			addKnownPort(knownPorts, seenPorts, role, value);
		}
	}
}

function addBoardNetworkPorts(knownPorts, seenPorts, role, entry, mapping, board, swstate)
{
	if (!L.isObject(entry))
		return;

	const values = parseBoardPortList(entry.ports).concat(parseBoardPortList(entry.ifname));

	if (isString(entry.device))
		values.push(entry.device);

	for (const value of values)
		addResolvedPort(knownPorts, seenPorts, role, value, mapping, board, swstate);
}

function resolveVLANChain(ifname, bridges, mapping)
{
	while (!mapping[ifname]) {
		const m = ifname.match(/^(.+)\.([^.]+)$/);

		if (!m)
			break;

		if (bridges[m[1]]) {
			if (bridges[m[1]].vlan_filtering)
				mapping[ifname] = bridges[m[1]].vlans[m[2]];
			else
				mapping[ifname] = bridges[m[1]].ports;
		}
		else if (/^[0-9]{1,4}$/.test(m[2]) && m[2] <= 4095) {
			mapping[ifname] = [ m[1] ];
		}
		else {
			break;
		}

		ifname = m[1];
	}
}

function buildVLANMappings(mapping, board)
{
	const bridge_vlans = uci.sections('network', 'bridge-vlan');
	const vlan_devices = uci.sections('network', 'device');
	const interfaces = uci.sections('network', 'interface');
	const bridges = {};

	/* find bridge VLANs */
	for (let i = 0, s; (s = bridge_vlans[i]) != null; i++) {
		if (!isString(s.device) || !/^[0-9]{1,4}$/.test(s.vlan) || +s.vlan > 4095)
			continue;

		const aliases = L.toArray(s.alias);
		const ports = L.toArray(s.ports);
		const br = bridges[s.device] = (bridges[s.device] || { ports: [], vlans: {}, vlan_filtering: true });

		br.vlans[s.vlan] = [];

		for (let p of ports) {
			const port = p.replace(/:[ut*]+$/, '');

			if (br.ports.indexOf(port) === -1)
				br.ports.push(port);

			br.vlans[s.vlan].push(port);
		}

		for (let a of aliases)
			if (a != s.vlan)
				br.vlans[a] = br.vlans[s.vlan];
	}

	/* find bridges, VLAN devices */
	for (let i = 0, s; (s = vlan_devices[i]) != null; i++) {
		if (s.type == 'bridge') {
			if (!isString(s.name))
				continue;

			const ports = L.toArray(s.ports);
			const br = bridges[s.name] || (bridges[s.name] = { ports: [], vlans: {}, vlan_filtering: false });

			if (s.vlan_filtering == '0')
				br.vlan_filtering = false;
			else if (s.vlan_filtering == '1')
				br.vlan_filtering = true;

			for (let p of ports)
				if (br.ports.indexOf(p) === -1)
					br.ports.push(p);

			mapping[s.name] = br.ports;
		}
		else if (s.type == '8021q' || s.type == '8021ad') {
			if (!isString(s.name) || !isString(s.vid) || !isString(s.ifname))
				continue;

			/* parent device is a bridge */
			if (bridges[s.ifname]) {
				/* parent bridge is VLAN enabled, device refers to VLAN ports */
				if (bridges[s.ifname].vlan_filtering)
					mapping[s.name] = bridges[s.ifname].vlans[s.vid];

				/* parent bridge is not VLAN enabled, device refers to all bridge ports */
				else
					mapping[s.name] = bridges[s.ifname].ports;
			}

			/* parent is a simple netdev */
			else {
				mapping[s.name] = [ s.ifname ];
			}

			resolveVLANChain(s.ifname, bridges, mapping);
		}
	}

	/* resolve VLAN tagged interfaces in bridge ports */
	for (let brname in bridges) {
		for (let bp of bridges[brname].ports)
			resolveVLANChain(bp, bridges, mapping);

		for (let vid in bridges[brname].vlans)
			for (let v of bridges[brname].vlans[vid])
				resolveVLANChain(v, bridges, mapping);
	}

	buildLegacySwitchMappings(mapping, board);

	/* find implicit VLAN devices */
	for (let i = 0, s; (s = interfaces[i]) != null; i++) {
		if (!isString(s.device))
			continue;

		resolveVLANChain(s.device, bridges, mapping);
	}
}

function resolveVLANPorts(ifname, mapping, seen)
{
	const ports = [];

	if (!seen)
		seen = {};

	if (mapping[ifname]) {
		for (let m of mapping[ifname]) {
			if (!seen[m]) {
				seen[m] = true;
				ports.push.apply(ports, resolveVLANPorts(m, mapping, seen));
			}
		}
	}
	else {
		ports.push(ifname);
	}

	return ports.sort(L.naturalCompare);
}

function buildInterfaceMapping(zones, networks, board) {
	const vlanmap = {};
	const portmap = {};
	const netmap = {};

	buildVLANMappings(vlanmap, board);

	for (let net of networks) {
		const l3dev = net.getDevice();

		if (!l3dev)
			continue;

		const ports = resolveVLANPorts(l3dev.getName(), vlanmap);

		for (let p of ports) {
			portmap[p] = portmap[p] || { networks: [], zones: [] };
			portmap[p].networks.push(net);
		}

		netmap[net.getName()] = net;
	}

	for (let z of zones) {
		const networknames = z.getNetworks();

		for (let nn of networknames) {
			if (!netmap[nn])
				continue;

			const l3dev = netmap[nn].getDevice();

			if (!l3dev)
				continue;

			const ports = resolveVLANPorts(l3dev.getName(), vlanmap);

			for (let p of ports) {
				portmap[p] = portmap[p] || { networks: [], zones: [] };

				if (portmap[p].zones.indexOf(z) === -1)
					portmap[p].zones.push(z);
			}
		}
	}

	return portmap;
}

function formatSpeed(carrier, speed, duplex) {
	if ((speed > 0) && duplex) {
		const d = (duplex == 'half') ? '\u202f(H)' : '';
		const e = E('span', { 'title': _('Speed: %d Mbit/s, Duplex: %s').format(speed, duplex) });

		switch (true) {
		case (speed < 1000):
			e.innerText = '%d\u202fM%s'.format(speed, d);
			break;
		case (speed == 1000):
			e.innerText = '1\u202fGbE' + d;
			break;
		case (speed >= 1e6 && speed < 1e9):
			e.innerText = '%f\u202fTbE'.format(speed / 1e6);
			break;
		case (speed >= 1e9):
			e.innerText = '%f\u202fPbE'.format(speed / 1e9);
			break;
		default: e.innerText = '%f\u202fGbE'.format(speed / 1000);
		}

		return e;
	}

	return carrier ? _('Connected') : _('no link');
}

function getPSEStatus(pse) {
	if (!pse)
		return null;

	const status = pse['c33-power-status'] || pse['podl-power-status'],
	    power = pse['c33-actual-power'];

	return {
		status: status,
		power: power,
		isDelivering: status === 'delivering' && power > 0
	};
}

function formatPSEPower(pse) {
	if (!pse)
		return null;

	const status = pse['c33-power-status'] || pse['podl-power-status'],
	    power = pse['c33-actual-power'];

	if (status === 'delivering' && power) {
		const watts = (power / 1000).toFixed(1);
		/* Format: "⚡ 15.4 W" - lightning bolt + narrow space + watts + narrow space + W */
		return E('span', { 'style': 'color:#000' },
			[ '\u26a1\ufe0e\u202f%s\u202fW'.format(watts) ]);
	}
	else if (status === 'searching') {
		return E('span', { 'style': 'color:#000' },
			[ '\u26a1\ufe0e\u202f' + _('searching') ]);
	}
	else if (status === 'fault' || status === 'otherfault' || status === 'error') {
		return E('span', { 'style': 'color:#d9534f' },
			[ '\u26a1\ufe0e\u202f' + _('fault') ]);
	}
	else if (status === 'disabled') {
		return E('span', { 'style': 'color:#888' },
			[ '\u26a1\ufe0e\u202f' + _('off') ]);
	}

	return null;
}

function formatStats(port, pse) {
	const stats = port.netdev
		? (port.netdev._devstate('stats') || {})
		: {
			rx_bytes: port.swstate ? port.swstate.rx_bytes : null,
			rx_packets: port.swstate ? port.swstate.rx_packets : null,
			multicast: null,
			rx_errors: null,
			rx_dropped: null,
			tx_bytes: port.swstate ? port.swstate.tx_bytes : null,
			tx_packets: port.swstate ? port.swstate.tx_packets : null,
			tx_errors: null,
			tx_dropped: null,
			collisions: null
		};
	const items = [
		_('Received bytes'), '%1024mB'.format(stats.rx_bytes),
		_('Received packets'), '%1000mPkts.'.format(stats.rx_packets),
		_('Received multicast'), '%1000mPkts.'.format(stats.multicast),
		_('Receive errors'), '%1000mPkts.'.format(stats.rx_errors),
		_('Receive dropped'), '%1000mPkts.'.format(stats.rx_dropped),

		_('Transmitted bytes'), '%1024mB'.format(stats.tx_bytes),
		_('Transmitted packets'), '%1000mPkts.'.format(stats.tx_packets),
		_('Transmit errors'), '%1000mPkts.'.format(stats.tx_errors),
		_('Transmit dropped'), '%1000mPkts.'.format(stats.tx_dropped),

		_('Collisions seen'), stats.collisions
	];

	if (pse) {
		const status = pse['c33-power-status'] || pse['podl-power-status'],
		    power = pse['c33-actual-power'],
		    powerClass = pse['c33-power-class'],
		    powerLimit = pse['c33-available-power-limit'];

		items.push(_('PoE status'), status || _('unknown'));

		if (power)
			items.push(_('PoE power'), '%.1f W'.format(power / 1000));

		if (powerClass)
			items.push(_('PoE class'), powerClass);

		if (powerLimit)
			items.push(_('PoE limit'), '%.1f W'.format(powerLimit / 1000));
	}

	return ui.itemlist(E('span'), items);
}

function getPortSpeed(port)
{
	return port.netdev ? port.netdev.getSpeed() : (port.swstate ? port.swstate.speed : null);
}

function getPortDuplex(port)
{
	if (port.netdev)
		return port.netdev.getDuplex();

	return (port.swstate && port.swstate.link) ? (port.swstate.duplex ? 'full' : 'half') : null;
}

function getPortCarrier(port)
{
	return port.netdev ? port.netdev.getCarrier() : !!(port.swstate && port.swstate.link);
}

function getPortTXBytes(port)
{
	return port.netdev ? port.netdev.getTXBytes() : (port.swstate ? port.swstate.tx_bytes : null);
}

function getPortRXBytes(port)
{
	return port.netdev ? port.netdev.getRXBytes() : (port.swstate ? port.swstate.rx_bytes : null);
}

function renderNetworkBadge(network, zonename) {
	const l3dev = network.getDevice();
	const span = E('span', { 'class': 'ifacebadge', 'style': 'margin:.125em 0' }, [
		E('span', {
			'class': 'zonebadge',
			'title': zonename ? _('Part of zone %q').format(zonename) : _('No zone assigned'),
			'style': firewall.getZoneColorStyle(zonename)
		}, '\u202f'),
		'\u202f', network.getName(), ': '
	]);

	if (l3dev)
		span.appendChild(E('img', {
			'title': l3dev.getI18n(),
			'src': L.resource('icons/%s%s.svg'.format(l3dev.getType(), l3dev.isUp() ? '' : '_disabled'))
		}));
	else
		span.appendChild(E('em', _('(no interfaces attached)')));

	return span;
}

function renderNetworksTooltip(pmap) {
	const res = [ null ];
	const zmap = {};

	const zones = (pmap && Array.isArray(pmap.zones)) ? pmap.zones : [];
	const networks = (pmap && Array.isArray(pmap.networks)) ? pmap.networks : [];

	for (let pmz of zones) {
		const networknames = pmz.getNetworks();

		for (let nn of networknames)
			zmap[nn] = pmz.getName();
	}

	for (let pmn of networks)
		res.push(E('br'), renderNetworkBadge(pmn, zmap[pmn.getName()]));

	if (res.length > 1)
		res[0] = N_((res.length - 1) / 2, 'Part of network:', 'Part of networks:');
	else
		res[0] = _('Port is not part of any network');

	return E([], res);
}

return baseclass.extend({
	title: _('Port status'),
	deferFirstLoad: true,
	disableCache: true,

	load() {
		return Promise.all([
			L.resolveDefault(callGetBuiltinEthernetPorts(), []),
			L.resolveDefault(fs.read('/etc/board.json'), '{}'),
			firewall.getZones(),
			network.getNetworks(),
			uci.load('network')
		]).then((data) => {
			const builtinPorts = data[0] || [];
			const board = JSON.parse(data[1] || '{}');
			const allPorts = new Set();
			const swstate = {};
			const tasks = [];

			builtinPorts.forEach((port) => {
				if (port.device)
					allPorts.add(port.device);
			});

			if (allPorts.size === 0 && board.network) {
				['lan', 'wan'].forEach((role) => {
					if (board.network[role]) {
						if (Array.isArray(board.network[role].ports))
							board.network[role].ports.forEach((p) => allPorts.add(p));
						else if (board.network[role].device)
							allPorts.add(board.network[role].device);
					}
				});
			}

			if (L.isObject(board) && L.isObject(board.switch)) {
				for (const switchName in board.switch) {
					tasks.push(L.resolveDefault(callSwconfigPortState(switchName), []).then((ports) => {
						swstate[switchName] = ports.reduce((map, port) => {
							map[port.port] = port;
							return map;
						}, {});
					}));
				}
			}

			const psePromises = Array.from(allPorts).map((devname) => {
				return L.resolveDefault(callNetworkDeviceStatus(devname), {}).then((status) => {
					return { name: devname, pse: status.pse || null };
				});
			});

			return Promise.all(tasks).then(() => Promise.all(psePromises)).then((pseResults) => {
				const pseMap = {};

				pseResults.forEach((result) => {
					if (result.pse)
						pseMap[result.name] = result.pse;
				});

				data.push(swstate);
				data.push(pseMap);

				return data;
			});
		});
	},

	render(data) {
		const board = JSON.parse(data[1]),
		      swstate = data[5] || {},
		      port_map = buildInterfaceMapping(data[2], data[3], board),
		      pseMap = data[6] || {};
		let known_ports = [];
		const seenPorts = {};
		const vlanMap = {};

		buildVLANMappings(vlanMap, board);

		if (Array.isArray(data[0]) && data[0].length > 0) {
			known_ports = data[0].reduce((ports, port) => {
				addResolvedPort(ports, seenPorts, port.role, port.device, vlanMap, board, swstate);
				return ports;
			}, []);
		}

		if (L.isObject(board) && L.isObject(board.network)) {
			for (let k = 'lan'; k != null; k = (k == 'lan') ? 'wan' : null) {
				if (!L.isObject(board.network[k]))
					continue;

				addBoardNetworkPorts(known_ports, seenPorts, k, board.network[k], vlanMap, board, swstate);
			}
		}

		if (!known_ports.length)
			return null;

		known_ports.sort(function(a, b) {
			return L.naturalCompare(a.label || a.device, b.label || b.device);
		});

		return E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit, minmax(100px, 1fr));margin-bottom:1em;align-items:center;justify-items:center;text-align:center' }, known_ports.map(function(port) {
			const speed = getPortSpeed(port);
			const duplex = getPortDuplex(port);
			const carrier = getPortCarrier(port);
			const pmap = port_map[port.device];
			const pzones = (pmap && pmap.zones.length) ? pmap.zones.sort((a, b) => L.naturalCompare(a.getName(), b.getName())) : [ null ];
			const pse = pseMap[port.device];
			const pseInfo = getPSEStatus(pse);
			const psePower = formatPSEPower(pse);

			/* Select port icon based on carrier and PSE status */
			let portIcon;
			if (pseInfo && pseInfo.isDelivering) {
				portIcon = carrier ? 'pse_up' : 'pse_down';
			} else {
				portIcon = carrier ? 'up' : 'down';
			}

			const statsContent = [
				'\u25b2\u202f%1024.1mB'.format(getPortTXBytes(port)),
				E('br'),
				'\u25bc\u202f%1024.1mB'.format(getPortRXBytes(port))
			];

			if (psePower) {
				statsContent.push(E('br'));
				statsContent.push(psePower);
			}

			statsContent.push(E('span', { 'class': 'cbi-tooltip' }, formatStats(port, pse)));

			return E('div', { 'class': 'ifacebox', 'style': 'margin:.25em;width:100px' }, [
				E('div', { 'class': 'ifacebox-head', 'style': 'font-weight:bold' }, [ port.label || port.device ]),
				E('div', { 'class': 'ifacebox-body' }, [
					E('img', { 'src': L.resource('icons/port_%s.svg').format(portIcon) }),
					E('br'),
					formatSpeed(carrier, speed, duplex)
				]),
				E('div', { 'class': 'ifacebox-head cbi-tooltip-container', 'style': 'display:flex' }, [
					E([], pzones.map(function(zone) {
						return E('div', {
							'class': 'zonebadge',
							'style': 'cursor:help;flex:1;height:3px;opacity:' + (carrier ? 1 : 0.25) + ';' + firewall.getZoneColorStyle(zone)
						});
					})),
					E('span', { 'class': 'cbi-tooltip left' }, [ renderNetworksTooltip(pmap) ])
				]),
				E('div', { 'class': 'ifacebox-body' }, [
					E('div', { 'class': 'cbi-tooltip-container', 'style': 'text-align:left;font-size:80%' }, statsContent)
				])
			]);
		}));
	}
});
