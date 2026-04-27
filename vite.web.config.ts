import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
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
  plugins: [react()],
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true
  }
})
