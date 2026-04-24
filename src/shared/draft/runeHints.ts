import type { DraftRole, RuneLoadoutHint } from './types'

const ROLE_DEFAULT: Record<Exclude<DraftRole, 'unknown'>, RuneLoadoutHint> = {
  top: {
    primaryTree: 'Resolve',
    keystone: 'Grasp of the Undying',
    secondary: 'Inspiration (boots) or Domination (sustain)',
    note: 'Swap to Precision (Conqueror) on heavy extended fighters / splitters.'
  },
  jungle: {
    primaryTree: 'Domination',
    keystone: 'Electrocute or Dark Harvest',
    secondary: 'Inspiration (Cosmic) or Sorcery (Nimbus)',
    note: 'Tank jungles: aftershock/phase rush — tune to your clear + gank plan.'
  },
  middle: {
    primaryTree: 'Sorcery',
    keystone: 'Arcane Comet or Summon Aery',
    secondary: 'Inspiration (biscuits) or Resolve (second wind)',
    note: 'Burst mages: Domination (Electrocute) — check lane trade pattern.'
  },
  bottom: {
    primaryTree: 'Precision',
    keystone: 'Lethal Tempo or Press the Attack',
    secondary: 'Inspiration (footwear) or Sorcery (manaflow)',
    note: 'Poke AD: Fleet or Comet; lane tempo matters more than tree memes.'
  },
  support: {
    primaryTree: 'Resolve',
    keystone: 'Aftershock or Guardian',
    secondary: 'Inspiration (biscuits) or Domination (cheap shot)',
    note: 'Enchanters: Sorcery (Aery) or Inspiration — match enemy lane damage.'
  }
}

/** Curated: champion id → typical solo-queue page (approximate, not patch-perfect). */
const BY_CHAMPION_ID: Record<number, RuneLoadoutHint> = {
  // Mid
  103: {
    primaryTree: 'Domination',
    keystone: 'Electrocute',
    secondary: 'Sorcery (transcendence) or Inspiration',
    note: 'Summon Aery for lane poke; Electrocute for burst all-ins.'
  },
  238: { primaryTree: 'Domination', keystone: 'Electrocute', secondary: 'Sorcery (scorch)', note: 'Fleet vs heavy poke; Electrocute default.' },
  61: { primaryTree: 'Sorcery', keystone: 'Phase Rush', secondary: 'Inspiration', note: 'Summon Aery into ranged lanes is fine.' },
  134: { primaryTree: 'Sorcery', keystone: 'Arcane Comet', secondary: 'Inspiration', note: 'Scaling lane — resolve second optional.' },
  7: { primaryTree: 'Sorcery', keystone: 'Arcane Comet', secondary: 'Inspiration', note: 'Control mage setup.' },
  // Top
  266: { primaryTree: 'Resolve', keystone: 'Grasp of the Undying', secondary: 'Domination (ghost poro)', note: 'Conqueror into long melee brawls.' },
  114: { primaryTree: 'Precision', keystone: 'Conqueror', secondary: 'Resolve', note: 'Grasp if you need short trades only.' },
  420: { primaryTree: 'Sorcery', keystone: 'Phase Rush', secondary: 'Inspiration', note: 'Grasp Illaoi is also common — pick by lane length.' },
  // Jungle
  64: { primaryTree: 'Precision', keystone: 'Conqueror', secondary: 'Inspiration', note: 'Electro if snowball/assassin style.' },
  121: { primaryTree: 'Precision', keystone: 'Conqueror', secondary: 'Domination (sudden impact)', note: 'Phase Rush vs kite comps.' },
  234: { primaryTree: 'Domination', keystone: 'Electrocute', secondary: 'Inspiration', note: 'Dark Harvest in squishy lobbies.' },
  // Bot
  81: { primaryTree: 'Precision', keystone: 'Lethal Tempo', secondary: 'Inspiration', note: 'First Strike poke optional.' },
  22: { primaryTree: 'Precision', keystone: 'Lethal Tempo', secondary: 'Inspiration', note: 'Hail of Blades for lane burst windows.' },
  119: { primaryTree: 'Precision', keystone: 'Lethal Tempo', secondary: 'Inspiration', note: 'Press the Attack into short trade lanes.' },
  // Support
  412: { primaryTree: 'Resolve', keystone: 'Aftershock', secondary: 'Inspiration', note: 'Guardian on peel vs burst lanes.' },
  12: { primaryTree: 'Resolve', keystone: 'Aftershock', secondary: 'Inspiration', note: 'Glacial build paths exist — if playing engage.' },
  53: { primaryTree: 'Inspiration', keystone: 'Glacial Augment', secondary: 'Resolve', note: 'Aftershock if all-in engage is the plan.' }
}

export function runeLoadoutForChampion(championId: number, role: DraftRole): RuneLoadoutHint {
  const spec = BY_CHAMPION_ID[championId]
  if (spec) {
    return spec
  }
  if (role === 'unknown') {
    return {
      primaryTree: 'Flex',
      keystone: 'Match keystone to lane',
      secondary: 'Resolve or Inspiration (defence/utility)',
      note: 'Set role in Nexus//Draft for a better default page.'
    }
  }
  return ROLE_DEFAULT[role]
}
