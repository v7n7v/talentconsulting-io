import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      spacing: {
        // The 11 step is the touch-target step - min-h-11 is how this codebase
        // spells "44px tall enough to tap", and scripts/ui-verify.js fails any
        // target under 44px below 768px.
        //
        // It could not keep that promise as a rem value. globals.css drops the
        // root to 14px under `@media (max-width: 640px)`, so the stock 2.75rem
        // resolved to 38.5px on exactly the phones the rule exists to protect,
        // while staying a correct 44px from 641px up on the 16px root. Pinning
        // the step to px is a no-op at desktop widths and lifts mobile to match
        // what desktop has been rendering all along.
        11: '44px',
      },
      colors: {
        'studio-deep': '#0b0b0b',
        'studio-surface': '#131314',
        'studio-elevated': '#1a1a1b',
        'studio-input': '#1e1e1f',
        'studio-border': '#444746',
        'studio-border-subtle': '#2d2d2f',
        'studio-text': '#e3e3e3',
        'studio-muted': '#8e918f',
        'studio-dim': '#5f6368',
        'studio-accent': '#a8c7fa',
        'studio-accent-active': '#c2e7ff',
        'studio-danger': '#f28b82',
        'studio-success': '#81c995',
        'studio-warning': '#fdd663',
      },
      fontFamily: {
        sans: ['Inter', 'var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Monaco', 'Inconsolata', 'monospace'],
      },
      letterSpacing: {
        'tight-studio': '-0.01em',
        'tighter-studio': '-0.02em',
      },
      borderRadius: {
        'studio': '12px',
        'studio-sm': '8px',
        'pill': '100px',
      },
    },
  },
  plugins: [],
}

export default config
