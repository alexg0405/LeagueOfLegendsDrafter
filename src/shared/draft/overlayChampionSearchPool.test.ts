import { describe, expect, it } from 'vitest'
import { buildOverlayChampionSearchPool, nameMatchesChampionQuery } from './overlayChampionSearchPool'

describe('nameMatchesChampionQuery', () => {
  it('matches without spaces and punctuation', () => {
    expect(nameMatchesChampionQuery("Kog'Maw", 'kogmaw')).toBe(true)
    expect(nameMatchesChampionQuery('Master Yi', 'masteryi')).toBe(true)
  })
  it('matches substring in normalized name', () => {
    expect(nameMatchesChampionQuery('Twisted Fate', 'fate')).toBe(true)
  })
})

describe('buildOverlayChampionSearchPool', () => {
  it('merges DDragon row over static id', () => {
    const p = buildOverlayChampionSearchPool([{ id: 33, name: 'Rammus', tags: ['Tank'], partype: 'Mana' }])
    const r = p.find((c) => c.id === 33)
    expect(r?.tags).toEqual(['Tank'])
    expect(r?.partype).toBe('Mana')
  })
  it('keeps static roster when draft search is null', () => {
    const p = buildOverlayChampionSearchPool(null)
    expect(p.length).toBeGreaterThan(150)
  })
})
