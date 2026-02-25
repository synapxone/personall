/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        secondary: 'var(--proteina)',
        accent: 'var(--accent)',
        dark: 'var(--bg-main)',
        card: 'var(--bg-card)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        proteina: 'var(--proteina)',
        carbos: 'var(--carbos)',
        gordura: 'var(--gordura)',
        modalidade: 'var(--modalidade)',
      },
    },
  },
  plugins: [],
};

