import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'opal-stars-test-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'test.sqlite');
process.env.SESSION_SECRET = 'local-test-session-secret-with-more-than-32-characters';
for (const key of [
	'BOOKING_SERVICE_FEE_PERCENT', 'BITCOIN_ADDRESS', 'ETHEREUM_ADDRESS', 'USDT_ADDRESS',
	'BANK_NAME', 'BANK_ACCOUNT_NAME',
	'BANK_ACCOUNT_NUMBER', 'BANK_ROUTING_OR_SORT_CODE', 'BANK_BRANCH_CODE', 'BANK_SWIFT_BIC',
	'BANK_ADDRESS', 'BANK_IBAN', 'BANK_REFERENCE_INSTRUCTIONS',
]) process.env[key] = '';
const { app, db } = await import('../server.js');
let server;
let baseUrl;

before(async () => {
	server = app.listen(0);
	await new Promise((resolve) => server.once('listening', resolve));
	baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
	await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	db.close();
	fs.rmSync(testDirectory, { recursive: true, force: true });
});

async function postJson(route, body, cookie) {
	return fetch(`${baseUrl}${route}`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(cookie ? { cookie } : {}),
		},
		body: JSON.stringify(body),
	});
}

test('API persists catalog, account sessions, newsletter and inquiries', async () => {
	const health = await fetch(`${baseUrl}/api/health`);
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { status: 'ok' });

	const bookingPage = await fetch(`${baseUrl}/book`);
	assert.equal(bookingPage.status, 200);
	assert.match(await bookingPage.text(), /Celebrity Services &amp; Experiences/);
	const bookingFormPage = await fetch(`${baseUrl}/booking?celebrity=ronan-keating`, { redirect: 'manual' });
	assert.equal(bookingFormPage.status, 200);
	const bookingHtml = await bookingFormPage.text();
	assert.match(bookingHtml, /Submit Booking Request/);
	assert.match(bookingHtml, /data-payment-default-qr/);
	const bookingHtmlPage = await fetch(`${baseUrl}/booking.html`, { redirect: 'manual' });
	assert.equal(bookingHtmlPage.status, 302);
	assert.equal(bookingHtmlPage.headers.get('location'), '/book');
	const donationPage = await fetch(`${baseUrl}/donate?celebrity=ronan-keating`);
	assert.equal(donationPage.status, 200);
	const donationHtml = await donationPage.text();
	assert.match(donationHtml, /Donation Summary/);
	assert.match(donationHtml, /data-payment-default-qr/);

	const paymentConfigurationResponse = await fetch(`${baseUrl}/api/payment-config`);
	const paymentConfiguration = await paymentConfigurationResponse.json();
	assert.equal(paymentConfiguration.feeConfigured, false);
	assert.ok(paymentConfiguration.methods.every((method) => method.configured === false));
	assert.equal(paymentConfiguration.methods.find((method) => method.id === 'bitcoin').address, '');
	assert.deepEqual(paymentConfiguration.bank.details, {
		bankName: '', accountName: '', accountNumber: '', routingCode: '', branchCode: '',
		swiftBic: '', bankAddress: '', iban: '', referenceInstructions: '',
	});

	const firstPage = await fetch(`${baseUrl}/api/celebrities?page=1&perPage=12`);
	const firstPageData = await firstPage.json();
	assert.equal(firstPageData.total, 29);
	assert.equal(firstPageData.totalPages, 3);
	assert.equal(firstPageData.celebrities.length, 12);
	assert.equal(firstPageData.celebrities[0].name, 'Ronan Patrick John Keating');
	assert.deepEqual(firstPageData.celebrities.slice(0, 6).map((celebrity) => celebrity.name), [
		'Ronan Patrick John Keating', 'Sam Roland Heughan', 'Noah Fearnley',
		'Ariana Grande', 'Robert Downey Jr.', 'Chris Hemsworth',
	]);
	assert.equal(firstPageData.celebrities[0].role, 'Singer, Songwriter, Actor, Television Presenter, Radio Host');
	const celebrityDetailResponse = await fetch(`${baseUrl}/api/celebrities/ronan-keating`);
	assert.equal(celebrityDetailResponse.status, 200);
	assert.equal((await celebrityDetailResponse.json()).celebrity.name, 'Ronan Patrick John Keating');

	const lastPage = await fetch(`${baseUrl}/api/celebrities?page=3&perPage=12`);
	const lastPageData = await lastPage.json();
	assert.equal(lastPageData.celebrities.length, 5);
	assert.equal(lastPageData.page, 3);

	const catalog = await fetch(`${baseUrl}/api/celebrities?search=ariana`);
	assert.equal((await catalog.json()).celebrities[0].name, 'Ariana Grande');

	const registration = await postJson('/api/auth/register', {
		fullName: 'Test User',
		email: 'Test.User@example.com',
		password: 'long-test-password-123',
	});
	assert.equal(registration.status, 201);
	const cookie = registration.headers.get('set-cookie').split(';')[0];
	assert.match(registration.headers.get('set-cookie'), /HttpOnly/i);
	assert.match(registration.headers.get('set-cookie'), /SameSite=Strict/i);
	assert.equal((await registration.json()).user.email, 'test.user@example.com');
	assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash.includes('long-test-password-123'), false);

	const duplicate = await postJson('/api/auth/register', {
		fullName: 'Other User',
		email: 'test.user@example.com',
		password: 'long-test-password-123',
	});
	assert.equal(duplicate.status, 409);

	const session = await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } });
	assert.equal((await session.json()).user.fullName, 'Test User');
	const logout = await postJson('/api/auth/logout', {}, cookie);
	assert.equal(logout.status, 200);
	assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { cookie } })).status, 401);

	const login = await postJson('/api/auth/login', { email: 'TEST.USER@example.com', password: 'long-test-password-123' });
	assert.equal(login.status, 200);

	assert.equal((await postJson('/api/newsletter', { email: 'News@example.com' })).status, 201);
	assert.equal((await postJson('/api/newsletter', { email: 'news@example.com' })).status, 200);
	assert.equal(db.prepare('SELECT COUNT(*) AS count FROM newsletter_subscribers').get().count, 1);

	const inquiry = await postJson('/api/inquiries', {
		type: 'booking',
		fullName: 'Test User',
		email: 'test.user@example.com',
		celebrity: 'Ariana Grande',
		message: 'Please contact me about an event booking.',
	});
	assert.equal(inquiry.status, 201);
	assert.equal(db.prepare('SELECT COUNT(*) AS count FROM inquiries').get().count, 1);

	const bookingWithoutEmail = await postJson('/api/inquiries', {
		type: 'booking',
		fullName: 'Test User',
		email: '',
		celebrity: 'Ariana Grande',
		message: 'Please contact me about an event booking.',
	});
	assert.equal(bookingWithoutEmail.status, 201);
	assert.equal(db.prepare('SELECT email FROM inquiries WHERE id = ?').get((await bookingWithoutEmail.json()).inquiryId).email, '');

	const contactWithoutEmail = await postJson('/api/inquiries', {
		type: 'contact',
		fullName: 'Test User',
		email: '',
		celebrity: '',
		message: 'Please contact me about a general question.',
	});
	assert.equal(contactWithoutEmail.status, 400);

	const bookingForm = new FormData();
	bookingForm.set('celebrityId', 'ronan-keating');
	bookingForm.set('fullName', 'Booking Test User');
	bookingForm.set('email', '');
	bookingForm.set('phone', '+1 555 0100');
	bookingForm.set('eventType', 'Private Party');
	bookingForm.set('eventLocation', 'New York, NY');
	bookingForm.set('eventDate', '2027-06-15');
	bookingForm.set('eventTime', '18:30');
	bookingForm.set('durationMinutes', '60');
	bookingForm.set('requirements', 'Please confirm availability for this date.');
	bookingForm.set('paymentMethod', '');
	bookingForm.set('acceptedTerms', 'true');
	const bookingResponse = await fetch(`${baseUrl}/api/bookings`, { method: 'POST', body: bookingForm });
	assert.equal(bookingResponse.status, 201);
	const booking = await bookingResponse.json();
	assert.equal(booking.status, 'booking_request_received');
	assert.equal(booking.baseFeeCents, 50000000);
	assert.equal(booking.serviceFeeCents, null);
	assert.equal(db.prepare('SELECT email FROM booking_requests WHERE id = ?').get(booking.bookingId).email, '');

	const unconfiguredPaymentForm = new FormData();
	for (const [key, value] of bookingForm.entries()) unconfiguredPaymentForm.set(key, value);
	unconfiguredPaymentForm.set('paymentMethod', 'bitcoin');
	const rejectedPayment = await fetch(`${baseUrl}/api/bookings`, { method: 'POST', body: unconfiguredPaymentForm });
	assert.equal(rejectedPayment.status, 400);

	const paymentEnvironment = {
		BOOKING_SERVICE_FEE_PERCENT: '5',
		BITCOIN_ADDRESS: 'unit-test-address-001',
		ETHEREUM_ADDRESS: 'test-ethereum-address',
		USDT_ADDRESS: 'test-usdt-address',
		BANK_NAME: 'Test Bank',
		BANK_ACCOUNT_NAME: 'Test Account',
		BANK_ACCOUNT_NUMBER: 'test-account-number',
		BANK_ROUTING_OR_SORT_CODE: 'test-routing-code',
		BANK_BRANCH_CODE: 'test-branch-code',
		BANK_SWIFT_BIC: 'test-swift-code',
		BANK_ADDRESS: 'Test Bank Address',
		BANK_IBAN: 'test-iban',
		BANK_REFERENCE_INSTRUCTIONS: 'Use booking reference',
	};
	const previousPaymentEnvironment = Object.fromEntries(Object.keys(paymentEnvironment).map((key) => [key, process.env[key]]));
	try {
		Object.assign(process.env, paymentEnvironment);
		const configuredResponse = await fetch(`${baseUrl}/api/payment-config`);
		const configured = await configuredResponse.json();
		assert.equal(configured.feeConfigured, true);
		assert.deepEqual(configured.methods.map((method) => method.id), ['bitcoin', 'ethereum', 'litecoin', 'bank_transfer', 'usdt', 'busd']);
		assert.deepEqual(configured.methods.filter((method) => method.configured).map((method) => method.id), ['bitcoin', 'ethereum', 'bank_transfer', 'usdt']);
		assert.match(configured.methods.find((method) => method.id === 'bitcoin').qrDataUrl, /^data:image\/png;base64,/);
		assert.equal(configured.methods.find((method) => method.id === 'usdt').network, 'BEP20 / BNB Smart Chain');
		assert.equal(configured.methods.find((method) => method.id === 'bank_transfer').qrDataUrl, '');
		assert.equal(configured.methods.find((method) => method.id === 'bitcoin').address, 'unit-test-address-001');
		assert.deepEqual(configured.bank.details, {
			bankName: 'Test Bank', accountName: 'Test Account', accountNumber: 'test-account-number',
			routingCode: 'test-routing-code', branchCode: 'test-branch-code', swiftBic: 'test-swift-code',
			bankAddress: 'Test Bank Address', iban: 'test-iban', referenceInstructions: 'Use booking reference',
		});
		const donationForm = new FormData();
		donationForm.set('celebrityId', 'ronan-keating');
		donationForm.set('fullName', 'Test Donor');
		donationForm.set('email', 'donor@example.com');
		donationForm.set('amount', '100');
		donationForm.set('charity', "Children's Education Foundation");
		donationForm.set('paymentMethod', 'bitcoin');
		donationForm.set('acceptedTerms', 'true');
		donationForm.append('paymentProof', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l24AAAAASUVORK5CYII=', 'base64')]), 'proof.png');
		const donationResponse = await fetch(`${baseUrl}/api/donations`, { method: 'POST', body: donationForm });
		assert.equal(donationResponse.status, 201);
		const donation = await donationResponse.json();
		assert.equal(donation.status, 'proof_received_pending_review');
		assert.equal(donation.processingFeeCents, 500);
		assert.equal(donation.totalCents, 10500);
	} finally {
		for (const [key, value] of Object.entries(previousPaymentEnvironment)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});