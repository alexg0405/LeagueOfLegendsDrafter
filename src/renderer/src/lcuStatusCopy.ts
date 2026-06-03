import type { LcuDiagnosticResult } from '@shared/desktopInterop'
import type { LcuChampSelectResult } from '@shared/draft/lcuTypes'
import type { DraftUpdate } from '@shared/draft/types'

export function lcuUiStatus(lcu: LcuChampSelectResult | null): NonNullable<DraftUpdate['lcuStatus']> {
  if (lcu == null) {
    return 'unknown'
  }
  if (lcu.lcuReachable) {
    return 'ready'
  }
  return 'waiting'
}

function isBenignLcuWaitingError(error: string | null): boolean {
  if (!error) {
    return true
  }
  return /lockfile not found|riot client is running|econnrefused|econnreset|socket|timeout|connect/i.test(error)
}

export function copyLcuStatusLine(
  lcu: LcuChampSelectResult | null,
  diagnostics?: LcuDiagnosticResult | null
): string {
  if (lcu == null) {
    return 'Waiting for League client status...'
  }
  if (lcu.lcuReachable) {
    return lcu.snapshot ? 'League client ready; draft data is live.' : 'League client ready; waiting for champ select.'
  }
  if (lcu.lockfileFound && isBenignLcuWaitingError(lcu.error)) {
    return 'League lockfile found; waiting for the client API to respond.'
  }
  const hasRiotClient = diagnostics?.detectedProcesses.some((process) =>
    process.name.toLowerCase().includes('riot')
  )
  const hasLeagueProcess = diagnostics?.detectedProcesses.some((process) =>
    process.name.toLowerCase().includes('league')
  )
  if (!lcu.lockfileFound && hasLeagueProcess) {
    return 'League process detected; waiting for the lockfile.'
  }
  if (!lcu.lockfileFound && hasRiotClient) {
    return 'Riot Client detected; launch League or enter champ select to create the lockfile.'
  }
  if (!lcu.lockfileFound && isBenignLcuWaitingError(lcu.error)) {
    return 'Waiting for League client to start.'
  }
  return 'League client detected; waiting for a clean LCU response.'
}

export function displayLcuError(lcu: LcuChampSelectResult | null): string | null {
  if (!lcu?.error) {
    return null
  }
  if (!lcu.lcuReachable && isBenignLcuWaitingError(lcu.error)) {
    return null
  }
  return lcu.error
}
