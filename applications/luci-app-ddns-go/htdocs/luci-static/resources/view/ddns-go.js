/* Copyright (C) 2023 ImmortalWrt.org */

'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require view';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('ddns-go'), {}).then(function (res) {
		var isRunning = false;
		try {
			isRunning = res['ddns-go']['instances']['ddns-go']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning, listen_port, noweb) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		renderHTML = spanTemp.format('green', _('DDNS-Go'), _('RUNNING'));
		if (noweb !== '1')
			renderHTML+= String.format('&#160;<a class="btn cbi-button" href="%s:%s" target="_blank" rel="noreferrer noopener">%s</a>',
				window.location.origin, listen_port, _('Open Web Interface'));
	} else {
		renderHTML = spanTemp.format('red', _('DDNS-Go'), _('NOT RUNNING'));
	}

	return renderHTML;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('ddns-go')
		]);
	},

	render: function(data) {
		var m, s, o;
		var listen_port = (uci.get(data[0], 'config', 'listen') || '[::]:9876').split(':').slice(-1)[0],
		    noweb = uci.get(data[0], 'config', 'noweb') || '0';

		m = new form.Map('ddns-go', _('DDNS-Go'),
			_('A simple and easy-to-use Dynamic DNS client with IPv6 support.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getServiceStatus()).then(function (res) {
					var view = document.getElementById('service_status');
					view.innerHTML = renderStatus(res, listen_port, noweb);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, _('Collecting data...'))
			]);
		}

		s = m.section(form.NamedSection, 'config', 'ddns-go');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o = s.option(form.Value, 'listen', _('Listen address'));
		o.datatype = 'ipaddrport(1)';
		o.default = '[::]:9876';
		o.rmempty = false;

		o = s.option(form.Value, 'ttl', _('Update interval'));
		o.default = '300';
		o.rmempty = false;

		o = s.option(form.Flag, 'noweb', _('Disable WebUI'));
		o.default = o.disabled;

		o = s.option(form.Flag, 'insecure', _('Skip certificate verification'));
		o.default = o.disabled;

		return m.render();
	}
});
