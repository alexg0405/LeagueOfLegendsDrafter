import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { build_draft_intel_json, initSync } from '../../renderer/src/wasm/nexus-draft-core/nexus_draft_core'
import { buildDraftIntel } from './draftIntel'
import { serializeDraftIntelInput } from './draftIntelRust'
import type { DraftIntel, DraftSnapshot, PickSuggestion } from './types'

const names = new Map<number, string>([
  [22, 'Ashe'],
  [51, 'Caitlyn'],
  [64, 'Lee Sin'],
  [81, 'Ezreal'],
  [119, 'Draven'],
  [157, 'Yasuo'],
  [238, 'Zed'],
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
      tagsLine: 'Marksman',
      partype: 'Mana'
    }
  }
}

function runRust(args: Parameters<typeof buildDraftIntel>[0]): DraftIntel | null {
  initSync({ module: readFileSync(new URL('../../renderer/src/wasm/nexus-draft-core/nexus_draft_core_bg.wasm', import.meta.url)) })
  return JSON.parse(build_draft_intel_json(JSON.stringify(serializeDraftIntelInput(args)))) as DraftIntel | null
}

describe('Rust DraftIntel parity', () => {
  it('preserves bans, matchup shell, and draft identity for a representative board', () => {
    const args = {
      snapshot: snapshot(),
      myRole: 'bottom' as const,
      suggestions: [suggestion(81, 'Ezreal')],
      idToName: names,
      includeItemPlans: false
    }
    const ts = buildDraftIntel(args)!
    const rust = runRust(args)!
    const unavailable = new Set([81, 51, 119, 157, 64, 238, 412])

    expect(rust).not.toBeNull()
    expect(rust.banRecommendations.length).toBeGreaterThan(0)
    expect(rust.banRecommendations.every((row) => !unavailable.has(row.championId))).toBe(true)
    expect(rust.banRecommendations.map((row) => row.championId)).toEqual(ts.banRecommendations.map((row) => row.championId))
    expect(rust.matchupPlans[0]?.laneOpponentName).toBe(ts.matchupPlans[0]?.laneOpponentName)
    expect(rust.matchupPlans[0]?.startingItem).toBe(ts.matchupPlans[0]?.startingItem)
    expect(rust.compIdentity.missing).toEqual(ts.compIdentity.missing)
    expect(rust.loadingBrief.length).toBeGreaterThan(0)
  })

  it('builds preview item plans in Rust for runtime card rows', () => {
    const args = {
      snapshot: snapshot(),
      myRole: 'bottom' as const,
      suggestions: [suggestion(81, 'Ezreal')],
      idToName: names,
      includeItemPlans: true
    }
    const rust = runRust(args)!
    const plan = rust.matchupPlans[0]

    expect(plan?.itemPlan).toBeTruthy()
    expect(plan?.itemPlan?.core).toContain('DPS')
    expect(rust.itemMatrixPlans).toBeUndefined()
  })
})
