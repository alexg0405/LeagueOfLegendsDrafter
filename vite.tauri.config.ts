import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'src/renderer',
  base: './',
  define: {
    'import.meta.env.VITE_NEXUS_WEB': JSON.stringify('0'),
    'import.meta.env.VITE_NEXUS_TAURI': JSON.stringify('1')
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: false
  },
  clearScreen: false,
  resolve: {
    alias: {
      '@shared': resolve('src/shared')
    }
  },
  plugins: [react()],
  worker: {
    format: 'es'
  },
  build: {
    outDir: '../../dist/tauri',
    emptyOutDir: true
  }
})
