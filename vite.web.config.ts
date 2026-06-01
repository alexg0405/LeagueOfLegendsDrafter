import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  define: {
    'import.meta.env.VITE_NEXUS_WEB': JSON.stringify('1'),
    'import.meta.env.VITE_NEXUS_TAURI': JSON.stringify('0')
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
      includeAssets: ['favicon.png', 'favicon.ico'],
      manifest: {
        name: 'Nexus Draft',
        short_name: 'Nexus Draft',
        description: 'League of Legends draft assistant',
        theme_color: '#060f0c',
        background_color: '#060f0c',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'favicon.ico', sizes: '256x256', type: 'image/x-icon', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
