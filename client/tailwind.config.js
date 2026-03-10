/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        telegram: {
          blue: '#3390ec',
          light: '#e9f1fb',
          dark: '#17212b',
          gray: '#242f3d'
        }
      }
    },
  },
  plugins: [],
}
