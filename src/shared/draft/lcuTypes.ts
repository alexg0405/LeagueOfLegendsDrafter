import type { DraftSnapshot } from './types'
import type { LcuDiagnosticResult } from '../desktopInterop'

export type LcuChampSelectResult = {
  lockfileFound: boolean
  lcuReachable: boolean
  snapshot: DraftSnapshot | null
  error: string | null
  diagnostics?: LcuDiagnosticResult | null
}
