'use strict';
'require view';
'require form';
'require rpc';
'require uci';
'require poll';
'require dom';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} },
});

const callLocalStatus = rpc.declare({
	object: 'luci.51ddns',
	method: 'status',
	expect: { '': {} },
});

const callAgentInfo = rpc.declare({
	object: 'luci.51ddns',
	method: 'info',
	expect: { '': {} },
});

function serviceState(data) {
	const instances = data?.['51ddns-agent']?.instances || {};
	const running = Object.values(instances).some(instance => instance?.running);

	return {
		running,
		label: running ? _('Running') : _('Not running'),
		className: running ? 'alert-message success' : 'alert-message warning',
	};
}

function formatDate(value) {
	const date = new Date(value || '');

	if (Number.isNaN(date.getTime()))
		return _('Synchronizing');

	return date.toLocaleString([], {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function remainingState(value) {
	const expires = new Date(value || '');

	if (Number.isNaN(expires.getTime()))
		return { label: _('Synchronizing'), className: 'alert-message notice' };

	const milliseconds = expires.getTime() - Date.now();
	if (milliseconds <= 0)
		return { label: _('Expired'), className: 'alert-message error' };

	const hours = Math.ceil(milliseconds / 3600000);
	const days = Math.ceil(hours / 24);
	const label = hours > 48
		? N_(days, 'About %d day', 'About %d days').format(days)
		: N_(hours, '%d hour', '%d hours').format(hours);

	return {
		label,
		className: milliseconds <= 3 * 86400000
			? 'alert-message warning'
			: 'alert-message success',
	};
}

function recentStatus(local, running) {
	if (!running)
		return false;

	const updatedAt = Date.parse(local.updated_at || '');
	const routerTime = Date.parse(local.router_time || '');
	const age = (Number.isFinite(routerTime) ? routerTime : Date.now()) - updatedAt;
	return Number.isFinite(age) && age >= -30000 && age <= 120000;
}

function quotaExceeded(local, running) {
	return local?.error_code === 'device_quota_exceeded' && recentStatus(local, running);
}

function relayFailure(local, running) {
	if (!recentStatus(local, running))
		return null;
	switch (local?.error_code) {
		case 'frpc_config_write_failed':
			return _('Cannot write the tunnel client configuration. Retrying automatically; check storage and permissions.');
		case 'frpc_start_failed':
			return _('Tunnel client could not start. Retrying automatically; check the frpc installation.');
		case 'frpc_process_exited':
			return _('Tunnel client exited. Retrying automatically; the agent continues attempting device reporting.');
		default:
			return null;
	}
}

const deviceIDPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function routerEntryChildren(local, running) {
            const host = local.router_web?.hostname || '';
            const valid = /^router-[0-9a-f]{32}\.cdn\.cloud\.toddns\.com$/.test(host);
            const messages = {
                assigned: _('Address assigned. Waiting for the public tunnel connection.'),
                ready: _('The management entry is reachable. Sign in with the owning account to open it.'),
                disabled: _('Remote router management is disabled. A console-disabled or deleted entry is not recreated.'),
                target_unavailable: _('Cannot identify the router Web service. Check the local management address.'),
                port_in_use: _('The local management proxy port is already in use.'),
                plan_required: _('Bind an active plan before creating the management address.'),
                domain_quota_exceeded: _('No domain quota remains. Existing domains were not changed.'),
                server_not_ready: _('The server has not enabled automatic router management yet.'),
                relay_capacity_insufficient: _('The relay limit cannot cover all access nodes. Increase the limit or disable router management.'),
                public_unavailable: _('Some published access addresses are not reachable yet. The management entry is not ready.'),
                agent_upgrade_required: _('Upgrade the agent to support the current router management protocol.'),
            };
            const fresh = recentStatus(local, running);
            const children = [ E('p', {}, fresh ? (messages[local.router_web?.state] || _('Synchronizing')) : _('Status is unavailable or expired.')) ];
            if (fresh && valid && local.router_web?.state === 'ready') {
                const address = 'https://' + host;
                const addressInput = E('input', { readonly: true, value: address, style: 'width:100%', 'aria-label': _('Router management address') });
                children.push(addressInput);
                children.push(E('a', { class: 'btn cbi-button-action', href: address, target: '_blank', rel: 'noopener noreferrer' }, _('Open router management')));
                children.push(E('button', { type: 'button', class: 'btn', click: () => {
                    addressInput.focus(); addressInput.select();
                    if (navigator.clipboard) navigator.clipboard.writeText(address).catch(() => {});
                } }, _('Copy address')));
            }
            return children;
}

return view.extend({
	load() {
		if (window.location.protocol !== 'https:') {
			this.handleSave = this.handleSaveApply = this.handleReset = null;
			return Promise.resolve(null);
		}
		return Promise.all([
			uci.load('51ddns'),
			L.resolveDefault(callServiceList('51ddns-agent'), {}),
			L.resolveDefault(callLocalStatus(), {}),
			L.resolveDefault(callAgentInfo(), {}),
		]);
	},

	render(data) {
		if (!data) {
			const securePage = new URL('https://' + window.location.hostname);
			securePage.pathname = window.location.pathname;
			return E('div', {}, [
				E('h2', {}, _('51DDNS Remote Access')),
				E('p', { class: 'alert-message warning' }, E('a', { href: securePage.href },
					_('Open this LuCI page over HTTPS'))),
			]);
		}
		const state = serviceState(data[1]);
		const local = data[2] || {};
		const info = data[3] || {};
		const plan = local.plan || null;
		const quotaBlocked = quotaExceeded(local, state.running);
		const relayWarning = relayFailure(local, state.running);
		const remaining = remainingState(plan?.expires_at);
		const configuredDeviceID = uci.get('51ddns', 'main', 'device_id') || '';
		const savedDeviceID = local.identity_state === 'saved' && deviceIDPattern.test(local.saved_device_id || '') ? local.saved_device_id : '';
		const map = new form.Map(
			'51ddns',
			_('51DDNS Remote Access'),
			_('Enter your account token. For a device already created in the console, enter its exact device UUID below. Leave the ID blank for automatic registration only when this router has no saved device ID and your account has a free device slot.'),
		);
		const section = map.section(form.NamedSection, 'main', 'agent', _('Quick setup'));
		section.addremove = false;
		const wizardButton = section.option(form.Button, '_wizard', _('Setup guide'));
		wizardButton.inputtitle = _('Quick setup');
		wizardButton.inputstyle = 'apply';
		wizardButton.onclick = () => window.location.assign(L.url('admin/services/51ddns'));

		const token = section.option(form.Value, 'account_token', _('Account token'));
		token.password = true;
		token.rmempty = false;
		token.placeholder = '51d_...';
		token.description = _('Copy the token from the 51DDNS console. Updating it keeps the saved device ID. A token from another account will be rejected until the device identity is migrated.');

		const deviceID = section.option(form.Value, 'device_id', _('Existing device ID (optional)'));
		deviceID.rmempty = true;
		deviceID.description = _('Paste the exact UUID of the device created in the console. If verification failed before this router saved an identity, stop the agent to correct or clear this field. A saved router ID is never cleared here.');
		deviceID.validate = (_sectionId, value) => {
			// Stopping the service must remain possible with a stale configured ID.
			if (enabled.formvalue(_sectionId) === enabled.disabled)
				return true;
			if (value && !deviceIDPattern.test(value))
				return _('Enter a valid device UUID from the console.');
			const matchesSaved = value && savedDeviceID && value.toLowerCase() === savedDeviceID.toLowerCase();
			if (value !== configuredDeviceID && configuredDeviceID && savedDeviceID && !matchesSaved)
				return _('This router already has a configured device ID. Changing it requires a separate migration.');
			if (value && savedDeviceID && value.toLowerCase() !== savedDeviceID.toLowerCase())
				return _('This router already has a saved device ID. Changing it requires a separate migration.');
			if (value && !savedDeviceID && local.identity_state !== 'empty')
				return _('The saved device identity could not be verified. Refresh the page before setting a device ID.');
			if (value && !savedDeviceID && state.running)
				return _('Disable the agent and save first. Then enter the existing device ID and enable it again.');
			return true;
		};
		// Only an unbound, stopped router may clear a failed first-bind selection.
		deviceID.remove = () => {
			if (!savedDeviceID && local.identity_state === 'empty' && !state.running)
				uci.unset('51ddns', 'main', 'device_id');
		};

		const enabled = section.option(form.Flag, 'enabled', _('Enable'));
		enabled.rmempty = false;
		enabled.default = enabled.disabled;

		const status = section.option(form.DummyValue, '_status', _('Service status'));
		status.rawhtml = true;
		status.cfgvalue = () =>
			`<span class="${state.className}"><strong>${state.label}</strong></span>`;

		const planName = section.option(form.DummyValue, '_plan_name', _('Current plan'));
		planName.cfgvalue = () => plan?.product_name || _('No active plan');

		const expiresAt = section.option(form.DummyValue, '_expires_at', _('Expires at'));
		expiresAt.cfgvalue = () => plan ? formatDate(plan.expires_at) : _('Not bound');

		const remainingTime = section.option(form.DummyValue, '_remaining_time', _('Time remaining'));
		remainingTime.rawhtml = true;
		remainingTime.cfgvalue = () => {
			if (!plan)
				return `<span class="alert-message warning"><strong>${_('Bind or purchase a plan')}</strong></span>`;

			return `<span class="${remaining.className}"><strong>${remaining.label}</strong></span>`;
		};

		if (quotaBlocked) {
			const quota = section.option(form.DummyValue, '_quota', _('Device quota'));
			quota.rawhtml = true;
			quota.cfgvalue = () =>
				`<strong style="color:#b91c1c">${_('Device limit reached. If this router already has a device record in the console, use its exact device ID to continue binding. Upgrade or purchase a plan only when adding another device.')}</strong>`;
		}

		const entry = section.option(form.DummyValue, '_router_web', _('Router management'));
        entry.renderWidget = () => {
            const widget = E('div', { 'aria-live': 'polite' }, routerEntryChildren(local, state.running));
            let connected = false;
            let detachedTicks = 0;
            const refresh = async () => {
                if (!widget.isConnected) {
                    if (connected || ++detachedTicks >= 3) poll.remove(refresh);
                    return;
                }
                connected = true;
                try {
                    const [services, current] = await Promise.all([
                        callServiceList('51ddns-agent'), callLocalStatus(),
                    ]);
                    if (widget.isConnected)
                        dom.content(widget, routerEntryChildren(current || {}, serviceState(services).running));
                    else poll.remove(refresh);
                } catch {
                    if (widget.isConnected)
                        dom.content(widget, routerEntryChildren({}, false));
                    else poll.remove(refresh);
                }
            };
            poll.add(refresh, 5);
            return widget;
        };
        const routerEnabled = section.option(form.Flag, 'router_web', _('Automatic router management address'));
        routerEnabled.default = '0';
        routerEnabled.rmempty = false;
        routerEnabled.description = _('Uses one domain from this device plan and requires the owning account to sign in.');
        const routerTarget = section.option(form.Value, 'router_web_target', _('Local router Web address (optional)'));
        routerTarget.placeholder = 'http://127.0.0.1:80';
        routerTarget.description = _('Leave blank to detect uhttpd. Only an IP on this router is accepted; HTTPS uses its configured public certificate.');
        routerTarget.depends('router_web', '1');

		const version = section.option(form.DummyValue, '_version', _('Agent version'));
		version.cfgvalue = () => info.version || _('Unavailable');

		if (relayWarning) {
			const relay = section.option(form.DummyValue, '_relay', _('Tunnel client'));
			relay.cfgvalue = () => relayWarning;
		}

		return map.render();
	},
});
