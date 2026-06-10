/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Default border color (plain `border` with no color): gray-200 is too
      // faint against white/violet-50 backgrounds — cards barely read as
      // cards. Explicit colors (border-violet-100, etc.) are unaffected.
      borderColor: {
        DEFAULT: colors.gray[300],
      },
    },
  },
  plugins: [],
}
