const form = document.querySelector('[data-booking-form]');
const bookingStatus = document.querySelector('[data-booking-status]');
const paymentSelect = document.querySelector('#payment-method');
const paymentConfigMessage = document.querySelector('[data-payment-config-message]');
const proofInput = document.querySelector('[data-proof-input]');
const stepPanels = [...document.querySelectorAll('[data-step-panel]')];
const stepTabs = [...document.querySelectorAll('[data-step-tab]')];
let currentCelebrity = null;
let paymentConfiguration = null;
let currentStep = 1;

async function apiRequest(url, options = {}) {
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		credentials: 'same-origin',
		headers: options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.');
	return result;
}

function money(cents, currency = 'USD') {
	if (cents === null || cents === undefined) return 'Not configured';
	return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(cents / 100);
}

function showStep(step) {
	currentStep = step;
	stepPanels.forEach((panel) => { panel.hidden = Number(panel.dataset.stepPanel) !== step; });
	stepTabs.forEach((tab) => {
		const active = Number(tab.dataset.stepTab) === step;
		tab.classList.toggle('is-active', active);
		tab.setAttribute('aria-selected', String(active));
	});
	bookingStatus.textContent = '';
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStepOne() {
	const fields = [...form.querySelectorAll('[data-step-panel="1"] [required]')];
	const invalid = fields.find((field) => !field.checkValidity());
	const error = document.querySelector('[data-step-one-error]');
	if (invalid) {
		error.textContent = 'Complete the required event details to continue.';
		error.hidden = false;
		invalid.focus();
		invalid.reportValidity();
		return false;
	}
	error.hidden = true;
	return true;
}

document.querySelectorAll('[data-next-step]').forEach((button) => {
	button.addEventListener('click', () => {
		const destination = Number(button.dataset.nextStep);
		if (currentStep === 1 && !validateStepOne()) return;
		if (destination === 3) updateSummary();
		showStep(destination);
	});
});

document.querySelectorAll('[data-previous-step]').forEach((button) => {
	button.addEventListener('click', () => showStep(Number(button.dataset.previousStep)));
});

stepTabs.forEach((tab) => {
	tab.addEventListener('click', () => {
		const destination = Number(tab.dataset.stepTab);
		if (destination > currentStep && currentStep === 1 && !validateStepOne()) return;
		if (destination === 3) updateSummary();
		showStep(destination);
	});
});

document.querySelector('[name="durationMinutes"]').addEventListener('input', (event) => {
	document.querySelector('[data-duration-output]').value = `${event.target.value} minutes`;
});

function updateSummary() {
	const base = currentCelebrity?.baseFeeCents ?? null;
	const feePercent = paymentConfiguration?.serviceFeePercent ?? null;
	const service = base !== null && feePercent !== null ? Math.round(base * feePercent / 100) : null;
	document.querySelector('[data-summary-celebrity]').textContent = currentCelebrity?.celebrity.name ?? 'Unavailable';
	document.querySelector('[data-summary-base]').textContent = money(base);
	document.querySelector('[data-summary-service]').textContent = service === null ? 'Awaiting fee configuration' : money(service);
	document.querySelector('[data-summary-total]').textContent = service === null ? 'Provided with booking offer' : money(base + service);
	document.querySelector('[data-base-fee]').textContent = money(base);
	document.querySelector('[data-fee-summary]').hidden = base === null;
}

function appendBankDetail(list, label, value) {
	if (!value) return;
	const row = document.createElement('div');
	const term = document.createElement('dt');
	const description = document.createElement('dd');
	const copy = document.createElement('button');
	term.textContent = label;
	description.textContent = value;
	copy.type = 'button';
	copy.className = 'button button-copy';
	copy.textContent = 'Copy';
	copy.setAttribute('aria-label', `Copy ${label}`);
	copy.addEventListener('click', () => copyPaymentValue(value, copy));
	row.append(term, description, copy);
	list.append(row);
}

async function copyPaymentValue(value, button) {
	try {
		await navigator.clipboard.writeText(value);
		button.textContent = 'Copied';
		window.setTimeout(() => { button.textContent = 'Copy'; }, 1400);
	} catch {
		bookingStatus.textContent = 'Could not copy automatically. Select and copy the value.';
	}
}

function showPaymentDetails(method) {
	const qrBlock = document.querySelector('[data-payment-qr-block]');
	const addressBlock = document.querySelector('[data-payment-address-block]');
	const bankBlock = document.querySelector('[data-bank-details]');
	const defaultQrBlock = document.querySelector('[data-payment-default-qr]');
	const selectedDetails = document.querySelector('[data-payment-selected-details]');
	const selected = paymentConfiguration?.methods.find((item) => item.id === method);
	const enabled = Boolean(selected?.configured);
	defaultQrBlock.hidden = Boolean(method);
	selectedDetails.hidden = !method;
	proofInput.required = Boolean(method);
	qrBlock.hidden = !enabled || !selected?.qrDataUrl;
	addressBlock.hidden = !enabled || !selected?.address;
	bankBlock.hidden = method !== 'bank_transfer' || !enabled;
	const qrImage = document.querySelector('[data-payment-qr]');
	qrImage.hidden = !enabled || !selected?.qrDataUrl;
	qrImage.src = selected?.qrDataUrl ?? '';
	qrImage.alt = `${selected?.label ?? 'Payment'} QR code`;
	document.querySelector('#payment-address').value = selected?.address ?? '';
	document.querySelector('[data-address-label]').textContent = selected?.label ?? 'Payment';
	const network = document.querySelector('[data-payment-network]');
	network.hidden = !selected?.network;
	network.textContent = selected?.network ? `Network: ${selected.network}. Send only on this network.` : '';
	const bankValues = document.querySelector('[data-bank-values]');
	bankValues.replaceChildren();
	if (method === 'bank_transfer' && enabled) {
		const details = paymentConfiguration.bank.details;
		appendBankDetail(bankValues, 'Bank Name', details.bankName);
		appendBankDetail(bankValues, 'Account Name', details.accountName);
		appendBankDetail(bankValues, 'Account Number', details.accountNumber);
		appendBankDetail(bankValues, 'Routing / Sort Code', details.routingCode);
		appendBankDetail(bankValues, 'Branch Code', details.branchCode);
		appendBankDetail(bankValues, 'SWIFT / BIC Code', details.swiftBic);
		appendBankDetail(bankValues, 'Bank Address', details.bankAddress);
		appendBankDetail(bankValues, 'IBAN', details.iban);
		appendBankDetail(bankValues, 'Payment Reference', details.referenceInstructions);
	}
}

function renderPaymentConfiguration(configuration) {
	paymentConfiguration = configuration;
	const bitcoin = configuration.methods.find((item) => item.id === 'bitcoin');
	const defaultQr = document.querySelector('[data-default-payment-qr]');
	defaultQr.src = bitcoin?.qrDataUrl ?? '';
	defaultQr.hidden = !bitcoin?.qrDataUrl;
	paymentSelect.replaceChildren(new Option('Choose a payment method...', ''));
	const unavailable = [];
	for (const method of configuration.methods) {
		if (!method.configured) {
			unavailable.push(`${method.label}: ${method.disabledReason}`);
		}
		const option = new Option(method.label, method.id);
		option.disabled = !method.configured;
		paymentSelect.add(option);
	}
	paymentConfigMessage.textContent = configuration.feeConfigured
		? (unavailable.length ? `Payment setup incomplete for: ${unavailable.join(' ')}` : '')
		: 'Payment is not configured yet. You can submit a booking request without payment; no payment details are displayed or collected.';
	paymentConfigMessage.hidden = !paymentConfigMessage.textContent;
	updateSummary();
	const defaultAddress = bitcoin?.address ?? '';
	const defaultAccount = document.querySelector('[data-default-payment-address]');
	if (defaultAccount) {
		defaultAccount.textContent = defaultAddress ? `Bitcoin address: ${defaultAddress}` : '';
		defaultAccount.hidden = !defaultAddress;
	}
}

paymentSelect.addEventListener('change', () => {
	showPaymentDetails(paymentSelect.value);
	updateSummary();
});

document.querySelector('[data-copy-address]').addEventListener('click', async () => {
	const button = document.querySelector('[data-copy-address]');
	copyPaymentValue(document.querySelector('#payment-address').value, button);
});

proofInput.addEventListener('change', () => {
	const file = proofInput.files?.[0];
	if (file) document.querySelector('.proof-dropzone strong').textContent = file.name;
});

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!validateStepOne()) {
		showStep(1);
		return;
	}
	if (!form.elements.acceptedTerms.checked) {
		document.querySelector('[data-payment-error]').textContent = 'Accept the booking terms to submit.';
		document.querySelector('[data-payment-error]').hidden = false;
		return;
	}
	if (paymentSelect.value && !proofInput.files?.length) {
		document.querySelector('[data-payment-error]').textContent = 'Upload payment proof for the selected payment method.';
		document.querySelector('[data-payment-error]').hidden = false;
		return;
	}
	const submit = document.querySelector('[data-booking-submit]');
	const body = new FormData(form);
	body.set('acceptedTerms', String(form.elements.acceptedTerms.checked));
	bookingStatus.textContent = 'Submitting booking request...';
	submit.disabled = true;
	try {
		const result = await apiRequest('/api/bookings', { method: 'POST', body });
		bookingStatus.textContent = `Booking request received. Reference: ${result.bookingId}. Our team will review your request.`;
		bookingStatus.classList.add('is-success');
		form.reset();
		proofInput.required = false;
	} catch (error) {
		bookingStatus.textContent = error.message;
		bookingStatus.classList.remove('is-success');
	} finally {
		submit.disabled = false;
	}
});

async function loadCelebrity() {
	const id = new URLSearchParams(location.search).get('celebrity');
	if (!id) throw new Error('Choose a celebrity from the catalog to start a booking.');
	const data = await apiRequest(`/api/celebrities/${encodeURIComponent(id)}`);
	currentCelebrity = data;
	const celebrity = data.celebrity;
	document.title = `Book ${celebrity.name} | Opal Stars Management`;
	document.querySelector('[data-celebrity-name]').textContent = celebrity.name;
	document.querySelector('[data-form-celebrity]').textContent = celebrity.name;
	document.querySelector('[data-description-name]').textContent = celebrity.name;
	document.querySelector('[data-form-subtitle]').textContent = 'Schedule a professional booking or appearance';
	document.querySelector('[data-celebrity-country]').textContent = celebrity.country;
	document.querySelector('[data-celebrity-role]').textContent = celebrity.role;
	document.querySelector('[data-summary-celebrity]').textContent = celebrity.name;
	form.elements.celebrityId.value = celebrity.id;
	const image = document.querySelector('[data-celebrity-image]');
	image.src = celebrity.image_url;
	image.alt = `Portrait of ${celebrity.name}`;
	image.hidden = false;
	updateSummary();
}

async function initialize() {
	try {
		const [celebrityResult, configuration] = await Promise.all([
			loadCelebrity(),
			apiRequest('/api/payment-config'),
		]);
		renderPaymentConfiguration(configuration);
	} catch (error) {
		bookingStatus.textContent = error.message;
		bookingStatus.classList.remove('is-success');
		if (!currentCelebrity) {
			document.querySelector('[data-booking-submit]').disabled = true;
		}
	}
}

function closeMobileMenu() {
	const menu = document.querySelector('#booking-mobile-menu');
	const toggle = document.querySelector('[data-menu-toggle]');
	menu.hidden = true;
	toggle.setAttribute('aria-expanded', 'false');
	toggle.setAttribute('aria-label', 'Open navigation menu');
}

document.querySelector('[data-menu-toggle]').addEventListener('click', (event) => {
	const toggle = event.currentTarget;
	const menu = document.querySelector('#booking-mobile-menu');
	const open = toggle.getAttribute('aria-expanded') === 'true';
	menu.hidden = open;
	toggle.setAttribute('aria-expanded', String(!open));
	toggle.setAttribute('aria-label', open ? 'Open navigation menu' : 'Close navigation menu');
});

document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
	button.addEventListener('click', () => {
		const dark = document.body.classList.toggle('theme-dark');
		document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'));
		if (button.closest('.mobile-menu')) closeMobileMenu();
	});
});

document.querySelectorAll('[data-auth-open]').forEach((link) => {
	link.addEventListener('click', (event) => {
		event.preventDefault();
		const modal = document.querySelector('[data-auth-modal]');
		const registering = link.dataset.authOpen === 'register';
		document.querySelector('[data-auth-title]').textContent = registering ? 'Create your account' : 'Welcome back';
		document.querySelector('[data-auth-name-field]').hidden = !registering;
		document.querySelector('[data-auth-name-field] input').required = registering;
		document.querySelector('[data-auth-submit]').textContent = registering ? 'Create Account' : 'Sign In';
		document.querySelector('[data-auth-form]').dataset.mode = link.dataset.authOpen;
		closeMobileMenu();
		modal.hidden = false;
		document.body.style.overflow = 'hidden';
	});
});

document.querySelector('[data-auth-close]').addEventListener('click', () => {
	document.querySelector('[data-auth-modal]').hidden = true;
	document.body.style.overflow = '';
});

document.querySelector('[data-auth-form]').addEventListener('submit', async (event) => {
	event.preventDefault();
	const accountForm = event.currentTarget;
	const registering = accountForm.dataset.mode === 'register';
	const status = document.querySelector('[data-auth-status]');
	try {
		const result = await apiRequest(registering ? '/api/auth/register' : '/api/auth/login', {
			method: 'POST',
			body: Object.fromEntries(new FormData(accountForm)),
		});
		status.textContent = `Signed in as ${result.user.fullName}.`;
	} catch (error) {
		status.textContent = error.message;
	}
});

document.querySelectorAll('[data-logout]').forEach((button) => {
	button.addEventListener('click', async () => {
		try {
			await apiRequest('/api/auth/logout', { method: 'POST' });
			window.location.reload();
		} catch (error) {
			bookingStatus.textContent = error.message;
		}
	});
});
apiRequest('/api/auth/me').then(() => {
	document.querySelectorAll('[data-auth-open]').forEach((link) => { link.hidden = true; });
	document.querySelectorAll('[data-logout]').forEach((button) => { button.hidden = false; });
}).catch(() => {});

document.querySelector('[data-newsletter-form]').addEventListener('submit', async (event) => {
	event.preventDefault();
	const newsletter = event.currentTarget;
	const status = newsletter.querySelector('[data-newsletter-status]');
	try {
		await apiRequest('/api/newsletter', { method: 'POST', body: Object.fromEntries(new FormData(newsletter)) });
		status.textContent = 'Thanks for subscribing.';
		newsletter.reset();
	} catch (error) {
		status.textContent = error.message;
	}
});

document.querySelector('[data-language-toggle]').addEventListener('click', () => {
	const menu = document.querySelector('[data-language-menu]');
	menu.hidden = !menu.hidden;
	document.querySelector('[data-language-toggle]').setAttribute('aria-expanded', String(!menu.hidden));
});
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => {
	document.querySelector('[data-language_label]').textContent = button.dataset.language;
	document.querySelector('[data-language-menu]').hidden = true;
}));

document.querySelector('[data-utility-action]').addEventListener('click', () => {
	if (window.innerWidth > 700 && window.scrollY > 420) {
		window.scrollTo({ top: 0, behavior: 'smooth' });
		return;
	}
	const panel = document.querySelector('[data-chat-panel]');
	panel.hidden = !panel.hidden;
});
document.querySelector('[data-chat-close]').addEventListener('click', () => { document.querySelector('[data-chat-panel]').hidden = true; });

function updateUtility() {
	const backToTop = window.innerWidth > 700 && window.scrollY > 420;
	const button = document.querySelector('[data-utility-action]');
	button.classList.toggle('is-scrolled', backToTop);
	button.setAttribute('aria-label', backToTop ? 'Back to top' : 'Open chat');
}
window.addEventListener('scroll', updateUtility, { passive: true });
window.addEventListener('resize', updateUtility);
updateUtility();
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		closeMobileMenu();
		document.querySelector('[data-language-menu]').hidden = true;
		document.querySelector('[data-chat-panel]').hidden = true;
		document.querySelector('[data-auth-modal]').hidden = true;
		document.body.style.overflow = '';
	}
});

initialize();
