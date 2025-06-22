async function initI18n() {
    const lng = localStorage.getItem('language') || 'uk';

    await i18next
        .use(i18nextBrowserLanguageDetector)
        .init({
            lng: lng,
            fallbackLng: 'uk',
            debug: false,
            resources: {
                uk: {
                    translation: await fetch('/locales/uk/translation.json').then(r => r.json())
                },
                en: {
                    translation: await fetch('/locales/en/translation.json').then(r => r.json())
                }
            }
        });
    updateContent();
    i18next.on('languageChanged', () => {
        localStorage.setItem('language', i18next.language);
        updateContent();
    });
}

function updateContent() {
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const optionsAttr = element.getAttribute('data-i18n-options');
        const options = optionsAttr ? JSON.parse(optionsAttr) : {};
        element.innerHTML = i18next.t(key, options);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        element.placeholder = i18next.t(key);
    });
}

document.querySelectorAll('.lang-btn').forEach(button => {
    button.addEventListener('click', (e) => {
        const lang = e.currentTarget.dataset.lang;
        i18next.changeLanguage(lang);
    });
});

initI18n();