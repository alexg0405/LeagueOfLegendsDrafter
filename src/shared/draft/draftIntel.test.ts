import { describe, expect, it } from 'vitest'
import { buildDraftIntel, championPoolPreferenceToComfort } from './draftIntel'
import type { DraftSnapshot, PickSuggestion } from './types'
import type { ItemLite } from '../dataDragon'

const names = new Map<number, string>([
  [81, 'Ezreal'],
  [51, 'Caitlyn'],
  [119, 'Draven'],
  [238, 'Zed'],
  [157, 'Yasuo'],
  [64, 'Lee Sin'],
  [22, 'Ashe'],
  [412, 'Thresh'],
  [32, 'Amumu'],
  [54, 'Malphite'],
  [99, 'Lux'],
  [115, 'Ziggs'],
  [267, 'Nami']
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

function item(id: number, name: string, description: string, tags: string[], stats: Record<string, number>, total: number): ItemLite {
  return {
    id,
    name,
    description,
    plaintext: description,
    tags,
    stats,
    gold: { base: total, total, sell: Math.round(total * 0.7), purchasable: true },
    maps: { 11: true }
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

  it('builds item plans around enemy comp and ally damage needs', () => {
    const s = snapshot()
    s.ally = [slot('top', 51), slot('jungle', 119), slot('middle', 238), slot('bottom', 81), slot('support', null)]
    s.enemy = [slot('top', 54), slot('jungle', 32), slot('middle', 99), slot('bottom', 115), slot('support', 267)]
    const ezreal = suggestion(81, 'Ezreal')
    ezreal.buildProfile = {
      ...ezreal.buildProfile!,
      damage: 'flex',
      itemHint: 'Manamune core can pivot toward physical DPS or AP poke depending on team damage.'
    }

    const intel = buildDraftIntel({
      snapshot: s,
      myRole: 'bottom',
      suggestions: [ezreal],
      idToName: names
    })

    const plan = intel?.matchupPlans[0]?.itemPlan
    expect(plan?.core).toMatch(/Manamune/)
    expect(plan?.boots).toMatch(/Mercury/)
    expect(plan?.situational.join(' ')).toMatch(/Anti-tank/)
    expect(plan?.situational.join(' ')).toMatch(/Anti-heal/)
    expect(plan?.situational.join(' ')).toMatch(/Team damage/)
    expect(plan?.notes.join(' ')).toMatch(/Ziggs/)
  })

  it('adds rich item ids and matrix rows when an item catalog is available', () => {
    const s = snapshot()
    s.enemy = [slot('top', 54), slot('jungle', 32), slot('middle', 99), slot('bottom', 115), slot('support', 267)]
    const intel = buildDraftIntel({
      snapshot: s,
      myRole: 'bottom',
      suggestions: [suggestion(81, 'Ezreal')],
      idToName: names,
      championMetaById: new Map([
        [54, { tags: ['Tank'], partype: 'Mana', spells: [{ name: 'Unstoppable Force', description: 'Knocks enemies up.', tooltip: '' }] }],
        [267, { tags: ['Support'], partype: 'Mana', spells: [{ name: 'Ebb and Flow', description: 'Heals an ally and shields them with water.', tooltip: '' }] }]
      ]),
      itemCatalog: [
        item(1055, "Doran's Blade", 'Starter attack damage and health.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 10, FlatHPPoolMod: 80 }, 450),
        item(1037, 'Pickaxe', 'Attack damage component.', ['Damage'], { FlatPhysicalDamageMod: 25 }, 875),
        item(3111, "Mercury's Treads", 'Magic Resist and Tenacity.', ['Boots', 'SpellBlock'], { FlatSpellBlockMod: 25 }, 1200),
        item(3165, 'Morellonomicon', 'Ability Power and Grievous Wounds.', ['SpellDamage'], { FlatMagicDamageMod: 75 }, 2900),
        item(3071, 'Black Cleaver', 'Attack damage, health, and armor reduction.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 40, FlatHPPoolMod: 400 }, 3000)
      ]
    })

    const plan = intel?.matchupPlans[0]?.itemPlan
    expect(plan?.starting?.[0]?.itemId).toBe(1055)
    expect(plan?.bootChoice?.name).toMatch(/Mercury/)
    expect(plan?.matrixRows?.some((row) => row.tags.includes('anti-heal'))).toBe(true)
    expect(plan?.threatSummary?.map((row) => row.label)).toEqual(expect.arrayContaining(['Hard CC', 'Healing']))
  })

  it('maps champion pool preferences to comfort weights', () => {
    expect(championPoolPreferenceToComfort('main')).toBeGreaterThan(championPoolPreferenceToComfort('comfortable'))
    expect(championPoolPreferenceToComfort('never')).toBeLessThan(championPoolPreferenceToComfort('learning'))
  })
})
