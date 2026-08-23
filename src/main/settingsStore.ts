import Store from 'electron-store'

export type OverlayBounds = { x: number; y: number; width: number; height: number }

/** Electron accelerator strings, tried in order. Any that register become live toggles. */
export const DEFAULT_OVERLAY_HOTKEYS = ['Insert', 'F9', 'F10'] as const

type SettingsSchema = {
  captureSourceId: string | null
  /** Last user-positioned overlay rect. Restored on launch, clamped to a live display. */
  overlayBounds: OverlayBounds | null
  /** User-chosen overlay toggle keys; null means "use the defaults". */
  overlayHotkeys: string[] | null
}

const store = new Store<SettingsSchema>({
  name: 'league-drafter-settings',
  defaults: {
    captureSourceId: null,
    overlayBounds: null,
    overlayHotkeys: null
  }
})

export function getCaptureSourceId(): string | null {
  const id = store.get('captureSourceId', null)
  return typeof id === 'string' && id.trim() ? id : null
}

export function setCaptureSourceId(id: unknown) {
  store.set('captureSourceId', typeof id === 'string' && id.trim() ? id : null)
}

function isFiniteInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function parseBounds(raw: unknown): OverlayBounds | null {
  if (raw == null || typeof raw !== 'object') {
    return null
  }
  const b = raw as Partial<OverlayBounds>
  if (!isFiniteInt(b.x) || !isFiniteInt(b.y) || !isFiniteInt(b.width) || !isFiniteInt(b.height)) {
    return null
  }
  if (b.width < 200 || b.height < 150) {
    return null
  }
  return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) }
}

export function getOverlayBounds(): OverlayBounds | null {
  return parseBounds(store.get('overlayBounds', null))
}

export function setOverlayBounds(bounds: unknown) {
  store.set('overlayBounds', parseBounds(bounds))
}

export function clearOverlayBounds() {
  store.set('overlayBounds', null)
}

/**
 * Accepts only shapes Electron's `globalShortcut` understands, so a bad stored value
 * can never stop the app from registering *some* toggle.
 */
const ACCELERATOR_RE =
  /^((CommandOrControl|CmdOrCtrl|Command|Cmd|Control|Ctrl|Alt|Option|AltGr|Shift|Super|Meta)\+)*([A-Z0-9]|F[1-9]|F1[0-9]|F2[0-4]|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right|Space|Tab|Backspace|Escape|Plus|Minus|Numpad[0-9]|Num(Add|Sub|Mult|Div|Dec))$/i

export function isValidAccelerator(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && ACCELERATOR_RE.test(value.trim())
}

export function getOverlayHotkeys(): string[] {
  const raw = store.get('overlayHotkeys', null)
  if (!Array.isArray(raw)) {
    return [...DEFAULT_OVERLAY_HOTKEYS]
  }
  const valid = raw.filter(isValidAccelerator).map((v) => v.trim())
  return valid.length ? Array.from(new Set(valid)) : [...DEFAULT_OVERLAY_HOTKEYS]
}

/** Pass an empty array (or nothing valid) to fall back to the defaults. */
export function setOverlayHotkeys(next: unknown): string[] {
  const list = Array.isArray(next) ? next.filter(isValidAccelerator).map((v) => v.trim()) : []
  const unique = Array.from(new Set(list))
  store.set('overlayHotkeys', unique.length ? unique : null)
  return unique.length ? unique : [...DEFAULT_OVERLAY_HOTKEYS]
}
