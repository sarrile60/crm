import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translations
import it from './locales/it.json';
import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';

const resources = {
  it: { translation: it },
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  es: { translation: es }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'it',
    debug: false,
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    }
  });

export default i18n;

// Available languages with ISO country codes for flag-icons
export const LANGUAGES = [
  { code: 'it', name: 'Italiano', flagCode: 'it' },
  { code: 'en', name: 'English', flagCode: 'gb' },
  { code: 'de', name: 'Deutsch', flagCode: 'de' },
  { code: 'fr', name: 'Français', flagCode: 'fr' },
  { code: 'es', name: 'Español', flagCode: 'es' }
];
