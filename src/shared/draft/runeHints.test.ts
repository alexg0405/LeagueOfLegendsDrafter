import { describe, expect, it } from 'vitest'
import { runeLoadoutForChampion } from './runeHints'
import type { DraftSnapshot, SlotPick } from './types'

const idToName = new Map<number, string>([
  [12, 'Alistar'],
  [17, 'Teemo'],
  [32, 'Amumu'],
  [51, 'Caitlyn'],
  [64, 'Lee Sin'],
  [89, 'Leona'],
  [90, 'Malzahar'],
  [99, 'Lux'],
  [102, 'Shyvana'],
  [103, 'Ahri'],
  [113, 'Sejuani'],
  [142, 'Zoe'],
  [222, 'Jinx'],
  [238, 'Zed']
])

function slot(role: SlotPick['role'], championId: number | null, championName: string | null): SlotPick {
  return { role, championId, championName, cellId: null }
}

function snapshot(enemy: SlotPick[], myRole: DraftSnapshot['myRole']): DraftSnapshot {
  return {
    ally: [],
    enemy,
    myTeam: null,
    myRole,
    localPlayerCellId: null,
    bans: null,
    myPickOrder: null
  }
}

describe('runeLoadoutForChampion', () => {
  it('pivots marksmen toward movement speed into sniper bot lanes', () => {
    const runes = runeLoadoutForChampion(
      222,
      'bottom',
      {
        snapshot: snapshot([slot('bottom', 51, 'Caitlyn'), slot('support', 99, 'Lux')], 'bottom'),
        idToName
      }
    )

    expect(runes.keystone).toContain('Fleet Footwork')
    expect(runes.secondary).toContain('Nimbus Cloak')
    expect(runes.secondary).toContain('Celerity')
    expect(runes.note).toMatch(/Jinx|Caitlyn/i)
    expect(runes.note).toMatch(/artillery|angles|skillshot/i)
  })

  it('adds Bone Plating guidance into assassin all-in lanes', () => {
    const runes = runeLoadoutForChampion(
      103,
      'middle',
      {
        snapshot: snapshot([slot('middle', 238, 'Zed')], 'middle'),
        idToName
      }
    )

    expect(runes.secondary).toContain('Bone Plating')
    expect(runes.note).toMatch(/Zed|burst|engage/i)
  })

  it('adds Unflinching guidance when jungle is drafting into multiple CC threats', () => {
    const runes = runeLoadoutForChampion(
      64,
      'jungle',
      {
        snapshot: snapshot(
          [slot('support', 89, 'Leona'), slot('jungle', 113, 'Sejuani'), slot('middle', 32, 'Amumu')],
          'jungle'
        ),
        idToName
      }
    )

    expect(runes.secondary).toContain('Unflinching')
    expect(runes.note).toMatch(/Unflinching|Heavy CC|lockdown/i)
  })

  it('does not recommend removed Phase Rush pages', () => {
    const cases: Array<[number, SlotPick['role']]> = [
      [64, 'jungle'],
      [90, 'middle'],
      [102, 'jungle'],
      [142, 'middle'],
      [222, 'bottom']
    ]

    for (const [championId, role] of cases) {
      const runes = runeLoadoutForChampion(championId, role, { idToName })
      expect(`${runes.keystone} ${runes.note ?? ''}`).not.toMatch(/Phase Rush/i)
    }
  })

  it('uses Deathfire Touch for sustained damage casters with current magic-damage note', () => {
    const runes = runeLoadoutForChampion(90, 'middle', { idToName })

    expect(runes.primaryTree).toBe('Sorcery')
    expect(runes.keystone).toBe('Deathfire Touch')
    expect(runes.note).toMatch(/Deathfire Touch|DoT|magic/i)
  })

  it("uses Stormraider's Surge as the movement replacement into kite comps", () => {
    const runes = runeLoadoutForChampion(64, 'jungle', {
      snapshot: snapshot([slot('bottom', 51, 'Caitlyn'), slot('support', 99, 'Lux')], 'jungle'),
      idToName
    })

    expect(runes.keystone).toContain("Stormraider's Surge")
    expect(runes.secondary).toContain('Celerity')
  })

  it('keeps Arcane Comet focused on long-range poke champions', () => {
    const runes = runeLoadoutForChampion(142, 'middle', { idToName })

    expect(runes.keystone).toBe('Arcane Comet')
    expect(runes.note).toMatch(/long-range|Bubble/i)
  })

  it('captures changed champion build paths in rune notes', () => {
    const teemo = runeLoadoutForChampion(17, 'top', { idToName })
    const shyvana = runeLoadoutForChampion(102, 'jungle', { idToName })

    expect(teemo.note).toMatch(/Toxic Shot|on-hit/i)
    expect(shyvana.note).toMatch(/AD Shyvana|AP Shyvana/i)
  })
})
