'use strict';
'require baseclass';
'require fs';
'require ui';
'require uci';
'require rpc';
'require network';
'require firewall';

var callGetBuiltinEthernetPorts = rpc.declare({
	object: 'luci',
	method: 'getBuiltinEthernetPorts',
	expect: { result: [] }
});

var callSwconfigPortState = rpc.declare({
	object: 'luci',
	method: 'getSwconfigPortState',
	params: [ 'switch' ],
	expect: { result: [] }
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

function addKnownPort(known_ports, seen_ports, role, device, extra)
{
	if (!isString(device) || seen_ports[device])
		return;

	seen_ports[device] = true;

	var port = Object.assign({
		role: role,
		device: device,
		label: device
	}, extra || {});

	if (!port.netdev && !port.swstate)
		port.netdev = network.instantiateDevice(device);

	known_ports.push(port);
}

function parseSwitchPortToken(token)
{
	if (!isString(token))
		return null;

	var m = token.match(/^(\d+)([a-z*]+)?$/i);

	return m ? { port: +m[1], flags: (m[2] || '').toLowerCase() } : null;
}

function appendSwitchMemberPorts(sw, ports, cpu_ports, member_ports)
{
	for (var j = 0; j < ports.length; j++) {
		var token = parseSwitchPortToken(ports[j]);

		if (!token)
			continue;

		for (var k = 0; k < sw.ports.length; k++) {
			if (sw.ports[k].num != token.port)
				continue;

			if (isString(sw.ports[k].device))
				cpu_ports[sw.ports[k].device] = true;
			else
				member_ports.push('%s:%d'.format(sw['.name'] || sw.name || '', token.port));

			break;
		}
	}
}

function buildLegacySwitchMappings(mapping, board)
{
	var switch_vlans = uci.sections('network', 'switch_vlan');

	if (!L.isObject(board) || !L.isObject(board.switch))
		return;

	for (var i = 0, s; (s = switch_vlans[i]) != null; i++) {
		var swname = s.device,
		    sw = board.switch[swname],
		    vid = s.vid || s.vlan;

		if (!L.isObject(sw) || !/^[0-9]{1,4}$/.test(vid) || +vid > 4095)
			continue;

		var ports = L.toArray(s.ports),
		    cpu_ports = {},
		    member_ports = [];

		sw['.name'] = swname;
		appendSwitchMemberPorts(sw, ports, cpu_ports, member_ports);

		member_ports = member_ports.filter(function(port, index) {
			return member_ports.indexOf(port) === index;
		});

		for (var cpudev in cpu_ports)
			mapping['%s.%s'.format(cpudev, vid)] = member_ports;
	}

	for (var swname in board.switch) {
		var sw = board.switch[swname];

		if (!L.isObject(sw) || !Array.isArray(sw.roles) || !Array.isArray(sw.ports))
			continue;

		sw['.name'] = swname;

		for (var i = 0; i < sw.roles.length; i++) {
			var role = sw.roles[i];

			if (!L.isObject(role) || !isString(role.device))
				continue;

			var cpu_ports = {},
			    member_ports = [];

			appendSwitchMemberPorts(sw, parseBoardPortList(role.ports), cpu_ports, member_ports);

			if (!cpu_ports[role.device])
				cpu_ports[role.device] = true;

			member_ports = member_ports.filter(function(port, index) {
				return member_ports.indexOf(port) === index;
			});

			if (!mapping[role.device])
				mapping[role.device] = [];

			for (var j = 0; j < member_ports.length; j++)
				if (mapping[role.device].indexOf(member_ports[j]) === -1)
					mapping[role.device].push(member_ports[j]);
		}
	}
}

function getSwitchPortLabel(board, switch_name, port_num)
{
	var sw = L.isObject(board) && L.isObject(board.switch) ? board.switch[switch_name] : null;

	if (!L.isObject(sw) || !Array.isArray(sw.ports))
		return '%s:%d'.format(switch_name, port_num);

	for (var i = 0; i < sw.ports.length; i++) {
		if (sw.ports[i].num != port_num)
			continue;

		if (isString(sw.ports[i].label))
			return sw.ports[i].label;

		if (isString(sw.ports[i].role)) {
			var index = 1;

			for (var j = 0; j < i; j++)
				if (sw.ports[j].role == sw.ports[i].role)
					index++;

			return sw.ports[i].role + index;
		}

		break;
	}

	return '%s:%d'.format(switch_name, port_num);
}

function addResolvedPort(known_ports, seen_ports, role, device, mapping, board, swstate)
{
	var resolved = resolveVLANPorts(device, mapping);

	for (var i = 0; i < resolved.length; i++) {
		var m = resolved[i].match(/^([^:]+):(\d+)$/);

		if (m) {
			var switch_name = m[1],
			    port_num = +m[2],
			    switch_ports = swstate[switch_name] || {};

			addKnownPort(known_ports, seen_ports, role, resolved[i], {
				label: getSwitchPortLabel(board, switch_name, port_num),
				swstate: switch_ports[port_num] || {
					port: port_num,
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
			addKnownPort(known_ports, seen_ports, role, resolved[i]);
		}
	}
}

function addBoardNetworkPorts(known_ports, seen_ports, role, entry, mapping, board, swstate)
{
	if (!L.isObject(entry))
		return;

	var values = parseBoardPortList(entry.ports).concat(parseBoardPortList(entry.ifname));

	if (isString(entry.device))
		values.push(entry.device);

	for (var i = 0; i < values.length; i++)
		addResolvedPort(known_ports, seen_ports, role, values[i], mapping, board, swstate);
}

function resolveVLANChain(ifname, bridges, mapping)
{
	while (!mapping[ifname]) {
		var m = ifname.match(/^(.+)\.([^.]+)$/);

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
	var bridge_vlans = uci.sections('network', 'bridge-vlan'),
	    vlan_devices = uci.sections('network', 'device'),
	    interfaces = uci.sections('network', 'interface'),
	    bridges = {};

	/* find bridge VLANs */
	for (var i = 0, s; (s = bridge_vlans[i]) != null; i++) {
		if (!isString(s.device) || !/^[0-9]{1,4}$/.test(s.vlan) || +s.vlan > 4095)
			continue;

		var aliases = L.toArray(s.alias),
		    ports = L.toArray(s.ports),
		    br = bridges[s.device] = (bridges[s.device] || { ports: [], vlans: {}, vlan_filtering: true });

		br.vlans[s.vlan] = [];

		for (var j = 0; j < ports.length; j++) {
			var port = ports[j].replace(/:[ut*]+$/, '');

			if (br.ports.indexOf(port) === -1)
				br.ports.push(port);

			br.vlans[s.vlan].push(port);
		}

		for (var j = 0; j < aliases.length; j++)
			if (aliases[j] != s.vlan)
				br.vlans[aliases[j]] = br.vlans[s.vlan];
	}

	/* find bridges, VLAN devices */
	for (var i = 0, s; (s = vlan_devices[i]) != null; i++) {
		if (s.type == 'bridge') {
			if (!isString(s.name))
				continue;

			var ports = L.toArray(s.ports),
			    br = bridges[s.name] || (bridges[s.name] = { ports: [], vlans: {}, vlan_filtering: false });

			if (s.vlan_filtering == '0')
				br.vlan_filtering = false;
			else if (s.vlan_filtering == '1')
				br.vlan_filtering = true;

			for (var j = 0; j < ports.length; j++)
				if (br.ports.indexOf(ports[j]) === -1)
					br.ports.push(ports[j]);

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
	for (var brname in bridges) {
		for (var i = 0; i < bridges[brname].ports.length; i++)
			resolveVLANChain(bridges[brname].ports[i], bridges, mapping);

		for (var vid in bridges[brname].vlans)
			for (var i = 0; i < bridges[brname].vlans[vid].length; i++)
				resolveVLANChain(bridges[brname].vlans[vid][i], bridges, mapping);
	}

	buildLegacySwitchMappings(mapping, board);

	/* find implicit VLAN devices */
	for (var i = 0, s; (s = interfaces[i]) != null; i++) {
		if (!isString(s.device))
			continue;

		resolveVLANChain(s.device, bridges, mapping);
	}
}

function resolveVLANPorts(ifname, mapping, seen)
{
	var ports = [];

	if (!seen)
		seen = {};

	if (mapping[ifname]) {
		for (var i = 0; i < mapping[ifname].length; i++) {
			if (!seen[mapping[ifname][i]]) {
				seen[mapping[ifname][i]] = true;
				ports.push.apply(ports, resolveVLANPorts(mapping[ifname][i], mapping, seen));
			}
		}
	}
	else {
		ports.push(ifname);
	}

	return ports.sort(L.naturalCompare);
}

function buildInterfaceMapping(zones, networks, board) {
	var vlanmap = {},
	    portmap = {},
	    netmap = {};

	buildVLANMappings(vlanmap, board);

	for (var i = 0; i < networks.length; i++) {
		var l3dev = networks[i].getDevice();

		if (!l3dev)
			continue;

		var ports = resolveVLANPorts(l3dev.getName(), vlanmap);

		for (var j = 0; j < ports.length; j++) {
			portmap[ports[j]] = portmap[ports[j]] || { networks: [], zones: [] };
			portmap[ports[j]].networks.push(networks[i]);
		}

		netmap[networks[i].getName()] = networks[i];
	}

	for (var i = 0; i < zones.length; i++) {
		var networknames = zones[i].getNetworks();

		for (var j = 0; j < networknames.length; j++) {
			if (!netmap[networknames[j]])
				continue;

			var l3dev = netmap[networknames[j]].getDevice();

			if (!l3dev)
				continue;

			var ports = resolveVLANPorts(l3dev.getName(), vlanmap);

			for (var k = 0; k < ports.length; k++) {
				portmap[ports[k]] = portmap[ports[k]] || { networks: [], zones: [] };

				if (portmap[ports[k]].zones.indexOf(zones[i]) === -1)
					portmap[ports[k]].zones.push(zones[i]);
			}
		}
	}

	return portmap;
}

function formatSpeed(carrier, speed, duplex) {
	if (speed && duplex) {
		var d = (duplex == 'half') ? '\u202f(H)' : '',
		    e = E('span', { 'title': _('Speed: %d Mibit/s, Duplex: %s').format(speed, duplex) });

		switch (speed) {
		case 10:    e.innerText = '10\u202fM' + d;  break;
		case 100:   e.innerText = '100\u202fM' + d; break;
		case 1000:  e.innerText = '1\u202fGbE' + d; break;
		case 2500:  e.innerText = '2.5\u202fGbE';   break;
		case 5000:  e.innerText = '5\u202fGbE';     break;
		case 10000: e.innerText = '10\u202fGbE';    break;
		case 25000: e.innerText = '25\u202fGbE';    break;
		case 40000: e.innerText = '40\u202fGbE';    break;
		default:    e.innerText = '%d\u202fMbE%s'.format(speed, d);
		}

		return e;
	}

	return carrier ? _('Connected') : _('no link');
}

function formatStats(port) {
	var stats = port.netdev
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

	return ui.itemlist(E('span'), [
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
	]);
}

function renderNetworkBadge(network, zonename) {
	var l3dev = network.getDevice();
	var span = E('span', { 'class': 'ifacebadge', 'style': 'margin:.125em 0' }, [
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
			'src': L.resource('icons/%s%s.png'.format(l3dev.getType(), l3dev.isUp() ? '' : '_disabled'))
		}));
	else
		span.appendChild(E('em', _('(no interfaces attached)')));

	return span;
}

function renderNetworksTooltip(pmap) {
	var res = [ null ],
	    zmap = {};

	for (var i = 0; pmap && i < pmap.zones.length; i++) {
		var networknames = pmap.zones[i].getNetworks();

		for (var k = 0; k < networknames.length; k++)
			zmap[networknames[k]] = pmap.zones[i].getName();
	}

	for (var i = 0; pmap && i < pmap.networks.length; i++)
		res.push(E('br'), renderNetworkBadge(pmap.networks[i], zmap[pmap.networks[i].getName()]));

	if (res.length > 1)
		res[0] = N_((res.length - 1) / 2, 'Part of network:', 'Part of networks:');
	else
		res[0] = _('Port is not part of any network');

	return E([], res);
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

return baseclass.extend({
	title: _('Port status'),

	load: function() {
		return Promise.all([
			L.resolveDefault(callGetBuiltinEthernetPorts(), []),
			L.resolveDefault(fs.read('/etc/board.json'), '{}'),
			firewall.getZones(),
			network.getNetworks(),
			uci.load('network')
		]).then(function(data) {
			var board = JSON.parse(data[1]),
			    swstate = {},
			    tasks = [];

			if (L.isObject(board) && L.isObject(board.switch)) {
				for (var switch_name in board.switch) {
					tasks.push(L.resolveDefault(callSwconfigPortState(switch_name), []).then(function(ports) {
						swstate[this] = ports.reduce(function(map, port) {
							map[port.port] = port;
							return map;
						}, {});
					}.bind(switch_name)));
				}
			}

			return Promise.all(tasks).then(function() {
				data.push(swstate);
				return data;
			});
		});
	},

	render: function(data) {
		var board = JSON.parse(data[1]),
		    known_ports = [],
		    seen_ports = {},
		    vlan_map = {},
		    swstate = data[5] || {},
		    port_map = buildInterfaceMapping(data[2], data[3], board);

		buildVLANMappings(vlan_map, board);

		if (Array.isArray(data[0]) && data[0].length > 0) {
			known_ports = data[0].reduce(function(ports, port) {
				addResolvedPort(ports, seen_ports, port.role, port.device, vlan_map, board, swstate);
				return ports;
			}, []);
		}

		if (L.isObject(board) && L.isObject(board.network)) {
			for (var k = 'lan'; k != null; k = (k == 'lan') ? 'wan' : null)
				addBoardNetworkPorts(known_ports, seen_ports, k, board.network[k], vlan_map, board, swstate);
		}

		if (!known_ports.length)
			return null;

		known_ports.sort(function(a, b) {
			return L.naturalCompare(a.label || a.device, b.label || b.device);
		});

		return E('div', { 'style': 'display:grid;grid-template-columns:repeat(auto-fit, minmax(70px, 1fr));margin-bottom:1em' }, known_ports.map(function(port) {
			var speed = getPortSpeed(port),
			    duplex = getPortDuplex(port),
			    carrier = getPortCarrier(port),
			    pmap = port_map[port.device],
			    pzones = (pmap && pmap.zones.length) ? pmap.zones.sort(function(a, b) { return L.naturalCompare(a.getName(), b.getName()) }) : [ null ];

			return E('div', { 'class': 'ifacebox', 'style': 'margin:.25em;min-width:70px;max-width:100px' }, [
				E('div', { 'class': 'ifacebox-head', 'style': 'font-weight:bold' }, [ port.label || port.device ]),
				E('div', { 'class': 'ifacebox-body' }, [
					E('img', { 'src': L.resource('icons/port_%s.png').format(carrier ? 'up' : 'down') }),
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
					E('div', { 'class': 'cbi-tooltip-container', 'style': 'text-align:left;font-size:80%' }, [
						'\u25b2\u202f%1024.1mB'.format(getPortTXBytes(port)),
						E('br'),
						'\u25bc\u202f%1024.1mB'.format(getPortRXBytes(port)),
						E('span', { 'class': 'cbi-tooltip' }, formatStats(port))
					]),
				])
			]);
		}));
	}
});
