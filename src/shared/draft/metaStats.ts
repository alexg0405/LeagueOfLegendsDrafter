import publicMetaStatsSeed from '../data/publicMetaStatsSeed.json'
import type { DraftRole } from './types'

export type RoleKey = Exclude<DraftRole, 'unknown'>

export type PublicMetaBaseStat = {
  role: RoleKey
  championId: number
  winRate: number
  pickRate: number | null
  banRate: number | null
  games: number
  sourceAvgWinRate: number
  source: string
  candidate: boolean
}

export type PublicMetaCounterStat = {
  role: RoleKey
  candidateId: number
  enemyId: number
  winRate: number
  games: number
  source: string
}

type RawBaseRow = {
  role?: unknown
  championId?: unknown
  winRate?: unknown
  pickRate?: unknown
  banRate?: unknown
  games?: unknown
  sourceAvgWinRate?: unknown
  source?: unknown
  candidate?: unknown
}

type RawCounterRow = {
  role?: unknown
  candidateId?: unknown
  enemyId?: unknown
  winRate?: unknown
  games?: unknown
  source?: unknown
}

type PublicMetaStatsSeed = {
  schema?: unknown
  patch?: unknown
  rankFilter?: unknown
  updatedAt?: unknown
  roleBase?: unknown
  counters?: unknown
}

export type PublicMetaStatsInfo = {
  patch: string
  rankFilter: string | null
  updatedAt: string | null
  source: string
  roleBaseCount: number
  counterCount: number
}

const ROLE_KEYS = ['top', 'jungle', 'middle', 'bottom', 'support'] as const
const roleSet = new Set<string>(ROLE_KEYS)

export const PUBLIC_META_STATS_LABEL = `public-meta-${publicMetaStatsSeed.patch}`

function emptyRoleMap<T>(): Record<RoleKey, Map<number, T>> {
  return Object.fromEntries(ROLE_KEYS.map((r) => [r, new Map<number, T>()])) as Record<RoleKey, Map<number, T>>
}

function normalizeRole(raw: unknown): RoleKey | null {
  if (typeof raw !== 'string') {
    return null
  }
  const v = raw.trim().toLowerCase()
  if (v === 'mid') {
    return 'middle'
  }
  if (v === 'adc' || v === 'bot') {
    return 'bottom'
  }
  if (v === 'sup' || v === 'utility') {
    return 'support'
  }
  return roleSet.has(v) ? (v as RoleKey) : null
}

function finiteNumber(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null
  }
  return raw
}

function rate(raw: unknown): number | null {
  const n = finiteNumber(raw)
  if (n == null || n <= 0 || n >= 1) {
    return null
  }
  return n
}

function positiveInt(raw: unknown): number | null {
  const n = finiteNumber(raw)
  if (n == null || n <= 0) {
    return null
  }
  return Math.trunc(n)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function confidence(games: number, prior: number): number {
  return Math.sqrt(games / (games + prior))
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function stringField(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function comparePatchLabels(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseFloat(x))
  const pb = b.split('.').map((x) => parseFloat(x))
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const ai = pa[i]
    const bi = pb[i]
    const av = ai != null && Number.isFinite(ai) ? ai : Number.POSITIVE_INFINITY
    const bv = bi != null && Number.isFinite(bi) ? bi : Number.POSITIVE_INFINITY
    if (av !== bv) {
      return av - bv
    }
  }
  return String(a).localeCompare(String(b))
}

export function comparePublicMetaPatchLabels(a: string, b: string): number {
  return comparePatchLabels(a, b)
}

function parseBaseRow(raw: RawBaseRow): PublicMetaBaseStat | null {
  const role = normalizeRole(raw.role)
  const championId = positiveInt(raw.championId)
  const winRate = rate(raw.winRate)
  if (!role || championId == null || winRate == null) {
    return null
  }
  return {
    role,
    championId,
    winRate,
    pickRate: rate(raw.pickRate),
    banRate: rate(raw.banRate),
    games: positiveInt(raw.games) ?? 1000,
    sourceAvgWinRate: rate(raw.sourceAvgWinRate) ?? 0.5,
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : 'public-meta-seed',
    candidate: raw.candidate !== false
  }
}

function parseCounterRow(raw: RawCounterRow): PublicMetaCounterStat | null {
  const role = normalizeRole(raw.role)
  const candidateId = positiveInt(raw.candidateId)
  const enemyId = positiveInt(raw.enemyId)
  const winRate = rate(raw.winRate)
  if (!role || candidateId == null || enemyId == null || winRate == null) {
    return null
  }
  return {
    role,
    candidateId,
    enemyId,
    winRate,
    games: positiveInt(raw.games) ?? 1000,
    source: typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : 'public-meta-seed'
  }
}

type MetaTables = {
  info: PublicMetaStatsInfo
  baseByRole: Record<RoleKey, Map<number, PublicMetaBaseStat>>
  baseByChampion: Map<number, PublicMetaBaseStat[]>
  countersByRole: Record<RoleKey, Map<number, Map<number, PublicMetaCounterStat>>>
  candidateIdsByRole: Record<RoleKey, Set<number>>
}

function emptyCounterMap(): Record<RoleKey, Map<number, Map<number, PublicMetaCounterStat>>> {
  return Object.fromEntries(ROLE_KEYS.map((r) => [r, new Map<number, Map<number, PublicMetaCounterStat>>()])) as Record<
    RoleKey,
    Map<number, Map<number, PublicMetaCounterStat>>
  >
}

function emptyCandidateMap(): Record<RoleKey, Set<number>> {
  return Object.fromEntries(ROLE_KEYS.map((r) => [r, new Set<number>()])) as Record<RoleKey, Set<number>>
}

function buildTables(seed: PublicMetaStatsSeed, source: string): MetaTables | null {
  if (!isRecord(seed)) {
    return null
  }
  const roleBaseRaw = Array.isArray(seed.roleBase) ? seed.roleBase : null
  const countersRaw = Array.isArray(seed.counters) ? seed.counters : null
  const patch = stringField(seed.patch)
  if (!roleBaseRaw || !countersRaw || !patch) {
    return null
  }

  const baseByRole = emptyRoleMap<PublicMetaBaseStat>()
  const baseByChampion = new Map<number, PublicMetaBaseStat[]>()
  for (const raw of roleBaseRaw as RawBaseRow[]) {
    const row = parseBaseRow(raw)
    if (row) {
      baseByRole[row.role].set(row.championId, row)
      const rows = baseByChampion.get(row.championId) ?? []
      rows.push(row)
      baseByChampion.set(row.championId, rows)
    }
  }

  const countersByRole = emptyCounterMap()
  for (const raw of countersRaw as RawCounterRow[]) {
    const row = parseCounterRow(raw)
    if (!row) {
      continue
    }
    let byEnemy = countersByRole[row.role].get(row.candidateId)
    if (!byEnemy) {
      byEnemy = new Map<number, PublicMetaCounterStat>()
      countersByRole[row.role].set(row.candidateId, byEnemy)
    }
    byEnemy.set(row.enemyId, row)
  }

  const candidateIdsByRole = emptyCandidateMap()
  for (const role of ROLE_KEYS) {
    for (const row of Array.from(baseByRole[role].values())) {
      if (row.candidate) {
        candidateIdsByRole[role].add(row.championId)
      }
    }
    for (const id of Array.from(countersByRole[role].keys())) {
      if (baseByRole[role].get(id)?.candidate !== false) {
        candidateIdsByRole[role].add(id)
      }
    }
  }

  const roleBaseCount = ROLE_KEYS.reduce((total, role) => total + baseByRole[role].size, 0)
  const counterCount = ROLE_KEYS.reduce(
    (total, role) => total + Array.from(countersByRole[role].values()).reduce((inner, row) => inner + row.size, 0),
    0
  )
  if (roleBaseCount === 0) {
    return null
  }

  return {
    info: {
      patch,
      rankFilter: stringField(seed.rankFilter),
      updatedAt: stringField(seed.updatedAt),
      source,
      roleBaseCount,
      counterCount
    },
    baseByRole,
    baseByChampion,
    countersByRole,
    candidateIdsByRole
  }
}

let tables = buildTables(publicMetaStatsSeed as PublicMetaStatsSeed, 'bundled')!

export function getPublicMetaStatsInfo(): PublicMetaStatsInfo {
  return { ...tables.info }
}

export function getPublicMetaStatsPatch(): string {
  return tables.info.patch
}

export function getPublicMetaStatsLabel(): string {
  return `public-meta-${tables.info.patch}${tables.info.source === 'bundled' ? '' : '-live'}`
}

export function applyPublicMetaStatsSeed(raw: unknown, source = 'live'): PublicMetaStatsInfo | null {
  const next = buildTables(raw as PublicMetaStatsSeed, source)
  if (!next) {
    return null
  }
  tables = next
  return getPublicMetaStatsInfo()
}

export function publicMetaBaseStat(role: DraftRole, championId: number): PublicMetaBaseStat | null {
  const r = normalizeRole(role)
  if (!r) {
    return null
  }
  return tables.baseByRole[r].get(championId) ?? null
}

export function publicMetaBaseStatsForChampion(championId: number): PublicMetaBaseStat[] {
  return [...(tables.baseByChampion.get(championId) ?? [])]
}

export function publicMetaBaseStatsForRole(role: DraftRole): PublicMetaBaseStat[] {
  const r = normalizeRole(role)
  if (!r) {
    return []
  }
  return Array.from(tables.baseByRole[r].values())
}

export function publicMetaRoleDistributionForChampion(championId: number): Record<RoleKey, number> {
  const dist = Object.fromEntries(ROLE_KEYS.map((r) => [r, 0])) as Record<RoleKey, number>
  const rows = tables.baseByChampion.get(championId) ?? []
  if (rows.length === 0) {
    return dist
  }
  const totalGames = rows.reduce((acc, row) => acc + Math.max(0, row.games), 0)
  if (totalGames <= 0) {
    const uniform = 1 / rows.length
    for (const row of rows) {
      dist[row.role] = uniform
    }
    return dist
  }
  for (const row of rows) {
    dist[row.role] = Math.max(0, row.games) / totalGames
  }
  return dist
}

export function publicMetaBaseRate(role: DraftRole, championId: number): number | null {
  const row = publicMetaBaseStat(role, championId)
  if (!row) {
    return null
  }
  const normalized = clamp(0.5 + (row.winRate - row.sourceAvgWinRate), 0.35, 0.65)
  const c = confidence(row.games, 12000)
  return clamp(0.5 + (normalized - 0.5) * c, 0.38, 0.62)
}

export function publicMetaCounterStat(
  role: DraftRole,
  candidateId: number,
  enemyId: number
): PublicMetaCounterStat | null {
  const r = normalizeRole(role)
  if (!r) {
    return null
  }
  return tables.countersByRole[r].get(candidateId)?.get(enemyId) ?? null
}

export function publicMetaLaneRate(role: DraftRole, candidateId: number, enemyId: number): number | null {
  const row = publicMetaCounterStat(role, candidateId, enemyId)
  if (!row) {
    return null
  }
  const c = confidence(row.games, 3500)
  return clamp(0.5 + (row.winRate - 0.5) * c, 0.32, 0.68)
}

export function publicMetaCandidateIdsForRole(role: DraftRole): number[] {
  const r = normalizeRole(role)
  if (!r) {
    return []
  }
  return Array.from(tables.candidateIdsByRole[r])
}
