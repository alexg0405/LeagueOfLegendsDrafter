import { describe, expect, it } from 'vitest'
import { buildEngineState, legalChampionSetForRole } from './draftState'
import {
  cloneWithMyPick,
  completeDraftRandomly,
  recommend,
  v1ComponentScores,
  ENGINE_V1_LABEL,
  MEANINGFUL_TEAM_SYNERGY_DELTA
} from './recommendEngine'
import type { CompiledTrainedEffects } from './trainedEffects'
import type { DraftSnapshot } from './types'

const idMap = new Map<number, string>([
  [10, 'Kayle'],
  [38, 'Kassadin'],
  [50, 'Swain'],
  [60, 'Elise'],
  [64, 'Lee Sin'],
  [77, 'Udyr'],
  [103, 'Ahri'],
  [111, 'Nautilus'],
  [22, 'Ashe'],
  [81, 'Ezreal'],
  [222, 'Jinx']
])

const roleKeys = ['top', 'jungle', 'middle', 'bottom', 'support'] as const

function emptyBase(): CompiledTrainedEffects['base'] {
  return Object.fromEntries(roleKeys.map((r) => [r, new Map<number, number>()])) as CompiledTrainedEffects['base']
}

function emptyMatchups(): CompiledTrainedEffects['matchup'] {
  return Object.fromEntries(roleKeys.map((r) => [r, new Map<number, Map<number, number>>()])) as CompiledTrainedEffects['matchup']
}

function emptySynergy(): CompiledTrainedEffects['synergy'] {
  return Object.fromEntries(
    roleKeys.map((r) => [
      r,
      Object.fromEntries(roleKeys.map((r2) => [r2, new Map<number, Map<number, number>>()]))
    ])
  ) as CompiledTrainedEffects['synergy']
}

function trainedFixture(): CompiledTrainedEffects {
  return {
    status: {
      schemaVersion: 1,
      exportedAt: 'test',
      basePairs: 0,
      matchupPairs: 0,
      synergyPairs: 0,
      patchesSeen: ['test'],
      hasAnyData: true
    },
    base: emptyBase(),
    matchup: emptyMatchups(),
    synergy: emptySynergy(),
    comfort: new Map(),
    idToName: new Map(idMap)
  }
}

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

  it('keeps curated hard counters visible when trained matchup rows are near neutral', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: 64, championName: 'Lee Sin', cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'jungle',
      localPlayerCellId: 1,
      bans: null,
      myPickOrder: null
    }
    const trained = trainedFixture()
    trained.matchup.jungle.set(60, new Map([[64, -0.0093]]))
    const st = buildEngineState(snap, 'jungle', {
      bans: null,
      myPickOrder: null,
      dataDragonVersion: null,
      patch: 'test'
    })
    const v = v1ComponentScores(60, 'jungle', st, idMap, null, trained)
    expect(v.enemy).toBeLessThan(0.43)
    expect(v.enemyAdj).toBeLessThan(-0.01)
    expect(v.contextCombined - v.base).toBeLessThan(-0.01)
  })

  it('does not let trained base rows override Diamond+ public base rates or expand the role pool', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'middle',
      localPlayerCellId: 2,
      bans: null,
      myPickOrder: null
    }
    const trained = trainedFixture()
    trained.base.middle.set(103, 2.2)
    trained.base.middle.set(67, 2.2)
    trained.base.middle.set(98, 2.2)
    const st = buildEngineState(snap, 'middle', {
      bans: null,
      myPickOrder: null,
      dataDragonVersion: null,
      patch: 'test'
    })
    const { suggestions } = recommend({
      state: st,
      idToName: idMap,
      trainedEffects: trained,
      maxResults: 80,
      monteCarloSamples: 0
    })
    const ahriWithTrained = v1ComponentScores(103, 'middle', st, idMap, null, trained)
    const ahriPublicOnly = v1ComponentScores(103, 'middle', st, idMap, null, null)
    expect(ahriWithTrained.base).toBeCloseTo(ahriPublicOnly.base, 5)
    expect(ahriWithTrained.base).toBeLessThan(0.55)
    expect(suggestions.some((s) => s.championId === 103)).toBe(true)
    expect(suggestions.some((s) => s.championId === 67)).toBe(false)
    expect(suggestions.some((s) => s.championId === 98)).toBe(false)
  })

  it('uses Diamond+ public base rows for every champion instead of synthetic fallback', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'middle',
      localPlayerCellId: 2,
      bans: null,
      myPickOrder: 1
    }
    const st = buildEngineState(snap, 'middle', {
      bans: null,
      myPickOrder: 1,
      dataDragonVersion: null,
      patch: 'test'
    })
    const kassadin = v1ComponentScores(38, 'middle', st, idMap, null)
    expect(kassadin.base).toBeGreaterThan(0.45)
    expect(kassadin.base).toBeLessThan(0.55)
  })

  it('does not suggest non-primary public-meta flex rows for other roles', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'top',
      localPlayerCellId: 0,
      bans: null,
      myPickOrder: 1
    }
    const st = buildEngineState(snap, 'top', {
      bans: null,
      myPickOrder: 1,
      dataDragonVersion: null,
      patch: 'test'
    })
    const { suggestions } = recommend({
      state: st,
      idToName: idMap,
      maxResults: 120,
      monteCarloSamples: 0
    })
    expect(suggestions.some((s) => s.championId === 157)).toBe(false)
  })

  it('lets strong ally hovers create a visible team-synergy delta', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: 81, championName: 'Ezreal', cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: 22, championName: 'Ashe', cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'support',
      localPlayerCellId: 4,
      bans: null,
      myPickOrder: null
    }
    const st = buildEngineState(snap, 'support', {
      bans: null,
      myPickOrder: null,
      dataDragonVersion: null,
      patch: 'test'
    })
    const scores = v1ComponentScores(111, 'support', st, idMap, null)
    expect(scores.ally).toBeGreaterThan(0.53)
    expect(scores.contextCombined - scores.base).toBeGreaterThanOrEqual(MEANINGFUL_TEAM_SYNERGY_DELTA)

    const { suggestions } = recommend({
      state: st,
      idToName: idMap,
      maxResults: 120,
      sortBy: 'delta',
      monteCarloSamples: 0
    })
    const naut = suggestions.find((s) => s.championId === 111)
    expect(naut?.reasons).toContain('team_synergy')
  })

  it('pins the local locked pick first so its info card remains visible', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: 64, championName: 'Lee Sin', cellId: 1 },
        { role: 'middle', championId: 103, championName: 'Ahri', cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: 238, championName: 'Zed', cellId: 7 },
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
    expect(st.unavailable.has(103)).toBe(true)

    const { suggestions } = recommend({
      state: st,
      idToName: idMap,
      maxResults: 5,
      sortBy: 'delta',
      monteCarloSamples: 0
    })
    expect(suggestions[0]?.championId).toBe(103)
    expect(suggestions[0]?.isLockedPick).toBe(true)
    expect(suggestions[0]?.runes).toBeTruthy()
  })

  it('treats an inferred off-slot enemy as the lane opponent for recommendation context', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'bottom', championId: 67, championName: 'Vayne', cellId: 5 },
        { role: 'bottom', championId: 222, championName: 'Jinx', cellId: 6 },
        { role: 'jungle', championId: null, championName: null, cellId: 7 },
        { role: 'middle', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'top',
      localPlayerCellId: 0,
      bans: null,
      myPickOrder: null
    }
    const st = buildEngineState(snap, 'top', {
      bans: null,
      myPickOrder: null,
      dataDragonVersion: null,
      patch: 'test'
    })
    const { suggestions } = recommend({
      state: st,
      idToName: idMap,
      maxResults: 5,
      monteCarloSamples: 0
    })
    expect(suggestions[0]?.detail).toContain('lane')
  })
})

describe('Monte Carlo helpers', () => {
  it('keeps blind Monte Carlo anchored to current-patch base data', () => {
    const snap: DraftSnapshot = {
      ally: [
        { role: 'top', championId: null, championName: null, cellId: 0 },
        { role: 'jungle', championId: null, championName: null, cellId: 1 },
        { role: 'middle', championId: null, championName: null, cellId: 2 },
        { role: 'bottom', championId: null, championName: null, cellId: 3 },
        { role: 'support', championId: null, championName: null, cellId: 4 }
      ],
      enemy: [
        { role: 'top', championId: null, championName: null, cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ],
      myTeam: '100',
      myRole: 'middle',
      localPlayerCellId: 2,
      bans: null,
      myPickOrder: 1
    }
    const st = buildEngineState(snap, 'middle', {
      bans: null,
      myPickOrder: 1,
      dataDragonVersion: null,
      patch: 'test'
    })
    const { suggestions } = recommend({
      state: st,
      idToName: idMap,
      maxResults: 80,
      monteCarloSamples: 48,
      rngSeed: 0x4d_44_57_45
    })
    const kassadin = suggestions.find((s) => s.championId === 38)
    expect(kassadin).toBeTruthy()
    expect(kassadin!.score).toBeLessThan(1.04)
    expect(kassadin!.estWin).toBeLessThan(0.515)
  })

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
