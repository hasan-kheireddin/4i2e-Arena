/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  // RTL variant is built-in to Tailwind v3.
  // Enabling it explicitly ensures rtl: and ltr: utilities are included.
  plugins: [],
}