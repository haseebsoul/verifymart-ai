/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    colors: {
      canvas: '#F9F9F6', surface: '#FFFFFF', subtle: '#F2F2ED',
      hairline: '#E4E4DF', strong: '#CECEC6',
      emerald: '#116D4E', emeraldHover: '#0D573E', emeraldTint: '#EBF5F0',
      emeraldBorder: '#B7DFD0', ink: '#181A18', secondary: '#525854',
      muted: '#7A7F7B', verified: '#116D4E', warning: '#B45309',
      critical: '#B91C1C', transparent: 'transparent', current: 'currentColor'
    },
    extend: {
      fontFamily: {
        display: ['Instrument Serif', 'Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['DM Mono', 'JetBrains Mono', 'ui-monospace', 'monospace']
      },
      borderRadius: { '4xl': '2rem' }
    }
  },
  plugins: []
};
