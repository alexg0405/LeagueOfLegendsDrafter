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

const baseByRole = emptyRoleMap<PublicMetaBaseStat>()
for (const raw of publicMetaStatsSeed.roleBase as RawBaseRow[]) {
  const row = parseBaseRow(raw)
  if (row) {
    baseByRole[row.role].set(row.championId, row)
  }
}

const countersByRole: Record<RoleKey, Map<number, Map<number, PublicMetaCounterStat>>> = Object.fromEntries(
  ROLE_KEYS.map((r) => [r, new Map<number, Map<number, PublicMetaCounterStat>>()])
) as Record<RoleKey, Map<number, Map<number, PublicMetaCounterStat>>>

for (const raw of publicMetaStatsSeed.counters as RawCounterRow[]) {
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

const candidateIdsByRole: Record<RoleKey, Set<number>> = Object.fromEntries(
  ROLE_KEYS.map((r) => [r, new Set<number>()])
) as Record<RoleKey, Set<number>>

for (const role of ROLE_KEYS) {
  for (const row of Array.from(baseByRole[role].values())) {
    if (row.candidate) {
      candidateIdsByRole[role].add(row.championId)
    }
  }
  for (const id of Array.from(countersByRole[role].keys())) {
    candidateIdsByRole[role].add(id)
  }
}

export function publicMetaBaseStat(role: DraftRole, championId: number): PublicMetaBaseStat | null {
  const r = normalizeRole(role)
  if (!r) {
    return null
  }
  return baseByRole[r].get(championId) ?? null
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
  return countersByRole[r].get(candidateId)?.get(enemyId) ?? null
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
  return Array.from(candidateIdsByRole[r])
}
