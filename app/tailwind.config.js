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
      // Bump the whole type scale ~1px: most body text is text-sm and most
      // secondary text is text-xs, which read too small on mobile. Overriding
      // the scale enlarges every existing class without touching components or
      // spacing (only font-size + line-height change). Larger steps keep the
      // Tailwind defaults.
      fontSize: {
        xs: ['0.8125rem', '1.125rem'], // 13 / 18
        sm: ['0.9375rem', '1.375rem'], // 15 / 22
        base: ['1.0625rem', '1.625rem'], // 17 / 26
        lg: ['1.1875rem', '1.75rem'], // 19 / 28
        xl: ['1.3125rem', '1.8rem'], // 21
        '2xl': ['1.5625rem', '2.1rem'], // 25
      },
    },
  },
  plugins: [],
}
