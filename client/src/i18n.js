import { createI18n } from 'vue-i18n';
import uk from './locales/uk.json';
import en from './locales/en.json';
import ru from './locales/ru.json';

const savedLocale = localStorage.getItem('language') || 'en';

const messages = { uk, en, ru };

const i18n = createI18n({
    legacy: false,
    locale: savedLocale,
    fallbackLocale: 'en',
    messages
});

export function setLocale(locale) {
    if (!i18n.global.messages[locale]) {
        i18n.global.messages[locale] = messages[locale];
    }
    i18n.global.locale.value = locale;
    localStorage.setItem('language', locale);
}

export default i18n;
