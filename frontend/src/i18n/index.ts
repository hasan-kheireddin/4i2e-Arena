import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import ar from "./locales/ar.json";
import { applyLanguageToDocument, normalizeLanguage } from "./language";

// Persist selected language across page reloads
const savedLang = normalizeLanguage(localStorage.getItem("i18nextLng"));

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fr: { translation: fr },
    de: { translation: de },
    ar: { translation: ar },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

applyLanguageToDocument(savedLang);

export default i18n;
