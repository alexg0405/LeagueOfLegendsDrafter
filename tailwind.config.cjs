/**
 * Theme colors live in CSS variables (`--nexus-*` in index.css). Tailwind cannot add an alpha
 * channel to a bare `var(...)`, so without this every `/NN` modifier (`border-nexus-line/70`,
 * `bg-nexus-lime/10`, `text-nexus-lime/90`, ...) silently compiled to nothing and borders fell
 * back to the default light gray. `color-mix` keeps the variables as the single source of truth.
 */
function nexusColor(variable) {
  return ({ opacityValue }) =>
    opacityValue === undefined || opacityValue === '1'
      ? `var(${variable})`
      : `color-mix(in srgb, var(${variable}) calc(${opacityValue} * 100%), transparent)`
}

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
          bg: nexusColor('--nexus-bg'),
          surface: nexusColor('--nexus-surface'),
          'surface-2': nexusColor('--nexus-surface-2'),
          panel: nexusColor('--nexus-panel-light'),
          text: nexusColor('--nexus-text'),
          muted: nexusColor('--nexus-muted'),
          lime: nexusColor('--nexus-lime'),
          blue: nexusColor('--nexus-blue'),
          red: nexusColor('--nexus-red'),
          yellow: nexusColor('--nexus-yellow'),
          line: nexusColor('--nexus-line')
        }
      },
      boxShadow: {
        panel: 'inset 0 0 0 1px var(--nexus-line)'
      }
    }
  },
  plugins: []
}
