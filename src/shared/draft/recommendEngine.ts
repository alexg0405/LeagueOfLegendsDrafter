/**
 * Draft decision engine: recommend(current_draft_state) -> ranked champions.
 * v1: fast linear blend. Optional Monte Carlo over randomly completed rosters.
 *
 * Canonical *trained* logit effects from the Python pipeline are exported to
 * `training/runtime/effects_id.json` (schema `nexus_effects_v1` via `npm run train:export`).
 * This file still uses bundled heuristics (matchupData/synergyData/statsModel) until
 * the app loads the export bundle; see `training/DRAFT_STATE.md`.
 *
 * Flex picks: slots use LCU `assignedPosition`; ambiguous role (e.g. “top” showing a mid)
 * is not modeled with P(role|champion) yet — see roadmap in product notes.
 */
import { getChampionBuildProfile } from './championBuildProfile'
import { getChampionThreatOverride } from './championThreatOverrides'
import { resolveChampionName } from './championNameFallback'
import { runeLoadoutForChampion } from './runeHints'
import { MATCHUP_BONUS, ROLE_CHAMPION_POOL } from './matchupData'
import { inferredLaneWeightForEnemy, inferEnemyRolePosteriors } from './roleInference'
import { ALLY_SYNERGY_BONUS } from './synergyData'
import { draftPhaseFromLockedPicks, shrunkBaseRate, shrunkLaneRate } from './statsModel'
import { winRateToBonus } from './shrinkage'
import { legalChampionSetForRole, type DraftEngineState } from './draftState'
import {
  sigmoid,
  trainedBaseRate,
  trainedLaneRate,
  trainedSynergyDelta,
  type CompiledTrainedEffects
} from './trainedEffects'
import type { DraftDeltaListMode, DraftRole, DraftSnapshot, PickSuggestion, SuggestionReason, SlotPick } from './types'

export const ENGINE_V1_LABEL = 'engine-v1'
export const ENGINE_MC_LABEL = 'engine-v1+mc'

export type RecommendArgs = {
  state: DraftEngineState
  idToName: ReadonlyMap<number, string> | null
  comfortByChampionId?: ReadonlyMap<number, number> | null
  maxResults?: number
  /** Monte Carlo rollouts; 0 = v1 only. */
  monteCarloSamples?: number
  rngSeed?: number
  /** From Data Dragon: tags + partype per champion id (AD/AP / tank hints). */
  championMetaById?: ReadonlyMap<number, { tags: string[]; partype: string }> | null
  /** Exported Riot-training bundle (from `npm run train:export`); optional, bundled heuristics fill gaps. */
  trainedEffects?: CompiledTrainedEffects | null
  /** Candidate ordering mode. */
  sortBy?: 'score' | 'delta'
  /** When `sortBy` is delta and board context exists: order by largest winrate gains vs smallest. */
  deltaListMode?: DraftDeltaListMode
}

const W_BASE = 0.35
const W_ALLY = 0.25
const W_ENEMY = 0.25
const W_COMFORT = 0.15
const W_COMP = 0.2
const MAX_BLIND_PEN = 0.12

function bonusToP(bonus: number, scale: number): number {
  return 0.5 + scale * Math.max(-0.1, Math.min(0.1, bonus * 0.04))
}

function legacyEnemyP(c: number, e: number): number {
  const b = MATCHUP_BONUS[String(c)]?.[String(e)]
  if (b == null) {
    return 0.5
  }
  return 0.5 + 0.014 * Math.max(-2.5, Math.min(2.5, b))
}

function enemyTerm(
  c: number,
  myRole: DraftRole,
  snap: DraftSnapshot,
  trained: CompiledTrainedEffects | null | undefined
): number {
  const enemyRolePosteriors = inferEnemyRolePosteriors(snap)
  let s = 0
  let w = 0
  snap.enemy.forEach((p, idx) => {
    if (p.championId == null || p.championId === 0) {
      return
    }
    const e = p.championId
    /** Prefer trained lane rate (exported logits); fall back to bundled shrinkage then heuristic bonuses. */
    const trainedM = trainedLaneRate(trained ?? null, myRole, c, e)
    const m = trainedM ?? shrunkLaneRate(c, e) ?? legacyEnemyP(c, e)
    const wgt = inferredLaneWeightForEnemy(enemyRolePosteriors, idx, myRole)
    s += m * wgt
    w += wgt
  })
  return w > 0 ? s / w : 0.5
}

function allyTerm(
  c: number,
  myRole: DraftRole,
  localCell: number | null,
  snap: DraftSnapshot,
  trained: CompiledTrainedEffects | null | undefined
): number {
  let t = 0
  let n = 0
  for (const a of snap.ally) {
    if (a.championId == null || a.championId === 0) {
      continue
    }
    if (a.role === myRole && a.cellId != null && localCell != null && a.cellId === localCell) {
      continue
    }
    const al = a.championId
    /**
     * Trained synergy is a logit delta around 0.5; we turn it into a probability in [0.3, 0.7] and
     * fall back to the sparse hand-tuned `ALLY_SYNERGY_BONUS` table when we have no trained signal.
     */
    const trainedDelta = trainedSynergyDelta(trained ?? null, myRole, a.role, c, al)
    if (trainedDelta != null) {
      t += Math.max(0.3, Math.min(0.7, sigmoid(trainedDelta)))
    } else {
      const f =
        ALLY_SYNERGY_BONUS[String(c)]?.[String(al)] ?? ALLY_SYNERGY_BONUS[String(al)]?.[String(c)] ?? 0
      t += bonusToP(f, 0.4)
    }
    n += 1
  }
  return n > 0 ? t / n : 0.5
}

function blindPenalty(
  c: number,
  poolKey: keyof typeof ROLE_CHAMPION_POOL,
  state: DraftEngineState,
  trained: CompiledTrainedEffects | null | undefined
): number {
  const base = trainedBaseRate(trained ?? null, poolKey as DraftRole, c) ?? shrunkBaseRate(poolKey, c)
  const phase = draftPhaseFromLockedPicks(state.lockedChampionPicks)
  const earlyBoard = phase === 'early' && state.lockedChampionPicks < 3
  const earlyLcu = state.myPickOrder != null && state.myPickOrder <= 2
  const useEarly = earlyLcu || (earlyBoard && state.myPickOrder == null)
  if (!useEarly) {
    return 0
  }
  if (base >= 0.505) {
    return 0
  }
  return (0.505 - base) * (MAX_BLIND_PEN / 0.1)
}

function comfortGet(id: number, m: ReadonlyMap<number, number> | null | undefined): number {
  if (m == null) {
    return 0.5
  }
  return m.get(id) ?? 0.5
}

function compTerm(
  c: number,
  myRole: DraftRole,
  localCell: number | null,
  snap: DraftSnapshot,
  championMetaById: ReadonlyMap<number, { tags: string[]; partype: string }> | null | undefined,
  idToName: ReadonlyMap<number, string> | null | undefined
): number {
  let adThreat = 0
  let apThreat = 0
  let fighterCount = 0
  let mageCount = 0
  let marksmanCount = 0
  let assassinCount = 0
  let tankCount = 0
  let supportCount = 0
  const toScore = (id: number, role: DraftRole) => {
    const override = getChampionThreatOverride(idToName?.get(id))
    if (override) {
      for (const cls of override.classes) {
        if (cls === 'fighter') fighterCount += 1
        if (cls === 'mage') mageCount += 1
        if (cls === 'marksman') marksmanCount += 1
        if (cls === 'assassin') assassinCount += 1
        if (cls === 'tank') tankCount += 1
        if (cls === 'support') supportCount += 1
      }
      if (override.threat === 'ad') {
        adThreat += override.classes.includes('marksman') ? 1.1 : 1
        return
      }
      if (override.threat === 'ap') {
        apThreat += 1
        return
      }
      if (override.threat === 'hybrid') {
        adThreat += 0.5
        apThreat += 0.5
        return
      }
      adThreat += 0.125
      apThreat += 0.125
      return
    }
    const raw = championMetaById?.get(id) ?? null
    const tags = new Set(raw?.tags ?? [])
    const profile = getChampionBuildProfile(id, role, raw)
    if (tags.has('Fighter')) fighterCount += 1
    if (tags.has('Mage')) mageCount += 1
    if (tags.has('Marksman')) marksmanCount += 1
    if (tags.has('Assassin')) assassinCount += 1
    if (tags.has('Tank')) tankCount += 1
    if (tags.has('Support')) supportCount += 1
    const utilityOnly =
      (tags.has('Tank') || tags.has('Support')) &&
      !tags.has('Marksman') &&
      !tags.has('Mage') &&
      !tags.has('Assassin') &&
      !tags.has('Fighter')
    if (utilityOnly) {
      adThreat += 0.1
      apThreat += 0.1
      return
    }
    if (profile.damage === 'ad') {
      adThreat += tags.has('Marksman') ? 1.1 : 1
      return
    }
    if (profile.damage === 'ap') {
      apThreat += 1
      return
    }
    adThreat += 0.5
    apThreat += 0.5
  }
  for (const a of snap.ally) {
    if (a.role === myRole && a.cellId != null && localCell != null && a.cellId === localCell) {
      toScore(c, myRole)
      continue
    }
    if (a.championId == null || a.championId === 0) {
      continue
    }
    toScore(a.championId, a.role)
  }
  const totalThreat = adThreat + apThreat
  if (totalThreat <= 0) {
    return 0.5
  }
  let score = 0.5
  const skew = Math.abs(adThreat - apThreat) / totalThreat
  score += (0.45 - skew) * 0.12
  const oneResistDraft = (apThreat >= 4.1 && adThreat <= 1.0) || (adThreat >= 4.1 && apThreat <= 1.0)
  if (oneResistDraft) {
    score -= 0.12
  }
  const classMax = Math.max(fighterCount, mageCount, marksmanCount, assassinCount, tankCount)
  if (classMax >= 4) {
    score -= 0.07
  }
  const frontline = tankCount + fighterCount * 0.6
  if (frontline < 1.2) {
    score -= 0.06
  }
  const hasSustainedDps = marksmanCount >= 1 || adThreat >= 1.8 || apThreat >= 2.2
  if (!hasSustainedDps) {
    score -= 0.04
  }
  const engageWeight = tankCount + assassinCount * 0.5 + fighterCount * 0.5 + supportCount * 0.35
  if (engageWeight < 1.0) {
    score -= 0.03
  }
  return Math.max(0.35, Math.min(0.65, score))
}

function teammateLockCountExcludingLocal(s: DraftSnapshot): number {
  const localCell = s.localPlayerCellId
  let n = 0
  for (const a of s.ally) {
    if (a.championId == null || a.championId === 0) {
      continue
    }
    if (localCell != null && a.cellId != null && a.cellId === localCell) {
      continue
    }
    n += 1
  }
  return n
}

function hasBoardContext(s: DraftSnapshot, myRole: DraftRole, localCell: number | null): boolean {
  for (const a of s.ally) {
    if (a.championId == null || a.championId === 0) {
      continue
    }
    if (a.role === myRole && localCell != null && a.cellId != null && a.cellId === localCell) {
      continue
    }
    return true
  }
  for (const e of s.enemy) {
    if (e.championId != null && e.championId > 0) {
      return true
    }
  }
  return false
}

/**
 * V1 linear blend, with **extra weight on the ally/teamcomp term** as more allies lock
 * (rebalances away from base so suggestions react to your comp).
 */
export function v1ComponentScores(
  c: number,
  poolKey: keyof typeof ROLE_CHAMPION_POOL,
  state: DraftEngineState,
  idToName: ReadonlyMap<number, string> | null | undefined,
  comfortBy: ReadonlyMap<number, number> | null | undefined,
  trained: CompiledTrainedEffects | null | undefined = null,
  championMetaById: ReadonlyMap<number, { tags: string[]; partype: string }> | null | undefined = null
): {
  base: number
  ally: number
  enemy: number
  comfort: number
  comp: number
  blindP: number
  contextCombined: number
  combined: number
} {
  const s = state.snapshot
  const localCell = s.localPlayerCellId
  const myRole = state.myRole
  const base = trainedBaseRate(trained, myRole, c) ?? shrunkBaseRate(poolKey, c)
  const ally = allyTerm(c, myRole, localCell, s, trained)
  const enemy = enemyTerm(c, myRole, s, trained)
  const comf = comfortGet(c, comfortBy)
  const comp = compTerm(c, myRole, localCell, s, championMetaById, idToName)
  const blindP = blindPenalty(c, poolKey, state, trained)
  const t = Math.min(1, teammateLockCountExcludingLocal(s) / 4)
  const wA = W_ALLY * (1 + 0.2 * t)
  const wB = W_BASE * (1 - 0.1 * t)
  const wE = W_ENEMY * (1 - 0.05 * t)
  /** Weighted average (same scale as `base`) so delta vs baseline is meaningful; old 0.85·k shrink made deltas almost always negative. */
  const wSum = wA + wB + wE + W_COMP
  const blended = (wB * base + wA * ally + wE * enemy + W_COMP * comp) / wSum
  const contextCombined = Math.max(0, Math.min(1, blended))
  const combined = Math.max(
    0,
    Math.min(1, contextCombined + W_COMFORT * comf - blindP)
  )
  return { base, ally, enemy, comfort: comf, comp, blindP, contextCombined, combined }
}

function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickFromPoolExcluding(
  role: DraftRole,
  exclude: Set<number>,
  rand: () => number
): number | null {
  if (role === 'unknown') {
    return null
  }
  const key = role as keyof typeof ROLE_CHAMPION_POOL
  const list = (ROLE_CHAMPION_POOL[key] ?? []).filter((id) => !exclude.has(id))
  if (list.length === 0) {
    return null
  }
  return list[Math.floor(rand() * list.length)]!
}

export function cloneWithMyPick(
  snap: DraftSnapshot,
  myRole: DraftRole,
  localCell: number | null,
  championId: number
): DraftSnapshot {
  const ally: SlotPick[] = snap.ally.map((p) => {
    if (p.role !== myRole) {
      return p
    }
    if (localCell != null && p.cellId != null) {
      if (p.cellId === localCell) {
        return { ...p, championId }
      }
      return p
    }
    if (p.championId == null || p.championId === 0) {
      return { ...p, championId }
    }
    return p
  })
  const ok = ally.some(
    (p) =>
      p.role === myRole && p.championId === championId && (localCell == null || p.cellId === localCell)
  )
  if (ok) {
    return { ...snap, ally }
  }
  return {
    ...snap,
    ally: snap.ally.map((p) => (p.role === myRole ? { ...p, championId } : p))
  }
}

function buildUnavailableFromSnap(snap: DraftSnapshot, bans: number[]): Set<number> {
  const u = new Set(bans)
  for (const p of [...snap.ally, ...snap.enemy]) {
    if (p.championId != null && p.championId > 0) {
      u.add(p.championId)
    }
  }
  return u
}

export function completeDraftRandomly(
  snap: DraftSnapshot,
  bans: number[],
  rand: () => number
): DraftSnapshot {
  const exclude = buildUnavailableFromSnap(snap, bans)
  const fillSide = (side: 'ally' | 'enemy'): SlotPick[] => {
    return snap[side].map((p) => {
      if (p.championId != null && p.championId > 0) {
        return p
      }
      if (p.role === 'unknown') {
        return p
      }
      const id = pickFromPoolExcluding(p.role, exclude, rand)
      if (id == null) {
        return p
      }
      exclude.add(id)
      return { ...p, championId: id }
    })
  }
  return { ...snap, ally: fillSide('ally'), enemy: fillSide('enemy') }
}

function snapshotValueV1(
  c: number,
  poolKey: keyof typeof ROLE_CHAMPION_POOL,
  st: DraftEngineState,
  idToName: ReadonlyMap<number, string> | null | undefined,
  comfortBy: ReadonlyMap<number, number> | null | undefined,
  trained: CompiledTrainedEffects | null | undefined,
  championMetaById: ReadonlyMap<number, { tags: string[]; partype: string }> | null | undefined
): number {
  return v1ComponentScores(c, poolKey, st, idToName, comfortBy, trained, championMetaById).combined
}

export function recommend(args: RecommendArgs): {
  suggestions: PickSuggestion[]
  patchLabel: string
} {
  const {
    state,
    idToName,
    comfortByChampionId,
    maxResults = 5,
    monteCarloSamples = 0,
    rngSeed = 0x1a2b3c4d,
    championMetaById = null,
    trainedEffects = null,
    sortBy = 'score',
    deltaListMode = 'best'
  } = args
  /** Fold trained per-champion comfort into the provided map when the caller did not pass one. */
  const mergedComfort: ReadonlyMap<number, number> | null | undefined =
    comfortByChampionId ?? (trainedEffects && trainedEffects.comfort.size > 0 ? trainedEffects.comfort : null)
  const myRole = state.myRole
  const poolKey =
    myRole === 'top' || myRole === 'jungle' || myRole === 'middle' || myRole === 'bottom' || myRole === 'support'
      ? (myRole as keyof typeof ROLE_CHAMPION_POOL)
      : null
  if (poolKey == null) {
    return { suggestions: [], patchLabel: ENGINE_V1_LABEL }
  }

  const legal = legalChampionSetForRole(poolKey)
  const un = state.unavailable
  const pool: number[] = []
  for (const c of Array.from(legal)) {
    if (!un.has(c)) {
      pool.push(c)
    }
  }

  const nameOf = (id: number) => resolveChampionName(id, idToName)
  const laneOpp = (() => {
    if (myRole === 'unknown') {
      return null
    }
    const e = state.snapshot.enemy.find((p) => p.role === myRole)
    if (!e?.championId) {
      return null
    }
    return e.championId
  })()

  const nMc = Math.max(0, Math.min(200, monteCarloSamples | 0))
  const useMc = nMc > 0
  const rand = useMc ? mulberry32(rngSeed) : () => 0.5
  const localCell = state.snapshot.localPlayerCellId
  const comfortM = mergedComfort ?? null
  const contextReady = hasBoardContext(state.snapshot, myRole, localCell)

  const rows: Array<{
    c: number
    comp: ReturnType<typeof v1ComponentScores>
    ev?: number
    risk?: number
  }> = []

  for (const c of pool) {
    const comp = v1ComponentScores(c, poolKey, state, idToName, comfortM, trainedEffects, championMetaById)
    if (!useMc) {
      rows.push({ c, comp })
      continue
    }
    const samples: number[] = []
    for (let i = 0; i < nMc; i++) {
      const s0 = cloneWithMyPick(state.snapshot, myRole, localCell, c)
      const done = completeDraftRandomly(s0, state.bans, rand)
      const u2 = buildUnavailableFromSnap(done, state.bans)
      const st: DraftEngineState = {
        ...state,
        snapshot: done,
        lockedChampionPicks: 10,
        unavailable: u2
      }
      samples.push(snapshotValueV1(c, poolKey, st, idToName, comfortM, trainedEffects, championMetaById))
    }
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length
    const v = samples.map((x) => (x - mean) * (x - mean))
    const stdev = Math.sqrt(v.reduce((a, b) => a + b, 0) / Math.max(1, samples.length))
    const comfC = comfortGet(c, comfortM)
    const evBlend = 0.75 * mean + 0.25 * comfC - 0.1 * stdev
    rows.push({ c, comp, ev: evBlend, risk: stdev })
  }

  if (useMc) {
    if (sortBy === 'delta') {
      rows.sort((a, b) => {
        if (!contextReady) {
          return (b.ev ?? 0) - (a.ev ?? 0)
        }
        const aDelta = a.comp.contextCombined - a.comp.base
        const bDelta = b.comp.contextCombined - b.comp.base
        const aPos = aDelta > 0 ? 1 : 0
        const bPos = bDelta > 0 ? 1 : 0
        if (bPos !== aPos) {
          return bPos - aPos
        }
        const aScore = a.ev ?? a.comp.combined
        const bScore = b.ev ?? b.comp.combined
        if (bDelta !== aDelta) {
          return bDelta - aDelta
        }
        return bScore - aScore
      })
    } else {
      rows.sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0))
    }
  } else {
    if (sortBy === 'delta') {
      rows.sort((a, b) => {
        if (!contextReady) {
          return b.comp.combined - a.comp.combined
        }
        const aDelta = a.comp.contextCombined - a.comp.base
        const bDelta = b.comp.contextCombined - b.comp.base
        const aPos = aDelta > 0 ? 1 : 0
        const bPos = bDelta > 0 ? 1 : 0
        if (bPos !== aPos) {
          return bPos - aPos
        }
        if (bDelta !== aDelta) {
          return bDelta - aDelta
        }
        return b.comp.combined - a.comp.combined
      })
    } else {
      rows.sort((a, b) => b.comp.combined - a.comp.combined)
    }
  }

  const deltaOf = (r: (typeof rows)[number]) => r.comp.contextCombined - r.comp.base
  const selectedRows = (() => {
    const n = Math.max(1, Math.trunc(maxResults))
    if (sortBy !== 'delta' || !contextReady) {
      return rows.slice(0, n)
    }
    const byDelta = rows.slice().sort((a, b) => deltaOf(b) - deltaOf(a))
    if (deltaListMode === 'worst') {
      return byDelta.slice().reverse().slice(0, n)
    }
    return byDelta.slice(0, n)
  })()

  const out: PickSuggestion[] = selectedRows.map((it) => {
    const c = it.c
    const comp = it.comp
    const pScore = it.ev != null ? it.ev : comp.combined
    const baseWinRate = contextReady ? comp.base : undefined
    const contextWinRate = contextReady ? comp.contextCombined : undefined
    const winRateDelta = contextReady ? contextWinRate! - baseWinRate! : undefined
    const displayScore = Math.round((1 + winRateToBonus(pScore, useMc ? 2.6 : 3.2)) * 100) / 100
    const reasons: SuggestionReason[] = ['fill_role']
    if (comp.base > 0.51) {
      reasons.push('base_wr')
    }
    if (comp.ally > 0.51) {
      reasons.push('team_synergy')
    }
    if (comp.comp > 0.53) {
      reasons.push('team_synergy')
    }
    if (comp.enemy > 0.51) {
      reasons.push('lane_counter')
    }
    if (laneOpp == null) {
      if (draftPhaseFromLockedPicks(state.lockedChampionPicks) === 'early' && comp.base > 0.515) {
        reasons.push('blind_safe')
      }
    } else if (comp.enemy > 0.52) {
      reasons.push('late_counter')
    }
    if (pScore > 0.51) {
      reasons.push('meta_safe')
    }
    if (useMc && (it.risk ?? 0) < 0.1) {
      reasons.push('meta_safe')
    }
    if (state.myRole === 'support' && [12, 53, 111, 201].includes(c) && comp.ally > 0.5) {
      reasons.push('team_synergy')
    }
    const detailParts = useMc
      ? [
          `V1 ${(comp.combined * 100).toFixed(1)}%`,
          `EV ${((it.ev ?? 0) * 100).toFixed(1)}%`,
          `σ${((it.risk ?? 0) * 100).toFixed(0)}%`,
          laneOpp ? 'lane' : 'blind'
        ]
      : [
          `~${(comp.combined * 100).toFixed(1)}% blend`,
          `b${(comp.base * 100).toFixed(0)}% a${(comp.ally * 100).toFixed(0)}% e${(comp.enemy * 100).toFixed(0)}% c${(comp.comp * 100).toFixed(0)}%`,
          laneOpp ? 'lane' : 'blind'
        ]
    return {
      championId: c,
      championName: nameOf(c),
      score: displayScore,
      baseWinRate: baseWinRate == null ? undefined : Math.round(baseWinRate * 1000) / 1000,
      contextWinRate: contextWinRate == null ? undefined : Math.round(contextWinRate * 1000) / 1000,
      winRateDelta: winRateDelta == null ? undefined : Math.round(winRateDelta * 1000) / 1000,
      estWin: Math.round(pScore * 1000) / 1000,
      lookaheadEV: it.ev,
      lookaheadRisk: it.risk,
      reasons: Array.from(new Set(reasons)),
      runes: runeLoadoutForChampion(c, myRole),
      detail: detailParts.join(' · '),
      buildProfile: getChampionBuildProfile(c, myRole, championMetaById?.get(c) ?? null, nameOf(c))
    }
  })

  const base = useMc ? `${ENGINE_MC_LABEL}(${nMc})` : ENGINE_V1_LABEL
  const patchLabel = trainedEffects && trainedEffects.status.hasAnyData ? `${base}+trained` : base
  return {
    suggestions: out,
    patchLabel
  }
}
