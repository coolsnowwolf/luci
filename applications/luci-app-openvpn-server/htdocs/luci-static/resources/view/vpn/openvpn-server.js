'use strict';
'require dom';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

const callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: [ 'name', 'action' ],
	expect: { result: false }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('openvpn'), {}).then(function(res) {
		try {
			return !!res.openvpn.instances.myvpn.running;
		}
		catch (e) {
			return false;
		}
	});
}

function renderStatus(isRunning) {
	return E('em', {}, [
		E('span', { style: 'color:%s'.format(isRunning ? 'green' : 'red') }, [
			E('strong', {}, [ _('OpenVPN Server'), ' ', isRunning ? _('RUNNING') : _('NOT RUNNING') ])
		])
	]);
}

function notifyError(err) {
	const msg = (err && err.message) ? err.message : String(err || _('Unknown error'));
	ui.addNotification(null, E('p', {}, msg), 'error');
}

function saveBlob(filename, content) {
	const blob = new Blob([ content ], { type: 'application/octet-stream' });
	const url = URL.createObjectURL(blob);
	const link = E('a', {
		style: 'display:none',
		href: url,
		download: filename
	});

	document.body.appendChild(link);
	link.click();
	link.remove();

	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ensureNamedSection(config, sid, type) {
	if (!uci.get(config, sid))
		uci.add(config, type, sid);

	return sid;
}

function setSectionValues(config, sid, values) {
	for (const opt in values)
		uci.set(config, sid, opt, values[opt]);
}

const CBIEditableList = form.Value.extend({
	__name__: 'CBI.OpenVPNEditableList',

	renderWidget(section_id, option_index, cfgvalue) {
		const values = L.toArray((cfgvalue != null) ? cfgvalue : this.default)
			.map(v => String(v).trim())
			.filter(v => v !== '');
		const root = E('div', {
			'class': 'openvpn-editable-list',
			'data-widget-id': this.cbid(section_id),
			'style': 'display:flex; flex-direction:column; gap:.65rem; width:100%;'
		});
		const items = E('div', {
			'class': 'openvpn-editable-list-items',
			'style': 'display:flex; flex-direction:column; gap:.65rem; width:100%;'
		});
		const creator = E('div', {
			'class': 'openvpn-editable-list-add',
			'style': 'display:flex; align-items:center; gap:.65rem; width:100%;'
		}, [
			E('input', {
				'type': 'text',
				'class': 'cbi-input-text',
				'placeholder': _('Add client setting'),
				'style': 'flex:1 1 auto; width:100%;'
			}),
			E('button', {
				'type': 'button',
				'class': 'cbi-button cbi-button-add',
				'style': 'flex:0 0 auto; min-width:3rem;'
			}, [ '+' ])
		]);
		const dispatchChange = () => root.dispatchEvent(new CustomEvent('widget-change', { bubbles: true }));
		const addInput = creator.firstChild;
		const addButton = creator.lastChild;

		const addItem = (value) => {
			const row = E('div', {
				'class': 'openvpn-editable-list-item',
				'style': 'display:flex; align-items:center; gap:.65rem; width:100%;'
			}, [
				E('input', {
					'type': 'text',
					'class': 'cbi-input-text',
					'value': value || '',
					'placeholder': _('Client setting'),
					'style': 'flex:1 1 auto; width:100%;'
				}),
				E('button', {
					'type': 'button',
					'class': 'cbi-button cbi-button-negative',
					'style': 'flex:0 0 auto; min-width:3rem;'
				}, [ '×' ])
			]);
			const input = row.firstChild;
			const remove = row.lastChild;

			input.addEventListener('input', dispatchChange);
			remove.addEventListener('click', () => {
				row.remove();
				dispatchChange();
			});

			items.appendChild(row);
		};

		values.forEach(addItem);

		addButton.addEventListener('click', () => {
			const value = String(addInput.value || '').trim();

			if (!value)
				return;

			addItem(value);
			addInput.value = '';
			dispatchChange();
		});

		addInput.addEventListener('keydown', (ev) => {
			if (ev.key !== 'Enter')
				return;

			ev.preventDefault();
			addButton.click();
		});

		root.appendChild(items);
		root.appendChild(creator);

		return root;
	},

	formvalue(section_id) {
		const field = this.map.findElement('data-field', this.cbid(section_id));

		if (!field)
			return null;

		return Array.from(field.querySelectorAll('.openvpn-editable-list-item input'))
			.map(input => String(input.value || '').trim())
			.filter(value => value !== '');
	},

	textvalue(section_id) {
		return L.toArray(this.formvalue(section_id)).join(', ');
	}
});

function normalizePKIPaths() {
	const defaults = {
		ca: '/etc/openvpn/pki/ca.crt',
		dh: '/etc/openvpn/pki/dh.pem',
		cert: '/etc/openvpn/pki/server.crt',
		key: '/etc/openvpn/pki/server.key'
	};
	const legacy = {
		ca: '/etc/openvpn/ca.crt',
		dh: '/etc/openvpn/dh.pem',
		cert: '/etc/openvpn/server.crt',
		key: '/etc/openvpn/server.key'
	};

	for (const opt in defaults) {
		const current = uci.get('openvpn', 'myvpn', opt);

		if (current == null || current === '' || current === legacy[opt])
			uci.set('openvpn', 'myvpn', opt, defaults[opt]);
	}
}

return view.extend({
	render() {
		const m = new form.Map('openvpn', _('OpenVPN Server'),
			_('An easy config OpenVPN Server Web-UI'));
		let s, o;

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			poll.add(function() {
				return getServiceStatus().then(function(running) {
					const node = document.getElementById('openvpn_server_status');
					if (node)
						dom.content(node, renderStatus(running));
				});
			});

			return E('div', { class: 'cbi-section' }, [
				E('p', { id: 'openvpn_server_status' }, [ _('Collecting data...') ])
			]);
		};

		s = m.section(form.NamedSection, 'myvpn', 'openvpn');
		s.anonymous = true;
		s.addremove = false;

		s.tab('basic', _('Base Setting'));
		s.tab('code', _('Special Code'));

		o = s.taboption('basic', form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;

		o = s.taboption('basic', form.ListValue, 'proto', _('Proto'));
		[
			[ 'tcp-server', _('TCP Server') ],
			[ 'udp',        _('UDP Server') ],
			[ 'tcp4',       _('TCP Server IPv4') ],
			[ 'udp4',       _('UDP Server IPv4') ],
			[ 'tcp6',       _('TCP Server IPv6') ],
			[ 'udp6',       _('UDP Server IPv6') ]
		].forEach(v => o.value(v[0], v[1]));
		o.cfgvalue = function(section_id) {
			const value = uci.get('openvpn', section_id, 'proto');
			if (value && this.keylist.indexOf(value) < 0)
				this.value(value, value);
			return value;
		};

		o = s.taboption('basic', form.Value, 'port', _('Port'));
		o.datatype = 'port';
		o.placeholder = '1194';

		o = s.taboption('basic', form.Value, 'ddns', _('WAN DDNS or IP'));
		o.datatype = 'string';
		o.default = 'example.com';
		o.rmempty = false;

		o = s.taboption('basic', form.Value, 'server', _('Client Network'),
			_('VPN Client Network IP with subnet'));
		o.datatype = 'string';
		o.placeholder = '10.8.0.0 255.255.255.0';

		o = s.taboption('basic', CBIEditableList, 'push', _('Client Settings'),
			_('Set route 192.168.0.0 255.255.255.0 and dhcp-option DNS 192.168.0.1 base on your router'));
		o.optional = true;
		o.rmempty = true;

		o = s.taboption('basic', form.Button, '_download', _('OpenVPN Client config file'),
			_('If you are using IOS client, please download this .ovpn file and send it via QQ or Email to your IOS device'));
		o.inputtitle = _('Download .ovpn file');
		o.inputstyle = 'reload';
		o.onclick = this.handleDownload.bind(this);

		o = s.taboption('basic', form.Button, '_renew', _('Renew OpenVPN certificate files'));
		o.inputtitle = _('Renew');
		o.inputstyle = 'reload';
		o.onclick = this.handleRenew.bind(this);

		o = s.taboption('code', form.TextValue, '_addon_conf',
			_('(!)Special Code you know that add in to client .ovpn file'));
		o.rows = 13;
		o.wrap = 'off';
		o.monospace = true;
		o.load = function() {
			return L.resolveDefault(fs.read('/etc/openvpn-addon.conf'), '');
		};
		o.write = function(section_id, value) {
			return fs.write('/etc/openvpn-addon.conf', value.replace(/\r\n/g, '\n'));
		};
		o.remove = function() {
			return fs.write('/etc/openvpn-addon.conf', '');
		};

		return m.render();
	},

	handleDownload(ev) {
		return fs.exec('/etc/openvpn/ensurecert.sh').then(res => {
			if (res.code !== 0)
				return Promise.reject(new Error(res.stderr || _('Failed to prepare certificate files')));

			return fs.exec('/etc/openvpn/genovpn.sh');
		}).then(res => {
			if (res.code !== 0)
				return Promise.reject(new Error(res.stderr || _('Failed to generate client configuration')));

			return fs.read('/tmp/my.ovpn');
		}).then(content => {
			if (!content)
				return Promise.reject(new Error(_('Generated client configuration is empty')));

			saveBlob('my.ovpn', content);
		}).catch(err => {
			notifyError(err);
		});
	},

	handleRenew(ev) {
		return fs.exec('/etc/openvpn/renewcert.sh').then(res => {
			if (res.code !== 0)
				return Promise.reject(new Error(res.stderr || _('Failed to renew OpenVPN certificates')));

			ui.addNotification(null, E('p', {}, _('OpenVPN certificate files have been renewed.')), 'info');
		}).catch(err => {
			notifyError(err);
		});
	},

	syncAuxiliaryConfig() {
		return Promise.all([
			uci.load('openvpn'),
			uci.load('network'),
			uci.load('firewall')
		]).then(() => {
			const port = uci.get('openvpn', 'myvpn', 'port') || '1194';
			const enabled = uci.get('openvpn', 'myvpn', 'enabled') == '1';

			normalizePKIPaths();

			ensureNamedSection('network', 'vpn0', 'interface');
			setSectionValues('network', 'vpn0', {
				device: 'tun0',
				proto: 'none'
			});

			ensureNamedSection('firewall', 'openvpn', 'rule');
			setSectionValues('firewall', 'openvpn', {
				name: 'openvpn',
				target: 'ACCEPT',
				src: 'wan',
				proto: 'tcp udp',
				dest_port: port
			});

			ensureNamedSection('firewall', 'vpn', 'zone');
			setSectionValues('firewall', 'vpn', {
				name: 'vpn',
				input: 'ACCEPT',
				forward: 'ACCEPT',
				output: 'ACCEPT',
				masq: '1',
				network: 'vpn0'
			});

			ensureNamedSection('firewall', 'vpntowan', 'forwarding');
			setSectionValues('firewall', 'vpntowan', {
				src: 'vpn',
				dest: 'wan'
			});

			ensureNamedSection('firewall', 'vpntolan', 'forwarding');
			setSectionValues('firewall', 'vpntolan', {
				src: 'vpn',
				dest: 'lan'
			});

			ensureNamedSection('firewall', 'lantovpn', 'forwarding');
			setSectionValues('firewall', 'lantovpn', {
				src: 'lan',
				dest: 'vpn'
			});

			return uci.save().then(() => enabled);
		}).then(enabled => {
			const tasks = [];

			if (enabled)
				tasks.push(fs.exec('/etc/openvpn/ensurecert.sh'));

			tasks.push(callInitAction('firewall', 'restart'));
			tasks.push(callInitAction('openvpn', 'restart'));

			return Promise.all(tasks);
		});
	},

	handleSave(ev) {
		return this.super('handleSave', [ev]).then(() => {
			return this.syncAuxiliaryConfig();
		}).catch(err => {
			notifyError(err);
			return Promise.reject(err);
		});
	},

	handleSaveApply(ev, mode) {
		return this.handleSave(ev);
	}
});
