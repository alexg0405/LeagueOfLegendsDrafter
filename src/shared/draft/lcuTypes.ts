import type { DraftSnapshot } from './types'
import type { LcuDiagnosticResult } from '../desktopInterop'

export type LcuChampSelectResult = {
  lockfileFound: boolean
  lcuReachable: boolean
  snapshot: DraftSnapshot | null
  /**
   * true while a champ select session exists, false when the client says there is none (404).
   * Left out when unknown (client unreachable, odd response), so a blip never reads as "ended".
   */
  champSelect?: boolean
  error: string | null
  diagnostics?: LcuDiagnosticResult | null
}
