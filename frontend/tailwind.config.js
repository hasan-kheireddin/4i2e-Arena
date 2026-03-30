/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand — supports opacity modifiers (bg-brand/10, text-brand/50, etc.)
        // Requires --color-primary-rgb defined as space-separated R G B in CSS.
        brand:         'rgb(var(--color-primary-rgb) / <alpha-value>)',
        'brand-light': 'var(--color-brand-light, var(--color-primary))',
        accent:        'rgb(var(--color-accent-rgb)   / <alpha-value>)',

        // Semantic status — also support opacity modifiers
        error:   'rgb(var(--color-error-rgb)   / <alpha-value>)',
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',

        // Surface / background tokens (no opacity modifier needed)
        surface:         'var(--color-bg-card)',
        elevated:        'var(--color-bg-elevated, var(--color-bg-card))',
        base:            'var(--color-bg)',
        'surface-hover': 'var(--color-bg-hover)',

        // Semantic text tokens — also work as bg-/border-/placeholder- utilities
        primary:   'var(--color-text-primary)',
        secondary: 'var(--color-text-secondary)',
        muted:     'var(--color-text-muted)',
      },

      borderColor: {
        // `border` and `border-{side}` without a color suffix use this default
        DEFAULT: 'var(--color-border)',
        focus:   'var(--color-border-focus)',
      },

      boxShadow: {
        'glow-purple': '0 0 0 2px rgb(var(--color-primary-rgb) / 0.2), 0 0 16px rgb(var(--color-primary-rgb) / 0.12)',
        'glow-pink':   '0 0 0 2px rgb(var(--color-accent-rgb)  / 0.2), 0 0 16px rgb(var(--color-accent-rgb)  / 0.12)',
      },

      backgroundImage: {
        // Full brand gradient — use with bg-clip-text text-transparent for gradient text
        'brand-gradient':        'var(--gradient-gaming)',
        // Subtle tinted version — used for primary button backgrounds, card accents
        'brand-gradient-subtle': 'var(--gradient-gaming-subtle)',
      },
    },
  },
  // RTL variant is built-in to Tailwind v3.
  plugins: [],
}
