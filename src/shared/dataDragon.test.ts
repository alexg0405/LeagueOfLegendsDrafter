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
      },
      9003: {
        name: 'Non Store Item',
        tags: [],
        stats: {},
        gold: { total: 1000, purchasable: true },
        maps: { 11: true },
        inStore: false
      },
      9004: {
        name: 'Non Purchasable Component',
        tags: [],
        stats: {},
        gold: { total: 1000, purchasable: false },
        maps: { 11: true },
        into: ['1001']
      },
      6693: {
        name: "Prowler's Claw",
        tags: ['Damage'],
        stats: { FlatPhysicalDamageMod: 55 },
        gold: { total: 3000, purchasable: true },
        maps: { 11: true }
      },
      443056: {
        name: "Demon King's Crown",
        tags: ['Health'],
        stats: { FlatHPPoolMod: 300 },
        gold: { total: 2500, purchasable: true },
        maps: { 11: true, 30: true }
      },
      443193: {
        name: 'Protoplasm Harness',
        tags: ['Health', 'Active'],
        stats: { FlatHPPoolMod: 400 },
        gold: { total: 2500, purchasable: true },
        maps: { 11: true, 30: true }
      },
      9005: {
        name: 'Mode Only Item',
        tags: ['Damage'],
        stats: { FlatPhysicalDamageMod: 40 },
        gold: { total: 2600, purchasable: true },
        maps: { 11: true },
        modes: ['ARAM']
      },
      9006: {
        name: 'Champion Locked Item',
        tags: ['Damage'],
        stats: { FlatPhysicalDamageMod: 40 },
        gold: { total: 2600, purchasable: true },
        maps: { 11: true },
        requiredChampion: 'SomeChampion'
      }
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 1001, name: 'Boots' })
  })

  it('collapses same-name current items and keeps the best populated row', () => {
    const items = itemsFromDDragonData({
      3504: {
        name: 'Ardent Censer',
        description: 'Ability Power, heal and shield power, and ally attack speed.',
        plaintext: 'Empowers allies',
        tags: ['SpellDamage', 'ManaRegen'],
        stats: { FlatMagicDamageMod: 45 },
        gold: { base: 700, total: 2200, sell: 1540, purchasable: true },
        maps: { 11: true }
      },
      9504: {
        name: 'Ardent Censer',
        description: '',
        plaintext: '',
        tags: [],
        stats: {},
        gold: { base: 0, total: 2200, sell: 1540, purchasable: true },
        maps: { 11: true }
      }
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 3504, name: 'Ardent Censer' })
  })
})
