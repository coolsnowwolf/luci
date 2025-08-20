// SPDX-License-Identifier: Apache-2.0

'use strict';
'require form';
'require poll';
'require rpc';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('rustdesk-server'), {}).then(function(res) {
		const status = {
			hbbs: res?.['rustdesk-server']?.['instances']?.['hbbs']?.['running'],
			hbbr: res?.['rustdesk-server']?.['instances']?.['hbbr']?.['running']
		};
		return status;
	});
}

function renderStatus(status) {
	const spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	let renderHTML = [];

	for (let i in status) {
		const color = (status[i] === true) ? 'green' : 'red';
		const service = (i === 'hbbs') ? _('RustDesk Server') : _('RustDesk Relay');
		const running = (status[i] === true) ? _('RUNNING') : _('NOT RUNNING');
		renderHTML.push(spanTemp.format(color, service, running));
	}

	return renderHTML;
}

return view.extend({
	render() {
		let m, s, o;

		m = new form.Map('rustdesk-server', _('RustDesk Server'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			poll.add(function() {
				return L.resolveDefault(getServiceStatus()).then(function(res) {
					const stats = renderStatus(res);
					const srvs = [ 'hbbr_status', 'hbbs_status' ];
					for (let i in srvs) {
						let view = document.getElementById(srvs[i]);
						view.innerHTML = stats[i];
					}
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'hbbr_status' }, _('Collecting data…')),
				E('p', { id: 'hbbs_status' }, _('Collecting data…'))
			]);
		}

		s = m.section(form.NamedSection, 'global', 'rustdesk-server', _('Global settings'));

		o = s.option(form.Value, 'port', _('Listen port'));
		o.datatype = 'port';
		o.placeholder = '21116';

		o = s.option(form.Value, 'key', _('Key'),
			_('Force the use of a specific key if set. Force the use of any key if set to "_".'));

		o = s.option(form.Flag, 'auto_fw', _('Allow connection from Internet'));

		s = m.section(form.NamedSection, 'hbbs', 'rustdesk-server', _('Server settings'));

		o = s.option(form.Flag, 'enabled', _('Enable RustDesk Server'));

		o = s.option(form.Flag, 'always_use_relay', _('Always use relay'),
			_('Disallows direct peer connection if enabled.'));
		o.enabled = 'Y';
		o.disabled = 'N';

		s = m.section(form.NamedSection, 'hbbr', 'rustdesk-server', _('Relay settings'));

		o = s.option(form.Flag, 'enabled', _('Enable RustDesk Relay'));

		o = s.option(form.Value, 'downgrade_start_check', _('Downgrade check delay'),
			_('Delay before downgrade check (in seconds).'));
		o.datatype = 'uinteger';

		o = s.option(form.Value, 'downgrade_threshold', _('Downgrade check threshold'),
			_('Threshold of downgrade check (bit/ms).'));
		o.datatype = 'ufloat';

		o = s.option(form.Value, 'limit_speed', _('Speed limit'),
			_('Speed limit (in Mb/s).'));
		o.datatype = 'uinteger';

		o = s.option(form.Value, 'total_bandwidth', _('Total bandwidth'),
			_('Max total bandwidth (in Mb/s).'));
		o.datatype = 'uinteger';

		o = s.option(form.Value, 'single_bandwidth', _('Single bandwidth'),
			_('Max bandwidth for a single connection (in Mb/s).'));
		o.datatype = 'uinteger';

		return m.render();
	}
});
