/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          hover: 'var(--color-primary-hover)',
          soft: 'var(--color-primary-soft)',
          muted: 'var(--color-primary-muted)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          soft: 'var(--color-accent-soft)',
          muted: 'var(--color-accent-muted)',
        },
        parchment: {
          DEFAULT: 'var(--color-bg)',
          warm: 'var(--color-bg-warm)',
          app: 'var(--color-bg-app)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar)',
          border: 'var(--color-sidebar-border)',
        },
        layali: {
          text: 'var(--color-text)',
          muted: 'var(--color-text-muted)',
          surface: 'var(--color-surface)',
          'surface-muted': 'var(--color-surface-muted)',
          border: 'var(--color-border)',
          success: 'var(--color-success)',
          danger: 'var(--color-danger)',
        },
      },
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'sans-serif'],
        cairo: ['Cairo', 'sans-serif'],
      },
      borderRadius: {
        layali: 'var(--radius-lg)',
        'layali-xl': 'var(--radius-xl)',
        card: 'var(--radius-card)',
      },
      boxShadow: {
        layali: 'var(--shadow-card)',
        'layali-lg': 'var(--shadow-lg)',
        'layali-hover': 'var(--shadow-card-hover)',
      },
    },
  },
  plugins: [],
};
