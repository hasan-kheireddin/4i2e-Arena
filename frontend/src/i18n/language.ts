export type SupportedLanguage = "en" | "fr" | "de" | "ar";

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: SupportedLanguage;
  label: string;
  direction: "ltr" | "rtl";
}> = [
  { code: "en", label: "English", direction: "ltr" },
  { code: "fr", label: "Français", direction: "ltr" },
  { code: "de", label: "Deutsch", direction: "ltr" },
  { code: "ar", label: "العربية", direction: "rtl" },
];

const RTL_LANGUAGES = new Set<SupportedLanguage>(["ar"]);

export function normalizeLanguage(lang: string | null | undefined): SupportedLanguage {
  const baseLanguage = (lang ?? "en").toLowerCase().split("-")[0] as SupportedLanguage;
  return LANGUAGE_OPTIONS.some(({ code }) => code === baseLanguage) ? baseLanguage : "en";
}

export function applyLanguageToDocument(lang: string): SupportedLanguage {
  const normalizedLanguage = normalizeLanguage(lang);
  localStorage.setItem("i18nextLng", normalizedLanguage);
  document.documentElement.setAttribute("lang", normalizedLanguage);
  document.documentElement.setAttribute("dir", RTL_LANGUAGES.has(normalizedLanguage) ? "rtl" : "ltr");
  return normalizedLanguage;
}
