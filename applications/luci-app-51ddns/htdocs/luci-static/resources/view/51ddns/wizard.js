'use strict';
'require view';
'require rpc';
'require poll';
'require dom';

const wizardCall = rpc.declare({
	object: 'luci.51ddns',
	method: 'wizard',
	params: [ 'action', 'email', 'password', 'invite_code', 'handle', 'device_id', 'plan_id' ],
	expect: { '': {} },
});
const localStatus = rpc.declare({
	object: 'luci.51ddns',
	method: 'status',
	expect: { '': {} },
});
const readAccountToken = rpc.declare({ object: 'luci.51ddns', method: 'account_token', expect: { '': {} } });
const agentInfo = rpc.declare({ object: 'luci.51ddns', method: 'info', expect: { '': {} } });
const serviceList = rpc.declare({ object: 'service', method: 'list', params: [ 'name' ], expect: { '': {} } });
const saveSettings = rpc.declare({
	object: 'luci.51ddns', method: 'settings',
	params: [ 'enabled', 'router_web', 'router_web_target' ], expect: { '': {} },
});

const devicePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hostnamePattern = /^router-[0-9a-f]{32}\.cdn\.cloud\.toddns\.com$/;
const maskedEmailPattern = /^[a-z0-9._+-]{0,16}\*{2,}@[a-z0-9*.-]+\.[a-z]{2,63}$/i;
const consolePlans = 'https://console.51ddns.com/console#/plans';
const consoleSupport = 'https://console.51ddns.com/console#/support';
const steps = [ _('Register / sign in'), _('Choose plan'), _('Bind device'), _('Write token'), _('Configure domain'), _('Test online') ];
const stage = { welcome: 0, account: 1, plan: 2, bind: 3, write: 4, domain: 5, test: 6, complete: 7 };

const errorText = {
	invalid_credentials: _('Check the email and password and try again.'),
	email_exists: _('This email is already registered. Continue to sign in.'),
	invalid_invite_code: _('The invitation code is invalid or expired.'),
	login_rate_limited: _('Too many attempts. Wait before trying again.'),
	session_expired: _('Your setup session expired. Sign in again to continue.'),
	device_quota_exceeded: _('No device slots are available on this account.'),
	device_record_limit_exceeded: _('This account has reached its device limit.'),
	plan_unavailable: _('The selected plan is no longer available. Choose a plan again.'),
	device_unavailable: _('This device is unavailable for the signed-in account.'),
	device_mismatch: _('The requested device differs from the identity saved on this router.'),
	device_installation_mismatch: _('This device is already associated with another installation.'),
	pending_config_changes: _('Apply or revert pending 51DDNS settings before continuing.'),
	busy: _('Another 51DDNS setup operation is in progress. Try again shortly.'),
	transport_unavailable: _('The router could not reach 51DDNS securely. Try again shortly.'),
	server_unavailable: _('The 51DDNS service is unavailable. Try again shortly.'),
	unsupported_control_url: _('This router uses a custom control server. Setup requires the configured 51DDNS service.'),
	device_not_ready: _('Wait until this device reports online before continuing.'),
	config_write_failed: _('The router could not save the settings.'),
	agent_restart_failed: _('The 51DDNS Agent could not apply the settings.'),
	identity_restore_failed: _('The previous device settings could not be restored automatically. Check the router settings before continuing.'),
};
const domainText = {
	assigned: _('The domain is assigned. Waiting for the public tunnel.'),
	server_not_ready: _('Router management is currently disabled on the server.'),
	plan_required: _('An active plan is required to configure a management domain.'),
	domain_quota_exceeded: _('No management domain quota is available on the current plan.'),
	relay_capacity_insufficient: _('The router cannot connect to all required relay nodes.'),
	public_unavailable: _('At least one public address failed the HTTPS check.'),
	target_unavailable: _('The router web service could not be reached.'),
	port_in_use: _('The local management proxy port is in use.'),
	disabled: _('This management domain is disabled.'),
	agent_upgrade_required: _('Update the 51DDNS Agent to continue.'),
	verification_unavailable: _('The management domain could not be verified.'),
};

function actionButton(label, handler, primary = true) {
	return E('button', {
		type: 'button',
		class: primary ? 'btn cbi-button-action' : 'btn',
		click: handler,
	}, label);
}

function field(label, type, attributes) {
	const input = E('input', Object.assign({ type }, attributes));
	return { input, element: E('label', { class: 'ddns-wizard-field' }, [ label, input ]) };
}

function sameDevice(left, right) {
	return devicePattern.test(left || '') && devicePattern.test(right || '') && left.toLowerCase() === right.toLowerCase();
}

function localizedValue(label, value) {
	return label.replace('%s', () => String(value));
}

function planExpiry(value, includeTime = false) {
	const date = new Date(typeof value === 'string' ? value : NaN);
	return Number.isNaN(date.getTime()) ? '' : date.toLocaleString(undefined, {
		year: 'numeric', month: 'short', day: 'numeric',
		...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
	});
}

function catalogTerms(product) {
	const rights = product.entitlements || {};
	const devices = rights.device_quota_mode === 'independent' && Number.isInteger(rights.devices) &&
		rights.devices >= 1 && rights.devices <= 500 ? rights.devices : 1;
	const domains = Number.isInteger(rights.domains) && rights.domains > 0 ? rights.domains : rights.routes;
	return [ localizedValue(_('%s device slots per pack'), devices),
		...(Number.isInteger(domains) && domains >= 0 ? [ localizedValue(_('%s domains per device'), domains) ] : []),
		...(Number.isFinite(rights.bandwidth_mbps) && rights.bandwidth_mbps >= 0 ? [
			localizedValue(_('%s Mbps per device'), rights.bandwidth_mbps),
		] : []),
	];
}

function productName(product) {
	const name = product.entitlements?.catalog_name;
	return typeof name === 'string' && name.trim() ||
		product.name.replace(/\s*[·・]\s*\d+\s*(?:天|日|个?月|年)\s*$/, '').trim() || product.name;
}

function productDuration(product) {
	return Number.isSafeInteger(product.billing_months) && product.billing_months > 0 ?
		localizedValue(_('%s months'), product.billing_months) : localizedValue(_('%s days'), product.duration_days);
}

function fresh(status) {
	const age = Date.parse(status.router_time) - Date.parse(status.updated_at);
	return status.online === true && Number.isFinite(age) && age >= -1000 && age <= 120000;
}

return view.extend({
	async load() {
		const [ status, info, services ] = await Promise.all([
			L.resolveDefault(localStatus(), {}), L.resolveDefault(agentInfo(), {}),
			L.resolveDefault(serviceList('51ddns-agent'), {}),
		]);
		return { status, info, services };
	},

	render(initial) {
		// LuCI's resource version follows luci-base, so version this package's stylesheet separately.
		const stylesheet = L.resource('view/51ddns/wizard.css') + '?v=0.1.7-r23';
		const existingStyle = document.getElementById('ddns-wizard-styles');
		if (existingStyle?.getAttribute('href') !== stylesheet) {
			const style = E('link', { id: 'ddns-wizard-styles', rel: 'stylesheet', href: stylesheet });
			if (existingStyle)
				existingStyle.replaceWith(style);
			else
				document.head.appendChild(style);
		}
		const panel = E('div', { class: 'ddns-wizard-panel' });
		const statusCard = E('section', { class: 'ddns-card ddns-status-card' });
		const configCard = E('section', { class: 'ddns-card ddns-config-card' });
		const catalogCard = E('section', { class: 'ddns-wizard-catalog' });
		const devicePlanCard = E('section', { class: 'ddns-wizard-device-plan' });
		let devicePlanKey = '';
		const state = { step: stage.welcome, accountMode: 'register', status: initial.status || {}, services: initial.services || {},
			version: typeof initial.info?.version === 'string' ? initial.info.version.slice(0, 100) : '',
			email: '', handle: '', id: '', name: '', hostname: '',
			plans: null, planId: '', products: null, catalogCode: '', catalogLoading: false, catalogError: false,
			recoveryId: '', ownerEmailHint: '', replacement: false,
			error: '', busy: false, written: false, configured: false, checking: false, passed: false };
		let tab = 'basic';
		let diagnosis = false;
		let saving = false;
		let settingsNotice = '';
		let settingsError = false;
		let tokenValue = '';
		let tokenState = '';
		let tokenDevice = '';
		let tokenInput;
		let tokenRequest = 0;
		const tokenDisplayAllowed = window.location.protocol === 'https:';
		let registrationPassword = '';
		let registrationTimer;
		const sessionId = L.env?.sessionid || '';
		const sessionKey = /^(?!0{32}$)[0-9a-f]{32}$/i.test(sessionId) ? '51ddns-setup-handle-' + sessionId : '';

		function storedHandle() {
			try {
				return sessionKey ? window.sessionStorage.getItem(sessionKey) || '' : '';
			} catch {
				return '';
			}
		}

		function saveHandle(handle) {
			state.handle = handle;
			if (!sessionKey)
				return;
			try {
				if (handle)
					window.sessionStorage.setItem(sessionKey, handle);
				else
					window.sessionStorage.removeItem(sessionKey);
			} catch {
				// The current page still works if the browser blocks storage.
			}
		}

		function clearRegistrationPassword() {
			registrationPassword = '';
			window.clearTimeout(registrationTimer);
		}

		const show = step => {
			state.step = step;
			state.error = '';
			draw();
		};

		const perform = async (action, expected, values, success) => {
			if (state.busy || saving)
				return;
			state.busy = true;
			state.error = '';
			if (action === 'login' || action === 'logout' || action === 'write')
				hideAccountToken();
			if (action === 'bind') {
				state.recoveryId = '';
				state.ownerEmailHint = '';
			}
			draw();
			try {
				const result = await wizardCall(action, values.email || '', values.password || '',
					'', state.handle, values.device || '', values.plan || '');
				if (result.state !== expected && !(action === 'resume' && result.state === 'signed_out')) {
					if (action === 'bind' && result.code === 'device_unavailable' &&
						sameDevice(values.device, state.status.saved_device_id)) {
						state.recoveryId = values.device;
						const hint = result.owner_email_hint;
						if (typeof hint === 'string' && hint.length <= 254 && maskedEmailPattern.test(hint))
							state.ownerEmailHint = hint;
					}
					if (result.code === 'session_expired') {
						hideAccountToken();
						saveHandle('');
						state.accountMode = 'login';
						state.step = stage.account;
					}
					state.error = errorText[result.code] || _('Setup could not continue. Please try again.');
				} else {
					success(result);
					if (action === 'write')
						void refresh();
				}
			} catch {
				state.error = _('Setup could not continue. Please try again.');
			} finally {
				state.busy = false;
				draw();
			}
		};

		function showAccount(mode) {
			hideAccountToken();
			clearRegistrationPassword();
			state.accountMode = mode;
			show(stage.account);
		}

		function acceptSession(result, email = '') {
			if (typeof result.handle !== 'string' || !result.handle)
				throw new Error('missing handle');
			hideAccountToken();
			saveHandle(result.handle);
			Object.assign(state, { email: typeof result.account_email === 'string' ? result.account_email : email,
				id: '', name: '', hostname: '', plans: null, planId: '', catalogCode: '', recoveryId: '', ownerEmailHint: '',
				replacement: false, written: false, configured: false, checking: false, passed: false, step: stage.plan });
		}

		async function startSetup() {
			if (state.busy || saving)
				return;
			const handle = state.handle || storedHandle();
			state.handle = handle;
			await perform('resume', 'authenticated', {}, result => {
				if (result.state === 'authenticated')
					acceptSession(result);
				else {
					saveHandle('');
					showAccount(handle ? 'login' : 'register');
					if (handle)
						state.error = errorText.session_expired;
				}
			});
			if (state.step === stage.plan && state.handle)
				return loadPlanStep();
		}

		async function signIn(email, password) {
			state.accountMode = 'login';
			await perform('login', 'authenticated', { email, password }, result => acceptSession(result, email));
			if (state.step === stage.plan && state.handle)
				return loadPlanStep();
		}

		function credentials() {
			const register = state.accountMode === 'register';
			const switchStep = actionButton(register ? _('Already registered? Sign in') : _('Create an account'),
				() => showAccount(register ? 'login' : 'register'), false);
			const notice = window.location.protocol === 'http:' ? [
				E('p', { class: 'alert-message warning' },
					_('This page uses HTTP. Only enter credentials on a trusted local network.')),
			] : [];

			if (state.accountMode === 'registered')
				return [
					...notice,
					E('p', { role: 'status' }, _('Registration complete. Sign in to continue.')),
					actionButton(_('Sign in'), () => {
						if (state.busy || saving)
							return;
						const password = registrationPassword;
						clearRegistrationPassword();
						if (password)
							return signIn(state.email, password);
						showAccount('login');
					}),
				];

			const email = field(_('Email address'), 'email', { name: 'email', required: true,
				autocomplete: 'username', maxlength: 254, value: state.email });
			const password = field(_('Password'), 'password', { name: 'password', required: true,
				autocomplete: register ? 'new-password' : 'current-password', maxlength: 128,
				...(register ? { minlength: 10 } : {}) });
			const submit = event => {
				event.preventDefault();
				state.email = email.input.value.trim();
				const enteredPassword = password.input.value;
				password.input.value = '';
				if (!register)
					return signIn(state.email, enteredPassword);
				return perform('register', 'registered', { email: state.email, password: enteredPassword }, () => {
					state.accountMode = 'registered';
					registrationPassword = enteredPassword;
					registrationTimer = window.setTimeout(clearRegistrationPassword, 120000);
				});
			};
			return [ ...notice, E('form', { submit, class: 'ddns-wizard-form' }, [
				email.element, password.element,
				E('div', { class: 'ddns-wizard-actions' }, [
					E('button', { type: 'submit', class: 'btn cbi-button-action' }, register ? _('Register') : _('Sign in')),
					switchStep,
				]),
			]) ];
		}

		function update(status) {
			state.status = status;
			if (!fresh(status) || !sameDevice(state.id, status.device_id))
				return;
			if (state.step === stage.write && state.written && status.token_configured === true &&
				sameDevice(state.id, status.saved_device_id) && Date.parse(status.updated_at) > state.writtenAfter) {
				state.step = stage.domain;
				state.error = '';
			}
			if (state.step === stage.domain && state.configured && status.router_web?.state === 'ready' &&
				hostnamePattern.test(status.router_web.hostname) && Date.parse(status.router_web.checked_at) > state.configuredAfter) {
				state.hostname = status.router_web.hostname;
				state.step = stage.test;
				state.error = '';
			}
			if (state.step === stage.test && state.checking && state.hostname === status.router_web?.hostname &&
				Date.parse(status.router_web.checked_at) > state.checkAfter) {
				state.checking = false;
				state.passed = status.router_web.state === 'ready';
				state.error = state.passed ? '' : _('The public HTTPS test failed. Try again after the tunnel recovers.');
			}
		}

		let refreshRequest = 0;
		const refresh = async () => {
			if (!panel.isConnected) {
				if (mounted) {
					clearRegistrationPassword();
					clearAccountToken();
					window.removeEventListener('pagehide', hideAccountToken);
					document.removeEventListener('visibilitychange', hideTokenWhenBackgrounded);
					poll.remove(refresh);
				}
				return;
			}
			mounted = true;
			const request = ++refreshRequest;
			const waiting = !state.busy && (state.step === stage.write && state.written || state.step === stage.domain && state.configured ||
				state.step === stage.test && state.checking);
			try {
				const [ status, services ] = await Promise.all([ localStatus(), serviceList('51ddns-agent') ]);
				if (request !== refreshRequest)
					return;
				state.services = services;
				if (waiting) update(status);
				else state.status = status;
				renderStatus();
				syncSettings();
				if (state.step === stage.welcome)
					renderDevicePlan();
			} catch {
				if (request !== refreshRequest)
					return;
				if (waiting) state.error = _('Could not read the router status. Retrying.');
			}
			if (state.checking && Date.now() > state.checkDeadline) {
				state.checking = false;
				state.error = _('Timed out waiting for a new public HTTPS test. Try again.');
			}
			if (waiting) draw();
		};
		let mounted = false;

		async function cutoff() {
			const status = await localStatus();
			const stamp = Date.parse(status.router_time);
			if (!Number.isFinite(stamp))
				throw new Error('router clock unavailable');
			state.status = status;
			// router_time is rounded to seconds. The next second excludes an earlier probe.
			return stamp + 1000;
		}

		async function withClock(callback) {
			if (state.busy || saving)
				return;
			state.busy = true;
			try {
				await callback(await cutoff());
			} catch {
				state.error = _('Could not read the router status. Try again.');
			} finally {
				state.busy = false;
				draw();
			}
		}

		function bound(result, original = '') {
			if (!devicePattern.test(result.device_id || '') || sameDevice(original, result.device_id))
				throw new Error('invalid device ID');
			Object.assign(state, { id: result.device_id, name: result.device_name || '', step: stage.write,
				recoveryId: '', ownerEmailHint: '', replacement: Boolean(original) });
		}

		function switchAccount() {
			return perform('logout', 'signed_out', {}, () => {
				saveHandle('');
				Object.assign(state, { email: '', plans: null, planId: '', catalogCode: '', recoveryId: '', ownerEmailHint: '' });
				showAccount('login');
			});
		}

		function selectedPlan() {
			return state.plans?.find(plan => plan.id === state.planId);
		}

		function eligiblePlans() {
			const plans = state.plans || [];
			return state.catalogCode ? plans.filter(plan => plan.product_code === state.catalogCode) : plans;
		}

		function chooseCatalogProduct(code) {
			state.catalogCode = code;
			if (!code || !eligiblePlans().some(plan => plan.id === state.planId))
				state.planId = '';
			draw();
			if (code)
				catalogCard.querySelector('.ddns-wizard-product-variant[aria-pressed="true"]')?.focus({ preventScroll: true });
		}

		function loadPlans() {
			if (state.busy || saving)
				return;
			const saved = state.status.saved_device_id || '';
			state.plans = null;
			return perform('plans', 'plans', { device: saved }, result => {
				if (!Array.isArray(result.plans))
					throw new Error('invalid plans');
				state.plans = result.plans.filter(plan => plan && devicePattern.test(plan.id || '') &&
					typeof plan.product_name === 'string' && plan.product_name &&
					(plan.device_id === '' || sameDevice(plan.device_id, saved)));
				if (!eligiblePlans().some(plan => plan.id === state.planId))
					state.planId = '';
			});
		}

		async function loadCatalog() {
			if (state.catalogLoading)
				return;
			Object.assign(state, { products: null, catalogLoading: true, catalogError: false });
			try {
				const result = await wizardCall('catalog', '', '', '', '', '', '');
				if (result.state !== 'catalog' || !Array.isArray(result.products))
					throw new Error('invalid product catalog');
				state.products = result.products.filter(product => product && typeof product.name === 'string' && product.name.trim() &&
					typeof product.code === 'string' && product.code.trim() &&
					devicePattern.test(product.id || '') && Number.isSafeInteger(product.duration_days) && product.duration_days > 0 &&
					Number.isSafeInteger(product.price_cents) && product.price_cents >= 0 && /^[A-Z]{3}$/.test(product.currency || ''));
			} catch {
				state.catalogError = true;
			} finally {
				state.catalogLoading = false;
				if (state.step === stage.plan && !state.busy)
					renderCatalog();
				else if (state.step === stage.welcome)
					renderDevicePlan();
			}
		}

		function renderDevicePlan() {
			const status = state.status;
			const bound = status.identity_state === 'saved' && status.token_configured === true &&
				devicePattern.test(status.saved_device_id || '');
			devicePlanCard.hidden = !bound;
			if (!bound) {
				if (devicePlanKey) {
					dom.content(devicePlanCard, []);
					devicePlanKey = '';
				}
				return;
			}

			const plan = sameDevice(status.saved_device_id, status.device_id) &&
				typeof status.plan?.product_name === 'string' && status.plan.product_name.trim() ? status.plan : null;
			const product = plan?.product_code ? state.products?.find(item => item.code === plan.product_code) : null;
			if (plan?.product_code && state.products === null && !state.catalogLoading && !state.catalogError)
				void loadCatalog();

			const expiry = planExpiry(plan?.expires_at, true);
			const expired = Boolean(expiry && Date.parse(plan.expires_at) <= Date.parse(status.router_time));
			const badge = expired ? _('Expired') : !fresh(status) ? _('Last synced') : '';
			const specs = product?.entitlements ? catalogTerms(product).join(' · ') :
				state.catalogLoading ? _('Loading product catalog…') : _('See the console for plan specifications.');
			const key = JSON.stringify([plan?.product_name, expiry, badge, specs]);
			if (key === devicePlanKey)
				return;
			devicePlanKey = key;

			const detail = (label, value) => E('div', {}, [ E('dt', {}, label), E('dd', {}, [value]) ]);
			const link = (label, href, primary = false) => E('a', {
				class: primary ? 'btn cbi-button-action' : 'btn cbi-button',
				href, target: '_blank', rel: 'noopener noreferrer',
			}, label);
			dom.content(devicePlanCard, [
				E('div', { class: 'ddns-wizard-device-plan-heading' }, [
					E('h4', {}, _('Current plan')),
					...(plan && badge ? [ E('span', { class: 'ddns-wizard-plan-badge' }, badge) ] : []),
				]),
				plan ? E('dl', {}, [
					detail(_('Plan'), plan.product_name),
					detail(_('Expires'), expiry || _('Unavailable')),
					detail(_('Official plan specifications'), specs),
				]) : E('p', {}, _('Plan information is temporarily unavailable.')),
				E('div', { class: 'ddns-wizard-actions' }, [
					link(_('Renewal support'), consoleSupport),
					link(_('Upgrade in the console'), consolePlans, true),
				]),
			]);
		}

		function loadPlanStep() {
			return Promise.all([ loadPlans(), loadCatalog() ]);
		}

		function changePlan() {
			show(stage.plan);
			return loadPlanStep();
		}

		function planDetails(plan) {
			const expiry = planExpiry(plan.expires_at);
			const entry = (label, value) => E('div', {}, [ E('dt', {}, label), E('dd', {}, [ value ]) ]);
			return E('section', { class: 'ddns-wizard-plan-details' }, [
				E('div', { class: 'ddns-wizard-plan-name' }, [ E('strong', {}, [ plan.product_name ]),
					E('span', {}, plan.device_id ? _('Linked to this device') : _('Unused slot')) ]),
				...(typeof plan.product_description === 'string' && plan.product_description ? [ E('p', {}, [ plan.product_description ]) ] : []),
				E('dl', {}, [
					...(Number.isInteger(plan.domain_limit) && plan.domain_limit >= 0 ? [ entry(_('Domain limit'), String(plan.domain_limit)) ] : []),
					...(Number.isFinite(plan.bandwidth_mbps) && plan.bandwidth_mbps >= 0 ? [ entry(_('Bandwidth'), plan.bandwidth_mbps + ' Mbps') ] : []),
					...(expiry ? [ entry(_('Expires'), expiry) ] : []),
				]),
			]);
		}

		function ownedPlans() {
			if (state.plans === null)
				return [];
			if (!state.plans.length)
				return [ E('p', {}, _('No plan on this account can be used to bind this router. After adding a plan, refresh this list.')) ];
			const plans = eligiblePlans();
			const other = plans.length < state.plans.length ? [
				actionButton(_('Use another plan on this account'), () => chooseCatalogProduct(''), false),
			] : [];
			if (!plans.length)
				return other;
			if (plans.length === 1) {
				const plan = plans[0];
				return [ E('div', { class: 'ddns-wizard-owned-single' }, [
					planDetails(plan),
					actionButton(_('Continue to bind'), () => {
						state.planId = plan.id;
						show(stage.bind);
					}),
				]), ...other ];
			}

			const preview = E('div', {}, planDetails(selectedPlan() || plans.find(plan => plan.device_id) || plans[0]));
			const picker = E('select', { name: 'plan', required: true, change: event => {
				state.planId = event.target.value;
				const plan = selectedPlan();
				if (plan)
					dom.content(preview, planDetails(plan));
			} }, [
				E('option', { value: '', disabled: true, ...(!selectedPlan() ? { selected: true } : {}) }, _('Select a plan')),
				...plans.map(plan => {
					const expiry = planExpiry(plan.expires_at);
					const description = plan.device_id ? _('Linked to this device') : _('Unused slot');
					const end = expiry ? ' · ' + _('Expires') + ' ' + expiry : '';
					return E('option', { value: plan.id, ...(plan.id === state.planId ? { selected: true } : {}) },
						[ plan.product_name + ' · ' + description + end ]);
				}),
			]);
			return [ E('form', { submit: event => {
				event.preventDefault();
				state.planId = picker.value;
				if (plans.some(plan => plan.id === state.planId))
					show(stage.bind);
			} }, [
				E('label', { class: 'ddns-wizard-field' }, [ _('Available plans'), picker ]),
				preview,
				E('button', { type: 'submit', class: 'btn cbi-button-action' }, _('Continue to bind')),
			]), ...other ];
		}

		function catalogSelection(product) {
			if (!product)
				return E('p', { class: 'ddns-wizard-catalog-note' }, _('Choose a plan and billing period to see the next step.'));
			const selected = E('p', { role: 'status' }, [ _('Selected plan'), ' · ', productName(product), ' · ', productDuration(product) ]);
			if (state.plans === null)
				return E('div', { class: 'ddns-wizard-catalog-selection' }, [ selected,
					E('p', {}, _('Could not verify your authorizations. Refresh your plans to continue.')),
				]);
			if (eligiblePlans().length)
				return E('div', { class: 'ddns-wizard-catalog-selection' }, [ selected,
					E('p', {}, _('This account has a matching authorization. Use it below to continue binding.')),
				]);
			const trial = product.price_cents === 0;
			return E('div', { class: 'ddns-wizard-catalog-selection' }, [ selected,
				E('p', {}, trial ? _('There is no usable authorization for this trial. Check its eligibility in the console.') :
					_('No authorization is available for this plan and period. Choose the same option in the console, then return and refresh.')),
				E('div', { class: 'ddns-wizard-actions' }, [
					E('a', { class: 'btn cbi-button-action', href: consolePlans, target: '_blank', rel: 'noopener noreferrer' },
						trial ? _('View trial eligibility in 51DDNS console') : _('Open 51DDNS console to purchase')),
					actionButton(_('Check for newly activated plans'), loadPlanStep, false),
				]),
			]);
		}

		function productCatalog() {
			if (state.catalogError)
				return [ E('p', { role: 'status' }, _('Could not load the product catalog. Try again.')) ];
			if (state.catalogLoading || state.products === null)
				return [ E('p', { role: 'status' }, _('Loading product catalog…')) ];
			if (!state.products.length)
				return [ E('p', {}, _('There are no active products to display.')) ];

			const groups = new Map();
			for (const product of state.products) {
				const key = devicePattern.test(product.catalog_family_id || '') ? product.catalog_family_id : product.id;
				if (!groups.has(key))
					groups.set(key, []);
				groups.get(key).push(product);
			}
			const termList = terms => E('ul', { class: 'ddns-wizard-product-terms' }, terms.map(term => E('li', {}, [ term ])));
			const rows = Array.from(groups.values(), products => {
				const first = products[0];
				const name = productName(first);
				const terms = catalogTerms(first);
				const sharedTerms = products.every(product => catalogTerms(product).join('\n') === terms.join('\n'));
				return E('li', { class: 'ddns-wizard-product' }, [
					E('h5', {}, [ name ]),
					...(sharedTerms ? [ termList(terms) ] : []),
					E('ul', { class: 'ddns-wizard-product-variants' }, products.map(product => {
						const duration = productDuration(product);
						const price = product.price_cents === 0 ? _('Free') : new Intl.NumberFormat(undefined, {
							style: 'currency', currency: product.currency, currencyDisplay: 'code',
						}).format(product.price_cents / 100);
						return E('li', {}, [
							E('button', { class: 'ddns-wizard-product-variant', type: 'button',
								'aria-label': [ name, duration, price ].join(' '), 'aria-pressed': String(product.code === state.catalogCode),
								click: () => chooseCatalogProduct(product.code),
							}, [ E('span', {}, [ duration ]), E('strong', {}, [ price ]) ]),
							...(!sharedTerms ? [ termList(catalogTerms(product)) ] : []),
						]);
					})),
				]);
			});
			return [ E('ul', { class: 'ddns-wizard-product-list' }, rows),
				catalogSelection(state.products.find(product => product.code === state.catalogCode)) ];
		}

		function renderCatalog() {
			dom.content(catalogCard, [ E('h4', {}, _('Product catalog')), ...productCatalog() ]);
		}

		function planSelection() {
			renderCatalog();
			return [ E('div', { class: 'ddns-wizard-plan-toolbar' }, [
				E('p', { role: 'status' }, [ state.email ? localizedValue(_('Signed in as %s'), state.email) : _('Signed in') ]),
				E('div', { class: 'ddns-wizard-actions' }, [
					actionButton(_('Refresh plans'), loadPlanStep, false),
					actionButton(_('Use a different account'), switchAccount, false),
				]),
			]), E('div', { class: 'ddns-wizard-plan-layout' }, [
				catalogCard,
				E('section', { class: 'ddns-wizard-owned-plans' }, [ E('h4', {}, _('Plans on this account')), ...ownedPlans() ]),
			]) ];
		}

		function bindingRecovery() {
			return E('section', {}, [
				E('h4', {}, _('How to continue')),
				E('ol', {}, [
					E('li', {}, [
						E('p', {}, _('Sign in with the 51DDNS email originally linked to this router, then bind this device again.')),
						...(state.ownerEmailHint ? [ E('p', {}, [ _('Original account email'), ' ', state.ownerEmailHint ]) ] : []),
					]),
					E('li', {}, [
						E('p', {}, _('Bind this router to the current account with a new device ID. This requires a free device slot. The old device and domains stay in the original account.')),
						...(selectedPlan()?.device_id ? [
							E('p', {}, _('Choose an unused plan slot before force binding this router.')),
						] : []),
					]),
				]),
			]);
		}

		function forceBind(original) {
			const plan = selectedPlan();
			if (!plan || plan.device_id ||
				!window.confirm(_('Create a new device for this account? When you write the new token, this router will stop connecting as the old device. Existing domains stay with the old device.')))
				return;
			return perform('replace', 'bound', { device: original, plan: plan.id }, result => bound(result, original));
		}

		function body() {
			switch (state.step) {
			case stage.account: return credentials();
			case stage.plan: return planSelection();
			case stage.bind: {
				const saved = state.status.saved_device_id || '';
				const plan = selectedPlan();
				const recovery = sameDevice(saved, state.recoveryId);
				const device = field(_('Existing device ID (optional)'), 'text',
					{ value: saved, maxlength: 36, ...(saved ? { readonly: true } : {}) });
				return [
					E('p', {}, _('Bind this router to your account. Leave the device ID blank to register a new device.')),
					...(plan ? [ E('p', {}, [ _('Selected plan'), ' ', plan.product_name ]) ] : []),
					device.element,
					E('div', { class: 'ddns-wizard-actions ddns-wizard-bind-actions' }, [
						actionButton(_('Bind device'), () => {
							if (!plan)
								return changePlan();
							const value = device.input.value.trim();
							if (value && !devicePattern.test(value)) {
								state.error = _('Enter a valid device ID.');
								dom.content(alert, [ state.error ]);
								return;
							}
							perform('bind', 'bound', { device: value, plan: plan.id }, bound);
						}),
						actionButton(_('Change plan'), changePlan, false),
						...(recovery ? [ actionButton(_('Sign in with the original account'), switchAccount, false) ] : []),
						...(recovery && plan && !plan.device_id ? [ actionButton(_('Force bind this router'), () => forceBind(saved), false) ] : []),
					]),
					...(recovery ? [ bindingRecovery() ] : []),
				];
			}
			case stage.write: return [
				E('p', {}, [ state.name || state.id ]),
				E('p', {}, state.written ? _('Token saved. Waiting for this router to report online.') :
					_('Write the token securely to this router and start the 51DDNS Agent.')),
				...(state.replacement && !state.written ? [ E('p', { class: 'alert-message warning' },
					_('Writing the new token will switch this router to the new device. Access through the old device on this router will stop.')) ] : []),
				...(!state.written ? [ actionButton(_('Write token'), () => {
					hideAccountToken();
					return withClock(async stamp => {
						state.writtenAfter = stamp - 1000;
						state.busy = false;
						await perform('write', 'written', {}, result => {
							if (!sameDevice(state.id, result.device_id))
								throw new Error('different device ID');
							state.written = true;
						});
					});
				}) ] : [ actionButton(_('Refresh status'), refresh, false) ]),
			];
			case stage.domain: {
				const status = state.status;
				const entry = status.router_web || {};
				const assigned = state.configured && fresh(status) && sameDevice(state.id, status.device_id) &&
					hostnamePattern.test(entry.hostname);
				return [
				E('p', {}, _('Enable a protected router management address using one domain from this device plan.')),
				...(state.configured ? [
					...(assigned ? [ E('p', {}, [ _('Management address'), ' ', E('strong', {}, 'https://' + entry.hostname) ]) ] : []),
					E('p', {}, domainText[state.status.router_web?.state] || _('Waiting for the management domain.')),
					actionButton(_('Refresh status'), refresh, false),
				] : [ actionButton(_('Configure domain'), () => withClock(async stamp => {
					state.configuredAfter = stamp - 1000;
					state.busy = false;
					await perform('configure', 'configured', {}, () => { state.configured = true; });
				})) ]),
				];
			}
			case stage.test: return [
				E('p', {}, _('Management address')),
				E('input', { readonly: true, value: 'https://' + state.hostname, 'aria-label': _('Management address') }),
				managementLink(state.hostname),
				E('p', { role: 'status' }, state.passed ? _('Public HTTPS access test passed.') :
					state.checking ? _('Waiting for a new public HTTPS test from the router.') :
						_('Test the management address through all published relay addresses.')),
				...(!state.checking ? [ actionButton(_('Test online'), () => withClock(stamp => {
					Object.assign(state, { checking: true, passed: false, checkAfter: stamp, checkDeadline: Date.now() + 150000, error: '' });
				})) ] : []),
				...(state.passed ? [ actionButton(_('Finish setup'), () => perform('logout', 'signed_out', {}, () => {
					saveHandle('');
					state.step = stage.complete;
				}), false) ] : []),
			];
			default: return [
				E('p', { role: 'status' }, _('Setup complete. Public HTTPS access was verified.')),
				E('input', { readonly: true, value: 'https://' + state.hostname, 'aria-label': _('Management address') }),
				managementLink(state.hostname),
				actionButton(_('Start again'), () => showAccount('register'), false),
			];
			}
		}

		const alert = E('p', { role: 'alert', class: 'ddns-wizard-alert' });

		function managementLink(hostname, label) {
			const address = 'https://' + hostname;
			return E('a', { href: address, target: '_blank', rel: 'noopener noreferrer' }, label || _('Open router management'));
		}

		function diagnostic() {
			const instances = state.services?.['51ddns-agent']?.instances || {};
			const status = state.status;
			const entry = status.router_web || {};
			return {
				running: Object.values(instances).some(instance => instance?.running === true),
				online: fresh(status),
				device_id: devicePattern.test(status.saved_device_id || '') ? status.saved_device_id : '',
				hostname: hostnamePattern.test(entry.hostname || '') ? entry.hostname : '',
				domain_state: Object.hasOwn(domainText, entry.state) || entry.state === 'ready' ? entry.state : 'unavailable',
				updated_at: Number.isFinite(Date.parse(status.updated_at)) ? status.updated_at : '',
				version: state.version,
			};
		}

		function exportDiagnostic() {
			const url = URL.createObjectURL(new Blob([ JSON.stringify(diagnostic(), null, 2) + '\n' ],
				{ type: 'application/json' }));
			const link = E('a', { href: url, download: '51ddns-diagnostics.json' });
			link.click();
			window.setTimeout(() => URL.revokeObjectURL(url), 1000);
		}

		function renderStatus() {
			const info = diagnostic();
			const summary = [
				E('span', {}, [ _('Server connection'), ' ', E('strong', {}, info.online ? _('Online') : _('Offline')) ]),
				E('span', {}, [ _('Device ID'), ' ', info.device_id || _('Not bound') ]),
				E('span', {}, [ _('Remote management'), ' ',
					state.status.settings?.router_web === true ? _('Enabled') : _('Disabled') ]),
				E('span', {}, [ _('Agent version'), ' ', info.version || _('Unavailable') ]),
			];
			dom.content(statusCard, [
				E('h2', {}, _('Runtime status')),
				E('p', {}, [ E('span', { class: info.running ? 'ddns-badge ddns-badge-running' : 'ddns-badge' },
					info.running ? _('Running') : _('Not running')), ' ', E('span', {}, [ _('Device'), ' OpenWrt' ]) ]),
				E('div', { class: 'ddns-domain-box' }, [
					E('span', {}, _('Management address')),
					E('strong', {}, [ info.hostname ? info.domain_state === 'ready' ?
						managementLink(info.hostname, 'https://' + info.hostname) : 'https://' + info.hostname : _('Not configured') ]),
				]),
				E('div', { class: 'ddns-status-actions' }, [
					actionButton(_('Offline diagnosis'), () => { diagnosis = !diagnosis; renderStatus(); }, false),
					actionButton(_('Export diagnostics'), exportDiagnostic, false),
					actionButton(_('Refresh status'), refresh, false),
				]),
				...(diagnosis ? [ E('p', { role: 'status', class: 'ddns-diagnosis' }, !info.running ?
					_('The agent is stopped. Check the token and service switch below.') : !info.online ?
					_('The agent is running without a recent online report. Check the account binding and network connection.') :
					domainText[info.domain_state] || _('The agent is online.')) ] : []),
				E('div', { class: 'ddns-status-summary' }, summary),
			]);
		}

		function readSettings() {
			const config = state.status.settings || {};
			return { enabled: config.enabled === true, routerWeb: config.router_web === true,
				target: typeof config.router_web_target === 'string' ? config.router_web_target : '',
				tokenConfigured: state.status.token_configured === true };
		}
		let settingsBase = readSettings();
		let settings = { ...settingsBase };

		function clearAccountToken() {
			tokenRequest++;
			tokenValue = '';
			tokenState = '';
			tokenDevice = '';
			if (tokenInput)
				tokenInput.value = '';
		}

		function hideAccountToken() {
			if (!tokenState)
				return;
			clearAccountToken();
			renderSettings();
		}

		function hideTokenWhenBackgrounded() {
			if (document.hidden)
				hideAccountToken();
		}

		async function loadConfiguredToken() {
			if (!tokenDisplayAllowed || document.hidden || tab !== 'basic' || !settings.tokenConfigured ||
				state.busy || saving || tokenState === 'loading')
				return;
			clearAccountToken();
			const request = tokenRequest;
			tokenDevice = state.status.saved_device_id || '';
			tokenState = 'loading';
			renderSettings();
			try {
				const result = await readAccountToken();
				if (request !== tokenRequest)
					return;
				if (typeof result.token !== 'string' || !/^51d_[A-Za-z0-9_-]+$/.test(result.token))
					throw new Error('account token unavailable');
				tokenValue = result.token;
				tokenState = 'ready';
			} catch {
				if (request === tokenRequest)
					tokenState = 'unavailable';
			} finally {
				if (request === tokenRequest)
					renderSettings();
			}
		}

		function tokenFields() {
			const token = field(_('Account token'), 'text', { readonly: true, autocomplete: 'off', spellcheck: 'false',
				placeholder: settings.tokenConfigured ? _('Hidden') : _('Not configured') });
			tokenInput = token.input;
			tokenInput.value = settings.tokenConfigured && tokenDisplayAllowed ? tokenValue : '';
			if (!settings.tokenConfigured)
				return [ token.element ];
			if (!tokenDisplayAllowed) {
				const securePage = new URL('https://' + window.location.hostname);
				securePage.pathname = window.location.pathname;
				return [ token.element, E('p', {}, [ E('a', { href: securePage.href, target: '_blank', rel: 'noopener noreferrer' },
					_('Open this LuCI page over HTTPS')), ' ', _('to view and copy the account token.') ]) ];
			}
			if (tokenState === 'loading')
				return [ token.element, E('p', { role: 'status' }, _('Reading the configured token…')) ];
			if (!tokenValue)
				return [ token.element,
					...(tokenState === 'unavailable' ? [ E('p', { role: 'status' }, _('The configured token could not be read.')) ] : []),
					actionButton(_('Show account token'), loadConfiguredToken, false),
				];
			return [ token.element, actionButton(_('Hide account token'), hideAccountToken, false) ];
		}

		function selectConfigTab(next) {
			if (tab === next)
				return;
			tab = next;
			clearAccountToken();
			renderSettings();
		}

		function settingsChanged() {
			return settings.enabled !== settingsBase.enabled || settings.routerWeb !== settingsBase.routerWeb ||
				settings.target !== settingsBase.target;
		}

		function syncSettings() {
			const next = readSettings();
			const tokenChanged = next.tokenConfigured !== settingsBase.tokenConfigured ||
				Boolean(tokenState && tokenDevice !== (state.status.saved_device_id || ''));
			if (tokenChanged) {
				clearAccountToken();
				settings.tokenConfigured = settingsBase.tokenConfigured = next.tokenConfigured;
			}
			const updateSettings = !saving && !settingsChanged() && JSON.stringify(next) !== JSON.stringify(settingsBase);
			if (updateSettings) {
				settingsBase = next;
				settings = { ...next };
			}
			if (tokenChanged || updateSettings)
				renderSettings();
		}

		async function applySettings() {
			if (saving || state.busy || !settingsChanged())
				return;
			clearAccountToken();
			saving = true;
			settingsNotice = '';
			renderSettings();
			try {
				state.status = await localStatus();
				if (JSON.stringify(readSettings()) !== JSON.stringify(settingsBase)) {
					settingsBase = readSettings();
					settings = { ...settingsBase };
					throw new Error('settings changed');
				}
				const basicChanged = settings.enabled !== settingsBase.enabled;
				const advancedChanged = settings.routerWeb !== settingsBase.routerWeb || settings.target !== settingsBase.target;
				const result = await saveSettings(basicChanged ? String(Number(settings.enabled)) : '',
					advancedChanged ? String(Number(settings.routerWeb)) : '', advancedChanged ? settings.target.trim() : '');
				settingsError = result.state !== 'saved';
				if (settingsError) {
					settingsNotice = errorText[result.code] || _('The router could not save the settings.');
				} else {
					state.status = await localStatus();
					settingsBase = readSettings();
					settings = { ...settingsBase };
					settingsNotice = _('Settings saved and applied.');
					renderStatus();
				}
			} catch {
				settingsError = true;
				settingsNotice = _('Could not apply settings. Refresh the status and try again.');
			} finally {
				saving = false;
				renderSettings();
			}
		}

		function renderSettings() {
			const basic = tab === 'basic';
			if (tokenInput)
				tokenInput.value = '';
			tokenInput = null;
			const toggle = (label, checked, handler) => E('label', { class: 'ddns-setting-switch' }, [
				label, E('input', { type: 'checkbox', ...(checked ? { checked: 'checked' } : {}),
					change: event => handler(event.target.checked) }),
			]);
			const target = field(_('Local router Web address (optional)'), 'text',
				{ value: settings.target, maxlength: 140, placeholder: 'http://127.0.0.1:80',
					input: event => { settings.target = event.target.value; } });
			const tabs = E('div', { class: 'ddns-config-tabs' }, [
				E('button', { type: 'button', 'aria-pressed': String(basic),
					click: () => selectConfigTab('basic') }, _('Basic settings')),
				E('button', { type: 'button', 'aria-pressed': String(!basic),
					click: () => selectConfigTab('advanced') }, _('Advanced features')),
			]);
			dom.content(configCard, [
				tabs,
				E('div', { class: 'ddns-config-fields' }, basic ? [
					toggle(_('Enable 51DDNS'), settings.enabled, value => { settings.enabled = value; }),
					...tokenFields(),
					E('p', {}, _('The setup wizard writes the token directly to the router.')),
				] : [
					toggle(_('Automatic router management address'), settings.routerWeb, value => { settings.routerWeb = value; }),
					target.element,
					E('p', {}, _('Leave the local address blank to detect it automatically.')),
				]),
				...(settingsNotice ? [ E('p', { role: settingsError ? 'alert' : 'status',
					class: settingsError ? 'ddns-wizard-alert' : '' }, [ settingsNotice ]) ] : []),
				E('div', { class: 'ddns-config-save' }, [
					actionButton(saving ? _('Working…') : _('Save and apply settings'), applySettings),
				]),
			]);
		}

		function draw() {
			panel.classList.toggle('ddns-wizard-panel-plans', state.step === stage.plan);
			panel.classList.toggle('ddns-wizard-panel-welcome', state.step === stage.welcome);
			dom.content(alert, [ state.error ]);
			if (state.step === stage.welcome) {
				renderDevicePlan();
				dom.content(panel, [
					E('div', { class: 'ddns-wizard-welcome' }, [
						E('div', {}, [
							E('h3', {}, _('Welcome to 51DDNS')),
							E('p', {}, _('Set up your account, router and management domain here.')),
						]),
						state.busy ? E('p', { role: 'status' }, _('Working…')) : actionButton(_('Start setup'), startSetup),
					]),
					alert,
					devicePlanCard,
				]);
				return;
			}
			const progress = E('ol', { class: 'ddns-wizard-progress', 'aria-label': _('Setup steps') },
				steps.map((label, index) => {
					const active = index + 1 === state.step;
					return E('li', {
						class: index + 1 <= state.step ? 'ddns-wizard-reached' : '',
						...(active ? { 'aria-current': 'step' } : {}),
					}, [ E('span', {}, String(index + 1)), label ]);
				}));
			dom.content(panel, [ progress, E('section', { class: state.step === stage.plan ? 'ddns-wizard-step ddns-wizard-plan-step' : 'ddns-wizard-step' }, [
				E('h3', {}, steps[state.step - 1] || _('Setup complete')),
				alert,
				...(state.busy ? [ E('p', { role: 'status' }, _('Working…')) ] : body()),
			]) ]);
		}
		draw();
		renderStatus();
		renderSettings();
		window.addEventListener('pagehide', hideAccountToken);
		document.addEventListener('visibilitychange', hideTokenWhenBackgrounded);
		poll.add(refresh, 5);
		return E('div', { class: 'ddns-wizard' }, [
			statusCard, E('section', { class: 'ddns-card' }, [ E('h2', {}, _('Quick setup')), panel ]), configCard,
		]);
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null,
});
