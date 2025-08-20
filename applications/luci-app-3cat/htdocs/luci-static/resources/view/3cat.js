// SPDX-License-Identifier: Apache-2.0
/*
 * Copyright (C) 2025 ImmortalWrt.org
 */

'use strict';
'require form';
'require network';
'require view';
'require tools.firewall as fwtool';

return view.extend({
	load() {
		return Promise.all([
			network.getHostHints()
		]);
	},

	render(data) {
		let m, s, o;
		let hosts = fwtool.transformHostHints(null, data[0]?.hosts);

		m = new form.Map('3cat', _('3cat'),
			_('A simple TCP/UDP port forwarder via 3proxy.'));

		s = m.section(form.GridSection, 'instance');
		s.addremove = true;
		s.sortable = true;
		s.rowcolors = true;
		s.nodescriptions = true;
		s.addbtntitle = _('Add instance');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;
		o.editable = true;
		o.rmempty = false;

		o = s.option(form.Value, 'listen_addr', _('Listen address'));
		o.value('::');
		o.value('0.0.0.0');
		o.datatype = 'ipaddr';
		o.rmempty = false;

		o = s.option(form.Value, 'listen_port', _('Listen port'));
		o.datatype = 'port';
		o.rmempty = false;

		o = s.option(form.Value, 'dest_addr', _('Destination address'));
		if (hosts && hosts.length > 0)
			for (let i = 0; i < hosts[0].length; i++)
				o.value(hosts[0][i], hosts[1][hosts[0][i]]);
		o.datatype = 'or(hostname, ipaddr)';
		o.rmempty = false;

		o = s.option(form.Value, 'dest_port', _('Destination port'));
		o.datatype = 'port';
		o.rmempty = false;

		o = s.option(form.ListValue, 'protocol', _('Protocol'));
		o.value('tcp', _('TCP'));
		o.value('udp', _('UDP'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'ip_prefer', _('IP version'),
			_('If the destination address is a hostname, this option controls which IP version to use.'));
		o.value('', _('Default'));
		o.value('46', _('Prefer IPv4'));
		o.value('64', _('Prefer IPv6'));
		o.value('4', _('IPv4 only'));
		o.value('6', _('IPv6 only'));

		o = s.option(form.Flag, 'logging', _('Logging'),
			_('Log this instance to the system log.'));
		o.editable = true;

		o = s.option(form.Flag, 'firewall', _('Firewall'),
			_('Allow access from the Internet.'));
		o.editable = true;

		return m.render();
	}
});
