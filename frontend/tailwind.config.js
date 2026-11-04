/** @type {import('tailwindcss').Config} */

// Colors resolve to CSS variables (see src/index.css).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const shades = (palette, keys) => Object.fromEntries(keys.map((k) => [k, v(`${palette}-${k}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Schibsted Grotesk"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        logo: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Ground-style weight ladder: book text, strong labels, extrabold headlines.
      fontWeight: {
        strong: '680',
      },
      colors: {
        white: v('surface'),
        page: v('page'),
        primary: { DEFAULT: v('primary'), hover: v('primary-hover') },
        'on-primary': v('on-primary'),
        pop: v('pop'),
        candy: v('candy'),
        flame: v('flame'),
        'on-brand': '#ffffff',
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), muted: v('ink-muted'), faint: v('ink-faint') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        brand: shades('brand', [50, 100, 200, 500, 600, 700, 900]),
        zinc: shades('zinc', [50, 100, 200, 300, 600, 700]),
        emerald: shades('emerald', [50, 200, 700, 800, 900]),
        rose: shades('rose', [50, 200, 400, 600, 700, 800, 900]),
        amber: shades('amber', [50, 200, 300, 400, 700, 800, 900, 950]),
      },
      boxShadow: {
        dialog: '0 24px 80px -24px rgba(0,0,0,0.45)',
      },
    },
  },
  plugins: [],
};
