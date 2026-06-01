export type OverlayToggleResult = {
  ok: boolean
  visible: boolean
  created: boolean
  route: 'overlay'
  error?: string
}

export type OverlayStatusResult = {
  ok: boolean
  exists: boolean
  visible: boolean
  focused?: boolean
  title?: string
  bounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  error?: string
}

export type OverlayShortcutStatusResult = {
  ok: boolean
  registered: string[]
  failed: string[]
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
