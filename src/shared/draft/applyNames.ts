import { resolveChampionName } from './championNameFallback'
import type { DraftSnapshot, SlotPick } from './types'

function isGenericChampionName(name: string): boolean {
  return /^champion\s+\d+$/i.test(name.trim())
}

function mapSlot(s: SlotPick, idToName: ReadonlyMap<number, string> | null): SlotPick {
  if (s.championId == null || s.championId === 0) {
    return s
  }
  const fromMap = idToName?.get(s.championId)
  if (fromMap) {
    return { ...s, championName: fromMap }
  }
  if (s.championName && !isGenericChampionName(s.championName)) {
    return s
  }
  return { ...s, championName: resolveChampionName(s.championId, null) }
}

export function applyChampionNames(
  snap: DraftSnapshot,
  idToName: ReadonlyMap<number, string> | null
): DraftSnapshot {
  return {
    ...snap,
    ally: snap.ally.map((s) => mapSlot(s, idToName)),
    enemy: snap.enemy.map((s) => mapSlot(s, idToName))
  }
}
