const catalogGrid = document.querySelector('[data-booking-grid]');
const catalogCount = document.querySelector('[data-catalog-count]');
const catalogRange = document.querySelector('[data-catalog-range]');
const catalogEmpty = document.querySelector('[data-catalog-empty]');
const catalogError = document.querySelector('[data-catalog-error]');
const pagination = document.querySelector('[data-pagination]');
const authModal = document.querySelector('[data-auth-modal]');
const authForm = document.querySelector('[data-auth-form]');
const authStatus = document.querySelector('[data-auth-status]');
const inquiryModal = document.querySelector('[data-inquiry-modal]');
const inquiryForm = document.querySelector('[data-inquiry-form]');
const inquiryStatus = document.querySelector('[data-inquiry-status]');
const pageSize = 12;
let currentPage = 1;

async function apiRequest(url, options = {}) {
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		credentials: 'same-origin',
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(data.error ?? 'The request could not be completed.');
	return data;
}

function setAccountState(user) {
	document.querySelectorAll('[data-auth-open]').forEach((link) => { link.hidden = Boolean(user); });
	document.querySelectorAll('[data-logout]').forEach((button) => {
		button.hidden = !user;
		if (user) button.setAttribute('aria-label', `Sign out ${user.fullName}`);
	});
}

function makeAction(label, className, type, celebrity, celebrityId) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = `button button-small ${className}`;
	button.dataset.inquiryType = type;
	button.dataset.celebrity = celebrity;
	button.dataset.celebrityId = celebrityId;
	button.textContent = label;
	return button;
}

function createCard(celebrity) {
	const article = document.createElement('article');
	article.className = 'booking-card';

	const media = document.createElement('div');
	media.className = 'booking-card-image';
	const image = document.createElement('img');
	image.src = celebrity.image_url;
	image.alt = `Portrait of ${celebrity.name}`;
	image.loading = 'lazy';
	image.addEventListener('error', () => {
		image.src = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=85';
	}, { once: true });
	const badge = document.createElement('span');
	badge.className = 'booking-featured-tag';
	badge.textContent = '☆ FEATURED';
	media.append(image, badge);

	const details = document.createElement('div');
	details.className = 'booking-card-details';
	const title = document.createElement('h3');
	title.textContent = celebrity.name;
	const role = document.createElement('p');
	role.className = 'booking-card-role';
	role.textContent = celebrity.role;
	const actions = document.createElement('div');
	actions.className = 'booking-card-actions';
	actions.append(
		makeAction('▣  Book Now', 'button-blue', 'booking', celebrity.name, celebrity.id),
		makeAction('♡  Donate', 'button-gold', 'donation', celebrity.name),
		makeAction('▤  Fan Card', 'button-card-outline', 'fan_card', celebrity.name),
	);
	details.append(title, role, actions);
	article.append(media, details);
	return article;
}

function renderPagination(page, totalPages) {
	pagination.replaceChildren();
	if (totalPages <= 1) return;

	const addButton = (label, targetPage, accessibleLabel = label) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = `catalog-page-button${targetPage === page ? ' is-current' : ''}`;
		button.textContent = label;
		button.setAttribute('aria-label', accessibleLabel);
		button.setAttribute('aria-current', targetPage === page ? 'page' : 'false');
		button.disabled = targetPage === page;
		button.addEventListener('click', () => loadCatalog(targetPage));
		pagination.append(button);
	};

	addButton('‹', Math.max(1, page - 1), 'Previous page');
	for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
		addButton(String(pageNumber), pageNumber, `Page ${pageNumber}`);
	}
	addButton('›', Math.min(totalPages, page + 1), 'Next page');
}

async function loadCatalog(page = 1) {
	currentPage = page;
	catalogError.hidden = true;
	catalogGrid.setAttribute('aria-busy', 'true');
	try {
		const query = new URLSearchParams({ page: String(page), perPage: String(pageSize) });
		const data = await apiRequest(`/api/celebrities?${query}`);
		catalogGrid.replaceChildren(...data.celebrities.map(createCard));
		catalogEmpty.hidden = data.total !== 0;
		catalogCount.textContent = `Page ${data.page} of ${data.totalPages} • ${data.total} total celebrities`;
		const first = data.total ? (data.page - 1) * data.perPage + 1 : 0;
		const last = Math.min(data.page * data.perPage, data.total);
		catalogRange.textContent = data.total ? `Showing ${first} to ${last} of ${data.total} celebrities` : '';
		renderPagination(data.page, data.totalPages);
		const address = new URL(window.location.href);
		if (page > 1) address.searchParams.set('page', String(page));
		else address.searchParams.delete('page');
		window.history.replaceState({}, '', address);
	} catch (error) {
		catalogError.textContent = error.message;
		catalogError.hidden = false;
	} finally {
		catalogGrid.removeAttribute('aria-busy');
	}
}

catalogGrid.addEventListener('click', (event) => {
	const button = event.target.closest('[data-inquiry-type]');
	if (!button) return;
	if (button.dataset.inquiryType === 'booking') {
		window.location.href = `/booking?celebrity=${encodeURIComponent(button.dataset.celebrityId)}`;
		return;
	}
	if (button.dataset.inquiryType === 'donation') {
		window.location.href = `/donate?celebrity=${encodeURIComponent(button.dataset.celebrityId)}`;
		return;
	}
	openInquiry(button.dataset.inquiryType, button.dataset.celebrity);
});

function closeMobileMenu() {
	const menu = document.querySelector('#book-mobile-menu');
	const toggle = document.querySelector('[data-menu-toggle]');
	menu.hidden = true;
	toggle.setAttribute('aria-expanded', 'false');
	toggle.setAttribute('aria-label', 'Open navigation menu');
}

document.querySelector('[data-menu-toggle]').addEventListener('click', (event) => {
	const toggle = event.currentTarget;
	const menu = document.querySelector('#book-mobile-menu');
	const open = toggle.getAttribute('aria-expanded') === 'true';
	menu.hidden = open;
	toggle.setAttribute('aria-expanded', String(!open));
	toggle.setAttribute('aria-label', open ? 'Open navigation menu' : 'Close navigation menu');
});

document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
	button.addEventListener('click', () => {
		const dark = document.body.classList.toggle('theme-dark');
		document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => {
			toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
		});
		if (button.closest('.mobile-menu')) closeMobileMenu();
	});
});

document.querySelectorAll('[data-logout]').forEach((button) => {
	button.addEventListener('click', async () => {
		button.disabled = true;
		try {
			await apiRequest('/api/auth/logout', { method: 'POST' });
			setAccountState(null);
			closeMobileMenu();
		} catch (error) {
			button.textContent = error.message;
		} finally {
			button.disabled = false;
		}
	});
});

apiRequest('/api/auth/me').then(({ user }) => setAccountState(user)).catch(() => setAccountState(null));

function openAuth(mode) {
	const registering = mode === 'register';
	const nameField = document.querySelector('[data-auth-name-field]');
	document.querySelector('[data-auth-title]').textContent = registering ? 'Create your account' : 'Welcome back';
	document.querySelector('[data-auth-description]').textContent = registering ? 'Join Opal Stars Management to manage your bookings.' : 'Sign in to manage your celebrity booking account.';
	document.querySelector('[data-auth-submit]').textContent = registering ? 'Create Account' : 'Sign In';
	nameField.hidden = !registering;
	nameField.querySelector('input').required = registering;
	authForm.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
	authForm.dataset.mode = mode;
	authStatus.textContent = '';
	authModal.hidden = false;
	document.body.style.overflow = 'hidden';
	(registering ? nameField.querySelector('input') : authForm.elements.email).focus();
}

document.querySelectorAll('[data-auth-open]').forEach((link) => {
	link.addEventListener('click', (event) => {
		event.preventDefault();
		closeMobileMenu();
		openAuth(link.dataset.authOpen);
	});
});

document.querySelector('[data-auth-close]').addEventListener('click', closeAuth);
authModal.addEventListener('click', (event) => { if (event.target === authModal) closeAuth(); });

authForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const registering = authForm.dataset.mode === 'register';
	const button = authForm.querySelector('[type="submit"]');
	authStatus.textContent = 'Please wait...';
	button.disabled = true;
	try {
		const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
		const { user } = await apiRequest(endpoint, { method: 'POST', body: Object.fromEntries(new FormData(authForm)) });
		setAccountState(user);
		authStatus.textContent = registering ? 'Your account was created and you are signed in.' : `Welcome back, ${user.fullName}.`;
		window.setTimeout(closeAuth, 900);
	} catch (error) {
		authStatus.textContent = error.message;
	} finally {
		button.disabled = false;
	}
});

function closeAuth() {
	authModal.hidden = true;
	document.body.style.overflow = '';
}

function openInquiry(type, celebrity = '') {
	const labels = {
		booking: 'Request a celebrity booking',
		donation: 'Ask about supporting a celebrity',
		fan_card: 'Ask about a fan card',
		contact: 'Contact our booking team',
	};
	inquiryForm.elements.type.value = type;
	inquiryForm.elements.celebrity.value = celebrity || 'General inquiry';
	const emailInput = inquiryForm.elements.email;
	const emailLabel = document.querySelector('[data-inquiry-email-label]');
	const emailOptional = type === 'booking';
	emailInput.required = !emailOptional;
	emailLabel.firstChild.textContent = emailOptional ? 'Email address (optional)' : 'Email address';
	document.querySelector('#inquiry-title').textContent = labels[type] ?? labels.contact;
	inquiryStatus.textContent = '';
	inquiryModal.hidden = false;
	document.body.style.overflow = 'hidden';
	inquiryForm.elements.fullName.focus();
}

document.querySelectorAll('[data-open-inquiry]').forEach((button) => {
	button.addEventListener('click', () => openInquiry(button.dataset.openInquiry));
});
document.querySelector('[data-inquiry-close]').addEventListener('click', closeInquiry);
inquiryModal.addEventListener('click', (event) => { if (event.target === inquiryModal) closeInquiry(); });

document.querySelector('[data-inquiry-form]').addEventListener('submit', async (event) => {
	event.preventDefault();
	const button = inquiryForm.querySelector('[type="submit"]');
	const submittedEmail = inquiryForm.elements.email.value.trim();
	const isBooking = inquiryForm.elements.type.value === 'booking';
	button.disabled = true;
	inquiryStatus.textContent = 'Sending...';
	try {
		await apiRequest('/api/inquiries', { method: 'POST', body: Object.fromEntries(new FormData(inquiryForm)) });
		inquiryStatus.textContent = isBooking && !submittedEmail
			? 'Your booking request has been received. Add an email address if you would like our team to reply.'
			: 'Thanks. Your inquiry has been received; our team will follow up.';
		inquiryForm.reset();
	} catch (error) {
		inquiryStatus.textContent = error.message;
	} finally {
		button.disabled = false;
	}
});

function closeInquiry() {
	inquiryModal.hidden = true;
	document.body.style.overflow = '';
}

document.querySelector('[data-newsletter-form]').addEventListener('submit', async (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const button = form.querySelector('[type="submit"]');
	const status = form.querySelector('[data-newsletter-status]');
	button.disabled = true;
	status.textContent = 'Subscribing...';
	try {
		await apiRequest('/api/newsletter', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
		status.textContent = 'Thanks for subscribing.';
		form.reset();
	} catch (error) {
		status.textContent = error.message;
	} finally {
		button.disabled = false;
	}
});

document.querySelector('[data-language-toggle]').addEventListener('click', () => {
	const menu = document.querySelector('[data-language-menu]');
	menu.hidden = !menu.hidden;
	document.querySelector('[data-language-toggle]').setAttribute('aria-expanded', String(!menu.hidden));
});
document.querySelectorAll('[data-language]').forEach((button) => {
	button.addEventListener('click', () => {
		document.querySelector('[data-language_label]').textContent = button.dataset.language;
		document.querySelector('[data-language-menu]').hidden = true;
		document.querySelector('[data-language-toggle]').setAttribute('aria-expanded', 'false');
	});
});

document.querySelector('[data-utility-action]').addEventListener('click', () => {
	if (window.innerWidth > 700 && window.scrollY > 420) {
		window.scrollTo({ top: 0, behavior: 'smooth' });
		return;
	}
	document.querySelector('[data-chat-panel]').hidden = !document.querySelector('[data-chat-panel]').hidden;
});
document.querySelector('[data-chat-close]').addEventListener('click', () => { document.querySelector('[data-chat-panel]').hidden = true; });
document.querySelector('[data-chat-panel] [data-open-inquiry]').addEventListener('click', () => openInquiry('contact'));

function updateUtilityAction() {
	const backToTop = window.innerWidth > 700 && window.scrollY > 420;
	const action = document.querySelector('[data-utility-action]');
	action.classList.toggle('is-scrolled', backToTop);
	action.setAttribute('aria-label', backToTop ? 'Back to top' : 'Open chat');
}
window.addEventListener('scroll', updateUtilityAction, { passive: true });
window.addEventListener('resize', updateUtilityAction);
updateUtilityAction();

document.addEventListener('keydown', (event) => {
	if (event.key !== 'Escape') return;
	closeMobileMenu();
	document.querySelector('[data-language-menu]').hidden = true;
	document.querySelector('[data-chat-panel]').hidden = true;
	if (!authModal.hidden) closeAuth();
	if (!inquiryModal.hidden) closeInquiry();
});

const initialUrl = new URL(window.location.href);
loadCatalog(Number.parseInt(initialUrl.searchParams.get('page'), 10) || 1);
