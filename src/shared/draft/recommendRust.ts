import { getChampionBuildProfile } from './championBuildProfile'
import { championThreatOverrideRows } from './championThreatOverrides'
import { BUNDLED_CHAMPION_NAMES, resolveChampionName } from './championNameFallback'
import { HARD_COUNTERS_BY_NAME } from './hardCounterData'
import { MATCHUP_BONUS, ROLE_CHAMPION_POOL } from './matchupData'
import {
  publicMetaBaseRate,
  publicMetaCandidateIdsForRole,
  publicMetaLaneRate
} from './metaStats'
import { runeLoadoutForChampion } from './runeHints'
import { ALLY_SYNERGY_BONUS } from './synergyData'
import type { CompiledTrainedEffects } from './trainedEffects'
import type { DraftRole, PickSuggestion, SuggestionReason } from './types'
import publicMetaStatsSeed from '../data/publicMetaStatsSeed.json'

type RoleKey = Exclude<DraftRole, 'unknown'>
type ChampionMeta = { tags: string[]; partype: string }

const ROLE_KEYS: RoleKey[] = ['top', 'jungle', 'middle', 'bottom', 'support']
export const ENGINE_V1_LABEL = 'engine-v1'
export const ENGINE_MC_LABEL = 'engine-v1+mc'
export const MEANINGFUL_TEAM_SYNERGY_DELTA = 0.003

export type RustRecommendRow = {
  championId: number
  score: number
  reasons: SuggestionReason[]
  isLockedPick?: boolean
  baseWinRate?: number
  contextWinRate?: number
  winRateDelta?: number
  estWin?: number
  lookaheadEV?: number
  lookaheadRisk?: number
  detail?: string
}

export type RustRecommendOutput = {
  ok: boolean
  rows?: RustRecommendRow[]
  patchLabel?: string
  unsupportedReason?: string
  error?: string
}

export type RustChampionScore = {
  base: number
  ally: number
  enemy: number
  comfort: number
  comp: number
  allyAdj: number
  enemyAdj: number
  compAdj: number
  comfortAdj: number
  blindP: number
  contextCombined: number
  combined: number
}

export type RustChampionScoreOutput = {
  ok: boolean
  score?: RustChampionScore
  patchLabel?: string
  error?: string
}

type NumberEntry = {
  id: number
  value: number
}

export type SuggestPicksArgs = {
  myRole: DraftRole
  snapshot: import('./types').DraftSnapshot | null
  idToName: ReadonlyMap<number, string> | null
  maxResults?: number
  dataDragonVersion?: string | null
  monteCarloSamples?: number
  rngSeed?: number
  championMetaById?: ReadonlyMap<number, ChampionMeta> | null
  trainedEffects?: CompiledTrainedEffects | null
  comfortByChampionId?: ReadonlyMap<number, number> | null
  sortBy?: 'score' | 'delta'
  deltaListMode?: import('./types').DraftDeltaListMode
  candidateChampionIds?: Iterable<number> | null
}

export type RustRecommendInput = {
  snapshot: SuggestPicksArgs['snapshot']
  myRole: DraftRole
  maxResults: number
  dataDragonVersion: string | null
  monteCarloSamples: number
  rngSeed: number
  sortBy: 'score' | 'delta'
  deltaListMode: NonNullable<SuggestPicksArgs['deltaListMode']>
  idToName: { id: number; name: string }[]
  championMetaById: {
    id: number
    meta: { tags: string[]; partype: string }
  }[]
  comfortByChampionId: NumberEntry[]
  candidateChampionIds: number[] | null
  roleChampionPools: { role: RoleKey; championIds: number[] }[]
  publicCandidateIds: { role: RoleKey; championIds: number[] }[]
  publicBaseRates: { role: RoleKey; championId: number; rate: number }[]
  publicLaneRates: { role: RoleKey; candidateId: number; enemyId: number; rate: number }[]
  matchupBonuses: { candidateId: number; enemyId: number; bonus: number }[]
  allySynergyBonuses: { leftId: number; rightId: number; bonus: number }[]
  trainedBaseRates: { role: RoleKey; championId: number; logit: number }[]
  trainedLaneRates: { role: RoleKey; allyId: number; enemyId: number; logit: number }[]
  trainedSynergyDeltas: { allyRole: RoleKey; partnerRole: RoleKey; allyId: number; partnerId: number; delta: number }[]
  hasTrainedData: boolean
  enemyRoleInference: {
    enemyIndex: number
    roleProbabilities: Record<RoleKey, number>
  }[]
  championThreatOverrides: ReturnType<typeof championThreatOverrideRows>
  hardCountersByName: { championKey: string; counterKeys: string[] }[]
}

export type RustChampionScoreInput = RustRecommendInput & {
  championId: number
}

type RustRecommendStaticInput = Pick<
  RustRecommendInput,
  | 'roleChampionPools'
  | 'publicCandidateIds'
  | 'publicBaseRates'
  | 'publicLaneRates'
  | 'matchupBonuses'
  | 'allySynergyBonuses'
  | 'championThreatOverrides'
  | 'hardCountersByName'
>

let staticInputCache: RustRecommendStaticInput | null = null

function staticRecommendInput(): RustRecommendStaticInput {
  staticInputCache ??= {
    roleChampionPools: rolePoolRows(),
    publicCandidateIds: publicCandidateRows(),
    publicBaseRates: publicBaseRateRows(),
    publicLaneRates: publicLaneRateRows(),
    matchupBonuses: matchupBonusRows(),
    allySynergyBonuses: allySynergyRows(),
    championThreatOverrides: championThreatOverrideRows(),
    hardCountersByName: hardCounterRows()
  }
  return staticInputCache
}

function finiteId(id: unknown): number | null {
  if (typeof id !== 'number' || !Number.isFinite(id) || id <= 0) {
    return null
  }
  return Math.trunc(id)
}

function mergedNameRows(idToName: ReadonlyMap<number, string> | null): { id: number; name: string }[] {
  const rows = new Map<number, string>()
  for (const [rawId, name] of Object.entries(BUNDLED_CHAMPION_NAMES)) {
    const id = Number(rawId)
    if (Number.isFinite(id) && name) {
      rows.set(id, name)
    }
  }
  for (const [id, name] of Array.from(idToName?.entries() ?? [])) {
    if (Number.isFinite(id) && name) {
      rows.set(Math.trunc(id), name)
    }
  }
  return Array.from(rows.entries()).map(([id, name]) => ({ id, name }))
}

function matchupBonusRows(): RustRecommendInput['matchupBonuses'] {
  const rows: RustRecommendInput['matchupBonuses'] = []
  for (const [candidateId, byEnemy] of Object.entries(MATCHUP_BONUS)) {
    const c = Number(candidateId)
    if (!Number.isFinite(c)) {
      continue
    }
    for (const [enemyId, bonus] of Object.entries(byEnemy)) {
      const e = Number(enemyId)
      if (Number.isFinite(e) && Number.isFinite(bonus)) {
        rows.push({ candidateId: c, enemyId: e, bonus })
      }
    }
  }
  return rows
}

function allySynergyRows(): RustRecommendInput['allySynergyBonuses'] {
  const rows: RustRecommendInput['allySynergyBonuses'] = []
  for (const [leftId, byRight] of Object.entries(ALLY_SYNERGY_BONUS)) {
    const left = Number(leftId)
    if (!Number.isFinite(left)) {
      continue
    }
    for (const [rightId, bonus] of Object.entries(byRight)) {
      const right = Number(rightId)
      if (Number.isFinite(right) && Number.isFinite(bonus)) {
        rows.push({ leftId: left, rightId: right, bonus })
      }
    }
  }
  return rows
}

function publicBaseRateRows(): RustRecommendInput['publicBaseRates'] {
  const seen = new Set<string>()
  const rows: RustRecommendInput['publicBaseRates'] = []
  const rawRows = Array.isArray(publicMetaStatsSeed.roleBase) ? publicMetaStatsSeed.roleBase : []
  for (const raw of rawRows) {
    const role = typeof raw.role === 'string' ? raw.role : ''
    if (!ROLE_KEYS.includes(role as RoleKey)) {
      continue
    }
    const championId = finiteId(raw.championId)
    if (championId == null) {
      continue
    }
    const rate = publicMetaBaseRate(role as RoleKey, championId)
    const key = `${role}:${championId}`
    if (rate != null && !seen.has(key)) {
      seen.add(key)
      rows.push({ role: role as RoleKey, championId, rate })
    }
  }
  return rows
}

function publicLaneRateRows(): RustRecommendInput['publicLaneRates'] {
  const seen = new Set<string>()
  const rows: RustRecommendInput['publicLaneRates'] = []
  const rawRows = Array.isArray(publicMetaStatsSeed.counters) ? publicMetaStatsSeed.counters : []
  for (const raw of rawRows) {
    const role = typeof raw.role === 'string' ? raw.role : ''
    if (!ROLE_KEYS.includes(role as RoleKey)) {
      continue
    }
    const candidateId = finiteId(raw.candidateId)
    const enemyId = finiteId(raw.enemyId)
    if (candidateId == null || enemyId == null) {
      continue
    }
    const rate = publicMetaLaneRate(role as RoleKey, candidateId, enemyId)
    const key = `${role}:${candidateId}:${enemyId}`
    if (rate != null && !seen.has(key)) {
      seen.add(key)
      rows.push({ role: role as RoleKey, candidateId, enemyId, rate })
    }
  }
  return rows
}

function rolePoolRows(): RustRecommendInput['roleChampionPools'] {
  return ROLE_KEYS.map((role) => ({
    role,
    championIds: [...(ROLE_CHAMPION_POOL[role] ?? [])]
  }))
}

function publicCandidateRows(): RustRecommendInput['publicCandidateIds'] {
  return ROLE_KEYS.map((role) => ({
    role,
    championIds: publicMetaCandidateIdsForRole(role)
  }))
}

function hardCounterRows(): RustRecommendInput['hardCountersByName'] {
  return Array.from(HARD_COUNTERS_BY_NAME.entries()).map(([championKey, counterKeys]) => ({
    championKey,
    counterKeys: [...counterKeys]
  }))
}

function hasTrainedData(args: SuggestPicksArgs): boolean {
  const status = args.trainedEffects?.status
  if (status?.hasAnyData) {
    return true
  }
  return Boolean(
    Object.values(args.trainedEffects?.base ?? {}).some((m) => m.size > 0) ||
      Object.values(args.trainedEffects?.matchup ?? {}).some((m) => m.size > 0) ||
      Object.values(args.trainedEffects?.synergy ?? {}).some((byRole) =>
        Object.values(byRole).some((m) => m.size > 0)
      )
  )
}

export function canUseRustRecommendations(args: SuggestPicksArgs): { ok: true } | { ok: false; reason: string } {
  if (!args.snapshot) {
    return { ok: true }
  }
  if (args.myRole === 'unknown') {
    return { ok: true }
  }
  return { ok: true }
}

function trainedBaseRows(trained: CompiledTrainedEffects | null | undefined): RustRecommendInput['trainedBaseRates'] {
  if (!trained) return []
  return ROLE_KEYS.flatMap((role) =>
    Array.from(trained.base[role].entries()).map(([championId, logit]) => ({ role, championId, logit }))
  )
}

function trainedLaneRows(trained: CompiledTrainedEffects | null | undefined): RustRecommendInput['trainedLaneRates'] {
  if (!trained) return []
  return ROLE_KEYS.flatMap((role) =>
    Array.from(trained.matchup[role].entries()).flatMap(([allyId, byEnemy]) =>
      Array.from(byEnemy.entries()).map(([enemyId, logit]) => ({ role, allyId, enemyId, logit }))
    )
  )
}

function trainedSynergyRows(trained: CompiledTrainedEffects | null | undefined): RustRecommendInput['trainedSynergyDeltas'] {
  if (!trained) return []
  return ROLE_KEYS.flatMap((allyRole) =>
    ROLE_KEYS.flatMap((partnerRole) =>
      Array.from(trained.synergy[allyRole][partnerRole].entries()).flatMap(([allyId, byPartner]) =>
        Array.from(byPartner.entries()).map(([partnerId, delta]) => ({
          allyRole,
          partnerRole,
          allyId,
          partnerId,
          delta
        }))
      )
    )
  )
}

export function serializeRecommendInput({
  myRole,
  snapshot,
  idToName,
  maxResults = 12,
  dataDragonVersion = null,
  monteCarloSamples = 0,
  rngSeed = 0x9e37_79b1,
  championMetaById = null,
  trainedEffects = null,
  comfortByChampionId = null,
  sortBy = 'score',
  deltaListMode = 'best',
  candidateChampionIds = null
}: SuggestPicksArgs): RustRecommendInput {
  const staticInput = staticRecommendInput()
  const comfortMap = comfortByChampionId ?? (trainedEffects && trainedEffects.comfort.size > 0 ? trainedEffects.comfort : null)
  const trainedOn = hasTrainedData({
    myRole,
    snapshot,
    idToName,
    trainedEffects
  })
  return {
    snapshot,
    myRole,
    maxResults,
    dataDragonVersion,
    monteCarloSamples,
    rngSeed,
    sortBy,
    deltaListMode,
    idToName: mergedNameRows(idToName),
    championMetaById: Array.from(championMetaById?.entries() ?? []).map(([id, meta]) => ({ id, meta })),
    comfortByChampionId: Array.from(comfortMap?.entries() ?? [])
      .map(([id, value]) => ({ id, value }))
      .filter((row) => Number.isFinite(row.id) && Number.isFinite(row.value)),
    candidateChampionIds:
      candidateChampionIds == null
        ? null
        : Array.from(candidateChampionIds)
            .map(finiteId)
            .filter((id): id is number => id != null),
    ...staticInput,
    trainedBaseRates: trainedBaseRows(trainedEffects),
    trainedLaneRates: trainedLaneRows(trainedEffects),
    trainedSynergyDeltas: trainedSynergyRows(trainedEffects),
    hasTrainedData: trainedOn,
    enemyRoleInference: []
  }
}

export function serializeChampionScoreInput(args: SuggestPicksArgs, championId: number): RustChampionScoreInput {
  return {
    ...serializeRecommendInput(args),
    championId
  }
}

export function hydrateRustRecommendations(rows: RustRecommendRow[], args: SuggestPicksArgs): PickSuggestion[] {
  return rows.map((row) => {
    const championName = resolveChampionName(row.championId, args.idToName)
    return {
      ...row,
      championName,
      reasons: Array.from(new Set(row.reasons)),
      runes: runeLoadoutForChampion(row.championId, args.myRole, {
        snapshot: args.snapshot,
        idToName: args.idToName,
        championMetaById: args.championMetaById
      }),
      buildProfile: getChampionBuildProfile(
        row.championId,
        args.myRole,
        args.championMetaById?.get(row.championId) ?? null,
        championName
      )
    }
  })
}
