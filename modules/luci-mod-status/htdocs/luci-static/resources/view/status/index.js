'use strict';
'require view';
'require dom';
'require poll';
'require network';
'require ui';

return view.extend({
	overviewCacheTtl: 30000,

	wrapDeferredInclude: function(spec) {
		return {
			title: spec.title,
			deferFirstLoad: true,
			_moduleName: spec.name,
			_include: null,
			_loading: null,

			resolveModule: function() {
				if (this._include != null)
					return Promise.resolve(this._include);

				if (this._loading != null)
					return this._loading;

				this._loading = L.resolveDefault(L.require(this._moduleName), null).then(L.bind(function(include) {
					this._include = include;
					this._loading = null;

					if (include != null && include.title != null)
						this.title = include.title;

					return include;
				}, this)).catch(L.bind(function(err) {
					this._loading = null;
					return Promise.reject(err);
				}, this));

				return this._loading;
			},

			load: function() {
				return this.resolveModule().then(function(include) {
					return (include != null && typeof(include.load) == 'function') ? include.load() : null;
				});
			},

			render: function(result) {
				return (this._include != null && typeof(this._include.render) == 'function')
					? this._include.render(result)
					: null;
			}
		};
	},

	getIncludeCacheKey: function(include) {
		return 'luci.status.include.%s'.format(include.id || '');
	},

	restoreIncludeCache: function(include, container) {
		var cached;
		var now = Date.now();

		if (include.disableCache || !window.sessionStorage || !include.id)
			return false;

		try {
			cached = JSON.parse(window.sessionStorage.getItem(this.getIncludeCacheKey(include)));
		}
		catch (err) {
			cached = null;
		}

		if (!cached || typeof(cached.html) != 'string' || typeof(cached.ts) != 'number')
			return false;

		if ((now - cached.ts) > this.overviewCacheTtl) {
			window.sessionStorage.removeItem(this.getIncludeCacheKey(include));
			return false;
		}

		container.innerHTML = cached.html;
		container.setAttribute('data-cached', '1');
		return true;
	},

	cacheIncludeContent: function(include, container) {
		if (include.disableCache || !window.sessionStorage || !include.id)
			return;

		try {
			window.sessionStorage.setItem(this.getIncludeCacheKey(include), JSON.stringify({
				ts: Date.now(),
				html: container.innerHTML
			}));
		}
		catch (err) {
		}
	},

	clearIncludeCache: function(include) {
		if (include.disableCache || !window.sessionStorage || !include.id)
			return;

		window.sessionStorage.removeItem(this.getIncludeCacheKey(include));
	},

	renderIncludePlaceholder: function(container) {
		dom.content(container,
			E('p', {}, E('em', { 'class': 'spinning' },
				[ _('Collecting data...') ])
			)
		);
	},

	applyIncludeResult: function(include, container, result, first_load) {
		var content = null;

		if (include.hide && !first_load)
			return;

		if (typeof(include.render) == 'function')
			content = include.render(result);
		else if (include.content != null)
			content = include.content;

		if (typeof(include.oneshot) == 'function') {
			include.oneshot(result);
			include.oneshot = null;
		}

		if (content != null) {
			container.parentNode.style.display = '';
			container.parentNode.classList.add('fade-in');

			if (!include.hide) {
				dom.content(container, content);
				container.removeAttribute('data-cached');
				this.cacheIncludeContent(include, container);
			}
		}
		else if (first_load) {
			container.parentNode.style.display = 'none';
			this.clearIncludeCache(include);
		}
	},

	loadInclude: function(include, container, first_load) {
		if (include.hide && !first_load)
			return Promise.resolve(null);

		if (!include.hide && !container.hasAttribute('data-cached'))
			this.renderIncludePlaceholder(container);

		if (typeof(include.load) == 'function') {
			return include.load().then(L.bind(function(result) {
				this.applyIncludeResult(include, container, result, first_load);
				return result;
			}, this)).catch(function() {
				return null;
			});
		}

		this.applyIncludeResult(include, container, null, first_load);
		return Promise.resolve(null);
	},

	handleToggleSection: function(include, container, ev) {
		var btn = ev.currentTarget;

		include.hide = !include.hide;

		btn.setAttribute('data-style', include.hide ? 'active' : 'inactive');
		btn.setAttribute('class', include.hide ? 'label notice' : 'label');
		btn.firstChild.data = include.hide ? _('Show') : _('Hide');
		btn.blur();

		container.style.display = include.hide ? 'none' : 'block';

		if (include.hide) {
			localStorage.setItem(include.id, 'hide');
		} else {
			if (!this.restoreIncludeCache(include, container))
				this.renderIncludePlaceholder(container);
			localStorage.removeItem(include.id);
			this.loadInclude(include, container, false);
		}
	},

	invokeIncludesLoad: function(includes, first_load) {
		var tasks = [];

		for (var i = 0; i < includes.length; i++) {
			if (includes[i].hide && !first_load) {
				tasks.push(Promise.resolve(null));
				continue;
			}

			if (typeof(includes[i].load) == 'function') {
				tasks.push(Promise.resolve(includes[i].load()).catch(function() {
					return null;
				}));
			}
			else {
				tasks.push(Promise.resolve(null));
			}
		}

		return Promise.all(tasks);
	},

	poll_status: function(includes, containers, first_load) {
		var fetch = first_load ? Promise.resolve(null) : network.flushCache();

		return fetch.then(L.bind(
			this.invokeIncludesLoad, this, includes, first_load
		)).then(L.bind(function(results) {
			for (var i = 0; i < includes.length; i++) {
				this.applyIncludeResult(includes[i], containers[i], results ? results[i] : null, first_load);
			}

			var ssi = document.querySelector('div.includes');
			if (ssi) {
				ssi.style.display = '';
				ssi.classList.add('fade-in');
			}
		}, this));
	},

	loadIncludeGroup: function(includes, containers, deferred, first_load) {
		var tasks = [];

		for (var i = 0; i < includes.length; i++) {
			if (!!includes[i].deferFirstLoad != !!deferred)
				continue;

			tasks.push(this.loadInclude(includes[i], containers[i], first_load));
		}

		return Promise.all(tasks);
	},

	prime_status: function(includes, containers) {
		var ssi = document.querySelector('div.includes');
		var deferredLoader = L.bind(function() {
			this.loadIncludeGroup(includes, containers, true, true);
		}, this);

		for (var i = 0; i < includes.length; i++) {
			if (includes[i].hide)
				continue;

			containers[i].parentNode.style.display = '';

			if (!this.restoreIncludeCache(includes[i], containers[i]))
				this.renderIncludePlaceholder(containers[i]);
		}

		if (ssi)
			ssi.style.display = '';

		this.loadIncludeGroup(includes, containers, false, true);

		if (window.requestAnimationFrame)
			window.requestAnimationFrame(function() { window.setTimeout(deferredLoader, 0); });
		else
			window.setTimeout(deferredLoader, 0);
	},

	startOverviewRefresh: function(includes, containers) {
		/* Defer startup until after the view DOM has been inserted to keep
		 * first paint and poll initialization from racing each other. */
		window.setTimeout(L.bind(function() {
			this.prime_status(includes, containers);
			poll.add(L.bind(this.poll_status, this, includes, containers, false));
			poll.start();
		}, this), 0);
	},

	load: function() {
		var includeModules = [
			{ name: 'view.status.include.10_system' },
			{ name: 'view.status.include.15_ports', title: _('Port status'), deferFirstLoad: true },
			{ name: 'view.status.include.20_memory' },
			{ name: 'view.status.include.25_storage' },
			{ name: 'view.status.include.30_network' },
			{ name: 'view.status.include.40_dhcp', title: _('DHCP Leases'), deferFirstLoad: true },
			{ name: 'view.status.include.50_dsl' },
			{ name: 'view.status.include.60_wifi' }
		];

		return Promise.all(includeModules.map(L.bind(function(spec) {
			if (spec.deferFirstLoad)
				return this.wrapDeferredInclude(spec);

			return L.resolveDefault(L.require(spec.name), null);
		}, this))).then(function(includes) {
			return includes.filter(function(include) {
				return include != null;
			});
		});
	},

	render: function(includes) {
		var rv = E([]), containers = [];

		for (var i = 0; i < includes.length; i++) {
			var title = null;

			if (includes[i].title != null)
				title = includes[i].title;
			else
				title = String(includes[i]).replace(/^\[ViewStatusInclude\d+_(.+)Class\]$/,
					function(m, n) { return n.replace(/(^|_)(.)/g,
						function(m, s, c) { return (s ? ' ' : '') + c.toUpperCase() })
					});

			includes[i].id = title;
			includes[i].hide = localStorage.getItem(includes[i].id) == 'hide';

			var container = E('div');

			rv.appendChild(E('div', { 'class': 'cbi-section', 'style': 'display: none' }, [
				E('div', { 'class': 'cbi-title' },[
					E('h3', { 'style': 'display: flex; justify-content: space-between' }, [
						title || '-',
						E('span', {
							'class': includes[i].hide ? 'label notice' : 'label',
							'style': 'display: flex; align-items: center; justify-content: center; min-width: 4em',
							'data-style': includes[i].hide ? 'active' : 'inactive',
							'data-indicator': 'poll-status',
							'data-clickable': 'true',
							'click': ui.createHandlerFn(this, 'handleToggleSection',
										    includes[i], container)
						}, [ _(includes[i].hide ? 'Show' : 'Hide') ])
					]),
				]),
				container
			]));

			containers.push(container);
		}

		this.startOverviewRefresh(includes, containers);

		return rv;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
