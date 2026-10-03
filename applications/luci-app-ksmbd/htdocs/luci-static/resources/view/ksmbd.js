'use strict';
'require view';
'require fs';
'require form';

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(fs.stat('/sbin/block'), null),
			L.resolveDefault(fs.stat('/etc/config/fstab'), null),
			L.resolveDefault(fs.trimmed('/proc/sys/kernel/hostname'), ''),
		]);
	},
	render: function(stats) {
		var m, s, o;

		m = new form.Map('ksmbd', _('Network Shares'));

		s = m.section(form.TypedSection, 'globals', 'Ksmbd');
		s.anonymous = true;

		s.tab('general',  _('General Settings'));
		s.tab('template', _('Edit Template'), _('Edit the template that is used for generating the ksmbd configuration.'));

		o = s.taboption('general', form.Flag, 'enabled', _('Enable'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('general', form.Value, 'name', _('Hostname'));
		o.placeholder = stats[2].split('.')[0];
		o.datatype = 'hostname';
		o.maxlength = 15;
		o.rmempty = true;

		o = s.taboption('general', form.Value, 'description', _('Description'));
		o.placeholder = 'Ksmbd on OpenWrt';

		o = s.taboption('general', form.Value, 'workgroup', _('Workgroup'));
		o.placeholder = 'WORKGROUP';

		o = s.taboption('general', form.Flag, 'homes', _('Share home-directories'),
			_('Allow system users to reach their home directories via network shares'));
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('general', form.Flag, 'autoshare', _('Auto Share'),
			_('Auto share local disk which connected'));
		o.default = '1';
		o.rmempty = false;

		o = s.taboption('template', form.TextValue, '_tmpl',
			null,
			_("This is the content of the file '/etc/ksmbd/ksmbd.conf.template' from which your ksmbd configuration will be generated. \
			Values enclosed by pipe symbols ('|') should not be changed. They get their values from the 'General Settings' tab."));
		o.rows = 20;
		o.cfgvalue = function(section_id) {
			return fs.trimmed('/etc/ksmbd/ksmbd.conf.template');
		};
		o.write = function(section_id, formvalue) {
			return fs.write('/etc/ksmbd/ksmbd.conf.template', formvalue.trim().replace(/\r\n/g, '\n') + '\n');
		};


		s = m.section(form.TableSection, 'share', _('Shared Directories'),
			_('Please add directories to share. Each directory refers to a folder on a mounted device.'));
		s.anonymous = true;
		s.addremove = true;

		s.option(form.Value, 'name', _('Name'));
		o = s.option(form.Value, 'path', _('Path'));
		if (stats[0] && stats[1]) {
			o.titleref = L.url('admin', 'system', 'mounts');
		}

		o = s.option(form.Value, 'users', _('Allowed users'));
		o.rmempty = true;

		o = s.option(form.Flag, 'read_only', _('Read-only'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'no';
		o.rmempty = false;

		o = s.option(form.Flag, 'browseable', _('Browseable'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'yes';
		o.rmempty = false;

		o = s.option(form.Flag, 'guest_ok', _('Allow guests'));
		o.enabled = 'yes';
		o.disabled = 'no';
		o.default = 'yes';
		o.rmempty = false;

		o = s.option(form.Value, 'create_mask', _('Create mask'), _('Mask for new files'));
		o.maxlength = 4;
		o.default = '0666'; // ksmbd.conf default is '0744'
		o.placeholder = '0666';
		o.rmempty = false;

		o = s.option(form.Value, 'dir_mask', _('Directory mask'), _('Mask for new directories'));
		o.maxlength = 4;
		o.default = '0777'; // ksmbd.conf default is '0755'
		o.placeholder = '0777';
		o.rmempty = false;

		return m.render();
	}
});
