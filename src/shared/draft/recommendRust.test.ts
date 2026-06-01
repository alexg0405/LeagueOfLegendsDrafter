import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { initSync, recommend_picks_json } from '../../renderer/src/wasm/nexus-draft-core/nexus_draft_core'
import { hydrateRustRecommendations, serializeRecommendInput, type RustRecommendOutput } from './recommendRust'
import { suggestPicks, type SuggestPicksArgs } from './suggestPicks'
import type { DraftSnapshot } from './types'

const idToName = new Map<number, string>([
  [18, 'Tristana'],
  [21, 'Miss Fortune'],
  [22, 'Ashe'],
  [29, 'Twitch'],
  [51, 'Caitlyn'],
  [81, 'Ezreal'],
  [99, 'Lux'],
  [119, 'Draven'],
  [238, 'Zed']
])

function open(role: DraftSnapshot['ally'][number]['role']): DraftSnapshot['ally'][number] {
  return { role, championId: null, championName: null, cellId: null }
}

function bottomSnapshot(): DraftSnapshot {
  return {
    ally: [open('top'), open('jungle'), open('middle'), { ...open('bottom'), cellId: 4 }, open('support')],
    enemy: [
      open('top'),
      open('jungle'),
      { role: 'middle', championId: 99, championName: 'Lux', cellId: null },
      { role: 'bottom', championId: 51, championName: 'Caitlyn', cellId: null },
      open('support')
    ],
    myTeam: '100',
    myRole: 'bottom',
    localPlayerCellId: 4,
    bans: [22],
    myPickOrder: 3
  }
}

function runRust(args: SuggestPicksArgs) {
  initSync({ module: readFileSync(new URL('../../renderer/src/wasm/nexus-draft-core/nexus_draft_core_bg.wasm', import.meta.url)) })
  const raw = recommend_picks_json(JSON.stringify(serializeRecommendInput(args)))
  const parsed = JSON.parse(raw) as RustRecommendOutput
  expect(parsed.ok).toBe(true)
  expect(Array.isArray(parsed.rows)).toBe(true)
  return {
    suggestions: hydrateRustRecommendations(parsed.rows ?? [], args),
    patchLabel: parsed.patchLabel
  }
}

describe('Rust recommend parity', () => {
  it('matches TypeScript candidate filtering and top recommendation shape', () => {
    const args: SuggestPicksArgs = {
      myRole: 'bottom',
      snapshot: bottomSnapshot(),
      idToName,
      maxResults: 5,
      monteCarloSamples: 0,
      candidateChampionIds: [18, 21, 22, 29, 119]
    }
    const ts = suggestPicks(args)
    const rust = runRust(args)

    expect(rust.patchLabel).toBe(ts.patchLabel)
    expect(rust.suggestions.map((row) => row.championId)).toEqual(ts.suggestions.map((row) => row.championId))
    expect(rust.suggestions.every((row) => row.championId !== 22)).toBe(true)
    expect(rust.suggestions[0]?.runes?.keystone).toBeDefined()
    expect(rust.suggestions[0]?.buildProfile?.damage).toBeDefined()
  })

  it('keeps Monte Carlo deterministic for the same seed', () => {
    const args: SuggestPicksArgs = {
      myRole: 'bottom',
      snapshot: bottomSnapshot(),
      idToName,
      maxResults: 4,
      monteCarloSamples: 4,
      rngSeed: 1234,
      candidateChampionIds: [18, 21, 29, 119]
    }
    const a = runRust(args)
    const b = runRust(args)

    expect(a.patchLabel).toBe('engine-v1+mc(4)')
    expect(a.suggestions.map((row) => [row.championId, row.estWin, row.lookaheadRisk])).toEqual(
      b.suggestions.map((row) => [row.championId, row.estWin, row.lookaheadRisk])
    )
  })
})
