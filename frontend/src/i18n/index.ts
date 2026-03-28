import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";

// Persist selected language across page reloads
const savedLang = localStorage.getItem('i18nextLng') ?? 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

document.documentElement.setAttribute('dir', 'ltr');
document.documentElement.setAttribute('lang', savedLang);

export default i18n;
