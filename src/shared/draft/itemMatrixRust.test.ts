import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { build_item_matrix_plans_json, initSync } from '../../renderer/src/wasm/nexus-draft-core/nexus_draft_core'
import { buildDraftItemMatrixPlans } from './draftIntel'
import { normalizeMatrixPlanForParity, serializeItemMatrixInput } from './itemMatrixRust'
import type { DraftSnapshot, PickSuggestion } from './types'
import type { ItemLite } from '../dataDragon'

const names = new Map<number, string>([
  [18, 'Tristana'],
  [51, 'Caitlyn'],
  [54, 'Malphite'],
  [99, 'Lux'],
  [267, 'Nami']
])

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

const itemCatalog: ItemLite[] = [
  item(1055, "Doran's Blade", 'Starter attack damage and health.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 10, FlatHPPoolMod: 80 }, 450),
  item(3006, "Berserker's Greaves", 'Boots with attack speed.', ['Boots', 'AttackSpeed'], { PercentAttackSpeedMod: 0.25 }, 1100),
  item(6676, 'The Collector', 'Attack damage, critical strike, and lethality.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 50 }, 3000),
  item(3031, 'Infinity Edge', 'Attack damage and critical strike.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 75 }, 3500),
  item(3036, "Lord Dominik's Regards", 'Armor penetration into high health enemies.', ['Damage'], { FlatPhysicalDamageMod: 35 }, 3300),
  item(3033, 'Mortal Reminder', 'Armor penetration and Grievous Wounds.', ['Damage'], { FlatPhysicalDamageMod: 35 }, 3000),
  item(3085, "Runaan's Hurricane", 'Attack speed and critical strike.', ['AttackSpeed', 'CriticalStrike'], { PercentAttackSpeedMod: 0.4 }, 2650),
  item(3071, 'Black Cleaver', 'Attack damage, health, and armor reduction.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 40, FlatHPPoolMod: 400 }, 3000),
  item(3111, "Mercury's Treads", 'Magic Resist and Tenacity.', ['Boots', 'SpellBlock'], { FlatSpellBlockMod: 25 }, 1200)
]

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
    ally: [slot('top', null), slot('jungle', null), slot('middle', null), slot('bottom', 18), slot('support', null)],
    enemy: [slot('top', 54), slot('jungle', null), slot('middle', 99), slot('bottom', 51), slot('support', 267)],
    myTeam: '100',
    myRole: 'bottom',
    localPlayerCellId: 3,
    bans: [],
    myPickOrder: null
  }
}

function suggestion(): PickSuggestion {
  return {
    championId: 18,
    championName: 'Tristana',
    score: 1.1,
    reasons: ['lane_counter', 'team_synergy'],
    runes: {
      primaryTree: 'Precision',
      keystone: 'Press the Attack',
      secondary: 'Resolve'
    },
    buildProfile: {
      damage: 'ad',
      archetype: 'Marksman',
      buildHint: '',
      tagsLine: 'Marksman',
      partype: 'Mana'
    }
  }
}

describe('Rust item matrix parity', () => {
  it('matches TypeScript default build ids and enemy-target shape for a representative bottom plan', () => {
    initSync({ module: readFileSync(new URL('../../renderer/src/wasm/nexus-draft-core/nexus_draft_core_bg.wasm', import.meta.url)) })
    const args = {
      snapshot: snapshot(),
      myRole: 'bottom' as const,
      suggestions: [suggestion()],
      idToName: names,
      championMetaById: new Map([
        [54, { tags: ['Tank'], partype: 'Mana', spells: [{ name: 'Unstoppable Force', description: 'Knocks enemies up.', tooltip: '' }] }],
        [99, { tags: ['Mage'], partype: 'Mana', spells: [{ name: 'Light Binding', description: 'Roots and bursts enemies at long range.', tooltip: '' }] }],
        [267, { tags: ['Support'], partype: 'Mana', spells: [{ name: 'Ebb and Flow', description: 'Heals an ally and shields them.', tooltip: '' }] }]
      ]),
      enemyRoleInference: null,
      itemCatalog
    }
    const tsPlan = buildDraftItemMatrixPlans(args)[0]!
    const rustRaw = build_item_matrix_plans_json(JSON.stringify(serializeItemMatrixInput(args)))
    const rustPlan = (JSON.parse(rustRaw) as typeof tsPlan[])[0]!
    const tsComparable = normalizeMatrixPlanForParity(tsPlan)
    const rustComparable = normalizeMatrixPlanForParity(rustPlan)

    expect(rustComparable.defaultBuildSource).toBe(tsComparable.defaultBuildSource)
    expect(rustComparable.defaultItemIds).toEqual(tsComparable.defaultItemIds)
    expect(rustComparable.buildIds.slice(0, 6)).toEqual(tsComparable.buildIds.slice(0, 6))
    expect(rustComparable.matrixRows.some((row) => row.role === 'situational' && row.targetIds.length > 0)).toBe(true)
  })
})
