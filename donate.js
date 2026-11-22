const form = document.querySelector('[data-donation-form]');
const status = document.querySelector('[data-donation-status]');
const paymentSelect = document.querySelector('#donation-payment-method');
const proofInput = document.querySelector('[data-proof-input]');
const tabs = [...document.querySelectorAll('[data-donation-tab]')];
const panels = [...document.querySelectorAll('[data-donation-panel]')];
let celebrity;
let paymentConfiguration;
let currentStep = 1;

async function apiRequest(url, options = {}) {
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		credentials: 'same-origin',
		headers: options.body instanceof FormData ? undefined : (options.body ? { 'Content-Type': 'application/json' } : undefined),
		body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.');
	return result;
}

function showStep(step) {
	currentStep = step;
	panels.forEach((panel) => { panel.hidden = Number(panel.dataset.donationPanel) !== step; });
	tabs.forEach((tab) => {
		const active = Number(tab.dataset.donationTab) === step;
		tab.classList.toggle('is-active', active);
		tab.setAttribute('aria-selected', String(active));
	});
	form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectedCharity() {
	return form.querySelector('[name="charity"]:checked')?.value ?? '';
}

function updateSummary() {
	const amount = Number(form.elements.amount.value) || 0;
	const feePercent = paymentConfiguration?.serviceFeePercent ?? 3;
	const fee = Math.round(amount * feePercent) / 100;
	const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);
	document.querySelector('[data-summary-celebrity]').textContent = celebrity?.name ?? 'Loading';
	document.querySelector('[data-processing-rate]').textContent = `${feePercent}%`;
	document.querySelector('[data-summary-amount]').textContent = money(amount);
	document.querySelector('[data-summary-fee]').textContent = money(fee);
	document.querySelector('[data-summary-total]').textContent = money(amount + fee);
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
	copy.addEventListener('click', () => copyValue(value, copy));
	row.append(term, description, copy);
	list.append(row);
}

async function copyValue(value, button) {
	try {
		await navigator.clipboard.writeText(value);
		button.textContent = 'Copied';
		window.setTimeout(() => { button.textContent = 'Copy'; }, 1400);
	} catch {
		status.textContent = 'Could not copy automatically. Select and copy the value.';
	}
}

function showPaymentDetails(method) {
	const selected = paymentConfiguration?.methods.find((item) => item.id === method);
	const enabled = Boolean(selected?.configured);
	const qrBlock = document.querySelector('[data-payment-qr-block]');
	const addressBlock = document.querySelector('[data-payment-address-block]');
	const bankBlock = document.querySelector('[data-bank-details]');
	const qrImage = document.querySelector('[data-payment-qr]');
	const network = document.querySelector('[data-payment-network]');
	const defaultQrBlock = document.querySelector('[data-payment-default-qr]');
	const selectedDetails = document.querySelector('[data-payment-selected-details]');
	defaultQrBlock.hidden = Boolean(method);
	selectedDetails.hidden = !method;
	proofInput.required = Boolean(method);
	qrBlock.hidden = !enabled || !selected.qrDataUrl;
	addressBlock.hidden = !enabled || !selected.address;
	bankBlock.hidden = method !== 'bank_transfer' || !enabled;
	qrImage.hidden = !enabled || !selected.qrDataUrl;
	qrImage.src = selected?.qrDataUrl ?? '';
	qrImage.alt = `${selected?.label ?? 'Payment'} QR code`;
	document.querySelector('#donation-payment-address').value = selected?.address ?? '';
	document.querySelector('[data-address-label]').textContent = selected?.label ?? 'Payment';
	network.hidden = !selected?.network;
	network.textContent = selected?.network ? `Network: ${selected.network}. Send only on this network.` : '';
	const bankValues = document.querySelector('[data-bank-values]');
	bankValues.replaceChildren();
	if (method === 'bank_transfer' && enabled) {
		const details = paymentConfiguration.bank.details;
		appendBankDetail(bankValues, 'Bank Name', details.bankName);
		appendBankDetail(bankValues, 'Account Name', details.accountName);
		appendBankDetail(bankValues, 'Account Number', details.accountNumber);
		appendBankDetail(bankValues, 'Routing Number', details.routingCode);
		appendBankDetail(bankValues, 'SWIFT Code', details.swiftBic);
		appendBankDetail(bankValues, 'Payment Reference', details.referenceInstructions);
	}
}

function renderPaymentConfiguration(configuration) {
	paymentConfiguration = configuration;
	const bitcoin = configuration.methods.find((item) => item.id === 'bitcoin');
	const defaultQr = document.querySelector('[data-default-payment-qr]');
	defaultQr.src = bitcoin?.qrDataUrl ?? '';
	defaultQr.hidden = !bitcoin?.qrDataUrl;
	const defaultAddress = bitcoin?.address ?? '';
	const defaultAccount = document.querySelector('[data-default-payment-address]');
	defaultAccount.textContent = defaultAddress ? `Bitcoin address: ${defaultAddress}` : '';
	defaultAccount.hidden = !defaultAddress;
	paymentSelect.replaceChildren(new Option('Choose a payment method...', ''));
	const unavailable = [];
	for (const method of configuration.methods) {
		const option = new Option(method.label, method.id);
		option.disabled = !method.configured;
		paymentSelect.add(option);
		if (!method.configured) unavailable.push(`${method.label}: ${method.disabledReason}`);
	}
	const message = configuration.feeConfigured
		? (unavailable.length ? `Unavailable payment methods: ${unavailable.join(' ')}` : '')
		: 'Payment fee configuration is unavailable. Contact Opal Stars Management before donating.';
	const messageNode = document.querySelector('[data-payment-config-message]');
	messageNode.textContent = message;
	messageNode.hidden = !message;
	updateSummary();
}

form.querySelectorAll('[data-amount]').forEach((button) => {
	button.addEventListener('click', () => {
		form.elements.amount.value = button.dataset.amount;
		form.querySelectorAll('[data-amount]').forEach((preset) => preset.classList.toggle('is-selected', preset === button));
		updateSummary();
	});
});
form.elements.amount.addEventListener('input', () => {
	form.querySelectorAll('[data-amount]').forEach((button) => button.classList.remove('is-selected'));
	updateSummary();
});
paymentSelect.addEventListener('change', () => showPaymentDetails(paymentSelect.value));
document.querySelector('[data-copy-address]').addEventListener('click', (event) => {
	copyValue(document.querySelector('#donation-payment-address').value, event.currentTarget);
});
proofInput.addEventListener('change', () => {
	const file = proofInput.files?.[0];
	if (file) document.querySelector('.proof-dropzone strong').textContent = file.name;
});

document.querySelectorAll('[data-donation-next]').forEach((button) => {
	button.addEventListener('click', () => {
		const destination = Number(button.dataset.donationNext);
		if (currentStep === 1 && ![...form.querySelectorAll('[data-donation-panel="1"] [required]')].every((field) => field.reportValidity())) return;
		if (destination === 3 && !selectedCharity()) {
			document.querySelector('[data-charity-error]').textContent = 'Choose a supported charity to continue.';
			document.querySelector('[data-charity-error]').hidden = false;
			return;
		}
		document.querySelector('[data-charity-error]').hidden = true;
		updateSummary();
		showStep(destination);
	});
});
document.querySelectorAll('[data-donation-previous]').forEach((button) => {
	button.addEventListener('click', () => showStep(Number(button.dataset.donationPrevious)));
});
tabs.forEach((tab) => {
	tab.addEventListener('click', () => {
		const destination = Number(tab.dataset.donationTab);
		if (destination > currentStep && currentStep === 1 && ![...form.querySelectorAll('[data-donation-panel="1"] [required]')].every((field) => field.reportValidity())) return;
		if (destination === 3 && !selectedCharity()) return;
		updateSummary();
		showStep(destination);
	});
});

form.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!selectedCharity() || !paymentSelect.value || !proofInput.files?.length || !form.elements.acceptedTerms.checked) {
		document.querySelector('[data-payment-error]').textContent = 'Choose a charity and payment method, upload payment proof, and accept the donation terms.';
		document.querySelector('[data-payment-error]').hidden = false;
		return;
	}
	const submit = document.querySelector('[data-donation-submit]');
	const body = new FormData(form);
	body.set('acceptedTerms', String(form.elements.acceptedTerms.checked));
	status.textContent = 'Submitting donation for review...';
	submit.disabled = true;
	try {
		const result = await apiRequest('/api/donations', { method: 'POST', body });
		status.textContent = `Donation received for review. Reference: ${result.donationId}. Opal Stars Management will confirm payment.`;
		status.classList.add('is-success');
		form.reset();
		proofInput.required = false;
	} catch (error) {
		status.textContent = error.message;
		status.classList.remove('is-success');
	} finally {
		submit.disabled = false;
	}
});

async function initialize() {
	try {
		const id = new URLSearchParams(location.search).get('celebrity');
		if (!id) throw new Error('Choose a celebrity from the catalog to start a donation.');
		const [data, configuration] = await Promise.all([
			apiRequest(`/api/celebrities/${encodeURIComponent(id)}`),
			apiRequest('/api/payment-config'),
		]);
		celebrity = data.celebrity;
		document.title = `Donate with ${celebrity.name} | Opal Stars Management`;
		document.querySelectorAll('[data-celebrity-name], [data-form-celebrity], [data-callout-celebrity]').forEach((element) => { element.textContent = celebrity.name; });
		document.querySelector('[data-celebrity-country]').textContent = celebrity.country;
		document.querySelector('[data-celebrity-role]').textContent = celebrity.role;
		const image = document.querySelector('[data-celebrity-image]');
		image.src = celebrity.image_url;
		image.alt = `Portrait of ${celebrity.name}`;
		image.hidden = false;
		form.elements.celebrityId.value = celebrity.id;
		renderPaymentConfiguration(configuration);
	} catch (error) {
		status.textContent = error.message;
		document.querySelector('[data-donation-submit]').disabled = true;
	}
}

document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
	button.addEventListener('click', () => {
		const dark = document.body.classList.toggle('theme-dark');
		button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
	});
});
document.querySelector('[data-menu-toggle]').addEventListener('click', (event) => {
	const toggle = event.currentTarget;
	const menu = document.querySelector('.mobile-menu');
	const open = toggle.getAttribute('aria-expanded') === 'true';
	menu.hidden = open;
	toggle.setAttribute('aria-expanded', String(!open));
});

initialize();
