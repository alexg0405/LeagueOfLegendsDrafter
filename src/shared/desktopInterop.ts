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
