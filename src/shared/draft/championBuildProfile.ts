import type { ChampionBuildProfile, DraftRole } from './types'
import { getChampionThreatOverride } from './championThreatOverrides'

function unknownProfile(role: DraftRole, partype: string | undefined): ChampionBuildProfile {
  const p = partype && partype !== 'None' && partype !== 'Unknown' ? partype : 'Mana/HP'
  const roleLine =
    role === 'top'
      ? 'Top: tank, bruiser, or split — runes to match (Grasp, Conqueror, Phase).'
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
  return {
    damage,
    archetype: o.classes.join(' / '),
    buildHint: `Override profile for ${championName}: ${o.threat} threat with ${o.classes.join(' / ')} role.`,
    tagsLine: o.classes.join(' · '),
    partype: p
  }
}

/**
 * Derive build direction from Riot DDragon `tags` (Fighter, Tank, Mage, Assassin, Marksman, Support).
 * Order of branches matters.
 */
export function buildProfileFromDDragonTags(
  tags: string[],
  partype: string
): Pick<ChampionBuildProfile, 'damage' | 'archetype' | 'buildHint'> {
  const t = new Set(tags)
  const pt = partype && partype.trim() ? partype : 'None'
  const mp = (s: string) => `Resource: ${pt} — ${s}`

  if (t.has('Mage') && t.has('Marksman')) {
    return {
      damage: 'flex',
      archetype: 'hybrid carry',
      buildHint: mp(
        'AD crit / on-hit or AP poke; Corki-style often Muramana + mixed pen — set runes to match the game plan.'
      )
    }
  }
  if (t.has('Tank') && t.has('Mage')) {
    return {
      damage: 'mixed',
      archetype: 'AP tank',
      buildHint: mp("HP + resists + demonic/abyss; tank mythics (Bami, Jak'sho) when frontlining.")
    }
  }
  if (t.has('Tank') && t.has('Fighter')) {
    return {
      damage: 'mixed',
      archetype: 'juggernaut',
      buildHint: mp('Grasp/Conqueror + HP+AD/HP+AP; split between bruiser and full tank as needed.')
    }
  }
  if (t.has('Tank') && t.has('Support')) {
    return {
      damage: 'mixed',
      archetype: 'warden / engage tank',
      buildHint: mp("Aftershock/Guardian + locket/abyss; peel or all-in to comp's engage.")
    }
  }
  if (t.has('Tank')) {
    return {
      damage: 'mixed',
      archetype: 'tank',
      buildHint: mp("Resist + HP; Sunfire, Heartsteel, or Jak'sho as mythic; adapt vs lane damage (AD/AP).")
    }
  }
  if (t.has('Support') && t.has('Mage')) {
    return {
      damage: 'ap',
      archetype: 'enchanter / mage support',
      buildHint: mp('Moonstone, Shurelya, or Redemption — CDR, enchanter items; sometimes tank if vs dive.')
    }
  }
  if (t.has('Support') && t.has('Assassin')) {
    return {
      damage: 'mixed',
      archetype: 'catch / burst support',
      buildHint: mp('Often hybrid — cheap damage + control; Hextech/Imperial or tank mythic in tough lanes.')
    }
  }
  if (t.has('Support')) {
    return {
      damage: 'ap',
      archetype: 'support (flex)',
      buildHint: mp("Tank, enchanter, or mage support — Riot's tags don't split hook vs heal; use lane matchup.")
    }
  }
  if (t.has('Mage') && t.has('Assassin')) {
    return {
      damage: 'ap',
      archetype: 'AP burst / AP assassin',
      buildHint: mp('Ludens/Protobelt + pen (Shadowflame) — one-shot comet vs Electrocute by lane burst.')
    }
  }
  if (t.has('Mage') && t.has('Fighter')) {
    return {
      damage: 'ap',
      archetype: 'AP fighter (battlemage)',
      buildHint: mp('Rift/Demonic, sometimes Nashor — short-range sustained AP; some builds add resists early.')
    }
  }
  if (t.has('Mage')) {
    return {
      damage: 'ap',
      archetype: 'mage',
      buildHint: mp('Ludens, Liandry, or Rod — scaling vs control; mana items vs tear routes.')
    }
  }
  if (t.has('Assassin') && t.has('Fighter')) {
    return {
      damage: 'ad',
      archetype: 'diver / skirmisher',
      buildHint: mp('Bruiser AD (Eclipse, BC, sterak) or full lethality; pick vs squishy vs tanky team.')
    }
  }
  if (t.has('Assassin')) {
    return {
      damage: 'ad',
      archetype: 'assassin',
      buildHint: mp('Lethality core (Dusk, Axiom) — snowball; some AP assassins are tagged Mage+Assassin above.')
    }
  }
  if (t.has('Fighter') && t.has('Marksman')) {
    return {
      damage: 'flex',
      archetype: 'ranged-melee / poke carry',
      buildHint: mp('Often poke AD (lethality) or on-hit; rare hybrid — match team AD/AP needs.')
    }
  }
  if (t.has('Fighter')) {
    return {
      damage: 'ad',
      archetype: 'bruiser (fighter)',
      buildHint: mp('Goredrinker/Trinity/Stride + Sterak/BC; frontline with damage unless full tank is needed.')
    }
  }
  if (t.has('Marksman')) {
    return {
      damage: 'ad',
      archetype: 'marksman',
      buildHint: mp('Crit (IE), on-hit, or utility (Lethal) — two-item power spike; adapt boots vs comp.')
    }
  }
  return {
    damage: 'mixed',
    archetype: 'specialist',
    buildHint: mp('Use Riot recommended + your role; tags are non-standard for this champion.')
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
        return fromOverride
      }
    }
    return unknownProfile(role, ddragon?.partype)
  }
  const { damage, archetype, buildHint } = buildProfileFromDDragonTags(
    ddragon.tags,
    ddragon.partype && ddragon.partype.length ? ddragon.partype : 'None'
  )
  return {
    damage,
    archetype,
    buildHint,
    tagsLine: ddragon.tags.join(' · '),
    partype: ddragon.partype && ddragon.partype.length ? ddragon.partype : 'None'
  }
}
