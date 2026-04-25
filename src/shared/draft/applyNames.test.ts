import { describe, expect, it } from 'vitest'
import { applyChampionNames } from './applyNames'
import type { DraftSnapshot } from './types'

describe('applyChampionNames', () => {
  it('replaces generic champion id labels with bundled names', () => {
    const snap: DraftSnapshot = {
      ally: [],
      enemy: [{ role: 'top', championId: 54, championName: 'Champion 54', cellId: null }],
      myTeam: null,
      myRole: null,
      localPlayerCellId: null
    }

    const named = applyChampionNames(snap, new Map())
    expect(named.enemy[0]?.championName).toBe('Malphite')
  })
})
