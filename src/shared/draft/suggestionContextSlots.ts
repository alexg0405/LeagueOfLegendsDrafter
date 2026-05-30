import { MATCHUP_BONUS } from './matchupData'
import { ALLY_SYNERGY_BONUS } from './synergyData'
import { publicMetaLaneRate, publicMetaCandidateIdsForRole } from './metaStats'
import { trainedSynergyDelta, type CompiledTrainedEffects } from './trainedEffects'
import { shrunkLaneRate } from './statsModel'
import type { DraftRole, RoleProbabilityMap } from './types'

/**
 * Aligned with overlay “Synergy / Good vs” context (ranked locked allies/enemies for a pick candidate).
 */
export type SuggestionContextSlot = {
  role: DraftRole
  championName: string | null
  championId: number | null
  inferredRole?: DraftRole | null
  roleProbabilities?: RoleProbabilityMap | null
}

const ROLE_FOCUS: Record<Exclude<DraftRole, 'unknown'>, { ally: DraftRole[]; enemy: DraftRole[] }> = {
  top: {
    ally: ['jungle', 'middle', 'support', 'bottom', 'top'],
    enemy: ['top', 'jungle', 'middle', 'support', 'bottom']
  },
  jungle: {
    ally: ['middle', 'support', 'top', 'bottom', 'jungle'],
    enemy: ['jungle', 'middle', 'support', 'top', 'bottom']
  },
  middle: {
    ally: ['jungle', 'support', 'top', 'bottom', 'middle'],
    enemy: ['middle', 'jungle', 'support', 'top', 'bottom']
  },
  bottom: {
    ally: ['support', 'jungle', 'middle', 'top', 'bottom'],
    enemy: ['bottom', 'support', 'jungle', 'middle', 'top']
  },
  support: {
    ally: ['bottom', 'jungle', 'middle', 'top', 'support'],
    enemy: ['support', 'bottom', 'jungle', 'middle', 'top']
  }
}

function filledSlots(slots: SuggestionContextSlot[], limit = 2): SuggestionContextSlot[] {
  return slots.filter((p) => p.championId != null && p.championId > 0).slice(0, limit)
}

function focusedSlots(
  slots: SuggestionContextSlot[],
  role: DraftRole | null,
  side: 'ally' | 'enemy',
  limit = 2
): SuggestionContextSlot[] {
  if (!role || role === 'unknown') {
    return filledSlots(slots, limit)
  }
  const preferredRoles = ROLE_FOCUS[role as Exclude<DraftRole, 'unknown'>]?.[side] ?? []
  const filled = slots.filter((p) => p.championId != null && p.championId > 0)
  const ordered =
    side === 'enemy'
      ? [...filled].sort((a, b) => {
          const aP = a.roleProbabilities?.[role as Exclude<DraftRole, 'unknown'>] ?? (a.role === role ? 1 : 0)
          const bP = b.roleProbabilities?.[role as Exclude<DraftRole, 'unknown'>] ?? (b.role === role ? 1 : 0)
          return bP - aP
        })
      : [
          ...preferredRoles.flatMap((r) => filled.filter((slot) => slot.role === r)),
          ...filled.filter((slot) => !preferredRoles.includes(slot.role as DraftRole))
        ]
  return ordered.slice(0, limit)
}

function legacyEnemyPFromBonus(bonus: number | null): number {
  if (bonus == null) {
    return 0.5
  }
  return Math.max(0.35, Math.min(0.68, 0.5 + 0.03 * Math.max(-6, Math.min(6, bonus))))
}

export function bestEnemySlotsForSuggestion(
  candidateId: number,
  role: DraftRole | null,
  enemySlots: SuggestionContextSlot[],
  limit = 2
): SuggestionContextSlot[] {
  const lockedEnemies = enemySlots.filter((slot) => slot.championId != null && slot.championId > 0)
  if (lockedEnemies.length === 0) {
    return []
  }
  return lockedEnemies
    .map((slot) => {
      const enemyId = slot.championId!
      const metaRate = role ? publicMetaLaneRate(role, candidateId, enemyId) : null
      const laneRate = shrunkLaneRate(candidateId, enemyId)
      const bonus = MATCHUP_BONUS[String(candidateId)]?.[String(enemyId)] ?? null
      const fallbackRate = laneRate ?? legacyEnemyPFromBonus(bonus)
      const laneP =
        role && role !== 'unknown'
          ? slot.roleProbabilities?.[role as Exclude<DraftRole, 'unknown'>] ?? (slot.role === role ? 1 : 0.2)
          : 0.2
      const score = ((metaRate ?? fallbackRate) - 0.5) * (0.35 + laneP * 0.65) + laneP * 0.03
      return { slot, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.slot)
}

export function bestAllySlotsForSuggestion(
  candidateId: number,
  role: DraftRole | null,
  allySlots: SuggestionContextSlot[],
  trained: CompiledTrainedEffects | null,
  limit = 2
): SuggestionContextSlot[] {
  const lockedAllies = allySlots.filter((slot) => slot.championId != null && slot.championId > 0)
  if (lockedAllies.length === 0) {
    return []
  }
  return lockedAllies
    .map((slot) => {
      const allyId = slot.championId!
      const heuristicBonus = ALLY_SYNERGY_BONUS[String(candidateId)]?.[String(allyId)] ?? ALLY_SYNERGY_BONUS[String(allyId)]?.[String(candidateId)] ?? 0
      const trainedDelta = role && slot.role !== 'unknown' ? trainedSynergyDelta(trained, role, slot.role, candidateId, allyId) : null
      const score = trainedDelta ?? heuristicBonus * 0.04
      /** If every pair ties at 0, order still depends on the suggested pick so the UI can vary per card (web has no trained effects). */
      const tie = (candidateId * 0x1f_8d_2f_49 + allyId) >>> 0
      return { slot, score, tie }
    })
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .slice(0, limit)
    .map((x) => x.slot)
}

export { focusedSlots as focusedContextSlots, filledSlots as filledContextSlots, ROLE_FOCUS as SUGGESTION_ROLE_FOCUS }
