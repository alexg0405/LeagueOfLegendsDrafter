import bundledSeed from '../data/uggDefaultItemBuildsSeed.json'
import type { DraftRole } from './types'

/**
 * Single owner of the champion build-path seed (`npm run items:update:ugg`).
 *
 * Starts from the slim engine seed (legacy item fields only, bundled with the draft engine and
 * its workers). `ensureBuildPathDetails()` code-splits in the full paths (buy order, 4th-6th
 * options, skills, runes) when a Build view opens. Either can be replaced at runtime with the
 * copy the website publishes daily (`/data/buildPathsSeed.json`), so an installed desktop app
 * keeps current builds without waiting for a new release.
 */

export type BuildSeedRole = Exclude<DraftRole, 'unknown'>
/** [itemId, winRate %, games] */
export type BuildSeedOption = [number, number, number]

export type BuildSeedRow = {
  championId: number
  role: BuildSeedRole
  sourceType?: 'coachless' | 'ugg' | 'ugg-fallback' | 'trusted' | 'generated' | 'pinned'
  sourceUrl: string
  winRate?: number
  matches?: number
  wpaOverall?: number
  /** Stats patch the row was read from, e.g. "16.23". */
  patch?: string
  /** emerald_plus | platinum_plus | overall */
  rank?: string
  /** Share of this champion's games played in this role (0-100). */
  rolePct?: number
  starting?: number[]
  boots?: number[]
  core?: number[]
  final?: number[]
  /** Full first purchase, potions included (duplicates allowed). */
  startSet?: number[]
  /** First three completed purchases in buy order (boots included when bought early). */
  order?: number[]
  coreWinRate?: number
  coreMatches?: number
  items4?: BuildSeedOption[]
  items5?: BuildSeedOption[]
  items6?: BuildSeedOption[]
  /** Level 1-18 skill sequence, e.g. "QWEQQRQWQWRWWEEREE". */
  skills?: string
  /** Max order, e.g. "QWE". */
  skillPriority?: string
  spells?: number[]
  runes?: { primary: number; sub: number; perks: number[]; shards?: number[] }
}

export type BuildSeed = {
  schema?: string
  patch: string
  statsPatch?: string
  rank?: string
  updatedAt?: string
  source?: string
  sourceCounts?: Record<string, number>
  /** [championId, DDragon key, display name] */
  champions?: [number, string, string][]
  /** runeId -> [name, icon path] */
  runes?: Record<string, [string, string]>
  /** spellId -> [name, DDragon key] */
  spells?: Record<string, [string, string]>
  builds: BuildSeedRow[]
}

export type BuildSeedInfo = {
  patch: string
  statsPatch: string
  updatedAt: string | null
  rows: number
  source: string
  /** Full paths loaded (buy order, options, skills, runes), not just the engine fields. */
  hasDetails: boolean
}

export type BuildSeedApplyResult = {
  ok: boolean
  applied: boolean
  reason?: string
  info: BuildSeedInfo
}

const ROLES: readonly BuildSeedRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const MIN_LIVE_ROWS = 400
const MAX_ROWS = 4000

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function intList(raw: unknown, max: number): number[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const out = raw
    .slice(0, max)
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0 && id < 1_000_000)
  return out
}

function finite(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
}

function optionList(raw: unknown): BuildSeedOption[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const out: BuildSeedOption[] = []
  for (const row of raw.slice(0, 6)) {
    if (!Array.isArray(row)) {
      continue
    }
    const id = Number(row[0])
    const wr = Number(row[1])
    const n = Number(row[2])
    if (Number.isInteger(id) && id > 0 && Number.isFinite(wr) && Number.isFinite(n) && n >= 0) {
      out.push([id, wr, n])
    }
  }
  return out
}

function shortString(raw: unknown, max: number): string | undefined {
  return typeof raw === 'string' && raw.length > 0 ? raw.slice(0, max) : undefined
}

/** Defensive parse: a malformed live payload must never poison the draft engine. */
export function normalizeBuildSeedRow(raw: unknown): BuildSeedRow | null {
  if (!isRecord(raw)) {
    return null
  }
  const championId = Number(raw.championId)
  const role = raw.role as BuildSeedRole
  if (!Number.isInteger(championId) || championId <= 0 || !ROLES.includes(role)) {
    return null
  }
  const runesRaw = isRecord(raw.runes) ? raw.runes : null
  const row: BuildSeedRow = {
    championId,
    role,
    sourceUrl: typeof raw.sourceUrl === 'string' ? raw.sourceUrl.slice(0, 200) : '',
    sourceType: typeof raw.sourceType === 'string' ? (raw.sourceType as BuildSeedRow['sourceType']) : undefined,
    winRate: finite(raw.winRate),
    matches: finite(raw.matches),
    wpaOverall: finite(raw.wpaOverall),
    patch: shortString(raw.patch, 12),
    rank: shortString(raw.rank, 24),
    rolePct: finite(raw.rolePct),
    starting: intList(raw.starting, 4),
    boots: intList(raw.boots, 3),
    core: intList(raw.core, 6),
    final: intList(raw.final, 6),
    startSet: intList(raw.startSet, 6),
    order: intList(raw.order, 6),
    coreWinRate: finite(raw.coreWinRate),
    coreMatches: finite(raw.coreMatches),
    items4: optionList(raw.items4),
    items5: optionList(raw.items5),
    items6: optionList(raw.items6),
    skills: typeof raw.skills === 'string' && /^[QWER]{1,18}$/.test(raw.skills) ? raw.skills : undefined,
    skillPriority: typeof raw.skillPriority === 'string' && /^[QWE]{3}$/.test(raw.skillPriority) ? raw.skillPriority : undefined,
    spells: intList(raw.spells, 2),
    runes:
      runesRaw && Number.isInteger(Number(runesRaw.primary)) && Number.isInteger(Number(runesRaw.sub))
        ? {
            primary: Number(runesRaw.primary),
            sub: Number(runesRaw.sub),
            perks: intList(runesRaw.perks, 6) ?? [],
            shards: intList(runesRaw.shards, 3)
          }
        : undefined
  }
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as BuildSeedRow
}

function normalizeIndex(raw: unknown): Record<string, [string, string]> | undefined {
  if (!isRecord(raw)) {
    return undefined
  }
  const out: Record<string, [string, string]> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (/^\d+$/.test(key) && Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') {
      out[key] = [value[0].slice(0, 80), value[1].slice(0, 200)]
    }
  }
  return out
}

function normalizeChampions(raw: unknown): [number, string, string][] | undefined {
  if (!Array.isArray(raw)) {
    return undefined
  }
  const out: [number, string, string][] = []
  for (const row of raw.slice(0, 600)) {
    if (Array.isArray(row) && Number.isInteger(Number(row[0])) && typeof row[1] === 'string' && typeof row[2] === 'string') {
      out.push([Number(row[0]), row[1].slice(0, 40), row[2].slice(0, 40)])
    }
  }
  return out
}

export function normalizeBuildSeed(raw: unknown): BuildSeed | null {
  if (!isRecord(raw) || !Array.isArray(raw.builds)) {
    return null
  }
  const builds = raw.builds
    .slice(0, MAX_ROWS)
    .map(normalizeBuildSeedRow)
    .filter((row): row is BuildSeedRow => row != null)
  const patch = typeof raw.patch === 'string' ? raw.patch.slice(0, 16) : 'unknown'
  return {
    schema: shortString(raw.schema, 40),
    patch,
    statsPatch: shortString(raw.statsPatch, 12) ?? patch.split('.').slice(0, 2).join('.'),
    rank: shortString(raw.rank, 24),
    updatedAt: shortString(raw.updatedAt, 32),
    source: shortString(raw.source, 400),
    sourceCounts: isRecord(raw.sourceCounts)
      ? Object.fromEntries(Object.entries(raw.sourceCounts).filter(([, v]) => typeof v === 'number')) as Record<string, number>
      : undefined,
    champions: normalizeChampions(raw.champions),
    runes: normalizeIndex(raw.runes),
    spells: normalizeIndex(raw.spells),
    builds
  }
}

let current: BuildSeed = normalizeBuildSeed(bundledSeed) ?? { patch: 'unknown', builds: [] }
let currentSource = 'bundled'
let revision = 0
let rowIndex: Map<string, BuildSeedRow> | null = null
let championRowIndex: Map<number, BuildSeedRow[]> | null = null
let rustSeedCache: { revision: number; seed: RustBuildSeed } | null = null
const listeners = new Set<() => void>()

function indexRows(): void {
  rowIndex = new Map()
  championRowIndex = new Map()
  for (const row of current.builds) {
    rowIndex.set(`${row.championId}:${row.role}`, row)
    const list = championRowIndex.get(row.championId) ?? []
    list.push(row)
    championRowIndex.set(row.championId, list)
  }
}

export function currentBuildSeed(): BuildSeed {
  return current
}

/** Bumps every time a new seed is applied; use as a memo key. */
export function buildSeedRevision(): number {
  return revision
}

export function buildSeedRow(championId: number, role: DraftRole): BuildSeedRow | null {
  if (role === 'unknown') {
    return null
  }
  if (!rowIndex) {
    indexRows()
  }
  return rowIndex!.get(`${championId}:${role}`) ?? null
}

export function buildSeedRowsForChampion(championId: number): BuildSeedRow[] {
  if (!championRowIndex) {
    indexRows()
  }
  return championRowIndex!.get(championId) ?? []
}

function seedHasDetails(seed: BuildSeed): boolean {
  return seed.builds.some((row) => (row.order?.length ?? 0) > 0 || (row.items4?.length ?? 0) > 0)
}

let currentHasDetails = seedHasDetails(current)

export function buildSeedInfo(): BuildSeedInfo {
  return {
    patch: current.patch,
    statsPatch: current.statsPatch ?? current.patch,
    updatedAt: current.updatedAt ?? null,
    rows: current.builds.length,
    source: currentSource,
    hasDetails: currentHasDetails
  }
}

let detailsLoad: Promise<void> | null = null

/** Load the full bundled build paths once; resolves immediately when already present. */
export function ensureBuildPathDetails(): Promise<void> {
  if (currentHasDetails) {
    return Promise.resolve()
  }
  detailsLoad ??= import('../data/buildPathsSeed.json')
    .then((mod) => {
      applyBuildSeed((mod as { default?: unknown }).default ?? mod, 'bundled')
    })
    .catch(() => {
      detailsLoad = null
    })
  return detailsLoad
}

export function subscribeBuildSeed(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function comparePatch(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10))
  const pb = b.split('.').map((part) => Number.parseInt(part, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = Number.isFinite(pa[i]) ? pa[i]! : 0
    const db = Number.isFinite(pb[i]) ? pb[i]! : 0
    if (da !== db) {
      return da - db
    }
  }
  return 0
}

/**
 * Swap in a newer seed (e.g. the website's daily copy). Older patches and thin payloads are
 * ignored so a stale CDN response can never roll the bundled data back.
 */
export function applyBuildSeed(raw: unknown, source = 'live'): BuildSeedApplyResult {
  const next = normalizeBuildSeed(raw)
  if (!next || next.builds.length < MIN_LIVE_ROWS) {
    return { ok: false, applied: false, reason: 'Build data payload was empty or malformed.', info: buildSeedInfo() }
  }
  const nextPatch = next.statsPatch ?? next.patch
  const currentPatch = current.statsPatch ?? current.patch
  const cmp = comparePatch(nextPatch, currentPatch)
  const nextHasDetails = seedHasDetails(next)
  if (cmp < 0) {
    return { ok: true, applied: false, reason: `Build data ${nextPatch} is older than ${currentPatch}.`, info: buildSeedInfo() }
  }
  const sameVersion = cmp === 0 && (next.updatedAt ?? '') <= (current.updatedAt ?? '')
  // Same data, but the full paths for a slim engine seed: still worth taking.
  if (sameVersion && (currentHasDetails || !nextHasDetails)) {
    return { ok: true, applied: false, info: buildSeedInfo() }
  }
  if (currentHasDetails && !nextHasDetails && cmp === 0) {
    return { ok: true, applied: false, info: buildSeedInfo() }
  }
  current = next
  currentHasDetails = nextHasDetails
  currentSource = source
  revision += 1
  rowIndex = null
  championRowIndex = null
  rustSeedCache = null
  Array.from(listeners).forEach((listener) => {
    try {
      listener()
    } catch {
      /* a broken subscriber must not block the others */
    }
  })
  return { ok: true, applied: true, info: buildSeedInfo() }
}

/**
 * Whether a published seed (from the website manifest's `buildsPatch` / `buildsUpdatedAt`) is
 * newer than `held`, so a refresh can skip downloading ~600 KB of identical data.
 */
export function isNewerBuildSeed(
  published: { patch?: unknown; updatedAt?: unknown },
  held: { statsPatch: string; updatedAt: string | null }
): boolean {
  const patch = typeof published.patch === 'string' ? published.patch : null
  const updatedAt = typeof published.updatedAt === 'string' ? published.updatedAt : null
  if (!patch) {
    return true
  }
  const cmp = comparePatch(patch, held.statsPatch)
  return cmp > 0 || (cmp === 0 && (updatedAt ?? '') > (held.updatedAt ?? ''))
}

/** Shape the Rust core deserializes (`UggSeed`): legacy fields only, so the JSON hop stays small. */
export type RustBuildSeed = {
  patch: string
  source: string
  builds: {
    championId: number
    role: BuildSeedRole
    sourceUrl: string
    starting: number[]
    boots: number[]
    core: number[]
    final: number[]
    winRate?: number
    matches?: number
  }[]
}

export function rustBuildSeed(): RustBuildSeed {
  if (rustSeedCache?.revision === revision) {
    return rustSeedCache.seed
  }
  const seed: RustBuildSeed = {
    patch: current.patch,
    source: current.source ?? 'U.GG public builds',
    builds: current.builds.map((row) => ({
      championId: row.championId,
      role: row.role,
      sourceUrl: row.sourceUrl,
      starting: row.starting ?? [],
      boots: row.boots ?? [],
      core: row.core ?? [],
      final: row.final ?? [],
      ...(row.winRate != null ? { winRate: row.winRate } : {}),
      ...(row.matches != null ? { matches: Math.min(2_000_000_000, Math.round(row.matches)) } : {})
    }))
  }
  rustSeedCache = { revision, seed }
  return seed
}

/** Test hook: restore the bundled seed. */
export function resetBuildSeedForTests(): void {
  current = normalizeBuildSeed(bundledSeed) ?? { patch: 'unknown', builds: [] }
  currentHasDetails = seedHasDetails(current)
  detailsLoad = null
  currentSource = 'bundled'
  revision += 1
  rowIndex = null
  championRowIndex = null
  rustSeedCache = null
}
