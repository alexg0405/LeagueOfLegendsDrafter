const VERSIONS_URL = 'https://ddragon.leagueoflegends.com/api/versions.json'

let cachedVersion: string | null = null

/**
 * Returns latest patch string from Data Dragon (e.g. "15.1.1").
 * Future: ETag, disk cache, user override in settings.
 */
export async function getLatestDDragonVersion(): Promise<string> {
  if (cachedVersion) {
    return cachedVersion
  }
  const res = await fetch(VERSIONS_URL)
  if (!res.ok) {
    throw new Error(`Failed to load versions: ${res.status}`)
  }
  const list = (await res.json()) as string[]
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Invalid versions.json')
  }
  cachedVersion = list[0]!
  return cachedVersion
}

export function ddragonChampionImageUrl(
  version: string,
  championKey: string
): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championKey}.png`
}

export function ddragonItemImageUrl(version: string, itemId: number): string {
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`
}

export type ChampionSpellLite = {
  name: string
  description: string
  tooltip: string
}

/** Riot DDragon: official class tags and resource bar type (drives our AD/AP / tank hints). */
export type ChampionLite = {
  id: number
  key: string
  name: string
  tags: string[]
  partype: string
  passive?: ChampionSpellLite
  spells?: ChampionSpellLite[]
}

export type ItemLite = {
  id: number
  name: string
  description: string
  plaintext: string
  tags: string[]
  stats: Record<string, number>
  gold: {
    base: number
    total: number
    sell: number
    purchasable: boolean
  }
  from?: string[]
  into?: string[]
  maps: Record<string, boolean>
  depth?: number
  requiredChampion?: string
  consumed?: boolean
  consumeOnFull?: boolean
}

const RETIRED_OR_OFFSTORE_ITEM_NAMES = new Set([
  'prowlers claw',
  "prowler's claw",
  'galeforce',
  'everfrost',
  'crown of the shattered queen',
  'divine sunderer',
  'goredrinker',
  'duskblade of draktharr'
])

export function canonicalItemName(raw: unknown): string {
  return typeof raw === 'string'
    ? raw
        .toLowerCase()
        .replace(/\u2019/g, "'")
        .replace(/[’']/g, "'")
        .replace(/[^a-z0-9']+/g, ' ')
        .trim()
    : ''
}

function hasNonstandardItemAccess(item: Record<string, unknown>): boolean {
  return item.requiredAlly != null || item.requiredBuffCurrencyName != null || item.specialRecipe != null
}

function itemQuality(item: ItemLite): number {
  return [
    item.gold.total > 0 ? 16 : 0,
    item.description ? 8 : 0,
    item.plaintext ? 4 : 0,
    item.tags.length > 0 ? 4 : 0,
    Object.keys(item.stats).length > 0 ? 4 : 0,
    item.from?.length ? 2 : 0,
    item.into?.length ? 1 : 0,
    item.consumed ? -8 : 0
  ].reduce((total, value) => total + value, 0)
}

function preferItemForCanonicalName(next: ItemLite, current: ItemLite): ItemLite {
  const nextQuality = itemQuality(next)
  const currentQuality = itemQuality(current)
  if (nextQuality !== currentQuality) {
    return nextQuality > currentQuality ? next : current
  }
  if (next.gold.total !== current.gold.total) {
    return next.gold.total > current.gold.total ? next : current
  }
  return next.id < current.id ? next : current
}

export function isCurrentSummonersRiftStoreItem(id: number, item: Record<string, unknown>): boolean {
  const maps = item.maps != null && typeof item.maps === 'object' ? item.maps as Record<string, unknown> : {}
  if (maps['11'] !== true || item.hideFromAll === true || item.inStore === false || hasNonstandardItemAccess(item)) {
    return false
  }
  const gold = item.gold != null && typeof item.gold === 'object' ? item.gold as Record<string, unknown> : {}
  if (gold.purchasable !== true) {
    return false
  }
  const name = canonicalItemName(item.name)
  return id > 0 && !RETIRED_OR_OFFSTORE_ITEM_NAMES.has(name)
}

const championCache = new Map<string, Map<string, number>>()
const championListCache = new Map<string, ChampionLite[]>()
const itemByIdCache = new Map<string, Map<number, ItemLite>>()
const itemListCache = new Map<string, ItemLite[]>()

function spellLite(raw: unknown): ChampionSpellLite | undefined {
  if (raw == null || typeof raw !== 'object') {
    return undefined
  }
  const r = raw as Record<string, unknown>
  return {
    name: typeof r.name === 'string' ? r.name : '',
    description: typeof r.description === 'string' ? r.description : '',
    tooltip: typeof r.tooltip === 'string' ? r.tooltip : ''
  }
}

function championsFromDDragonData(
  data: Record<string, { key: string; name: string; id: string; tags?: string[]; partype?: string; passive?: unknown; spells?: unknown[] }>
): { byLowerName: Map<string, number>; champions: ChampionLite[] } {
  const byLowerName = new Map<string, number>()
  const champions: ChampionLite[] = []
  for (const ch of Object.values(data)) {
    const numericId = Number(ch.key)
    if (!Number.isFinite(numericId) || numericId <= 0) {
      continue
    }
    champions.push({
      id: numericId,
      key: ch.id,
      name: ch.name,
      tags: Array.isArray(ch.tags) ? ch.tags : [],
      partype: typeof ch.partype === 'string' && ch.partype.length > 0 ? ch.partype : 'None',
      passive: spellLite(ch.passive),
      spells: Array.isArray(ch.spells) ? ch.spells.map(spellLite).filter((s): s is ChampionSpellLite => s != null) : undefined
    })
    byLowerName.set(ch.name.toLowerCase(), numericId)
    byLowerName.set(ch.id.toLowerCase(), numericId)
  }
  return { byLowerName, champions }
}

export function itemsFromDDragonData(data: Record<string, unknown>): ItemLite[] {
  const itemsByName = new Map<string, ItemLite>()
  for (const [idText, raw] of Object.entries(data)) {
    const id = Number(idText)
    if (!Number.isFinite(id) || id <= 0 || raw == null || typeof raw !== 'object') {
      continue
    }
    const item = raw as Record<string, unknown>
    if (!isCurrentSummonersRiftStoreItem(id, item)) {
      continue
    }
    const maps = item.maps != null && typeof item.maps === 'object' ? item.maps as Record<string, unknown> : {}
    const gold = item.gold != null && typeof item.gold === 'object' ? item.gold as Record<string, unknown> : {}
    const total = typeof gold.total === 'number' ? gold.total : 0
    const itemLite: ItemLite = {
      id,
      name: typeof item.name === 'string' ? item.name : `Item ${id}`,
      description: typeof item.description === 'string' ? item.description : '',
      plaintext: typeof item.plaintext === 'string' ? item.plaintext : '',
      tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [],
      stats: item.stats != null && typeof item.stats === 'object' ? item.stats as Record<string, number> : {},
      gold: {
        base: typeof gold.base === 'number' ? gold.base : 0,
        total,
        sell: typeof gold.sell === 'number' ? gold.sell : 0,
        purchasable: true
      },
      from: Array.isArray(item.from) ? item.from.filter((x): x is string => typeof x === 'string') : undefined,
      into: Array.isArray(item.into) ? item.into.filter((x): x is string => typeof x === 'string') : undefined,
      maps: Object.fromEntries(Object.entries(maps).map(([key, value]) => [key, value === true])),
      depth: typeof item.depth === 'number' ? item.depth : undefined,
      requiredChampion: typeof item.requiredChampion === 'string' ? item.requiredChampion : undefined,
      consumed: item.consumed === true,
      consumeOnFull: item.consumeOnFull === true
    }
    const key = canonicalItemName(itemLite.name) || String(itemLite.id)
    const current = itemsByName.get(key)
    itemsByName.set(key, current ? preferItemForCanonicalName(itemLite, current) : itemLite)
  }
  return Array.from(itemsByName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Fetches DDragon `champion.json` and returns champions + a lowercase-name → id map
 * (first match wins on ambiguous nicknames; prefer LCU for truth).
 */
export async function loadChampionMaps(version: string): Promise<{
  byLowerName: Map<string, number>
  champions: ChampionLite[]
}> {
  if (championCache.has(version)) {
    return {
      byLowerName: championCache.get(version)!,
      champions: championListCache.get(version) ?? []
    }
  }
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`
  let res = await fetch(url)
  if (!res.ok) {
    res = await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)
  }
  if (!res.ok) {
    throw new Error(`champion.json ${res.status}`)
  }
  const j = (await res.json()) as {
    data: Record<string, { key: string; name: string; id: string; tags?: string[]; partype?: string; passive?: unknown; spells?: unknown[] }>
  }
  const { byLowerName, champions } = championsFromDDragonData(j.data)
  championCache.set(version, byLowerName)
  championListCache.set(version, champions)
  return { byLowerName, champions }
}

export async function loadItemMaps(version: string): Promise<{
  byId: Map<number, ItemLite>
  items: ItemLite[]
}> {
  if (itemByIdCache.has(version)) {
    return {
      byId: itemByIdCache.get(version)!,
      items: itemListCache.get(version) ?? []
    }
  }
  const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/item.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`item.json ${res.status}`)
  }
  const j = (await res.json()) as { data: Record<string, unknown> }
  const items = itemsFromDDragonData(j.data ?? {})
  const byId = new Map(items.map((item) => [item.id, item] as const))
  itemByIdCache.set(version, byId)
  itemListCache.set(version, items)
  return { byId, items }
}
