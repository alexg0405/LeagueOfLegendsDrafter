import { describe, expect, it } from 'vitest'
import { itemsFromDDragonData } from './dataDragon'

describe('Data Dragon item normalization', () => {
  it('keeps visible Summoner Rift purchasable items and removes hidden/off-map rows', () => {
    const items = itemsFromDDragonData({
      1001: {
        name: 'Boots',
        description: '<mainText>Move faster.</mainText>',
        plaintext: 'Slightly increases Move Speed',
        tags: ['Boots'],
        stats: { FlatMovementSpeedMod: 25 },
        gold: { base: 300, total: 300, sell: 210, purchasable: true },
        maps: { 11: true }
      },
      9001: {
        name: 'Hidden Test Item',
        tags: [],
        stats: {},
        gold: { total: 1000, purchasable: true },
        maps: { 11: true },
        hideFromAll: true
      },
      9002: {
        name: 'ARAM Only',
        tags: [],
        stats: {},
        gold: { total: 1000, purchasable: true },
        maps: { 12: true }
      }
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 1001, name: 'Boots' })
  })
})
