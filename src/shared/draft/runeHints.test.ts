import { describe, expect, it } from 'vitest'
import { runeLoadoutForChampion } from './runeHints'
import type { DraftSnapshot, SlotPick } from './types'

const idToName = new Map<number, string>([
  [12, 'Alistar'],
  [32, 'Amumu'],
  [51, 'Caitlyn'],
  [64, 'Lee Sin'],
  [89, 'Leona'],
  [99, 'Lux'],
  [103, 'Ahri'],
  [113, 'Sejuani'],
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
})
