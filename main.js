const menuToggle = document.querySelector('[data-menu-toggle]');
const mobileMenu = document.querySelector('#mobile-menu');
const utilityAction = document.querySelector('[data-utility-action]');
const chatPanel = document.querySelector('[data-chat-panel]');
const languageToggle = document.querySelector('[data-language-toggle]');
const languageMenu = document.querySelector('[data-language-menu]');
const modal = document.querySelector('[data-modal]');
const modalTitle = document.querySelector('[data-modal-title]');
const modalDescription = document.querySelector('[data-modal-description]');
const modalSubmit = document.querySelector('[data-modal-submit]');
const accountStatus = document.querySelector('[data-account-status]');
const registerOnlyField = document.querySelector('[data-register-only]');
const accountForm = document.querySelector('[data-account-form]');
const inquiryModal = document.querySelector('[data-inquiry-modal]');
const inquiryForm = document.querySelector('[data-inquiry-form]');
const inquiryStatus = document.querySelector('[data-inquiry-status]');

async function apiRequest(endpoint, options = {}) {
	const response = await fetch(endpoint, {
		method: options.method ?? 'GET',
		credentials: 'same-origin',
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
	});
	const result = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.');
	return result;
}

function setAuthenticatedUser(user) {
	document.querySelectorAll('[data-open-modal="signin"], [data-open-modal="register"]').forEach((link) => {
		link.hidden = Boolean(user);
	});
	document.querySelectorAll('[data-logout]').forEach((button) => {
		button.hidden = !user;
	});
	if (user) {
		document.querySelectorAll('[data-logout]').forEach((button) => {
			button.setAttribute('aria-label', `Sign out ${user.fullName}`);
		});
	}
}

apiRequest('/api/auth/me').then(({ user }) => setAuthenticatedUser(user)).catch(() => setAuthenticatedUser(null));

document.querySelectorAll('[data-logout]').forEach((button) => {
	button.addEventListener('click', async () => {
		button.disabled = true;
		try {
			await apiRequest('/api/auth/logout', { method: 'POST' });
			setAuthenticatedUser(null);
			closeMenu();
		} catch (error) {
			button.textContent = error.message;
		} finally {
			button.disabled = false;
		}
	});
});

function closeMenu() {
	if (!menuToggle || !mobileMenu) return;
	mobileMenu.hidden = true;
	menuToggle.setAttribute('aria-expanded', 'false');
	menuToggle.setAttribute('aria-label', 'Open navigation menu');
}

menuToggle?.addEventListener('click', () => {
	const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
	menuToggle.setAttribute('aria-expanded', String(!isOpen));
	menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
	mobileMenu.hidden = isOpen;
});

mobileMenu?.querySelectorAll('a[href^="#"]').forEach((link) => {
	link.addEventListener('click', () => {
		if (!link.hasAttribute('data-open-modal')) closeMenu();
	});
});

document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
	button.addEventListener('click', () => {
		const isDark = document.body.classList.toggle('theme-dark');
		if (button.closest('.mobile-menu')) closeMenu();
		document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => {
			toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
		});
	});
});

function updateScrollAction() {
	const canScrollToTop = window.innerWidth > 700 && window.scrollY > 420;
	utilityAction?.classList.toggle('is-scrolled', canScrollToTop);
	utilityAction?.setAttribute('aria-label', canScrollToTop ? 'Back to top' : 'Open chat');
}
window.addEventListener('scroll', updateScrollAction, { passive: true });
window.addEventListener('resize', updateScrollAction);
updateScrollAction();

utilityAction?.addEventListener('click', () => {
	if (window.innerWidth > 700 && window.scrollY > 420) {
		window.scrollTo({ top: 0, behavior: 'smooth' });
		return;
	}
	chatPanel.hidden = !chatPanel.hidden;
});
document.querySelector('[data-chat-close]')?.addEventListener('click', () => {
	chatPanel.hidden = true;
});

languageToggle?.addEventListener('click', () => {
	languageMenu.hidden = !languageMenu.hidden;
	languageToggle.setAttribute('aria-expanded', String(!languageMenu.hidden));
});
languageMenu?.querySelectorAll('[data-language]').forEach((option) => {
	option.addEventListener('click', () => {
		const language = option.dataset.language;
		const flag = option.dataset.flag;
		document.querySelector('[data-language-label]').textContent = language;
		const flagElement = document.querySelector('[data-language-toggle] .flag');
		if (flagElement) flagElement.textContent = flag;
		localStorage.setItem('opal-language', language);
		languageMenu.hidden = true;
		languageToggle.setAttribute('aria-expanded', 'false');
		document.documentElement.lang = language.toLowerCase();
	});
});

const savedLanguage = localStorage.getItem('opal-language');
const savedOption = [...(languageMenu?.querySelectorAll('[data-language]') ?? [])].find((option) => option.dataset.language === savedLanguage);
if (savedOption) savedOption.click();

document.querySelector('[data-search-form]')?.addEventListener('submit', async (event) => {
	event.preventDefault();
	const query = new FormData(event.currentTarget).get('q').trim();
	const emptyState = document.querySelector('[data-empty-state]');
	const submitButton = event.currentTarget.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	try {
		const { celebrities } = await apiRequest(`/api/celebrities?search=${encodeURIComponent(query)}`);
		const matches = new Set(celebrities.map((celebrity) => celebrity.name.toLowerCase()));
		let visibleCount = 0;
		document.querySelectorAll('.celebrity-card').forEach((card) => {
			card.hidden = !matches.has(card.dataset.name.toLowerCase());
			if (!card.hidden) visibleCount += 1;
		});
		emptyState.textContent = 'No celebrities match that search. Try another name.';
		emptyState.hidden = visibleCount > 0;
	} catch (error) {
		emptyState.textContent = error.message;
		emptyState.hidden = false;
	} finally {
		submitButton.disabled = false;
		document.querySelector('#featured').scrollIntoView({ behavior: 'smooth' });
	}
});

document.querySelector('[data-gallery-filters]')?.addEventListener('click', (event) => {
	const filter = event.target.closest('[data-filter]');
	if (!filter) return;
	document.querySelectorAll('[data-filter]').forEach((button) => {
		const active = button === filter;
		button.classList.toggle('is-active', active);
		button.setAttribute('aria-pressed', String(active));
	});
	const selected = filter.dataset.filter;
	document.querySelectorAll('[data-gallery-category]').forEach((image) => {
		image.hidden = selected !== 'all' && image.dataset.galleryCategory !== selected;
	});
});

function openAccountModal(mode) {
	const isRegister = mode === 'register';
	modalTitle.textContent = isRegister ? 'Create your account' : 'Welcome back';
	modalDescription.textContent = isRegister ? 'Join Opal Stars Management to save and manage your bookings.' : 'Sign in to manage your celebrity booking account.';
	modalSubmit.textContent = isRegister ? 'Create Account' : 'Sign In';
	registerOnlyField.hidden = !isRegister;
	registerOnlyField.querySelector('input').required = isRegister;
	accountForm.elements.password.autocomplete = isRegister ? 'new-password' : 'current-password';
	accountForm.dataset.mode = isRegister ? 'register' : 'signin';
	accountStatus.textContent = '';
	modal.hidden = false;
	document.body.style.overflow = 'hidden';
	(isRegister ? registerOnlyField.querySelector('input') : accountForm.elements.email).focus();
}
document.querySelectorAll('[data-open-modal]').forEach((link) => {
	link.addEventListener('click', (event) => {
		event.preventDefault();
		closeMenu();
		openAccountModal(link.dataset.openModal);
	});
});
function closeAccountModal() {
	modal.hidden = true;
	document.body.style.overflow = '';
}
document.querySelector('[data-modal-close]')?.addEventListener('click', closeAccountModal);
modal?.addEventListener('click', (event) => {
	if (event.target === modal) closeAccountModal();
});
document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape') {
		closeMenu();
		languageMenu.hidden = true;
		chatPanel.hidden = true;
		if (!modal.hidden) closeAccountModal();
		if (!inquiryModal.hidden) closeInquiryModal();
	}
});

accountForm?.addEventListener('submit', async (event) => {
	event.preventDefault();
	const isRegister = accountForm.dataset.mode === 'register';
	const values = Object.fromEntries(new FormData(accountForm).entries());
	const submitButton = accountForm.querySelector('[type="submit"]');
	accountStatus.textContent = 'Please wait...';
	submitButton.disabled = true;
	try {
		const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
		const { user } = await apiRequest(endpoint, { method: 'POST', body: values });
		setAuthenticatedUser(user);
		accountStatus.textContent = isRegister ? 'Your account was created and you are signed in.' : `Welcome back, ${user.fullName}.`;
		window.setTimeout(closeAccountModal, 1000);
	} catch (error) {
		accountStatus.textContent = error.message;
	} finally {
		submitButton.disabled = false;
	}
});

function openInquiryModal(type, celebrity = '') {
	const titles = {
		booking: 'Request a celebrity booking',
		donation: 'Ask about supporting a celebrity',
		fan_card: 'Ask about a fan card',
		contact: 'Contact our team',
	};
	inquiryForm.elements.type.value = type;
	inquiryForm.elements.celebrity.value = celebrity;
	inquiryModal.querySelector('#inquiry-title').textContent = titles[type] ?? titles.contact;
	inquiryStatus.textContent = '';
	chatPanel.hidden = true;
	inquiryModal.hidden = false;
	document.body.style.overflow = 'hidden';
	inquiryForm.elements.fullName.focus();
}

function closeInquiryModal() {
	inquiryModal.hidden = true;
	document.body.style.overflow = '';
}

document.querySelectorAll('[data-open-inquiry]').forEach((trigger) => {
	trigger.addEventListener('click', (event) => {
		if (trigger.dataset.openInquiry === 'booking') {
			event.preventDefault();
			const celebrityId = trigger.dataset.celebrityId;
			window.location.href = celebrityId
				? `/booking?celebrity=${encodeURIComponent(celebrityId)}`
				: '/book';
			return;
		}
		if (trigger.dataset.openInquiry === 'donation') {
			event.preventDefault();
			const openDonation = (celebrityId) => { window.location.href = `/donate?celebrity=${encodeURIComponent(celebrityId)}`; };
			if (trigger.dataset.celebrityId) {
				openDonation(trigger.dataset.celebrityId);
				return;
			}
			apiRequest(`/api/celebrities?search=${encodeURIComponent(trigger.dataset.celebrity ?? '')}`)
				.then(({ celebrities }) => {
					const match = celebrities.find((item) => item.name.toLowerCase().includes(trigger.dataset.celebrity.toLowerCase()));
					if (match) openDonation(match.id);
					else openInquiryModal('donation', trigger.dataset.celebrity ?? '');
				})
				.catch(() => openInquiryModal('donation', trigger.dataset.celebrity ?? ''));
			return;
		}
		event.preventDefault();
		openInquiryModal(trigger.dataset.openInquiry, trigger.dataset.celebrity ?? '');
	});
});
document.querySelector('[data-inquiry-close]')?.addEventListener('click', closeInquiryModal);
inquiryModal?.addEventListener('click', (event) => {
	if (event.target === inquiryModal) closeInquiryModal();
});
inquiryForm?.addEventListener('submit', async (event) => {
	event.preventDefault();
	const submitButton = inquiryForm.querySelector('[type="submit"]');
	const values = Object.fromEntries(new FormData(inquiryForm).entries());
	inquiryStatus.textContent = 'Sending...';
	submitButton.disabled = true;
	try {
		await apiRequest('/api/inquiries', { method: 'POST', body: values });
		inquiryStatus.textContent = 'Thanks. Your inquiry has been received; our team will follow up.';
		inquiryForm.reset();
	} catch (error) {
		inquiryStatus.textContent = error.message;
	} finally {
		submitButton.disabled = false;
	}
});

document.querySelector('[data-newsletter-form]')?.addEventListener('submit', async (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const status = document.querySelector('[data-newsletter-status]');
	const button = form.querySelector('[type="submit"]');
	button.disabled = true;
	status.textContent = 'Subscribing...';
	try {
		await apiRequest('/api/newsletter', { method: 'POST', body: Object.fromEntries(new FormData(form).entries()) });
		status.textContent = 'Thanks for subscribing.';
		form.reset();
	} catch (error) {
		status.textContent = error.message;
	} finally {
		button.disabled = false;
	}
});
