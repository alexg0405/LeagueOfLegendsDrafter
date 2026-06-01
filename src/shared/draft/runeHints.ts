import { getChampionThreatOverride, type ClassLabel, type ThreatLabel } from './championThreatOverrides'
import { resolveChampionName } from './championNameFallback'
import { MATCHUP_BONUS } from './matchupData'
import { publicMetaLaneRate } from './metaStats'
import { inferEnemyRoleAssignments } from './roleInference'
import { shrunkLaneRate } from './statsModel'
import type { DraftRole, DraftSnapshot, RuneLoadoutHint, SlotPick } from './types'

type RoleKey = Exclude<DraftRole, 'unknown'>
type ChampionMeta = { tags: string[]; partype: string }

export type RuneMatchupContext = {
  snapshot?: DraftSnapshot | null
  idToName?: ReadonlyMap<number, string> | null
  championMetaById?: ReadonlyMap<number, ChampionMeta> | null
}

type ChampionDescriptor = {
  championId: number
  name: string
  role: DraftRole
  threat: ThreatLabel | null
  classes: Set<ClassLabel>
  roleProbability?: number
}

type InferredSlotPick = SlotPick & { enemyIndex: number; laneProbability?: number }

const ROLE_DEFAULT: Record<RoleKey, RuneLoadoutHint> = {
  top: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying',
    secondary: 'Inspiration (boots) or Precision (Triumph + Last Stand)',
    note: 'Swap to Precision (Conqueror) for extended fighter lanes.'
  },
  jungle: {
    primaryTree: 'Domination',
    keystone: 'Electrocute or Dark Harvest',
    secondary: 'Inspiration (Cosmic Insight) or Sorcery (Nimbus Cloak)',
    note: "Tank and bruiser jungles usually move toward Aftershock, Stormraider's Surge, or Conqueror."
  },
  middle: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet or Summon Aery',
    secondary: 'Inspiration (Biscuit Delivery) or Resolve (Second Wind)',
    note: 'Burst mids can use Domination (Electrocute); control mids can scale with Sorcery.'
  },
  bottom: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo or Press the Attack',
    secondary: 'Inspiration (Magical Footwear) or Sorcery (Manaflow Band)',
    note: 'Use Fleet when lane survival and spacing beat raw DPS.'
  },
  support: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock or Guardian',
    secondary: 'Inspiration (Biscuit Delivery) or Domination (Cheap Shot)',
    note: 'Enchanters and mage supports usually pivot to Sorcery primary.'
  }
}

/** Curated seed: champion id -> typical solo-queue page. Matchup rules below can still bend these. */
const BY_CHAMPION_ID: Record<number, RuneLoadoutHint> = {
  // Mid
  103: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery (Transcendence) or Inspiration',
    note: 'Summon Aery for lane poke; Electrocute for burst windows.'
  },
  238: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery (Scorch)',
    note: 'Fleet Footwork vs heavy poke; Electrocute default.'
  },
  61: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery or Arcane Comet',
    secondary: 'Inspiration',
    note: 'Control mage page; Comet is better when you can land long-range poke.'
  },
  134: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet',
    secondary: 'Inspiration',
    note: 'Scaling lane; Resolve second is optional into pressure.'
  },
  7: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery (Scorch)',
    note: 'First Strike only when lane is low-threat.'
  },
  157: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Resolve',
    note: 'Fleet Footwork into poke; Conqueror into longer melee fights.'
  },
  777: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Resolve',
    note: 'Fleet Footwork into oppressive ranged lanes.'
  },
  84: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Resolve',
    note: 'Fleet Footwork if the lane is all poke and no kill window.'
  },
  55: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Precision',
    note: 'Conqueror for reset-heavy skirmish lanes.'
  },
  105: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Resolve',
    note: 'Play for burst trades; take defensive secondaries into point-click lanes.'
  },
  91: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery',
    note: "Stormraider's Surge can be useful when you can burst through hard-to-stick artillery lanes."
  },
  142: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet',
    secondary: 'Inspiration',
    note: 'Recent Zoe changes reward long-range poke and Bubble hits; Comet fits when you can land spells from outside retaliation range.'
  },
  163: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet or Summon Aery',
    secondary: 'Inspiration',
    note: 'Recent Q trade buffs make Comet the long-range poke page, while Aery gives steadier lane pressure.'
  },
  69: {
    primaryTree: 'Sorcery',
    keystone: 'Deathfire Touch',
    secondary: 'Precision or Resolve',
    note: 'Patch 26.11 makes Deathfire Touch deal magic damage only; it remains the sustained caster page for long DoT fights.'
  },
  90: {
    primaryTree: 'Sorcery',
    keystone: 'Deathfire Touch',
    secondary: 'Inspiration or Resolve',
    note: 'Malzahar keeps burns ticking long enough for Deathfire Touch; take Comet only when long-range poke matters more than sustained DoT.'
  },
  246: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Precision',
    note: 'First Strike is greedy; Electrocute keeps kill threat.'
  },

  // Top
  266: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying',
    secondary: 'Domination (sustain)',
    note: 'Conqueror into long melee brawls.'
  },
  114: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Resolve',
    note: 'Grasp if you need short trades only.'
  },
  420: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying',
    secondary: 'Precision',
    note: 'Conqueror into long fights; Grasp remains the stable short-trade default after the mobility-rune swap.'
  },
  122: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Resolve',
    note: "Stormraider's Surge is the kite-resistant option into slippery ranged lanes if you can trigger it."
  },
  24: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Resolve',
    note: 'Grasp is fine for short trade lanes.'
  },
  164: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying',
    secondary: 'Inspiration',
    note: 'Conqueror if the matchup becomes extended all-in trading.'
  },
  86: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Resolve',
    note: "Stormraider's Surge into kite-heavy lanes; Conqueror for normal extended fights."
  },
  54: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet',
    secondary: 'Resolve',
    note: 'Grasp or Aftershock when building front-line tank.'
  },
  516: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying',
    secondary: 'Inspiration',
    note: 'Take extra sustain into ranged poke.'
  },
  58: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Resolve',
    note: 'Press the Attack is playable for short burst trades.'
  },
  17: {
    primaryTree: 'Sorcery',
    keystone: 'Deathfire Touch',
    secondary: 'Precision or Resolve',
    note: "Patch 26.11 trims Teemo's AD Toxic Shot scaling; Deathfire Touch remains the AP DoT page, while Press the Attack fits on-hit lanes."
  },
  79: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying or Arcane Comet',
    secondary: 'Inspiration',
    note: 'Recent W damage reduction buffs support frontline top Gragas; Grasp for tanks, Comet for poke lanes.'
  },
  85: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery or Arcane Comet',
    secondary: 'Resolve',
    note: 'Recent AD crit hooks on W/E keep Press the Attack as the off-meta AD/crit page; Aery/Comet remain AP defaults.'
  },

  // Jungle
  64: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Inspiration',
    note: "Electrocute if snowballing as an assassin; Stormraider's Surge vs kite comps."
  },
  121: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Domination (Sudden Impact)',
    note: "Stormraider's Surge vs kite comps."
  },
  234: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Inspiration',
    note: 'Dark Harvest in squishy lobbies.'
  },
  60: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery',
    note: 'Dark Harvest if you are farming reset kills more than dueling.'
  },
  59: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Inspiration',
    note: 'Electrocute for early burst; Aftershock for engage tank games.'
  },
  113: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock',
    secondary: 'Precision',
    note: "Stormraider's Surge helps if the lobby can kite your engage after your burst window."
  },
  104: {
    primaryTree: 'Precision',
    keystone: 'Fleet Footwork',
    secondary: 'Inspiration',
    note: 'Fleet keeps clears and spacing stable; Dark Harvest is greedy.'
  },
  203: {
    primaryTree: 'Precision',
    keystone: 'Press the Attack',
    secondary: 'Domination',
    note: 'Conqueror into brawl-heavy front lines.'
  },
  28: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery',
    note: 'First Strike is greedy and comp-dependent.'
  },
  76: {
    primaryTree: 'Domination',
    keystone: 'Dark Harvest',
    secondary: 'Sorcery',
    note: 'Electrocute gives more early skirmish burst.'
  },
  19: {
    primaryTree: 'Precision',
    keystone: 'Press the Attack',
    secondary: 'Resolve',
    note: 'Lethal Tempo/Conqueror into extended melee teams.'
  },
  35: {
    primaryTree: 'Domination',
    keystone: 'Hail of Blades',
    secondary: 'Precision',
    note: 'Dark Harvest for AP/poke traps.'
  },
  5: {
    primaryTree: 'Precision',
    keystone: 'Conqueror or Press the Attack',
    secondary: 'Inspiration or Domination',
    note: 'Patch 26.11 keeps AP/hybrid Xin Zhao viable but trims AP healing; Conqueror or Press the Attack are safer defaults.'
  },
  77: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Resolve or Inspiration',
    note: 'Recent AD Q-to-W/E shifts make bruiser pages with durability and extended fights higher value.'
  },
  102: {
    primaryTree: 'Precision',
    keystone: 'Conqueror',
    secondary: 'Resolve or Inspiration',
    note: 'AD Shyvana wants sustained autos and Q hits; AP Shyvana can pivot Sorcery with Deathfire Touch or Comet around R/E.'
  },

  // Bot
  81: {
    primaryTree: 'Precision',
    keystone: 'Press the Attack or Fleet Footwork',
    secondary: 'Inspiration',
    note: 'Recent AP-ratio buffs keep AP Ezreal viable with Sorcery/Comet; Fleet when lane sustain matters.'
  },
  22: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Inspiration',
    note: 'Hail of Blades for lane burst windows.'
  },
  119: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Inspiration',
    note: 'Press the Attack into short trade lanes.'
  },
  222: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Inspiration',
    note: 'Fleet Footwork when the lane is long-range poke or you need dodge space.'
  },
  51: {
    primaryTree: 'Precision',
    keystone: 'Fleet Footwork',
    secondary: 'Sorcery',
    note: 'Press the Attack when your support creates reliable traps.'
  },
  145: {
    primaryTree: 'Domination',
    keystone: 'Hail of Blades',
    secondary: 'Inspiration',
    note: 'Lethal Tempo/Press the Attack for on-hit DPS lanes.'
  },
  67: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Resolve',
    note: 'Fleet Footwork if survival matters more than all-in damage.'
  },
  202: {
    primaryTree: 'Precision',
    keystone: 'Fleet Footwork',
    secondary: 'Sorcery',
    note: 'Dark Harvest is a poke/snowball alternative.'
  },
  498: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo',
    secondary: 'Inspiration',
    note: 'Cleanse/defensive runes matter more into CC bot lanes.'
  },
  221: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo or Fleet Footwork',
    secondary: 'Resolve',
    note: 'Recent Zeri changes push her toward mobility and lane stability; Fleet into poke, Lethal Tempo for sustained DPS.'
  },
  236: {
    primaryTree: 'Precision',
    keystone: 'Press the Attack',
    secondary: 'Inspiration',
    note: 'First Strike is possible in low-threat poke lanes.'
  },
  110: {
    primaryTree: 'Domination',
    keystone: 'Hail of Blades',
    secondary: 'Inspiration',
    note: 'Lethal Tempo for on-hit DPS; Comet for lethality poke.'
  },

  // Support
  412: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock',
    secondary: 'Inspiration',
    note: 'Guardian on peel vs burst lanes.'
  },
  12: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock',
    secondary: 'Inspiration',
    note: 'Glacial build paths exist if playing engage utility.'
  },
  53: {
    primaryTree: 'Inspiration',
    keystone: 'Glacial Augment',
    secondary: 'Resolve',
    note: 'Aftershock if all-in engage is the plan.'
  },
  111: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock',
    secondary: 'Inspiration',
    note: 'Glacial Augment if you need catch setup over durability.'
  },
  89: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock',
    secondary: 'Inspiration',
    note: 'Guardian only when you are peeling more than engaging.'
  },
  117: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery',
    secondary: 'Resolve',
    note: 'Guardian into burst dive lanes.'
  },
  267: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery',
    secondary: 'Resolve',
    note: 'Guardian if the lane can one-shot your ADC.'
  },
  99: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet',
    secondary: 'Inspiration',
    note: 'Guardian/Resolve when you must peel burst.'
  },
  43: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery',
    secondary: 'Resolve',
    note: 'Comet if playing poke; Guardian if playing pure peel.'
  },
  143: {
    primaryTree: 'Sorcery',
    keystone: 'Deathfire Touch or Arcane Comet',
    secondary: 'Domination',
    note: 'Deathfire Touch fits sustained plant/DoT damage after its 26.11 magic-damage change; Comet is still the long-range poke page.'
  },
  25: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet',
    secondary: 'Inspiration',
    note: 'Guardian is safer into hard engage.'
  },
  37: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery',
    secondary: 'Resolve',
    note: 'Guardian into dive-heavy lanes.'
  },
  16: {
    primaryTree: 'Sorcery',
    keystone: 'Summon Aery',
    secondary: 'Resolve',
    note: 'Guardian into burst lanes; Aery for lane pressure.'
  }
}

const ARTILLERY_OR_SNIPER = championSet([
  'Caitlyn',
  'Ezreal',
  'Hwei',
  'Jayce',
  'Jhin',
  'Karma',
  'Lux',
  'Nidalee',
  'Seraphine',
  'Varus',
  "Vel'Koz",
  'Xerath',
  'Ziggs',
  'Zoe',
  'Zyra'
])

const REPEATED_POKE = championSet([
  'Ashe',
  'Brand',
  'Caitlyn',
  'Ezreal',
  'Heimerdinger',
  'Hwei',
  'Jayce',
  'Karma',
  'Kennen',
  'Lux',
  'Miss Fortune',
  'Morgana',
  'Seraphine',
  'Swain',
  'Teemo',
  "Vel'Koz",
  'Xerath',
  'Ziggs',
  'Zoe',
  'Zyra'
])

const SUSTAINED_DAMAGE_CASTERS = championSet([
  'Brand',
  'Cassiopeia',
  'Karthus',
  'Lillia',
  'Malzahar',
  'Morgana',
  'Rumble',
  'Singed',
  'Swain',
  'Teemo',
  'Zyra'
])

const BURST_DIVERS = championSet([
  'Akali',
  'Ambessa',
  'Diana',
  'Ekko',
  'Elise',
  'Evelynn',
  'Fizz',
  'Katarina',
  "Kha'Zix",
  'LeBlanc',
  'Naafiri',
  'Nidalee',
  'Nocturne',
  'Pantheon',
  'Pyke',
  'Qiyana',
  'Rengar',
  'Shaco',
  'Talon',
  'Viego',
  'Yone',
  'Zed'
])

const ALL_IN_TRADERS = championSet([
  'Aatrox',
  'Camille',
  'Darius',
  'Fiora',
  'Garen',
  'Irelia',
  'Jax',
  'Kled',
  'Olaf',
  'Pantheon',
  'Renekton',
  'Riven',
  'Sett',
  'Tryndamere',
  'Vi',
  'Warwick',
  'Wukong',
  'Xin Zhao',
  'Yasuo',
  'Yone'
])

const HARD_CC = championSet([
  'Alistar',
  'Amumu',
  'Ashe',
  'Blitzcrank',
  'Braum',
  'Leona',
  'Lissandra',
  'Malzahar',
  'Maokai',
  'Morgana',
  'Nautilus',
  'Neeko',
  'Rell',
  'Sejuani',
  'Skarner',
  'Tahm Kench',
  'Taric',
  'Thresh',
  'Twisted Fate',
  'Veigar',
  'Vi',
  'Zac',
  'Zyra'
])

function championSet(names: string[]): Set<string> {
  return new Set(names.map(compactName))
}

function compactName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function cloneHint(hint: RuneLoadoutHint): RuneLoadoutHint {
  return { ...hint }
}

function addNote(hint: RuneLoadoutHint, note: string): void {
  if (!hint.note) {
    hint.note = note
    return
  }
  if (!hint.note.includes(note)) {
    hint.note = `${hint.note} ${note}`
  }
}

function preferSecondary(hint: RuneLoadoutHint, secondary: string): void {
  if (hint.secondary === secondary) {
    return
  }
  if (hint.secondary.includes(secondary)) {
    return
  }
  hint.secondary = secondary
}

function classFromTag(tag: string): ClassLabel | null {
  switch (tag.toLowerCase()) {
    case 'fighter':
      return 'fighter'
    case 'mage':
      return 'mage'
    case 'marksman':
      return 'marksman'
    case 'tank':
      return 'tank'
    case 'support':
      return 'support'
    case 'assassin':
      return 'assassin'
    default:
      return null
  }
}

function classesFromMeta(meta: ChampionMeta | null | undefined): Set<ClassLabel> {
  const classes = new Set<ClassLabel>()
  for (const tag of meta?.tags ?? []) {
    const mapped = classFromTag(tag)
    if (mapped) {
      classes.add(mapped)
    }
  }
  return classes
}

function wantsDeathfireTouch(champion: ChampionDescriptor): boolean {
  return SUSTAINED_DAMAGE_CASTERS.has(compactName(champion.name))
}

function inferThreat(classes: Set<ClassLabel>, meta: ChampionMeta | null | undefined, role: DraftRole): ThreatLabel | null {
  const partype = meta?.partype?.toLowerCase() ?? ''
  if (classes.has('mage')) {
    return classes.has('marksman') ? 'hybrid' : 'ap'
  }
  if (classes.has('marksman') || classes.has('assassin') || classes.has('fighter')) {
    return 'ad'
  }
  if (partype.includes('mana')) {
    return role === 'support' || role === 'unknown' ? 'utility' : 'ap'
  }
  if (classes.has('tank') || classes.has('support')) {
    return 'utility'
  }
  return null
}

function descriptorForChampion(
  championId: number,
  role: DraftRole,
  name: string,
  championMetaById: RuneMatchupContext['championMetaById']
): ChampionDescriptor {
  const override = getChampionThreatOverride(name)
  const meta = championMetaById?.get(championId) ?? null
  const classes = classesFromMeta(meta)
  for (const cls of override?.classes ?? []) {
    classes.add(cls)
  }
  return {
    championId,
    name,
    role,
    threat: override?.threat ?? inferThreat(classes, meta, role),
    classes
  }
}

function resolvedSlotName(slot: SlotPick, idToName: RuneMatchupContext['idToName']): string {
  if (slot.championId == null) {
    return slot.championName?.trim() || 'Unknown'
  }
  const slotName = slot.championName?.trim() ?? ''
  if (slotName && !/^champion\s+\d+$/i.test(slotName)) {
    return slotName
  }
  return resolveChampionName(slot.championId, idToName ?? null)
}

function relevantEnemySlots(snapshot: DraftSnapshot | null | undefined, role: DraftRole): InferredSlotPick[] {
  if (!snapshot) {
    return []
  }
  const inferred = new Map(inferEnemyRoleAssignments(snapshot).map((row) => [row.enemyIndex, row]))
  const enemies = snapshot.enemy
    .map((slot, idx): InferredSlotPick | null => {
      if (slot.championId == null) {
        return null
      }
      const row = inferred.get(idx)
      const roleP =
        role !== 'unknown'
          ? row?.roleProbabilities[role as RoleKey] ?? (slot.role === role ? 1 : 0.2)
          : undefined
      return {
        ...slot,
        enemyIndex: idx,
        role: row?.inferredRole ?? slot.role,
        laneProbability: roleP
      }
    })
    .filter((slot): slot is InferredSlotPick => slot != null)
  if (enemies.length === 0) {
    return []
  }
  if (role === 'bottom' || role === 'support') {
    const duoLane = enemies.filter((slot) => {
      const row = inferred.get(slot.enemyIndex)
      const duoP =
        (row?.roleProbabilities.bottom ?? (slot.role === 'bottom' ? 1 : 0)) +
        (row?.roleProbabilities.support ?? (slot.role === 'support' ? 1 : 0))
      return duoP >= 0.45
    })
    return duoLane.length > 0 ? duoLane : enemies
  }
  if (role === 'jungle' || role === 'unknown') {
    return enemies
  }
  const laneEnemy = enemies.filter((slot) => (slot.laneProbability ?? (slot.role === role ? 1 : 0)) >= 0.45)
  return laneEnemy.length > 0 ? laneEnemy : enemies
}

function enemyDescriptors(championId: number, role: DraftRole, ctx: RuneMatchupContext): ChampionDescriptor[] {
  return relevantEnemySlots(ctx.snapshot, role)
    .filter((slot) => slot.championId !== championId)
    .map((slot) => {
      const descriptor = descriptorForChampion(
        slot.championId!,
        slot.role,
        resolvedSlotName(slot, ctx.idToName),
        ctx.championMetaById
      )
      descriptor.roleProbability = slot.laneProbability
      return descriptor
    })
}

function archetypeDefault(champion: ChampionDescriptor, role: DraftRole): RuneLoadoutHint {
  const classes = champion.classes
  if (role === 'unknown') {
    return {
      primaryTree: 'Flex',
      keystone: 'Match keystone to lane',
      secondary: 'Resolve or Inspiration (defence/utility)',
      note: 'Set role in Nexus Draft for a better default page.'
    }
  }

  if (role === 'support') {
    if (classes.has('mage')) {
      if (wantsDeathfireTouch(champion)) {
        return {
          primaryTree: 'Sorcery',
          keystone: 'Deathfire Touch',
          secondary: 'Domination or Inspiration',
          note: 'Sustained poke/DoT support; Deathfire Touch uses the April 30 nerfed live values, while Comet remains the long-range burst poke page.'
        }
      }
      return {
        primaryTree: 'Sorcery',
        keystone: 'Arcane Comet or Summon Aery',
        secondary: 'Inspiration (Biscuit Delivery) or Resolve',
        note: 'Mage supports should tune between poke and survival.'
      }
    }
    if (classes.has('support') && !classes.has('tank')) {
      return {
        primaryTree: 'Sorcery',
        keystone: 'Summon Aery',
        secondary: 'Resolve (Revitalize) or Inspiration',
        note: 'Guardian if the enemy lane can hard engage.'
      }
    }
    return cloneHint(ROLE_DEFAULT.support)
  }

  if (role === 'bottom') {
    if (classes.has('mage')) {
      if (wantsDeathfireTouch(champion)) {
        return {
          primaryTree: 'Sorcery',
          keystone: 'Deathfire Touch',
          secondary: 'Inspiration (Biscuit Delivery)',
          note: 'Mage bot with sustained damage; Deathfire Touch is the DoT page, Comet is for long-range poke lanes.'
        }
      }
      return {
        primaryTree: 'Sorcery',
        keystone: 'Arcane Comet',
        secondary: 'Inspiration (Biscuit Delivery)',
        note: 'Mage bot lanes usually value poke, mana, and wave control.'
      }
    }
    return {
      primaryTree: 'Precision',
      keystone: classes.has('marksman') ? 'Lethal Tempo or Press the Attack' : 'Conqueror',
      secondary: 'Inspiration (Magical Footwear) or Sorcery (Manaflow Band)',
      note: 'Fleet Footwork is the survival pivot into long-range poke.'
    }
  }

  if (role === 'jungle') {
    if (classes.has('tank')) {
      return {
        primaryTree: 'Resolve',
        keystone: "Aftershock or Stormraider's Surge",
        secondary: 'Precision (Triumph) or Inspiration',
        note: "Aftershock for engage; Stormraider's Surge when you can trigger it and need to keep moving after contact."
      }
    }
    if (classes.has('assassin')) {
      return {
        primaryTree: 'Domination',
        keystone: 'Electrocute or Dark Harvest',
        secondary: 'Sorcery (Nimbus Cloak) or Inspiration',
        note: 'Use Conqueror only when fights are extended instead of pick-based.'
      }
    }
    if (classes.has('fighter') || classes.has('marksman')) {
      return {
        primaryTree: 'Precision',
        keystone: 'Conqueror or Press the Attack',
        secondary: 'Inspiration or Domination',
        note: "Stormraider's Surge is the kite-comp pivot when you can trigger it."
      }
    }
    return cloneHint(ROLE_DEFAULT.jungle)
  }

  if (role === 'middle') {
    if (classes.has('mage') && wantsDeathfireTouch(champion)) {
      return {
        primaryTree: 'Sorcery',
        keystone: 'Deathfire Touch',
        secondary: 'Inspiration or Resolve',
        note: 'Sustained caster page; Deathfire Touch live values are 4-12 plus 7% bonus AD and 2.5% AP per second, ramping by 75% after 3s.'
      }
    }
    if (classes.has('assassin')) {
      return {
        primaryTree: 'Domination',
        keystone: 'Electrocute',
        secondary: 'Sorcery or Resolve',
        note: 'Fleet/Resolve if the lane is poke-heavy or point-click burst.'
      }
    }
    if (classes.has('marksman') || classes.has('fighter')) {
      return {
        primaryTree: 'Precision',
        keystone: 'Press the Attack or Fleet Footwork',
        secondary: 'Resolve or Inspiration',
        note: 'Fleet and Resolve are good stabilizers into ranged poke.'
      }
    }
    return cloneHint(ROLE_DEFAULT.middle)
  }

  if (role === 'top') {
    if (classes.has('tank')) {
      return cloneHint(ROLE_DEFAULT.top)
    }
    if (classes.has('fighter') || classes.has('assassin')) {
      return {
        primaryTree: 'Precision',
        keystone: 'Conqueror',
        secondary: 'Resolve',
        note: "Grasp for short trades; Stormraider's Surge when the lane is about kiting and burst windows."
      }
    }
    if (classes.has('mage') && wantsDeathfireTouch(champion)) {
      return {
        primaryTree: 'Sorcery',
        keystone: 'Deathfire Touch',
        secondary: 'Resolve',
        note: 'Sustained top-lane burn page; use Comet instead when long-range poke is the actual win condition.'
      }
    }
    if (classes.has('marksman') || classes.has('mage')) {
      return {
        primaryTree: classes.has('marksman') ? 'Precision' : 'Sorcery',
        keystone: classes.has('marksman') ? 'Press the Attack or Fleet Footwork' : "Arcane Comet or Stormraider's Surge",
        secondary: 'Resolve',
        note: 'Ranged top needs defensive secondaries when enemy can force all-ins.'
      }
    }
  }

  return cloneHint(ROLE_DEFAULT[role])
}

function wantsMovementKeystone(champion: ChampionDescriptor, role: DraftRole): boolean {
  return (
    role === 'bottom' ||
    champion.classes.has('marksman') ||
    champion.classes.has('mage') ||
    champion.classes.has('fighter') ||
    champion.classes.has('tank')
  )
}

/**
 * Ranks who you care about most in rune tips: curated matchup bonus, then public lane rate distance from 0.5, then model lane rate.
 * Different suggested picks can surface different "primary" enemies for the same board.
 */
function relevanceForPickVsEnemy(
  candidateId: number,
  myRole: DraftRole,
  enemy: ChampionDescriptor
): number {
  const eid = String(enemy.championId)
  const bid = String(candidateId)
  const bonus = MATCHUP_BONUS[bid]?.[eid] ?? MATCHUP_BONUS[eid]?.[bid]
  if (bonus != null && Number.isFinite(bonus)) {
    return 1000 + Math.abs(bonus)
  }
  if (myRole && myRole !== 'unknown' && enemy.role !== 'unknown') {
    const lane = publicMetaLaneRate(myRole, candidateId, enemy.championId)
    if (lane != null) {
      return (100 + Math.abs(lane - 0.5) * 20) * (0.35 + (enemy.roleProbability ?? 1) * 0.65)
    }
  }
  const sr = shrunkLaneRate(candidateId, enemy.championId)
  if (sr != null) {
    return 10 + Math.abs(sr - 0.5) * 20
  }
  return 0
}

function orderEnemiesByRelevanceForPick(
  candidateId: number,
  myRole: DraftRole,
  enemies: ChampionDescriptor[]
): ChampionDescriptor[] {
  if (enemies.length === 0) {
    return []
  }
  return [...enemies].sort(
    (a, b) =>
      relevanceForPickVsEnemy(candidateId, myRole, b) - relevanceForPickVsEnemy(candidateId, myRole, a)
  )
}

/**
 * One lane sentence naming only the most relevant enemy so tips do not all repeat the same names for every team comp.
 */
function laneOpponentRuneLine(
  my: ChampionDescriptor,
  role: DraftRole,
  primary: ChampionDescriptor
): string {
  const c = compactName(primary.name)
  const hasArt = ARTILLERY_OR_SNIPER.has(c)
  const hasPoke = REPEATED_POKE.has(c)
  const isBurst = BURST_DIVERS.has(c) || primary.classes.has('assassin')
  const isAllIn = ALL_IN_TRADERS.has(c) || primary.classes.has('fighter')
  const isHardCc = HARD_CC.has(c) || (primary.classes.has('tank') && primary.role !== 'top')

  if (hasArt && wantsMovementKeystone(my, role)) {
    return `Vs ${primary.name} (artillery and angles): value movement (Stormraider/Fleet) and Celerity for skillshots.`
  }
  if (isBurst || isAllIn) {
    return `Vs ${primary.name} (burst/engage): Bone Plating and Resolve second help short trades.`
  }
  if (hasPoke) {
    return `Vs ${primary.name} (sustained poke): Second Wind, Fleet, or similar sustain is preferred.`
  }
  if (isHardCc) {
    return `Vs ${primary.name} (lockdown): Unflinching, boots, and Cleanse are real options.`
  }
  if (primary.classes.has('tank')) {
    return `Vs ${primary.name} (tankier frontline): %HP and Cut Down can matter in long scrappy fights.`
  }
  return `Into ${primary.name}, line up your page to trade on your strengths and respect their best windows.`
}

function adjustForMatchup(
  base: RuneLoadoutHint,
  champion: ChampionDescriptor,
  role: DraftRole,
  enemies: ChampionDescriptor[]
): RuneLoadoutHint {
  const hint = cloneHint(base)
  if (enemies.length === 0) {
    return hint
  }

  const artillery = enemies.filter((enemy) => ARTILLERY_OR_SNIPER.has(compactName(enemy.name)))
  const poke = enemies.filter((enemy) => REPEATED_POKE.has(compactName(enemy.name)))
  const burst = enemies.filter(
    (enemy) => BURST_DIVERS.has(compactName(enemy.name)) || enemy.classes.has('assassin')
  )
  const allIn = enemies.filter(
    (enemy) => ALL_IN_TRADERS.has(compactName(enemy.name)) || enemy.classes.has('fighter')
  )
  const hardCc = enemies.filter(
    (enemy) => HARD_CC.has(compactName(enemy.name)) || (enemy.classes.has('tank') && enemy.role !== 'top')
  )
  const tanks = enemies.filter((enemy) => enemy.classes.has('tank'))
  const adThreats = enemies.filter((enemy) => enemy.threat === 'ad' || enemy.threat === 'hybrid')
  const apThreats = enemies.filter((enemy) => enemy.threat === 'ap' || enemy.threat === 'hybrid')

  if (artillery.length > 0 && wantsMovementKeystone(champion, role)) {
    if (role === 'bottom' || champion.classes.has('marksman')) {
      hint.primaryTree = 'Precision'
      hint.keystone = hint.keystone.includes('Fleet Footwork') ? hint.keystone : `Fleet Footwork or ${hint.keystone}`
    } else if (!hint.keystone.includes("Stormraider's Surge")) {
      hint.primaryTree = hint.primaryTree === 'Domination' ? hint.primaryTree : 'Sorcery'
      hint.keystone = `Stormraider's Surge or ${hint.keystone}`
    }
    preferSecondary(hint, 'Sorcery (Nimbus Cloak + Celerity)')
  }

  if (burst.length > 0 || allIn.length > 0) {
    preferSecondary(hint, 'Resolve (Bone Plating + Overgrowth)')
  } else if (poke.length > 0 && artillery.length === 0) {
    preferSecondary(hint, 'Resolve (Second Wind + Overgrowth) or Inspiration (Biscuit Delivery)')
  }

  if (hardCc.length >= 2 || (role === 'bottom' && hardCc.length >= 1)) {
    const ccSecondary = hint.secondary.includes('Bone Plating')
      ? 'Resolve (Bone Plating + Unflinching)'
      : 'Resolve (Unflinching + Conditioning)'
    preferSecondary(hint, ccSecondary)
  }

  const ordered = orderEnemiesByRelevanceForPick(champion.championId, role, enemies)
  const primary = ordered[0] ?? enemies[0]
  if (primary) {
    addNote(hint, laneOpponentRuneLine(champion, role, primary))
  }

  if (hardCc.length >= 2 || (role === 'bottom' && hardCc.length >= 1)) {
    if (!hint.note || !/Vs .*\(lockdown\)/.test(hint.note)) {
      addNote(
        hint,
        'Heavy CC in this draft: prioritize Unflinching, defensive boots, and Cleanse where the draft allows.'
      )
    }
  }

  if (tanks.length >= 2 && (champion.classes.has('marksman') || champion.classes.has('fighter'))) {
    addNote(
      hint,
      'Multiple tanky enemies: Conqueror, Lethal Tempo, and Cut Down stay high value for sustained damage.'
    )
  }

  if (apThreats.length >= Math.max(2, adThreats.length + 1)) {
    addNote(hint, 'Enemy comp leans AP: MR shard and defensive boots are in play early.')
  } else if (adThreats.length >= Math.max(2, apThreats.length + 1)) {
    addNote(hint, 'Enemy comp leans AD: armor shard and Plated/tabis timing matter.')
  }

  return hint
}

const RUNE_TIP_NOTE_MAX = 400

/**
 * Rune "Tips" in the UI: keep the full engine note (matchup add-ons are appended to the first sentence
 * in {@link addNote}) instead of only the first sentence, with a hard cap for layout.
 */
export function formatRuneTipNote(note: string | null | undefined, fallback: string): string {
  if (note == null || !String(note).trim()) {
    return fallback
  }
  const collapsed = String(note)
    .replace(/\s+/g, ' ')
    .trim()
  if (collapsed.length <= RUNE_TIP_NOTE_MAX) {
    return collapsed
  }
  return `${collapsed.slice(0, RUNE_TIP_NOTE_MAX - 1).trimEnd()}…`
}

export function runeLoadoutForChampion(
  championId: number,
  role: DraftRole,
  ctx: RuneMatchupContext = {}
): RuneLoadoutHint {
  const championName = resolveChampionName(championId, ctx.idToName ?? null)
  const champion = descriptorForChampion(championId, role, championName, ctx.championMetaById)
  const base = BY_CHAMPION_ID[championId] ? cloneHint(BY_CHAMPION_ID[championId]) : archetypeDefault(champion, role)
  const hint = adjustForMatchup(base, champion, role, enemyDescriptors(championId, role, ctx))
  if (championName && hint.note) {
    if (!hint.note.toLowerCase().includes(championName.toLowerCase())) {
      hint.note = `${championName} — ${hint.note}`
    }
  }
  return hint
}
