import { describe, expect, it } from 'vitest'
import type { AdvisorItem } from './liveBuildAdvisor'
import type { LiveGamePlayer, LiveGameSnapshot } from './liveGame'
import { diffEnemyPurchases, mergePurchaseFeed } from './livePurchases'

function item(id: number, name: string, total: number, extra: Partial<AdvisorItem> = {}): AdvisorItem {
  return { id, name, tags: [], stats: {}, gold: { base: total, total, purchasable: true }, ...extra }
}

const catalog = new Map(
  [
    item(1036, 'Long Sword', 350, { into: ['3134'] }),
    item(3134, 'Serrated Dirk', 1000, { from: ['1036', '1036'], into: ['3142'] }),
    item(3142, "Youmuu's Ghostblade", 2800, { from: ['3134'] }),
    item(3814, 'Edge of Night', 3000),
    item(2003, 'Health Potion', 50, { consumed: true, tags: ['Consumable'] }),
    item(3340, 'Stealth Ward', 0, { tags: ['Trinket'] }),
    item(3047, 'Plated Steelcaps', 1200, { tags: ['Boots'] })
  ].map((row) => [row.id, row])
)

function player(name: string, team: 'ORDER' | 'CHAOS', items: number[], extra: Partial<LiveGamePlayer> = {}): LiveGamePlayer {
  return {
    championKey: name,
    championName: name,
    championId: null,
    team,
    role: 'unknown',
    level: 10,
    kills: 0,
    deaths: 0,
    assists: 0,
    creepScore: 0,
    wardScore: 0,
    items: items.map((itemId, slot) => ({ itemId, name: String(itemId), count: 1, slot })),
    isActive: false,
    isBot: false,
    isDead: false,
    respawnTimer: 0,
    keystone: null,
    summonerSpells: [],
    ...extra
  }
}

function snap(gameTime: number, players: LiveGamePlayer[]): LiveGameSnapshot {
  return {
    gameTime,
    gameMode: 'CLASSIC',
    mapNumber: 11,
    hasActivePlayer: true,
    activeTeam: 'ORDER',
    activeGold: 0,
    activeLevel: 10,
    activeStats: null,
    players
  }
}

describe('enemy purchase feed', () => {
  it('reports what each enemy bought between two polls, finished items first', () => {
    const before = snap(600, [player('Ahri', 'ORDER', [1036], { isActive: true }), player('Zed', 'CHAOS', [1036, 1036]), player('Malphite', 'CHAOS', [])])
    const after = snap(602, [
      player('Ahri', 'ORDER', [3134], { isActive: true }),
      player('Zed', 'CHAOS', [3134, 2003, 3340]),
      player('Malphite', 'CHAOS', [3047, 3814])
    ])
    const bought = diffEnemyPurchases(before, after, catalog)
    expect(bought.map((p) => `${p.championName}:${p.itemId}:${p.finished}`)).toEqual([
      'Malphite:3047:true',
      'Malphite:3814:true',
      'Zed:3134:false'
    ])
    // Your own purchases and potions/wards are not reported.
    expect(bought.some((p) => p.championName === 'Ahri')).toBe(false)
    expect(bought.every((p) => p.gameTime === 602)).toBe(true)
  })

  it('stays quiet on the first snapshot and after a new game starts', () => {
    const later = snap(900, [player('Zed', 'CHAOS', [3142])])
    expect(diffEnemyPurchases(null, later, catalog)).toEqual([])
    expect(diffEnemyPurchases(later, snap(5, [player('Zed', 'CHAOS', [3814])]), catalog)).toEqual([])
  })

  it('counts duplicates and keeps the newest purchases at the top', () => {
    const a = snap(100, [player('Zed', 'CHAOS', [1036])])
    const b = snap(102, [player('Zed', 'CHAOS', [1036, 1036, 1036])])
    const first = diffEnemyPurchases(a, b, catalog)
    expect(first).toHaveLength(2)
    const c = snap(104, [player('Zed', 'CHAOS', [1036, 1036, 1036, 3814])])
    const feed = mergePurchaseFeed(first, diffEnemyPurchases(b, c, catalog), 2)
    expect(feed.map((p) => p.itemId)).toEqual([3814, 1036])
  })
})
