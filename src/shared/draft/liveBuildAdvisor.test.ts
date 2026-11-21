import { describe, expect, it } from 'vitest'
import type { ChampionBuildPath } from './buildPaths'
import type { LiveGamePlayer, LiveGameSnapshot } from './liveGame'
import {
  buildLiveAdvice,
  buildProfileFor,
  componentsToBuy,
  isCompletedItem,
  itemStatLines,
  remainingItemCost,
  type AdvisorItem
} from './liveBuildAdvisor'

function it_(
  id: number,
  name: string,
  total: number,
  opts: Partial<Omit<AdvisorItem, 'id' | 'name' | 'gold'>> & { base?: number; lines?: string[] } = {}
): AdvisorItem {
  const lines = (opts.lines ?? []).map((line) => {
    const [value, ...rest] = line.split(' ')
    return `<attention>${value}</attention> ${rest.join(' ')}`
  })
  return {
    id,
    name,
    description: `<mainText><stats>${lines.join('<br>')}</stats>${opts.description ?? ''}</mainText>`,
    tags: opts.tags ?? [],
    stats: opts.stats ?? {},
    gold: { base: opts.base ?? total, total, purchasable: true },
    from: opts.from,
    into: opts.into,
    specialRecipe: opts.specialRecipe,
    consumed: opts.consumed,
    depth: opts.depth
  }
}

/** Small but realistic recipe tree (16.x costs). */
const ITEMS: AdvisorItem[] = [
  it_(1001, 'Boots', 300, { tags: ['Boots'], into: ['3020', '3047'] }),
  it_(3020, "Sorcerer's Shoes", 1100, { base: 800, tags: ['Boots'], from: ['1001'], into: ['3175'], lines: ['12 Magic Penetration'] }),
  it_(3175, "Spellslinger's Shoes", 1100, { base: 0, tags: ['Boots'], from: ['3020'] }),
  it_(3047, 'Plated Steelcaps', 1200, { base: 900, tags: ['Boots'], from: ['1001'], stats: { FlatArmorMod: 25 } }),
  it_(1052, 'Amplifying Tome', 400, { stats: { FlatMagicDamageMod: 20 }, into: ['3802', '3916'] }),
  it_(1027, 'Sapphire Crystal', 350, { into: ['3802'] }),
  it_(1026, 'Blasting Wand', 850, { stats: { FlatMagicDamageMod: 45 }, into: ['3118'] }),
  it_(1058, 'Needlessly Large Rod', 1200, { stats: { FlatMagicDamageMod: 60 }, into: ['3089'] }),
  it_(3802, 'Lost Chapter', 1200, { base: 450, from: ['1052', '1027'], into: ['3118'] }),
  it_(3916, 'Oblivion Orb', 800, { base: 400, from: ['1052'], into: ['3165'], description: 'Applies Grievous Wounds.' }),
  it_(3118, 'Malignance', 2700, { base: 650, from: ['1026', '3802'], stats: { FlatMagicDamageMod: 90 }, lines: ['90 Ability Power'] }),
  it_(3100, 'Lich Bane', 2900, { base: 1850, from: ['1026'], stats: { FlatMagicDamageMod: 100 } }),
  it_(3157, "Zhonya's Hourglass", 3250, { base: 2400, from: ['1026'], stats: { FlatMagicDamageMod: 105, FlatArmorMod: 50 } }),
  it_(3089, "Rabadon's Deathcap", 3500, { base: 1100, from: ['1058', '1058'], stats: { FlatMagicDamageMod: 130 } }),
  it_(3135, 'Void Staff', 3000, { base: 2150, from: ['1026'], stats: { FlatMagicDamageMod: 95 }, lines: ['40% Magic Penetration'] }),
  it_(3165, 'Morellonomicon', 2850, { base: 2050, from: ['3916'], stats: { FlatMagicDamageMod: 75, FlatHPPoolMod: 350 }, description: 'Grievous Wounds' }),
  it_(3102, "Banshee's Veil", 3000, { stats: { FlatMagicDamageMod: 105, FlatSpellBlockMod: 40 } }),
  it_(3075, 'Thornmail', 2450, { stats: { FlatArmorMod: 75, FlatHPPoolMod: 150 }, description: 'Grievous Wounds' }),
  it_(3065, 'Spirit Visage', 2700, { stats: { FlatSpellBlockMod: 50, FlatHPPoolMod: 400 } }),
  it_(3072, 'Bloodthirster', 3400, { stats: { FlatPhysicalDamageMod: 80 }, lines: ['80 Attack Damage', '15% Life Steal'] }),
  it_(3071, 'Black Cleaver', 3000, { stats: { FlatPhysicalDamageMod: 45, FlatHPPoolMod: 400 } }),
  it_(1056, "Doran's Ring", 400, { stats: { FlatMagicDamageMod: 18 } }),
  it_(2003, 'Health Potion', 50, { consumed: true, tags: ['Consumable'] }),
  it_(3340, 'Stealth Ward', 0, { tags: ['Trinket'] })
]
const catalog = new Map(ITEMS.map((item) => [item.id, item]))

const AHRI_PATH: ChampionBuildPath = {
  championId: 103,
  role: 'middle',
  patch: '16.23',
  rank: 'emerald_plus',
  sourceType: 'ugg',
  sourceUrl: 'https://u.gg/lol/champions/ahri/build/mid',
  matches: 43809,
  winRate: 51.5,
  rolePct: 96,
  lowSample: false,
  startSet: [1056, 2003, 2003],
  core: [3118, 3020, 3100],
  coreWinRate: 55.8,
  coreMatches: 3582,
  boots: 3020,
  slots: [],
  fullBuild: [3118, 3020, 3100, 3157, 3089, 3135],
  skills: { order: ['Q', 'W', 'E'], priority: ['Q', 'W', 'E'] },
  spells: [4, 14],
  runes: null
}

function player(overrides: Partial<LiveGamePlayer>): LiveGamePlayer {
  return {
    championKey: null,
    championName: 'Unknown',
    championId: null,
    team: 'CHAOS',
    role: 'unknown',
    level: 9,
    kills: 0,
    deaths: 0,
    assists: 0,
    creepScore: 0,
    wardScore: 0,
    items: [],
    isActive: false,
    isBot: false,
    isDead: false,
    respawnTimer: 0,
    keystone: null,
    summonerSpells: [],
    ...overrides
  }
}

const items = (...ids: number[]) => ids.map((itemId, slot) => ({ itemId, name: String(itemId), count: 1, slot }))

function snapshot(me: Partial<LiveGamePlayer>, enemies: Partial<LiveGamePlayer>[], gameTime: number, gold: number): LiveGameSnapshot {
  return {
    gameTime,
    gameMode: 'CLASSIC',
    mapNumber: 11,
    hasActivePlayer: true,
    activeTeam: 'ORDER',
    activeGold: gold,
    activeLevel: me.level ?? 9,
    activeStats: null,
    players: [
      player({ championKey: 'Ahri', championName: 'Ahri', championId: 103, team: 'ORDER', role: 'middle', isActive: true, ...me }),
      ...enemies.map((enemy) => player({ team: 'CHAOS', ...enemy }))
    ]
  }
}

describe('shop math', () => {
  it('consumes owned components anywhere in the recipe tree', () => {
    const owned = new Map([[1052, 1]])
    expect(remainingItemCost(3118, owned, catalog)).toEqual({ cost: 2300, used: [1052] })
    expect(remainingItemCost(3089, new Map([[1058, 2]]), catalog).cost).toBe(1100)
    expect(remainingItemCost(3089, new Map([[1058, 1]]), catalog).cost).toBe(2300)
  })

  it('spends current gold on the biggest components that fit, digging into sub-recipes', () => {
    const owned = new Map([[1052, 1]])
    expect(componentsToBuy(3118, owned, 1300, catalog)).toEqual([
      { itemId: 1026, cost: 850 },
      { itemId: 1027, cost: 350 }
    ])
    expect(componentsToBuy(3118, owned, 2400, catalog)).toEqual([{ itemId: 3118, cost: 2300 }])
    expect(componentsToBuy(3118, owned, 100, catalog)).toEqual([])
  })

  it('reads stat lines DDragon leaves out of `stats` and spots finished items', () => {
    expect(itemStatLines(catalog.get(3135)).get('magic penetration')).toBe(40)
    expect(isCompletedItem(catalog.get(3118), 3118)).toBe(true)
    expect(isCompletedItem(catalog.get(3020), 3020)).toBe(true)
    expect(isCompletedItem(catalog.get(1001), 1001)).toBe(false)
    expect(isCompletedItem(catalog.get(3802), 3802)).toBe(false)
    expect(isCompletedItem(catalog.get(2003), 2003)).toBe(false)
    expect(buildProfileFor(AHRI_PATH, player({ championName: 'Ahri', championKey: 'Ahri' }), catalog)).toBe('mage')
  })
})

describe('live build advice', () => {
  it('tells you what to buy next with the gold you have', () => {
    const advice = buildLiveAdvice({
      snapshot: snapshot({ items: items(1056, 1052, 2003) }, [{ championName: 'Zed', championKey: 'Zed' }], 6 * 60, 1300),
      path: AHRI_PATH,
      catalog
    })!
    expect(advice.phase).toBe('laning')
    expect(advice.profile).toBe('mage')
    expect(advice.build.map((slot) => slot.itemId)).toEqual([3118, 3020, 3100, 3157, 3089, 3135])
    expect(advice.build[0]!.status).toBe('next')
    expect(advice.next).toMatchObject({ itemId: 3118, remainingCost: 2300, gold: 1300, affordable: false, ownedComponents: [1052], thenItemId: 3020 })
    expect(advice.next!.buyNow.map((row) => row.itemId)).toEqual([1026, 1027])
    expect(advice.skillPriority).toEqual(['Q', 'W', 'E'])
  })

  it('treats upgraded boots and off-path items as owned', () => {
    const advice = buildLiveAdvice({
      snapshot: snapshot({ items: items(3118, 3175, 3102) }, [{ championName: 'Zed', championKey: 'Zed' }], 20 * 60, 500),
      path: AHRI_PATH,
      catalog
    })!
    const owned = advice.build.filter((slot) => slot.status === 'owned')
    expect(owned.map((slot) => slot.itemId)).toEqual([3118, 3175, 3102])
    expect(owned.find((slot) => slot.itemId === 3102)?.offPath).toBe(true)
    expect(advice.build.some((slot) => slot.itemId === 3020)).toBe(false)
    expect(advice.build).toHaveLength(6)
    expect(advice.next?.itemId).toBe(3100)
    expect(advice.completedCount).toBe(3)
  })

  it('swaps in anti-heal against a healing comp and says why', () => {
    const advice = buildLiveAdvice({
      snapshot: snapshot(
        { items: items(3118, 1001) },
        [
          { championName: 'Soraka', championKey: 'Soraka', role: 'support' },
          { championName: 'Aatrox', championKey: 'Aatrox', role: 'top', items: items(3072) },
          { championName: 'Warwick', championKey: 'Warwick', role: 'jungle' }
        ],
        18 * 60,
        700
      ),
      path: AHRI_PATH,
      catalog
    })!
    const swap = advice.swaps.find((row) => row.need === 'antiHeal')
    expect(swap?.itemId).toBe(3165)
    expect(swap?.replaces).toBe(3135)
    expect(swap?.rushComponent).toBe(3916)
    expect(swap?.because).toEqual(expect.arrayContaining(['Soraka', 'Aatrox']))
    // Strong need: right behind the boots you are already building.
    expect(advice.build.map((slot) => slot.itemId)).toEqual([3118, 3020, 3165, 3100, 3157, 3089])
    expect(advice.build[1]!.status).toBe('next')
    expect(advice.build[2]!.swapReason).toMatch(/heals/i)
  })

  it('flags the fed enemy first and reads what they are stacking', () => {
    const advice = buildLiveAdvice({
      snapshot: snapshot(
        { items: items(3118) },
        [
          { championName: 'Malphite', championKey: 'Malphite', role: 'top', items: items(3075, 3065), kills: 1, deaths: 2 },
          { championName: 'Zed', championKey: 'Zed', role: 'middle', items: items(3071), kills: 8, deaths: 1 }
        ],
        22 * 60,
        0
      ),
      path: AHRI_PATH,
      catalog
    })!
    expect(advice.threats[0]).toMatchObject({ championName: 'Zed', fed: true, damage: 'AD' })
    expect(advice.threats[1]!.notes).toEqual(expect.arrayContaining(['75 armor']))
    expect(advice.signals.some((line) => line.startsWith('Fed: Zed'))).toBe(true)
    expect(advice.swaps.find((row) => row.need === 'armor')?.itemId).toBe(3157)
  })

  it('returns nothing while spectating', () => {
    const snap = snapshot({}, [], 600, 0)
    snap.players = snap.players.map((p) => ({ ...p, isActive: false }))
    expect(buildLiveAdvice({ snapshot: snap, path: AHRI_PATH, catalog })).toBeNull()
  })
})
