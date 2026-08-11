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

export function isRtlLanguage(lang: string | null | undefined): boolean {
  return RTL_LANGUAGES.has(normalizeLanguage(lang));
}

export function applyLanguageToDocument(lang: string): SupportedLanguage {
  const normalizedLanguage = normalizeLanguage(lang);
  localStorage.setItem("i18nextLng", normalizedLanguage);
  document.documentElement.setAttribute("lang", normalizedLanguage);
  document.documentElement.setAttribute("dir", RTL_LANGUAGES.has(normalizedLanguage) ? "rtl" : "ltr");
  return normalizedLanguage;
}

/**
 * Whether the language in this browser was picked by hand.
 *
 * `preferred_language` defaults to "en" on every account, so the profile alone
 * cannot say whether a user chose English or simply never chose at all — which
 * is what used to reset the language to English on sign-in. This marker records
 * a deliberate pick (the switcher on the public pages, or the settings tab) so
 * that choice can survive the login and be written back to the account.
 */
const EXPLICIT_CHOICE_KEY = "languageChosen";

export function rememberLanguageChoice(): void {
  localStorage.setItem(EXPLICIT_CHOICE_KEY, "1");
}

export function hasExplicitLanguageChoice(): boolean {
  return localStorage.getItem(EXPLICIT_CHOICE_KEY) === "1";
}

/**
 * Dropped on logout: the next person to sign in on this browser must get their
 * own account's language, not the one the previous user happened to select.
 */
export function forgetLanguageChoice(): void {
  localStorage.removeItem(EXPLICIT_CHOICE_KEY);
}
