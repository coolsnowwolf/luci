'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('ua2f'), {}).then(function(res) {
		let isRunning = false;
		try {
			isRunning = res['ua2f']['instances']['ua2f']['running'];
		} catch (e) { }
		return isRunning;
	});
}

function renderStatus(isRunning) {
	let spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	let renderHTML;
	if (isRunning)
		renderHTML = spanTemp.format('green', _('UA2F'), _('RUNNING'));
	else
		renderHTML = spanTemp.format('red', _('UA2F'), _('NOT RUNNING'));

	return renderHTML;
}

return view.extend({
	render() {
		let m, s, o;

		m = new form.Map('ua2f', _('UA2F'), _('Change User-Agent to F-words.'));

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

		s = m.section(form.NamedSection, 'enabled', 'ua2f');

		o = s.option(form.Flag, 'enabled', _('Enable'));

		s = m.section(form.NamedSection, 'firewall', 'ua2f');

		o = s.option(form.Flag, 'handle_fw', _('Auto setup firewall rules'));

		o = s.option(form.Flag, 'handle_tls', _('Process HTTP traffic from 443 port'));
		o.depends('handle_fw', '1');

		o = s.option(form.Flag, 'handle_intranet', _('Process HTTP traffic from Intranet'));
		o.depends('handle_fw', '1');

		s = m.section(form.NamedSection, 'main', 'ua2f');

		o = s.option(form.Value, 'custom_ua', _('Custom User-Agent'));

		o = s.option(form.Flag, 'disable_connmark', _('Disable conntrack mark'),
			_('This will increase compatibility with other programs that modify conntrack marks but will decrease performance.'));

		o = s.option(form.Button, '_check_ua', _('Check User-Agent'));
		o.inputtitle = _('Open website');
		o.inputstyle = 'apply';
		o.onclick = function() {
			window.open('http://ua-check.stagoh.com/', '_blank');
		}

		return m.render();
	}
});
