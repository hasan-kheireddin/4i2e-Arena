# Design System

## Overview

The frontend now uses a centralized token-driven design system instead of a collection of isolated component files.

The system has:

- Central design tokens in `frontend/tailwind.config.js`
- CSS variable source of truth in `frontend/src/index.css`
- Reusable UI primitives in `frontend/src/components/ui`
- Shared icon primitives in `frontend/src/components/icons`
- Real adoption in high-traffic screens such as auth flows and settings
- A working production build via `npm run build`

## Token Model

### Colors

Core tokens are defined as CSS variables and exposed through Tailwind:

- `primary`: brand orange
- `secondary`: red accent
- `success`
- `danger`
- `info`
- `warning`
- `background`
- `surface`
- `elevated`
- `input`
- `text`
- `text-secondary`
- `muted`
- `border`

Legacy compatibility aliases are still available where the app already depended on them:

- `brand`
- `brand-light`
- `accent`
- `error`
- `base`
- `surface-hover`

### Typography

Typography is centralized in Tailwind:

- `font-sans`: `Inter`, fallback sans stack
- `font-display`: `Inter`, fallback sans stack
- Font sizes: `sm`, `base`, `lg`, `xl`, `2xl`

`Inter` and `Cairo` are loaded from `frontend/index.html`. `Cairo` remains the RTL font for Arabic content.

### Spacing

The system uses the Tailwind spacing scale and also exposes semantic spacing tokens:

- `surface`
- `section`
- `gutter`

### Shadows

Centralized shadow tokens:

- `shadow-card`
- `shadow-modal`
- `shadow-glow-primary`
- `shadow-glow-secondary`

### Motion

Centralized animation tokens:

- `animate-fadeIn`
- `animate-fade-in`
- `animate-scaleIn`
- `animate-scale-in`
- `animate-slideInLeft`
- `animate-slideInRight`
- `animate-slideUp`

## Reusable Components

The reusable component layer currently includes:

1. `Avatar`
2. `Badge`
3. `Button`
4. `Card`
5. `StatCard`
6. `Input`
7. `Modal`
8. `ProgressBar`
9. `Select`
10. `Spinner`
11. `Tooltip`
12. `EyeIcon`
13. `EyeOffIcon`

The minimum requirement of 10 reusable components is satisfied.

## What Was Fixed

The following broken or undefined classes/tokens were resolved:

- `bg-info`
- `text-info`
- `bg-accent-pink`
- `bg-accent-cyan`
- `bg-accent-orange`
- `card-highlight`
- `shadow-modal`
- `font-display`
- `border-gradient`
- `animate-scale-in`
- `animate-in`
- `fade-in-0`
- `zoom-in-95`

Resolution strategy:

- Valid semantic tokens like `info`, `danger`, `modal`, and `display` were defined centrally
- One-off broken classes were removed or replaced with proper token-backed classes
- Tooltip and modal animation usage was normalized to shared animation tokens

## Current Usage

The design system is now used directly in:

- `LoginPage`
- `RegisterPage`
- `ForgotPasswordPage`
- `ResetPasswordPage`
- `SettingsPage`

These screens now use shared `Button`, `Input`, `Select`, `Badge`, `Modal`, `ProgressBar`, `Spinner`, `Tooltip`, and `Card` primitives instead of hand-written inline control styling.

`Avatar` continues to be used across profile and game-related screens.

## Implementation Rules

Use these rules going forward:

1. Add new color, typography, spacing, or shadow values in `frontend/tailwind.config.js` and `frontend/src/index.css`, not inline in pages.
2. Prefer shared primitives from `frontend/src/components/ui` before creating page-specific controls.
3. Avoid hard-coded inline colors unless rendering external media or canvas content that cannot use Tailwind/CSS tokens.
4. Keep motion tokenized. New animations should be added to the theme instead of page-local class names.
5. If a page needs a new UI pattern more than once, promote it into the component layer instead of duplicating markup.

## Verification

Verified with:

```bash
cd frontend
npm run build
```

The production build completes successfully.
