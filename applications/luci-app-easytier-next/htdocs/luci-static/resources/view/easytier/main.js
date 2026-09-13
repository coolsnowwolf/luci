'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require poll';
'require dom';

const callGetStatus = rpc.declare({
	object: 'easytier',
	method: 'get_status',
	expect: { }
});

const callGetPeers = rpc.declare({
	object: 'easytier',
	method: 'get_peers',
	expect: { }
});

const callGetTopology = rpc.declare({
	object: 'easytier',
	method: 'get_topology',
	expect: { }
});

const callGetLogs = rpc.declare({
	object: 'easytier',
	method: 'get_logs',
	expect: { }
});

const callClearLogs = rpc.declare({
	object: 'easytier',
	method: 'clear_logs'
});

const callGetSubroutes = rpc.declare({
	object: 'easytier',
	method: 'get_subroutes',
	expect: { routes: [] }
});

const callServiceAction = rpc.declare({
	object: 'easytier',
	method: 'service_action',
	params: ['action']
});

function createActionBtn(label, btnClass, onClick) {
	return E('button', {
		'class': 'btn cbi-button ' + btnClass,
		'style': 'margin-left: 10px; padding: 2px 10px; font-size: 12px; vertical-align: middle;',
		'click': onClick
	}, label);
}

function renderCoreStatus(stateObj) {
	const state = stateObj ? stateObj.state : 'stopped';
	const pid = stateObj ? stateObj.pid : null;
	const isRunning = (state === 'managed' || state === 'unmanaged');

	let text = _('Stopped');
	let color = 'red';
	if (state === 'managed') {
		text = _('Running');
		color = 'green';
	} else if (state === 'unmanaged') {
		text = _('Running (Unmanaged)');
		color = 'orange';
	}
	if (pid) text += ' [PID: ' + pid + ']';

	const fields = [
		E('span', { 'style': 'font-weight: bold; color: ' + color + ';' }, text)
	];

	if (isRunning) {
		fields.push(
			createActionBtn(_('Restart'), 'cbi-button-action', function(ev) {
				ui.showModal(_('Action'), [ E('p', {}, _('Restarting service...')) ]);
				return callServiceAction('restart').then(function() {
					window.location.reload();
				});
			})
		);
	}

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, _('Core Service Status')),
		E('div', { 'class': 'cbi-value-field' }, fields)
	]);
}

function renderWebStatus(stateObj, webInstalled) {
	if (webInstalled === false) {
		return E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, _('Web Console Status')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('span', { 'style': 'font-weight: bold; color: #6c757d;' }, _('Not Installed'))
			])
		]);
	}

	const state = stateObj ? stateObj.state : 'stopped';
	const pid = stateObj ? stateObj.pid : null;
	const isRunning = (state === 'managed' || state === 'unmanaged');

	let text = _('Stopped');
	let color = 'red';
	if (state === 'managed') {
		text = _('Running');
		color = 'green';
	} else if (state === 'unmanaged') {
		text = _('Running (Unmanaged)');
		color = 'orange';
	}
	if (pid) text += ' [PID: ' + pid + ']';

	const fields = [
		E('span', { 'style': 'font-weight: bold; color: ' + color + ';' }, text)
	];

	if (isRunning) {
		const port = uci.get('easytier', 'settings', 'web_html_port') || '22020';
		const url = 'http://' + window.location.hostname + ':' + port;
		fields.push(
			createActionBtn(_('Restart'), 'cbi-button-action', function(ev) {
				ui.showModal(_('Action'), [ E('p', {}, _('Restarting service...')) ]);
				return callServiceAction('restart').then(function() {
					window.location.reload();
				});
			}),
			E('a', {
				'class': 'btn cbi-button cbi-button-action',
				'style': 'margin-left: 10px; padding: 2px 10px; font-size: 12px; vertical-align: middle;',
				'href': url,
				'target': '_blank'
			}, _('Open Console'))
		);
	}

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, _('Web Console Status')),
		E('div', { 'class': 'cbi-value-field' }, fields)
	]);
}

function renderProxyCidrBadges(proxyStr) {
	if (!proxyStr || typeof proxyStr !== 'string' || proxyStr.trim() === '' || proxyStr === '-') {
		return '-';
	}
	const list = proxyStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
	if (list.length === 0) return '-';

	return E('div', { 'style': 'display: flex; flex-direction: column; gap: 4px;' }, list.map(function(cidr) {
		return E('span', {
			'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-family: monospace; font-weight: 600; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 3px; white-space: nowrap; width: fit-content;'
		}, cidr);
	}));
}

function renderLocalNodeInfo(peerData) {
	let peers = [];
	if (Array.isArray(peerData)) {
		peers = peerData;
	} else if (peerData && Array.isArray(peerData.peers)) {
		peers = peerData.peers;
	}

	let local = null;
	for (let i = 0; i < peers.length; i++) {
		if (peers[i].cost && String(peers[i].cost).trim().toLowerCase() === 'local') {
			local = peers[i];
			break;
		}
	}

	if (!local) {
		return E('em', {}, _('Local service is not running.'));
	}

	const ipv4Val = local.ipv4 ? String(local.ipv4).trim() : '-';
	const hostnameVal = local.hostname ? String(local.hostname).trim() : '-';
	const natVal = local.nat ? String(local.nat).trim() : '-';
	const versionVal = local.version ? String(local.version).trim() : '-';
	const netNameVal = uci.get('easytier', 'settings', 'network_name') || 'easytier';
	const devNameVal = uci.get('easytier', 'settings', 'dev_name') || 'easytier0';

	let localProxy = local.proxy_cidrs ? String(local.proxy_cidrs).trim() : '';
	if (!localProxy) {
		let cfgProxy = uci.get('easytier', 'settings', 'proxy_networks');
		if (Array.isArray(cfgProxy) && cfgProxy.length > 0) localProxy = cfgProxy.join(', ');
		else if (typeof cfgProxy === 'string' && cfgProxy.trim() !== '') localProxy = cfgProxy.trim();
	}

	const proxyDisp = renderProxyCidrBadges(localProxy);

	const infoItems = [
		{ label: _('Virtual IP'), value: E('strong', { 'style': 'color: #007bff;' }, ipv4Val) },
		{ label: _('Hostname'), value: E('strong', {}, hostnameVal) },
		{ label: _('Network Name'), value: netNameVal },
		{ label: _('Proxy Networks'), value: proxyDisp },
		{ label: _('Virtual Interface'), value: devNameVal },
		{ label: _('NAT Type'), value: natVal },
		{ label: _('Client Version'), value: versionVal }
	];

	return E('div', { 'class': 'cbi-section-node' }, [
		E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 4px;' }, [
			E('table', { 'class': 'cbi-table', 'style': 'width: 100%; border-collapse: separate; border-spacing: 0;' }, [
				E('tr', { 'class': 'cbi-table-header' }, infoItems.map(item => E('th', { 'class': 'cbi-table-cell', 'style': 'padding: 10px 14px; text-align: left; white-space: nowrap; font-weight: bold; min-width: 120px;' }, item.label))),
				E('tr', { 'class': 'cbi-row' }, infoItems.map(item => E('td', { 'class': 'cbi-value-field', 'style': 'padding: 8px 14px; text-align: left; white-space: nowrap;' }, item.value)))
			])
		])
	]);
}

function isThemeDark() {
	if (document.querySelector('[data-darkmode="true"]') ||
		document.body.getAttribute('data-darkmode') === 'true' ||
		document.documentElement.getAttribute('data-darkmode') === 'true' ||
		document.documentElement.getAttribute('data-theme') === 'dark' ||
		document.body.classList.contains('dark') ||
		document.body.classList.contains('theme-dark') ||
		(document.querySelector('link[href*="dark"]') !== null)) {
		return true;
	}
	try {
		const bg = window.getComputedStyle(document.body).backgroundColor;
		const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
		if (m) {
			const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3]);
			if ((r * 0.299 + g * 0.587 + b * 0.114) < 130) return true;
		}
	} catch(e) {}
	return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function injectTooltipStyle() {
	if (document.getElementById('et_custom_tooltip_style')) return;
	const css = [
		'.et-tooltip-wrap { position: relative; display: inline-block; cursor: pointer; }',
		'.et-tooltip-wrap .et-tooltip-bubble { visibility: hidden; opacity: 0; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%) translateY(4px); background: #0f172a; color: #f8fafc; font-size: 11px; font-weight: 500; font-family: monospace, sans-serif; white-space: nowrap; padding: 5px 9px; border-radius: 4px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28); z-index: 9999; pointer-events: none; transition: opacity 0.15s ease, transform 0.15s ease; border: 1px solid #334155; }',
		'.et-tooltip-wrap .et-tooltip-bubble::after { content: ""; position: absolute; top: 100%; left: 50%; margin-left: -5px; border-width: 5px; border-style: solid; border-color: #0f172a transparent transparent transparent; }',
		'.et-tooltip-wrap:hover .et-tooltip-bubble { visibility: visible; opacity: 1; transform: translateX(-50%) translateY(0); }',
		'',
		'/* 拓扑图主题自适应样式 */',
		'.et-node-title { fill: #0f172a; }',
		'.et-node-title.is-local { fill: #1e3a8a; }',
		'.et-node-ip { fill: #64748b; }',
		'.et-node-ip.is-local { fill: #2563eb; }',
		'.et-node-circle { fill: #ffffff; stroke: #94a3b8; }',
		'.et-node-circle.is-local { fill: #2563eb; stroke: #1d4ed8; }',
		'.et-node-server-rect { fill: #f8fafc; stroke: #475569; }',
		'.et-node-proxy-bg { fill: #ecfdf5; stroke: #a7f3d0; }',
		'.et-node-proxy-text { fill: #047857; }',
		'.et-badge-rect { fill: #ffffff; }',
		'.et-topo-container { background-color: #f8fafc; background-image: radial-gradient(#cbd5e1 1.2px, transparent 1.2px); border-color: #e2e8f0; }',
		'.et-topo-legend { color: #475569; }',
		'.et-btn-toolbar { background: rgba(255, 255, 255, 0.95); color: #475569; border-color: #cbd5e1; }',
		'',
		'/* 夜间/暗黑主题自适应 (响应系统偏好及各类 OpenWrt 暗色主题) */',
		'@media (prefers-color-scheme: dark) {',
		'    .et-node-title { fill: #f8fafc !important; }',
		'    .et-node-title.is-local { fill: #93c5fd !important; }',
		'    .et-node-ip { fill: #94a3b8 !important; }',
		'    .et-node-ip.is-local { fill: #60a5fa !important; }',
		'    .et-node-circle { fill: #1e293b !important; stroke: #475569 !important; }',
		'    .et-node-server-rect { fill: #0f172a !important; stroke: #64748b !important; }',
		'    .et-node-proxy-bg { fill: #064e3b !important; stroke: #059669 !important; }',
		'    .et-node-proxy-text { fill: #6ee7b7 !important; }',
		'    .et-badge-rect { fill: #1e293b !important; }',
		'    .et-topo-container { background-color: #0f172a !important; background-image: radial-gradient(#334155 1.2px, transparent 1.2px) !important; border-color: #334155 !important; }',
		'    .et-topo-legend { color: #94a3b8 !important; }',
		'    .et-btn-toolbar { background: rgba(30, 41, 59, 0.95) !important; color: #f1f5f9 !important; border-color: #475569 !important; }',
		'}',
		'',
		'[data-darkmode="true"] .et-node-title, [data-theme="dark"] .et-node-title, [data-mode="dark"] .et-node-title, .dark .et-node-title, .theme-dark .et-node-title, body[data-theme="dark"] .et-node-title, .et-dark .et-node-title { fill: #f8fafc !important; }',
		'[data-darkmode="true"] .et-node-title.is-local, [data-theme="dark"] .et-node-title.is-local, [data-mode="dark"] .et-node-title.is-local, .dark .et-node-title.is-local, .theme-dark .et-node-title.is-local, body[data-theme="dark"] .et-node-title.is-local, .et-dark .et-node-title.is-local { fill: #93c5fd !important; }',
		'[data-darkmode="true"] .et-node-ip, [data-theme="dark"] .et-node-ip, [data-mode="dark"] .et-node-ip, .dark .et-node-ip, .theme-dark .et-node-ip, body[data-theme="dark"] .et-node-ip, .et-dark .et-node-ip { fill: #94a3b8 !important; }',
		'[data-darkmode="true"] .et-node-ip.is-local, [data-theme="dark"] .et-node-ip.is-local, [data-mode="dark"] .et-node-ip.is-local, .dark .et-node-ip.is-local, .theme-dark .et-node-ip.is-local, body[data-theme="dark"] .et-node-ip.is-local, .et-dark .et-node-ip.is-local { fill: #60a5fa !important; }',
		'[data-darkmode="true"] .et-node-circle, [data-theme="dark"] .et-node-circle, [data-mode="dark"] .et-node-circle, .dark .et-node-circle, .theme-dark .et-node-circle, body[data-theme="dark"] .et-node-circle, .et-dark .et-node-circle { fill: #1e293b !important; stroke: #475569 !important; }',
		'[data-darkmode="true"] .et-node-server-rect, [data-theme="dark"] .et-node-server-rect, [data-mode="dark"] .et-node-server-rect, .dark .et-node-server-rect, .theme-dark .et-node-server-rect, body[data-theme="dark"] .et-node-server-rect, .et-dark .et-node-server-rect { fill: #0f172a !important; stroke: #64748b !important; }',
		'[data-darkmode="true"] .et-node-proxy-bg, [data-theme="dark"] .et-node-proxy-bg, [data-mode="dark"] .et-node-proxy-bg, .dark .et-node-proxy-bg, .theme-dark .et-node-proxy-bg, body[data-theme="dark"] .et-node-proxy-bg, .et-dark .et-node-proxy-bg { fill: #064e3b !important; stroke: #059669 !important; }',
		'[data-darkmode="true"] .et-node-proxy-text, [data-theme="dark"] .et-node-proxy-text, [data-mode="dark"] .et-node-proxy-text, .dark .et-node-proxy-text, .theme-dark .et-node-proxy-text, body[data-theme="dark"] .et-node-proxy-text, .et-dark .et-node-proxy-text { fill: #6ee7b7 !important; }',
		'[data-darkmode="true"] .et-badge-rect, [data-theme="dark"] .et-badge-rect, [data-mode="dark"] .et-badge-rect, .dark .et-badge-rect, .theme-dark .et-badge-rect, body[data-theme="dark"] .et-badge-rect, .et-dark .et-badge-rect { fill: #1e293b !important; }',
		'[data-darkmode="true"] .et-topo-container, [data-theme="dark"] .et-topo-container, [data-mode="dark"] .et-topo-container, .dark .et-topo-container, .theme-dark .et-topo-container, body[data-theme="dark"] .et-topo-container, .et-dark.et-topo-container { background-color: #0f172a !important; background-image: radial-gradient(#334155 1.2px, transparent 1.2px) !important; border-color: #334155 !important; }',
		'[data-darkmode="true"] .et-topo-legend, [data-theme="dark"] .et-topo-legend, [data-mode="dark"] .et-topo-legend, .dark .et-topo-legend, .theme-dark .et-topo-legend, body[data-theme="dark"] .et-topo-legend, .et-dark .et-topo-legend { color: #94a3b8 !important; }',
		'[data-darkmode="true"] .et-btn-toolbar, [data-theme="dark"] .et-btn-toolbar, [data-mode="dark"] .et-btn-toolbar, .dark .et-btn-toolbar, .theme-dark .et-btn-toolbar, body[data-theme="dark"] .et-btn-toolbar, .et-dark .et-btn-toolbar { background: rgba(30, 41, 59, 0.95) !important; color: #f1f5f9 !important; border-color: #475569 !important; }',
		'',
		'/* 拓扑图连线防御宿主主题全局样式污染 */',
		'#view div[style] > svg line.et-topo-link, line.et-topo-link { vector-effect: non-scaling-stroke; }',
		'',
		'/* 拓扑图链路流动动画 (自本端流向目标) */',
		'@keyframes et-dash-flow {',
		'    from { stroke-dashoffset: 24px; }',
		'    to { stroke-dashoffset: 0px; }',
		'}',
		'@-webkit-keyframes et-dash-flow {',
		'    from { stroke-dashoffset: 24px; }',
		'    to { stroke-dashoffset: 0px; }',
		'}',
		'.et-path-flowing {',
		'    animation: et-dash-flow 0.85s linear infinite !important;',
		'    -webkit-animation: et-dash-flow 0.85s linear infinite !important;',
		'}'
	].join('\n');
	document.head.appendChild(E('style', { id: 'et_custom_tooltip_style' }, css));
}

function renderPeersTable(peerData) {
	injectTooltipStyle();
	let peers = [];
	if (Array.isArray(peerData)) {
		peers = peerData;
	} else if (peerData && Array.isArray(peerData.peers)) {
		peers = peerData.peers;
	}

	const remotePeers = peers.filter(p => !p.cost || String(p.cost).trim().toLowerCase() !== 'local');

	if (!remotePeers || remotePeers.length === 0) {
		if (peerData && peerData.raw && peerData.raw.length > 0 && peers.length === 0) {
			return E('pre', { 'style': 'padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 350px; font-family: monospace;' }, peerData.raw);
		}
		return E('em', {}, _('No connected remote peers found.'));
	}

	const headers = [
		{ title: _('Virtual IP'), minWidth: '120px' },
		{ title: _('Hostname'), minWidth: '110px' },
		{ title: _('Proxy Networks'), minWidth: '110px' },
		{ title: _('Cost'), minWidth: '70px' },
		{ title: _('Latency / Loss'), minWidth: '100px' },
		{ title: _('RX / TX'), minWidth: '120px' },
		{ title: _('Tunnel'), minWidth: '65px' },
		{ title: _('NAT Type'), minWidth: '100px' },
		{ title: _('Version'), minWidth: '100px' }
	];

	const thStyle = 'padding: 8px 10px; text-align: left; white-space: nowrap; font-weight: bold; vertical-align: middle;';
	const tdStyle = 'padding: 6px 10px; text-align: left; white-space: nowrap; vertical-align: middle;';

	const rows = [
		E('tr', { 'class': 'cbi-table-header' }, headers.map(function(h) {
			return E('th', { 'class': 'cbi-table-cell', 'style': thStyle + (h.minWidth ? (' min-width: ' + h.minWidth + ';') : '') }, h.title);
		}))
	];

	for (let i = 0; i < remotePeers.length; i++) {
		const p = remotePeers[i];
		const costStr = p.cost ? String(p.cost).trim() : '-';
		let costNode = costStr;

		const isRelay = /relay/i.test(costStr);
		const nextHopHost = p.next_hop_hostname ? String(p.next_hop_hostname).trim() : '';
		const nextHopIp = p.next_hop_ipv4 ? String(p.next_hop_ipv4).trim().split('/')[0] : '';
		const hasNextHop = nextHopHost && nextHopHost !== '-' && nextHopHost.toLowerCase() !== 'direct' && nextHopHost.toLowerCase() !== 'local';

		if (isRelay) {
			if (hasNextHop) {
				const tipText = (nextHopIp && nextHopIp !== '-') ?
					('下一跳: ' + nextHopHost + ' (' + nextHopIp + ')') :
					('下一跳: ' + nextHopHost);

				costNode = E('div', { 'class': 'et-tooltip-wrap' }, [
					E('span', {
						'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-weight: 600; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; border-radius: 3px;'
					}, costStr),
					E('div', { 'class': 'et-tooltip-bubble' }, tipText)
				]);
			} else {
				costNode = E('span', {
					'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-weight: 600; color: #b45309; background: #fef3c7; border: 1px solid #fde68a; border-radius: 3px;'
				}, costStr);
			}
		} else if (costStr.toLowerCase() === 'p2p' || costStr.toLowerCase() === 'direct') {
			costNode = E('span', {
				'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-weight: 600; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 3px;'
			}, costStr);
		}

		const latencyVal = p.latency ? String(p.latency).trim() : '-';
		let latencyColor = '#6c757d';
		const latNum = (latencyVal !== '-') ? parseFloat(latencyVal) : NaN;
		if (!isNaN(latNum)) {
			if (latNum > 150) {
				latencyColor = '#d97706';
			} else if (latNum >= 50) {
				latencyColor = '#2563eb';
			} else {
				latencyColor = '#059669';
			}
		}
		const lossVal = p.loss_rate ? String(p.loss_rate).trim() : '-';
		const hasLoss = lossVal !== '-' && lossVal !== '0.0%' && lossVal !== '0%';

		let latLossNode = '-';
		if (latencyVal !== '-') {
			latLossNode = E('div', { 'style': 'display: inline-flex; align-items: baseline; gap: 4px;' }, [
				E('span', { 'style': 'color: ' + latencyColor + '; font-weight: bold;' }, latencyVal + ' ms'),
				hasLoss ? E('span', { 'style': 'color: #dc2626; font-size: 10.5px; font-weight: 600;' }, '(' + lossVal + ')') : null
			].filter(Boolean));
		}

		const rxVal = p.rx ? String(p.rx).trim() : '-';
		const txVal = p.tx ? String(p.tx).trim() : '-';
		const trafficNode = (rxVal === '-' && txVal === '-') ? '-' : E('span', {}, [
			E('span', { 'style': 'color: #047857; font-weight: 500;' }, '↓ ' + rxVal),
			E('span', { 'style': 'color: #94a3b8; margin: 0 4px;' }, '/'),
			E('span', { 'style': 'color: #2563eb; font-weight: 500;' }, '↑ ' + txVal)
		]);

		const proxyNode = renderProxyCidrBadges(p.proxy_cidrs);

		rows.push(E('tr', { 'class': 'cbi-row' }, [
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, E('strong', {}, p.ipv4 ? String(p.ipv4).trim() : '-')),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.hostname ? String(p.hostname).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, proxyNode),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, costNode),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, latLossNode),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, trafficNode),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.tunnel ? String(p.tunnel).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.nat ? String(p.nat).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.version ? String(p.version).trim() : '-')
		]));
	}

	const tableNode = E('table', { 'class': 'cbi-table', 'style': 'width: 100%; border-collapse: separate; border-spacing: 0;' }, rows);
	return E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 4px;' }, tableNode);
}

function renderLogsView(logData) {
	let lines = [];
	if (Array.isArray(logData)) {
		lines = logData;
	} else if (logData && Array.isArray(logData.logs)) {
		lines = logData.logs;
	} else if (typeof logData === 'string') {
		lines = logData.split('\n');
	} else if (logData && typeof logData.logs === 'string') {
		lines = logData.logs.split('\n');
	}

	lines = lines.filter(function(l) {
		return l && String(l).trim().length > 0;
	});

	const logText = (lines.length > 0) ? lines.join('\n') : _('No logs available.');

	const textarea = E('textarea', {
		'class': 'cbi-input-textarea',
		'style': 'width: 100%; height: 450px; font-family: monospace; font-size: 12px; line-height: 1.5; resize: vertical; box-sizing: border-box; padding: 10px; border-radius: 4px;',
		'readonly': 'readonly',
		'wrap': 'off'
	}, logText);

	return E('div', { 'style': 'width: 100%; margin-top: 5px;' }, textarea);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(tag, attrs, children) {
	const el = document.createElementNS(SVG_NS, tag);
	if (attrs) {
		const keys = Object.keys(attrs);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			el.setAttribute(k, attrs[k]);
		}
	}
	if (children) {
		if (Array.isArray(children)) {
			for (let i = 0; i < children.length; i++) {
				if (typeof children[i] === 'string') {
					el.appendChild(document.createTextNode(children[i]));
				} else if (children[i] instanceof Node) {
					el.appendChild(children[i]);
				}
			}
		} else if (typeof children === 'string') {
			el.appendChild(document.createTextNode(children));
		} else if (children instanceof Node) {
			el.appendChild(children);
		}
	}
	return el;
}

// 持久化拓扑图视口平移、缩放及自定义节点拖拽位置（跨定时刷新无缝保持）
const topologyViewState = {
	scale: 1.0,
	panX: 0,
	panY: 0,
	nodePositions: {},
	showAllLinks: false
};

// 计算从圆心 (cx, cy) 射向目标点 (targetX, targetY) 在圆周 (半径 radius) 上的精确交点
function getCircleEdgePoint(cx, cy, targetX, targetY, radius) {
	const dx = targetX - cx;
	const dy = targetY - cy;
	const dist = Math.sqrt(dx * dx + dy * dy);
	if (dist === 0) return { x: cx, y: cy };
	const r = radius + 2;
	return {
		x: Math.round(cx + (dx / dist) * r),
		y: Math.round(cy + (dy / dist) * r)
	};
}

function renderTopologySvg(topoData, peerData) {
	injectTooltipStyle();
	let rawNodes = [];
	if (Array.isArray(topoData)) {
		rawNodes = topoData;
	} else if (topoData && Array.isArray(topoData.nodes)) {
		rawNodes = topoData.nodes;
	}

	// 过滤幽灵节点与无效 IP
	rawNodes = (rawNodes || []).filter(function(n) {
		if (!n) return false;
		const host = n.hostname ? String(n.hostname).trim().toLowerCase() : '';
		const ip = n.ipv4 ? String(n.ipv4).trim() : '';
		if (!host || host === 'unknown') return false;
		if (!ip || ip === '-' || ip === 'null') return false;
		return true;
	});

	if (!rawNodes || rawNodes.length === 0) {
		return E('em', {}, _('No topology data available.'));
	}

	const validNodeIdMap = {};
	for (let i = 0; i < rawNodes.length; i++) {
		if (rawNodes[i].node_id) {
			validNodeIdMap[String(rawNodes[i].node_id)] = true;
		}
	}

	let localIpv4 = '';
	let peers = [];
	if (Array.isArray(peerData)) peers = peerData;
	else if (peerData && Array.isArray(peerData.peers)) peers = peerData.peers;
	for (let i = 0; i < peers.length; i++) {
		if (peers[i].cost && String(peers[i].cost).trim().toLowerCase() === 'local') {
			if (peers[i].ipv4) localIpv4 = String(peers[i].ipv4).trim().split('/')[0];
			break;
		}
	}

	let nodes = [];
	let localNode = null;
	for (let i = 0; i < rawNodes.length; i++) {
		const n = rawNodes[i];
		const nIp = n.ipv4 ? String(n.ipv4).trim().split('/')[0] : '';
		if (localIpv4 && nIp === localIpv4) {
			localNode = n;
		} else {
			nodes.push(n);
		}
	}
	if (localNode) {
		nodes.unshift(localNode);
	}

	const localPeerLatencyMap = {};
	for (let i = 0; i < peers.length; i++) {
		const p = peers[i];
		if (!p.cost || String(p.cost).trim().toLowerCase() === 'local') continue;
		const latVal = parseFloat(p.latency);
		if (!isNaN(latVal) && latVal > 0) {
			const pIp = p.ipv4 ? String(p.ipv4).trim().split('/')[0] : '';
			const pHost = p.hostname ? String(p.hostname).trim() : '';
			if (pIp) localPeerLatencyMap[pIp] = Math.round(latVal);
			if (pHost) localPeerLatencyMap[pHost] = Math.round(latVal);
		}
	}

	const peerRouteInfoMap = {};
	for (let i = 0; i < peers.length; i++) {
		const p = peers[i];
		const pIp = p.ipv4 ? String(p.ipv4).trim().split('/')[0] : '';
		const pHost = p.hostname ? String(p.hostname).trim() : '';
		const nextHopHost = p.next_hop_hostname ? String(p.next_hop_hostname).trim() : '';
		const nextHopIp = p.next_hop_ipv4 ? String(p.next_hop_ipv4).trim().split('/')[0] : '';
		const isRelay = /relay/i.test(p.cost || '');
		const entry = {
			isRelay: isRelay,
			cost: p.cost || '-',
			nextHopHost: nextHopHost,
			nextHopIp: nextHopIp,
			pathLatency: p.path_latency,
			latency: p.latency
		};
		if (pIp) peerRouteInfoMap[pIp] = entry;
		if (pHost) peerRouteInfoMap[pHost] = entry;
	}

	const nodeCount = nodes.length;
	const linkMap = {};
	const showAllLinks = !!topologyViewState.showAllLinks;

	// 生成链路：保留全部对端拓扑连线以支持仅本端模式下的点击路径追踪
	for (let i = 0; i < nodeCount; i++) {
		const src = nodes[i];
		const dPeers = src.direct_peers || [];
		for (let j = 0; j < dPeers.length; j++) {
			const dst = dPeers[j];
			if (!dst.node_id) continue;
			if (!validNodeIdMap[String(dst.node_id)]) continue;
			const dstHost = dst.hostname ? String(dst.hostname).trim().toLowerCase() : '';
			if (dstHost === 'unknown') continue;

			const isLocalLink = localNode && (String(src.node_id) === String(localNode.node_id) || String(dst.node_id) === String(localNode.node_id));

			const pairKey = [src.node_id, dst.node_id].sort().join('---');
			if (!linkMap[pairKey]) {
				linkMap[pairKey] = {
					srcId: src.node_id,
					dstId: dst.node_id,
					isLocalLink: isLocalLink,
					latencies: []
				};
			}
			if (dst.latency_ms !== undefined && dst.latency_ms !== null && !isNaN(dst.latency_ms)) {
				linkMap[pairKey].latencies.push(Number(dst.latency_ms));
			}
		}
	}

	// 智能仲裁链路真实延迟：优先本地实测 RTT
	const linkKeys = Object.keys(linkMap);
	for (let k = 0; k < linkKeys.length; k++) {
		const link = linkMap[linkKeys[k]];
		const isLocal = (localNode && (String(link.srcId) === String(localNode.node_id) || String(link.dstId) === String(localNode.node_id)));
		const otherNodeId = (localNode && String(link.srcId) === String(localNode.node_id)) ? link.dstId : link.srcId;
		const otherNode = nodes.find(function(n) { return String(n.node_id) === String(otherNodeId); });

		let resolvedLat = null;
		if (isLocal && otherNode) {
			const otherIp = otherNode.ipv4 ? String(otherNode.ipv4).trim().split('/')[0] : '';
			const otherHost = otherNode.hostname ? String(otherNode.hostname).trim() : '';
			if (otherIp && localPeerLatencyMap[otherIp] !== undefined) {
				resolvedLat = localPeerLatencyMap[otherIp];
			} else if (otherHost && localPeerLatencyMap[otherHost] !== undefined) {
				resolvedLat = localPeerLatencyMap[otherHost];
			}
		}

		if (resolvedLat === null && link.latencies && link.latencies.length > 0) {
			const validLats = link.latencies.filter(function(v) { return v > 0; });
			if (validLats.length === 1) {
				resolvedLat = validLats[0];
			} else if (validLats.length > 1) {
				const realLats = validLats.filter(function(v) { return v > 2; });
				if (realLats.length > 0) {
					resolvedLat = Math.round(realLats.reduce(function(a, b) { return a + b; }, 0) / realLats.length);
				} else {
					resolvedLat = Math.round(validLats.reduce(function(a, b) { return a + b; }, 0) / validLats.length);
				}
			}
		}
		link.latency = resolvedLat;
	}

	// 标记中继节点与中间跳的连线为树状生成连通链路（isRelayTreeLink）
	for (let i = 0; i < nodeCount; i++) {
		const n = nodes[i];
		const nIp = n.ipv4 ? String(n.ipv4).trim().split('/')[0] : '';
		const nHost = n.hostname ? String(n.hostname).trim() : '';
		const rInfo = peerRouteInfoMap[nIp] || peerRouteInfoMap[nHost];

		if (rInfo && rInfo.isRelay && rInfo.nextHopHost) {
			const midNode = nodes.find(function(m) {
				const mH = m.hostname ? String(m.hostname).trim() : '';
				const mIp = m.ipv4 ? String(m.ipv4).trim().split('/')[0] : '';
				return (mH && mH.toLowerCase() === rInfo.nextHopHost.toLowerCase()) ||
					(rInfo.nextHopIp && mIp === rInfo.nextHopIp.split('/')[0]);
			});

			if (midNode) {
				const relayPairKey = [midNode.node_id, n.node_id].sort().join('---');
				if (linkMap[relayPairKey]) {
					linkMap[relayPairKey].isRelayTreeLink = true;
				}
			}
		}
	}

	// 动态正方形雷达画布尺寸（720 × 720，聚焦舒展）
	const width = 720;
	const height = 720;
	const cx = Math.round(width / 2);
	const cy = Math.round(height / 2);

	// 360° 逆时针延迟比例散射引擎（Counter-Clockwise Latency Proportional Radial Engine）
	const nodeMap = {};
	const simNodes = [];
	let peerNodes = [];
	let localSimNode = null;

	for (let i = 0; i < nodeCount; i++) {
		const n = nodes[i];
		const isLocal = (localNode && String(n.node_id) === String(localNode.node_id));

		let directLat = 999;
		if (!isLocal && localNode) {
			const pairKey = [n.node_id, localNode.node_id].sort().join('---');
			if (linkMap[pairKey] && linkMap[pairKey].latency !== null && linkMap[pairKey].latency !== undefined) {
				directLat = Number(linkMap[pairKey].latency);
			}
		}

		let posX = null;
		let posY = null;
		if (topologyViewState.nodePositions && topologyViewState.nodePositions[n.node_id]) {
			posX = topologyViewState.nodePositions[n.node_id].x;
			posY = topologyViewState.nodePositions[n.node_id].y;
		}

		const sn = {
			id: String(n.node_id),
			node: n,
			x: posX !== null ? posX : cx,
			y: posY !== null ? posY : cy,
			radius: isLocal ? 28 : 24,
			isLocal: isLocal,
			directLat: directLat
		};

		nodeMap[sn.id] = sn;
		simNodes.push(sn);

		if (isLocal) {
			localSimNode = sn;
		} else {
			peerNodes.push(sn);
		}
	}

	// 自动排布：以本节点为中心，按延迟从小到大逆时针 360° 依次等比例散射展开
	const needLayout = simNodes.some(function(sn) {
		return !topologyViewState.nodePositions || !topologyViewState.nodePositions[sn.id];
	});

	if (needLayout) {
		if (localSimNode) {
			localSimNode.x = cx;
			localSimNode.y = cy;
		}

		// 按延迟从小到大排序
		peerNodes.sort(function(a, b) {
			return a.directLat - b.directLat;
		});

		const pCount = peerNodes.length;
		if (pCount > 0) {
			const startAngle = -Math.PI / 2; // 起点：12点钟正上方（最低延迟）
			const stepAngle = (2 * Math.PI) / pCount;

			for (let i = 0; i < pCount; i++) {
				const sn = peerNodes[i];
				const angle = startAngle - i * stepAngle; // 逆时针展开

				// 饱满舒展的星轨微梯度：基准 255px，按延迟轻微起伏（235px ~ 285px）
				let distR = 285;
				if (sn.directLat < 900) {
					if (sn.directLat <= 10) {
						distR = 235;
					} else if (sn.directLat <= 60) {
						distR = 250;
					} else if (sn.directLat <= 150) {
						distR = 268;
					} else {
						distR = 285;
					}
				}

				sn.x = Math.round(cx + distR * Math.cos(angle));
				sn.y = Math.round(cy + distR * Math.sin(angle));
			}
		}

		if (!topologyViewState.nodePositions) topologyViewState.nodePositions = {};
		for (let i = 0; i < nodeCount; i++) {
			const sn = simNodes[i];
			topologyViewState.nodePositions[sn.id] = { x: Math.round(sn.x), y: Math.round(sn.y) };
		}
	}

	const posMap = {};
	for (let i = 0; i < nodeCount; i++) {
		const sn = simNodes[i];
		posMap[sn.id] = {
			x: Math.round(topologyViewState.nodePositions && topologyViewState.nodePositions[sn.id] ? topologyViewState.nodePositions[sn.id].x : sn.x),
			y: Math.round(topologyViewState.nodePositions && topologyViewState.nodePositions[sn.id] ? topologyViewState.nodePositions[sn.id].y : sn.y)
		};
	}

	function getLatencyColor(lat) {
		if (lat === undefined || lat === null || isNaN(Number(lat))) {
			return {
				line: '#94a3b8',
				text: '#64748b',
				dash: '5,5',
				width: '1.5',
				opacity: '0.6'
			};
		}
		const val = Number(lat);
		if (val > 150) {
			return {
				line: '#f59e0b',
				text: '#d97706',
				dash: '5,5',
				width: '1.5',
				opacity: '0.85'
			};
		} else if (val >= 50) {
			return {
				line: '#3b82f6',
				text: '#2563eb',
				dash: '5,5',
				width: '1.5',
				opacity: '0.85'
			};
		} else {
			return {
				line: '#10b981',
				text: '#059669',
				dash: '5,5',
				width: '1.5',
				opacity: '0.9'
			};
		}
	}

	function setLineVisual(el, strokeColor, strokeWidth, dashArray, opacityVal) {
		if (!el) return;
		el.setAttribute('stroke', strokeColor);
		el.style.setProperty('stroke', strokeColor, 'important');
		if (strokeWidth !== undefined && strokeWidth !== null) {
			el.setAttribute('stroke-width', strokeWidth);
			el.style.setProperty('stroke-width', strokeWidth + 'px', 'important');
		}
		if (dashArray !== undefined && dashArray !== null) {
			el.setAttribute('stroke-dasharray', dashArray);
			el.style.setProperty('stroke-dasharray', dashArray, 'important');
		}
		if (opacityVal !== undefined && opacityVal !== null) {
			el.setAttribute('opacity', opacityVal);
			el.style.setProperty('opacity', opacityVal, 'important');
		}
	}

	const lineElementsMap = {};
	const badgeElementsMap = {};
	const nodeElementsMap = {};

	// SVG Defs：矩阵点阵背景网格与高质感阴影
	// SVG Defs：高质感阴影
	const defsNode = createSvg('defs', {}, [
		createSvg('filter', {
			'id': 'node-shadow',
			'x': '-30%',
			'y': '-30%',
			'width': '160%',
			'height': '160%'
		}, [
			createSvg('feDropShadow', {
				'dx': '0',
				'dy': '3',
				'stdDeviation': '4',
				'flood-color': '#0f172a',
				'flood-opacity': '0.12'
			})
		]),
		createSvg('filter', {
			'id': 'node-shadow-active',
			'x': '-50%',
			'y': '-50%',
			'width': '200%',
			'height': '200%'
		}, [
			createSvg('feDropShadow', {
				'dx': '0',
				'dy': '5',
				'stdDeviation': '8',
				'flood-color': '#2563eb',
				'flood-opacity': '0.35'
			})
		])
	]);

	const linesLayer = [];
	const nodesLayer = [];
	const badgesLayer = [];

	let hoveredLinkId = null;
	let hoveredNodeId = null;
	let selectedNodeId = null;

	const pathBanner = E('div', {
		'style': 'position: absolute; top: 12px; left: 12px; display: none; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(15, 23, 42, 0.88); color: #f8fafc; font-size: 11.5px; font-weight: 600; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 10; backdrop-filter: blur(4px);'
	});

	function traceRouteToNode(targetNodeId) {
		const res = {
			activePathLinks: {},
			traceNodes: [],
			pathInfoText: ''
		};
		if (!targetNodeId) return res;

		const targetNode = nodes.find(function(n) { return String(n.node_id) === String(targetNodeId); });
		if (!targetNode) return res;

		const isSelf = localNode && (String(targetNode.node_id) === String(localNode.node_id));
		const selIp = targetNode.ipv4 ? String(targetNode.ipv4).trim().split('/')[0] : '';
		const selHost = targetNode.hostname ? String(targetNode.hostname).trim() : '';
		const rInfo = peerRouteInfoMap[selIp] || peerRouteInfoMap[selHost] || {};

		if (isSelf) {
			res.pathInfoText = _('Local Node: %s').format(selHost || selIp);
			res.traceNodes = [targetNode];
			return res;
		}

		res.traceNodes = [targetNode];
		let curr = targetNode;
		const visited = {};
		visited[String(curr.node_id)] = true;

		while (curr && localNode && String(curr.node_id) !== String(localNode.node_id)) {
			const cIp = curr.ipv4 ? String(curr.ipv4).trim().split('/')[0] : '';
			const cHost = curr.hostname ? String(curr.hostname).trim() : '';
			const cInfo = peerRouteInfoMap[cIp] || peerRouteInfoMap[cHost];

			let nextNode = null;
			if (cInfo && cInfo.isRelay && cInfo.nextHopHost) {
				nextNode = nodes.find(function(m) {
					const mH = m.hostname ? String(m.hostname).trim() : '';
					const mIp = m.ipv4 ? String(m.ipv4).trim().split('/')[0] : '';
					return (mH && mH.toLowerCase() === cInfo.nextHopHost.toLowerCase()) ||
						(cInfo.nextHopIp && mIp === cInfo.nextHopIp.split('/')[0]);
				});
			} else {
				nextNode = localNode;
			}

			if (!nextNode || visited[String(nextNode.node_id)]) {
				if (curr !== localNode && localNode) {
					const fallbackKey = [localNode.node_id, curr.node_id].sort().join('---');
					res.activePathLinks[fallbackKey] = {
						upstreamId: localNode.node_id,
						downstreamId: curr.node_id
					};
					if (!visited[String(localNode.node_id)]) res.traceNodes.unshift(localNode);
				}
				break;
			}

			visited[String(nextNode.node_id)] = true;
			const pKey = [curr.node_id, nextNode.node_id].sort().join('---');
			res.activePathLinks[pKey] = {
				upstreamId: nextNode.node_id,
				downstreamId: curr.node_id
			};

			res.traceNodes.unshift(nextNode);
			curr = nextNode;
		}

		const nodeNames = res.traceNodes.map(function(n) {
			const isNLocal = (localNode && String(n.node_id) === String(localNode.node_id));
			const h = n.hostname ? String(n.hostname).trim() : (n.ipv4 ? String(n.ipv4).trim().split('/')[0] : 'Node');
			return isNLocal ? (h + ' (Local)') : h;
		});

		const latStr = rInfo.pathLatency || rInfo.latency || '-';
		const hopCount = res.traceNodes.length - 1;
		const hopLabel = (hopCount > 1) ? (' (' + hopCount + ' hops · ' + latStr + ' ms)') : (latStr !== '-' ? (' (' + latStr + ' ms)') : '');
		res.pathInfoText = nodeNames.join(' ➔ ') + hopLabel;
		return res;
	}

	function refreshLinkVisuals() {
		const activeTargetId = selectedNodeId || hoveredNodeId;
		const isFocusSelf = localNode && activeTargetId && (String(activeTargetId) === String(localNode.node_id));
		const routeData = (!isFocusSelf && activeTargetId) ? traceRouteToNode(activeTargetId) : { activePathLinks: {}, traceNodes: [], pathInfoText: '' };
		const activePathLinks = routeData.activePathLinks;
		let pathInfoText = routeData.pathInfoText;
		if (isFocusSelf) {
			const selfHost = localNode.hostname ? String(localNode.hostname).trim() : (localNode.ipv4 || 'Local');
			pathInfoText = _('Local Node: %s').format(selfHost);
		}

		// 更新路径横幅
		if (pathInfoText && activeTargetId) {
			pathBanner.style.display = 'flex';
			const bannerChildren = [
				E('span', { 'style': 'color: #94a3b8; margin-right: 2px;' }, _('Path') + ':'),
				E('span', { 'style': 'color: #f8fafc;' }, pathInfoText)
			];
			if (selectedNodeId) {
				bannerChildren.push(
					E('button', {
						'type': 'button',
						'title': _('Clear selection'),
						'style': 'margin-left: 6px; padding: 0 4px; background: transparent; border: none; color: #94a3b8; font-size: 13px; cursor: pointer;',
						'click': function(ev) {
							ev.stopPropagation();
							selectedNodeId = null;
							refreshLinkVisuals();
						}
					}, '×')
				);
			}
			pathBanner.replaceChildren.apply(pathBanner, bannerChildren);
		} else {
			pathBanner.style.display = 'none';
		}

		const hasActivePath = Object.keys(activePathLinks).length > 0;

		// 更新所有链路显示
		for (let k = 0; k < linkKeys.length; k++) {
			const lk = linkKeys[k];
			const link = linkMap[lk];
			const lineEl = lineElementsMap[lk];
			const badgeEl = badgeElementsMap[lk];
			if (!lineEl) continue;

			const isTreeLink = link.isLocalLink || link.isRelayTreeLink;
			const isRelayTree = link.isRelayTreeLink;
			const colorCfg = getLatencyColor(link.latency);
			const pathLinkInfo = activePathLinks[lk];

			if (hasActivePath) {
				if (pathLinkInfo) {
					// 路径上的链路：统一高亮、加粗、流动虚线动画，方向严格从上游流向下游目标
					lineEl.style.display = '';
					setLineVisual(lineEl, '#f59e0b', '3.2', '8,4', '1.0');
					lineEl.setAttribute('stroke-linecap', 'round');

					const snUp = nodeMap[String(pathLinkInfo.upstreamId)];
					const snDown = nodeMap[String(pathLinkInfo.downstreamId)];
					const pUp = posMap[String(pathLinkInfo.upstreamId)];
					const pDown = posMap[String(pathLinkInfo.downstreamId)];
					if (snUp && snDown && pUp && pDown) {
						const startPt = getCircleEdgePoint(pUp.x, pUp.y, pDown.x, pDown.y, snUp.radius);
						const endPt = getCircleEdgePoint(pDown.x, pDown.y, pUp.x, pUp.y, snDown.radius);
						lineEl.setAttribute('x1', startPt.x);
						lineEl.setAttribute('y1', startPt.y);
						lineEl.setAttribute('x2', endPt.x);
						lineEl.setAttribute('y2', endPt.y);
					}

					lineEl.classList.add('et-path-flowing');
					if (badgeEl) {
						badgeEl.style.display = '';
						badgeEl.style.opacity = '1.0';
					}
				} else {
					lineEl.classList.remove('et-path-flowing');
					lineEl.setAttribute('x1', lineEl._origX1);
					lineEl.setAttribute('y1', lineEl._origY1);
					lineEl.setAttribute('x2', lineEl._origX2);
					lineEl.setAttribute('y2', lineEl._origY2);

					if (!showAllLinks && !isTreeLink) {
						lineEl.style.display = 'none';
						if (badgeEl) badgeEl.style.display = 'none';
					} else {
						lineEl.style.display = '';
						setLineVisual(lineEl, colorCfg.line, '1.0', colorCfg.dash, '0.08');
						if (badgeEl) {
							badgeEl.style.display = '';
							badgeEl.style.opacity = '0.08';
						}
					}
				}
			} else {
				// 未激活路径：恢复原始几何坐标与无流动类
				lineEl.classList.remove('et-path-flowing');
				lineEl.setAttribute('x1', lineEl._origX1);
				lineEl.setAttribute('y1', lineEl._origY1);
				lineEl.setAttribute('x2', lineEl._origX2);
				lineEl.setAttribute('y2', lineEl._origY2);

				const isHoverFocused = (hoveredLinkId === lk) ||
					(hoveredNodeId && (String(link.srcId) === String(hoveredNodeId) || String(link.dstId) === String(hoveredNodeId)));

				if (!showAllLinks && !isTreeLink) {
					lineEl.style.display = 'none';
					if (badgeEl) badgeEl.style.display = 'none';
				} else {
					lineEl.style.display = '';
					if (badgeEl) badgeEl.style.display = '';

					if (isHoverFocused) {
						setLineVisual(lineEl, isRelayTree ? '#f59e0b' : colorCfg.line, '2.8', isRelayTree ? '6,4' : 'none', '1.0');
						if (badgeEl) badgeEl.style.opacity = '1.0';
					} else if (hoveredLinkId !== null || hoveredNodeId !== null) {
						setLineVisual(lineEl, isRelayTree ? '#f59e0b' : colorCfg.line, '1.2', colorCfg.dash, '0.12');
						if (badgeEl) badgeEl.style.opacity = '0.12';
					} else {
						setLineVisual(lineEl, isRelayTree ? '#f59e0b' : colorCfg.line, isRelayTree ? '1.8' : colorCfg.width, isRelayTree ? '5,4' : colorCfg.dash, isRelayTree ? '0.9' : colorCfg.opacity);
						if (badgeEl) badgeEl.style.opacity = '0.9';
					}
				}
			}
		}

		// 更新节点透明度
		for (let i = 0; i < nodeCount; i++) {
			const n = nodes[i];
			const cardG = nodeElementsMap[String(n.node_id)];
			if (!cardG) continue;

			if (hasActivePath) {
				const isSelected = (String(n.node_id) === String(selectedNodeId));
				const isTarget = (String(n.node_id) === String(activeTargetId));
				const isPathNode = isTarget ||
					(localNode && String(n.node_id) === String(localNode.node_id)) ||
					(Object.keys(activePathLinks).some(function(pk) {
						const pl = linkMap[pk];
						return pl && (String(pl.srcId) === String(n.node_id) || String(pl.dstId) === String(n.node_id));
					}));

				if (isPathNode) {
					cardG.style.opacity = '1.0';
					cardG.firstElementChild.setAttribute('filter', isTarget ? 'url(#node-shadow-active)' : 'url(#node-shadow)');
				} else {
					cardG.style.opacity = '0.35';
					cardG.firstElementChild.setAttribute('filter', 'url(#node-shadow)');
				}
			} else {
				cardG.style.opacity = '1.0';
				cardG.firstElementChild.setAttribute('filter', 'url(#node-shadow)');
			}
		}
	}

	// 1. 绘制链路连线（纯净细腻虚线，交互悬停高亮）
	for (let k = 0; k < linkKeys.length; k++) {
		const linkKey = linkKeys[k];
		const link = linkMap[linkKey];
		const p1 = posMap[String(link.srcId)];
		const p2 = posMap[String(link.dstId)];
		const sn1 = nodeMap[String(link.srcId)];
		const sn2 = nodeMap[String(link.dstId)];
		if (!p1 || !p2 || !sn1 || !sn2) continue;

		const startPt = getCircleEdgePoint(p1.x, p1.y, p2.x, p2.y, sn1.radius);
		const endPt = getCircleEdgePoint(p2.x, p2.y, p1.x, p1.y, sn2.radius);
		const colorCfg = getLatencyColor(link.latency);
		const isTreeLink = link.isLocalLink || link.isRelayTreeLink;
		const isRelayTree = link.isRelayTreeLink;
		const initDisplay = (!showAllLinks && !isTreeLink) ? 'none' : '';

		const lineInitStroke = isRelayTree ? '#f59e0b' : colorCfg.line;
		const lineInitWidth = isRelayTree ? '1.8' : colorCfg.width;
		const lineInitDash = isRelayTree ? '5,4' : colorCfg.dash;
		const lineInitOpacity = isRelayTree ? '0.9' : colorCfg.opacity;

		const lineSvg = createSvg('line', {
			'x1': startPt.x, 'y1': startPt.y,
			'x2': endPt.x, 'y2': endPt.y,
			'stroke': lineInitStroke,
			'stroke-width': lineInitWidth,
			'stroke-dasharray': lineInitDash,
			'stroke-linecap': 'round',
			'opacity': lineInitOpacity,
			'class': 'et-topo-link',
			'style': 'transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; display: ' + initDisplay + ';'
		});
		setLineVisual(lineSvg, lineInitStroke, lineInitWidth, lineInitDash, lineInitOpacity);
		lineSvg._origX1 = startPt.x;
		lineSvg._origY1 = startPt.y;
		lineSvg._origX2 = endPt.x;
		lineSvg._origY2 = endPt.y;

		(function(lk) {
			lineSvg.addEventListener('mouseenter', function() {
				hoveredLinkId = lk;
				refreshLinkVisuals();
			});
			lineSvg.addEventListener('mouseleave', function() {
				if (hoveredLinkId === lk) {
					hoveredLinkId = null;
					refreshLinkVisuals();
				}
			});
		})(linkKey);

		lineElementsMap[linkKey] = lineSvg;
		linesLayer.push(lineSvg);
	}

	// 2. 绘制圆形科技节点（支持自由拖拽与双翼规整）
	let activeDraggingNodeId = null;
	let mouseStartX = 0;
	let mouseStartY = 0;

	const isDark = isThemeDark();

	for (let i = 0; i < nodeCount; i++) {
		const n = nodes[i];
		const sn = nodeMap[String(n.node_id)];
		const pos = posMap[String(n.node_id)];
		if (!pos || !sn) continue;

		const proxyList = (n.proxy_cidrs && String(n.proxy_cidrs).trim() !== '') ?
			String(n.proxy_cidrs).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; }) : [];
		const proxyCount = proxyList.length;

		const isSelf = sn.isLocal;
		const hostname = n.hostname ? String(n.hostname).trim() : 'Unknown';
		const ipv4 = n.ipv4 ? String(n.ipv4).trim() : '-';
		const titleStr = isSelf ? (hostname + ' (Local)') : hostname;

		const nodeR = sn.radius;
		const circleColor = isSelf ? '#2563eb' : (isDark ? '#1e293b' : '#ffffff');
		const circleBorder = isSelf ? '#1d4ed8' : (isDark ? '#475569' : '#94a3b8');
		const borderWidth = isSelf ? '2.5' : '2';

		const gChildren = [];

		// 本端脉冲外光环
		if (isSelf) {
			gChildren.push(createSvg('circle', {
				'r': '34',
				'fill': 'none',
				'stroke': '#3b82f6',
				'stroke-width': '1.5',
				'stroke-dasharray': '4,3',
				'opacity': '0.75'
			}));
		}

		// 核心圆形徽标
		gChildren.push(createSvg('circle', {
			'r': nodeR,
			'fill': circleColor,
			'stroke': circleBorder,
			'stroke-width': borderWidth,
			'filter': 'url(#node-shadow)',
			'class': 'et-node-circle' + (isSelf ? ' is-local' : '')
		}));

		// 精致矢量图标
		if (isSelf) {
			gChildren.push(
				createSvg('path', {
					'd': 'M -9 -2 L 9 -2 L 7 7 L -7 7 Z',
					'fill': 'none',
					'stroke': '#ffffff',
					'stroke-width': '1.8',
					'stroke-linejoin': 'round'
				}),
				createSvg('circle', { 'cx': '-4', 'cy': '2.5', 'r': '1', 'fill': '#ffffff' }),
				createSvg('circle', { 'cx': '0', 'cy': '2.5', 'r': '1', 'fill': '#ffffff' }),
				createSvg('circle', { 'cx': '4', 'cy': '2.5', 'r': '1', 'fill': '#ffffff' }),
				createSvg('line', { 'x1': '-5', 'y1': '-2', 'x2': '-8', 'y2': '-8', 'stroke': '#ffffff', 'stroke-width': '1.8', 'stroke-linecap': 'round' }),
				createSvg('line', { 'x1': '5', 'y1': '-2', 'x2': '8', 'y2': '-8', 'stroke': '#ffffff', 'stroke-width': '1.8', 'stroke-linecap': 'round' })
			);
		} else {
			gChildren.push(
				createSvg('rect', { 'x': '-9', 'y': '-8', 'width': '18', 'height': '6.5', 'rx': '1.5', 'fill': isDark ? '#0f172a' : '#f8fafc', 'stroke': isDark ? '#64748b' : '#475569', 'stroke-width': '1.5', 'class': 'et-node-server-rect' }),
				createSvg('rect', { 'x': '-9', 'y': '1.5', 'width': '18', 'height': '6.5', 'rx': '1.5', 'fill': isDark ? '#0f172a' : '#f8fafc', 'stroke': isDark ? '#64748b' : '#475569', 'stroke-width': '1.5', 'class': 'et-node-server-rect' }),
				createSvg('circle', { 'cx': '5', 'cy': '-4.7', 'r': '1', 'fill': '#10b981' }),
				createSvg('circle', { 'cx': '5', 'cy': '4.8', 'r': '1', 'fill': '#10b981' })
			);
			gChildren.push(createSvg('circle', {
				'cx': '16',
				'cy': '-16',
				'r': '4',
				'fill': '#10b981',
				'stroke': '#ffffff',
				'stroke-width': '1.5'
			}));
		}

		// 下方文字标签（主机名 + 虚拟 IP）
		const titleColor = isDark ? (isSelf ? '#93c5fd' : '#f8fafc') : (isSelf ? '#1e3a8a' : '#0f172a');
		const ipColor = isDark ? (isSelf ? '#60a5fa' : '#94a3b8') : (isSelf ? '#2563eb' : '#64748b');

		gChildren.push(
			createSvg('text', {
				'x': 0,
				'y': nodeR + 15,
				'text-anchor': 'middle',
				'font-family': 'sans-serif',
				'font-size': '11.5',
				'font-weight': isSelf ? 'bold' : '600',
				'fill': titleColor,
				'class': 'et-node-title' + (isSelf ? ' is-local' : '')
			}, titleStr),
			createSvg('text', {
				'x': 0,
				'y': nodeR + 29,
				'text-anchor': 'middle',
				'font-family': 'monospace, sans-serif',
				'font-size': '10',
				'font-weight': isSelf ? 'bold' : 'normal',
				'fill': ipColor,
				'class': 'et-node-ip' + (isSelf ? ' is-local' : '')
			}, ipv4)
		);

		// 代理子网标签
		if (proxyCount > 0) {
			for (let pIdx = 0; pIdx < proxyCount; pIdx++) {
				const badgeY = nodeR + 35 + pIdx * 16;
				const labelText = proxyList[pIdx];
				const bw = Math.max(90, labelText.length * 6.5 + 12);
				gChildren.push(
					createSvg('rect', {
						'x': -bw / 2,
						'y': badgeY,
						'width': bw,
						'height': '14',
						'rx': '3',
						'fill': '#ecfdf5',
						'stroke': '#a7f3d0',
						'stroke-width': '1',
						'class': 'et-node-proxy-bg'
					}),
					createSvg('text', {
						'x': 0,
						'y': badgeY + 10,
						'text-anchor': 'middle',
						'font-family': 'monospace, sans-serif',
						'font-size': '9',
						'font-weight': '600',
						'fill': '#047857',
						'class': 'et-node-proxy-text'
					}, labelText)
				);
			}
		}

		const cardG = createSvg('g', {
			'transform': 'translate(' + pos.x + ',' + pos.y + ')',
			'style': 'cursor: pointer; user-select: none; transition: filter 0.15s;'
		}, gChildren);

		// 节点鼠标交互
		(function(nodeId, gEl) {
			let isDragMoved = false;
			gEl.addEventListener('mouseenter', function() {
				if (!activeDraggingNodeId) {
					hoveredNodeId = nodeId;
					refreshLinkVisuals();
				}
			});
			gEl.addEventListener('mouseleave', function() {
				if (!activeDraggingNodeId && hoveredNodeId === nodeId) {
					hoveredNodeId = null;
					refreshLinkVisuals();
				}
			});
			gEl.addEventListener('mousedown', function(ev) {
				if (ev.button !== 0) return;
				ev.stopPropagation();
				activeDraggingNodeId = nodeId;
				isDragMoved = false;
				mouseStartX = ev.clientX;
				mouseStartY = ev.clientY;
				gEl.style.cursor = 'grabbing';
				gEl.firstElementChild.setAttribute('filter', 'url(#node-shadow-active)');
			});
			gEl.addEventListener('click', function(ev) {
				ev.stopPropagation();
				if (isDragMoved) return;
				if (selectedNodeId === nodeId) {
					selectedNodeId = null;
				} else {
					selectedNodeId = nodeId;
				}
				refreshLinkVisuals();
			});
		})(n.node_id, cardG);

		nodeElementsMap[String(n.node_id)] = cardG;
		nodesLayer.push(cardG);
	}

	// 3. 绘制延迟标签（微胶囊，鼠标悬停时弹出高亮）
	for (let k = 0; k < linkKeys.length; k++) {
		const linkKey = linkKeys[k];
		const link = linkMap[linkKey];
		const p1 = posMap[String(link.srcId)];
		const p2 = posMap[String(link.dstId)];
		const sn1 = nodeMap[String(link.srcId)];
		const sn2 = nodeMap[String(link.dstId)];
		if (!p1 || !p2 || !sn1 || !sn2) continue;

		const lat = link.latency;
		if (lat !== undefined && lat !== null) {
			const startPt = getCircleEdgePoint(p1.x, p1.y, p2.x, p2.y, sn1.radius);
			const endPt = getCircleEdgePoint(p2.x, p2.y, p1.x, p1.y, sn2.radius);
			const mx = Math.round((startPt.x + endPt.x) / 2);
			const my = Math.round((startPt.y + endPt.y) / 2);

			const colorCfg = getLatencyColor(lat);
			const labelStr = lat + ' ms';

			const textSvg = createSvg('text', {
				'x': 0,
				'y': 4,
				'text-anchor': 'middle',
				'font-family': 'monospace, sans-serif',
				'font-size': '11',
				'font-weight': '700',
				'fill': colorCfg.text
			}, labelStr);

			const isTreeLink = link.isLocalLink || link.isRelayTreeLink;
			const initDisplay = (!showAllLinks && !isTreeLink) ? 'none' : '';
			const badgeW = 56;
			const badgeH = 18;

			const badgeG = createSvg('g', {
				'transform': 'translate(' + mx + ',' + my + ')',
				'style': 'cursor: pointer; opacity: 0.9; transition: opacity 0.2s; display: ' + initDisplay + ';'
			}, [
				createSvg('rect', {
					'x': -badgeW / 2,
					'y': -badgeH / 2,
					'width': badgeW,
					'height': badgeH,
					'rx': '9',
					'fill': '#ffffff',
					'stroke': colorCfg.line,
					'stroke-width': '1.2',
					'filter': 'url(#node-shadow)',
					'class': 'et-badge-rect'
				}),
				textSvg
			]);

			(function(lk) {
				badgeG.addEventListener('mouseenter', function() {
					hoveredLinkId = lk;
					refreshLinkVisuals();
				});
				badgeG.addEventListener('mouseleave', function() {
					if (hoveredLinkId === lk) {
						hoveredLinkId = null;
						refreshLinkVisuals();
					}
				});
			})(linkKey);

			badgeElementsMap[linkKey] = badgeG;
			badgesLayer.push(badgeG);
		}
	}

	// 动态更新任意边几何位置
	function updateEdgeGeometry(linkKey) {
		const link = linkMap[linkKey];
		if (!link) return;
		const p1 = posMap[String(link.srcId)];
		const p2 = posMap[String(link.dstId)];
		const sn1 = nodeMap[String(link.srcId)];
		const sn2 = nodeMap[String(link.dstId)];
		if (!p1 || !p2 || !sn1 || !sn2) return;

		const startPt = getCircleEdgePoint(p1.x, p1.y, p2.x, p2.y, sn1.radius);
		const endPt = getCircleEdgePoint(p2.x, p2.y, p1.x, p1.y, sn2.radius);

		const lineEl = lineElementsMap[linkKey];
		if (lineEl) {
			lineEl.setAttribute('x1', startPt.x);
			lineEl.setAttribute('y1', startPt.y);
			lineEl.setAttribute('x2', endPt.x);
			lineEl.setAttribute('y2', endPt.y);
			lineEl._origX1 = startPt.x;
			lineEl._origY1 = startPt.y;
			lineEl._origX2 = endPt.x;
			lineEl._origY2 = endPt.y;
		}

		const badgeEl = badgeElementsMap[linkKey];
		if (badgeEl) {
			const mx = Math.round((startPt.x + endPt.x) / 2);
			const my = Math.round((startPt.y + endPt.y) / 2);
			badgeEl.setAttribute('transform', 'translate(' + mx + ',' + my + ')');
		}
	}

	const allElements = [defsNode].concat(linesLayer, badgesLayer, nodesLayer);

	const svgNode = createSvg('svg', {
		'id': 'easytier-topo-svg',
		'viewBox': '0 0 ' + width + ' ' + height,
		'style': 'width: 100%; height: 100%; display: block; margin: 0 auto; user-select: none; background: transparent; cursor: default;'
	}, allElements);

	let currentScale = topologyViewState.scale || 1.0;
	let panX = topologyViewState.panX || 0;
	let panY = topologyViewState.panY || 0;
	let isCanvasDragging = false;
	let canvasDragStartX = 0;
	let canvasDragStartY = 0;

	function applyViewBox() {
		topologyViewState.scale = currentScale;
		topologyViewState.panX = panX;
		topologyViewState.panY = panY;
		const vbW = width / currentScale;
		const vbH = height / currentScale;
		const vbX = (width - vbW) / 2 - (panX / currentScale);
		const vbY = (height - vbH) / 2 - (panY / currentScale);
		svgNode.setAttribute('viewBox', Math.round(vbX) + ' ' + Math.round(vbY) + ' ' + Math.round(vbW) + ' ' + Math.round(vbH));
	}

	applyViewBox();
	refreshLinkVisuals();

	svgNode.addEventListener('wheel', function(ev) {
		ev.preventDefault();
		const zoomFactor = ev.deltaY < 0 ? 1.15 : 0.85;
		currentScale = Math.min(3.5, Math.max(0.35, currentScale * zoomFactor));
		applyViewBox();
	}, { passive: false });

	svgNode.addEventListener('mousedown', function(ev) {
		if (ev.button !== 0) return;
		if (activeDraggingNodeId) return;
		isCanvasDragging = true;
		canvasDragStartX = ev.clientX - panX;
		canvasDragStartY = ev.clientY - panY;
		svgNode.style.cursor = 'grabbing';
	});

	window.addEventListener('mousemove', function(ev) {
		// 1. 处理节点自由拖拽
		if (activeDraggingNodeId) {
			const dx = (ev.clientX - mouseStartX) / currentScale;
			const dy = (ev.clientY - mouseStartY) / currentScale;
			mouseStartX = ev.clientX;
			mouseStartY = ev.clientY;

			const pos = posMap[activeDraggingNodeId];
			if (pos) {
				pos.x = Math.round(pos.x + dx);
				pos.y = Math.round(pos.y + dy);
				if (!topologyViewState.nodePositions) topologyViewState.nodePositions = {};
				topologyViewState.nodePositions[activeDraggingNodeId] = { x: pos.x, y: pos.y };

				const cardEl = nodeElementsMap[activeDraggingNodeId];
				if (cardEl) {
					cardEl.setAttribute('transform', 'translate(' + pos.x + ',' + pos.y + ')');
				}

				for (let k = 0; k < linkKeys.length; k++) {
					const lk = linkMap[linkKeys[k]];
					if (String(lk.srcId) === String(activeDraggingNodeId) || String(lk.dstId) === String(activeDraggingNodeId)) {
						updateEdgeGeometry(linkKeys[k]);
					}
				}
			}
			return;
		}

		// 2. 处理画布平移
		if (isCanvasDragging) {
			panX = ev.clientX - canvasDragStartX;
			panY = ev.clientY - canvasDragStartY;
			applyViewBox();
		}
	});

	window.addEventListener('mouseup', function() {
		if (activeDraggingNodeId) {
			const cardEl = nodeElementsMap[activeDraggingNodeId];
			if (cardEl) {
				cardEl.style.cursor = 'pointer';
				cardEl.firstElementChild.setAttribute('filter', 'url(#node-shadow)');
			}
			activeDraggingNodeId = null;
		}
		if (isCanvasDragging) {
			isCanvasDragging = false;
			svgNode.style.cursor = 'default';
		}
	});

	const btnStyle = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; font-size: 14px; font-weight: bold; border-radius: 4px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); cursor: pointer; user-select: none; transition: all 0.15s;';
	
	const zoomInBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button et-btn-toolbar',
		'style': btnStyle,
		'title': _('Zoom In'),
		'click': function(ev) {
			ev.preventDefault();
			currentScale = Math.min(3.5, currentScale * 1.25);
			applyViewBox();
		}
	}, '+');

	const zoomOutBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button et-btn-toolbar',
		'style': btnStyle,
		'title': _('Zoom Out'),
		'click': function(ev) {
			ev.preventDefault();
			currentScale = Math.max(0.35, currentScale * 0.8);
			applyViewBox();
		}
	}, '−');

	const resetBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button et-btn-toolbar',
		'style': btnStyle + ' width: auto; padding: 0 8px; font-size: 11px;',
		'title': _('Reset View'),
		'click': function(ev) {
			ev.preventDefault();
			currentScale = 1.0;
			panX = 0;
			panY = 0;
			applyViewBox();
		}
	}, '1:1');

	const resetLayoutBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button et-btn-toolbar',
		'style': btnStyle + ' width: auto; padding: 0 8px; font-size: 13px;',
		'title': _('Reset Layout'),
		'click': function(ev) {
			ev.preventDefault();
			topologyViewState.nodePositions = {};
			topologyViewState.scale = 1.0;
			topologyViewState.panX = 0;
			topologyViewState.panY = 0;
			const display = document.getElementById('easytier_topology_display');
			if (display) {
				display.replaceChildren(renderTopologySvg(topoData, peerData));
			}
		}
	}, '⟲');

	const toggleLinksBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button et-btn-toolbar' + (showAllLinks ? ' cbi-button-action' : ''),
		'style': btnStyle + ' width: auto; padding: 0 10px; font-size: 12px;' + (showAllLinks ? ' background: #2563eb !important; color: #ffffff !important; border-color: #1d4ed8 !important;' : ''),
		'title': showAllLinks ? _('Show Local Links Only') : _('Show All Peer Links'),
		'click': function(ev) {
			ev.preventDefault();
			topologyViewState.showAllLinks = !topologyViewState.showAllLinks;
			const display = document.getElementById('easytier_topology_display');
			if (display) {
				display.replaceChildren(renderTopologySvg(topoData, peerData));
			}
		}
	}, showAllLinks ? _('All Links') : _('Local Only'));

	const toolbar = E('div', {
		'style': 'position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; z-index: 10;'
	}, [toggleLinksBtn, zoomInBtn, zoomOutBtn, resetBtn, resetLayoutBtn]);

	svgNode.addEventListener('click', function(ev) {
		if (selectedNodeId) {
			selectedNodeId = null;
			refreshLinkVisuals();
		}
	});

	const graphContainer = E('div', {
		'class': 'et-topo-container' + (isDark ? ' et-dark' : ''),
		'style': 'position: relative; width: 100%; aspect-ratio: 1 / 1; min-height: 540px; max-height: 680px; overflow: hidden; background-size: 24px 24px; border: 1px solid #e2e8f0; border-radius: 6px;'
	}, [pathBanner, toolbar, svgNode]);

	const legend = E('div', {
		'class': 'et-topo-legend' + (isDark ? ' et-dark' : ''),
		'style': 'text-align: center; margin-top: 10px; font-size: 12px; line-height: 1.6;'
	}, [
		E('span', { 'style': 'display: inline-block; width: 16px; height: 3px; background: #10b981; border-radius: 2px; margin-right: 5px; vertical-align: middle;' }),
		_('< 50ms (Optimal)'),
		'   ',
		E('span', { 'style': 'display: inline-block; width: 16px; height: 3px; background: #3b82f6; border-radius: 2px; margin-left: 14px; margin-right: 5px; vertical-align: middle;' }),
		_('50 ~ 150ms (Good)'),
		'   ',
		E('span', { 'style': 'display: inline-block; width: 16px; height: 3px; background: #f59e0b; border-radius: 2px; margin-left: 14px; margin-right: 5px; vertical-align: middle;' }),
		_('> 150ms (Fair)'),
		'   ',
		E('span', { 'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-family: monospace; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 3px; margin-left: 14px; vertical-align: middle;' }, 'CIDR'),
		E('span', { 'style': 'margin-left: 4px; vertical-align: middle;' }, _('Proxy Network')),
		E('span', { 'style': 'margin-left: 16px; color: #94a3b8; font-size: 11px; vertical-align: middle;' }, _('(Hover/click node to trace path, drag to adjust)'))
	]);

	return E('div', {
		'style': 'width: 100%; border: 1px solid #e5e5e5; border-radius: 6px; padding: 15px; box-sizing: border-box; margin-top: 5px;'
	}, [graphContainer, legend]);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callGetStatus(), {}),
			L.resolveDefault(callGetPeers(), {}),
			uci.load('easytier'),
			L.resolveDefault(callGetSubroutes(), { routes: [] })
		]);
	},

	render: function(data) {
		const status = data[0] || {};
		const peerData = data[1] || {};
		const subroutesData = data[3] || {};
		const subroutes = (subroutesData && Array.isArray(subroutesData.routes)) ? subroutesData.routes : (Array.isArray(subroutesData) ? subroutesData : []);

		const map = new form.Map('easytier', _('EasyTier'),
			_('EasyTier is a simple, secure, decentralized mesh VPN for intranet penetration, implemented in Rust.')
		);

		// ==================== Tab 1: Overview & Peers ====================
		const s_overview = map.section(form.NamedSection, '_status', '_status');
		s_overview.anonymous = true;
		s_overview.render = function() {
			poll.add(function() {
				return Promise.all([
					L.resolveDefault(callGetStatus(), {}),
					L.resolveDefault(callGetPeers(), {}),
					L.resolveDefault(callGetTopology(), {})
				]).then(function(res) {
					const curStatus = res[0] || {};
					const curPeers = res[1] || {};
					const curTopo = res[2] || {};

					const statusContainer = document.getElementById('easytier_service_status_display');
					if (statusContainer) {
						statusContainer.replaceChildren(
							renderCoreStatus(curStatus.core),
							renderWebStatus(curStatus.web, curStatus.web_installed)
						);
					}

					const localNodeContainer = document.getElementById('easytier_local_node_display');
					if (localNodeContainer) {
						localNodeContainer.replaceChildren(renderLocalNodeInfo(curPeers));
					}

					const peersContainer = document.getElementById('easytier_peers_display');
					if (peersContainer) {
						peersContainer.replaceChildren(renderPeersTable(curPeers));
					}

					const topoContainer = document.getElementById('easytier_topology_display');
					if (topoContainer) {
						topoContainer.replaceChildren(renderTopologySvg(curTopo, curPeers));
					}
				});
			}, 5);

			return E('div', {}, [
				E('hr', { 'style': 'margin: 5px 0 15px 0; border: 0; border-top: 1px solid #e5e5e5;' }),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Service Status')),
					E('div', { 'id': 'easytier_service_status_display' }, [
						renderCoreStatus(status.core),
						renderWebStatus(status.web, status.web_installed)
					])
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Local Node Information')),
					E('div', { 'id': 'easytier_local_node_display' }, renderLocalNodeInfo(peerData))
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('h3', { 'style': 'margin: 0;' }, _('Connected Peer Nodes')),
						E('button', {
							'class': 'btn cbi-button cbi-button-action',
							'click': function(ev) {
								const localContainer = document.getElementById('easytier_local_node_display');
								const peersContainer = document.getElementById('easytier_peers_display');
								if (peersContainer) {
									peersContainer.replaceChildren(E('em', {}, _('Collecting data ...')));
								}
								return callGetPeers().then(function(res) {
									if (localContainer) {
										localContainer.replaceChildren(renderLocalNodeInfo(res));
									}
									if (peersContainer) {
										peersContainer.replaceChildren(renderPeersTable(res));
									}
								}).catch(function(err) {
									ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load peers: %s').format(err.message || err)) ], 5000, 'error');
								});
							}
						}, _('Refresh'))
					]),
					E('div', { 'id': 'easytier_peers_display' }, renderPeersTable(peerData))
				])
			]);
		};

		// ==================== Tab 2: Settings ====================
		const s = map.section(form.NamedSection, 'settings', 'easytier', _('Settings'));
		s.tab('general', _('Core Settings'));
		s.tab('advanced', _('Advanced Options'));
		if (status.web_installed !== false) {
			s.tab('web', _('Web Console'));
		}
		s.tab('topology', _('Network Topology'));
		s.tab('logs', _('Logs'));

		// --- Core Settings ---
		let o;
		o = s.taboption('general', form.Flag, 'enabled', _('Enable Core Service'));
		o.rmempty = false;

		function cleanHiddenErrors(rootNode) {
			const node = rootNode || document.querySelector('.cbi-map') || document.body;
			if (!node || (rootNode && !rootNode.isConnected)) return;
			let changed = false;
			node.querySelectorAll('.cbi-input-invalid').forEach(function(el) {
				if (el.offsetParent === null || window.getComputedStyle(el).display === 'none' || el.closest('[style*="display: none"]')) {
					el.classList.remove('cbi-input-invalid');
					el.removeAttribute('aria-invalid');
					const parent = el.closest('.cbi-value');
					if (parent) parent.classList.remove('cbi-value-error');
					changed = true;
				}
			});
			if (changed && window.ui && typeof ui.updateTabs === 'function') {
				ui.updateTabs(null, node);
			}
		}

		o = s.taboption('general', form.ListValue, 'etcmd', _('Startup Method'));
		o.value('etcmd', _('Command-line'));
		o.value('config', _('Configuration File'));
		o.value('web', _('Cloud Web Config'));
		o.default = 'etcmd';
		o.onchange = function(ev, section_id, value) {
			const mapNode = this.map.node || document.querySelector('.cbi-map') || document.body;
			cleanHiddenErrors(mapNode);
			window.requestAnimationFrame(function() { cleanHiddenErrors(mapNode); });
			window.setTimeout(function() { cleanHiddenErrors(mapNode); }, 50);
			window.setTimeout(function() { cleanHiddenErrors(mapNode); }, 150);
		};

		o = s.taboption('general', form.Value, 'network_name', _('Network Name'),
			_('The VPN network name to identify this virtual network (Corresponding flag: --network-name).')
		);
		o.placeholder = 'easytier';
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'network_secret', _('Network Secret'),
			_('The secret phrase used to authorize and encrypt traffic (Corresponding flag: --network-secret).')
		);
		o.password = true;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'ip_dhcp', _('Enable DHCP IP Allocation'),
			_('Automatically determine and assign a virtual IP address (Corresponding flag: -d, --dhcp).')
		);
		o.default = '1';
		o.rmempty = false;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'ipaddr', _('Interface IPv4 Address'),
			_('The static IPv4 address of this node (Corresponding flag: -i, --ipv4). Ignored when DHCP is enabled.')
		);
		o.datatype = 'or(ip4addr, cidr4)';
		o.placeholder = '10.144.144.1/24';
		o.retain = true;
		o.depends({ 'etcmd': 'etcmd', 'ip_dhcp': '0' });

		o = s.taboption('general', form.Value, 'ip6addr', _('Interface IPv6 Address'),
			_('The static IPv6 address of this node (Corresponding flag: --ipv6).')
		);
		o.datatype = 'or(ip6addr, cidr6)';
		o.placeholder = 'fd00:144::1/64';
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'peeradd', _('Peer Nodes'),
			_('Initial connection peer node URLs (Corresponding flag: -p, --peers).')
		);
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'external_node', _('Public Discovery Node'),
			_('Public discovery node URL (Corresponding flag: -e, --external-node).')
		);
		o.placeholder = 'tcp://public.easytier.top:11010';
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'proxy_networks', _('Proxy Networks'),
			_('Subnet CIDRs to proxy and announce through this node (Corresponding flag: -n, --proxy-networks). Select from the detected local subnets below or enter custom CIDRs.')
		);
		if (subroutes && subroutes.length > 0) {
			subroutes.forEach(function(subnet) {
				o.value(subnet, subnet);
			});
		}
		o.rmempty = true;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'enable_exit_node', _('Enable Exit Node'),
			_('Allow other peers in the network to route their Internet traffic through this node (Corresponding flag: --enable-exit-node).')
		);
		o.default = '0';
		o.rmempty = false;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'magic_dns', _('Enable Magic DNS'),
			_('Allow resolving peer node domain names (such as hostname.et.net) without memorizing virtual IP addresses (Corresponding flag: --accept-dns). Automatically forwards DNS queries via dnsmasq. Note: If third-party DNS tools (e.g. MosDNS, AdGuard Home, SmartDNS) are active, ensure this domain zone is excluded from hijacking.')
		);
		o.default = '0';
		o.rmempty = false;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'tld_dns_zone', _('Magic DNS Domain Zone'),
			_('Specify the top-level domain zone for Magic DNS (Corresponding flag: --tld-dns-zone). Default is et.net. (FQDN ending with dot).')
		);
		o.placeholder = 'et.net.';
		o.default = 'et.net.';
		o.retain = true;
		o.depends('magic_dns', '1');

		// Config File Path under 'config' mode
		o = s.taboption('general', form.Value, 'custom_config_file', _('Configuration File Path'),
			_('Absolute path to the TOML configuration file (Corresponding flag: -c, --config-file). Ensure the file exists with valid EasyTier configuration.')
		);
		o.default = '/etc/easytier/config.toml';
		o.placeholder = '/etc/easytier/config.toml';
		o.retain = true;
		o.depends('etcmd', 'config');
		o.renderWidget = function() {
			const node = form.Value.prototype.renderWidget.apply(this, arguments);
			const input = node.querySelector ? (node.querySelector('input') || node) : node;
			if (input && input.style) {
				input.style.width = '295px';
				input.style.maxWidth = '100%';
			}
			return node;
		};

		// Web Server Options under 'web' mode
		o = s.taboption('general', form.Value, 'web_config', _('Web Config Server URL'),
			_('Remote web configuration server address or username (Corresponding flag: -w, --web-config). Supports complete URL (e.g. udp://127.0.0.1:22020/admin) or username only (e.g. admin, connecting to official cloud server).')
		);
		o.default = 'udp://127.0.0.1:22020/admin';
		o.placeholder = 'udp://127.0.0.1:22020/admin';
		o.retain = true;
		o.rmempty = true;
		o.depends('etcmd', 'web');
		o.validate = function(section_id, value) {
			const etcmdOpt = this.section.children.find(c => c.option === 'etcmd');
			const currentEtcmd = etcmdOpt ? etcmdOpt.formvalue(section_id) : uci.get('easytier', 'settings', 'etcmd');
			if (currentEtcmd === 'web') {
				if (!value || value.trim() === '') {
					return _('Web Config Server URL cannot be empty.');
				}
				const val = value.trim();
				// If URL schema is provided, must start with supported protocols
				if (val.indexOf('://') !== -1) {
					if (!/^(tcp|udp|ws|wss|wg|quic):\/\/.+/.test(val)) {
						return _('Invalid URL format, must start with tcp://, udp://, ws://, wss://, wg://, or quic://');
					}
				} else {
					// Single username/network name token
					if (!/^[a-zA-Z0-9_\-\.\@]+$/.test(val)) {
						return _('Invalid username format, only letters, digits, and _ - . @ are allowed.');
					}
				}
			}
			return true;
		};
		o.renderWidget = function() {
			const node = form.Value.prototype.renderWidget.apply(this, arguments);
			const input = node.querySelector ? (node.querySelector('input') || node) : node;
			if (input && input.style) {
				input.style.width = '295px';
				input.style.maxWidth = '100%';
			}
			return node;
		};

		o = s.taboption('general', form.Value, 'machine_id', _('Machine ID (UUID)'),
			_('Unique device identifier UUID in the cloud management console (Corresponding flag: --machine-id). Automatically generated on initial install. Changing UUID will automatically clear local cloud cache.')
		);
		o.placeholder = 'df33f4ba-c01b-4961-82f3-a424f39d5a9c';
		o.retain = true;
		o.depends('etcmd', 'web');
		o.validate = function(section_id, value) {
			const etcmdOpt = this.section.children.find(c => c.option === 'etcmd');
			const currentEtcmd = etcmdOpt ? etcmdOpt.formvalue(section_id) : uci.get('easytier', 'settings', 'etcmd');
			if (currentEtcmd === 'web') {
				if (!value || value.length === 0)
					return true;
				if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim()))
					return _('Invalid UUID format (e.g. %s)').format('df33f4ba-c01b-4961-82f3-a424f39d5a9c');
			}
			return true;
		};
		o.renderWidget = function() {
			const node = form.Value.prototype.renderWidget.apply(this, arguments);
			const input = node.querySelector ? (node.querySelector('input') || node) : node;
			if (input && input.style) {
				input.style.width = '295px';
				input.style.maxWidth = '100%';
				input.style.fontFamily = 'monospace';
			}
			return node;
		};

		// --- Advanced Options ---
		o = s.taboption('advanced', form.Value, 'rpc_port', _('RPC Management Port'),
			_('Port for local CLI and RPC management portal (Corresponding flag: --rpc-portal).')
		);
		o.datatype = 'port';
		o.default = '15888';
		o.placeholder = '15888';

		o = s.taboption('advanced', form.Value, 'dev_name', _('TUN Device Name'),
			_('Virtual TUN network interface name (Corresponding flag: --dev-name).')
		);
		o.default = 'easytier0';
		o.placeholder = 'easytier0';

		o = s.taboption('advanced', form.ListValue, 'encryption_algorithm', _('Encryption Algorithm'));
		o.value('aes-gcm', 'AES-GCM');
		o.value('chacha20-poly1305', 'ChaCha20-Poly1305');
		o.value('none', _('None'));
		o.default = 'aes-gcm';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'multi_thread', _('Multi-threaded Mode'),
			_('Enable multi-threaded packet processing for higher throughput (Corresponding flag: --multi-thread).')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Flag, 'allow_wan', _('Allow WAN Access'),
			_('Automatically open and manage firewall traffic rules on WAN zone to allow incoming connections for external peers.')
		);
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'tunnel_snat', _('Enable Tunnel Traffic SNAT'),
			_('Use OpenWrt system firewall to manage NAT for EasyTier tunnel and subnet traffic. Disabling this option disables source address masquerading to preserve real source IPs of remote peers and subnets in the local network.')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Value, 'custom_params', _('Custom Command Parameters'),
			_('Additional command-line parameters appended to easytier-core.')
		);
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		// --- Web Console ---
		if (status.web_installed !== false) {
			o = s.taboption('web', form.Flag, 'web_enabled', _('Enable Web Console Service'),
				_('The web console may consume significant memory, please enable as needed.')
			);
			o.rmempty = false;

			o = s.taboption('web', form.Value, 'web_html_port', _('Web Console Port'),
				_('HTTP listen port for easytier-web embedded web dashboard.')
			);
			o.datatype = 'port';
			o.default = '22020';
			o.placeholder = '22020';

			o = s.taboption('web', form.Value, 'web_dir', _('Web Data Directory'),
				_('Directory to store SQLite database for easytier-web.')
			);
			o.default = '/etc/easytier';
			o.placeholder = '/etc/easytier';
		}

		// --- Network Topology ---
		const topologyActions = s.taboption('topology', form.DummyValue, '_topology_actions');
		topologyActions.render = function() {
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Topology Actions')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) {
							const display = document.getElementById('easytier_topology_display');
							if (display) {
								display.replaceChildren(E('em', {}, _('Collecting data ...')));
							}
							return Promise.all([
								callGetTopology(),
								callGetPeers()
							]).then(function(results) {
								if (display) {
									display.replaceChildren(renderTopologySvg(results[0], results[1]));
								}
							}).catch(function(err) {
								if (display) {
									display.replaceChildren(E('em', {}, _('No topology data available.')));
								}
								ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load topology: %s').format(err.message || err)) ], 5000, 'error');
							});
						}
					}, _('Refresh Topology'))
				])
			]);
		};

		const topologySection = s.taboption('topology', form.DummyValue, '_topology');
		topologySection.render = function() {
			window.setTimeout(function() {
				const display = document.getElementById('easytier_topology_display');
				if (display) {
					Promise.all([
						callGetTopology(),
						callGetPeers()
					]).then(function(results) {
						display.replaceChildren(renderTopologySvg(results[0], results[1]));
					}).catch(function(err) {
						display.replaceChildren(E('em', {}, _('No topology data available.')));
					});
				}
			}, 100);

			return E('div', { 'id': 'easytier_topology_display', 'class': 'cbi-value' },
				E('em', {}, _('Collecting data ...'))
			);
		};

		// --- Logs ---
		const logActions = s.taboption('logs', form.DummyValue, '_log_actions');
		logActions.render = function() {
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Log Actions')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) {
							const display = document.getElementById('easytier_logs_display');
							if (display) {
								display.replaceChildren(E('em', {}, _('Collecting logs...')));
							}
							return callGetLogs().then(function(res) {
								if (display) {
									display.replaceChildren(renderLogsView(res));
								}
							}).catch(function(err) {
								if (display) {
									display.replaceChildren(E('em', {}, _('No logs available.')));
								}
								ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load logs: %s').format(err.message || err)) ], 5000, 'error');
							});
						}
					}, _('Refresh Logs')),
					' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': function(ev) {
							return callClearLogs().then(function() {
								const display = document.getElementById('easytier_logs_display');
								if (display) {
									display.replaceChildren(E('em', {}, _('Logs cleared.')));
								}
							});
						}
					}, _('Clear Logs'))
				])
			]);
		};

		const logsSection = s.taboption('logs', form.DummyValue, '_logs');
		logsSection.render = function() {
			window.setTimeout(function() {
				const display = document.getElementById('easytier_logs_display');
				if (display) {
					callGetLogs().then(function(res) {
						display.replaceChildren(renderLogsView(res));
					}).catch(function(err) {
						display.replaceChildren(E('em', {}, _('No logs available.')));
					});
				}
			}, 100);

			return E('div', { 'id': 'easytier_logs_display', 'class': 'cbi-value' },
				E('em', {}, _('Collecting logs...'))
			);
		};

		return map.render().then(function(node) {
			const cleanFn = function() { cleanHiddenErrors(node); };
			document.addEventListener('dependency-update', cleanFn);
			document.addEventListener('cbi-tab-active', cleanFn);
			return node;
		});
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return callServiceAction('restart');
		});
	}
});
