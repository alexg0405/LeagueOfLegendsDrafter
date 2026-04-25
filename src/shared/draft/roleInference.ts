import { ROLE_CHAMPION_POOL } from './matchupData'
import { publicMetaCandidateIdsForRole } from './metaStats'
import type { DraftRole, DraftSnapshot } from './types'

const ROLE_KEYS = ['top', 'jungle', 'middle', 'bottom', 'support'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

type LockedEnemy = {
  idx: number
  championId: number
  slotRole: DraftRole
}

type RolePosterior = Record<RoleKey, number>

const rolePoolSets: Record<RoleKey, Set<number>> = {
  top: new Set([...(ROLE_CHAMPION_POOL.top ?? []), ...publicMetaCandidateIdsForRole('top')]),
  jungle: new Set([...(ROLE_CHAMPION_POOL.jungle ?? []), ...publicMetaCandidateIdsForRole('jungle')]),
  middle: new Set([...(ROLE_CHAMPION_POOL.middle ?? []), ...publicMetaCandidateIdsForRole('middle')]),
  bottom: new Set([...(ROLE_CHAMPION_POOL.bottom ?? []), ...publicMetaCandidateIdsForRole('bottom')]),
  support: new Set([...(ROLE_CHAMPION_POOL.support ?? []), ...publicMetaCandidateIdsForRole('support')])
}

const roleInferenceCache = new WeakMap<DraftSnapshot, Map<number, RolePosterior>>()

function roleLikelihood(championId: number, role: RoleKey): number {
  return rolePoolSets[role].has(championId) ? 1 : 0.02
}

function slotRolePrior(slotRole: DraftRole, role: RoleKey): number {
  if (slotRole === 'unknown') {
    return 1
  }
  if (slotRole === role) {
    return 10
  }
  return 0.05
}

function emptyPosterior(): RolePosterior {
  return { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 }
}

function lockedEnemies(snapshot: DraftSnapshot): LockedEnemy[] {
  const out: LockedEnemy[] = []
  snapshot.enemy.forEach((p, idx) => {
    if (p.championId != null && p.championId > 0) {
      out.push({ idx, championId: p.championId, slotRole: p.role })
    }
  })
  return out
}

/**
 * Bayesian enemy role inference over one-to-one role assignments.
 * Returns per-enemy-slot posterior role probabilities, used to soften lane weighting for flex picks.
 */
export function inferEnemyRolePosteriors(snapshot: DraftSnapshot): Map<number, RolePosterior> {
  const cached = roleInferenceCache.get(snapshot)
  if (cached) {
    return cached
  }
  const locked = lockedEnemies(snapshot)
  const out = new Map<number, RolePosterior>()
  if (locked.length === 0) {
    roleInferenceCache.set(snapshot, out)
    return out
  }

  const assignments: Array<{ roleByIdx: Map<number, RoleKey>; score: number }> = []
  const roleByIdx = new Map<number, RoleKey>()
  const used = new Set<RoleKey>()

  const recur = (i: number, score: number) => {
    if (i >= locked.length) {
      assignments.push({ roleByIdx: new Map(roleByIdx), score })
      return
    }
    const e = locked[i]!
    for (const role of ROLE_KEYS) {
      if (used.has(role)) {
        continue
      }
      const s = score * roleLikelihood(e.championId, role) * slotRolePrior(e.slotRole, role)
      if (!Number.isFinite(s) || s <= 0) {
        continue
      }
      used.add(role)
      roleByIdx.set(e.idx, role)
      recur(i + 1, s)
      roleByIdx.delete(e.idx)
      used.delete(role)
    }
  }
  recur(0, 1)

  let total = assignments.reduce((acc, x) => acc + x.score, 0)
  if (total <= 0) {
    for (const e of locked) {
      const p = emptyPosterior()
      let z = 0
      for (const r of ROLE_KEYS) {
        const s = roleLikelihood(e.championId, r) * slotRolePrior(e.slotRole, r)
        p[r] = s
        z += s
      }
      const den = z > 0 ? z : 1
      for (const r of ROLE_KEYS) {
        p[r] /= den
      }
      out.set(e.idx, p)
    }
    roleInferenceCache.set(snapshot, out)
    return out
  }

  for (const e of locked) {
    out.set(e.idx, emptyPosterior())
  }
  for (const a of assignments) {
    const w = a.score / total
    a.roleByIdx.forEach((role, idx) => {
      const p = out.get(idx)
      if (p) {
        p[role] += w
      }
    })
  }

  total = 0
  out.forEach((p) => {
    total += p.top + p.jungle + p.middle + p.bottom + p.support
  })
  if (!Number.isFinite(total) || total <= 0) {
    out.clear()
  }

  roleInferenceCache.set(snapshot, out)
  return out
}

export function inferredLaneWeightForEnemy(
  posteriors: Map<number, RolePosterior>,
  enemyIdx: number,
  myRole: DraftRole
): number {
  const offRoleFloor = (() => {
    if (myRole === 'top' || myRole === 'middle') {
      return 0.12
    }
    if (myRole === 'jungle') {
      return 0.2
    }
    if (myRole === 'bottom' || myRole === 'support') {
      return 0.18
    }
    return 0.18
  })()
  if (myRole === 'unknown') {
    return offRoleFloor
  }
  const p = posteriors.get(enemyIdx)
  if (!p) {
    return offRoleFloor
  }
  const laneP = p[myRole as RoleKey] ?? 0
  return offRoleFloor + (1 - offRoleFloor) * laneP
}
