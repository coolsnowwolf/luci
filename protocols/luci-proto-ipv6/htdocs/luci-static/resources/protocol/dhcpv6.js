'use strict';
'require form';
'require network';

return network.registerProtocol('dhcpv6', {
	getI18n: function() {
		return _('DHCPv6 client');
	},

	getOpkgPackage: function() {
		return 'odhcp6c';
	},

	renderFormOptions: function(s) {
		var o,
		    reqprefixChoices = [ 'auto', 'no', '48', '52', '56', '60', '64' ];

		o = s.taboption('general', form.ListValue, 'reqaddress', _('Request IPv6-address'));
		o.value('try');
		o.value('force');
		o.value('none', 'disabled');
		o.default = 'try';

		o = s.taboption('general', form.ListValue, '_reqprefix_selector', _('Request IPv6-prefix of length'));
		o.value('auto', _('Automatic'));
		o.value('no', _('disabled'));
		o.value('48');
		o.value('52');
		o.value('56');
		o.value('60');
		o.value('64');
		o.value('__custom__', _('Custom'));
		o.default = 'auto';
		o.rmempty = false;
		o.cfgvalue = function(section_id) {
			var value = this.section.cfgvalue(section_id, 'reqprefix');
			if (value == null || value === '')
				return 'auto';
			return (reqprefixChoices.indexOf(value) > -1) ? value : '__custom__';
		};
		o.write = function(section_id, value) {
			if (value == '__custom__')
				return;

			return this.map.data.set('network', section_id, 'reqprefix', value);
		};
		o.remove = function() {};

		o = s.taboption('general', form.Value, '_reqprefix_custom', _('Custom IPv6-prefix length'));
		o.depends('_reqprefix_selector', '__custom__');
		o.rmempty = true;
		o.datatype = 'uinteger';
		o.placeholder = '56';
		o.cfgvalue = function(section_id) {
			var value = this.section.cfgvalue(section_id, 'reqprefix');
			if (value == null || value === '')
				return '';
			return (reqprefixChoices.indexOf(value) > -1) ? '' : value;
		};
		o.validate = function(section_id, value) {
			var selector = this.map.lookupOption('_reqprefix_selector', section_id),
			    selected = selector ? selector[0].formvalue(selector[1]) : null;

			if (selected == '__custom__' && (value == null || value === ''))
				return _('Please enter a custom IPv6-prefix length');

			return true;
		};
		o.write = function(section_id, value) {
			var selector = this.map.lookupOption('_reqprefix_selector', section_id),
			    selected = selector ? selector[0].formvalue(selector[1]) : null;

			if (selected != '__custom__')
				return;

			return this.map.data.set('network', section_id, 'reqprefix', value);
		};
		o.remove = function() {};

		o = s.taboption('general', form.Flag, 'norelease', _('Do not send a Release when restarting'),
						_('Enable to minimise the chance of prefix change after a restart'));

		o = s.taboption('advanced', form.Value, 'clientid', _('Client ID to send when requesting DHCP'));
		o.datatype  = 'hexstring';
	}
});
