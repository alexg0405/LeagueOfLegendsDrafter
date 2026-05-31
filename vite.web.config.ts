import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  define: {
    'import.meta.env.VITE_NEXUS_WEB': JSON.stringify('1')
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Nexus Draft',
        short_name: 'Nexus Draft',
        description: 'League of Legends draft assistant — web lab',
        theme_color: '#060f0c',
        background_color: '#060f0c',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/downloads\//, /^\/data\//, /^\/api\//, /\/[^/?]+\.[^/]+$/],
        globIgnores: ['**/api/**']
      }
    })
  ],
  worker: {
    format: 'es'
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true
  }
})
