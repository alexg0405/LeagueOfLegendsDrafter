export type OverlayToggleResult = {
  ok: boolean
  visible: boolean
  created: boolean
  route: 'overlay'
  error?: string
}

export type OverlayRect = { x: number; y: number; width: number; height: number }

export type OverlayStatusResult = {
  ok: boolean
  exists: boolean
  visible: boolean
  focused?: boolean
  title?: string
  bounds?: OverlayRect
  /** Set when the overlay renderer failed to load and the fallback page is showing. */
  loadError?: string | null
  error?: string
}

export type OverlayResetResult = {
  ok: boolean
  bounds?: OverlayRect
  error?: string
}

/** Everything needed to explain an invisible overlay from inside the packaged app. */
export type OverlayDiagnosticsResult = {
  ok: boolean
  exists: boolean
  visible: boolean
  alwaysOnTop: boolean
  bounds: OverlayRect | null
  savedBounds: OverlayRect | null
  url: string | null
  loadError: string | null
  shortcutsRegistered: string[]
  shortcutsFailed: string[]
  displays: Array<{ id: number; bounds: OverlayRect; scale: number }>
  logPath: string
  recent: string[]
  error?: string
}

export type OverlayShortcutStatusResult = {
  ok: boolean
  registered: string[]
  failed: string[]
  /** What the user asked for (persisted), which may differ from what Windows granted. */
  configured?: string[]
  defaults?: string[]
  error?: string
}

/** Keys the in-game peek can use. Read with GetAsyncKeyState, never captured from the game. */
export const PEEK_KEYS = ['capslock', 'tab', 'backquote', 'mouse4', 'mouse5'] as const
export type PeekKey = (typeof PEEK_KEYS)[number]
/** hold: visible while the key is down. toggle: each press shows/hides. */
export type PeekMode = 'hold' | 'toggle'

export const PEEK_KEY_LABELS: Record<PeekKey, string> = {
  capslock: 'Caps Lock',
  tab: 'Tab',
  backquote: '` (tilde)',
  mouse4: 'Mouse 4',
  mouse5: 'Mouse 5'
}

export function isPeekKey(value: unknown): value is PeekKey {
  return typeof value === 'string' && (PEEK_KEYS as readonly string[]).includes(value)
}

/** In-game peek: the overlay's Build tab on a key, without stealing that key from League. */
export type PeekStatus = {
  enabled: boolean
  /** False when the key reader could not load (non-Windows, blocked native module). */
  available: boolean
  reason: string | null
  key: PeekKey
  mode: PeekMode
}

export type PeekSettingsPatch = Partial<Pick<PeekStatus, 'enabled' | 'key' | 'mode'>>

/** The overlay remembers one spot for champ select and another for in game. */
export type OverlayPhase = 'draft' | 'game'
export const OVERLAY_POSITION_PRESETS = ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'] as const
export type OverlayPositionPreset = (typeof OVERLAY_POSITION_PRESETS)[number]

export type OverlayPositionStatus = {
  phase: OverlayPhase
  /** False until an in-game spot is set (it then follows the champ select spot). */
  hasGamePosition: boolean
}

export type OverlayPositionRequest = { phase: OverlayPhase; preset: OverlayPositionPreset } | { phase: 'game'; reset: true }

export function isOverlayPositionPreset(value: unknown): value is OverlayPositionPreset {
  return typeof value === 'string' && (OVERLAY_POSITION_PRESETS as readonly string[]).includes(value)
}

export type PathProbe = {
  path: string
  exists: boolean
  source: string
}

export type ProcessProbe = {
  pid?: number
  name: string
  executablePath?: string | null
}

export type LcuDiagnosticResult = {
  checkedPaths: PathProbe[]
  detectedProcesses: ProcessProbe[]
  selectedPath?: string | null
  lockfileFound: boolean
  lcuReachable: boolean
  error?: string | null
}
