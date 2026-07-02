/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        secondary: '#64748b',
        background: '#f8fafc',
        surface: '#ffffff',
        'on-surface-variant': '#475569',
      },
      spacing: {
        'sidebar-width': '16rem',
        'container-padding': '1.5rem',
      },
      fontSize: {
        'body-sm': ['0.875rem', { lineHeight: '1.25rem' }],
      },
      fontFamily: {
        'body-sm': ['Be Vietnam Pro', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
