import { describe, expect, it } from 'vitest'
import { suggestPicks } from './suggestPicks'
import type { DraftSnapshot } from './types'

const idToName = new Map<number, string>([
  [103, 'Ahri'],
  [86, 'Garen']
])

describe('suggestPicks', () => {
  it('returns ordered suggestions for mid with lane context', () => {
    const snapshot: DraftSnapshot = {
      ally: [],
      enemy: [
        { role: 'middle', championId: 238, championName: 'Zed', cellId: null },
        { role: 'top', championId: null, championName: null, cellId: null },
        { role: 'jungle', championId: null, championName: null, cellId: null },
        { role: 'bottom', championId: null, championName: null, cellId: null },
        { role: 'support', championId: null, championName: null, cellId: null }
      ],
      myTeam: null,
      myRole: 'middle',
      localPlayerCellId: null,
      bans: null,
      myPickOrder: null
    }
    const { suggestions, patchLabel } = suggestPicks({
      myRole: 'middle',
      snapshot,
      idToName
    })
    expect(patchLabel).toBe('engine-v1')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions[0]!.championName).toBeDefined()
    expect(suggestions[0]!.estWin).toBeGreaterThan(0.4)
    expect(suggestions[0]!.runes?.keystone).toBeDefined()
  })

  it('orders winrate delta best-first vs worst-first differently when context exists', () => {
    const snapshot: DraftSnapshot = {
      ally: [],
      enemy: [
        { role: 'middle', championId: 238, championName: 'Zed', cellId: null },
        { role: 'top', championId: null, championName: null, cellId: null },
        { role: 'jungle', championId: null, championName: null, cellId: null },
        { role: 'bottom', championId: null, championName: null, cellId: null },
        { role: 'support', championId: null, championName: null, cellId: null }
      ],
      myTeam: null,
      myRole: 'middle',
      localPlayerCellId: null,
      bans: null,
      myPickOrder: null
    }
    const best = suggestPicks({
      myRole: 'middle',
      snapshot,
      idToName,
      sortBy: 'delta',
      deltaListMode: 'best',
      monteCarloSamples: 0
    })
    const worst = suggestPicks({
      myRole: 'middle',
      snapshot,
      idToName,
      sortBy: 'delta',
      deltaListMode: 'worst',
      monteCarloSamples: 0
    })
    expect(best.suggestions.length).toBeGreaterThan(2)
    expect(worst.suggestions.length).toBeGreaterThan(2)
    expect(best.suggestions[0]!.championId).not.toBe(worst.suggestions[0]!.championId)
    const d0 = best.suggestions[0]!.winRateDelta ?? 0
    const w0 = worst.suggestions[0]!.winRateDelta ?? 0
    expect(d0).toBeGreaterThanOrEqual(w0)
  })

  it('never suggests champions that are banned', () => {
    const open = (role: 'top' | 'jungle' | 'middle' | 'bottom' | 'support') => ({
      role,
      championId: null as number | null,
      championName: null as string | null,
      cellId: null as number | null
    })
    const snapshot: DraftSnapshot = {
      ally: [open('top'), open('jungle'), open('middle'), open('bottom'), open('support')],
      enemy: [open('top'), open('jungle'), open('middle'), open('bottom'), open('support')],
      myTeam: null,
      myRole: 'jungle',
      localPlayerCellId: null,
      bans: [64],
      myPickOrder: null
    }
    const { suggestions } = suggestPicks({
      myRole: 'jungle',
      snapshot,
      idToName,
      monteCarloSamples: 0
    })
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.every((s) => s.championId !== 64)).toBe(true)
  })
})
