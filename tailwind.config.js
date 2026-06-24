/** @type {import('tailwindcss').Config} */
// preflight (base reset) is OFF so Tailwind utilities only affect components that
// opt in via classNames (the delivery pages) and never touch the existing
// inline-styled pages.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
}
