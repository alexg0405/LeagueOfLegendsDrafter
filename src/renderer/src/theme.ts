import { useEffect, useState } from 'react'

/**
 * Color themes. Each is one block of `--nexus-*` variables in index.css, selected by
 * `data-theme` on <html>. The choice lives in localStorage, which the main window, overlay and
 * box windows share, so changing it in Setup recolors every window at once.
 */

export const THEMES = [
  { id: 'midnight', label: 'Midnight', note: 'Calm slate, soft cyan', swatch: ['#0f131a', '#1a212c', '#72c6d4', '#e2b664'] },
  { id: 'graphite', label: 'Graphite', note: 'Neutral gray, sage', swatch: ['#121314', '#1f2023', '#a8cf8e', '#e0b468'] },
  { id: 'emerald', label: 'Emerald', note: 'The original look', swatch: ['#060f0c', '#0f2a1f', '#1dd4a8', '#e89a2c'] }
] as const

export type ThemeId = (typeof THEMES)[number]['id']

export const DEFAULT_THEME: ThemeId = 'midnight'
const STORAGE_KEY = 'nexus.theme'
const listeners = new Set<(id: ThemeId) => void>()
const rgbCache = new Map<string, string>()

function isTheme(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((t) => t.id === value)
}

export function readTheme(): ThemeId {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  rgbCache.clear()
  Array.from(listeners).forEach((listener) => listener(id))
}

export function setTheme(id: ThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* storage blocked: the theme applies for this session only */
  }
  applyTheme(id)
}

/** Call once before the first render; follows changes made in other windows. */
export function initTheme(): void {
  applyTheme(readTheme())
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      applyTheme(readTheme())
    }
  })
}

export function useTheme(): [ThemeId, (id: ThemeId) => void] {
  const [theme, setThemeState] = useState<ThemeId>(readTheme)
  useEffect(() => {
    listeners.add(setThemeState)
    return () => {
      listeners.delete(setThemeState)
    }
  }, [])
  return [theme, setTheme]
}

/**
 * "r, g, b" for a theme variable, for canvas code that cannot use CSS variables
 * (`rgba(${themeRgb('--nexus-lime', '29, 212, 168')}, 0.5)`). Cached until the theme changes.
 */
export function themeRgb(name: string, fallback: string): string {
  const cached = rgbCache.get(name)
  if (cached) {
    return cached
  }
  let out = fallback
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    const hex = /^#([0-9a-f]{6})$/i.exec(raw)
    if (hex) {
      const n = Number.parseInt(hex[1]!, 16)
      out = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
    } else {
      const rgb = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(raw)
      if (rgb) {
        out = `${rgb[1]}, ${rgb[2]}, ${rgb[3]}`
      }
    }
  } catch {
    /* no DOM (tests): fallback */
  }
  rgbCache.set(name, out)
  return out
}
