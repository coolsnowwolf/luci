// SPDX-License-Identifier: Apache-2.0
/*
 * Copyright (C) 2025 ImmortalWrt.org
 */

'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require view';

'require tools.widgets as widgets';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('sysuh3c'), {}).then(function(res) {
		let isRunning = false;
		try {
			isRunning = res['sysuh3c']['instances']['instance1']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	let spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	let renderHTML;
	if (isRunning)
		renderHTML = spanTemp.format('green', _('sysuh3c'), _('RUNNING'));
	else
		renderHTML = spanTemp.format('red', _('sysuh3c'), _('NOT RUNNING'));

	return renderHTML;
}

return view.extend({
	render() {
		let m, s, o;

		m = new form.Map('sysuh3c', _('SYSU H3C Client'),
			_('Configure SYSU H3C 802.1x client.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			poll.add(function() {
				return L.resolveDefault(getServiceStatus()).then(function(res) {
					let view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'service_status' }, _('Collecting data…'))
			]);
		}

		s = m.section(form.NamedSection, 'config', 'sysuh3c');

		o = s.option(form.Flag, 'enabled', _('Enable'));

		o = s.option(form.Value, 'username', _('Username'));
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;

		o = s.option(form.ListValue, 'method', _('EAP Method'));
		o.value('md5', _('MD5'));
		o.value('xor', _('XOR'));
		o.default = 'xor';
		o.rmempty = false;

		o = s.option(widgets.DeviceSelect, 'ifname', _('Interface'));
		o.multiple = false;
		o.noaliases = true;
		o.nocreate = true;
		o.rmempty = false;

		return m.render();
	}
});
