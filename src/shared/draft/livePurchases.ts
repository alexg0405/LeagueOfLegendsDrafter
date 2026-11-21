import { isCompletedItem, type AdvisorCatalog } from './liveBuildAdvisor'
import type { LiveGamePlayer, LiveGameSnapshot } from './liveGame'

/**
 * What the enemy team just bought, from successive Live Client snapshots (one every ~2s).
 * The API only gives current inventories, so purchases are inventory diffs.
 */

export type EnemyPurchase = {
  /** Stable React key. */
  id: string
  gameTime: number
  championName: string
  championKey: string | null
  championId: number | null
  itemId: number
  /** Legendary, tier-2+ boots or support upgrade, as opposed to a component. */
  finished: boolean
}

const TRINKET_OR_WARD = new Set([2055, 3340, 3363, 3364, 3330, 3513])

function playerKey(player: LiveGamePlayer): string {
  return `${player.team}:${player.championKey ?? player.championName}`
}

function counts(player: LiveGamePlayer): Map<number, number> {
  const out = new Map<number, number>()
  for (const item of player.items) {
    out.set(item.itemId, (out.get(item.itemId) ?? 0) + Math.max(1, item.count))
  }
  return out
}

/** Purchases worth reporting: not potions, wards, trinkets or anything else consumable. */
function isReportable(itemId: number, catalog: AdvisorCatalog): boolean {
  if (TRINKET_OR_WARD.has(itemId)) {
    return false
  }
  const item = catalog.get(itemId)
  if (!item) {
    return false
  }
  return item.consumed !== true && !item.tags.some((tag) => ['consumable', 'trinket'].includes(tag.toLowerCase())) && item.gold.total > 0
}

function enemiesOf(snapshot: LiveGameSnapshot): LiveGamePlayer[] {
  // Spectating has no "us": report both teams.
  return snapshot.activeTeam ? snapshot.players.filter((p) => p.team !== snapshot.activeTeam) : snapshot.players
}

/**
 * New enemy items between two snapshots. Returns nothing for the first snapshot (or a new
 * game), so opening the overlay mid-game does not replay everyone's whole inventory.
 */
export function diffEnemyPurchases(
  prev: LiveGameSnapshot | null,
  next: LiveGameSnapshot,
  catalog: AdvisorCatalog
): EnemyPurchase[] {
  if (!prev || next.gameTime < prev.gameTime) {
    return []
  }
  const before = new Map(enemiesOf(prev).map((p) => [playerKey(p), counts(p)] as const))
  const out: EnemyPurchase[] = []
  for (const player of enemiesOf(next)) {
    const had = before.get(playerKey(player))
    if (!had) {
      continue
    }
    for (const [itemId, n] of Array.from(counts(player))) {
      const added = n - (had.get(itemId) ?? 0)
      if (added <= 0 || !isReportable(itemId, catalog)) {
        continue
      }
      for (let i = 0; i < added; i += 1) {
        out.push({
          id: `${playerKey(player)}:${itemId}:${next.gameTime}:${i}`,
          gameTime: next.gameTime,
          championName: player.championName,
          championKey: player.championKey,
          championId: player.championId,
          itemId,
          finished: isCompletedItem(catalog.get(itemId), itemId)
        })
      }
    }
  }
  // Finished items first: "Zed finished Edge of Night" matters more than a component.
  return out.sort((a, b) => Number(b.finished) - Number(a.finished))
}

/** Newest first, capped, and only from the current game. */
export function mergePurchaseFeed(feed: readonly EnemyPurchase[], fresh: readonly EnemyPurchase[], limit = 8): EnemyPurchase[] {
  return [...fresh, ...feed].slice(0, limit)
}
