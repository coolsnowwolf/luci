'use strict';
'require form';
'require network';
'require uci';
'require view';

return view.extend({
	load() {
		return Promise.all([
			uci.load('eqos'),
			network.getHostHints(),
			network.getDevices()
		]);
	},

	render(data) {
		let m, s, o;
		const hosts = data[1]?.hosts || {};
		const devices = (data[2] || []).filter((dev) => /^eth[0-9]+(?:\.[0-9]+)?$/.test(dev.getName()));

		m = new form.Map('eqos', _('EQoS'),
			_('Network speed control service.'));

		s = m.section(form.TypedSection, 'eqos');
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.ListValue, 'mode', _('QoS mode'),
			_('Software mode keeps per-IP limits. Qualcomm NSS mode uses nssifb hardware shaping for total bandwidth only.'));
		o.value('software', _('Software QoS (per-IP)'));
		o.value('nss', _('Qualcomm NSS hardware QoS'));
		o.default = 'software';
		o.rmempty = false;

		o = s.option(form.Value, 'download', _('Download speed (Mbit/s)'),
			_('Total download bandwidth.'));
		o.datatype = 'and(uinteger,min(1))';
		o.rmempty = false;

		o = s.option(form.Value, 'upload', _('Upload speed (Mbit/s)'),
			_('Total upload bandwidth.'));
		o.datatype = 'and(uinteger,min(1))';
		o.rmempty = false;

		o = s.option(form.ListValue, 'nss_interface', _('NSS physical interface'),
			_('Physical interface used by nssifb, usually the WAN Ethernet device.'));
		for (const dev of devices)
			o.value(dev.getName(), dev.getName());
		o.placeholder = 'eth0';
		o.depends('mode', 'nss');

		o = s.option(form.Value, 'nss_qdisc_opts', _('NSS advanced options'),
			_('Optional nssfq_codel options, for example "interval 50ms quantum 304".'));
		o.depends('mode', 'nss');

		o = s.option(form.DummyValue, '_nss_note', _('NSS mode notes'));
		o.depends('mode', 'nss');
		o.cfgvalue = function() {
			return _('Qualcomm NSS mode only shapes total upload/download bandwidth on the selected physical interface. Per-IP device rules below are ignored in this mode.');
		};

		s = m.section(form.TableSection, 'device', _('Speed limit based on IP address'),
			_('These rules are only applied in Software QoS mode.'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.enabled;

		o = s.option(form.Value, 'ip', _('IP address'));
		o.datatype = 'ip4addr';
		for (const i of Object.entries(hosts))
			for (const ip_addr of (i[1].ipaddrs || []))
				if (ip_addr) {
					const ip_host = i[1].name;
					o.value(ip_addr, ip_host ? String.format('%s (%s)', ip_host, ip_addr) : ip_addr)
				}
		o.rmempty = false;

		o = s.option(form.Value, 'download', _('Download speed (Mbit/s)'));
		o.datatype = 'and(uinteger,min(1))';
		o.rmempty = false;

		o = s.option(form.Value, 'upload', _('Upload speed (Mbit/s)'));
		o.datatype = 'and(uinteger,min(1))';
		o.rmempty = false;

		o = s.option(form.Value, 'comment', _('Comment'));

		return m.render();
	}
});
