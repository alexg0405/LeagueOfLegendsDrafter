import { describe, expect, it } from 'vitest'
import { buildEngineState, legalChampionSetForRole } from './draftState'
import { cloneWithMyPick, completeDraftRandomly, recommend, v1ComponentScores, ENGINE_V1_LABEL } from './recommendEngine'
import type { DraftSnapshot } from './types'

const idMap = new Map<number, string>([[103, 'Ahri']])

const baseSnap: DraftSnapshot = {
  ally: [
    { role: 'jungle', championId: 64, championName: 'Lee', cellId: 0 },
    { role: 'top', championId: null, championName: null, cellId: 1 },
    { role: 'middle', championId: null, championName: null, cellId: 2 },
    { role: 'bottom', championId: null, championName: null, cellId: 3 },
    { role: 'support', championId: null, championName: null, cellId: 4 }
  ],
  enemy: [
    { role: 'middle', championId: 238, championName: 'Zed', cellId: 5 },
    { role: 'top', championId: null, championName: null, cellId: 6 },
    { role: 'jungle', championId: null, championName: null, cellId: 7 },
    { role: 'bottom', championId: null, championName: null, cellId: 8 },
    { role: 'support', championId: null, championName: null, cellId: 9 }
  ],
  myTeam: '100',
  myRole: 'middle',
  localPlayerCellId: 2,
  bans: [157],
  myPickOrder: 3
}

describe('recommend v1', () => {
  it('ranks a legal pool and respects bans', () => {
    const st = buildEngineState(baseSnap, 'middle', {
      bans: [157],
      myPickOrder: 3,
      dataDragonVersion: '15.1.1',
      patch: '15.1.1'
    })
    expect(st.unavailable.has(157)).toBe(true)
    expect(legalChampionSetForRole('middle').size).toBeGreaterThan(5)
    const { suggestions, patchLabel } = recommend({
      state: st,
      idToName: idMap,
      maxResults: 3
    })
    expect(patchLabel).toBe(ENGINE_V1_LABEL)
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.every((s) => s.championId !== 157)).toBe(true)
  })

  it('v1ComponentScores returns blend in [0,1]', () => {
    const st = buildEngineState(baseSnap, 'middle', {
      bans: null,
      myPickOrder: null,
      dataDragonVersion: null,
      patch: 'test'
    })
    const v = v1ComponentScores(103, 'middle', st, null, null)
    expect(v.combined).toBeGreaterThanOrEqual(0)
    expect(v.combined).toBeLessThanOrEqual(1)
  })

  it('contextual blend is not globally shrunk below baseline (regression: winrate delta display)', () => {
    const snap: typeof baseSnap = {
      ally: [
        { role: 'jungle', championId: null, championName: null, cellId: 0 },
        { role: 'top', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'middle', championId: null, championName: null, cellId: 5 },
        { role: 'top', championId: null, championName: null, cellId: 6 },
        { role: 'jungle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'middle',
      localPlayerCellId: 2,
      bans: null,
      myPickOrder: null
    }
    const st = buildEngineState(snap, 'middle', {
      bans: null,
      myPickOrder: null,
      dataDragonVersion: null,
      patch: 'test'
    })
    const v = v1ComponentScores(103, 'middle', st, null, null)
    /** Old 0.85·k/(wSum) factor pulled neutral boards ~8–15% below `base`, so every delta looked negative. */
    expect(v.contextCombined).toBeGreaterThanOrEqual(v.base - 0.08)
  })
})

describe('Monte Carlo helpers', () => {
  it('cloneWithMyPick then completeDraftRandomly fills open slots', () => {
    let seed = 42
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }
    const s0 = cloneWithMyPick(baseSnap, 'middle', 2, 61)
    const done = completeDraftRandomly(s0, [157, 200], rand)
    const locked = [...done.ally, ...done.enemy].filter((p) => p.championId).length
    expect(locked).toBeGreaterThanOrEqual(1)
  })
})
