import { canonicalItemName } from '../dataDragon'
import type { ChampionBuildPath } from './buildPaths'
import { getChampionThreatOverride } from './championThreatOverrides'
import type { LiveGamePlayer, LiveGameSnapshot } from './liveGame'

/**
 * In-game "what do I buy next" from the live scoreboard: the champion's U.GG path, what you
 * already own, your gold, and what the enemy team is actually building.
 *
 * Pure and synchronous so the overlay can rerun it on every 2s poll.
 */

export type AdvisorItem = {
  id: number
  name: string
  description?: string
  tags: string[]
  stats: Record<string, number>
  gold: { base: number; total: number; purchasable?: boolean }
  from?: string[]
  into?: string[]
  /** Transform source (Manamune -> Muramana). */
  specialRecipe?: number
  consumed?: boolean
  depth?: number
}

export type AdvisorCatalog = ReadonlyMap<number, AdvisorItem>

export type BuildSlotStatus = 'owned' | 'building' | 'next' | 'planned'

export type LiveBuildSlot = {
  itemId: number
  status: BuildSlotStatus
  /** Bought, but not part of the recommended path. */
  offPath?: boolean
  /** Swapped in for the enemy comp; the reason is shown on hover. */
  swapReason?: string
}

export type LiveNextBuy = {
  itemId: number
  /** Gold still needed after the components you own. */
  remainingCost: number
  gold: number
  affordable: boolean
  /** What to click in the shop right now with the gold you have. */
  buyNow: { itemId: number; cost: number }[]
  ownedComponents: number[]
  thenItemId: number | null
}

export type LiveNeed = 'antiHeal' | 'armorPen' | 'magicPen' | 'antiTank' | 'armor' | 'magicResist'

export type LiveSwap = {
  need: LiveNeed
  itemId: number
  reason: string
  /** Reason with the triggering champions appended when the reason does not already name them. */
  detail: string
  /** Champions that triggered it. */
  because: string[]
  replaces: number | null
  /** Cheap component worth buying now (e.g. Executioner's Calling). */
  rushComponent: number | null
}

export type LiveThreat = {
  championKey: string | null
  championId: number | null
  championName: string
  role: LiveGamePlayer['role']
  kills: number
  deaths: number
  assists: number
  level: number
  itemGold: number
  damage: 'AD' | 'AP' | 'mixed' | 'tank'
  fed: boolean
  notes: string[]
  items: number[]
}

export type LiveBuildAdvice = {
  phase: 'laning' | 'mid' | 'late'
  me: LiveGamePlayer
  profile: BuildProfile
  build: LiveBuildSlot[]
  next: LiveNextBuy | null
  swaps: LiveSwap[]
  threats: LiveThreat[]
  enemyDamage: { ad: number; ap: number }
  signals: string[]
  skillPriority: string[]
  completedCount: number
}

export type BuildProfile = 'marksman' | 'bruiser' | 'assassin' | 'mage' | 'tank' | 'enchanter'

const TRINKET_OR_WARD = new Set([2055, 3340, 3363, 3364, 3330, 3513])

/** Kits that out-heal a normal fight without anti-heal. DDragon keys, lowercase. */
const HEAVY_HEALERS = new Set([
  'aatrox', 'belveth', 'briar', 'drmundo', 'fiddlesticks', 'gwen', 'illaoi', 'ivern', 'kayn', 'maokai',
  'milio', 'nami', 'nasus', 'olaf', 'seraphine', 'sona', 'soraka', 'swain', 'sylas', 'taric', 'trundle',
  'vladimir', 'volibear', 'warwick', 'yuumi', 'zac', 'viego', 'senna', 'renekton', 'udyr'
])

/** Counter items by need and by what your champion builds. Names, not ids: ids drift between patches. */
const NEED_ITEMS: Record<LiveNeed, Partial<Record<BuildProfile, string[]>>> = {
  antiHeal: {
    marksman: ['Mortal Reminder'],
    bruiser: ['Chempunk Chainsword', 'Mortal Reminder'],
    assassin: ['Chempunk Chainsword'],
    mage: ['Morellonomicon'],
    tank: ['Thornmail']
  },
  armorPen: {
    marksman: ["Lord Dominik's Regards", 'Mortal Reminder'],
    bruiser: ['Black Cleaver', "Serylda's Grudge"],
    assassin: ["Serylda's Grudge"]
  },
  magicPen: {
    mage: ['Void Staff', 'Cryptbloom']
  },
  antiTank: {
    marksman: ['Blade of The Ruined King', 'Kraken Slayer'],
    bruiser: ['Black Cleaver', 'Blade of The Ruined King'],
    mage: ["Liandry's Torment", 'Blackfire Torch']
  },
  armor: {
    marksman: ['Guardian Angel'],
    bruiser: ["Death's Dance", "Randuin's Omen", 'Guardian Angel'],
    assassin: ['Guardian Angel', "Death's Dance"],
    mage: ["Zhonya's Hourglass"],
    tank: ["Randuin's Omen", 'Frozen Heart', 'Thornmail', "Dead Man's Plate"],
    enchanter: ['Locket of the Iron Solari', "Knight's Vow"]
  },
  magicResist: {
    marksman: ['Mercurial Scimitar', "Wit's End", 'Maw of Malmortius'],
    bruiser: ['Maw of Malmortius', 'Spirit Visage', 'Kaenic Rookern'],
    assassin: ['Maw of Malmortius', 'Edge of Night'],
    mage: ["Banshee's Veil"],
    tank: ['Force of Nature', 'Kaenic Rookern', 'Spirit Visage', 'Abyssal Mask'],
    enchanter: ['Locket of the Iron Solari', "Mikael's Blessing"]
  }
}

const NEED_LABEL: Record<LiveNeed, string> = {
  antiHeal: 'Anti-heal',
  armorPen: 'Armor pen',
  magicPen: 'Magic pen',
  antiTank: 'Tank shred',
  armor: 'Armor',
  magicResist: 'Magic resist'
}

export function liveNeedLabel(need: LiveNeed): string {
  return NEED_LABEL[need]
}

function stat(item: AdvisorItem | undefined, key: string): number {
  const value = item?.stats?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** "<attention>18</attention> Lethality" lines; DDragon `stats` omits pen, haste and vamp. */
export function itemStatLines(item: AdvisorItem | undefined): Map<string, number> {
  const out = new Map<string, number>()
  const desc = item?.description ?? ''
  const re = /<attention>\s*([\d.]+)%?\s*<\/attention>\s*([^<]+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(desc)) !== null) {
    const value = Number(match[1])
    const name = match[2]!.trim().toLowerCase()
    if (Number.isFinite(value) && name) {
      out.set(name, (out.get(name) ?? 0) + value)
    }
  }
  return out
}

function hasLine(item: AdvisorItem | undefined, needle: string): boolean {
  return Array.from(itemStatLines(item).keys()).some((key) => key.includes(needle))
}

function isBoots(item: AdvisorItem | undefined): boolean {
  return Boolean(item?.tags.some((tag) => tag.toLowerCase() === 'boots'))
}

function isConsumableOrTrinket(item: AdvisorItem | undefined, id: number): boolean {
  if (TRINKET_OR_WARD.has(id)) {
    return true
  }
  if (!item) {
    return false
  }
  return item.consumed === true || item.tags.some((tag) => ['consumable', 'trinket'].includes(tag.toLowerCase()))
}

/** A finished slot: legendary, tier-2+ boots, or an upgraded support item. */
export function isCompletedItem(item: AdvisorItem | undefined, id: number): boolean {
  if (!item || isConsumableOrTrinket(item, id)) {
    return false
  }
  if (isBoots(item)) {
    return item.gold.total >= 900
  }
  if (item.tags.includes('GoldPer') && (item.depth ?? 0) >= 2) {
    return true
  }
  if (item.gold.total >= 2000) {
    return true
  }
  return !item.into?.length && item.gold.total >= 1000
}

const upgradeIndexCache = new WeakMap<AdvisorCatalog, Map<number, Set<number>>>()

/** Every item that `id` turns into, through recipes or transforms (Sorc Shoes -> Spellslinger's). */
function upgradeIndex(catalog: AdvisorCatalog): Map<number, Set<number>> {
  const cached = upgradeIndexCache.get(catalog)
  if (cached) {
    return cached
  }
  const parents = new Map<number, Set<number>>()
  const link = (child: number, parent: number) => {
    const set = parents.get(child) ?? new Set<number>()
    set.add(parent)
    parents.set(child, set)
  }
  for (const item of Array.from(catalog.values())) {
    for (const from of item.from ?? []) {
      link(Number(from), item.id)
    }
    if (item.specialRecipe) {
      link(item.specialRecipe, item.id)
    }
  }
  upgradeIndexCache.set(catalog, parents)
  return parents
}

function upgradesOf(id: number, parents: Map<number, Set<number>>): Set<number> {
  const out = new Set<number>()
  const stack = [id]
  while (stack.length) {
    const next = stack.pop()!
    for (const parent of Array.from(parents.get(next) ?? [])) {
      if (!out.has(parent)) {
        out.add(parent)
        stack.push(parent)
      }
    }
  }
  return out
}

type Inventory = Map<number, number>

function inventoryOf(player: LiveGamePlayer): Inventory {
  const inv: Inventory = new Map()
  for (const item of player.items) {
    inv.set(item.itemId, (inv.get(item.itemId) ?? 0) + Math.max(1, item.count))
  }
  return inv
}

function take(inv: Inventory, id: number): boolean {
  const n = inv.get(id) ?? 0
  if (n <= 0) {
    return false
  }
  inv.set(id, n - 1)
  return true
}

/** Shop math: owned components anywhere in the recipe tree are consumed, like the real shop. */
export function remainingItemCost(id: number, owned: Inventory, catalog: AdvisorCatalog): { cost: number; used: number[] } {
  const inv = new Map(owned)
  const used: number[] = []
  const walk = (itemId: number, depth: number): number => {
    if (depth > 0 && take(inv, itemId)) {
      used.push(itemId)
      return 0
    }
    const item = catalog.get(itemId)
    if (!item) {
      return 0
    }
    if (!item.from?.length || depth > 6) {
      return item.gold.total
    }
    return item.gold.base + item.from.reduce((sum, fromId) => sum + walk(Number(fromId), depth + 1), 0)
  }
  return { cost: walk(id, 0), used }
}

/**
 * Spend current gold toward `id`: the whole item when affordable, otherwise the most expensive
 * components that fit, digging into sub-components when a component is out of reach.
 */
export function componentsToBuy(id: number, owned: Inventory, gold: number, catalog: AdvisorCatalog): { itemId: number; cost: number }[] {
  const inv = new Map(owned)
  const full = remainingItemCost(id, inv, catalog)
  if (full.cost <= gold) {
    return [{ itemId: id, cost: full.cost }]
  }
  const buys: { itemId: number; cost: number }[] = []
  let budget = gold
  const visit = (itemId: number, depth: number) => {
    const item = catalog.get(itemId)
    if (!item?.from?.length || depth > 5) {
      return
    }
    const parts = item.from
      .map(Number)
      .map((partId) => ({ partId, cost: remainingItemCost(partId, inv, catalog).cost }))
      .sort((a, b) => b.cost - a.cost)
    for (const { partId } of parts) {
      if (take(inv, partId)) {
        continue
      }
      const cost = remainingItemCost(partId, inv, catalog)
      if (cost.cost <= 0) {
        continue
      }
      if (cost.cost <= budget) {
        for (const usedId of cost.used) {
          take(inv, usedId)
        }
        buys.push({ itemId: partId, cost: cost.cost })
        budget -= cost.cost
      } else {
        visit(partId, depth + 1)
      }
    }
  }
  visit(id, 0)
  return buys
}

function ownedComponentsOf(id: number, owned: Inventory, catalog: AdvisorCatalog): number[] {
  return remainingItemCost(id, owned, catalog).used
}

function itemGoldValue(player: LiveGamePlayer, catalog: AdvisorCatalog): number {
  return player.items.reduce((sum, row) => {
    const item = catalog.get(row.itemId)
    if (!item || isConsumableOrTrinket(item, row.itemId)) {
      return sum
    }
    return sum + item.gold.total * Math.max(1, row.count)
  }, 0)
}

type EnemyRead = {
  player: LiveGamePlayer
  itemGold: number
  armor: number
  mr: number
  hp: number
  ad: number
  ap: number
  healingItems: number
  threat: 'ad' | 'ap' | 'hybrid' | 'utility'
  classes: string[]
}

function readEnemy(player: LiveGamePlayer, catalog: AdvisorCatalog): EnemyRead {
  let armor = 0
  let mr = 0
  let hp = 0
  let ad = 0
  let ap = 0
  let healingItems = 0
  for (const row of player.items) {
    const item = catalog.get(row.itemId)
    if (!item || isConsumableOrTrinket(item, row.itemId)) {
      continue
    }
    const n = Math.max(1, row.count)
    armor += stat(item, 'FlatArmorMod') * n
    mr += stat(item, 'FlatSpellBlockMod') * n
    hp += stat(item, 'FlatHPPoolMod') * n
    ad += stat(item, 'FlatPhysicalDamageMod') * n
    ap += stat(item, 'FlatMagicDamageMod') * n
    if (isCompletedItem(item, row.itemId) && (hasLine(item, 'life steal') || hasLine(item, 'omnivamp') || hasLine(item, 'heal and shield power'))) {
      healingItems += 1
    }
  }
  const override = getChampionThreatOverride(player.championName) ?? getChampionThreatOverride(player.championKey)
  return {
    player,
    itemGold: itemGoldValue(player, catalog),
    armor,
    mr,
    hp,
    ad,
    ap,
    healingItems,
    threat: override?.threat ?? 'hybrid',
    classes: override?.classes ?? []
  }
}

/** Physical vs magic weight for one enemy: kit first, then what they actually built. */
function damageSplit(enemy: EnemyRead): { ad: number; ap: number } {
  const kit =
    enemy.threat === 'ad' ? { ad: 1, ap: 0.1 } : enemy.threat === 'ap' ? { ad: 0.1, ap: 1 } : enemy.threat === 'hybrid' ? { ad: 0.55, ap: 0.55 } : { ad: 0.2, ap: 0.25 }
  const items = { ad: enemy.ad / 60, ap: enemy.ap / 80 }
  const weight = 1 + enemy.itemGold / 4000
  return { ad: (kit.ad + items.ad) * weight, ap: (kit.ap + items.ap) * weight }
}

function damageLabel(enemy: EnemyRead): LiveThreat['damage'] {
  const split = damageSplit(enemy)
  const defensive = enemy.armor + enemy.mr + enemy.hp / 12
  if (enemy.classes.includes('tank') && defensive > (enemy.ad + enemy.ap) * 1.2 && defensive > 60) {
    return 'tank'
  }
  if (split.ad > split.ap * 1.6) return 'AD'
  if (split.ap > split.ad * 1.6) return 'AP'
  return 'mixed'
}

function isFed(enemy: EnemyRead, averageGold: number): boolean {
  const p = enemy.player
  return (p.kills >= 4 && p.kills - p.deaths >= 3) || (enemy.itemGold >= 2500 && enemy.itemGold >= averageGold * 1.4)
}

/** What kind of items your champion buys, read from its own build path. */
export function buildProfileFor(path: ChampionBuildPath | null, me: LiveGamePlayer, catalog: AdvisorCatalog): BuildProfile {
  const ids = [...(path?.fullBuild ?? []), ...me.items.map((row) => row.itemId)]
  let ad = 0
  let ap = 0
  let defense = 0
  let lethality = 0
  let crit = 0
  let enchant = 0
  for (const id of ids) {
    const item = catalog.get(id)
    if (!item || !isCompletedItem(item, id) || isBoots(item)) {
      continue
    }
    ad += stat(item, 'FlatPhysicalDamageMod')
    ap += stat(item, 'FlatMagicDamageMod')
    crit += stat(item, 'FlatCritChanceMod')
    defense += stat(item, 'FlatArmorMod') + stat(item, 'FlatSpellBlockMod') + stat(item, 'FlatHPPoolMod') / 10
    const lines = itemStatLines(item)
    lethality += lines.get('lethality') ?? 0
    enchant += lines.get('heal and shield power') ?? 0
  }
  const override = getChampionThreatOverride(me.championName) ?? getChampionThreatOverride(me.championKey)
  const classes = new Set(override?.classes ?? [])
  if ((me.role === 'support' || classes.has('support')) && enchant >= 10 && ad + ap < 150) {
    return 'enchanter'
  }
  if (defense > (ad + ap) * 1.3 && defense > 80) {
    return 'tank'
  }
  if (ap > ad * 1.2) {
    return 'mage'
  }
  if (crit >= 0.25 || classes.has('marksman')) {
    return 'marksman'
  }
  if (lethality >= 18 || (classes.has('assassin') && !classes.has('fighter'))) {
    return 'assassin'
  }
  if (ad === 0 && ap === 0) {
    if (override?.threat === 'ap') return 'mage'
    if (classes.has('tank')) return 'tank'
    if (me.role === 'support') return 'enchanter'
  }
  return 'bruiser'
}

const byNameCache = new WeakMap<AdvisorCatalog, Map<string, AdvisorItem>>()

function catalogByName(catalog: AdvisorCatalog): Map<string, AdvisorItem> {
  const cached = byNameCache.get(catalog)
  if (cached) {
    return cached
  }
  const out = new Map<string, AdvisorItem>()
  for (const item of Array.from(catalog.values())) {
    if (item.gold.purchasable === false) {
      continue
    }
    const key = canonicalItemName(item.name)
    const current = out.get(key)
    if (!current || item.id < current.id) {
      out.set(key, item)
    }
  }
  byNameCache.set(catalog, out)
  return out
}

/** Grievous-wounds / resist component worth buying early when the full item is far away. */
function rushComponentFor(itemId: number, need: LiveNeed, catalog: AdvisorCatalog): number | null {
  const item = catalog.get(itemId)
  if (!item?.from?.length) {
    return null
  }
  const parts = item.from.map(Number).map((id) => catalog.get(id)).filter((part): part is AdvisorItem => part != null)
  const pick = parts
    .filter((part) => {
      if (need === 'antiHeal') return /grievous/i.test(part.description ?? '')
      if (need === 'armor') return stat(part, 'FlatArmorMod') > 0
      if (need === 'magicResist') return stat(part, 'FlatSpellBlockMod') > 0
      if (need === 'armorPen') return hasLine(part, 'armor penetration') || hasLine(part, 'lethality')
      if (need === 'magicPen') return hasLine(part, 'magic penetration')
      return false
    })
    .sort((a, b) => a.gold.total - b.gold.total)[0]
  return pick?.id ?? null
}

function namesOf(enemies: EnemyRead[]): string[] {
  return enemies.map((enemy) => enemy.player.championName).slice(0, 3)
}

type NeedRead = { need: LiveNeed; weight: number; reason: string; because: string[] }

function readNeeds(enemies: EnemyRead[], profile: BuildProfile, gameTime: number): { needs: NeedRead[]; enemyDamage: { ad: number; ap: number }; signals: string[] } {
  const signals: string[] = []
  const needs: NeedRead[] = []
  const totals = enemies.map(damageSplit).reduce((acc, row) => ({ ad: acc.ad + row.ad, ap: acc.ap + row.ap }), { ad: 0, ap: 0 })
  const sum = totals.ad + totals.ap || 1
  const enemyDamage = { ad: totals.ad / sum, ap: totals.ap / sum }
  const averageGold = enemies.reduce((s, e) => s + e.itemGold, 0) / Math.max(1, enemies.length)
  const fed = enemies.filter((enemy) => isFed(enemy, averageGold))

  const healers = enemies.filter((enemy) => HEAVY_HEALERS.has((enemy.player.championKey ?? '').toLowerCase()) || enemy.healingItems > 0)
  const healScore = enemies.reduce(
    (score, enemy) => score + (HEAVY_HEALERS.has((enemy.player.championKey ?? '').toLowerCase()) ? 1 : 0) + enemy.healingItems * 0.6,
    0
  )
  if (healScore >= 2) {
    signals.push(`${healers.length} enemies heal`)
    needs.push({ need: 'antiHeal', weight: 2 + healScore, reason: 'Their team heals through fights', because: namesOf(healers) })
  }

  const armorStackers = enemies.filter((enemy) => enemy.armor >= 60)
  if (armorStackers.length >= 2 || enemies.some((enemy) => enemy.armor >= 110)) {
    const who = armorStackers.length ? armorStackers : enemies.filter((enemy) => enemy.armor >= 110)
    signals.push(`${who.length} stacking armor`)
    needs.push({ need: 'armorPen', weight: 2 + who.length, reason: 'Enemies are stacking armor', because: namesOf(who) })
  }
  const mrStackers = enemies.filter((enemy) => enemy.mr >= 55)
  if (mrStackers.length >= 2 || enemies.some((enemy) => enemy.mr >= 100)) {
    const who = mrStackers.length ? mrStackers : enemies.filter((enemy) => enemy.mr >= 100)
    signals.push(`${who.length} stacking magic resist`)
    needs.push({ need: 'magicPen', weight: 2 + who.length, reason: 'Enemies are stacking magic resist', because: namesOf(who) })
  }
  const hpStackers = enemies.filter((enemy) => enemy.hp >= 1200)
  if (hpStackers.length >= 2 || enemies.some((enemy) => enemy.hp >= 2000)) {
    signals.push(`${hpStackers.length} building big health`)
    needs.push({ need: 'antiTank', weight: 1.5 + hpStackers.length, reason: 'Their frontline is stacking health', because: namesOf(hpStackers) })
  }

  const fedAd = fed.filter((enemy) => damageLabel(enemy) === 'AD')
  const fedAp = fed.filter((enemy) => damageLabel(enemy) === 'AP')
  const lateEnough = gameTime >= 9 * 60
  if (lateEnough && (enemyDamage.ad >= 0.66 || (fedAd.length > 0 && enemyDamage.ad >= 0.5))) {
    signals.push(`${Math.round(enemyDamage.ad * 100)}% of their damage is physical`)
    needs.push({
      need: 'armor',
      weight: 1 + fedAd.length * 1.5 + (enemyDamage.ad - 0.5) * 4,
      reason: fedAd.length ? `${fedAd[0]!.player.championName} is fed on physical damage` : 'Their damage is mostly physical',
      because: namesOf(fedAd.length ? fedAd : enemies.filter((enemy) => damageLabel(enemy) === 'AD'))
    })
  }
  if (lateEnough && (enemyDamage.ap >= 0.66 || (fedAp.length > 0 && enemyDamage.ap >= 0.5))) {
    signals.push(`${Math.round(enemyDamage.ap * 100)}% of their damage is magic`)
    needs.push({
      need: 'magicResist',
      weight: 1 + fedAp.length * 1.5 + (enemyDamage.ap - 0.5) * 4,
      reason: fedAp.length ? `${fedAp[0]!.player.championName} is fed on magic damage` : 'Their damage is mostly magic',
      because: namesOf(fedAp.length ? fedAp : enemies.filter((enemy) => damageLabel(enemy) === 'AP'))
    })
  }
  if (fed.length) {
    signals.push(`Fed: ${fed.map((enemy) => enemy.player.championName).join(', ')}`)
  }
  // Damage dealers care about pen first; tanks and enchanters about resists.
  return { needs: needs.filter((row) => NEED_ITEMS[row.need][profile]?.length).sort((a, b) => b.weight - a.weight), enemyDamage, signals }
}

/** Items whose passive shreds big health bars; "mentions health" is far too broad a test. */
const ANTI_TANK_ITEMS = new Set(
  [
    'Blade of The Ruined King',
    'Black Cleaver',
    "Liandry's Torment",
    'Blackfire Torch',
    'Kraken Slayer',
    "Lord Dominik's Regards",
    'Terminus',
    "Bloodletter's Curse",
    'Void Staff',
    'Cryptbloom',
    "Serylda's Grudge"
  ].map(canonicalItemName)
)

function itemSatisfies(item: AdvisorItem | undefined, need: LiveNeed): boolean {
  if (!item) return false
  switch (need) {
    case 'antiHeal':
      return /grievous wounds/i.test(item.description ?? '')
    case 'armorPen':
      return hasLine(item, 'armor penetration')
    case 'magicPen':
      return hasLine(item, 'magic penetration') && !isBoots(item)
    case 'antiTank':
      return ANTI_TANK_ITEMS.has(canonicalItemName(item.name))
    case 'armor':
      return stat(item, 'FlatArmorMod') >= 40
    case 'magicResist':
      return stat(item, 'FlatSpellBlockMod') >= 35
  }
}

/** "Their team heals (Soraka, Aatrox)" — but never "Zed is fed (Zed)". */
function reasonText(need: { reason: string; because: string[] }): string {
  const extra = need.because.filter((name) => !need.reason.includes(name))
  return extra.length ? `${need.reason} (${extra.join(', ')})` : need.reason
}

/** A swap this strong jumps the queue (right after the item you are finishing). */
const URGENT_SWAP_WEIGHT = 4.5
const URGENT_SWAP_AFTER_SECONDS = 12 * 60

export type LiveAdvisorInput = {
  snapshot: LiveGameSnapshot
  path: ChampionBuildPath | null
  catalog: AdvisorCatalog
}

export function buildLiveAdvice({ snapshot, path, catalog }: LiveAdvisorInput): LiveBuildAdvice | null {
  const me = snapshot.players.find((p) => p.isActive)
  if (!me) {
    return null
  }
  const parents = upgradeIndex(catalog)
  const owned = inventoryOf(me)
  const ownedIds = new Set(owned.keys())
  const ownsOrUpgraded = (id: number) => ownedIds.has(id) || Array.from(upgradesOf(id, parents)).some((up) => ownedIds.has(up))
  const enemies = snapshot.players.filter((p) => p.team !== me.team).map((p) => readEnemy(p, catalog))
  const profile = buildProfileFor(path, me, catalog)
  const { needs, enemyDamage, signals } = readNeeds(enemies, profile, snapshot.gameTime)

  // Finished items you already bought stay in the plan even if the path never mentioned them.
  const completedOwned = me.items
    .map((row) => row.itemId)
    .filter((id, idx, arr) => arr.indexOf(id) === idx && isCompletedItem(catalog.get(id), id))
  const pathIds = (path?.fullBuild ?? []).filter((id) => catalog.has(id))
  const plan: LiveBuildSlot[] = []
  const pushSlot = (slot: LiveBuildSlot) => {
    if (plan.length < 6 && !plan.some((row) => row.itemId === slot.itemId)) {
      plan.push(slot)
    }
  }
  for (const id of pathIds) {
    const ownedUpgrade = completedOwned.find((ownedId) => ownedId === id || upgradesOf(id, parents).has(ownedId))
    if (ownedUpgrade != null) {
      pushSlot({ itemId: ownedUpgrade, status: 'owned' })
    }
  }
  const ownedBoots = completedOwned.some((id) => isBoots(catalog.get(id)))
  for (const id of completedOwned) {
    if (!plan.some((row) => row.itemId === id)) {
      pushSlot({ itemId: id, status: 'owned', offPath: true })
    }
  }
  for (const id of pathIds) {
    if (plan.length >= 6) break
    if (ownsOrUpgraded(id) || (ownedBoots && isBoots(catalog.get(id)))) continue
    pushSlot({ itemId: id, status: 'planned' })
  }

  // Adapt: swap late planned slots (never the core three) for what the enemy comp demands.
  const byName = catalogByName(catalog)
  const coreIds = new Set((path?.core ?? []).slice(0, 3))
  const options = new Set((path?.slots ?? []).flatMap((slot) => slot.options.map((option) => option.itemId)))
  const swaps: LiveSwap[] = []
  const urgentSwapIds = new Set<number>()
  const urgent = (weight: number) => weight >= URGENT_SWAP_WEIGHT && snapshot.gameTime >= URGENT_SWAP_AFTER_SECONDS
  for (const need of needs.slice(0, 2)) {
    if (plan.some((row) => row.status === 'owned' && itemSatisfies(catalog.get(row.itemId), need.need))) {
      continue
    }
    // Already planned (Zhonya's vs a fed Zed): say why it matters and pull it forward if urgent.
    const plannedCover = plan.find((row) => row.status !== 'owned' && itemSatisfies(catalog.get(row.itemId), need.need))
    if (plannedCover) {
      plannedCover.swapReason ??= reasonText(need)
      if (urgent(need.weight)) {
        urgentSwapIds.add(plannedCover.itemId)
      }
      swaps.push({
        need: need.need,
        itemId: plannedCover.itemId,
        reason: need.reason,
        detail: reasonText(need),
        because: need.because,
        replaces: null,
        rushComponent: rushComponentFor(plannedCover.itemId, need.need, catalog)
      })
      continue
    }
    const candidates = (NEED_ITEMS[need.need][profile] ?? [])
      .map((name) => byName.get(canonicalItemName(name)))
      .filter((item): item is AdvisorItem => item != null && !ownsOrUpgraded(item.id) && !plan.some((row) => row.itemId === item.id))
      .sort((a, b) => Number(options.has(b.id)) - Number(options.has(a.id)))
    const pick = candidates[0]
    if (!pick) {
      continue
    }
    let replaceIdx = -1
    for (let i = plan.length - 1; i >= 0; i -= 1) {
      const row = plan[i]!
      if (row.status !== 'owned' && !row.swapReason && !coreIds.has(row.itemId) && !isBoots(catalog.get(row.itemId))) {
        replaceIdx = i
        break
      }
    }
    const replaces = replaceIdx >= 0 ? plan[replaceIdx]!.itemId : null
    const slot: LiveBuildSlot = { itemId: pick.id, status: 'planned', swapReason: reasonText(need) }
    // With six finished items there is no slot to swap; the advice still shows (sell something).
    if (replaceIdx >= 0) {
      plan[replaceIdx] = slot
    } else if (plan.length < 6) {
      plan.push(slot)
    }
    if (urgent(need.weight)) {
      urgentSwapIds.add(pick.id)
    }
    swaps.push({
      need: need.need,
      itemId: pick.id,
      reason: need.reason,
      detail: reasonText(need),
      because: need.because,
      replaces,
      rushComponent: rushComponentFor(pick.id, need.need, catalog)
    })
  }

  // Finish the item you already started; only a strong need jumps in right behind it.
  const firstOpen = plan.findIndex((row) => row.status !== 'owned')
  if (firstOpen >= 0) {
    const open = plan.slice(firstOpen)
    const head = plan.slice(0, firstOpen)
    const inProgress = open.filter((row) => !urgentSwapIds.has(row.itemId) && ownedComponentsOf(row.itemId, owned, catalog).length > 0)
    const urgent = open.filter((row) => urgentSwapIds.has(row.itemId))
    const rest = open.filter((row) => !inProgress.includes(row) && !urgent.includes(row))
    plan.splice(0, plan.length, ...head, ...inProgress.slice(0, 1), ...urgent, ...inProgress.slice(1), ...rest)
  }

  let nextIdx = -1
  for (let i = 0; i < plan.length; i += 1) {
    const row = plan[i]!
    if (row.status === 'owned') continue
    row.status = ownedComponentsOf(row.itemId, owned, catalog).length > 0 ? 'building' : 'planned'
    if (nextIdx < 0) nextIdx = i
  }
  let next: LiveNextBuy | null = null
  if (nextIdx >= 0) {
    const row = plan[nextIdx]!
    row.status = 'next'
    const gold = snapshot.activeGold ?? 0
    const remaining = remainingItemCost(row.itemId, owned, catalog)
    next = {
      itemId: row.itemId,
      remainingCost: remaining.cost,
      gold,
      affordable: remaining.cost <= gold,
      buyNow: componentsToBuy(row.itemId, owned, gold, catalog),
      ownedComponents: remaining.used,
      thenItemId: plan.slice(nextIdx + 1).find((r) => r.status !== 'owned')?.itemId ?? null
    }
  }

  const averageGold = enemies.reduce((s, e) => s + e.itemGold, 0) / Math.max(1, enemies.length)
  const threats: LiveThreat[] = enemies
    .map((enemy) => {
      const notes: string[] = []
      if (enemy.armor >= 60) notes.push(`${Math.round(enemy.armor)} armor`)
      if (enemy.mr >= 55) notes.push(`${Math.round(enemy.mr)} MR`)
      if (enemy.hp >= 1200) notes.push(`+${Math.round(enemy.hp)} HP`)
      if (HEAVY_HEALERS.has((enemy.player.championKey ?? '').toLowerCase()) || enemy.healingItems > 0) notes.push('heals')
      return {
        championKey: enemy.player.championKey,
        championId: enemy.player.championId,
        championName: enemy.player.championName,
        role: enemy.player.role,
        kills: enemy.player.kills,
        deaths: enemy.player.deaths,
        assists: enemy.player.assists,
        level: enemy.player.level,
        itemGold: enemy.itemGold,
        damage: damageLabel(enemy),
        fed: isFed(enemy, averageGold),
        notes,
        items: enemy.player.items.map((row) => row.itemId).filter((id) => !isConsumableOrTrinket(catalog.get(id), id))
      }
    })
    .sort((a, b) => Number(b.fed) - Number(a.fed) || b.itemGold - a.itemGold || b.kills - b.deaths - (a.kills - a.deaths))

  const minutes = snapshot.gameTime / 60
  return {
    phase: minutes < 14 ? 'laning' : minutes < 25 ? 'mid' : 'late',
    me,
    profile,
    build: plan,
    next,
    swaps,
    threats,
    enemyDamage,
    signals,
    skillPriority: path?.skills?.priority ?? [],
    completedCount: completedOwned.length
  }
}
