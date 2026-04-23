'use strict';
'require view';
'require fs';
'require ui';

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return L.resolveDefault(fs.exec_direct('/usr/libexec/onekeyap', [ 'status' ], 'json'), {});
	},

	renderValue: function(title, value) {
		return E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title' }, [ title ]),
			E('div', { 'class': 'cbi-value-field' }, [ value || _('Not detected') ])
		]);
	},

	handleToggle: function() {
		var status = this.status || {};
		var command = (status.mode === 'ap') ? 'enable-router' : 'enable-ap';
		var buttonText = (status.mode === 'ap') ? _('Enable Router Mode') : _('Enable AP Mode');

		ui.showModal(_('Switching mode'), [
			E('p', { 'class': 'spinning' }, [
				_('Running %s, the network will reload briefly. Please wait...').format(buttonText)
			])
		]);

		return L.resolveDefault(fs.exec_direct('/usr/libexec/onekeyap', [ command ], 'json'), {
			code: 1,
			message: _('Command execution failed')
		}).then(function(res) {
			ui.hideModal();

			if (+res.code !== 0)
				throw new Error(res.message || _('Switching failed'));

			ui.addNotification(null, E('p', [
				res.message || _('The switch request has been submitted. The page will refresh in a few seconds. If the address changes, you can still use 192.168.0.1.')
			]));

			window.setTimeout(function() {
				location.reload();
			}, 8000);
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', [
				err.message || String(err)
			]), 'danger');
		});
	},

	render: function(status) {
		this.status = status || {};

		var modeText = (this.status.mode === 'ap') ? _('AP Mode') : _('Router Mode');
		var buttonText = (this.status.mode === 'ap') ? _('Enable Router Mode') : _('Enable AP Mode');
		var currentLanPorts = (this.status.current_lan_ports || []).join(', ');
		var savedLanPorts = (this.status.saved_lan_ports || []).join(', ');
		var savedWanPorts = (this.status.saved_wan_ports || []).join(', ');
		var currentIps = (this.status.current_lan_ipv4 || []).join(', ');
		var fallbackIp = this.status.fallback_ip || '192.168.0.1/24';

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', [ _('One-Key AP Mode') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Merge current WAN ports into LAN with one click. In AP mode, LAN becomes a DHCP client while keeping 192.168.0.1/24 as a fallback management address.')
			]),
			E('div', { 'class': 'cbi-section' }, [
				this.renderValue(_('Current Mode'), modeText),
				this.renderValue(_('Current LAN Ports'), currentLanPorts),
				this.renderValue(_('Current LAN IPv4'), currentIps),
				this.renderValue(_('Original LAN Ports'), savedLanPorts),
				this.renderValue(_('Original WAN Ports'), savedWanPorts),
				this.renderValue(_('Fallback Address'), fallbackIp),
				E('div', { 'class': 'cbi-page-actions' }, [
					E('button', {
						'id': 'onekeyap-toggle',
						'class': 'cbi-button cbi-button-action',
						'type': 'button',
						'click': ui.createHandlerFn(this, 'handleToggle')
					}, [ buttonText ])
				])
			])
		]);
	}
});
