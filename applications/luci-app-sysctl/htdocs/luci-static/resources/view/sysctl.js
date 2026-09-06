/* SPDX-License-Identifier: Apache-2.0
 *
 * luci-app-sysctl - LuCI view for kernel sysctl parameters (OpenWrt 24.10)
 * v1.4.0: modal-free architecture - all views, editors, confirmations and
 * results render inline on the page (robust against theme quirks on
 * third-party firmwares where ui.showModal may be invisible).
 *
 * Section 1: custom parameters (/etc/sysctl.d/99-luci-sysctl.conf)
 * Section 2: online preset  (/etc/sysctl.d/98-online-preset.conf)
 * Section 3: browse/search live kernel parameters from /proc/sys
 */

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callList = rpc.declare({ object: 'luci.sysctl', method: 'list' });
var callStatus = rpc.declare({ object: 'luci.sysctl', method: 'status' });
var callBrowse = rpc.declare({ object: 'luci.sysctl', method: 'browse', params: [ 'prefix' ] });
var callSearch = rpc.declare({ object: 'luci.sysctl', method: 'search', params: [ 'query', 'limit' ] });
var callSet = rpc.declare({ object: 'luci.sysctl', method: 'set', params: [ 'key', 'value', 'disabled', 'apply' ] });
var callRemove = rpc.declare({ object: 'luci.sysctl', method: 'remove', params: [ 'key' ] });
var callApply = rpc.declare({ object: 'luci.sysctl', method: 'apply' });
var callPresetStatus = rpc.declare({ object: 'luci.sysctl', method: 'preset_status' });
var callPresetFetch = rpc.declare({ object: 'luci.sysctl', method: 'preset_fetch', params: [ 'url', 'prefix' ] });
var callPresetImport = rpc.declare({ object: 'luci.sysctl', method: 'preset_import', params: [ 'url', 'prefix' ] });
var callPresetCheck = rpc.declare({ object: 'luci.sysctl', method: 'preset_check' });
var callPresetRemove = rpc.declare({
	object: 'luci.sysctl',
	method: 'preset_remove'
});

var callPresetList = rpc.declare({
	object: 'luci.sysctl',
	method: 'preset_list',
	params: [ 'url', 'prefix' ]
});
var callFileView = rpc.declare({ object: 'luci.sysctl', method: 'file_view', params: [ 'path' ] });
var callFileSet = rpc.declare({ object: 'luci.sysctl', method: 'file_set', params: [ 'path', 'key', 'value', 'disabled' ] });
var callFileDelete = rpc.declare({ object: 'luci.sysctl', method: 'file_delete', params: [ 'path', 'key' ] });

var KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.\/-]*$/;

function badge(text, kind) {
	return E('span', { 'class': 'lsc-badge lsc-badge-' + kind }, text);
}

var LSC_CSS = [
	'.lsc-root { font-size: 15px; }',
	'.lsc-root .lsc-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 2px; }',
	'.lsc-root .lsc-chip { appearance: none; border: 1px solid #d0d7de; background: #fff; color: #24292f; border-radius: 999px; padding: 4px 12px; font-size: 12.5px; line-height: 1.5; cursor: pointer; text-transform: none; font-weight: 500; transition: background .15s, color .15s, border-color .15s, box-shadow .15s; box-shadow: 0 1px 2px rgba(16,24,40,.04); }',
	'.lsc-root .lsc-chip:hover { border-color: #0969da; color: #0969da; background: #f3f8ff; }',
	'.lsc-root .lsc-chip.lsc-chip-active { background: #0969da; border-color: #0969da; color: #fff; }',
	'.lsc-root .lsc-tablewrap { border: 1px solid #e4e7ec; border-radius: 8px; overflow: auto; background: #fff; margin: 8px 0; }',
	'.lsc-root table.lsc-table { width: 100%; border-collapse: collapse; font-size: 15px; margin: 0; }',
	'.lsc-root .lsc-table thead th { background: #f6f8fa; text-align: center !important; font-weight: 600; color: #57606a; padding: 10px 12px; border-bottom: 1px solid #e4e7ec; white-space: nowrap; font-size: 15px; }',
	'.lsc-root .lsc-table tbody td { padding: 10px 12px; border-bottom: 1px solid #f0f2f4; vertical-align: middle; text-align: center !important; }',
	'.lsc-root .lsc-table tbody td .cbi-button { margin: 2px 3px; }',
	'.lsc-root .lsc-table tbody tr:last-child td { border-bottom: none; }',
	'.lsc-root .lsc-table tbody tr:nth-child(even) td { background: #fafbfc; }',
	'.lsc-root .lsc-table tbody tr:hover td { background: #f0f6ff; }',
	'.lsc-root .lsc-badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 500; line-height: 1.6; white-space: nowrap; }',
	'.lsc-root .lsc-badge-ok { background: #e6f6ec; color: #18794e; }',
	'.lsc-root .lsc-badge-warn { background: #fff3e0; color: #a35a00; }',
	'.lsc-root .lsc-badge-err { background: #fdecec; color: #b3261e; }',
	'.lsc-root .lsc-badge-off { background: #eef0f2; color: #6e7781; }',
	'.lsc-root .lsc-badge-main { background: #eef4fb; color: #34618e; }',
	'.lsc-root .lsc-card { border: 1px solid #e4e7ec; border-radius: 10px; padding: 14px 16px; background: #fff; box-shadow: 0 1px 3px rgba(16,24,40,.06); margin: 10px 0; }',
	'.lsc-root .lsc-card h3 { margin: 0 0 8px; font-size: 15px; font-weight: 600; }',
	'.lsc-root .lsc-card h4 { margin: 10px 0 4px; font-size: 13.5px; color: #57606a; }',
	'.lsc-root code { background: #f6f8fa; border: 1px solid #eef0f2; border-radius: 4px; padding: 1px 6px; font-size: 1em; word-break: break-all; }',
	'.lsc-root .cbi-button { border-radius: 6px; transition: filter .15s, box-shadow .15s, background .15s; text-transform: none; }',
	'.lsc-root .cbi-button:hover { filter: brightness(1.06); }',
	'.lsc-root h2, .lsc-root h3, .lsc-root h4, .lsc-root th, .lsc-root .lsc-badge, .lsc-root code, .lsc-root .lsc-muted, .lsc-root .cbi-section-descr, .lsc-root .lsc-card * { text-transform: none !important; }',
	'.lsc-root .lsc-muted { color: #777; }',
	'.lsc-root .cbi-page-actions { float: none !important; text-align: center !important; }'
].join('\n');

return view.extend({
	ensureStyle: function() {
		if (document.getElementById('luci-app-sysctl-style') != null)
			return;

		document.head.appendChild(E('style', { 'id': 'luci-app-sysctl-style' }, [ LSC_CSS ]));
	},

	load: function() {
		return Promise.all([ callList(), callStatus(), callPresetStatus() ]);
	},

	render: function(data) {
		this.ensureStyle();

		var list = (data[0] != null) ? data[0] : {};
		var status = (data[1] != null) ? data[1] : {};
		var preset = (data[2] != null) ? data[2] : {};

		this.customEntries = list.custom || [];
		this.mainEntries = list.main || [];
		this.statusData = status;
		this.presetData = preset;
		this.browsePrefix = '';
		this.searchTimer = null;
		this.editing = null;
		this.fileViewPath = null;
		this.fileEditing = null;
		this._armTimers = {};

		var root = E('div', { 'class': 'cbi-map lsc-root' }, [
			E('h2', {}, _('内核参数（Sysctl）管理')),
			E('div', { 'class': 'cbi-map-descr' }, _(
				'自定义参数保存在 %s，开机时由系统自动加载，也可随时点击“应用配置”立即生效。').format('/etc/sysctl.d/99-luci-sysctl.conf')),
			this.renderCustomSection(),
			this.renderPresetSection(),
			this.renderBrowseSection()
		]);

		this.refreshCustomTable();
		this.refreshSourceChips();
		this.loadBrowse('');

		return root;
	},

	/* ---------- shared helpers ---------- */

	errorBox: function(msg, hint) {
		var children = [ E('p', { 'style': 'margin:2px 0' }, msg) ];

		if (hint)
			children.push(E('p', { 'style': 'margin:2px 0;color:#666' }, hint));

		return E('div', { 'class': 'alert-message error', 'style': 'margin:6px 0' }, children);
	},

	backendErrorHint: function(msg) {
		if (/not found/i.test(msg || ''))
			return _('后端缺少该方法，通常是 rpcd 尚未重新加载插件所致。请在 SSH 执行：%s 后刷新页面。').format('/etc/init.d/rpcd restart');

		return _('可在 SSH 用 %s 验证后端。').format('ubus call luci.sysctl status');
	},

	/* Two-step inline confirmation: first click arms the button,
	 * second click (within 4s) runs the action. */
	armButton: function(btn, confirmText, action) {
		if (btn.getAttribute('data-armed') == '1') {
			btn.setAttribute('data-armed', '0');
			btn.textContent = btn.getAttribute('data-orig');
			action();
			return;
		}

		btn.setAttribute('data-armed', '1');
		btn.setAttribute('data-orig', btn.textContent);
		btn.textContent = confirmText;

		this._armTimers[btn.getAttribute('data-arm-id')] = window.setTimeout(function() {
			if (btn.getAttribute('data-armed') == '1') {
				btn.setAttribute('data-armed', '0');
				btn.textContent = btn.getAttribute('data-orig');
			}
		}, 4000);
	},

	nextArmId: function() {
		this._armSeq = (this._armSeq || 0) + 1;
		return String(this._armSeq);
	},

	/* ---------- section 1: custom parameters ---------- */

	renderCustomSection: function() {
		this.customTableBody = E('tbody', {});
		this.tableWrapBox = E('div', { 'class': 'lsc-tablewrap' });
		this.customEmptyBox = E('div', {
			'style': 'display:none;text-align:center;color:#777;padding:10px 0'
		}, _('暂无自定义参数，点击下方“添加参数”开始。'));
		this.editFormBox = E('div', { 'style': 'display:none' });
		this.fileViewBox = E('div', { 'style': 'display:none' });
		this.applyResultBox = E('div', { 'style': 'display:none' });
		this.sourceChipsBox = E('div', { 'class': 'lsc-chips' });

		var descr = [
			E('p', { 'style': 'margin:4px 0' }, [
				_('配置源（点击文件名可在下方查看/编辑，按顺序应用，后面的文件覆盖前面的同名参数）：'),
				this.sourceChipsBox
			])
		];

		var table = E('table', { 'class': 'lsc-table' }, [
			E('thead', {}, E('tr', {}, [
				E('th', {}, _('参数名')),
				E('th', {}, _('配置值')),
				E('th', {}, _('当前值')),
				E('th', {}, _('状态')),
				E('th', {}, _('操作'))
			])),
			this.customTableBody
		]);

		this.tableWrapBox.appendChild(table);

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('自定义参数')),
			E('div', { 'class': 'cbi-section-descr' }, descr),
			this.editFormBox,
			this.tableWrapBox,
			this.customEmptyBox,
			this.fileViewBox,
			this.applyResultBox,
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-add',
					'click': ui.createHandlerFn(this, 'showEditForm', null)
				}, _('添加参数')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, 'applyConfig')
				}, _('应用配置')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-negative',
					'click': ui.createHandlerFn(this, 'reloadList')
				}, _('刷新'))
			])
		]);
	},

	refreshCustomTable: function() {
		var rows = [];
		var i, e;

		/* Main-config entries (/etc/sysctl.conf) are intentionally NOT listed
		 * here anymore: they are reachable through the source chips above,
		 * showing them twice was redundant. */

		if (this.customEntries.length == 0) {
			/* hide the whole (empty) table incl. header, show a one-liner */
			this.tableWrapBox.style.display = 'none';
			this.customEmptyBox.style.display = '';
			dom.content(this.customTableBody, rows);
			return;
		}

		this.tableWrapBox.style.display = '';
		this.customEmptyBox.style.display = 'none';

		for (i = 0; i < this.customEntries.length; i++) {
			e = this.customEntries[i];

			var badgeEl;

			if (e.disabled)
				badgeEl = badge(_('已禁用'), 'off');
			else if (!e.exists)
				badgeEl = badge(_('无效参数'), 'err');
			else if (e.match)
				badgeEl = badge(_('已生效'), 'ok');
			else
				badgeEl = badge(_('未应用'), 'warn');

			var delBtn = E('button', { 'class': 'cbi-button cbi-button-remove' }, _('删除'));

			rows.push(E('tr', {}, [
				E('td', {}, [ E('code', {}, e.key) ]),
				E('td', {}, [ E('code', {}, e.value) ]),
				E('td', {}, [ E('code', {}, (e.current == null) ? '—' : e.current) ]),
				E('td', {}, badgeEl),
				E('td', { 'style': 'white-space:nowrap' }, [
					E('button', {
						'class': 'cbi-button cbi-button-edit',
						'click': ui.createHandlerFn(this, 'showEditForm', { isNew: false, entry: e })
					}, _('编辑')),
					' ',
					e.disabled
						? E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(this, 'toggleEntry', e, false) }, _('启用'))
						: E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(this, 'toggleEntry', e, true) }, _('禁用')),
					' ',
					delBtn
				])
			]));

			(function(view, entry, btn) {
				btn.addEventListener('click', function() {
					view.armButton(btn, _('确认删除？'), function() { view.removeEntry(entry); });
				});
			})(this, e, delBtn);
		}

		dom.content(this.customTableBody, rows);
	},

	showEditForm: function(entry) {
		this.editing = (entry != null) ? entry : null;
		this.editFromBrowse = (entry != null && entry.fromBrowse === true);
		this.renderEditForm();

		if (this.editing != null && this.editFormBox.scrollIntoView)
			this.editFormBox.scrollIntoView({ block: 'nearest' });
	},

	renderEditForm: function() {
		var self = this;
		var st = this.editing;

		if (st == null) {
			this.editFormBox.style.display = 'none';
			dom.content(this.editFormBox, []);
			return;
		}

		this.editFormBox.style.display = '';

		var isNew = (st.isNew === true);
		var key = (st.entry != null) ? st.entry.key : (st.key || '');

		var keyInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'style': 'width:100%',
			'placeholder': 'net.ipv4.tcp_fastopen', 'value': key
		});

		var valInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'style': 'width:100%',
			'placeholder': '3', 'value': (st.entry != null) ? st.entry.value : (st.value || '')
		});

		var applyChk = E('input', { 'type': 'checkbox' });
		applyChk.checked = true;

		var disabledChk = E('input', { 'type': 'checkbox' });
		disabledChk.checked = (!isNew && st.entry.disabled == true);

		var errBox = this.errorBox('', '');
		errBox.style.display = 'none';

		var title = isNew
			? (st.fromMain ? _('自定义覆盖主配置：%s').format(key) : _('添加内核参数'))
			: _('编辑内核参数：%s').format(key);

		var note = isNew
			? (st.fromMain
				? _('将把该参数写入自定义配置以覆盖主配置取值，主配置文件本身保持不变。')
				: _('若参数在当前内核中不存在（例如模块未加载），仍可保存，但会标记为无效。'))
			: _('修改参数名保存后将替换原条目（先写入新参数名，再删除旧参数名）。');

		var saveBtn = E('button', { 'class': 'btn cbi-button-positive important' }, _('保存'));

		saveBtn.addEventListener('click', function() { self.saveEditForm(keyInput, valInput, applyChk, disabledChk, errBox); });

		dom.content(this.editFormBox, [
			E('div', { 'class': 'lsc-card' }, [
				E('strong', {}, title),
				E('div', { 'class': 'cbi-value', 'style': 'margin-top:8px' }, [
					E('label', { 'class': 'cbi-value-title' }, _('参数名')),
					E('div', { 'class': 'cbi-value-field' }, keyInput)
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('值')),
					E('div', { 'class': 'cbi-value-field' }, valInput)
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, ' '),
					E('div', { 'class': 'cbi-value-field' }, [
						E('label', { 'style': 'display:inline-flex;align-items:center;gap:6px' }, [ applyChk, _('立即写入内核（运行时生效）') ]),
						E('label', { 'style': 'display:inline-flex;align-items:center;gap:6px;margin-left:16px' }, [ disabledChk, _('禁用该条目（写入配置但注释掉）') ])
					])
				]),
				E('div', { 'style': 'color:#666;margin-top:4px' }, note),
				errBox,
				E('div', { 'style': 'margin-top:8px' }, [
					saveBtn, ' ',
					E('button', { 'class': 'btn', 'click': ui.createHandlerFn(self, 'hideEditForm') }, _('取消'))
				])
			])
		]);
	},

	hideEditForm: function() {
		this.editing = null;
		this.renderEditForm();

		/* edit was started from the browse section: scroll back there so the
		 * user does not get lost at the top of the page */
		if (this.editFromBrowse) {
			this.editFromBrowse = false;

			if (this.browseSectionBox != null && this.browseSectionBox.scrollIntoView)
				this.browseSectionBox.scrollIntoView({ block: 'start' });
		}
	},

	saveEditForm: function(keyInput, valInput, applyChk, disabledChk, errBox) {
		var self = this;
		var st = this.editing;

		if (st == null)
			return;

		var isNew = (st.isNew === true);
		var origKey = (st.entry != null) ? st.entry.key : null;
		var key = (keyInput.value || '').trim();
		var val = (valInput.value || '').trim();
		var disabled = disabledChk.checked;
		var applyNow = applyChk.checked && !disabled;

		errBox.style.display = 'none';

		if (!KEY_RE.test(key)) {
			errBox.textContent = '';
			errBox.appendChild(E('p', {}, _('参数名格式无效，仅允许字母、数字、点、下划线和连字符。')));
			errBox.style.display = '';
			return;
		}

		if (val == '') {
			errBox.textContent = '';
			errBox.appendChild(E('p', {}, _('值不能为空。')));
			errBox.style.display = '';
			return;
		}

		var p = callSet(key, val, disabled, applyNow);

		if (!isNew && key != origKey) {
			p = p.then(function(res) {
				if (res == null || res.code != 0)
					return res;

				return callRemove(origKey).then(function() {
					return res;
				}).catch(function() {
					res.rename_leftover = origKey;
					return res;
				});
			});
		}

		p.then(function(res) {
			if (res == null || res.code != 0) {
				errBox.textContent = '';
				errBox.appendChild(self.errorBox(_('保存失败：%s').format((res != null && res.error) ? res.error : _('未知错误'))));
				errBox.style.display = '';
				return;
			}

			var notes = [];

			if (res.rename_leftover)
				notes.push(E('p', { 'style': 'color:#a80' }, _('旧参数 %s 删除失败，请在本页手动删除该条目。').format(res.rename_leftover)));

			if (!res.exists)
				notes.push(E('p', { 'style': 'color:#a80' }, _('参数 %s 在当前内核中不存在（可能模块未加载），配置已保存但不会生效。').format(key)));
			else if (applyNow && res.applied === 'readonly')
				notes.push(E('p', { 'style': 'color:#a80' }, _('参数 %s 为只读，无法在运行时修改（配置已保存，重启后尝试应用）。').format(key)));
			else if (applyNow && res.applied === false)
				notes.push(E('p', { 'style': 'color:#a80' }, _('参数 %s 已写入配置，但运行时校验不一致，请检查取值格式。').format(key)));

			if (notes.length == 0)
				notes.push(E('p', {}, (st.fromMain && isNew) ? _('已创建覆盖条目：%s。') : _('参数 %s 已保存。').format(key)));

			self.hideEditForm();
			self.reloadList();

			dom.content(self.applyResultBox, [ E('div', { 'class': 'alert-message', 'style': 'margin:6px 0' }, notes) ]);
			self.applyResultBox.style.display = '';
		}).catch(function(e) {
			errBox.textContent = '';
			errBox.appendChild(self.errorBox(_('保存失败：%s').format(e.message), self.backendErrorHint(e.message)));
			errBox.style.display = '';
		});
	},

	reloadList: function() {
		var self = this;

		return Promise.all([ callList(), callStatus(), callPresetStatus() ]).then(function(data) {
			var list = (data[0] != null) ? data[0] : {};

			self.customEntries = list.custom || [];
			self.mainEntries = list.main || [];
			self.statusData = (data[1] != null) ? data[1] : {};
			self.presetData = (data[2] != null) ? data[2] : {};
			self.refreshCustomTable();
			self.refreshPresetStatus();
			self.refreshSourceChips();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('加载失败：%s').format(e.message)), 'error');
		});
	},

	refreshSourceChips: function() {
		var self = this;
		var files = (this.statusData != null && this.statusData.files != null) ? this.statusData.files : [];

		if (this.sourceChipsBox == null)
			return;

		var chips = [];

		/* Plugin-managed files (98-online-preset.conf, 99-luci-sysctl.conf)
		 * are managed through their dedicated sections; opening them via the
		 * file panel is refused by the backend, so hide their chips. */
		var pluginManaged = {
			'/etc/sysctl.d/99-luci-sysctl.conf': true,
			'/etc/sysctl.d/98-online-preset.conf': true
		};

		for (var i = 0; i < files.length; i++) {
			var f = files[i];

			if (pluginManaged[f.path])
				continue;

			chips.push(E('button', {
				'class': 'lsc-chip' + (this.fileViewPath == f.path ? ' lsc-chip-active' : ''),
				'title': _('点击查看并可编辑该文件内的参数'),
				'click': ui.createHandlerFn(self, 'showFileView', f.path)
			}, '%s (%d)'.format(f.path.replace('/etc/', ''), f.count)));
		}

		dom.content(this.sourceChipsBox, chips);
	},

	toggleEntry: function(entry, disabled) {
		var self = this;

		return callSet(entry.key, entry.value, disabled, false).then(function(res) {
			if (res == null || res.code != 0) {
				ui.addNotification(null,
					E('p', {}, _('操作失败：%s').format((res != null && res.error) ? res.error : 'unknown error')),
					'error');
			}

			self.reloadList();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('操作失败：%s').format(e.message)), 'error');
		});
	},

	removeEntry: function(entry) {
		var self = this;

		return callRemove(entry.key).then(function(res) {
			if (res == null || res.code != 0) {
				ui.addNotification(null,
					E('p', {}, _('删除失败：%s').format((res != null && res.error) ? res.error : 'unknown error')),
					'error');
			}

			self.reloadList();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('删除失败：%s').format(e.message)), 'error');
		});
	},

	applyConfig: function() {
		var self = this;

		dom.content(this.applyResultBox, [ E('p', { 'style': 'color:#777;padding:6px' }, _('正在应用全部配置，请稍候…')) ]);
		this.applyResultBox.style.display = '';

		return callApply().then(function(res) {
			var errors = (res != null && res.errors != null) ? res.errors : [];
			var content;

			if (res == null || res.code != 0) {
				content = self.errorBox(_('应用失败：%s').format((res != null && res.error) ? res.error : 'unknown error'));
			}
			else if (errors.length == 0) {
				content = E('div', { 'class': 'alert-message', 'style': 'margin:6px 0' }, [
					E('p', {}, _('全部配置已成功应用。'))
				]);
			}
			else {
				var items = [];

				for (var i = 0; i < errors.length; i++)
					items.push(E('li', {}, [
						E('strong', {}, errors[i].file),
						E('pre', { 'style': 'white-space:pre-wrap;margin:4px 0' }, errors[i].output || '')
					]));

				content = E('div', { 'class': 'alert-message warning', 'style': 'margin:6px 0' }, [
					E('p', {}, _('应用完成，以下文件存在报错（常见原因：参数不存在、只读或权限不足）：')),
					E('ul', {}, items)
				]);
			}

			dom.content(self.applyResultBox, [ content ]);
			self.reloadList();
		}).catch(function(e) {
			dom.content(self.applyResultBox, [ self.errorBox(_('应用失败：%s').format(e.message), self.backendErrorHint(e.message)) ]);
		});
	},

	/* ---------- per-file viewing / editing (inline) ---------- */

	showFileView: function(path) {
		this.fileViewPath = (this.fileViewPath == path) ? null : path;
		this.fileEditing = null;
		this.refreshSourceChips();
		this.renderFilePanel();
	},

	renderFilePanel: function() {
		var self = this;
		var path = this.fileViewPath;
		var box = this.fileViewBox;

		if (path == null) {
			box.style.display = 'none';
			dom.content(box, []);
			return;
		}

		box.style.display = '';
		dom.content(box, [
			E('h3', { 'style': 'text-align:center' }, _('文件内容：%s').format(path)),
			E('p', { 'style': 'color:#777;text-align:center' }, _('加载中…'))
		]);

		callFileView(path).then(function(res) {
			if (self.fileViewPath != path)
				return;

			if (res == null || res.code != 0) {
				dom.content(box, [
					E('h3', { 'style': 'text-align:center' }, _('文件内容：%s').format(path)),
					self.errorBox((res != null && res.error) ? res.error : _('未知错误'), self.backendErrorHint(res != null ? res.error : ''))
				]);
				return;
			}

			var rows = [];

			for (var i = 0; i < (res.entries || []).length; i++) {
				var e = res.entries[i];
				var editing = (self.fileEditing != null && self.fileEditing.key == e.key);

				if (editing) {
					rows.push(self.renderFileEditRow(res.path, e));
					continue;
				}

				var ops;

				if (res.editable) {
					var delBtn = E('button', { 'class': 'cbi-button cbi-button-remove' }, _('删除'));

					ops = [
						E('button', { 'class': 'cbi-button cbi-button-edit', 'click': ui.createHandlerFn(self, 'editFileEntry', path, e) }, _('编辑')),
						' ',
						e.disabled
							? E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(self, 'fileToggle', path, e, false) }, _('启用'))
							: E('button', { 'class': 'cbi-button cbi-button-remove', 'click': ui.createHandlerFn(self, 'fileToggle', path, e, true) }, _('禁用')),
						' ',
						delBtn
					];

					(function(view, p, entry, btn) {
						btn.addEventListener('click', function() {
							view.armButton(btn, _('确认删除？'), function() { view.fileDelete(p, entry); });
						});
					})(self, res.path, e, delBtn);
				}
				else {
					ops = [ E('button', {
						'class': 'cbi-button cbi-button-add',
						'click': ui.createHandlerFn(self, 'showEditForm', { isNew: true, key: e.key, value: e.value, fromMain: true })
					}, _('自定义')) ];
				}

				rows.push(E('tr', {}, [
					E('td', {}, [ E('code', {}, (e.disabled ? '# ' : '') + e.key) ]),
					E('td', {}, [ E('code', {}, e.value) ]),
					E('td', {}, [ E('code', {}, (e.disabled || e.current == null) ? '—' : e.current) ]),
					E('td', { 'style': 'white-space:nowrap' }, ops)
				]));
			}

			if (rows.length == 0)
				rows.push(E('tr', {}, E('td', { 'colspan': 4, 'style': 'text-align:center;color:#777;padding:12px' },
					_('（空文件）'))));

			var note = res.editable
				? _('此文件中的参数可直接编辑/禁用/删除，保存即写入 %s；点击"应用配置"后对内核生效。').format(res.path)
				: _('此文件由插件管理，不支持直接编辑：在线预设请在下方"在线预设"区更新，自定义参数请在上方表格中管理。');

			dom.content(box, [
				E('h3', { 'style': 'text-align:center' }, _('文件内容：%s').format(res.path)),
				E('p', { 'style': 'margin:4px 0;color:#666;text-align:center' }, note),
				E('div', { 'class': 'lsc-tablewrap' }, E('table', { 'class': 'lsc-table' }, [
					E('thead', {}, E('tr', {}, [
						E('th', {}, _('参数')),
						E('th', {}, _('配置值')),
						E('th', {}, _('当前值')),
						E('th', {}, _('操作'))
					])),
					E('tbody', rows)
				])),
				E('div', { 'style': 'margin-top:8px;text-align:center' }, [
					E('button', { 'class': 'btn', 'click': ui.createHandlerFn(self, 'hideFileView') }, _('收起'))
				])
			]);
		}).catch(function(e) {
			if (self.fileViewPath != path)
				return;

			dom.content(box, [
				E('h3', { 'style': 'text-align:center' }, _('文件内容：%s').format(path)),
				self.errorBox(_('读取失败：%s').format(e.message), self.backendErrorHint(e.message))
			]);
		});
	},

	renderFileEditRow: function(path, entry) {
		var self = this;

		var valInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'style': 'width:95%', 'value': entry.value
		});

		var disabledChk = E('input', { 'type': 'checkbox' });
		disabledChk.checked = (entry.disabled == true);

		var saveBtn = E('button', { 'class': 'cbi-button cbi-button-positive important' }, _('保存'));

		saveBtn.addEventListener('click', function() {
			var val = (valInput.value || '').trim();

			if (val == '') {
				alert(_('值不能为空。'));
				return;
			}

			callFileSet(path, entry.key, val, disabledChk.checked).then(function(res) {
				if (res == null || res.code != 0) {
					alert(_('保存失败：%s').format((res != null && res.error) ? res.error : _('未知错误')));
					return;
				}

				self.fileEditing = null;
				self.renderFilePanel();
				self.reloadList();
			}).catch(function(e) {
				alert(_('保存失败：%s').format(e.message));
			});
		});

		return E('tr', { 'style': 'background:#fafafa' }, [
			E('td', {}, [ E('code', {}, entry.key) ]),
			E('td', { 'colspan': 2 }, [
				valInput, ' ',
				E('label', { 'style': 'display:inline-flex;align-items:center;gap:4px' }, [ disabledChk, _('禁用') ])
			]),
			E('td', { 'style': 'white-space:nowrap' }, [
				saveBtn, ' ',
				E('button', { 'class': 'btn', 'click': ui.createHandlerFn(self, 'cancelFileEdit') }, _('取消'))
			])
		]);
	},

	editFileEntry: function(path, entry) {
		this.fileEditing = entry;
		this.renderFilePanel();
	},

	cancelFileEdit: function() {
		this.fileEditing = null;
		this.renderFilePanel();
	},

	fileToggle: function(path, entry, disabled) {
		var self = this;

		return callFileSet(path, entry.key, entry.value, disabled).then(function(res) {
			if (res == null || res.code != 0) {
				ui.addNotification(null,
					E('p', {}, _('操作失败：%s').format((res != null && res.error) ? res.error : _('未知错误'))),
					'error');
			}

			self.renderFilePanel();
			self.reloadList();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('操作失败：%s').format(e.message)), 'error');
		});
	},

	fileDelete: function(path, entry) {
		var self = this;

		return callFileDelete(path, entry.key).then(function(res) {
			if (res == null || res.code != 0) {
				ui.addNotification(null,
					E('p', {}, _('删除失败：%s').format((res != null && res.error) ? res.error : _('未知错误'))),
					'error');
			}

			self.renderFilePanel();
			self.reloadList();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('删除失败：%s').format(e.message)), 'error');
		});
	},

	hideFileView: function() {
		this.fileViewPath = null;
		this.fileEditing = null;
		this.refreshSourceChips();
		this.renderFilePanel();
	},

	/* ---------- section 2: online preset ---------- */

	renderPresetSection: function() {
		var self = this;

		this.presetStatusLine = E('div', { 'style': 'margin:6px 0;padding:6px 10px;background:#f5f5f5;border-radius:3px' });
		this.presetResultBox = E('div', { 'style': 'display:none' });

		this.presetUrlInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'style': 'width:100%',
			'placeholder': 'https://github.com/user/repo/blob/main/sysctl.conf（也支持 raw 地址）'
		});

		this.presetPrefixInput = E('input', {
			'type': 'text', 'class': 'cbi-input-text', 'style': 'width:260px',
			'placeholder': 'https://gh-proxy.org/'
		});

		var delBtn = E('button', { 'class': 'cbi-button cbi-button-remove' }, _('移除预设'));

		delBtn.addEventListener('click', function() {
			self.armButton(delBtn, _('确认移除？'), function() { self.presetRemove(); });
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('在线预设')),
			E('div', { 'class': 'cbi-section-descr' }, [
				E('p', { 'style': 'margin:4px 0' }, _(
					'从在线源（GitHub 等）获取现成的 sysctl 优化配置，预览确认后一键导入。')),
				E('p', { 'style': 'margin:4px 0' }, _(
					'预设保存于 %s，由本插件整体管理（更新时全量替换）。如需覆盖个别条目，请在上方"自定义参数"中添加，其加载顺序更靠后、优先级更高。').format('/etc/sysctl.d/98-online-preset.conf'))
			]),
			this.presetStatusLine,
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('配置源 URL')),
				E('div', { 'class': 'cbi-value-field' }, this.presetUrlInput)
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('镜像前缀（可选）')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.presetPrefixInput,
					E('div', { 'style': 'color:#777;margin-top:2px' },
						_('直连 GitHub 不可用时填写镜像前缀，最终地址为 前缀 + 原始 URL。'))
				])
			]),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', { 'class': 'cbi-button cbi-button-apply', 'click': ui.createHandlerFn(this, 'presetFetchPreview') }, _('获取并预览')),
				' ',
				E('button', { 'class': 'cbi-button cbi-button-find', 'click': ui.createHandlerFn(this, 'presetCheckUpdates') }, _('检查更新')),
				' ',
				delBtn
			]),
			this.presetResultBox
		]);
	},

	refreshPresetStatus: function() {
		var p = this.presetData || {};
		var line;

		if (p.present) {
			line = [ E('strong', {}, _('已导入') + '：'), _('%d 条参数').format(p.count || 0) ];

			if (p.source) {
				line.push(E('span', { 'style': 'color:#777' }, ' · ' + _('来源') + ' '));
				line.push(E('span', { 'style': 'word-break:break-all' }, p.source));
			}

			if (p.fetched) {
				line.push(E('span', { 'style': 'color:#777' }, ' · ' + _('更新于') + ' '));
				line.push(this.formatEpoch(p.fetched));
			}
		}
		else {
			line = [ E('span', { 'style': 'color:#777' }, _('尚未导入在线预设。')) ];
		}

		dom.content(this.presetStatusLine, line);
	},

	formatEpoch: function(s) {
		var n = Number(s);

		if (s == null || s === '' || isNaN(n) || n <= 0)
			return '—';

		try {
			return new Date(n * 1000).toLocaleString();
		} catch (e) {
			return String(s);
		}
	},

	presetFetchPreview: function() {
		var self = this;
		var url = (this.presetUrlInput.value || '').trim();

		if (url == '') {
			this.showPresetResult(this.errorBox(_('请先填写配置源 URL。')));
			return;
		}

		this.showPresetResult(E('p', { 'style': 'color:#777;padding:6px' }, _('正在获取配置源信息，请稍候…')));

		return callPresetList(url, (this.presetPrefixInput.value || '').trim()).then(function(lres) {
			if (lres != null && lres.is_dir) {
				self.renderPresetDirList(lres);
				return;
			}

			return self.fetchAndPreviewPresetFile(url);
		}).catch(function(e) {
			self.showPresetResult(self.errorBox(_('获取失败：%s').format(e.message), self.backendErrorHint(e.message)));
		});
	},

	showPresetResult: function(content) {
		this.presetResultBox.style.display = '';
		dom.content(this.presetResultBox, [ content ]);
	},

	fetchAndPreviewPresetFile: function(url) {
		var self = this;
		var prefix = (this.presetPrefixInput.value || '').trim();

		this.showPresetResult(E('p', { 'style': 'color:#777;padding:6px' }, _('正在下载并解析预设，请稍候…')));

		return callPresetFetch(url, prefix).then(function(res) {
			if (res == null || res.code != 0) {
				self.showPresetResult(self.errorBox(
					(res != null && res.error) ? res.error : _('未知错误'),
					self.backendErrorHint(res != null ? res.error : '')));
				return;
			}

			self.renderPresetPreview(res);
		}).catch(function(e) {
			self.showPresetResult(self.errorBox(_('获取失败：%s').format(e.message), self.backendErrorHint(e.message)));
		});
	},

	renderPresetDirList: function(res) {
		var self = this;
		var rows = [];

		for (var i = 0; i < (res.files || []).length; i++) {
			(function(f) {
				var btn = E('button', {
					'class': 'lsc-chip',
					'style': 'font-size:13px;padding:5px 14px'
				}, f.name + (f.size > 0 ? '  ·  ' + (f.size / 1024).toFixed(1) + ' KB' : ''));

				btn.addEventListener('click', function() { self.fetchAndPreviewPresetFile(f.url); });
				rows.push(E('li', { 'style': 'margin:2px 0' }, btn));
			})(res.files[i]);
		}

		this.presetResultBox.style.display = '';
		dom.content(this.presetResultBox, [
			E('h3', {}, _('预设目录')),
			E('p', { 'style': 'margin:4px 0;color:#666' },
				_('该地址是一个目录，发现 %d 个预设文件。点击要导入的文件（下载时同样使用镜像前缀）：').format(res.files.length)),
			E('ul', { 'style': 'margin:8px 0;padding-left:4px;list-style:none' }, rows),
			E('div', { 'style': 'margin-top:10px' }, [
				E('button', { 'class': 'btn', 'click': ui.createHandlerFn(this, 'hidePresetResult') }, _('收起'))
			])
		]);
	},

	renderPresetPreview: function(res) {
		var self = this;
		var rows = [];
		var notes = [];
		var i;

		var cmap = {};

		for (i = 0; i < (res.conflicts || []).length; i++)
			cmap[res.conflicts[i].key] = res.conflicts[i].file;

		for (i = 0; i < (res.params || []).length; i++) {
			var it = res.params[i];
			var conflictFile = cmap[it.key] || '';

			rows.push(E('tr', {}, [
				E('td', {}, [ E('code', {}, it.key) ]),
				E('td', {}, [ E('code', {}, it.value) ]),
				E('td', { 'style': 'color:#a80' }, conflictFile ? _('覆盖本地 %s').format(conflictFile.replace('/etc/', '')) : '')
			]));
		}

		notes.push(E('p', {}, _('共解析出 %d 条参数，来源：%s。').format(res.params.length, res.url)));

		if ((res.conflicts || []).length > 0)
			notes.push(E('p', { 'class': 'alert-message warning', 'style': 'margin:6px 0' },
				_('%d 条参数与本地现有配置同名，导入后将覆盖其取值。').format(res.conflicts.length)));

		if ((res.invalid || []).length > 0)
			notes.push(E('p', { 'class': 'alert-message warning', 'style': 'margin:6px 0' },
				_('%d 行无法解析已忽略（常见为说明文字或格式错误的行）。').format(res.invalid.length)));

		var importBtn = E('button', { 'class': 'btn cbi-button-positive important' }, _('导入到路由器'));

		importBtn.addEventListener('click', function() { self.presetImport(res.url); });

		dom.content(this.presetResultBox, [
			E('h3', {}, _('预设预览')),
			E('div', {}, notes),
			E('div', { 'style': 'max-height:320px;overflow:auto' }, E('div', { 'class': 'lsc-tablewrap' }, E('table', { 'class': 'lsc-table' }, [
				E('thead', {}, E('tr', {}, [ E('th', {}, _('参数')), E('th', {}, _('值')), E('th', {}, _('冲突')) ])),
				E('tbody', rows)
			]))),
			E('div', { 'style': 'margin-top:10px' }, [
				importBtn, ' ',
				E('button', { 'class': 'btn', 'click': ui.createHandlerFn(this, 'hidePresetResult') }, _('取消'))
			])
		]);
	},

	presetImport: function(url) {
		var self = this;

		return callPresetImport(url, '').then(function(res) {
			if (res == null || res.code != 0) {
				dom.content(self.presetResultBox, [ self.errorBox(_('导入失败：%s').format((res != null && res.error) ? res.error : _('未知错误'))) ]);
				return;
			}

			dom.content(self.presetResultBox, [
				E('div', { 'class': 'alert-message', 'style': 'margin:6px 0' }, [
					E('p', {}, _('已导入 %d 条预设参数到 %s。点击"应用配置"可立即生效。').format(res.count, res.path))
				])
			]);

			self.reloadList();
		}).catch(function(e) {
			dom.content(self.presetResultBox, [ self.errorBox(_('导入失败：%s').format(e.message), self.backendErrorHint(e.message)) ]);
		});
	},

	presetCheckUpdates: function() {
		var self = this;

		dom.content(this.presetResultBox, [ E('p', { 'style': 'color:#777;padding:6px' }, _('正在对比在线版本与本地预设，请稍候…')) ]);
		this.presetResultBox.style.display = '';

		return callPresetCheck().then(function(res) {
			if (res == null || res.code != 0) {
				dom.content(self.presetResultBox, [ self.errorBox(
					(res != null && res.error) ? res.error : _('未知错误'),
					self.backendErrorHint(res != null ? res.error : '')) ]);
				return;
			}

			if ((res.added || []).length == 0 && (res.changed || []).length == 0 && (res.removed || []).length == 0) {
				dom.content(self.presetResultBox, [
					E('div', { 'class': 'alert-message', 'style': 'margin:6px 0' }, [
						E('p', {}, _('在线预设已是最新，共 %d 条参数。').format(res.remote_count))
					])
				]);
				return;
			}

			self.renderPresetDiff(res);
		}).catch(function(e) {
			dom.content(self.presetResultBox, [ self.errorBox(_('检查更新失败：%s').format(e.message), self.backendErrorHint(e.message)) ]);
		});
	},

	renderPresetDiff: function(res) {
		var self = this;
		var blocks = [];
		var i;

		var mkTable = function(headers, rows) {
			return E('div', { 'class': 'lsc-tablewrap' }, E('table', { 'class': 'lsc-table' }, [
				E('thead', {}, E('tr', {}, headers.map(function(h) { return E('th', {}, h); }))),
				E('tbody', rows)
			]));
		};

		if ((res.added || []).length > 0) {
			var addRows = [];

			for (i = 0; i < res.added.length; i++)
				addRows.push(E('tr', {}, [
					E('td', {}, [ E('code', {}, res.added[i].key) ]),
					E('td', {}, [ E('code', {}, res.added[i].value) ])
				]));

			blocks.push(E('div', {}, [
				E('h4', {}, _('新增 %d 条').format(res.added.length)),
				mkTable([ _('参数'), _('值') ], addRows)
			]));
		}

		if ((res.changed || []).length > 0) {
			var chgRows = [];

			for (i = 0; i < res.changed.length; i++)
				chgRows.push(E('tr', {}, [
					E('td', {}, [ E('code', {}, res.changed[i].key) ]),
					E('td', {}, [ E('code', {}, res.changed[i].from) ]),
					E('td', {}, [ E('code', {}, res.changed[i].to) ])
				]));

			blocks.push(E('div', {}, [
				E('h4', {}, _('变更 %d 条').format(res.changed.length)),
				mkTable([ _('参数'), _('当前值'), _('新值') ], chgRows)
			]));
		}

		if ((res.removed || []).length > 0) {
			var rmRows = [];

			for (i = 0; i < res.removed.length; i++)
				rmRows.push(E('tr', {}, [
					E('td', {}, [ E('code', {}, res.removed[i].key) ]),
					E('td', {}, [ E('code', {}, res.removed[i].old) ])
				]));

			blocks.push(E('div', {}, [
				E('h4', {}, _('移除 %d 条').format(res.removed.length)),
				mkTable([ _('参数'), _('当前值') ], rmRows)
			]));
		}

		var applyBtn = E('button', { 'class': 'btn cbi-button-positive important' }, _('应用更新'));

		applyBtn.addEventListener('click', function() { self.presetImport(res.url); });

		dom.content(this.presetResultBox, [
			E('h3', {}, _('发现在线预设更新')),
			E('p', {}, _('在线版本共 %d 条，本地 %d 条。更新会整体替换 %s。').format(res.remote_count, res.local_count, '/etc/sysctl.d/98-online-preset.conf')),
			E('div', { 'style': 'max-height:380px;overflow:auto' }, blocks),
			E('div', { 'style': 'margin-top:10px' }, [
				applyBtn, ' ',
				E('button', { 'class': 'btn', 'click': ui.createHandlerFn(this, 'hidePresetResult') }, _('取消'))
			])
		]);
	},

	hidePresetResult: function() {
		this.presetResultBox.style.display = 'none';
		dom.content(this.presetResultBox, []);
	},

	presetRemove: function() {
		var self = this;

		return callPresetRemove().then(function(res) {
			if (res == null || res.code != 0) {
				ui.addNotification(null,
					E('p', {}, _('移除失败：%s').format((res != null && res.error) ? res.error : 'unknown error')),
					'error');
			}

			self.reloadList();
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('移除失败：%s').format(e.message)), 'error');
		});
	},

	/* ---------- section 3: browse / search ---------- */

	renderBrowseSection: function() {
		var self = this;

		this.browseTableBody = E('tbody', {});
		this.crumbs = E('div', { 'style': 'margin:6px 0' });
		this.searchInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'style': 'width:280px;display:inline-block',
			'placeholder': _('搜索参数名或值（至少 2 个字符）')
		});

		this.searchInput.addEventListener('input', function() { self.onSearchInput(); });

		var searchBtn = E('button', { 'class': 'cbi-button cbi-button-find', 'click': ui.createHandlerFn(this, 'doSearch') }, _('搜索'));

		var table = E('table', { 'class': 'lsc-table' }, [
			E('thead', {}, E('tr', {}, [
				E('th', {}, _('参数')),
				E('th', {}, _('当前值')),
				E('th', {}, _('操作'))
			])),
			this.browseTableBody
		]);

		var box = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('浏览内核参数')),
			E('div', { 'class': 'cbi-section-descr' },
				_('浏览 /proc/sys 下的实时参数。点击目录进入子级，也可直接搜索；点击“自定义”可将参数加入上方自定义列表。')),
			E('div', { 'style': 'margin:8px 0' }, [ this.searchInput, ' ', searchBtn ]),
			this.crumbs,
			E('div', { 'class': 'lsc-tablewrap' }, table)
		]);

		this.browseSectionBox = box;

		return box;
	},

	onSearchInput: function() {
		var self = this;

		if (this.searchTimer != null)
			window.clearTimeout(this.searchTimer);

		this.searchTimer = window.setTimeout(function() { self.doSearch(); }, 500);
	},

	doSearch: function() {
		var self = this;
		var q = (this.searchInput.value || '').trim();

		if (this.searchTimer != null) {
			window.clearTimeout(this.searchTimer);
			this.searchTimer = null;
		}

		if (q.length < 2) {
			this.browsePrefix = '';
			this.loadBrowse('');
			return;
		}

		this.browsePrefix = null;
		this.crumbsUpdate();

		dom.content(this.browseTableBody, E('tr', {},
			E('td', { 'colspan': 3, 'style': 'text-align:center;color:#777;padding:12px' }, _('搜索中…'))));

		callSearch(q, 500).then(function(res) {
			var items = (res != null && res.items != null) ? res.items : [];

			self.renderSearchResults(items, (res != null && res.truncated == true), q);
		}).catch(function(e) {
			dom.content(self.browseTableBody, E('tr', {},
				E('td', { 'colspan': 3, 'class': 'alert-message error' }, _('搜索失败：%s').format(e.message))));
		});
	},

	renderSearchResults: function(items, truncated, q) {
		var rows = [];

		items.sort(function(a, b) { return (a.key < b.key) ? -1 : (a.key > b.key) ? 1 : 0; });

		for (var i = 0; i < items.length; i++)
			rows.push(this.renderParamRow(items[i].key, items[i].value));

		if (rows.length == 0)
			rows.push(E('tr', {}, E('td', { 'colspan': 3, 'style': 'text-align:center;color:#777;padding:12px' },
				_('没有匹配“%s”的参数。').format(q))));

		if (truncated)
			rows.push(E('tr', {}, E('td', { 'colspan': 3, 'style': 'color:#e80' },
				_('结果过多已截断，请输入更精确的关键词。'))));

		dom.content(this.browseTableBody, rows);
	},

	renderParamRow: function(key, value) {
		var self = this;

		return E('tr', { 'class': 'cbi-section-table-row' }, [
			E('td', {}, [ E('code', {}, key) ]),
			E('td', {}, [ E('code', {}, value) ]),
			E('td', {}, E('button', {
				'class': 'cbi-button cbi-button-add',
				'click': ui.createHandlerFn(self, 'showEditForm', { isNew: true, key: key, value: value, fromBrowse: true })
			}, _('自定义')))
		]);
	},

	loadBrowse: function(prefix) {
		var self = this;

		dom.content(this.browseTableBody, E('tr', {},
			E('td', { 'colspan': 3, 'style': 'text-align:center;color:#777;padding:12px' }, _('加载中…'))));

		this.crumbsUpdate();

		callBrowse(prefix).then(function(res) {
			var items = (res != null && res.items != null) ? res.items : [];
			var rows = [];

			for (var i = 0; i < items.length; i++) {
				var it = items[i];

				if (it.type == 'group') {
					rows.push(E('tr', { 'class': 'cbi-section-table-row' }, [
						E('td', {}, E('a', {
							'href': '#',
							'click': ui.createHandlerFn(self, 'browseInto', it.prefix)
						}, [ E('strong', {}, it.name + '/') ])),
						E('td', {}, E('span', { 'style': 'color:#999' }, _('目录'))),
						E('td', {}, E('a', {
							'href': '#',
							'style': 'text-decoration:none',
							'click': ui.createHandlerFn(self, 'browseInto', it.prefix)
						}, _('进入')))
					]));
				}
				else {
					rows.push(self.renderParamRow(it.key, it.value));
				}
			}

			if (rows.length == 0)
				rows.push(E('tr', {}, E('td', { 'colspan': 3, 'style': 'text-align:center;color:#777;padding:12px' },
					_('（空）'))));

			dom.content(self.browseTableBody, rows);
		}).catch(function(e) {
			dom.content(self.browseTableBody, E('tr', {},
				E('td', { 'colspan': 3, 'class': 'alert-message error' }, _('加载失败：%s').format(e.message))));
		});
	},

	browseInto: function(prefix) {
		this.browsePrefix = prefix;
		this.loadBrowse(prefix);
	},

	crumbsUpdate: function() {
		var self = this;
		var parts = [ E('a', {
			'href': '#',
			'click': ui.createHandlerFn(this, 'browseInto', '')
		}, _('根目录')) ];

		if (this.browsePrefix == null) {
			parts.push(E('span', { 'style': 'color:#777' }, ' › ' + _('搜索') + ': ' + this.searchInput.value));
		}
		else if (this.browsePrefix != '') {
			var segs = this.browsePrefix.replace(/\.$/, '').split('.');
			var acc = '';

			for (var i = 0; i < segs.length; i++) {
				acc += segs[i] + '.';

				parts.push(E('span', { 'style': 'color:#777' }, ' › '));
				parts.push(E('a', {
					'href': '#',
					'click': ui.createHandlerFn(this, 'browseInto', acc)
				}, segs[i]));
			}

			/* one-click step back to the parent directory */
			var parentPrefix = (segs.length > 1)
				? segs.slice(0, segs.length - 1).join('.') + '.'
				: '';

			parts.push(E('span', { 'style': 'color:#777' }, '  '));
			parts.push(E('a', {
				'href': '#',
				'style': 'margin-left:12px',
				'click': ui.createHandlerFn(this, 'browseInto', parentPrefix)
			}, _('← 返回上一级')));
		}

		dom.content(this.crumbs, parts);
	}
});

