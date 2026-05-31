import { describe, expect, it } from 'vitest'
import type { ItemLite } from '../dataDragon'
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
  it('returns role-specific default builds from valid current items', () => {
    const build = getUggDefaultItemBuild(18, 'bottom', [
      item(1055, "Doran's Blade", ['Damage']),
      item(3006, "Berserker's Greaves", ['Boots']),
      item(6676, 'The Collector', ['Damage']),
      item(3031, 'Infinity Edge', ['Damage']),
      item(3036, "Lord Dominik's Regards", ['Damage']),
      item(3033, 'Mortal Reminder', ['Damage']),
      item(3085, "Runaan's Hurricane", ['AttackSpeed'])
    ])

    expect(build?.source).toBe('ugg')
    expect(build?.starting.map((row) => row.itemId)).toEqual([1055])
    expect(build?.boots.map((row) => row.itemId)).toEqual([3006])
    expect(build?.core.map((row) => row.itemId)).toEqual([6676, 3031, 3036])
    expect(build?.defaultItemIds).toEqual(expect.arrayContaining([1055, 3006, 6676, 3031, 3036]))
  })

  it('drops stale seed item ids that are not in the current catalog', () => {
    const build = getUggDefaultItemBuild(18, 'bottom', [
      item(1055, "Doran's Blade", ['Damage']),
      item(3006, "Berserker's Greaves", ['Boots'])
    ])

    expect(build?.defaultItemIds).toEqual([1055, 3006])
    expect(build?.core).toEqual([])
  })
})
