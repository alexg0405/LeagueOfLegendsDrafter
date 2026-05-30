import type { ChampionBuildProfile, DraftRole } from './types'
import { getChampionThreatOverride } from './championThreatOverrides'

function unknownProfile(role: DraftRole, partype: string | undefined): ChampionBuildProfile {
  const p = partype && partype !== 'None' && partype !== 'Unknown' ? partype : 'Mana/HP'
  const roleLine =
    role === 'top'
      ? 'Top: tank, bruiser, or split — runes to match Grasp, Conqueror, or Stormraider.'
      : role === 'jungle'
        ? 'Jungle: tank, AP, or bruiser clear — bami vs liandry etc.'
        : role === 'middle'
          ? 'Mid: often AP, some AD; match lane and jungle damage.'
          : role === 'bottom'
            ? 'Bot: marksmen and rare mages — crit vs on-hit vs AP off-meta.'
            : role === 'support'
              ? 'Support: enchanter AP, tank, or catch — locket vs shurelya.'
              : 'Open the main app to load Data Dragon and show AD/AP from Riot tags.'
  return {
    damage: 'mixed',
    archetype: 'unspecified',
    buildHint: `No tag data — ${roleLine}`,
    tagsLine: '—',
    partype: p
  }
}

function overrideProfile(
  championName: string,
  partype: string | undefined
): ChampionBuildProfile | null {
  const o = getChampionThreatOverride(championName)
  if (!o) {
    return null
  }
  const p = partype && partype !== 'None' && partype !== 'Unknown' ? partype : 'Mana/HP'
  const damage: ChampionBuildProfile['damage'] =
    o.threat === 'hybrid' ? 'mixed' : o.threat === 'utility' ? 'mixed' : o.threat
  const threatLabel =
    o.threat === 'ap'
      ? 'AP'
      : o.threat === 'ad'
        ? 'AD'
        : o.threat === 'hybrid'
          ? 'Hybrid'
          : 'Utility'
  return {
    damage,
    archetype: o.classes.join(' / '),
    buildHint: `${threatLabel} threat with ${o.classes.join(' / ')} role.`,
    tagsLine: o.classes.join(' · '),
    partype: p
  }
}

function genericPatchItemHint(tags: Set<string>): string {
  if (tags.has('Tank') && tags.has('Support')) {
    return "Patch 26.11 buffs Locket and Knight's Vow while making Zeke's easier to trigger; tank supports can lean harder into engage and peel utility."
  }
  if (tags.has('Support') && tags.has('Mage')) {
    return 'Patch 26.11 reworks Imperial Mandate for CC utility casters and trims Helia, so choose support items around lockdown, peel, or poke uptime.'
  }
  if (tags.has('Assassin')) {
    return "Opportunity is removed. Voltaic Cyclosword is the upfront burst option, Axiom Arc is weaker early but scales harder with lethality, and Hubris snowballs harder after stacks."
  }
  if (tags.has('Marksman') && (tags.has('Mage') || tags.has('Fighter'))) {
    return "Patch 26.11 adds more AD to Statikk Shiv, keeping on-hit and hybrid marksman paths attractive when the draft needs mixed threat."
  }
  if (tags.has('Marksman')) {
    return "Doran's Bow is a greedy lane start, while the 26.11 Statikk Shiv AD buff supports scaling on-hit and hybrid teamfight value."
  }
  if (tags.has('Fighter')) {
    return "Gluttonous Greaves add sustain boots for fighters, Endless Hunger gives more melee ability haste from bonus AD, and Doran's Helm is a resist start into mixed poke."
  }
  if (tags.has('Tank')) {
    return "Patch 26.11 improves Heartsteel's permanent-health conversion; tank supports also gained stronger Locket and Knight's Vow incentives."
  }
  if (tags.has('Mage')) {
    return 'Patch 26.11 makes Deathfire Touch deal magic damage only; sustained and DoT casters still like it when fights last long enough.'
  }
  return "Patch 26.11 updates support items, Heartsteel, Statikk Shiv, and Deathfire Touch; keep item paths matched to your draft role."
}

/**
 * Derive build direction from Riot DDragon `tags` (Fighter, Tank, Mage, Assassin, Marksman, Support).
 * Order of branches matters.
 */
export function buildProfileFromDDragonTags(
  tags: string[],
  partype: string
): Pick<ChampionBuildProfile, 'damage' | 'archetype' | 'buildHint' | 'itemHint'> {
  const t = new Set(tags)
  const pt = partype && partype.trim() ? partype : 'None'
  const mp = (s: string) => `Resource: ${pt} — ${s}`
  const itemHint = genericPatchItemHint(t)

  if (t.has('Mage') && t.has('Marksman')) {
    return {
      damage: 'flex',
      archetype: 'hybrid carry',
      buildHint: mp(
        'AD crit / on-hit or AP poke; Corki-style often Muramana + mixed pen — set runes to match the game plan.'
      ),
      itemHint
    }
  }
  if (t.has('Tank') && t.has('Mage')) {
    return {
      damage: 'mixed',
      archetype: 'AP tank',
      buildHint: mp("HP + resists + burn/abyss options; Bami or Jak'Sho-style tank cores when frontlining."),
      itemHint
    }
  }
  if (t.has('Tank') && t.has('Fighter')) {
    return {
      damage: 'mixed',
      archetype: 'juggernaut',
      buildHint: mp('Grasp/Conqueror + HP+AD/HP+AP; split between bruiser and full tank as needed.'),
      itemHint
    }
  }
  if (t.has('Tank') && t.has('Support')) {
    return {
      damage: 'mixed',
      archetype: 'warden / engage tank',
      buildHint: mp("Aftershock/Guardian + locket/abyss; peel or all-in to comp's engage."),
      itemHint
    }
  }
  if (t.has('Tank')) {
    return {
      damage: 'mixed',
      archetype: 'tank',
      buildHint: mp("Resist + HP; Sunfire, Heartsteel, or Jak'Sho-style tank cores; adapt vs lane damage (AD/AP)."),
      itemHint
    }
  }
  if (t.has('Support') && t.has('Mage')) {
    return {
      damage: 'ap',
      archetype: 'enchanter / mage support',
      buildHint: mp('Moonstone, Shurelya, or Redemption — CDR, enchanter items; sometimes tank if vs dive.'),
      itemHint
    }
  }
  if (t.has('Support') && t.has('Assassin')) {
    return {
      damage: 'mixed',
      archetype: 'catch / burst support',
      buildHint: mp('Often hybrid — cheap damage + control; Hextech/Imperial or tank utility in tough lanes.'),
      itemHint
    }
  }
  if (t.has('Support')) {
    return {
      damage: 'ap',
      archetype: 'support (flex)',
      buildHint: mp("Tank, enchanter, or mage support — Riot's tags don't split hook vs heal; use lane matchup."),
      itemHint
    }
  }
  if (t.has('Mage') && t.has('Assassin')) {
    return {
      damage: 'ap',
      archetype: 'AP burst / AP assassin',
      buildHint: mp('Ludens/Protobelt + pen (Shadowflame) — one-shot Electrocute or long-range Comet by lane burst.'),
      itemHint
    }
  }
  if (t.has('Mage') && t.has('Fighter')) {
    return {
      damage: 'ap',
      archetype: 'AP fighter (battlemage)',
      buildHint: mp('Riftmaker/Dusk and Dawn, sometimes Nashor — short-range sustained AP; some builds add resists early.'),
      itemHint
    }
  }
  if (t.has('Mage')) {
    return {
      damage: 'ap',
      archetype: 'mage',
      buildHint: mp('Ludens, Liandry, or Rod — scaling vs control; mana items vs tear routes.'),
      itemHint
    }
  }
  if (t.has('Assassin') && t.has('Fighter')) {
    return {
      damage: 'ad',
      archetype: 'diver / skirmisher',
      buildHint: mp('Bruiser AD (Eclipse, Cleaver, Sterak) or full lethality; pick vs squishy vs tanky team.'),
      itemHint
    }
  }
  if (t.has('Assassin')) {
    return {
      damage: 'ad',
      archetype: 'assassin',
      buildHint: mp("Lethality core (Voltaic, Youmuu's, Hubris/Axiom) — snowball; some AP assassins are tagged Mage+Assassin above."),
      itemHint
    }
  }
  if (t.has('Fighter') && t.has('Marksman')) {
    return {
      damage: 'flex',
      archetype: 'ranged-melee / poke carry',
      buildHint: mp('Often poke AD (lethality) or on-hit; rare hybrid — match team AD/AP needs.'),
      itemHint
    }
  }
  if (t.has('Fighter')) {
    return {
      damage: 'ad',
      archetype: 'bruiser (fighter)',
      buildHint: mp('Trinity/Stride/Cleaver + Sterak; frontline with damage unless full tank is needed.'),
      itemHint
    }
  }
  if (t.has('Marksman')) {
    return {
      damage: 'ad',
      archetype: 'marksman',
      buildHint: mp('Crit (IE), on-hit, or utility marksman — two-item power spike; adapt boots vs comp.'),
      itemHint
    }
  }
  return {
    damage: 'mixed',
    archetype: 'specialist',
    buildHint: mp('Use Riot recommended + your role; tags are non-standard for this champion.'),
    itemHint
  }
}

function compactName(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function withCurrentPatchOverrides(
  profile: ChampionBuildProfile,
  championName: string | null | undefined,
  role: DraftRole
): ChampionBuildProfile {
  const name = compactName(championName)
  switch (name) {
    case 'ezreal':
      return {
        ...profile,
        damage: role === 'middle' ? 'flex' : profile.damage,
        archetype: role === 'middle' ? 'AP / hybrid poke carry' : 'marksman / AP-flex poke',
        buildHint:
          'Recent AP-ratio buffs keep Ezreal AP poke and hybrid sniper builds viable when your team needs magic damage.',
        itemHint:
          'Keep classic AD poke when your comp needs physical DPS; pivot AP with mana/AP/pen when the draft lacks magic damage. Statikk Shiv is only for on-hit/hybrid experiments, not default waveclear.'
      }
    case 'kennen':
      return {
        ...profile,
        damage: 'flex',
        archetype: 'AP teamfighter / AD crit flex',
        buildHint:
          'Recent W crit and E attack-speed changes keep AD crit Kennen possible without removing standard AP engage.',
        itemHint:
          "Doran's Bow and Statikk Shiv are credible AD/on-hit experiments; keep AP burst items when your comp needs magic engage."
      }
    case 'shyvana':
      return {
        ...profile,
        damage: 'flex',
        archetype: 'AD bruiser / AP dragon burst',
        buildHint:
          'Recent Shyvana changes split her paths: AD wants sustained autos into Q and health-scaling W durability; AP centers damage around R/E bursts.',
        itemHint:
          "AD bruiser Shyvana should value Sheen, health, ability haste, Endless Hunger, and Gluttonous Greaves. AP Shyvana wants AP/pen around R/E and should not overvalue the old Q AP max-health pattern."
      }
    case 'teemo':
      return {
        ...profile,
        damage: 'flex',
        archetype: 'AP DoT / on-hit marksman',
        buildHint:
          "Patch 26.11 cuts Toxic Shot's bonus AD scaling and armor growth, so AP DoT and on-hit lanes both exist but Shiv/AD Teemo is less automatic.",
        itemHint:
          "Doran's Bow, Rageblade-style on-hit, and buffed Statikk Shiv still fit the AD/on-hit path. Deathfire Touch remains attractive for AP DoT pages."
      }
    case 'udyr':
      return {
        ...profile,
        archetype: 'AD/HP stance bruiser',
        buildHint:
          'Recent changes moved some AD Q power into W shields/heal and E move speed, making AD bruiser Udyr less one-stance and more HP/haste friendly.',
        itemHint:
          'Endless Hunger and Gluttonous Greaves fit the AD bruiser plan; bonus health now contributes more to the Q/W loop than pure DPS-only items.'
      }
    case 'xinzhao':
      return {
        ...profile,
        damage: 'flex',
        archetype: 'AS bruiser / AP drain flex',
        buildHint:
          'Patch 26.11 adds AP damage to Xin Zhao passive while trimming AP healing, so AP/hybrid Xin keeps burst but has less drain safety.',
        itemHint:
          'Attack-speed bruiser, AP drain, and hybrid on-hit paths are draft-dependent. Gluttonous Greaves are a natural sustain boot when you can keep fighting.'
      }
    case 'zeri':
      return {
        ...profile,
        archetype: 'mobile marksman',
        buildHint:
          'Recent Zeri changes shift her away from burst assassin patterns and back toward early lane, mobility, and sustained ADC damage.',
        itemHint:
          'Do not over-index on excess attack speed because the AS-to-AD conversion was nerfed. Favor stable crit/on-hit DPS and movement-value choices over burst-only builds.'
      }
    case 'gragas':
      return {
        ...profile,
        archetype: role === 'top' ? 'AP tank / bruiser top' : profile.archetype,
        buildHint:
          'Recent W damage reduction buffs help Gragas frontline later without relying on the removed mobility keystone.',
        itemHint:
          "Top Gragas should compare Grasp, Comet, and AP-tank items; Doran's Helm is a useful resist start into mixed pressure."
      }
    case 'taliyah':
      return {
        ...profile,
        buildHint:
          'Recent Q damage changes help mid Taliyah poke and trade without accelerating jungle clear too hard.',
        itemHint:
          'Long-range Comet pages are stronger with the distance-based Comet rework; sustained burn lanes can consider Deathfire Touch instead.'
      }
    case 'zoe':
      return {
        ...profile,
        buildHint:
          'Recent Zoe changes shift power toward landing Bubble and long-range skill expression over W stat-check trades.',
        itemHint:
          'Arcane Comet now rewards long-range hits, matching Zoe poke. Avoid treating W stat-check trades as the main build plan.'
      }
    case 'ambessa':
      return {
        ...profile,
        buildHint:
          'Recent Ambessa R cast-time changes make engages more telegraphed; value setup and durable skirmish windows over pure surprise all-ins.',
        itemHint: genericPatchItemHint(new Set(['Fighter', 'Assassin']))
      }
    case 'briar':
      return {
        ...profile,
        buildHint:
          'Recent health-growth nerfs mean Briar survivability is slightly worse while kill threat remains.',
        itemHint: 'Bruiser durability and sustain boots matter more when fights go long; avoid going too greedy into burst drafts.'
      }
    case 'tahmkench':
      return {
        ...profile,
        buildHint:
          'Recent Tahm Kench changes improve support durability and ally Devour speed, so peel/support lines are stronger.',
        itemHint:
          "Tank support utility remains the plan; Trailblazer is gone, so choose other mobility/peel tools and consider Doran's Helm only for solo-lane starts."
      }
    case 'warwick':
      return {
        ...profile,
        buildHint:
          'Recent Warwick passive scaling buffs soften late-game falloff for sustained fights.',
        itemHint:
          'Gluttonous Greaves and fighter sustain items fit extended combat, while on-hit or bruiser paths should still respect enemy burst.'
      }
    case 'brand':
      return {
        ...profile,
        buildHint:
          'Patch 26.11 lowers Brand base armor, especially punishing bot-lane trades; keep spacing and defensive setup into AD pressure.',
        itemHint:
          'DoT and burn builds still fit Brand, but avoid greedy lane starts when the enemy can repeatedly auto-trade.'
      }
    case 'diana':
      return {
        ...profile,
        archetype: role === 'jungle' ? 'AP diver jungle' : profile.archetype,
        buildHint:
          'Patch 26.11 boosts Diana jungle monster damage and W bonus-health scaling, helping clear speed and AP-bruiser durability.',
        itemHint:
          'Jungle Diana can value AP plus health/resist components more when the comp needs a durable engage follow-up.'
      }
    case 'ekko':
      return {
        ...profile,
        buildHint:
          'Patch 26.11 lowers Ekko passive per-enemy cooldown, improving repeat trades and skirmish uptime.',
        itemHint:
          'AP burst remains the default; haste and movement-value items get better when you can re-proc passive in longer fights.'
      }
    case 'heimerdinger':
      return {
        ...profile,
        buildHint:
          'Patch 26.11 gives Heimerdinger turrets more range and vision follow-up, improving wave control and grenade setups.',
        itemHint:
          'Lean into AP poke and zone control; defensive starts matter when enemies can clear turrets and force all-ins.'
      }
    case 'kassadin':
      return {
        ...profile,
        buildHint:
          'Patch 26.11 buffs Kassadin Q cooldown and W base damage, making early farming and short trades less punishing.',
        itemHint:
          'Mana scaling remains core; early defensive components are still valid when the lane can stop your first reset.'
      }
    case 'quinn':
      return {
        ...profile,
        archetype: role === 'jungle' ? 'roaming marksman jungler' : profile.archetype,
        buildHint:
          'Patch 26.11 increases Quinn monster damage, making jungle Quinn more realistic without changing her burst-duel identity.',
        itemHint:
          'Jungle Quinn should prioritize clear stability first; lane Quinn still plays around burst windows and map tempo.'
      }
    case 'smolder':
      return {
        ...profile,
        buildHint:
          'Patch 26.11 pushes Smolder back toward crit scaling and away from Deathfire/bruiser abuse.',
        itemHint:
          'Crit paths are more coherent now; avoid overvaluing bruiser burn builds unless the draft gives long, safe fights.'
      }
    default:
      return profile
  }
}

export function getChampionBuildProfile(
  _championId: number,
  role: DraftRole,
  ddragon: { tags: string[]; partype: string } | null | undefined,
  championName?: string | null
): ChampionBuildProfile {
  if (role === 'unknown' || !ddragon || !Array.isArray(ddragon.tags) || ddragon.tags.length === 0) {
    if (championName) {
      const fromOverride = overrideProfile(championName, ddragon?.partype)
      if (fromOverride) {
        return withCurrentPatchOverrides(fromOverride, championName, role)
      }
    }
    return withCurrentPatchOverrides(unknownProfile(role, ddragon?.partype), championName, role)
  }
  const { damage, archetype, buildHint, itemHint } = buildProfileFromDDragonTags(
    ddragon.tags,
    ddragon.partype && ddragon.partype.length ? ddragon.partype : 'None'
  )
  return withCurrentPatchOverrides(
    {
      damage,
      archetype,
      buildHint,
      itemHint,
      tagsLine: ddragon.tags.join(' · '),
      partype: ddragon.partype && ddragon.partype.length ? ddragon.partype : 'None'
    },
    championName,
    role
  )
}
