import { ROLE_CHAMPION_POOL } from './matchupData'
import { publicMetaCandidateIdsForRole, publicMetaRoleDistributionForChampion } from './metaStats'
import type { DraftRole, DraftSnapshot, EnemyRoleInference, RoleProbabilityMap } from './types'

const ROLE_KEYS = ['top', 'jungle', 'middle', 'bottom', 'support'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

type LockedEnemy = {
  idx: number
  championId: number
  slotRole: DraftRole
}

type RolePosterior = Record<RoleKey, number>

let roleInferenceCache = new WeakMap<DraftSnapshot, Map<number, RolePosterior>>()
let roleAssignmentCache = new WeakMap<DraftSnapshot, EnemyRoleInference[]>()

export function rolePoolHas(role: RoleKey, championId: number): boolean {
  return (ROLE_CHAMPION_POOL[role] ?? []).includes(championId) || publicMetaCandidateIdsForRole(role).includes(championId)
}

export function clearEnemyRoleInferenceCaches(): void {
  roleInferenceCache = new WeakMap<DraftSnapshot, Map<number, RolePosterior>>()
  roleAssignmentCache = new WeakMap<DraftSnapshot, EnemyRoleInference[]>()
}

function roleLikelihood(championId: number, role: RoleKey): number {
  const metaP = publicMetaRoleDistributionForChampion(championId)[role] ?? 0
  if (metaP > 0) {
    return 0.04 + metaP
  }
  return rolePoolHas(role, championId) ? 0.22 : 0.015
}

function assignmentScore(enemy: LockedEnemy, role: RoleKey): number {
  let likelihood = roleLikelihood(enemy.championId, role)
  if (enemy.slotRole === role) {
    likelihood = Math.max(likelihood, 0.08)
  }
  return likelihood * slotRolePrior(enemy.slotRole, role)
}

function slotRolePrior(slotRole: DraftRole, role: RoleKey): number {
  if (slotRole === 'unknown') {
    return 1
  }
  if (slotRole === role) {
    return 20
  }
  return 0.3
}

function emptyPosterior(): RolePosterior {
  return { top: 0, jungle: 0, middle: 0, bottom: 0, support: 0 }
}

function normalizePosterior(p: RolePosterior): RolePosterior {
  const total = p.top + p.jungle + p.middle + p.bottom + p.support
  if (!Number.isFinite(total) || total <= 0) {
    return { top: 0.2, jungle: 0.2, middle: 0.2, bottom: 0.2, support: 0.2 }
  }
  return {
    top: p.top / total,
    jungle: p.jungle / total,
    middle: p.middle / total,
    bottom: p.bottom / total,
    support: p.support / total
  }
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
      const s = score * assignmentScore(e, role)
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
        const s = assignmentScore(e, r)
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

  out.forEach((p, idx) => {
    out.set(idx, normalizePosterior(p))
  })

  roleInferenceCache.set(snapshot, out)
  return out
}

function confidenceLabel(confidence: number): EnemyRoleInference['confidenceLabel'] {
  if (confidence >= 0.75) {
    return 'likely'
  }
  if (confidence >= 0.45) {
    return 'flex'
  }
  return 'uncertain'
}

function bestRole(p: RolePosterior): { role: RoleKey; confidence: number } {
  return ROLE_KEYS.map((role) => ({ role, confidence: p[role] }))
    .sort((a, b) => b.confidence - a.confidence)[0]!
}

function roundedProbabilities(p: RolePosterior): RoleProbabilityMap {
  return {
    top: Math.round(p.top * 1000) / 1000,
    jungle: Math.round(p.jungle * 1000) / 1000,
    middle: Math.round(p.middle * 1000) / 1000,
    bottom: Math.round(p.bottom * 1000) / 1000,
    support: Math.round(p.support * 1000) / 1000
  }
}

export function inferEnemyRoleAssignments(snapshot: DraftSnapshot): EnemyRoleInference[] {
  const cached = roleAssignmentCache.get(snapshot)
  if (cached) {
    return cached
  }
  const posteriors = inferEnemyRolePosteriors(snapshot)
  const out = lockedEnemies(snapshot).flatMap((enemy): EnemyRoleInference[] => {
    const posterior = posteriors.get(enemy.idx)
    if (!posterior) {
      return []
    }
    const best = bestRole(posterior)
    const confidence = Math.round(best.confidence * 1000) / 1000
    return [
      {
        enemyIndex: enemy.idx,
        cellId: snapshot.enemy[enemy.idx]?.cellId ?? null,
        championId: enemy.championId,
        assignedRole: enemy.slotRole,
        inferredRole: best.role,
        confidence,
        confidenceLabel: confidenceLabel(confidence),
        roleProbabilities: roundedProbabilities(posterior)
      }
    ]
  })
  roleAssignmentCache.set(snapshot, out)
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
