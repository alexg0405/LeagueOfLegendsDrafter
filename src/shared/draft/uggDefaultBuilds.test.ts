import { describe, expect, it } from 'vitest'
import type { ItemLite } from '../dataDragon'
import seed from '../data/uggDefaultItemBuildsSeed.json'
import { getUggDefaultItemBuild } from './uggDefaultBuilds'

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

describe('U.GG default item build seed', () => {
  it('covers every champion-role row with U.GG data plus explicit pinned overrides', () => {
    expect(seed.builds).toHaveLength(860)
    expect(seed.sourceCounts).toEqual({ ugg: 855, pinned: 5 })
    expect(seed.builds.filter((row) => row.sourceType === 'pinned').map((row) => `${row.championId}:${row.role}`)).toEqual([
      '50:bottom',
      '50:jungle',
      '50:middle',
      '50:support',
      '50:top'
    ])
  })

  it('returns role-specific default builds from valid current items', () => {
    const build = getUggDefaultItemBuild(18, 'bottom', [
      item(1086, 'Cull', ['Damage']),
      item(3006, "Berserker's Greaves", ['Boots']),
      item(6675, 'Yun Tal Wildarrows', ['Damage']),
      item(6676, 'The Collector', ['Damage']),
      item(3031, 'Infinity Edge', ['Damage']),
      item(3036, "Lord Dominik's Regards", ['Damage']),
      item(3033, 'Mortal Reminder', ['Damage'])
    ])

    expect(build?.source).toBe('ugg')
    expect(build?.sourceType).toBe('ugg')
    expect(build?.winRate).toBe(50.03)
    expect(build?.matches).toBe(1278240)
    expect(build?.starting.map((row) => row.itemId)).toEqual([1086])
    expect(build?.boots.map((row) => row.itemId)).toEqual([3006])
    expect(build?.core.map((row) => row.itemId)).toEqual([6676, 3031, 6675])
    expect(build?.defaultItemIds).toEqual(expect.arrayContaining([1086, 3006, 6676, 3031, 6675]))
  })

  it('drops stale seed item ids that are not in the current catalog', () => {
    const build = getUggDefaultItemBuild(18, 'bottom', [
      item(1086, 'Cull', ['Damage']),
      item(3006, "Berserker's Greaves", ['Boots'])
    ])

    expect(build?.defaultItemIds).toEqual([1086, 3006])
    expect(build?.core).toEqual([])
  })

  it('covers common bottom carries with real default cores', () => {
    const ids = [
      1055, 1086, 3006, 3008, 6672, 6675, 6676, 3031, 3036, 3094, 3046, 3085, 3153, 3124, 3302, 3161,
      3071, 3508, 6694, 6697, 2510, 2523
    ]
    const items = ids.map((id) => item(id, id === 3006 || id === 3158 ? 'Boots' : `Item ${id}`, id === 3006 || id === 3158 ? ['Boots'] : ['Damage']))

    expect(getUggDefaultItemBuild(145, 'bottom', items)?.core.map((row) => row.itemId)).toEqual([6672, 3124, 2510])
    expect(getUggDefaultItemBuild(202, 'bottom', items)?.core.map((row) => row.itemId)).toEqual([6697, 6676, 3031])
    expect(getUggDefaultItemBuild(222, 'bottom', items)?.core.map((row) => row.itemId)).toEqual([2523, 3046, 3031])
    expect(getUggDefaultItemBuild(901, 'bottom', items)?.core.map((row) => row.itemId)).toEqual([3508, 3071, 3094])
  })

  it('covers non-bottom roles with U.GG current-patch defaults', () => {
    const ids = [
      1055, 1056, 1101, 1103, 3047, 3020, 3008, 3111, 3118, 3158, 6610, 6333, 6692, 6697, 3068, 3075,
      6653, 6655, 4645, 4646, 3157, 3089, 3161, 3869, 3871
    ]
    const items = ids.map((id) => item(id, id === 3047 || id === 3020 || id === 3158 ? 'Boots' : `Item ${id}`, id === 3047 || id === 3020 || id === 3158 ? ['Boots'] : ['Damage']))

    expect(getUggDefaultItemBuild(266, 'top', items)?.core.map((row) => row.itemId)).toEqual([3161, 6610, 6333])
    expect(getUggDefaultItemBuild(32, 'jungle', items)?.core.map((row) => row.itemId)).toEqual([6653, 3068, 3075])
    expect(getUggDefaultItemBuild(103, 'middle', items)?.core.map((row) => row.itemId)).toEqual([3118, 4645, 3157])
    expect(getUggDefaultItemBuild(99, 'support', items)?.core.map((row) => row.itemId)).toEqual([6655, 4646, 4645])
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
