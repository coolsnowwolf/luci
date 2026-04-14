/**
 * LuCI 版本兼容层
 * 支持 OpenWrt 21/23/24
 */
(function() {
	'use strict';

	// 检测 LuCI 版本
	window.LuciCompat = {
		version: null,
		isLegacy: false,

		init: function() {
			if (typeof L !== 'undefined' && L.env) {
				// 尝试获取版本信息
				if (L.env.luci_version) {
					this.version = L.env.luci_version;
					var majorVersion = parseInt(this.version.split('.')[0]);
					this.isLegacy = majorVersion < 23;
				} else {
					// 旧版本可能没有 luci_version
					this.isLegacy = true;
				}
			}
			return this;
		},

		// 兼容 DOM 选择器
		querySelector: function(selector) {
			return document.querySelector(selector);
		},

		// 兼容事件处理
		addEvent: function(element, event, handler) {
			if (element && element.addEventListener) {
				element.addEventListener(event, handler);
			}
		},

		// 兼容 jQuery 检测
		hasJQuery: function() {
			return typeof jQuery !== 'undefined' || typeof $ !== 'undefined';
		}
	};

	// 初始化兼容层
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', function() {
			window.LuciCompat.init();
		});
	} else {
		window.LuciCompat.init();
	}
})();
