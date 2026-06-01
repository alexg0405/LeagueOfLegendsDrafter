import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const publicDir = resolve('src/renderer/public')
const tauriOutDir = resolve('dist/tauri')

function copyTauriPublicAssets(): Plugin {
  const copyDir = (from: string, to: string) => {
    mkdirSync(to, { recursive: true })
    for (const entry of readdirSync(from)) {
      if (entry === 'downloads') {
        continue
      }

      const source = resolve(from, entry)
      const target = resolve(to, entry)
      const stats = statSync(source)
      if (stats.isDirectory()) {
        copyDir(source, target)
      } else if (stats.isFile()) {
        copyFileSync(source, target)
      }
    }
  }

  return {
    name: 'nexus-tauri-public-assets',
    closeBundle() {
      if (!existsSync(publicDir)) {
        return
      }
      rmSync(resolve(tauriOutDir, 'downloads'), { recursive: true, force: true })
      copyDir(publicDir, tauriOutDir)
    }
  }
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  publicDir: false,
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
  plugins: [react(), copyTauriPublicAssets()],
  worker: {
    format: 'es'
  },
  build: {
    outDir: tauriOutDir,
    emptyOutDir: true
  }
})
