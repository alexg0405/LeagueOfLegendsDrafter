import type { DraftSource, LcuChampSelectResult } from '@shared/draft'

/** How draft state is being filled - plain language */
export function copyDraftSource(s: DraftSource): string {
  switch (s) {
    case 'none':
      return 'Not in a draft'
    case 'lcu':
      return 'League client'
    case 'manual':
      return 'Picks you enter'
    case 'vision':
      return 'Not in a draft'
    default:
      return String(s)
  }
}

/** Short League connection for status strip / top bar */
export function copyLeagueClientLine(lcu: LcuChampSelectResult | null): string {
  if (lcu?.lcuReachable) {
    return 'League: connected'
  }
  return 'League: waiting'
}

/** One line for the bottom status strip (plain, no LCU / DGV / src / NOM) */
export function copyBottomStatusStrip(params: {
  lcu: LcuChampSelectResult | null
  dataVersion: string
  source: DraftSource
}): string {
  const { lcu, dataVersion, source } = params
  const league = copyLeagueClientLine(lcu)
  const data =
    dataVersion && dataVersion !== '-' && dataVersion !== '—' && !dataVersion.startsWith('(')
      ? dataVersion
      : '-'
  const src = copyDraftSource(source)
  return `${league} - Game data ${data} - ${src}`
}
