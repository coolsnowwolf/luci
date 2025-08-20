// SPDX-License-Identifier: Apache-2.0
/*
 * Copyright (C) 2025 ImmortalWrt.org
 */

'use strict';
'require form';
'require view';

return view.extend({
	render() {
		let m, s, o;

		m = new form.Map('autoreboot', _('Scheduled Reboot'),
			_('Configure the scheduled restart of this device.'));

		s = m.section(form.TableSection, 'schedule');
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.rowcolors = true;
		s.addbtntitle = _('Add schedule');

		o = s.option(form.Flag, 'enabled', _('Enable'));
		o.rmempty = false;
		o.width = '10%';

		o = s.option(form.Value, 'week', _('Week'));
		o.value('*', _('Every day'));
		o.value('1', _('Monday'));
		o.value('2', _('Tuesday'));
		o.value('3', _('Wednesday'));
		o.value('4', _('Thursday'));
		o.value('5', _('Friday'));
		o.value('6', _('Saturday'));
		o.value('0', _('Sunday'));
		o.default = '*';
		o.rmempty = false;
		o.width = '18%';
		o.renderWidget = function(/* ... */) {
			let dl = form.Value.prototype.renderWidget.apply(this, arguments);
			dl?.style?.setProperty('min-width', '100%');
			return dl;
		}
		o.validate = function(section_id, value) {
			if (!value?.match(/^(\*|[0-6](-[0-6])?)(\/[1-9][0-9]*)?(,(\*|[0-6](-[0-6])?)(\/[1-9][0-9]*)?)*$/))
				return _('Expecting: %s').format(_('valid week value'));
			return true;
		}

		o = s.option(form.Value, 'hour', _('Hour'));
		o.rmempty = false;
		o.width = '18%';
		o.validate = function(section_id, value) {
			if (!value?.match(/^(\*|(1?[0-9]|2[0-3])(-(1?[0-9]|2[0-3]))?)(\/[1-9][0-9]*)?(,(\*|(1?[0-9]|2[0-3])(-(1?[0-9]|2[0-3]))?)(\/[1-9][0-9]*)?)*$/))
				return _('Expecting: %s').format(_('valid hour value'));
			return true;
		}

		o = s.option(form.Value, 'minute', _('Minute'));
		o.rmempty = false;
		o.width = '18%';
		o.validate = function(section_id, value) {
			if (!value?.match(/^(\*|[1-5]?[0-9](-[1-5]?[0-9])?)(\/[1-9][0-9]*)?(,(\*|[1-5]?[0-9](-[1-5]?[0-9])?)(\/[1-9][0-9]*)?)*$/))
				return _('Expecting: %s').format(_('valid minute value'));
			return true;
		}

		o = s.option(form.Value, 'month', _('Month'));
		o.value('*', _('Every month'));
		o.value('1', _('January'));
		o.value('2', _('February'));
		o.value('3', _('March'));
		o.value('4', _('April'));
		o.value('5', _('May'));
		o.value('6', _('June'));
		o.value('7', _('July'));
		o.value('8', _('August'));
		o.value('9', _('September'));
		o.value('10', _('October'));
		o.value('11', _('November'));
		o.value('12', _('December'));
		o.default = '*';
		o.rmempty = false;
		o.width = '18%';
		o.renderWidget = function(/* ... */) {
			let dl = form.Value.prototype.renderWidget.apply(this, arguments);
			dl?.style?.setProperty('min-width', '100%');
			return dl;
		}
		o.validate = function(section_id, value) {
			if (!value?.match(/^(\*|([1-9]|1[0-2]?)(-([1-9]|1[0-2]?))?)(\/[1-9][0-9]*)?(,(\*|([1-9]|1[0-2]?)(-([1-9]|1[0-2]?))?)(\/[1-9][0-9]*)?)*$/))
				return _('Expecting: %s').format(_('valid month value'));
			return true;
		}

		o = s.option(form.Value, 'day', _('Day of month'));
		o.validate = function(section_id, value) {
			if (!value?.match(/^(\*|([1-9]|[1-2][0-9]?|3[0-1])(-([1-9]|[1-2][0-9]?|3[0-1]))?)(\/[1-9][0-9]*)?(,(\*|([1-9]|[1-2][0-9]?|3[0-1])(-([1-9]|[1-2][0-9]?|3[0-1]))?)(\/[1-9][0-9]*)?)*$/))
				return _('Expecting: %s').format(_('valid day value'));
			return true;
		}
		o.default = '*';
		o.rmempty = false;
		o.width = '18%';

		return m.render();
	}
});
