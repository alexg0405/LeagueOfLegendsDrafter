import {
  buildSeedRevision,
  buildSeedRow,
  buildSeedRowsForChampion,
  currentBuildSeed,
  type BuildSeedOption,
  type BuildSeedRole,
  type BuildSeedRow
} from './buildSeedStore'
import type { DraftRole } from './types'

/** Minimal recipe view so the path can fold boot/upgrade options into the base item. */
export type BuildPathCatalogItem = {
  id: number
  name: string
  tags: string[]
  from?: string[]
  gold: { total: number }
}

export type BuildPathOption = {
  itemId: number
  winRate: number
  matches: number
  /** Share of this slot's tracked purchases (0-1). */
  share: number
}

export type BuildPathSlot = {
  slot: 4 | 5 | 6
  options: BuildPathOption[]
}

export type ChampionBuildPath = {
  championId: number
  role: BuildSeedRole
  patch: string
  rank: string
  sourceType: string
  sourceUrl: string
  matches: number | null
  winRate: number | null
  rolePct: number | null
  /** Under ~1k games: show, but flag it. */
  lowSample: boolean
  /** First buy with potions, duplicates kept (e.g. Doran's Ring + 2 potions). */
  startSet: number[]
  /** First three completed purchases in order. */
  core: number[]
  coreWinRate: number | null
  coreMatches: number | null
  boots: number | null
  slots: BuildPathSlot[]
  /** Recommended six-item end state, in purchase order. */
  fullBuild: number[]
  skills: { order: string[]; priority: string[] } | null
  spells: number[]
  runes: { primary: number; sub: number; perks: number[]; shards: number[] } | null
}

const ROLE_ORDER: readonly BuildSeedRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const LOW_SAMPLE_GAMES = 1000

function uniq(ids: readonly number[]): number[] {
  return Array.from(new Set(ids))
}

function isBootsItem(item: BuildPathCatalogItem | undefined): boolean {
  return Boolean(item?.tags.some((tag) => tag.toLowerCase() === 'boots'))
}

function slotOptions(raw: readonly BuildSeedOption[] | undefined): BuildPathOption[] {
  const rows = (raw ?? []).filter(([, , n]) => n > 0)
  const total = rows.reduce((sum, [, , n]) => sum + n, 0)
  return rows
    .slice()
    .sort((a, b) => b[2] - a[2])
    .map(([itemId, winRate, matches]) => ({ itemId, winRate, matches, share: total > 0 ? matches / total : 0 }))
}

/** Legacy rows (pinned/generated) have no buy order; rebuild a sensible one. */
function coreOrder(row: BuildSeedRow): number[] {
  if (row.order?.length) {
    return uniq(row.order).slice(0, 3)
  }
  const core = row.core ?? []
  const boots = row.boots?.[0]
  return uniq([core[0], boots, core[1], core[2]].filter((id): id is number => id != null)).slice(0, 3)
}

/**
 * Six-item end state: the U.GG core in buy order, boots if the core skipped them, then the most
 * bought 4th/5th/6th item. Options that upgrade something already in the build (tier-3 boots,
 * for example) replace that item instead of taking a slot.
 */
function fullBuildFor(
  row: BuildSeedRow,
  core: number[],
  slots: BuildPathSlot[],
  itemsById?: ReadonlyMap<number, BuildPathCatalogItem> | null
): number[] {
  const out = [...core]
  const boots = row.boots?.[0]
  const hasBoots = () => out.some((id) => id === boots || isBootsItem(itemsById?.get(id)))
  if (boots != null && !hasBoots()) {
    out.push(boots)
  }
  const place = (id: number): boolean => {
    if (out.includes(id)) {
      return false
    }
    const item = itemsById?.get(id)
    const base = item?.from?.map(Number).find((fromId) => out.includes(fromId))
    if (base != null && (isBootsItem(itemsById?.get(base)) || isBootsItem(item))) {
      out[out.indexOf(base)] = id
      return true
    }
    if (isBootsItem(item) && hasBoots()) {
      return false
    }
    if (out.length >= 6) {
      return false
    }
    out.push(id)
    return true
  }
  for (const slot of slots) {
    for (const option of slot.options) {
      if (place(option.itemId)) {
        break
      }
    }
  }
  for (const id of row.final ?? []) {
    if (out.length >= 6) {
      break
    }
    place(id)
  }
  return out.slice(0, 6)
}

const pathCache = new Map<string, ChampionBuildPath | null>()
let pathCacheRevision = -1

export function getChampionBuildPath(
  championId: number,
  role: DraftRole,
  itemsById?: ReadonlyMap<number, BuildPathCatalogItem> | null
): ChampionBuildPath | null {
  if (role === 'unknown') {
    return null
  }
  if (pathCacheRevision !== buildSeedRevision()) {
    pathCache.clear()
    pathCacheRevision = buildSeedRevision()
  }
  const cacheKey = `${championId}:${role}:${itemsById ? itemsById.size : 0}`
  if (pathCache.has(cacheKey)) {
    return pathCache.get(cacheKey) ?? null
  }
  const row = buildSeedRow(championId, role)
  if (!row) {
    pathCache.set(cacheKey, null)
    return null
  }
  const seed = currentBuildSeed()
  const core = coreOrder(row)
  const slots: BuildPathSlot[] = [
    { slot: 4 as const, options: slotOptions(row.items4) },
    { slot: 5 as const, options: slotOptions(row.items5) },
    { slot: 6 as const, options: slotOptions(row.items6) }
  ].filter((slot) => slot.options.length > 0)
  const skillOrder = row.skills ? row.skills.split('') : []
  const path: ChampionBuildPath = {
    championId,
    role: row.role,
    patch: row.patch ?? seed.statsPatch ?? seed.patch,
    rank: row.rank ?? seed.rank ?? 'emerald_plus',
    sourceType: row.sourceType ?? 'generated',
    sourceUrl: row.sourceUrl,
    matches: row.matches ?? null,
    winRate: row.winRate ?? null,
    rolePct: row.rolePct ?? null,
    lowSample: (row.matches ?? 0) < LOW_SAMPLE_GAMES,
    startSet: row.startSet?.length ? row.startSet : row.starting ?? [],
    core,
    coreWinRate: row.coreWinRate ?? null,
    coreMatches: row.coreMatches ?? null,
    boots: row.boots?.[0] ?? null,
    slots,
    fullBuild: fullBuildFor(row, core, slots, itemsById),
    skills:
      skillOrder.length || row.skillPriority
        ? { order: skillOrder, priority: (row.skillPriority ?? '').split('') }
        : null,
    spells: row.spells ?? [],
    runes: row.runes ? { primary: row.runes.primary, sub: row.runes.sub, perks: row.runes.perks, shards: row.runes.shards ?? [] } : null
  }
  pathCache.set(cacheKey, path)
  return path
}

export type ChampionBuildRole = {
  role: BuildSeedRole
  rolePct: number | null
  matches: number | null
  sourceType: string
}

/** Roles we have a build for, most played first. */
export function buildRolesForChampion(championId: number): ChampionBuildRole[] {
  return buildSeedRowsForChampion(championId)
    .map((row) => ({ role: row.role, rolePct: row.rolePct ?? null, matches: row.matches ?? null, sourceType: row.sourceType ?? 'generated' }))
    .sort((a, b) => (b.rolePct ?? -1) - (a.rolePct ?? -1) || (b.matches ?? 0) - (a.matches ?? 0) || ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
}

/**
 * Role to open the build in: the caller's role when the champion is genuinely played there
 * (≥ 5% of games or ≥ 1k games), otherwise the champion's main role.
 */
export function bestBuildRoleForChampion(championId: number, preferred?: DraftRole | null): BuildSeedRole | null {
  const roles = buildRolesForChampion(championId)
  if (roles.length === 0) {
    return null
  }
  if (preferred && preferred !== 'unknown') {
    const match = roles.find((row) => row.role === preferred)
    if (match && ((match.rolePct ?? 0) >= 5 || (match.matches ?? 0) >= LOW_SAMPLE_GAMES)) {
      return match.role
    }
  }
  return roles[0]!.role
}

export type BundledChampion = { id: number; key: string; name: string }

let championIndexRevision = -1
let championById = new Map<number, BundledChampion>()
let championByLowerKey = new Map<string, BundledChampion>()
let championByLowerName = new Map<string, BundledChampion>()

function ensureChampionIndex(): void {
  if (championIndexRevision === buildSeedRevision()) {
    return
  }
  championIndexRevision = buildSeedRevision()
  championById = new Map()
  championByLowerKey = new Map()
  championByLowerName = new Map()
  for (const [id, key, name] of currentBuildSeed().champions ?? []) {
    const row = { id, key, name }
    championById.set(id, row)
    championByLowerKey.set(key.toLowerCase(), row)
    championByLowerName.set(name.toLowerCase(), row)
  }
}

/** Offline id/key/name table shipped with the build seed. */
export function bundledChampion(id: number): BundledChampion | null {
  ensureChampionIndex()
  return championById.get(id) ?? null
}

export function bundledChampions(): BundledChampion[] {
  ensureChampionIndex()
  return Array.from(championById.values())
}

/** Resolve by DDragon key ("MonkeyKing") or display name ("Wukong"), case-insensitive. */
export function bundledChampionByKeyOrName(keyOrName: string | null | undefined): BundledChampion | null {
  if (!keyOrName) {
    return null
  }
  ensureChampionIndex()
  const lower = keyOrName.trim().toLowerCase()
  return championByLowerKey.get(lower) ?? championByLowerName.get(lower) ?? null
}

export function runeInfo(id: number | null | undefined): { name: string; icon: string } | null {
  if (id == null) {
    return null
  }
  const row = currentBuildSeed().runes?.[String(id)]
  return row ? { name: row[0], icon: row[1] } : null
}

const STAT_SHARD_NAMES: Record<number, string> = {
  5001: 'Health Scaling',
  5005: 'Attack Speed',
  5007: 'Ability Haste',
  5008: 'Adaptive Force',
  5010: 'Move Speed',
  5011: 'Health',
  5013: 'Tenacity & Slow Resist'
}

export function statShardName(id: number): string {
  return STAT_SHARD_NAMES[id] ?? `Shard ${id}`
}

export function summonerSpellInfo(id: number): { name: string; key: string } | null {
  const row = currentBuildSeed().spells?.[String(id)]
  return row ? { name: row[0], key: row[1] } : null
}
