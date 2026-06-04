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
  item(3033, 'Mortal Reminder', 'Attack damage, critical strike, armor penetration, and Grievous Wounds.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 35, FlatCritChanceMod: 0.25 }, 3000),
  item(3071, 'Black Cleaver', 'Attack damage and health. Reduces enemy armor.', ['Damage', 'Health'], { FlatPhysicalDamageMod: 40, FlatHPPoolMod: 400 }, 3000)
]

describe('item intelligence', () => {
  it('classifies common counter item tags', () => {
    expect(classifyItem(catalog[2]!).tags).toEqual(expect.arrayContaining(['boots', 'mr', 'anti-cc']))
    expect(classifyItem(catalog[4]!).tags).toEqual(expect.arrayContaining(['ap', 'anti-heal']))
    expect(classifyItem(catalog[7]!).tags).toEqual(expect.arrayContaining(['ad', 'anti-shield']))
    expect(classifyItem(catalog[10]!).tags).toEqual(expect.arrayContaining(['ad', 'health', 'anti-tank']))
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

  it('dedupes situational and final build items by display name with default rows winning', () => {
    const ardent = item(3504, 'Ardent Censer', 'Heal and shield power for allies.', ['SpellDamage', 'ManaRegen'], { FlatMagicDamageMod: 45 }, 2200)
    const duplicateArdent = item(9504, 'Ardent Censer', 'Heal and shield power for allies.', ['SpellDamage', 'ManaRegen'], { FlatMagicDamageMod: 45 }, 2200)
    const plan = buildAdaptiveItemPlan([...catalog, ardent, duplicateArdent], {
      championName: 'Lulu',
      role: 'support',
      buildProfile: {
        damage: 'ap',
        archetype: 'Support enchanter',
        buildHint: 'Buff allies.',
        itemHint: 'Default enchanter path.',
        tagsLine: 'Support Mage',
        partype: 'Mana'
      },
      ally: { magic: 1, physical: 2, frontline: 1, engage: 1, scaling: 2, slots: 4 },
      enemy: {
        magic: 2,
        physical: 2,
        frontline: 2,
        tanks: 1,
        assassins: 1,
        supports: 1,
        dive: 2,
        poke: 2,
        pick: 2,
        sustain: 2,
        marksmen: 1,
        hardCc: 2,
        healing: 2,
        shielding: 2,
        mobility: 1,
        burst: 1
      },
      defaultBuild: {
        source: 'ugg',
        starting: [],
        boots: [],
        core: [ref(ardent)],
        final: [],
        defaultItemIds: [3504]
      },
      laneThreat: 'hybrid',
      fallback: {
        core: 'Fallback core',
        boots: 'Fallback boots',
        defensive: 'Fallback defense',
        situational: [],
        notes: []
      }
    })
    for (const rows of [plan.matrixRows ?? [], plan.situationalItems ?? [], plan.finalBuild ?? []]) {
      const names = rows.map((row) => row.name.toLowerCase())
      expect(names.filter((name) => name === 'ardent censer')).toHaveLength(names.includes('ardent censer') ? 1 : 0)
    }
    expect(plan.matrixRows?.find((row) => row.name === 'Ardent Censer')?.itemId).toBe(3504)
  })

  it('does not score stale Arena or ARAM-only items even if they are in a cached catalog', () => {
    const arenaItem = item(443056, "Demon King's Crown", 'Arena-only scaling crown.', ['Health'], { FlatHPPoolMod: 300 }, 2500)
    const aramOnlyItem = item(9005, 'Mode Only Item', 'Mode-only item.', ['Damage'], { FlatPhysicalDamageMod: 45 }, 2600, { maps: { 11: true }, requiredChampion: 'ModeOnly' })
    const plan = buildAdaptiveItemPlan([...catalog, arenaItem, aramOnlyItem], {
      championName: 'Aatrox',
      role: 'top',
      buildProfile: {
        damage: 'ad',
        archetype: 'Fighter',
        buildHint: 'Bruiser path.',
        itemHint: 'Use current Summoner Rift items.',
        tagsLine: 'Fighter',
        partype: 'None'
      },
      ally: { magic: 1, physical: 2, frontline: 1, engage: 1, scaling: 2, slots: 4 },
      enemy: {
        magic: 1,
        physical: 3,
        frontline: 2,
        tanks: 1,
        assassins: 1,
        supports: 1,
        dive: 2,
        poke: 2,
        pick: 2,
        sustain: 2,
        marksmen: 1,
        hardCc: 2,
        healing: 2,
        shielding: 1,
        mobility: 1,
        burst: 1
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

    const ids = new Set([
      ...(plan.matrixRows ?? []).map((row) => row.itemId),
      ...(plan.situationalItems ?? []).map((row) => row.itemId),
      ...(plan.finalBuild ?? []).map((row) => row.itemId)
    ])
    expect(ids.has(443056)).toBe(false)
    expect(ids.has(9005)).toBe(false)
  })

  it('does not use specialist on-hit and hybrid items as generic pure marksman fallback cores', () => {
    const critCatalog = [
      item(6676, 'The Collector', 'Attack damage, crit, and armor penetration.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 50, FlatCritChanceMod: 0.25 }, 3000),
      item(3031, 'Infinity Edge', 'Attack damage and critical strike.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 75, FlatCritChanceMod: 0.25 }, 3500),
      item(3036, "Lord Dominik's Regards", 'Attack damage, crit, and armor penetration.', ['Damage', 'CriticalStrike'], { FlatPhysicalDamageMod: 35, FlatCritChanceMod: 0.25 }, 3300),
      item(3124, "Guinsoo's Rageblade", 'Attack damage, ability power, attack speed, and on-hit damage.', ['Damage', 'SpellDamage', 'AttackSpeed', 'OnHit'], { FlatPhysicalDamageMod: 30, FlatMagicDamageMod: 30, PercentAttackSpeedMod: 0.25 }, 3000),
      item(3146, 'Hextech Gunblade', 'Attack damage, ability power, and omnivamp.', ['Damage', 'SpellDamage'], { FlatPhysicalDamageMod: 40, FlatMagicDamageMod: 80 }, 3000),
      item(3087, 'Statikk Shiv', 'Attack damage, ability power, attack speed, and on-hit chain lightning.', ['Damage', 'SpellDamage', 'AttackSpeed', 'OnHit'], { FlatPhysicalDamageMod: 45, FlatMagicDamageMod: 30, PercentAttackSpeedMod: 0.3 }, 3000)
    ]

    const plan = buildAdaptiveItemPlan(critCatalog, {
      championName: 'Caitlyn',
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
        physical: 2,
        frontline: 2,
        tanks: 1,
        assassins: 1,
        supports: 1,
        dive: 1,
        poke: 1,
        pick: 1,
        sustain: 1,
        marksmen: 1,
        hardCc: 1,
        healing: 1,
        shielding: 1,
        mobility: 1,
        burst: 1
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

    const coreNames = plan.coreBuild?.map((row) => row.name) ?? []
    expect(coreNames).toHaveLength(3)
    expect(coreNames).toEqual(expect.arrayContaining(['Infinity Edge', "Lord Dominik's Regards", 'The Collector']))
    expect(coreNames).not.toEqual(expect.arrayContaining(["Guinsoo's Rageblade", 'Hextech Gunblade', 'Statikk Shiv']))
  })
})
