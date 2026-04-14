'use strict';
'require baseclass';
'require rpc';

var callMountPoints = rpc.declare({
	object: 'luci',
	method: 'getMountPoints',
	expect: { result: [] }
});

function progressbar(value, max, byte) {
	var vn = parseInt(value) || 0,
	    mn = parseInt(max) || 100,
	    fv = byte ? String.format('%1024.2mB', value) : value,
	    fm = byte ? String.format('%1024.2mB', max) : max,
	    pc = Math.floor((100 / mn) * vn);

	return E('div', {
		'class': 'cbi-progressbar',
		'title': '%s / %s (%d%%)'.format(fv, fm, pc)
	}, E('div', { 'style': 'width:%.2f%%'.format(pc) }));
}

return baseclass.extend({
	title: _('Storage'),

	load: function() {
		return Promise.all([
			L.resolveDefault(callMountPoints(), {}),
		]);
	},

	render: function(data) {
		var mounts = data[0],
		    overlay = null;

		for (var i = 0; i < mounts.length; i++) {
			if (mounts[i].mount == '/overlay') {
				overlay = mounts[i];
				break;
			}
		}

		if (!overlay) {
			for (var j = 0; j < mounts.length; j++) {
				if (mounts[j].mount == '/') {
					overlay = mounts[j];
					break;
				}
			}
		}

		var table = E('table', { 'class': 'table' });

		if (overlay) {
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, [ overlay.mount ]),
				E('td', { 'class': 'td left' }, [
					progressbar(overlay.size - overlay.free, overlay.size, true)
				])
			]));
		}

		return table;
	}
});
