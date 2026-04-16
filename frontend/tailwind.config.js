/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
        secondary: 'rgb(var(--color-secondary-rgb) / <alpha-value>)',
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        danger: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
        info: 'rgb(var(--color-info-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
        background: 'rgb(var(--color-background-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        text: 'rgb(var(--color-text-rgb) / <alpha-value>)',
        brand: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
        'brand-light': 'rgb(var(--color-primary-light-rgb) / <alpha-value>)',
        accent: 'rgb(var(--color-secondary-rgb) / <alpha-value>)',
        error: 'rgb(var(--color-danger-rgb) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated-rgb) / <alpha-value>)',
        base: 'rgb(var(--color-background-rgb) / <alpha-value>)',
        input: 'rgb(var(--color-input-rgb) / <alpha-value>)',
        'surface-hover': 'rgb(var(--color-hover-rgb) / <alpha-value>)',
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        muted: 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
      },
      textColor: {
        primary: 'rgb(var(--color-text-rgb) / <alpha-value>)',
        secondary: 'rgb(var(--color-text-secondary-rgb) / <alpha-value>)',
        muted: 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
      },
      backgroundColor: {
        background: 'rgb(var(--color-background-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        elevated: 'rgb(var(--color-elevated-rgb) / <alpha-value>)',
        base: 'rgb(var(--color-background-rgb) / <alpha-value>)',
        input: 'rgb(var(--color-input-rgb) / <alpha-value>)',
        'surface-hover': 'rgb(var(--color-hover-rgb) / <alpha-value>)',
      },
      borderColor: {
        DEFAULT: 'rgb(var(--color-border-rgb) / 1)',
        border: 'rgb(var(--color-border-rgb) / 1)',
        focus: 'rgb(var(--color-focus-rgb) / 1)',
        danger: 'rgb(var(--color-danger-rgb) / 1)',
      },
      placeholderColor: {
        muted: 'rgb(var(--color-text-muted-rgb) / 1)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
        display: ['Inter', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        sm: ['0.875rem', { lineHeight: '1.5' }],
        base: ['1rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.5' }],
        xl: ['1.25rem', { lineHeight: '1.4' }],
        '2xl': ['1.5rem', { lineHeight: '1.3' }],
      },
      spacing: {
        surface: '1.25rem',
        section: '1.5rem',
        gutter: '2rem',
      },
      boxShadow: {
        card: '0 20px 45px -24px rgb(15 23 42 / 0.28)',
        modal: '0 32px 96px -28px rgb(15 23 42 / 0.48)',
        'glow-primary': '0 0 0 1px rgb(var(--color-primary-rgb) / 0.12), 0 20px 50px -24px rgb(var(--color-primary-rgb) / 0.35)',
        'glow-secondary': '0 0 0 1px rgb(var(--color-secondary-rgb) / 0.12), 0 20px 50px -24px rgb(var(--color-secondary-rgb) / 0.35)',
      },
      backgroundImage: {
        'brand-gradient': 'var(--gradient-brand)',
        'brand-gradient-subtle': 'var(--gradient-brand-subtle)',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        slideInLeft: {
          from: { opacity: '0', transform: 'translateX(-30px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(30px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.24s ease-out',
        'fade-in': 'fadeIn 0.24s ease-out',
        scaleIn: 'scaleIn 0.18s ease-out',
        'scale-in': 'scaleIn 0.18s ease-out',
        slideInLeft: 'slideInLeft 0.6s ease-out',
        slideInRight: 'slideInRight 0.6s ease-out',
        slideUp: 'slideUp 0.5s ease-out',
      },
    },
  },
  plugins: [],
};
