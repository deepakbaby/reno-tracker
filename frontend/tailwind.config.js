/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // Apple system font (San Francisco) on Apple devices, graceful fallback elsewhere.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Near-black neutral scale (HomeNest look)
        ink: {
          900: '#0e0e0e', // page background
          850: '#151515',
          800: '#1a1a1a', // cards
          700: '#242424', // raised / inactive chip
          600: '#2e2e2e', // hover
        },
        line: 'rgba(255,255,255,0.07)',
        // Emerald accent — active text, links, "paid"/status
        brand: {
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        // Deep desaturated forest — hero card + the round "+" button
        forest: {
          700: '#1c4d3a',
          600: '#235a44',
          500: '#2a6650',
        },
        danger: '#f87171',
      },
      animation: {
        'fade-up': 'fadeUp 0.35s ease-out forwards',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
