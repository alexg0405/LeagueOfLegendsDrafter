import { ROLE_CHAMPION_POOL } from './matchupData'
import type { DraftRole, DraftSnapshot, TeamId } from './types'

/** Tier / MMR bucket for future trained models. */
export type DraftTier = 'all' | 'diamond_plus' | 'emerald' | 'gold'

/**
 * Full draft context for the decision engine. Built from a snapshot + LCU/ban/pick metadata.
 * "Locked" means champion id is set on a slot; flex ambiguity is a known limitation (see engine docs).
 */
export type DraftEngineState = {
  snapshot: DraftSnapshot
  /** Role used to filter the legal pool. */
  myRole: DraftRole
  /** Bans (both teams), deduped. */
  bans: number[]
  /** Unavailable: bans ∪ every locked pick on the board. */
  unavailable: Set<number>
  /** Blue (100) or red (200). */
  myTeam: TeamId | null
  /**
   * Best-effort 1-based order of your next pick in the *pick* round (not ban).
   * Null when unknown. Used for blind-safety only.
   */
  myPickOrder: number | null
  /**
   * Count of champs already locked (both teams). Drives "draft maturity" without LCU.
   */
  lockedChampionPicks: number
  dataDragonVersion: string | null
  tier: DraftTier
  /** Same label as in stats model / patch. */
  patch: string
}

export function collectLockedChampionIds(s: DraftSnapshot | null): Set<number> {
  const out = new Set<number>()
  if (!s) {
    return out
  }
  for (const p of [...s.ally, ...s.enemy]) {
    if (p.championId != null && p.championId > 0) {
      out.add(p.championId)
    }
  }
  return out
}

function dedupeBans(a: number[]): number[] {
  return Array.from(new Set(a.filter((x) => typeof x === 'number' && x > 0)))
}

export function buildEngineState(
  snapshot: DraftSnapshot,
  myRole: DraftRole,
  opts: {
    bans: number[] | null | undefined
    myPickOrder: number | null | undefined
    dataDragonVersion: string | null
    tier?: DraftTier
    patch: string
  }
): DraftEngineState {
  const banList = dedupeBans([...(opts.bans ?? [])])
  const locked = collectLockedChampionIds(snapshot)
  const unavailable = new Set([...banList, ...Array.from(locked)])
  let lockedPicks = 0
  for (const p of [...snapshot.ally, ...snapshot.enemy]) {
    if (p.championId != null && p.championId > 0) {
      lockedPicks += 1
    }
  }
  return {
    snapshot,
    myRole,
    bans: banList,
    unavailable,
    myTeam: snapshot.myTeam,
    myPickOrder: opts.myPickOrder ?? null,
    lockedChampionPicks: lockedPicks,
    dataDragonVersion: opts.dataDragonVersion,
    tier: opts.tier ?? 'all',
    patch: opts.patch
  }
}

/**
 * Every champion id that can be played in `role` in our metadata (pools, etc.).
 * Flex appearing in two pools is fine — Set dedupes.
 */
export function legalChampionSetForRole(role: keyof typeof ROLE_CHAMPION_POOL | null): Set<number> {
  const s = new Set<number>()
  if (role == null) {
    return s
  }
  for (const id of ROLE_CHAMPION_POOL[role] ?? []) {
    s.add(id)
  }
  return s
}
