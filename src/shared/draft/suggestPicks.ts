import { buildEngineState } from './draftState'
import { recommend } from './recommendEngine'
import type { CompiledTrainedEffects } from './trainedEffects'
import type { DraftDeltaListMode, DraftRole, DraftSnapshot, PickSuggestion } from './types'

export type SuggestPicksArgs = {
  myRole: DraftRole
  snapshot: DraftSnapshot | null
  idToName: ReadonlyMap<number, string> | null
  maxResults?: number
  /** DDragon / client patch string for engine state metadata. */
  dataDragonVersion?: string | null
  /**
   * Monte Carlo lookahead (completed-roster rollouts). 0 = v1 only (fast). Try 20–32 for EV + risk in UI.
   */
  monteCarloSamples?: number
  rngSeed?: number
  /** Per champion: Riot DDragon `tags` + partype (from main `loadChampionMaps`). */
  championMetaById?: ReadonlyMap<number, { tags: string[]; partype: string }> | null
  /** Exported Riot logit bundle; when present the engine prefers it over bundled heuristics. */
  trainedEffects?: CompiledTrainedEffects | null
  /** Player pool preference, 0..1 comfort, blended as a recommendation prior. */
  comfortByChampionId?: ReadonlyMap<number, number> | null
  /** Candidate ordering mode. */
  sortBy?: 'score' | 'delta'
  /** Used when `sortBy` is `delta` and the board has context (see engine). */
  deltaListMode?: DraftDeltaListMode
  /** Optional hard filter used by "My Champs" mode. */
  candidateChampionIds?: Iterable<number> | null
}

/**
 * Ranks every legal candidate in your role pool for the current board (bans, locks, LCU pick order when present).
 * Delegates to the layered engine (v1 blend; optional MC).
 */
export function suggestPicks({
  myRole,
  snapshot,
  idToName,
  maxResults = 12,
  dataDragonVersion = null,
  monteCarloSamples = 0,
  rngSeed,
  championMetaById = null,
  trainedEffects = null,
  comfortByChampionId = null,
  sortBy = 'score',
  deltaListMode = 'best',
  candidateChampionIds = null
}: SuggestPicksArgs): { suggestions: PickSuggestion[]; patchLabel: string } {
  if (!snapshot) {
    return { suggestions: [], patchLabel: 'engine-v1' }
  }
  const st = buildEngineState(snapshot, myRole, {
    bans: snapshot.bans ?? null,
    myPickOrder: snapshot.myPickOrder ?? null,
    dataDragonVersion,
    patch: dataDragonVersion && dataDragonVersion[0] !== '(' ? dataDragonVersion : 'bundled'
  })
  return recommend({
    state: st,
    idToName,
    maxResults,
    monteCarloSamples,
    rngSeed: rngSeed ?? 0x9e37_79b1,
    championMetaById,
    trainedEffects,
    comfortByChampionId,
    sortBy,
    deltaListMode,
    candidateChampionIds
  })
}
