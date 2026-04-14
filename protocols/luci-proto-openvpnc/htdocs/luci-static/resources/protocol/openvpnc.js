'use strict';
'require form';
'require network';
'require uci';
'require ui';

var profileDirectory = '/etc/openvpn/openvpnc';

network.registerPatternVirtual(/^vpn-.+$/);

function getProfilePath(section, section_id) {
	return section.formvalue(section_id, 'ovpn_file') ||
		uci.get('network', section_id, 'ovpn_file') ||
		'%s/default-%s.ovpn'.format(profileDirectory, section_id);
}

function getAuthPath(section, section_id) {
	var profile = getProfilePath(section, section_id);

	if (profile != null && profile !== '')
		return profile.replace(/\.ovpn$/, '.auth');

	return '%s/default-%s.auth'.format(profileDirectory, section_id);
}

return network.registerProtocol('openvpnc', {
	getI18n: function() {
		return _('OpenVPN Client');
	},

	getIfname: function() {
		return this._ubus('l3_device') || 'vpn-%s'.format(this.sid);
	},

	getOpkgPackage: function() {
		return 'openvpn';
	},

	isFloating: function() {
		return true;
	},

	isVirtual: function() {
		return true;
	},

	getDevices: function() {
		return null;
	},

	containsDevice: function(ifname) {
		return (network.getIfnameOf(ifname) == this.getIfname());
	},

	renderFormOptions: function(s) {
		var o;

		o = s.taboption('general', form.FileUpload, 'ovpn_file', _('OpenVPN configuration'),
			_('Upload or choose the client profile stored under %s. Only .ovpn files are accepted.').format(profileDirectory));
		o.root_directory = profileDirectory;
		o.enable_remove = false;
		o.rmempty = false;
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var browserEl = new ui.FileUpload((cfgvalue != null) ? cfgvalue : this.default, {
				id: this.cbid(section_id),
				name: this.cbid(section_id),
				show_hidden: this.show_hidden,
				enable_upload: this.enable_upload,
				enable_remove: this.enable_remove,
				root_directory: this.root_directory,
				disabled: (this.readonly != null) ? this.readonly : this.map.readonly
			});

			browserEl.renderListing = function(container, path, list) {
				return ui.FileUpload.prototype.renderListing.apply(this, [
					container,
					path,
					list.filter(function(entry) {
						return entry.type == 'directory' ||
							(entry.type == 'file' && entry.name.match(/\.ovpn$/));
					})
				]);
			};

			return browserEl.render();
		};
		o.validate = function(section_id, value) {
			if (value == null || value === '')
				return _('Please upload or choose an .ovpn file');

			if (value.indexOf(profileDirectory + '/') !== 0)
				return _('Selected file must be stored in %s').format(profileDirectory);

			if (!value.match(/\.ovpn$/))
				return _('Selected file must use the .ovpn extension');

			return true;
		};

		o = s.taboption('general', form.Value, 'username', _('Username'),
			_('If the selected profile uses auth-user-pass, a matching .auth file will be generated automatically from these credentials.'));
		o.rmempty = true;

		o = s.taboption('general', form.Value, 'password', _('Password'));
		o.password = true;
		o.rmempty = true;

		o = s.taboption('advanced', form.Flag, 'custom_dns_enable', _('Allow custom DNS servers'),
			_('When enabled, the DNS servers entered below will be added to this interface even if the OpenVPN server does not push any DNS settings.'));
		o.rmempty = false;
		o.default = o.disabled;

		o = s.taboption('advanced', form.Value, 'custom_dns', _('Custom DNS servers'),
			_('Enter one or more DNS server addresses separated by spaces or commas, for example: 1.1.1.1,8.8.8.8'));
		o.placeholder = '1.1.1.1 8.8.8.8';
		o.depends('custom_dns_enable', '1');
		o.rmempty = true;

		o = s.taboption('advanced', form.Flag, 'extra_routes_enable', _('Allow extra route networks'),
			_('When enabled, the custom route networks entered below will be appended after the route networks pushed by the OpenVPN server.'));
		o.rmempty = false;
		o.default = o.disabled;

		o = s.taboption('advanced', form.Value, 'extra_routes', _('Extra route networks'),
			_('Enter one or more IPv4 CIDR networks separated by spaces or commas, for example: 10.0.0.0/24,172.16.10.0/24'));
		o.placeholder = '10.0.0.0/24 172.16.10.0/24';
		o.depends('extra_routes_enable', '1');
		o.rmempty = true;

		o = s.taboption('advanced', form.Flag, 'domain_dns_enable', _('Resolve specific domains via custom DNS'),
			_('When enabled, dnsmasq will forward the domains entered below to the custom DNS servers through the generated ovpnc.conf file in its active conf-dir directory.'));
		o.rmempty = false;
		o.default = o.disabled;
		o.depends('custom_dns_enable', '1');

		o = s.taboption('advanced', form.Value, 'dns_domains', _('Domains resolved by custom DNS'),
			_('Enter one or more domains separated by spaces or commas, for example: corp.example.com'));
		o.placeholder = 'corp.example.com';
		o.depends('domain_dns_enable', '1');
		o.rmempty = true;

		o = s.taboption('advanced', form.DummyValue, '_auth_file', _('Authentication file'));
		o.cfgvalue = function(section_id) {
			return getAuthPath(this.section, section_id);
		};

		o = s.taboption('advanced', form.Value, 'mtu', _('Override MTU'));
		o.placeholder = '1500';
		o.datatype = 'max(9200)';
		o.rmempty = true;

		o = s.taboption('advanced', form.DummyValue, '_profile_path', _('Stored profile path'));
		o.cfgvalue = function(section_id) {
			return getProfilePath(this.section, section_id);
		};
	}
});
