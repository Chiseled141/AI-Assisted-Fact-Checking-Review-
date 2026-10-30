/** @type {import('tailwindcss').Config} */

// Colors resolve to CSS variables (see src/index.css) so one set of class names
// works in both themes; `.dark` on <html> swaps the variable values.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const shades = (palette, keys) => Object.fromEntries(keys.map((k) => [k, v(`${palette}-${k}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist"', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Geist"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
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
        amber: shades('amber', [50, 200, 300, 700, 800, 900, 950]),
      },
      boxShadow: {
        selected: 'inset 3px 0 0 rgb(var(--brand-500))',
        dialog: '0 24px 48px -16px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
