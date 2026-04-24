/// <reference types="vite/client" />

import type { DrafterPreload } from '../../preload'

declare global {
  interface Window {
    drafter: DrafterPreload
  }
}

export {}
