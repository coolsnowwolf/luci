'use strict';
'require form';
'require uci';
'require view';

return view.extend({
	load() {
		return uci.load('design');
	},

	render() {
		const m = new form.Map('design', _('Design Config'),
			_('Configure the Design theme appearance and mobile navigation shortcuts.'));
		const s = m.section(form.TypedSection, 'global', _('Theme configuration'));

		s.anonymous = true;
		s.addremove = false;

		let o = s.option(form.ListValue, 'mode', _('Theme mode'),
			_('Choose whether the theme follows your device appearance or uses a fixed color mode.'));
		o.value('normal', _('Follow System'));
		o.value('light', _('Force Light'));
		o.value('dark', _('Force Dark'));
		o.default = 'dark';
		o.rmempty = false;

		o = s.option(form.ListValue, 'navbar', _('Navigation bar setting'),
		_('Show or hide the fixed navigation bar at the bottom of the page.'));
		o.value('display', _('Display navigation bar'));
		o.value('close', _('Close navigation bar'));
		o.default = 'display';
		o.rmempty = false;

		o = s.option(form.ListValue, 'navbar_proxy', _('Navigation bar proxy'),
		_('Select which installed proxy service appears in the navigation bar, or hide the proxy shortcut.'));
		o.value('openclash', 'OpenClash');
		o.value('homeproxy', 'HomeProxy');
		o.value('shadowsocksr', 'ShadowsocksR');
		o.value('vssr', 'VSSR');
		o.value('passwall', 'PassWall');
		o.value('passwall2', 'PassWall 2');
		o.value('hide', _('Hide'));
		o.default = 'openclash';
		o.rmempty = false;

		return m.render();
	}
});
