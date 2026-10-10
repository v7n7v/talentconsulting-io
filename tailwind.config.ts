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
        'studio-deep': 'var(--bg-deep)',
        'studio-surface': 'var(--bg-surface)',
        'studio-elevated': 'var(--bg-elevated)',
        'studio-input': 'var(--bg-input)',
        'studio-border': 'var(--border)',
        'studio-border-subtle': 'var(--border-subtle)',
        'studio-text': 'var(--text-primary)',
        'studio-muted': 'var(--text-secondary)',
        'studio-dim': 'var(--text-muted)',
        'studio-accent': 'var(--accent)',
        'studio-accent-active': 'var(--accent-active)',
        'studio-danger': 'var(--danger)',
        'studio-success': 'var(--success)',
        'studio-warning': 'var(--warning)',
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
