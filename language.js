const languageOptions = [
	['AF','🇿🇦','Afrikaans'],['SQ','🇦🇱','Albanian'],['AM','🇪🇹','Amharic'],['AR','🇸🇦','Arabic'],['HY','🇦🇲','Armenian'],['AZ','🇦🇿','Azerbaijani'],['EU','🇪🇸','Basque'],['BE','🇧🇾','Belarusian'],['BN','🇧🇩','Bengali'],['BS','🇧🇦','Bosnian'],['BG','🇧🇬','Bulgarian'],['MY','🇲🇲','Burmese'],['CA','🇪🇸','Catalan'],['ZH-CN','🇨🇳','Chinese'],['HR','🇭🇷','Croatian'],['CS','🇨🇿','Czech'],['DA','🇩🇰','Danish'],['NL','🇳🇱','Dutch'],['EN','🇬🇧','English'],['ET','🇪🇪','Estonian'],['FI','🇫🇮','Finnish'],['FR','🇫🇷','French'],['KA','🇬🇪','Georgian'],['DE','🇩🇪','German'],['EL','🇬🇷','Greek'],['HE','🇮🇱','Hebrew'],['HI','🇮🇳','Hindi'],['HU','🇭🇺','Hungarian'],['IS','🇮🇸','Icelandic'],['ID','🇮🇩','Indonesian'],['IT','🇮🇹','Italian'],['JA','🇯🇵','Japanese'],['KK','🇰🇿','Kazakh'],['KO','🇰🇷','Korean'],['LV','🇱🇻','Latvian'],['LT','🇱🇹','Lithuanian'],['MK','🇲🇰','Macedonian'],['MS','🇲🇾','Malay'],['MN','🇲🇳','Mongolian'],['NE','🇳🇵','Nepali'],['NO','🇳🇴','Norwegian'],['FA','🇮🇷','Persian'],['PL','🇵🇱','Polish'],['PT','🇵🇹','Portuguese'],['PA','🇮🇳','Punjabi'],['RO','🇷🇴','Romanian'],['RU','🇷🇺','Russian'],['SR','🇷🇸','Serbian'],['SK','🇸🇰','Slovak'],['SL','🇸🇮','Slovenian'],['ES','🇪🇸','Spanish'],['SW','🇰🇪','Swahili'],['SV','🇸🇪','Swedish'],['TG','🇹🇯','Tajik'],['TA','🇮🇳','Tamil'],['TH','🇹🇭','Thai'],['TR','🇹🇷','Turkish'],['UK','🇺🇦','Ukrainian'],['UR','🇵🇰','Urdu'],['UZ','🇺🇿','Uzbek'],['VI','🇻🇳','Vietnamese'],['CY','🇬🇧','Welsh']
];

function applyGoogleLanguage(code) {
	const googleCode = code === 'ZH-CN' ? 'zh-CN' : code.toLowerCase();
	document.cookie = `googtrans=/en/${googleCode}; path=/`;
	localStorage.setItem('opal-language', code);
	window.location.reload();
}

function initializeLanguageMenu() {
	const toggle = document.querySelector('[data-language-toggle]');
	const menu = document.querySelector('[data-language-menu]');
	if (!toggle || !menu) return;

	menu.replaceChildren();
	for (const [code, flag, name] of languageOptions) {
		const button = document.createElement('button');
		button.type = 'button';
		button.dataset.language = code;
		button.dataset.flag = flag;
		button.innerHTML = `<span aria-hidden="true">${flag}</span><span>${name}</span>`;
		button.addEventListener('click', () => {
			const label = document.querySelector('[data-language-label]');
			const flagLabel = toggle.querySelector('.flag');
			if (label) label.textContent = code;
			if (flagLabel) flagLabel.textContent = flag;
			menu.hidden = true;
			toggle.setAttribute('aria-expanded', 'false');
			applyGoogleLanguage(code);
		});
		menu.append(button);
	}

	toggle.addEventListener('click', (event) => {
		event.stopPropagation();
		menu.hidden = !menu.hidden;
		toggle.setAttribute('aria-expanded', String(!menu.hidden));
	});

	document.addEventListener('click', (event) => {
		if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) {
			menu.hidden = true;
			toggle.setAttribute('aria-expanded', 'false');
		}
	});

	const saved = localStorage.getItem('opal-language') || 'EN';
	const found = languageOptions.find(([code]) => code === saved);
	if (found) {
		const label = document.querySelector('[data-language-label]');
		const flagLabel = toggle.querySelector('.flag');
		if (label) label.textContent = found[0];
		if (flagLabel) flagLabel.textContent = found[1];
	}
}

window.googleTranslateElementInit = function () {
	if (!window.google?.translate?.TranslateElement) return;
	new google.translate.TranslateElement({ pageLanguage: 'en', autoDisplay: false }, 'opal-google-translator');
};

initializeLanguageMenu();

if (!document.querySelector('#opal-google-translator')) {
	const host = document.createElement('div');
	host.id = 'opal-google-translator';
	host.hidden = true;
	document.body.append(host);
}

const cookieLanguage = document.cookie.match(/(?:^|; )googtrans=\/en\/([^;]+)/)?.[1];
const savedLanguage = localStorage.getItem('opal-language');
if ((cookieLanguage && cookieLanguage !== 'en') || (savedLanguage && savedLanguage !== 'EN')) {
	const script = document.createElement('script');
	script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
	document.head.append(script);
}
