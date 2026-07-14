import { useTranslation } from "react-i18next";
import { LANGUAGE_OPTIONS, applyLanguageToDocument, normalizeLanguage } from "../i18n/language";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className = "" }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language);

  const handleLanguageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextLanguage = event.target.value;
    void i18n.changeLanguage(nextLanguage);
    applyLanguageToDocument(nextLanguage);
  };

  return (
    <div className={className}>
      <label htmlFor="public-language-switcher" className="sr-only">
        {t("settings.appearance.language")}
      </label>
      <select
        id="public-language-switcher"
        aria-label={t("settings.appearance.language")}
        value={currentLanguage}
        onChange={handleLanguageChange}
        className="h-9 rounded-lg border px-3 text-sm font-medium outline-none transition-colors"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg-card)",
          color: "var(--color-text-primary)",
        }}
      >
        {LANGUAGE_OPTIONS.map((language) => (
          <option key={language.code} value={language.code} dir={language.direction}>
            {language.label}
          </option>
        ))}
      </select>
    </div>
  );
}
