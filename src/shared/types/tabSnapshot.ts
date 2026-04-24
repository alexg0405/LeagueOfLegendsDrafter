/**
 * Result of a full-Tab / scoreboard pass (per champion row) — to be filled by vision.
 */
export type ItemSlotId = number | null

export type TabChampionRow = {
  team: 'ally' | 'enemy'
  championKey: string | null
  level: number | null
  itemIds: ItemSlotId[]
  confidence: number
}

export type TabSnapshot = {
  capturedAt: number
  gameTimeHintSec: number | null
  rows: TabChampionRow[]
  parseConfidence: number
}

export function emptyTabSnapshot(): TabSnapshot {
  return {
    capturedAt: Date.now(),
    gameTimeHintSec: null,
    rows: [],
    parseConfidence: 0
  }
}
