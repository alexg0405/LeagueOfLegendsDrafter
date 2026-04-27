import { MATCHUP_BONUS, ROLE_CHAMPION_POOL } from './matchupData'
import { getChampionThreatOverride } from './championThreatOverrides'
import { resolveChampionName } from './championNameFallback'
import { hardCounterBonusByName } from './hardCounterData'
import { shrunkWinRate } from './shrinkage'

/** Label for the bundled win-rate + shrinkage pick model. */
export const NEXUS_STATS_MODEL_LABEL = 'wr-shrinkage-v1'

const BASE_K = 18
const MATCHUP_K = 24
const PRIOR_50 = 0.5
const BONUS_CLAMP = 8

/**
 * Neutral fallback for champions missing public/trained base data.
 * Real champion strength should come from `publicMetaStatsSeed` or the trained bundle; using
 * champion-id jitter here can create fake outliers in blind drafts.
 */
function defaultBaseWl(championId: number): { w: number; l: number } {
  void championId
  return { w: 50, l: 50 }
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
 * Tuned so explicit hard counters (e.g. +6) can move lane expectation clearly.
 */
function bonusToWl(bonus: number): { w: number; l: number } {
  const t = Math.max(-BONUS_CLAMP, Math.min(BONUS_CLAMP, bonus))
  const p = Math.max(0.22, Math.min(0.78, PRIOR_50 + t * 0.04))
  const n = 52
  const w = Math.round(n * p)
  const l = n - w
  return { w, l }
}

const matchupFromBonusCache = new Map<string, { w: number; l: number }>()
const derivedBonusCache = new Map<string, number>()

type ThreatLabel = 'ad' | 'ap' | 'hybrid' | 'utility'
type ClassLabel = 'fighter' | 'mage' | 'marksman' | 'tank' | 'support' | 'assassin'

function championArchetype(
  championId: number
): { threat: ThreatLabel; classes: Set<ClassLabel> } {
  const name = resolveChampionName(championId, null)
  const ov = getChampionThreatOverride(name)
  if (ov) {
    return {
      threat: ov.threat,
      classes: new Set(ov.classes)
    }
  }
  return {
    threat: 'hybrid',
    classes: new Set<ClassLabel>(['fighter'])
  }
}

/**
 * Dense matchup heuristic used when we don't have explicit pair data.
 * Ensures every curated champion pair still has meaningful directional pressure.
 */
function derivedMatchupBonus(allyId: number, enemyId: number): number {
  const key = `${allyId}:${enemyId}`
  const hit = derivedBonusCache.get(key)
  if (hit != null) {
    return hit
  }
  const a = championArchetype(allyId)
  const e = championArchetype(enemyId)
  let bonus = 0
  bonus += hardCounterBonusByName(resolveChampionName(allyId, null), resolveChampionName(enemyId, null))

  const ah = a.classes
  const eh = e.classes

  // Core class interactions (directional).
  if (ah.has('assassin') && (eh.has('marksman') || eh.has('mage') || eh.has('support'))) {
    bonus += 1.9
  }
  if (eh.has('assassin') && (ah.has('marksman') || ah.has('mage') || ah.has('support'))) {
    bonus -= 1.9
  }
  if (ah.has('tank') && eh.has('assassin')) {
    bonus += 1.5
  }
  if (eh.has('tank') && ah.has('assassin')) {
    bonus -= 1.5
  }
  if (ah.has('marksman') && eh.has('tank')) {
    bonus += 1.1
  }
  if (eh.has('marksman') && ah.has('tank')) {
    bonus -= 1.1
  }
  if (ah.has('fighter') && eh.has('tank')) {
    bonus -= 0.6
  }
  if (eh.has('fighter') && ah.has('tank')) {
    bonus += 0.6
  }
  if (ah.has('mage') && eh.has('fighter')) {
    bonus += 0.7
  }
  if (eh.has('mage') && ah.has('fighter')) {
    bonus -= 0.7
  }

  // Damage profile pressure.
  if (a.threat === 'hybrid' && (e.threat === 'ad' || e.threat === 'ap')) {
    bonus += 0.4
  }
  if (e.threat === 'hybrid' && (a.threat === 'ad' || a.threat === 'ap')) {
    bonus -= 0.4
  }
  if (a.threat === 'utility' && e.threat !== 'utility') {
    bonus -= 0.3
  }
  if (e.threat === 'utility' && a.threat !== 'utility') {
    bonus += 0.3
  }

  // Mild per-id jitter to avoid massive ties in sparse contexts.
  bonus += (((allyId * 31 + enemyId * 17) % 7) - 3) * 0.05

  const out = Math.max(-6, Math.min(6, bonus))
  derivedBonusCache.set(key, out)
  return out
}

export function getMatchupMatchCounts(allyId: number, enemyId: number): { w: number; l: number } | null {
  const a = String(allyId)
  const b = String(enemyId)
  const k = `${a}:${b}`
  const c = matchupFromBonusCache.get(k)
  if (c) {
    return c
  }
  const bonus = MATCHUP_BONUS[a]?.[b]
  const v = bonusToWl(bonus ?? derivedMatchupBonus(allyId, enemyId))
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
