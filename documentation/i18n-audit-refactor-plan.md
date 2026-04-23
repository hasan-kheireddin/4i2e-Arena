# React + Django i18n Audit and Refactor Plan

## Requirement

**All user-facing text must be translatable.**

---

## 1) Technical Documentation

### A. Overview

In this system, i18n means every user-visible string (UI copy, labels, aria text, validation feedback, and error messaging) must come from translation keys and be rendered via `t(...)` on the frontend, or via translatable message strategy on the backend.

Current architecture:

- Frontend uses `i18next` + `react-i18next` (`frontend/src/i18n/index.ts`).
- Active frontend languages: `en`, `fr`, `de`, `ar`.
- RTL handling for Arabic is implemented through `applyLanguageToDocument(...)` (`lang`/`dir`).
- Language bootstraps from `localStorage` (`i18nextLng`).
- Backend stores `user.preferred_language`, but frontend auth flows do not globally enforce it as language source of truth.
- Backend API currently returns mostly English prose (`detail`, validation strings).

### B. Problems Analysis

| Problem | Why it breaks the requirement | Observed scope |
|---|---|---|
| Hardcoded English in frontend | Bypasses translation files entirely | NotFoundPage, OAuthCallbackPage, SettingsPage, PlayPage, PongPage, Navbar aria labels, Spinner default label |
| Rendering backend prose directly | UI language depends on backend English text, not frontend translations | `apiErr.detail`, `Error.message`, DRF field errors shown as-is |
| localStorage-only language bootstrap | Authenticated user language can drift from actual profile preference | `user.preferred_language` not globally applied on login/session restore |
| Backend not i18n-enabled | No locale negotiation, no backend localization path | `LANGUAGE_CODE = "en-us"`, no locale middleware flow |
| Language mismatch | Backend model excludes `de` while frontend supports `de` | `preferred_language` choices do not include German |
| Unused locale file | Incomplete `nl.json` creates noise and maintenance risk | File exists but is not active and is missing many keys |
| Switcher not globally accessible | Language control not consistently available across app shell | Used in landing/login/register but not globally in authenticated navbar/layout |

### C. Correct Architecture

#### Single source of truth for language

- **Guest state:** `localStorage` + browser fallback.
- **Authenticated state:** `user.preferred_language` is authoritative.
- On auth restore/login/oauth/2FA success, apply backend preference globally to i18n + document.

#### Frontend/backend language sync

- Centralize language apply/sync in `AuthProvider` or a root `LanguageSyncProvider`.
- Any profile language update must atomically update:
  1. i18n language
  2. document `lang`/`dir`
  3. localStorage
  4. backend profile

#### Error strategy: codes vs prose

- Prefer backend returning stable **error codes** and optional params.
- Frontend maps codes to translation keys (`t("api.<code>")`).
- UI must not render raw backend prose.

---

## 2) Refactoring Plan (Step-by-step)

### A. Remove hardcoded text

1. Replace literals with `t(...)` in:
   - `frontend/src/pages/Notfoundpage.tsx`
   - `frontend/src/pages/OAuthCallbackPage.tsx`
   - `frontend/src/pages/SettingsPage.tsx`
   - `frontend/src/pages/PlayPage.tsx`
   - `frontend/src/pages/PongPage.tsx`
   - `frontend/src/components/Navbar.tsx`
   - `frontend/src/components/ui/Spinner.tsx`
2. Add missing translation keys in `en.json`, then mirror to `fr/de/ar`.
3. Remove literal fallback strings from `t(key, "literal")` for user-facing text.

**Before**

```tsx
<p>Page not found</p>
<button>Go Home</button>
```

**After**

```tsx
const { t } = useTranslation();
<p>{t("not_found.message")}</p>
<button>{t("not_found.go_home")}</button>
```

### B. Fix error handling

#### Option 1 (Recommended): backend error codes + frontend translation mapping

1. Define error contract:
   - top-level: `{ code, params? }`
   - field-level: `{ fields: { field: [{ code, params? }] } }`
2. Replace serializer/view/validator prose with codes.
3. Add frontend mapper `translateApiError(...)` and use `t("api.<code>")`.
4. Ban direct rendering of `apiErr.detail` and raw `Error.message`.

#### Option 2: backend localization with Accept-Language

1. Configure Django `LANGUAGES`, `LocaleMiddleware`, `LOCALE_PATHS`.
2. Mark backend strings with gettext utilities.
3. Send `Accept-Language` from frontend API client.
4. Maintain locale catalogs for active backend languages.

### C. Global language sync

1. Add `"de"` to backend `preferred_language` choices.
2. In auth/session restore, apply `user.preferred_language` globally.
3. Keep localStorage as guest fallback only.
4. Keep settings page language update, but reconcile with server response as final source.

---

## 3) Code Examples

### A. Fixed React component with `t(...)`

```tsx
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <>
      <p>{t("not_found.message")}</p>
      <Link to="/">{t("not_found.go_home")}</Link>
    </>
  );
}
```

### B. Improved error handling pattern (code-based)

```ts
// frontend/src/services/apiErrors.ts
export interface CodedApiError {
  status: number;
  code: string;
  params?: Record<string, string | number>;
  fields?: Record<string, Array<{ code: string; params?: Record<string, unknown> }>>;
}

export function translateApiError(
  err: CodedApiError,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return {
    message: t(`api.${err.code}`, err.params),
    fieldErrors: Object.fromEntries(
      Object.entries(err.fields ?? {}).map(([field, issues]) => [
        field,
        issues.map((i) => t(`api.${i.code}`, i.params as Record<string, unknown>)),
      ]),
    ),
  };
}
```

```py
# backend example response style
return Response({"code": "auth.invalid_credentials"}, status=401)
```

### C. Auth context language sync example

```tsx
import i18n from "../i18n";
import { applyLanguageToDocument, normalizeLanguage } from "../i18n/language";

async function applyAppLanguage(lang?: string) {
  const normalized = applyLanguageToDocument(normalizeLanguage(lang));
  if (i18n.resolvedLanguage !== normalized) {
    await i18n.changeLanguage(normalized);
  }
}

// inside AuthProvider
useEffect(() => {
  if (user?.preferred_language) {
    void applyAppLanguage(user.preferred_language);
  }
}, [user?.preferred_language]);
```

### D. i18n initialization improvement

```ts
const initialLanguage = normalizeLanguage(
  localStorage.getItem("i18nextLng")
    ?? document.documentElement.lang
    ?? navigator.language,
);

i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  supportedLngs: ["en", "fr", "de", "ar"],
  nonExplicitSupportedLngs: true,
  load: "languageOnly",
});
```

---

## 4) Tooling and CI Improvements

### ESLint rule to block hardcoded strings

Use an i18n-focused lint rule (for example `i18next/no-literal-string`) and fail on JSX literals.

```js
// .eslintrc.cjs
module.exports = {
  // ...
  plugins: ["i18next"],
  rules: {
    "i18next/no-literal-string": ["error", { markupOnly: true }],
  },
};
```

### Translation key parity script

Add `frontend/scripts/check-i18n-parity.mjs`:

- Flatten keys from `en.json`
- Compare each active locale (`fr/de/ar`)
- Fail on missing or extra keys

### CI checks

Run in CI on every PR:

1. `npm run lint`
2. `npm run type-check`
3. `node scripts/check-i18n-parity.mjs`
4. Optional: dedicated hardcoded-string scan script for JSX/TSX

---

## 5) Production Definition of Done

- No user-facing hardcoded strings remain in frontend code.
- No raw backend prose is rendered directly in UI.
- Authenticated language always follows `user.preferred_language`.
- Backend language model supports all active frontend languages (`en/fr/de/ar`).
- Backend error strategy is either:
  - code-based (recommended), or
  - fully locale-aware with `Accept-Language`.
- Locale set is clean: remove unused/incomplete `nl.json`, or fully wire and complete it.

