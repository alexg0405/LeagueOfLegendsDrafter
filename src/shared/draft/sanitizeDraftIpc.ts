import type { ChampionBuildProfile, DraftUpdate, PickSuggestion } from './types'
import { isOverlayEngineEcho } from './validate'

/**
 * Some IPC/JSON round-trips can drop or mangle `NaN` / partial nested objects, which then fail
 * `isDraftUpdate` in the main process. The overlay never receives LCU/connection updates. Normalize
 * so publish always matches the validator.
 */
function finiteOr<T extends number | null | undefined>(n: T, fallback: number): number {
  if (n == null) {
    return fallback
  }
  return Number.isFinite(n) ? n : fallback
}

function sanitizeBuildProfile(
  b: PickSuggestion['buildProfile'] | null | undefined
): ChampionBuildProfile | null {
  if (b == null || typeof b !== 'object') {
    return null
  }
  const o = b as Record<string, unknown>
  const dmg = o.damage
  if (dmg !== 'ad' && dmg !== 'ap' && dmg !== 'mixed' && dmg !== 'flex') {
    return null
  }
  if (typeof o.archetype !== 'string' || typeof o.buildHint !== 'string' || typeof o.tagsLine !== 'string' || typeof o.partype !== 'string') {
    return null
  }
  return {
    damage: dmg,
    archetype: o.archetype,
    buildHint: o.buildHint,
    tagsLine: o.tagsLine,
    partype: o.partype
  }
}

function sanitizePickSuggestion(s: PickSuggestion): PickSuggestion {
  const baseWinRate = s.baseWinRate
  const contextWinRate = s.contextWinRate
  const winRateDelta = s.winRateDelta
  const estWin = s.estWin
  const ev = s.lookaheadEV
  const risk = s.lookaheadRisk
  return {
    ...s,
    score: finiteOr(s.score, 1),
    baseWinRate: baseWinRate != null && Number.isFinite(baseWinRate) ? baseWinRate : undefined,
    contextWinRate: contextWinRate != null && Number.isFinite(contextWinRate) ? contextWinRate : undefined,
    winRateDelta: winRateDelta != null && Number.isFinite(winRateDelta) ? winRateDelta : undefined,
    estWin: estWin != null && Number.isFinite(estWin) ? estWin : undefined,
    lookaheadEV: ev != null && Number.isFinite(ev) ? ev : undefined,
    lookaheadRisk: risk != null && Number.isFinite(risk) ? risk : undefined,
    buildProfile: sanitizeBuildProfile(s.buildProfile)
  }
}

function sanitizeChampionsSearch(
  rows: DraftUpdate['championsSearch']
): DraftUpdate['championsSearch'] {
  if (rows == null) {
    return null
  }
  return rows
    .filter((r) => r != null && typeof r.id === 'number' && typeof r.name === 'string')
    .map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key != null && typeof r.key === 'string' ? r.key : undefined,
      tags:
        r.tags == null
          ? undefined
          : Array.isArray(r.tags)
            ? r.tags.filter((t): t is string => typeof t === 'string')
            : undefined,
      partype: r.partype != null && typeof r.partype === 'string' ? r.partype : undefined
    }))
    .slice(0, 400)
}

function sanitizeTrainedEffectsStatus(
  t: DraftUpdate['trainedEffectsStatus']
): DraftUpdate['trainedEffectsStatus'] {
  if (t == null) {
    return null
  }
  return {
    hasAnyData: Boolean(t.hasAnyData),
    basePairs: finiteOr(t.basePairs, 0),
    matchupPairs: finiteOr(t.matchupPairs, 0),
    synergyPairs: finiteOr(t.synergyPairs, 0),
    exportedAt: typeof t.exportedAt === 'string' ? t.exportedAt : null,
    patchesSeen: Array.isArray(t.patchesSeen)
      ? t.patchesSeen.filter((p): p is string => typeof p === 'string')
      : []
  }
}

export function sanitizeDraftUpdateForIpc(d: DraftUpdate): DraftUpdate {
  return {
    ...d,
    suggestions: d.suggestions.map(sanitizePickSuggestion),
    championsSearch: sanitizeChampionsSearch(d.championsSearch),
    trainedEffectsStatus: sanitizeTrainedEffectsStatus(d.trainedEffectsStatus),
    overlayEngineEcho:
      d.overlayEngineEcho != null && isOverlayEngineEcho(d.overlayEngineEcho) ? d.overlayEngineEcho : null
  }
}
