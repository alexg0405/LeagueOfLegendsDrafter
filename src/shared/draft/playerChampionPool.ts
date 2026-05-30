import type { ChampionPoolPreference } from './types'

export const RIOT_PLATFORMS = [
  'na1',
  'br1',
  'la1',
  'la2',
  'euw1',
  'eun1',
  'tr1',
  'ru',
  'kr',
  'jp1',
  'oc1',
  'ph2',
  'sg2',
  'th2',
  'tw2',
  'vn2'
] as const

export type RiotPlatform = (typeof RIOT_PLATFORMS)[number]
export type RiotRegionGroup = 'americas' | 'asia' | 'europe' | 'sea'
export type RecommendationPoolMode = 'my-champs' | 'all-champs'

export type ParsedRiotId = {
  gameName: string
  tagLine: string
}

export type PlayerChampionPoolEntry = {
  championId: number
  championLevel: number
  championPoints: number
  rank: number
  preference: Exclude<ChampionPoolPreference, 'never'>
}

export type PlayerChampionPoolProfile = {
  riotId: string
  gameName: string
  tagLine: string
  platform: RiotPlatform
  region: RiotRegionGroup
  fetchedAt: string
  source: 'riot-mastery'
  entries: PlayerChampionPoolEntry[]
}

export type PlayerChampionPoolRequest = {
  riotId: string
  platform: RiotPlatform
  count?: number
}

export type PlayerChampionPoolErrorCode =
  | 'missing-key'
  | 'bad-request'
  | 'not-found'
  | 'rate-limited'
  | 'riot-unavailable'

export type PlayerChampionPoolResponse =
  | { ok: true; profile: PlayerChampionPoolProfile }
  | { ok: false; code: PlayerChampionPoolErrorCode; error: string; retryAfterSeconds?: number }

type RawMasteryRow = {
  championId?: unknown
  championLevel?: unknown
  championPoints?: unknown
}

const PLATFORM_TO_REGION: Record<RiotPlatform, RiotRegionGroup> = {
  na1: 'americas',
  br1: 'americas',
  la1: 'americas',
  la2: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  tr1: 'europe',
  ru: 'europe',
  kr: 'asia',
  jp1: 'asia',
  oc1: 'sea',
  ph2: 'sea',
  sg2: 'sea',
  th2: 'sea',
  tw2: 'sea',
  vn2: 'sea'
}

const PLAYER_POOL_PROFILE_MAX_AGE_MS = 6 * 60 * 60 * 1000

export function parseRiotId(value: string): ParsedRiotId | null {
  const trimmed = value.trim()
  const hash = trimmed.lastIndexOf('#')
  if (hash <= 0 || hash === trimmed.length - 1) {
    return null
  }
  const gameName = trimmed.slice(0, hash).trim()
  const tagLine = trimmed.slice(hash + 1).trim()
  if (!gameName || !tagLine) {
    return null
  }
  return { gameName, tagLine }
}

export function formatRiotId(parsed: ParsedRiotId): string {
  return `${parsed.gameName}#${parsed.tagLine}`
}

export function normalizeRiotPlatform(value: string): RiotPlatform | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'oce1') {
    return 'oc1'
  }
  return (RIOT_PLATFORMS as readonly string[]).includes(normalized) ? (normalized as RiotPlatform) : null
}

export function riotPlatformToRegion(platform: RiotPlatform): RiotRegionGroup {
  return PLATFORM_TO_REGION[platform]
}

export function masteryRankToPreference(rank: number): Exclude<ChampionPoolPreference, 'never'> {
  if (rank <= 5) {
    return 'main'
  }
  if (rank <= 15) {
    return 'comfortable'
  }
  return 'learning'
}

export function normalizeChampionMasteryRows(rows: unknown, maxEntries = 20): PlayerChampionPoolEntry[] {
  if (!Array.isArray(rows)) {
    return []
  }
  const out: PlayerChampionPoolEntry[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const row = raw as RawMasteryRow
    const championId = Number(row.championId)
    if (!Number.isFinite(championId) || championId <= 0) {
      continue
    }
    const championLevel = Math.max(0, Math.trunc(Number(row.championLevel) || 0))
    const championPoints = Math.max(0, Math.trunc(Number(row.championPoints) || 0))
    const rank = out.length + 1
    out.push({
      championId: Math.trunc(championId),
      championLevel,
      championPoints,
      rank,
      preference: masteryRankToPreference(rank)
    })
    if (out.length >= maxEntries) {
      break
    }
  }
  return out
}

export function buildPlayerChampionPoolProfile(args: {
  riotId: ParsedRiotId
  platform: RiotPlatform
  entries: PlayerChampionPoolEntry[]
  fetchedAt?: string
}): PlayerChampionPoolProfile {
  const region = riotPlatformToRegion(args.platform)
  return {
    riotId: formatRiotId(args.riotId),
    gameName: args.riotId.gameName,
    tagLine: args.riotId.tagLine,
    platform: args.platform,
    region,
    fetchedAt: args.fetchedAt ?? new Date().toISOString(),
    source: 'riot-mastery',
    entries: args.entries
  }
}

export function isFreshPlayerChampionPoolProfile(
  profile: PlayerChampionPoolProfile | null,
  nowMs = Date.now()
): boolean {
  if (!profile) {
    return false
  }
  const fetchedAt = Date.parse(profile.fetchedAt)
  return Number.isFinite(fetchedAt) && nowMs - fetchedAt >= 0 && nowMs - fetchedAt < PLAYER_POOL_PROFILE_MAX_AGE_MS
}

export function validatePlayerChampionPoolProfile(value: unknown): PlayerChampionPoolProfile | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const o = value as Record<string, unknown>
  const platform = normalizeRiotPlatform(String(o.platform ?? ''))
  if (!platform) {
    return null
  }
  const parsed = parseRiotId(String(o.riotId ?? ''))
  const fetchedAt = typeof o.fetchedAt === 'string' ? o.fetchedAt : ''
  if (!parsed || !Number.isFinite(Date.parse(fetchedAt))) {
    return null
  }
  const entries = normalizeChampionMasteryRows(o.entries, 20)
  return buildPlayerChampionPoolProfile({
    riotId: parsed,
    platform,
    entries,
    fetchedAt
  })
}

export function importedProfileToPreferences(
  profile: PlayerChampionPoolProfile | null
): Record<string, Exclude<ChampionPoolPreference, 'never'>> {
  if (!profile) {
    return {}
  }
  const out: Record<string, Exclude<ChampionPoolPreference, 'never'>> = {}
  for (const entry of profile.entries) {
    out[String(entry.championId)] = entry.preference
  }
  return out
}

export function mergeChampionPoolPreferences(
  imported: Record<string, Exclude<ChampionPoolPreference, 'never'>>,
  manual: Record<string, ChampionPoolPreference>
): Record<string, ChampionPoolPreference> {
  return { ...imported, ...manual }
}

export function championIdsForMyPool(prefs: Record<string, ChampionPoolPreference>): number[] {
  const out: number[] = []
  for (const [id, pref] of Object.entries(prefs)) {
    if (pref === 'never') {
      continue
    }
    const n = Number(id)
    if (Number.isFinite(n) && n > 0) {
      out.push(Math.trunc(n))
    }
  }
  return Array.from(new Set(out))
}
