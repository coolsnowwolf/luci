(function ($) {
    function applySafeAreaFix() {
        var url = self.location.href;

        // 修复某些插件导致在 https 下 env(safe-area-inset-bottom) 为 0 的情况
        if ((/(iPhone|iPad|iPod|iOS|Mac|Macintosh)/i.test(navigator.userAgent)) && url.indexOf("openclash") !== -1) {
            var oMeta = document.createElement('meta');
            oMeta.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0,viewport-fit=cover';
            oMeta.name = 'viewport';
            document.getElementsByTagName('head')[0].appendChild(oMeta);
        }
    }

    function setHeaderShadow() {
        if (window.innerWidth <= 992) {
            $("header").css("box-shadow", "0 2px 4px rgb(0 0 0 / 8%)");
        } else {
            $("header").css("box-shadow", "17rem 2px 4px rgb(0 0 0 / 8%)");
        }
    }

    function syncIndicators() {
        var indicatorRoot = document.getElementById("indicators");

        if (!indicatorRoot) {
            return;
        }

        Array.prototype.forEach.call(indicatorRoot.querySelectorAll('[data-indicator]'), function (indicator) {
            var id = indicator.getAttribute('data-indicator');
            var label = (indicator.textContent || '').trim();

            if (!label) {
                label = indicator.getAttribute('aria-label') || indicator.getAttribute('title') || '';
            }

            if (id === 'poll-status') {
                indicator.setAttribute('title', label);
                indicator.setAttribute('aria-label', label);
            } else if (id === 'uci-changes') {
                var match = label.match(/(\d+)\s*$/);

                indicator.setAttribute('title', label);
                indicator.setAttribute('aria-label', label);
                indicator.setAttribute('data-count', match ? match[1] : '');
            }
        });
    }

    function initIndicators() {
        var indicatorRoot = document.getElementById("indicators");

        if (!indicatorRoot) {
            return;
        }

        syncIndicators();

        new MutationObserver(syncIndicators).observe(indicatorRoot, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-style']
        });
    }

    function syncOverviewPortStatus() {
        var view = document.getElementById('view');
        var portGroups = new Map();
        var mediaPath = (L.env && L.env.media) ? L.env.media : '/luci-static/design';
        var iconMap = {
            'alias': 'ethernet',
            'alias_disabled': 'ethernet_disabled',
            'bridge': 'bridge',
            'bridge_disabled': 'bridge_disabled',
            'ethernet': 'ethernet',
            'ethernet_disabled': 'ethernet_disabled',
            'switch': 'switch',
            'switch_disabled': 'switch_disabled',
            'tunnel': 'tunnel',
            'tunnel_disabled': 'tunnel_disabled',
            'vlan': 'vlan',
            'vlan_disabled': 'vlan_disabled',
            'wifi': 'wifi',
            'wifi_disabled': 'wifi_disabled',
            'port_up': 'port_up',
            'port_down': 'port_down'
        };

        if (!view || document.body.getAttribute('data-page') !== 'admin-status-overview') {
            return;
        }

        Array.prototype.forEach.call(view.querySelectorAll('img[src*="/luci-static/resources/icons/"]'), function (img) {
            var src = img.getAttribute('src') || '';
            var match = src.match(/\/icons\/([^/?#]+)\.png(?:[?#].*)?$/);
            var key = match ? match[1] : '';
            var mapped = iconMap[key];
            var badge = img.closest('.ifacebadge');

            if (!mapped || !badge) {
                return;
            }

            img.setAttribute('src', mediaPath + '/images/' + mapped + '.png');
            img.style.setProperty('background-image', 'none', 'important');
            img.style.setProperty('visibility', 'visible', 'important');
            img.style.setProperty('opacity', '1', 'important');
            img.style.setProperty('display', 'inline-block', 'important');
            img.style.setProperty('width', key.indexOf('port_') === 0 ? '18px' : '20px', 'important');
            img.style.setProperty('height', key.indexOf('port_') === 0 ? '18px' : '20px', 'important');
            img.style.setProperty('min-width', key.indexOf('port_') === 0 ? '18px' : '20px', 'important');
            img.style.setProperty('padding', '0', 'important');
            img.style.setProperty('margin', '0 .25rem 0 0', 'important');
            img.style.setProperty('vertical-align', 'middle', 'important');
            img.style.setProperty('object-fit', 'contain', 'important');
        });

        Array.prototype.forEach.call(view.querySelectorAll('.cbi-section > div'), function (grid) {
            var isPortGrid = grid &&
                grid.style &&
                grid.style.display === 'grid' &&
                grid.style.gridTemplateColumns.indexOf('minmax(70px, 1fr)') !== -1 &&
                grid.querySelector('img[src*="/luci-static/resources/icons/port_"]');

            if (!isPortGrid) {
                return;
            }

            grid.classList.add('port-status-grid');

            Array.prototype.forEach.call(grid.querySelectorAll('.ifacebox'), function (card) {
                card.classList.add('port-status-card');
            });
        });

        Array.prototype.forEach.call(view.querySelectorAll('img[src*="/luci-static/resources/icons/port_"]'), function (img) {
            var card = img.closest('.ifacebox');
            var slot = card ? card.closest('.port-status-slot') : null;
            var parent = card ? (slot ? slot.parentElement : card.parentElement) : null;
            var iconType = (img.getAttribute('src') || '').indexOf('port_down.png') !== -1 ? 'down' : 'up';
            var badge = img.closest('.ifacebadge');

            if (badge) {
                img.setAttribute('src', mediaPath + '/images/port_' + iconType + '.png');
            }

            if (!card || !parent) {
                return;
            }

            img.setAttribute('src', mediaPath + '/images/port_' + iconType + '.png');
            img.style.setProperty('display', 'block', 'important');
            img.style.setProperty('width', '24px', 'important');
            img.style.setProperty('height', '24px', 'important');
            img.style.setProperty('padding', '0', 'important');
            img.style.setProperty('margin', '0.05rem auto', 'important');

            if (img.nextElementSibling && img.nextElementSibling.tagName === 'BR') {
                img.nextElementSibling.style.setProperty('display', 'none', 'important');
            }

            if (!portGroups.has(parent)) {
                portGroups.set(parent, []);
            }

            if (portGroups.get(parent).indexOf(card) === -1) {
                portGroups.get(parent).push(card);
            }
        });

        portGroups.forEach(function (cards, parent) {
            var width = window.innerWidth || document.documentElement.clientWidth || 1280;
            var columns;

            cards.forEach(function (card) {
                var body = card.querySelector('.ifacebox-body');
                var slot = card.parentElement;

                if (!slot || !slot.classList.contains('port-status-slot')) {
                    slot = document.createElement('div');
                    slot.className = 'port-status-slot';
                    parent.insertBefore(slot, card);
                    slot.appendChild(card);
                }

                card.classList.add('port-status-card');

                slot.style.setProperty('display', 'flex', 'important');
                slot.style.setProperty('justify-content', 'center', 'important');
                slot.style.setProperty('align-items', 'stretch', 'important');
                slot.style.setProperty('min-width', '0', 'important');
                slot.style.setProperty('padding', '0.15rem 0.65rem 0.75rem', 'important');

                card.style.setProperty('margin', '0', 'important');
                card.style.setProperty('min-width', '76px', 'important');
                card.style.setProperty('max-width', '108px', 'important');
                card.style.setProperty('width', 'fit-content', 'important');
                card.style.setProperty('text-align', 'center', 'important');

                if (body) {
                    body.style.setProperty('text-align', 'center', 'important');
                    body.style.setProperty('align-items', 'center', 'important');
                    body.style.setProperty('justify-content', 'center', 'important');
                }
            });

            if (width <= 480) {
                columns = 1;
            } else if (width <= 768) {
                columns = Math.min(cards.length, 2);
            } else if (cards.length <= 4) {
                columns = cards.length;
            } else if (cards.length <= 6) {
                columns = 3;
            } else {
                columns = 4;
            }

            parent.style.setProperty('display', 'grid', 'important');
            parent.style.setProperty('grid-template-columns', 'repeat(' + columns + ', minmax(0, 1fr))', 'important');
            parent.style.setProperty('align-items', 'stretch', 'important');
            parent.style.setProperty('justify-items', 'stretch', 'important');
            parent.style.setProperty('width', '100%', 'important');
            parent.style.setProperty('max-width', '100%', 'important');
            parent.style.setProperty('padding', '0.2rem 0.6rem 0.35rem', 'important');
            parent.style.setProperty('margin', '0 auto 1rem', 'important');
            parent.style.setProperty('row-gap', '0.2rem', 'important');
            parent.style.setProperty('column-gap', '0', 'important');
        });
    }

    function initOverviewPortStatus() {
        var view = document.getElementById('view');

        if (!view || document.body.getAttribute('data-page') !== 'admin-status-overview') {
            return;
        }

        syncOverviewPortStatus();

        new MutationObserver(syncOverviewPortStatus).observe(view, {
            childList: true,
            subtree: true
        });
    }

    function syncNetworkInterfaceIcons() {
        var view = document.getElementById('view');
        var mediaPath = (L.env && L.env.media) ? L.env.media : '/luci-static/design';
        var iconMap = {
            'alias': 'ethernet',
            'alias_disabled': 'ethernet_disabled',
            'bridge': 'bridge',
            'bridge_disabled': 'bridge_disabled',
            'ethernet': 'ethernet',
            'ethernet_disabled': 'ethernet_disabled',
            'switch': 'switch',
            'switch_disabled': 'switch_disabled',
            'tunnel': 'tunnel',
            'tunnel_disabled': 'tunnel_disabled',
            'vlan': 'vlan',
            'vlan_disabled': 'vlan_disabled',
            'wifi': 'wifi',
            'wifi_disabled': 'wifi_disabled'
        };

        if (!view || document.body.getAttribute('data-page') !== 'admin-network-network') {
            return;
        }

        Array.prototype.forEach.call(view.querySelectorAll('img[src*="/luci-static/resources/icons/"]'), function (img) {
            var src = img.getAttribute('src') || '';
            var match = src.match(/\/icons\/([^/?#]+)\.png(?:[?#].*)?$/);
            var key = match ? match[1] : '';
            var mapped = iconMap[key];

            if (!mapped) {
                return;
            }

            img.setAttribute('src', mediaPath + '/images/' + mapped + '.png');
            img.classList.add('theme-network-icon');
            img.style.setProperty('background-image', 'none', 'important');
            img.style.setProperty('object-fit', 'contain', 'important');
        });
    }

    function initNetworkInterfaceIcons() {
        var view = document.getElementById('view');

        if (!view || document.body.getAttribute('data-page') !== 'admin-network-network') {
            return;
        }

        syncNetworkInterfaceIcons();

        new MutationObserver(syncNetworkInterfaceIcons).observe(view, {
            childList: true,
            subtree: true
        });
    }

    function syncWirelessIcons() {
        var mediaPath = (L.env && L.env.media) ? L.env.media : '/luci-static/design';
        var iconMap = {
            'wifi': 'wifi_big',
            'wifi_disabled': 'wifi_big_disabled',
            'signal-none': 'signal-none',
            'signal-0': 'signal-0',
            'signal-0-25': 'signal-0-25',
            'signal-25-50': 'signal-25-50',
            'signal-50-75': 'signal-50-75',
            'signal-75-100': 'signal-75-100'
        };

        if (document.body.getAttribute('data-page') !== 'admin-network-wireless') {
            return;
        }

        Array.prototype.forEach.call(document.querySelectorAll('img[src*="/luci-static/resources/icons/"]'), function (img) {
            var src = img.getAttribute('src') || '';
            var match = src.match(/\/icons\/([^/?#]+)\.png(?:[?#].*)?$/);
            var key = match ? match[1] : '';
            var inAssocList = !!img.closest('#wifi_assoclist_table');
            var mapped = iconMap[key];
            var badge = img.closest('.ifacebadge') || img.closest('.center');
            var isDeviceIcon = (key === 'wifi' || key === 'wifi_disabled');
            var size = isDeviceIcon ? '64px' : '18px';

            if (!mapped || !badge) {
                return;
            }

            if (inAssocList && isDeviceIcon) {
                mapped = key;
                size = '16px';
            }

            img.setAttribute('src', mediaPath + '/images/' + mapped + '.png');
            img.classList.add('theme-wireless-icon');
            img.style.setProperty('background-image', 'none', 'important');
            img.style.setProperty('visibility', 'visible', 'important');
            img.style.setProperty('opacity', '1', 'important');
            img.style.setProperty('display', 'inline-block', 'important');
            img.style.setProperty('width', size, 'important');
            img.style.setProperty('height', size, 'important');
            img.style.setProperty('min-width', size, 'important');
            img.style.setProperty('padding', '0', 'important');
            img.style.setProperty('margin', (inAssocList && isDeviceIcon) ? '0 .2rem 0 0' : (isDeviceIcon ? '0 .3rem 0 0' : '0 .25rem 0 0'), 'important');
            img.style.setProperty('vertical-align', 'middle', 'important');
            img.style.setProperty('object-fit', 'contain', 'important');
        });
    }

    function initWirelessIcons() {
        if (document.body.getAttribute('data-page') !== 'admin-network-wireless') {
            return;
        }

        syncWirelessIcons();

        new MutationObserver(syncWirelessIcons).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function init() {
        applySafeAreaFix();
        initIndicators();
        initOverviewPortStatus();
        initNetworkInterfaceIcons();
        initWirelessIcons();
        setHeaderShadow();
        $(window).on('resize', setHeaderShadow);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(jQuery);
