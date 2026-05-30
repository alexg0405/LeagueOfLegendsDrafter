import { describe, expect, it } from 'vitest'
import { getChampionBuildProfile } from './championBuildProfile'

describe('getChampionBuildProfile current patch hints', () => {
  it('surfaces AP Ezreal and Statikk caution', () => {
    const profile = getChampionBuildProfile(
      81,
      'middle',
      { tags: ['Marksman', 'Mage'], partype: 'Mana' },
      'Ezreal'
    )

    expect(profile.damage).toBe('flex')
    expect(profile.buildHint).toMatch(/AP ratios|hybrid sniper/i)
    expect(profile.itemHint).toMatch(/Statikk|AP/i)
  })

  it('surfaces AD crit Kennen and Doran Bow paths', () => {
    const profile = getChampionBuildProfile(
      85,
      'top',
      { tags: ['Mage', 'Marksman'], partype: 'Energy' },
      'Kennen'
    )

    expect(profile.archetype).toMatch(/AD crit/i)
    expect(profile.buildHint).toMatch(/crit/i)
    expect(profile.itemHint).toMatch(/Doran's Bow|Statikk/i)
  })

  it('surfaces Teemo on-hit caution and Deathfire AP split', () => {
    const profile = getChampionBuildProfile(
      17,
      'top',
      { tags: ['Marksman', 'Assassin'], partype: 'Mana' },
      'Teemo'
    )

    expect(profile.damage).toBe('flex')
    expect(profile.buildHint).toMatch(/Toxic Shot|Shiv/i)
    expect(profile.itemHint).toMatch(/Statikk|Deathfire Touch/i)
  })

  it('surfaces Shyvana AD/AP split and bruiser item direction', () => {
    const profile = getChampionBuildProfile(
      102,
      'jungle',
      { tags: ['Fighter', 'Tank'], partype: 'Fury' },
      'Shyvana'
    )

    expect(profile.damage).toBe('flex')
    expect(profile.buildHint).toMatch(/AD wants|AP centers/i)
    expect(profile.itemHint).toMatch(/Endless Hunger|Gluttonous Greaves/i)
  })

  it('does not keep stale removed-item core recommendations', () => {
    const profile = getChampionBuildProfile(
      238,
      'middle',
      { tags: ['Assassin'], partype: 'Energy' },
      'Zed'
    )

    expect(profile.buildHint).not.toMatch(/Opportunity|Trailblazer|Dusk, Axiom/i)
    expect(profile.itemHint).toMatch(/Opportunity is removed|Voltaic Cyclosword/i)
  })
})
