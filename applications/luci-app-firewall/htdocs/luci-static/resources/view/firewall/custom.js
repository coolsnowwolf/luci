'use strict';
'require view';
'require fs';
'require ui';
'require uci';
'require rpc';

const callCommit = rpc.declare({
	object: 'uci',
	method: 'commit',
	params: [ 'config' ],
	reject: true
});

return view.extend({
	load() {
		return Promise.all([
			L.resolveDefault(fs.read('/etc/firewall.user'), ''),
			uci.load('firewall')
		]).then(data => data[0]);
	},

	saveInclude() {
		const include = uci.sections('firewall', 'include').find(s =>
			s.path == '/etc/firewall.user' && (!s.type || s.type == 'script'));
		const sid = include ? include['.name'] : uci.add('firewall', 'include');

		uci.set('firewall', sid, 'path', '/etc/firewall.user');
		uci.set('firewall', sid, 'type', 'script');
		uci.set('firewall', sid, 'enabled', '1');
		if (L.hasSystemFeature('firewall4'))
			uci.set('firewall', sid, 'fw4_compatible', '1');

		return uci.save().then(() => callCommit('firewall'))
			.then(L.bind(ui.changes.init, ui.changes));
	},

	handleSave(ev) {
		const textarea = document.querySelector('textarea');
		const value = (textarea.value || '').trim().replace(/\r\n/g, '\n') + '\n';

		return fs.write('/etc/firewall.user', value).then(() => {
			return fs.exec('/bin/sh', [ '-n', '/etc/firewall.user' ]);
		}).then(res => {
			if (res.code != 0) {
				return fs.write('/etc/firewall.user', this.contents).then(() => {
					throw new Error(res.stderr || res.stdout || _('Invalid shell script.'));
				});
			}

			this.contents = textarea.value = value;
			return this.saveInclude();
		}).then(() => {
			return fs.exec('/etc/init.d/firewall', [ 'restart' ]);
		}).then(res => {
			if (res.code != 0 || /Include '\/etc\/firewall\.user' failed with exit code/.test(res.stderr || ''))
				throw new Error(res.stderr || res.stdout || _('Unable to restart the firewall.'));

			ui.addNotification(null, E('p', _('Custom rules have been saved and applied.')), 'info');
		}).catch(e => {
			ui.addNotification(null, E('p', _('Unable to save or apply custom rules: %s').format(e.message)));
		});
	},

	render(fwuser) {
		this.contents = fwuser || '';
		let value = this.contents;

		if (!value.trim() && L.hasSystemFeature('firewall4')) {
			value = [
				'# This file is interpreted as a shell script.',
				'# Custom commands run after the default rules on every firewall restart.',
				'# Use nft commands here. The inet fw4 table is recreated on reload.',
				'#',
				'# Example (remove the leading # to enable):',
				'# nft add rule inet fw4 input counter comment "custom-input"',
				''
			].join('\n');
		}

		return E([
			E('h2', _('Firewall - Custom Rules')),
			E('p', {}, L.hasSystemFeature('firewall4')
				? _('Custom rules are shell commands executed after each firewall restart, after the default ruleset has been loaded. Use nft commands for the nftables firewall. Saving applies the rules immediately.')
				: _('Custom rules allow you to execute arbitrary iptables commands which are not otherwise covered by the firewall framework. The commands are executed after each firewall restart, right after the default ruleset has been loaded.')),
			E('p', {}, E('textarea', { 'style': 'width:100%', 'rows': 25, 'disabled': !L.hasViewPermission() || null }, [ value ]))
		]);
	},

	handleSaveApply: null,
	handleReset: null
});
