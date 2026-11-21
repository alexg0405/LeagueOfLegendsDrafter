import Store from 'electron-store'
import { isPeekKey, type PeekKey, type PeekMode } from '../shared/desktopInterop'
import { normalizeOverlayLayout, type OverlayLayout } from '../shared/overlayLayout'

export type OverlayBounds = { x: number; y: number; width: number; height: number }

/** Electron accelerator strings, tried in order. Any that register become live toggles. */
export const DEFAULT_OVERLAY_HOTKEYS = ['Insert', 'F9', 'F10'] as const

type SettingsSchema = {
  captureSourceId: string | null
  /** Last user-positioned overlay rect. Restored on launch, clamped to a live display. */
  overlayBounds: OverlayBounds | null
  /** Where the overlay sits during a game; null = same place as in champ select. */
  overlayGameBounds: OverlayBounds | null
  /** In-game sections: main overlay vs floating boxes (normalized on read). */
  overlayLayout: unknown
  /** Remembered spot of each floating box, by box id. */
  boxBounds: Record<string, OverlayBounds>
  /** User-chosen overlay toggle keys; null means "use the defaults". */
  overlayHotkeys: string[] | null
  /** In-game peek: show the overlay's Build tab on `peekKey`. */
  peekEnabled: boolean
  peekKey: PeekKey
  peekMode: PeekMode
}

const store = new Store<SettingsSchema>({
  name: 'league-drafter-settings',
  defaults: {
    captureSourceId: null,
    overlayBounds: null,
    overlayGameBounds: null,
    overlayLayout: null,
    boxBounds: {},
    overlayHotkeys: null,
    peekEnabled: true,
    peekKey: 'capslock',
    peekMode: 'hold'
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

function parseBounds(raw: unknown, minHeight = 150): OverlayBounds | null {
  if (raw == null || typeof raw !== 'object') {
    return null
  }
  const b = raw as Partial<OverlayBounds>
  if (!isFiniteInt(b.x) || !isFiniteInt(b.y) || !isFiniteInt(b.width) || !isFiniteInt(b.height)) {
    return null
  }
  if (b.width < 200 || b.height < minHeight) {
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

export function getOverlayLayout(): OverlayLayout {
  return normalizeOverlayLayout(store.get('overlayLayout', null))
}

export function setOverlayLayout(raw: unknown): OverlayLayout {
  const layout = normalizeOverlayLayout(raw)
  store.set('overlayLayout', layout)
  // Forget spots of boxes that no longer exist so a new "Box 1" starts fresh.
  const bounds = store.get('boxBounds', {}) as Record<string, unknown>
  const kept = Object.fromEntries(Object.entries(bounds).filter(([id]) => layout.boxes.some((b) => b.id === id)))
  store.set('boxBounds', kept as Record<string, OverlayBounds>)
  return layout
}

export function getBoxBounds(id: string): OverlayBounds | null {
  const all = store.get('boxBounds', {}) as Record<string, unknown>
  return parseBounds(all[id], 30)
}

export function setBoxBounds(id: string, bounds: unknown) {
  const parsed = parseBounds(bounds, 30)
  if (!parsed) {
    return
  }
  const all = { ...(store.get('boxBounds', {}) as Record<string, OverlayBounds>), [id]: parsed }
  store.set('boxBounds', all)
}

export function getOverlayGameBounds(): OverlayBounds | null {
  return parseBounds(store.get('overlayGameBounds', null))
}

export function setOverlayGameBounds(bounds: unknown) {
  store.set('overlayGameBounds', parseBounds(bounds))
}

export function clearOverlayGameBounds() {
  store.set('overlayGameBounds', null)
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

export function getPeekEnabled(): boolean {
  return store.get('peekEnabled', true) !== false
}

export function getPeekKey(): PeekKey {
  const key = store.get('peekKey', 'capslock')
  return isPeekKey(key) ? key : 'capslock'
}

export function getPeekMode(): PeekMode {
  return store.get('peekMode', 'hold') === 'toggle' ? 'toggle' : 'hold'
}

/** Applies only the valid fields of a patch from the renderer. */
export function setPeekSettings(patch: unknown): void {
  if (patch == null || typeof patch !== 'object') {
    return
  }
  const p = patch as Record<string, unknown>
  if (typeof p.enabled === 'boolean') {
    store.set('peekEnabled', p.enabled)
  }
  if (isPeekKey(p.key)) {
    store.set('peekKey', p.key)
  }
  if (p.mode === 'hold' || p.mode === 'toggle') {
    store.set('peekMode', p.mode)
  }
}
