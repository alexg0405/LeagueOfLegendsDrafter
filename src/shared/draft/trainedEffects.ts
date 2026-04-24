/**
 * Parser + compiler for `training/runtime/effects_id.json` (schema `nexus_effects_v1`).
 *
 * The raw bundle is nested by patch × queue × tier × role (× champion × [opponent|role×partner]).
 * We collapse it into **flat, fast-lookup** maps by picking the **most recent patch** per key
 * (ascending semver-ish sort, later writes win). This gives a single trained baseline per
 * (role, champion) instead of forcing the UI to select a specific patch bucket.
 *
 * Values are logit deltas from a 0.5 prior (see `training/etl/aggregate_effects.py`):
 *     p_trained = sigmoid(delta)                              // since logit(0.5) = 0
 *
 * The engine falls back to bundled heuristics whenever a key is missing (sparse early data).
 */

import type { DraftRole } from './types'

export type TrainedEffectsStatus = {
  schemaVersion: number
  exportedAt: string | null
  /** Number of distinct (queue, tier, role, champion) cells with a trained base rate. */
  basePairs: number
  /** Distinct (role, ally, enemy) cells with a trained matchup rate. */
  matchupPairs: number
  /** Distinct (roleA, roleB, championA, championB) cells with a trained synergy value. */
  synergyPairs: number
  /** Patches seen across all sub-bundles, sorted oldest → newest. */
  patchesSeen: string[]
  /** True if any base/matchup/synergy table had at least one usable row. */
  hasAnyData: boolean
}

export type CompiledTrainedEffects = {
  status: TrainedEffectsStatus
  /** role → championId → logit delta (float) */
  base: Record<RoleKey, Map<number, number>>
  /** role → allyId → enemyId → logit delta */
  matchup: Record<RoleKey, Map<number, Map<number, number>>>
  /** roleA → roleB → allyAId → partnerBId → logit delta */
  synergy: Record<RoleKey, Record<RoleKey, Map<number, Map<number, number>>>>
  /** Per-champion comfort (0..1) merged from `comfortByChampionId` in the bundle. */
  comfort: Map<number, number>
  /** Lookups: id → display name. */
  idToName: Map<number, string>
}

const ROLE_KEYS = ['top', 'jungle', 'middle', 'bottom', 'support'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

/** Accept both LCU-style ("bottom", "support") and aggregate-style ("adc", "sup") role tokens. */
const ROLE_TOKEN_TO_KEY: Record<string, RoleKey> = {
  top: 'top',
  jungle: 'jungle',
  jungler: 'jungle',
  mid: 'middle',
  middle: 'middle',
  adc: 'bottom',
  bottom: 'bottom',
  bot: 'bottom',
  sup: 'support',
  supp: 'support',
  utility: 'support',
  support: 'support'
}

export function normalizeRoleKey(token: string): RoleKey | null {
  const k = (token || '').trim().toLowerCase()
  return ROLE_TOKEN_TO_KEY[k] ?? null
}

/** Map a `DraftRole` to our internal key (returns null for `unknown`). */
export function draftRoleToKey(role: DraftRole): RoleKey | null {
  if (role === 'unknown') {
    return null
  }
  return role as RoleKey
}

/** Logistic function used to turn exported logit deltas back into win-rate proxies. */
export function sigmoid(x: number): number {
  if (!Number.isFinite(x)) {
    return 0.5
  }
  if (x > 50) {
    return 1
  }
  if (x < -50) {
    return 0
  }
  const e = Math.exp(x)
  return e / (1 + e)
}

/**
 * Sort patch labels like "15.19", "16.1", "16.20" numerically, stable on non-numeric tokens.
 * Unknown tokens sort to the end so unknown-patch writes win last (safe default).
 */
function comparePatchLabels(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseFloat(x))
  const pb = b.split('.').map((x) => parseFloat(x))
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const ai = pa[i]
    const bi = pb[i]
    const av = ai != null && Number.isFinite(ai) ? ai : Number.POSITIVE_INFINITY
    const bv = bi != null && Number.isFinite(bi) ? bi : Number.POSITIVE_INFINITY
    if (av !== bv) {
      return av - bv
    }
  }
  return 0
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function emptyCompiled(): CompiledTrainedEffects {
  return {
    status: {
      schemaVersion: 0,
      exportedAt: null,
      basePairs: 0,
      matchupPairs: 0,
      synergyPairs: 0,
      patchesSeen: [],
      hasAnyData: false
    },
    base: Object.fromEntries(ROLE_KEYS.map((r) => [r, new Map<number, number>()])) as Record<RoleKey, Map<number, number>>,
    matchup: Object.fromEntries(ROLE_KEYS.map((r) => [r, new Map<number, Map<number, number>>()])) as Record<
      RoleKey,
      Map<number, Map<number, number>>
    >,
    synergy: Object.fromEntries(
      ROLE_KEYS.map((r) => [r, Object.fromEntries(ROLE_KEYS.map((r2) => [r2, new Map<number, Map<number, number>>()]))])
    ) as Record<RoleKey, Record<RoleKey, Map<number, Map<number, number>>>>,
    comfort: new Map<number, number>(),
    idToName: new Map<number, string>()
  }
}

function parseChampionIdKey(k: string): number | null {
  if (!k) {
    return null
  }
  const n = Number(k)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Compile the raw JSON bundle into flat maps. Returns `null` when the input is not
 * a `nexus_effects_v1` bundle — never throws (callers treat `null` as "no trained effects").
 */
export function compileTrainedEffects(raw: unknown): CompiledTrainedEffects | null {
  if (!isRecord(raw)) {
    return null
  }
  const schema = typeof raw.schema === 'string' ? raw.schema : ''
  if (schema !== 'nexus_effects_v1') {
    return null
  }
  const out = emptyCompiled()
  out.status.schemaVersion = 1
  if (isRecord(raw.meta) && typeof raw.meta.exportedAt === 'string') {
    out.status.exportedAt = raw.meta.exportedAt
  }

  const championById = isRecord(raw.championById) ? raw.championById : null
  if (championById) {
    for (const [idStr, meta] of Object.entries(championById)) {
      const id = parseChampionIdKey(idStr)
      if (id == null || !isRecord(meta)) {
        continue
      }
      const nm = typeof meta.name === 'string' ? meta.name : null
      if (nm) {
        out.idToName.set(id, nm)
      }
    }
  }

  const comfort = isRecord(raw.comfortByChampionId) ? raw.comfortByChampionId : null
  if (comfort) {
    for (const [k, v] of Object.entries(comfort)) {
      const id = parseChampionIdKey(k)
      if (id == null || typeof v !== 'number' || !Number.isFinite(v)) {
        continue
      }
      out.comfort.set(id, Math.max(0, Math.min(1, v)))
    }
  }

  const patches = new Set<string>()

  const logitBase = isRecord(raw.logit_base) ? raw.logit_base : null
  if (logitBase) {
    const sortedPatches = Object.keys(logitBase).sort(comparePatchLabels)
    for (const patch of sortedPatches) {
      patches.add(patch)
      const byQueue = logitBase[patch]
      if (!isRecord(byQueue)) {
        continue
      }
      for (const byTier of Object.values(byQueue)) {
        if (!isRecord(byTier)) {
          continue
        }
        for (const byRole of Object.values(byTier)) {
          if (!isRecord(byRole)) {
            continue
          }
          for (const [roleTok, byChamp] of Object.entries(byRole)) {
            const role = normalizeRoleKey(roleTok)
            if (role == null || !isRecord(byChamp)) {
              continue
            }
            const bucket = out.base[role]
            for (const [cidStr, val] of Object.entries(byChamp)) {
              const cid = parseChampionIdKey(cidStr)
              if (cid == null || typeof val !== 'number' || !Number.isFinite(val)) {
                continue
              }
              bucket.set(cid, val)
            }
          }
        }
      }
    }
  }

  const logitMatchup = isRecord(raw.logit_matchup) ? raw.logit_matchup : null
  if (logitMatchup) {
    const sortedPatches = Object.keys(logitMatchup).sort(comparePatchLabels)
    for (const patch of sortedPatches) {
      patches.add(patch)
      const byQueue = logitMatchup[patch]
      if (!isRecord(byQueue)) {
        continue
      }
      for (const byTier of Object.values(byQueue)) {
        if (!isRecord(byTier)) {
          continue
        }
        for (const byRole of Object.values(byTier)) {
          if (!isRecord(byRole)) {
            continue
          }
          for (const [roleTok, byAlly] of Object.entries(byRole)) {
            const role = normalizeRoleKey(roleTok)
            if (role == null || !isRecord(byAlly)) {
              continue
            }
            const roleMap = out.matchup[role]
            for (const [allyStr, byEnemy] of Object.entries(byAlly)) {
              const allyId = parseChampionIdKey(allyStr)
              if (allyId == null || !isRecord(byEnemy)) {
                continue
              }
              let enemyMap = roleMap.get(allyId)
              if (!enemyMap) {
                enemyMap = new Map<number, number>()
                roleMap.set(allyId, enemyMap)
              }
              for (const [enemyStr, val] of Object.entries(byEnemy)) {
                const enemyId = parseChampionIdKey(enemyStr)
                if (enemyId == null || typeof val !== 'number' || !Number.isFinite(val)) {
                  continue
                }
                enemyMap.set(enemyId, val)
              }
            }
          }
        }
      }
    }
  }

  const logitSynergy = isRecord(raw.logit_synergy) ? raw.logit_synergy : null
  if (logitSynergy) {
    const sortedPatches = Object.keys(logitSynergy).sort(comparePatchLabels)
    for (const patch of sortedPatches) {
      patches.add(patch)
      const byQueue = logitSynergy[patch]
      if (!isRecord(byQueue)) {
        continue
      }
      for (const byTier of Object.values(byQueue)) {
        if (!isRecord(byTier)) {
          continue
        }
        for (const byRoleA of Object.values(byTier)) {
          if (!isRecord(byRoleA)) {
            continue
          }
          for (const [roleATok, byRoleB] of Object.entries(byRoleA)) {
            const roleA = normalizeRoleKey(roleATok)
            if (roleA == null || !isRecord(byRoleB)) {
              continue
            }
            for (const [roleBTok, byChampA] of Object.entries(byRoleB)) {
              const roleB = normalizeRoleKey(roleBTok)
              if (roleB == null || !isRecord(byChampA)) {
                continue
              }
              const bucket = out.synergy[roleA][roleB]
              for (const [champAStr, byChampB] of Object.entries(byChampA)) {
                const champA = parseChampionIdKey(champAStr)
                if (champA == null || !isRecord(byChampB)) {
                  continue
                }
                let inner = bucket.get(champA)
                if (!inner) {
                  inner = new Map<number, number>()
                  bucket.set(champA, inner)
                }
                for (const [champBStr, val] of Object.entries(byChampB)) {
                  const champB = parseChampionIdKey(champBStr)
                  if (champB == null || typeof val !== 'number' || !Number.isFinite(val)) {
                    continue
                  }
                  inner.set(champB, val)
                }
              }
            }
          }
        }
      }
    }
  }

  out.status.patchesSeen = Array.from(patches).sort(comparePatchLabels)

  let basePairs = 0
  for (const r of ROLE_KEYS) {
    basePairs += out.base[r].size
  }
  out.status.basePairs = basePairs

  let matchupPairs = 0
  for (const r of ROLE_KEYS) {
    out.matchup[r].forEach((inner) => {
      matchupPairs += inner.size
    })
  }
  out.status.matchupPairs = matchupPairs

  let synergyPairs = 0
  for (const rA of ROLE_KEYS) {
    for (const rB of ROLE_KEYS) {
      out.synergy[rA][rB].forEach((inner) => {
        synergyPairs += inner.size
      })
    }
  }
  out.status.synergyPairs = synergyPairs

  out.status.hasAnyData = basePairs + matchupPairs + synergyPairs > 0

  return out
}

/** Trained base win-rate proxy for `(role, championId)` or null if untrained. */
export function trainedBaseRate(
  eff: CompiledTrainedEffects | null,
  role: DraftRole,
  championId: number
): number | null {
  if (!eff) {
    return null
  }
  const k = draftRoleToKey(role)
  if (!k) {
    return null
  }
  const v = eff.base[k].get(championId)
  if (v == null) {
    return null
  }
  return sigmoid(v)
}

/** Trained ally-vs-enemy lane rate for your `role` or null when we do not have both sides trained. */
export function trainedLaneRate(
  eff: CompiledTrainedEffects | null,
  role: DraftRole,
  allyId: number,
  enemyId: number
): number | null {
  if (!eff) {
    return null
  }
  const k = draftRoleToKey(role)
  if (!k) {
    return null
  }
  const v = eff.matchup[k].get(allyId)?.get(enemyId)
  if (v == null) {
    return null
  }
  return sigmoid(v)
}

/** Trained synergy bonus (logit delta) for `(allyRole, partnerRole, allyId, partnerId)`. */
export function trainedSynergyDelta(
  eff: CompiledTrainedEffects | null,
  allyRole: DraftRole,
  partnerRole: DraftRole,
  allyId: number,
  partnerId: number
): number | null {
  if (!eff) {
    return null
  }
  const rA = draftRoleToKey(allyRole)
  const rB = draftRoleToKey(partnerRole)
  if (!rA || !rB) {
    return null
  }
  const v = eff.synergy[rA][rB].get(allyId)?.get(partnerId)
  if (v == null) {
    return null
  }
  return v
}
