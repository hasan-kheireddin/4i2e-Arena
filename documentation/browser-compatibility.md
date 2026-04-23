# Browser Compatibility (Chrome, Firefox, Brave)

This document defines the browser support scope, implementation details, validation checklist, and known limitations for the frontend.

## 1) Supported browser matrix

| Browser | Support level | Target baseline |
|---|---|---|
| Chrome | Full support | Latest 2 stable versions |
| Firefox | Full support | Latest 2 stable versions + Firefox ESR |
| Brave | Full support | Latest stable version (Chromium-based) |

### Notes

- Brave uses Chromium; the same rendering/runtime behavior targeted for Chrome applies to Brave in this project.
- Build tooling target is aligned through the frontend browserslist (`frontend/package.json`), with explicit Chrome/Firefox coverage.

## 2) Compatibility-oriented implementation

### 2.1 Build and CSS pipeline

- PostCSS uses **autoprefixer** to normalize vendor-prefixed CSS where needed.
  - File: `frontend/postcss.config.js`
- Browser targets are declared in frontend package metadata.
  - File: `frontend/package.json` (`browserslist`)

### 2.2 Cross-browser CSS behaviors already present

The global stylesheet includes explicit compatibility rules:

- WebKit scrollbar styling (`::-webkit-scrollbar`) for Chromium-family browsers.
- Firefox scrollbar styling (`scrollbar-width`, `scrollbar-color`).
- Range input vendor coverage:
  - `::-webkit-slider-thumb` / `::-webkit-slider-runnable-track`
  - `::-moz-range-thumb` / `::-moz-range-track`
- Firefox focus-inner normalization (`button::-moz-focus-inner`).
- Backdrop-filter fallback block:
  - `@supports not (backdrop-filter: blur(1px)) { .backdrop-fallback { ... } }`

File: `frontend/src/index.css` (cross-browser sections).

### 2.3 Fixes added in this pass

To reduce browser edge-case failures and improve consistency:

1. **Clipboard fallback for 2FA setup copy action**
   - Primary path: `navigator.clipboard.writeText(...)` in secure context.
   - Fallback path: hidden textarea + `document.execCommand("copy")`.
   - User-facing error is surfaced when both methods fail.
   - File: `frontend/src/pages/Setup2fapage.tsx`

2. **File export fallback for legacy/limited download behavior**
   - Supports legacy `msSaveOrOpenBlob` path if present.
   - Falls back to `window.location.assign(objectUrl)` when anchor download attribute is not supported.
   - File: `frontend/src/services/analytics.ts`

3. **IntersectionObserver fallback for reveal animations**
   - If `IntersectionObserver` is unavailable, content is shown immediately.
   - File: `frontend/src/pages/LandingPage.tsx`

4. **Applied backdrop fallback class to active blurred overlays/headers**
   - File: `frontend/src/pages/LandingPage.tsx`
   - File: `frontend/src/components/Navbar.tsx`
   - File: `frontend/src/components/ui/Modal.tsx`

## 3) Validation checklist (manual smoke plan)

Run this checklist in:
- Chrome (stable)
- Firefox (stable)
- Brave (stable)

### Auth and account

1. Register user
2. Login/logout
3. Password reset flow
4. 2FA setup:
   - QR visible
   - Secret copy button works
   - fallback message appears if copy is blocked

### Core app shell

1. Navbar rendering and dropdown behavior
2. Sidebar interactions (desktop/mobile)
3. Modal open/close and background overlay appearance
4. Theme toggle persistence (reload)
5. Language switcher (including RTL language)

### Gameplay and realtime

1. Pong local mode
2. Pong online matchmaking + gameplay connect/disconnect/reconnect
3. Tic-Tac-Toe local mode
4. Tic-Tac-Toe online matchmaking + gameplay connect/disconnect/reconnect

### Data surfaces

1. Leaderboard loads and filters work
2. Match history filters/search/pagination
3. Analytics dashboard cards/charts
4. Activity export (JSON/CSV) download and import

### UI/visual consistency

1. Range sliders are styled correctly
2. Scrollbars remain usable and visually acceptable
3. Backdrop-blur surfaces degrade gracefully when blur support is absent
4. No layout breakage at common viewport sizes

## 4) Known browser-specific limitations

1. **Clipboard API restrictions**
   - `navigator.clipboard` requires secure context and browser permission model support.
   - Fallback copy path is implemented, but some hardened browser settings can still block programmatic copy.

2. **Backdrop blur differences**
   - Visual blur intensity can differ between engines.
   - A fallback background is provided via `.backdrop-fallback` for non-supporting environments.

3. **Native control rendering variance**
   - Minor differences in native form controls and font rendering can still occur across engines; functional behavior is preserved.

## 5) Related code locations

- `frontend/package.json` — browserslist targets
- `frontend/postcss.config.js` — autoprefixer activation
- `frontend/src/index.css` — cross-browser CSS rules and fallbacks
- `frontend/src/pages/Setup2fapage.tsx` — clipboard copy fallback
- `frontend/src/services/analytics.ts` — export download fallback
- `frontend/src/pages/LandingPage.tsx` — intersection observer fallback + backdrop-fallback class usage
- `frontend/src/components/Navbar.tsx` — backdrop-fallback class usage
- `frontend/src/components/ui/Modal.tsx` — backdrop-fallback class usage
