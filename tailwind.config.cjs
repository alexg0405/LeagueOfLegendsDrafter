/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Bebas Neue"', 'Oswald', 'Impact', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Share Tech Mono"', 'ui-monospace', 'monospace'],
        vert: ['"Bebas Neue"', 'sans-serif']
      },
      colors: {
        nexus: {
          bg: 'var(--nexus-bg)',
          surface: 'var(--nexus-surface)',
          'surface-2': 'var(--nexus-surface-2)',
          panel: 'var(--nexus-panel-light)',
          text: 'var(--nexus-text)',
          muted: 'var(--nexus-muted)',
          lime: 'var(--nexus-lime)',
          blue: 'var(--nexus-blue)',
          red: 'var(--nexus-red)',
          yellow: 'var(--nexus-yellow)',
          line: 'var(--nexus-line)'
        }
      },
      boxShadow: {
        panel: 'inset 0 0 0 1px var(--nexus-line)'
      }
    }
  },
  plugins: []
}
