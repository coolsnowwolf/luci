// SPDX-License-Identifier: Apache-2.0

'use strict';
'require form';
'require poll';
'require uci';
'require view';
'require fs';

function getStatus() {
	var result
	try {
		result = fs.exec('/usr/bin/qiyougamebooster.sh', ['status']);
		return result.then(function(status) {
			return status.stdout.trim() 
		})
	} catch (e) { }
		return result;
}

function getVersion() {
	var result
	try {
		result = fs.exec('/usr/bin/qiyougamebooster.sh', ['version'])
		return result.then(function(version) {
			return version.stdout.trim() || _('QiYou Game Booster');
		}).catch(function() {
			return _('QiYou Game Booster');
		});
	} catch (e) { }
		return Promise.resolve(_('QiYou Game Booster'));
}

function renderStatus(status, version) {
	var spanTemp = '<span style="color:%s"><strong>%s: %s %s</strong></span>';
	var renderHTML;
	if (status == 'NOT ENABLED' || status == 'NOT RUNNING' || status == 'NOT SUPPORTED') {
		renderHTML = spanTemp.format('red', _('Status'), _(version), _(status));
	} else {
		renderHTML = spanTemp.format('green', _('Status'), _(version), _(status));
	}
	return renderHTML;
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('qiyougamebooster')
		]);
	},

	render: function() {
		let m, s, o;

		m = new form.Map('qiyougamebooster', _('QiYou Game Booster'),
			_('Play console games online with less lag and more stability.') + '<br />' + 
			_('— now supporting PS, Switch, Xbox, PC, and mobile.'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getStatus()).then(function (status) {
					return L.resolveDefault(getVersion()).then(function (version) {
						var view = document.getElementById('service_status');
						view.innerHTML = renderStatus(status, version);
					});
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
					E('p', { id: 'service_status' }, _('Collecting data...'))
			]);
		}

		s = m.section(form.NamedSection, 'config', 'qiyougamebooster');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			return E('div', {class: 'cbi-section'}, [
				E('p', [
					E('img', {src: '/qiyougamebooster/Tutorial.png', height: '350'})
				])
			])
		}


		return m.render();
    }

});
