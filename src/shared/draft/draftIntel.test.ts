import { describe, expect, it } from 'vitest'
import { buildDraftIntel, championPoolPreferenceToComfort } from './draftIntel'
import type { DraftSnapshot, PickSuggestion } from './types'

const names = new Map<number, string>([
  [81, 'Ezreal'],
  [51, 'Caitlyn'],
  [119, 'Draven'],
  [238, 'Zed'],
  [157, 'Yasuo'],
  [64, 'Lee Sin'],
  [22, 'Ashe'],
  [412, 'Thresh']
])

function slot(role: DraftSnapshot['ally'][number]['role'], championId: number | null): DraftSnapshot['ally'][number] {
  return {
    role,
    championId,
    championName: championId == null ? null : names.get(championId) ?? `Champion ${championId}`,
    cellId: null
  }
}

function snapshot(): DraftSnapshot {
  return {
    ally: [slot('top', 157), slot('jungle', 64), slot('middle', 238), slot('bottom', 81), slot('support', null)],
    enemy: [slot('top', null), slot('jungle', null), slot('middle', null), slot('bottom', 51), slot('support', 412)],
    myTeam: '100',
    myRole: 'bottom',
    localPlayerCellId: 3,
    bans: [119],
    myPickOrder: null
  }
}

function suggestion(championId: number, championName: string): PickSuggestion {
  return {
    championId,
    championName,
    score: 91,
    reasons: ['lane_counter', 'team_synergy'],
    baseWinRate: 0.51,
    contextWinRate: 0.535,
    winRateDelta: 0.025,
    estWin: 0.536,
    runes: {
      primaryTree: 'Sorcery',
      keystone: 'Arcane Comet',
      secondary: 'Inspiration',
      note: 'Long-range poke rune.'
    },
    buildProfile: {
      damage: 'ad',
      archetype: 'Marksman',
      buildHint: 'Use safe ranged DPS.',
      itemHint: "Doran's Bow is a greedy lane option.",
      tagsLine: 'Marksman',
      partype: 'Mana'
    }
  }
}

describe('buildDraftIntel', () => {
  it('builds ban recommendations without picked or banned champions', () => {
    const s = snapshot()
    const intel = buildDraftIntel({
      snapshot: s,
      myRole: 'bottom',
      suggestions: [suggestion(81, 'Ezreal')],
      idToName: names
    })

    expect(intel).not.toBeNull()
    const bannedOrPicked = new Set([81, 51, 119, 157, 64, 238, 412])
    expect(intel!.banRecommendations.every((row) => !bannedOrPicked.has(row.championId))).toBe(true)
    expect(intel!.banRecommendations.length).toBeGreaterThan(0)
  })

  it('surfaces matchup plan, rune export, and loading brief', () => {
    const intel = buildDraftIntel({
      snapshot: snapshot(),
      myRole: 'bottom',
      suggestions: [suggestion(81, 'Ezreal')],
      idToName: names
    })

    expect(intel?.matchupPlans[0]?.laneOpponentName).toBe('Caitlyn')
    expect(intel?.matchupPlans[0]?.startingItem).toMatch(/Doran/)
    expect(intel?.loadingBrief.length).toBeGreaterThan(0)
  })

  it('detects draft gaps for one-dimensional ally comps', () => {
    const s = snapshot()
    s.ally = [slot('top', 51), slot('jungle', 119), slot('middle', 238), slot('bottom', 22), slot('support', null)]
    const intel = buildDraftIntel({
      snapshot: s,
      myRole: 'bottom',
      suggestions: [suggestion(22, 'Ashe')],
      idToName: names
    })

    expect(intel?.compIdentity.missing).toContain('magic damage')
    expect(intel?.compIdentity.missing).toContain('frontline')
  })

  it('maps champion pool preferences to comfort weights', () => {
    expect(championPoolPreferenceToComfort('main')).toBeGreaterThan(championPoolPreferenceToComfort('comfortable'))
    expect(championPoolPreferenceToComfort('never')).toBeLessThan(championPoolPreferenceToComfort('learning'))
  })
})
