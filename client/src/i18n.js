import { createI18n } from 'vue-i18n';
import uk from './locales/uk.json';
import en from './locales/en.json';

const i18n = createI18n({
    legacy: false,
    locale: localStorage.getItem('language') || 'uk',
    fallbackLocale: 'uk',
    messages: {
        uk,
        en
    }
});

export default i18n;