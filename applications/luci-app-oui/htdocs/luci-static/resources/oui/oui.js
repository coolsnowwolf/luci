/* SPDX-License-Identifier: GPL-2.0-only */
(function(window, document) {
	'use strict';
	if (window.luciOUI)
		return;

	var base = document.currentScript.src.replace(/[^/]*$/, '');
	var database, pending, devices = Object.create(null);

	function normalize(mac, allowLocal) {
		if (typeof mac !== 'string' || !/^(?:[\da-f]{12}|(?:[\da-f]{2}:){5}[\da-f]{2}|(?:[\da-f]{2}-){5}[\da-f]{2})$/i.test(mac))
			return null;
		mac = mac.replace(/[:-]/g, '').toUpperCase();
		// Neither locally administered (randomized) nor multicast addresses have a reliable OUI.
		var flags = parseInt(mac.slice(0, 2), 16);
		return (flags & 1) || (!allowLocal && (flags & 2)) ? null : mac;
	}

	function load() {
		if (!pending) {
			// One local request per page; failed requests are cached too, so polling never retries.
			pending = new Promise(function(resolve) {
				var xhr = new XMLHttpRequest();
				xhr.open('GET', base + 'vendors-d337209f8c00.json', true);
				xhr.timeout = 5000;
				xhr.onload = function() {
					try {
						if (xhr.status === 200) {
							var data = JSON.parse(xhr.responseText);
							if (Array.isArray(data.vendors) && data.prefixes && typeof data.prefixes === 'object')
								database = data;
						}
					} catch (e) { /* Leave the hostname unchanged on missing or invalid data. */ }
					resolve(database);
				};
				xhr.onerror = xhr.ontimeout = xhr.onabort = function() { resolve(null); };
				xhr.send();
			});
		}
		return pending;
	}

	function lookup(mac) {
		mac = normalize(mac);
		if (!mac || !database)
			return null;
		if (devices[mac]) {
			for (var v = 0; v < database.vendors.length; v++)
				if (database.vendors[v][0] === devices[mac])
					return database.vendors[v];
		}
		// The resident prefix map also caches misses without retaining every client's MAC.
		for (var i = 0, lengths = [9, 7, 6]; i < lengths.length; i++) {
			var prefix = mac.slice(0, lengths[i]);
			if (Object.prototype.hasOwnProperty.call(database.prefixes, prefix)) {
				var index = database.prefixes[prefix];
				return index == null ? null : database.vendors[index];
			}
		}
		return null;
	}

	function decorate(node, mac, fnos) {
		if (node.querySelector('.luci-oui-icon'))
			return;
		var icon = document.createElement('img');
		icon.className = 'luci-oui-icon';
		icon.width = icon.height = 20;
		icon.alt = '';
		icon.style.cssText = 'display:inline-block;width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-inline-end:6px;background:#fff;border-radius:3px;padding:2px;box-sizing:content-box';
		function fallback() {
			icon.title = 'Unknown vendor';
			icon.onerror = function() { icon.remove(); };
			icon.src = base + 'computer.svg';
		}
		fallback();
		node.insertBefore(icon, node.firstChild);
		var unicast = normalize(mac, true);
		if (unicast && (parseInt(unicast.slice(0, 2), 16) & 2)) {
			icon.title = 'Private MAC';
			icon.onerror = fallback;
			icon.src = base + 'phone.svg';
			return;
		}
		if (fnos === true) {
			icon.title = 'fnOS / FygoOS';
			icon.onerror = fallback;
			icon.src = base + 'fnos.svg';
			return;
		}
		// Malformed or absent addresses use the fallback without an OUI request.
		if (!normalize(mac))
			return;
		function apply() {
			var vendor = lookup(mac);
			if (!vendor || !/^[a-z0-9]+$/.test(vendor[0]))
				return;
			icon.title = vendor[1];
			icon.onerror = fallback;
			icon.src = base + vendor[0] + '.svg';
		}
		if (database)
			apply();
		else
			load().then(apply);
	}

	window.luciOUI = {
		decorate: decorate,
		setDevices: function(sections) {
			devices = Object.create(null);
			(sections || []).forEach(function(section) {
				var mac = normalize(section.mac);
				if (mac && typeof section.vendor === 'string' && /^[a-z0-9]+$/.test(section.vendor))
					devices[mac] = section.vendor;
			});
		}
	};
})(window, document);
