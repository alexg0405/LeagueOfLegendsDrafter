import { describe, expect, it } from 'vitest'
import type { ItemLite } from '../dataDragon'
import seed from '../data/uggDefaultItemBuildsSeed.json'
import fullSeed from '../data/buildPathsSeed.json'
import { getUggDefaultItemBuild } from './uggDefaultBuilds'

/**
 * The seed is regenerated daily from U.GG (`npm run items:update:ugg`), so these tests assert
 * shape and invariants, never a specific patch's item choices.
 */

type Row = (typeof seed.builds)[number] & { order?: number[] }

function item(id: number, name: string, tags: string[] = []): ItemLite {
  return {
    id,
    name,
    description: name,
    plaintext: name,
    tags,
    stats: {},
    gold: { base: 1000, total: 1000, sell: 700, purchasable: true },
    maps: { 11: true }
  }
}

function seedRow(championId: number, role: string): Row {
  const row = (seed.builds as Row[]).find((entry) => entry.championId === championId && entry.role === role)
  if (!row) {
    throw new Error(`missing seed row ${championId}:${role}`)
  }
  return row
}

/** Catalog containing exactly the ids a row references (boots tagged as boots). */
function catalogFor(row: Row): ItemLite[] {
  const bootIds = new Set(row.boots ?? [])
  const ids = Array.from(new Set([...(row.starting ?? []), ...(row.boots ?? []), ...(row.core ?? []), ...(row.final ?? [])]))
  return ids.map((id) => item(id, bootIds.has(id) ? 'Boots' : `Item ${id}`, bootIds.has(id) ? ['Boots'] : ['Damage']))
}

describe('U.GG default item build seed', () => {
  it('covers every champion in every role with an accounted source', () => {
    const champions = ((seed as unknown as { champions?: [number, string, string][] }).champions ?? [])
    expect(champions.length).toBeGreaterThan(150)
    expect(seed.builds.length).toBe(champions.length * 5)
    const counts = seed.sourceCounts as Record<string, number>
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(seed.builds.length)
    for (const [championId] of champions) {
      const roles = seed.builds.filter((row) => row.championId === championId).map((row) => row.role).sort()
      expect(roles).toEqual(['bottom', 'jungle', 'middle', 'support', 'top'])
    }
    expect(seed.builds.filter((row) => row.sourceType === 'pinned').map((row) => `${row.championId}:${row.role}`)).toEqual([
      '50:bottom',
      '50:jungle',
      '50:middle',
      '50:support',
      '50:top'
    ])
  })

  it('keeps the slim engine seed and the full paths in sync', () => {
    expect(fullSeed.builds).toHaveLength(seed.builds.length)
    expect(fullSeed.patch).toBe(seed.patch)
    expect(fullSeed.updatedAt).toBe(seed.updatedAt)
    const full = new Map(fullSeed.builds.map((row) => [`${row.championId}:${row.role}`, row]))
    for (const row of seed.builds) {
      const twin = full.get(`${row.championId}:${row.role}`)
      expect(twin?.core).toEqual(row.core)
      expect(twin?.final).toEqual(row.final)
    }
  })

  it('reads the main-role builds from a real Emerald+ sample', () => {
    for (const [championId, role] of [[18, 'bottom'], [103, 'middle'], [266, 'top'], [64, 'jungle'], [117, 'support']] as const) {
      const row = (fullSeed.builds as Row[]).find((entry) => entry.championId === championId && entry.role === role)!
      expect(row.sourceType).toBe('ugg')
      expect(row.matches ?? 0).toBeGreaterThan(1000)
      expect(row.winRate ?? 0).toBeGreaterThan(30)
      expect(row.winRate ?? 0).toBeLessThan(70)
      expect(row.order?.length).toBe(3)
    }
  })

  it('returns role-specific default builds from valid current items', () => {
    const row = seedRow(18, 'bottom')
    const build = getUggDefaultItemBuild(18, 'bottom', catalogFor(row))

    expect(build?.source).toBe('ugg')
    expect(build?.sourceType).toBe('ugg')
    expect(build?.winRate).toBe(row.winRate)
    expect(build?.matches).toBe(row.matches)
    expect(build?.starting.map((ref) => ref.itemId)).toEqual(row.starting)
    expect(build?.boots.map((ref) => ref.itemId)).toEqual(row.boots)
    expect(build?.core.map((ref) => ref.itemId)).toEqual(row.core)
    expect(build?.defaultItemIds).toEqual(expect.arrayContaining([...row.starting, ...row.boots, ...row.core]))
  })

  it('drops stale seed item ids that are not in the current catalog', () => {
    const row = seedRow(18, 'bottom')
    const build = getUggDefaultItemBuild(18, 'bottom', [
      ...row.starting.map((id) => item(id, `Item ${id}`, ['Damage'])),
      ...row.boots.map((id) => item(id, 'Boots', ['Boots']))
    ])

    expect(build?.defaultItemIds).toEqual([...row.starting, ...row.boots])
    expect(build?.core).toEqual([])
  })

  it('gives common bottom carries a full three-item core', () => {
    for (const championId of [145, 202, 222, 901]) {
      const row = seedRow(championId, 'bottom')
      const build = getUggDefaultItemBuild(championId, 'bottom', catalogFor(row))
      expect(build?.core).toHaveLength(3)
      expect(build?.core.map((ref) => ref.itemId)).toEqual(row.core)
    }
  })

  it('keeps champion-specific overrides such as Swain Malignance builds', () => {
    const ids = [1056, 1102, 3158, 3020, 3871, 3118, 6653, 3116, 3157, 4633, 3102, 2503, 3152, 3135]
    const items = ids.map((id) => item(id, id === 3158 || id === 3020 ? 'Boots' : `Item ${id}`, id === 3158 || id === 3020 ? ['Boots'] : ['SpellDamage']))

    expect(getUggDefaultItemBuild(50, 'middle', items)?.core.map((row) => row.itemId)).toEqual([3118, 6653, 3116])
    expect(getUggDefaultItemBuild(50, 'bottom', items)?.core.map((row) => row.itemId)).toEqual([3118, 6653, 3116])
    expect(getUggDefaultItemBuild(50, 'jungle', items)?.core.map((row) => row.itemId)).toEqual([3118, 2503, 3152])
    expect(getUggDefaultItemBuild(50, 'support', items)?.core.map((row) => row.itemId)).toEqual([3118, 3116, 6653])
    expect(getUggDefaultItemBuild(50, 'top', items)?.core.map((row) => row.itemId)).toEqual([3118, 6653, 3116])
  })
})
