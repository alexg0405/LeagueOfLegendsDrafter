import { MATCHUP_BONUS, ROLE_CHAMPION_POOL } from './matchupData'
import { shrunkWinRate } from './shrinkage'

/** Label for the bundled win-rate + shrinkage pick model. */
export const NEXUS_STATS_MODEL_LABEL = 'wr-shrinkage-v1'

const BASE_K = 18
const MATCHUP_K = 24
const PRIOR_50 = 0.5

/** Plausible base lane strength for champions in the curated pool (not live Riot data). */
function defaultBaseWl(championId: number): { w: number; l: number } {
  const t = (championId % 13) - 6
  const w = 52 + t
  const l = 100 - w
  return { w, l }
}

const baseCache = new Map<string, { w: number; l: number }>()

export function getBaseMatchCounts(role: keyof typeof ROLE_CHAMPION_POOL, championId: number): { w: number; l: number } {
  const k = `${role}:${championId}`
  const hit = baseCache.get(k)
  if (hit) {
    return hit
  }
  if (!ROLE_CHAMPION_POOL[role]?.includes(championId)) {
    const v = { w: 50, l: 50 }
    baseCache.set(k, v)
    return v
  }
  const v = defaultBaseWl(championId)
  baseCache.set(k, v)
  return v
}

/**
 * Map community matchup bonus → pseudo W/L for Beta shrinkage.
 * Tuned so typical bonuses (±0.5–2) move shrunk rates modestly.
 */
function bonusToWl(bonus: number): { w: number; l: number } {
  const t = Math.max(-2.5, Math.min(2.5, bonus))
  const p = PRIOR_50 + t * 0.018
  const n = 28
  const w = Math.round(n * p)
  const l = n - w
  return { w, l }
}

const matchupFromBonusCache = new Map<string, { w: number; l: number }>()

export function getMatchupMatchCounts(allyId: number, enemyId: number): { w: number; l: number } | null {
  const a = String(allyId)
  const b = String(enemyId)
  const k = `${a}:${b}`
  const c = matchupFromBonusCache.get(k)
  if (c) {
    return c
  }
  const bonus = MATCHUP_BONUS[a]?.[b]
  if (bonus == null) {
    return null
  }
  const v = bonusToWl(bonus)
  matchupFromBonusCache.set(k, v)
  return v
}

export function shrunkBaseRate(role: keyof typeof ROLE_CHAMPION_POOL, championId: number): number {
  const { w, l } = getBaseMatchCounts(role, championId)
  return shrunkWinRate(w, l, { k: BASE_K, prior: PRIOR_50 })
}

export function shrunkLaneRate(allyId: number, enemyId: number): number | null {
  const raw = getMatchupMatchCounts(allyId, enemyId)
  if (!raw) {
    return null
  }
  return shrunkWinRate(raw.w, raw.l, { k: MATCHUP_K, prior: PRIOR_50 })
}

export type DraftPhase = 'early' | 'mid' | 'late'

export function draftPhaseFromLockedPicks(locked: number): DraftPhase {
  if (locked < 3) {
    return 'early'
  }
  if (locked < 6) {
    return 'mid'
  }
  return 'late'
}

export function countLockedPicks(
  side: { championId: number | null; role: unknown }[] | null | undefined
): number {
  if (!side) {
    return 0
  }
  return side.filter((p) => p.championId != null && p.championId > 0).length
}
