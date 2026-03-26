# Browser Compatibility

## Supported Browsers

| Browser | Engine    | Min Version | Notes                          |
|---------|-----------|-------------|--------------------------------|
| Chrome  | Chromium  | 93+         | Primary development browser    |
| Brave   | Chromium  | 1.30+       | Identical to Chrome (Chromium) |
| Firefox | Gecko     | 103+        | Full support, see notes below  |

---

## Feature Matrix

| Feature                        | Chrome/Brave | Firefox  | Notes                                       |
|-------------------------------|:------------:|:--------:|---------------------------------------------|
| `backdrop-filter: blur()`     | ✅           | ✅ 103+  | Added `-webkit-` prefix as fallback         |
| CSS Custom Properties          | ✅           | ✅       | Used throughout for theming                 |
| CSS Grid + `gap`              | ✅           | ✅       | Tailwind grid classes, no issues            |
| Flexbox `gap`                 | ✅           | ✅ 63+   | Fully supported                             |
| `filter: grayscale()`         | ✅           | ✅       | Used in PlayPage mode icons                 |
| `background-clip: text`       | ✅           | ✅ 49+   | Gradient text in Navbar/Home/Landing        |
| WebSocket                     | ✅           | ✅       | Used in game multiplayer                    |
| Canvas 2D API                 | ✅           | ✅       | Used in PongPage local game loop            |
| Custom scrollbar (webkit)     | ✅           | ❌       | Firefox uses `scrollbar-width/color` instead |
| Custom scrollbar (moz)        | ❌           | ✅       | Separate Firefox scrollbar rules added      |
| Range input thumb (webkit)    | ✅           | ❌       | `::-webkit-slider-thumb` for Chrome/Brave   |
| Range input thumb (moz)       | ❌           | ✅       | `::-moz-range-thumb` for Firefox            |
| `accent-color`                | ✅ 93+       | ✅ 92+   | Used as CSS fallback in range inputs        |

---

## Browser-Specific Limitations

### Firefox
- **Scrollbar styling**: Firefox does not support `::-webkit-scrollbar`. It uses the
  `scrollbar-width` and `scrollbar-color` CSS properties instead. Both are implemented
  in `index.css`. The scrollbar will be thinner and use theme colors but cannot be styled
  as precisely as in Chrome/Brave.
- **Range input**: Firefox requires `::-moz-range-thumb` and `::-moz-range-track` pseudo-
  elements. These are defined globally in `index.css` alongside the webkit variants.
- **`backdrop-filter` (older Firefox < 103)**: Not supported. A `@supports` fallback in
  `index.css` increases the overlay's background opacity so content remains readable.
  This only affects Firefox ESR releases prior to 2022.
- **Font rendering**: Firefox uses a different text anti-aliasing algorithm (Skia vs
  DirectWrite). Gradient text may appear slightly less sharp on Windows Firefox. No fix
  possible — this is a platform-level difference.
- **Focus ring on buttons**: Firefox adds a dotted `::-moz-focus-inner` outline on buttons.
  This is normalized in `index.css` with `button::-moz-focus-inner { border: 0; }`.

### Brave
- Brave is Chromium-based and behaves **identically to Chrome** for all web APIs.
- Brave's built-in ad/tracker blocking does not interfere with any app functionality
  because there are no third-party trackers or ad scripts.
- Brave Shields may block WebSocket connections if the backend domain is flagged. Users
  should whitelist the game server origin in Brave Shields if multiplayer fails.

### Chrome
- All features work as designed. Chrome is the primary development and test browser.

---

## Implementation Notes

### What was fixed

1. **`package.json`** — Added `browserslist` targeting the last 2 versions of Chrome and
   Firefox plus Firefox ESR, giving autoprefixer accurate targets.

2. **`src/index.css`** — Added:
   - Dual scrollbar rules: `::-webkit-scrollbar` (Chrome/Brave) + `scrollbar-width/color` (Firefox)
   - Cross-browser range input: `::-webkit-slider-thumb/track` + `::-moz-range-thumb/track`
   - `button::-moz-focus-inner` normalization
   - `@supports not (backdrop-filter)` fallback class

3. **`src/components/Navbar.tsx`** — Added `WebkitBackdropFilter` alongside `backdropFilter`.

4. **`src/pages/PongPage.tsx`** — Added `WebkitBackdropFilter` to all 6 overlay panels.

5. **`src/pages/TournamentPage.tsx`** — Added `WebkitBackdropFilter` to both modal overlays.

6. **`src/pages/SettingsPage.tsx`** — Removed inline `backgroundColor`/`accentColor` from
   range inputs; they are now fully styled by the global CSS rules.

---

## Testing Checklist

Run these manual tests in each supported browser:

- [ ] **Login / Register / 2FA flows** — form inputs, password visibility, error states
- [ ] **Navbar** — backdrop blur on scroll, dropdown menu, search bar focus ring
- [ ] **Settings → Audio tab** — range input thumb drag and visual appearance
- [ ] **Settings → Appearance tab** — dark mode toggle, language switcher
- [ ] **PongPage** — canvas renders, overlay blur on pause/game-over, keyboard controls
- [ ] **TournamentPage** — bracket modal backdrop blur
- [ ] **Scrollbar** — check custom scrollbar appearance in sidebar and modals
- [ ] **Gradient text** — Navbar logo, Home welcome banner, Landing page hero
- [ ] **PlayPage** — mode card grayscale/colour filter transition
- [ ] **WebSocket (multiplayer)** — matchmaking connects and game state syncs
