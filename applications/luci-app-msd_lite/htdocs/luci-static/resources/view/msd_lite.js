/* Copyright (C) 2022 ImmortalWrt.org */

'use strict';
'require view';
'require form';
'require tools.widgets as widgets';

return view.extend({
	render() {
		let m, s, o;

		m = new form.Map('msd_lite', _('Multi Stream daemon Lite'),
			_('The lightweight version of Multi Stream daemon (msd) Program for organizing IP TV streaming on the network via HTTP.'));

		s = m.section(form.TypedSection, 'instance');
		s.anonymous = true;
		s.addremove = true;
		s.addbtntitle = _('Add instance');

		o = s.option(form.Flag, 'enabled', _('Enable'));

		o = s.option(form.DynamicList, 'address', _('Bind address'));
		o.datatype = 'ipaddrport(1)';
		o.rmempty = false;

		o = s.option(widgets.NetworkSelect, 'network', _('Source interface'),
			_('For multicast receive.'));
		o.nocreate = true;
		o.optional = true;

		o = s.option(form.ListValue, 'loglevel', _('Log level'),
			_('syslog severity level.'));
		o.value('0', _('Emergency'));
		o.value('1', _('Alert'));
		o.value('2', _('Critical'));
		o.value('3', _('Error'));
		o.value('4', _('Warning'));
		o.value('5', _('Notice'));
		o.value('6', _('Info'));
		o.value('7', _('Debug'));
		o.default = '0';

		o = s.option(form.Value, 'threads', _('Worker threads'),
			_('Leave 0 or <em>empty</em> to auto detect.'));
		o.datatype = 'uinteger';
		o.placeholder = '0';

		o = s.option(form.Flag, 'bind_to_cpu', _('Bind threads to CPUs'));

		o = s.option(form.Flag, 'drop_slow_clients', _('Disconnect slow clients'));

		o = s.option(form.Value, 'precache_size', _('Pre cache size'));
		o.datatype = 'uinteger';
		o.placeholder = '4096';

		o = s.option(form.Value, 'ring_buffer_size', _('Ring buffer size'),
			_('Stream receive ring buffer size.'));
		o.datatype = 'uinteger';
		o.placeholder = '4096';

		o = s.option(form.Value, 'multicast_recv_buffer_size', _('Receive buffer size'),
			_('Multicast receive socket buffer size.'));
		o.datatype = 'uinteger';
		o.placeholder = '512';

		o = s.option(form.Value, 'multicast_recv_timeout', _('Receive timeout'),
			_('Multicast receive timeout.'));
		o.datatype = 'uinteger';
		o.placeholder = '2';

		o = s.option(form.Value, 'rejoin_time', _('IGMP/MLD rejoin time'),
			_('Do IGMP/MLD leave+join every X seconds. Leave <em>0</em> to disable.'));
		o.datatype = 'uinteger';
		o.placeholder = '0';

		return m.render();
	}
});
