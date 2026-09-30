/**
 * TAILWIND THEME: custom colors and font. Loaded right after the Tailwind CDN script.
 */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        navy: { 700: '#1e293b', 800: '#0f172a', 900: '#020617' },
        teal: { 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' }
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  }
};
