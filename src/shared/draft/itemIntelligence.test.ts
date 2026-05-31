import { describe, expect, it } from 'vitest'
import type { ItemLite } from '../dataDragon'
import type { DraftItemRef } from './types'
import { buildAdaptiveItemPlan, championKitProfileFromTexts, classifyItem } from './itemIntelligence'

function item(
  id: number,
  name: string,
  description: string,
  tags: string[],
  stats: Record<string, number>,
  total: number,
  extra: Partial<ItemLite> = {}
): ItemLite {
  return {
    id,
    name,
    description,
    plaintext: description,
    tags,
    stats,
    gold: { base: total, total, sell: Math.round(total * 0.7), purchasable: true },
    maps: { 11: true },
    ...extra
  }
}

function ref(row: ItemLite, phase: DraftItemRef['phase'] = 'completed'): DraftItemRef {
  return {
    itemId: row.id,
    name: row.name,
    reason: 'Default build path',
    score: 100,
    tags: classifyItem(row).tags,
    phase,
    cost: row.gold.total
  }
}

const catalog: ItemLite[] = [
  item(1055, "Doran's Blade", 'Starter attack damage and health.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 10, FlatHPPoolMod: 80 }, 450),
  item(1037, 'Pickaxe', 'Attack damage component.', ['Damage'], { FlatPhysicalDamageMod: 25 }, 875, { into: ['3031'] }),
  item(3111, "Mercury's Treads", 'Magic Resist, Move Speed, and Tenacity.', ['Boots', 'SpellBlock'], { FlatSpellBlockMod: 25 }, 1200),
  item(3047, 'Plated Steelcaps', 'Armor and protection from basic attacks.', ['Boots', 'Armor'], { FlatArmorMod: 25 }, 1200),
  item(3165, 'Morellonomicon', 'Ability Power. Damaging champions applies Grievous Wounds.', ['SpellDamage'], { FlatMagicDamageMod: 75 }, 2900),
  item(3135, 'Void Staff', 'Ability Power and magic penetration for tanks.', ['SpellDamage'], { FlatMagicDamageMod: 95 }, 3000),
  item(3157, "Zhonya's Hourglass", 'Ability Power, Armor, and Stasis for burst defense.', ['SpellDamage', 'Armor'], { FlatMagicDamageMod: 105, FlatArmorMod: 50 }, 3250),
  item(6695, "Serpent's Fang", 'Lethality. Shield Reaver reduces enemy shields.', ['Damage'], { FlatPhysicalDamageMod: 55 }, 2500),
  item(3031, 'Infinity Edge', 'Attack Damage and Critical Strike.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 75, FlatCritChanceMod: 0.25 }, 3450),
  item(3071, 'Black Cleaver', 'Attack damage and health. Reduces enemy armor.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 40, FlatHPPoolMod: 400 }, 3000)
]

describe('item intelligence', () => {
  it('classifies common counter item tags', () => {
    expect(classifyItem(catalog[2]!).tags).toEqual(expect.arrayContaining(['boots', 'mr', 'anti-cc']))
    expect(classifyItem(catalog[4]!).tags).toEqual(expect.arrayContaining(['ap', 'anti-heal']))
    expect(classifyItem(catalog[7]!).tags).toEqual(expect.arrayContaining(['ad', 'anti-shield']))
    expect(classifyItem(catalog[9]!).tags).toEqual(expect.arrayContaining(['ad', 'health', 'anti-tank']))
  })

  it('parses champion spell text for combat signals', () => {
    const kit = championKitProfileFromTexts([
      'Fires a long range projectile that stuns the first champion hit.',
      'Dashes to an ally and grants them a shield.',
      'Heals based on missing health.'
    ])

    expect(kit.hardCc).toBe(true)
    expect(kit.shield).toBe(true)
    expect(kit.heal).toBe(true)
    expect(kit.mobility).toBe(true)
    expect(kit.poke).toBe(true)
  })

  it('scores adaptive builds for AP, CC, healing, shields, tanks, and ally damage gaps', () => {
    const plan = buildAdaptiveItemPlan(catalog, {
      championName: 'Ezreal',
      role: 'bottom',
      buildProfile: {
        damage: 'flex',
        archetype: 'Marksman',
        buildHint: 'Flexible poke carry.',
        itemHint: 'Adapt damage type to team needs.',
        tagsLine: 'Marksman',
        partype: 'Mana'
      },
      ally: { magic: 0, physical: 3, frontline: 0, engage: 1, scaling: 2, slots: 4 },
      enemy: {
        magic: 4,
        physical: 1,
        frontline: 3,
        tanks: 2,
        assassins: 2,
        supports: 2,
        dive: 3,
        poke: 3,
        pick: 3,
        sustain: 2,
        marksmen: 1,
        hardCc: 3,
        healing: 2,
        shielding: 2,
        mobility: 2,
        burst: 2
      },
      laneThreat: 'ap',
      fallback: {
        core: 'Fallback core',
        boots: 'Fallback boots',
        defensive: 'Fallback defense',
        situational: [],
        notes: []
      }
    })

    const allNames = [
      ...(plan.bootChoice ? [plan.bootChoice.name] : []),
      ...(plan.situationalItems ?? []).map((row) => row.name),
      ...(plan.matrixRows ?? []).slice(0, 12).map((row) => row.name)
    ].join(' ')

    expect(plan.threatSummary?.map((row) => row.label)).toEqual(expect.arrayContaining(['Heavy AP', 'Hard CC', 'Healing', 'Shields', 'Frontline', 'Missing AP']))
    expect(allNames).toMatch(/Mercury/)
    expect(allNames).toMatch(/Morellonomicon/)
    expect(allNames).toMatch(/Void Staff|Black Cleaver/)
    expect(allNames).toMatch(/Serpent/)
    expect(allNames).toMatch(/Zhonya/)
  })

  it('keeps default build items first and targets enemy icons for situational counters', () => {
    const plan = buildAdaptiveItemPlan(catalog, {
      championName: 'Tristana',
      role: 'bottom',
      buildProfile: {
        damage: 'ad',
        archetype: 'Marksman',
        buildHint: 'Crit carry.',
        itemHint: 'Default crit path.',
        tagsLine: 'Marksman',
        partype: 'Mana'
      },
      ally: { magic: 1, physical: 2, frontline: 1, engage: 1, scaling: 2, slots: 4 },
      enemy: {
        magic: 1,
        physical: 3,
        frontline: 2,
        tanks: 1,
        assassins: 0,
        supports: 1,
        dive: 1,
        poke: 1,
        pick: 1,
        sustain: 2,
        marksmen: 1,
        hardCc: 1,
        healing: 2,
        shielding: 0,
        mobility: 1,
        burst: 1
      },
      enemyDetails: [
        {
          championId: 267,
          name: 'Nami',
          threat: 'utility',
          classes: ['support'],
          hardCc: true,
          healing: true,
          shielding: false,
          mobility: false,
          burst: false,
          poke: true,
          defaultBuildTags: ['sustain']
        }
      ],
      defaultBuild: {
        source: 'ugg',
        starting: [ref(catalog[0]!, 'starter')],
        boots: [ref(catalog[3]!, 'boots')],
        core: [ref(catalog[8]!)],
        final: [ref(catalog[3]!, 'boots'), ref(catalog[8]!)],
        defaultItemIds: [1055, 3047, 3031]
      },
      laneThreat: 'ad',
      fallback: {
        core: 'Fallback core',
        boots: 'Fallback boots',
        defensive: 'Fallback defense',
        situational: [],
        notes: []
      }
    })

    expect(plan.defaultBuildSource).toBe('ugg')
    expect(plan.defaultItemIds).toEqual(expect.arrayContaining([1055, 3047, 3031]))
    expect(plan.matrixRows?.[0]?.itemId).toBe(1055)
    const antiHeal = plan.matrixRows?.find((row) => row.tags.includes('anti-heal'))
    expect(antiHeal?.enemyTargets?.[0]).toMatchObject({ championId: 267, championName: 'Nami', source: 'defaultBuild' })
  })
})
