// SPDX-License-Identifier: Apache-2.0
/*
 * Copyright (C) 2025 ImmortalWrt.org
 */

'use strict';
'require form';
'require fs';
'require view';

return view.extend({
	load() {
		return Promise.all([
			L.resolveDefault(fs.stat('/sbin/block'), null),
			L.resolveDefault(fs.stat('/etc/config/fstab'), null),
		]);
	},

	render(stats) {
		let m, s, o;

		m = new form.Map('cifs-mount', _('Mount SMB/CIFS NetShare'));

		s = m.section(form.GridSection, 'mount', _('CIFS/SMB Mount Points'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.rowcolors = true;
		s.modaltitle = _('Edit Mount Point');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.editable = true;

		o = s.option(form.Value, 'server', _('Server address'));
		o.datatype = 'host';
		o.rmempty = false;

		o = s.option(form.Value, 'remote_path', _('Share folder'));
		o.datatype = 'path';
		o.rmempty = false;

		o = s.option(form.Value, 'local_path', _('Mount point'));
		if (stats[0] && stats[1]) {
			o.titleref = L.url('admin', 'system', 'mounts');
		}
		o.value('/mnt');
		o.datatype = 'path';
		o.rmempty = false;

		o = s.option(form.ListValue, 'smb_version', _('SMB version'));
		o.value('', _('Default'));
		o.value('1.0', 'SMBv1');
		o.value('2.0', 'SMBv2');
		o.value('2.1', 'SMBv2.1');
		o.value('3.0', 'SMBv3');
		o.modalonly = true;

		o = s.option(form.Value, 'iocharset', _('Charset'));
		o.value('-', _('Not set'));
		o.value('utf8', 'UTF-8');
		o.default = 'utf8';
		o.rmempty = false;
		o.modalonly = true;

		o = s.option(form.Flag, 'ro', _('Read only'));
		o.editable = true;

		o = s.option(form.Value, 'username', _('Username'));
		o.value('guest', _('Guest'));

		o = s.option(form.Value, 'password', _('Password'));
		o.password = true;
		o.modalonly = true;

		o = s.option(form.Value, 'workgroup', _('Workgroup'));
		o.value('WORKGROUP');
		o.modalonly = true;

		o = s.option(form.DynamicList, 'options', _('Mount options'));
		o.modalonly = true;

		return m.render();
	}
});
