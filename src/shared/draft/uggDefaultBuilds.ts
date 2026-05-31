import seed from '../data/uggDefaultItemBuildsSeed.json'
import type { ItemLite } from '../dataDragon'
import type { DraftItemRef, DraftRole } from './types'

type UggSeedRole = Exclude<DraftRole, 'unknown'>

type UggSeedRow = {
  championId: number
  role: UggSeedRole
  sourceUrl: string
  starting?: number[]
  boots?: number[]
  core?: number[]
  final?: number[]
  winRate?: number
  matches?: number
}

export type UggDefaultItemBuild = {
  source: 'ugg'
  patch: string
  sourceUrl: string
  starting: DraftItemRef[]
  boots: DraftItemRef[]
  core: DraftItemRef[]
  final: DraftItemRef[]
  defaultItemIds: number[]
}

function roleKey(role: DraftRole): UggSeedRole | null {
  return role === 'unknown' ? null : role
}

function phaseFor(item: ItemLite, bucket: 'starting' | 'boots' | 'core' | 'final'): DraftItemRef['phase'] {
  if (bucket === 'boots' || item.tags.some((tag) => tag.toLowerCase() === 'boots')) {
    return 'boots'
  }
  if (bucket === 'starting') {
    return 'starter'
  }
  return item.into?.length ? 'component' : 'completed'
}

function refFor(item: ItemLite, bucket: 'starting' | 'boots' | 'core' | 'final', score: number, sourceUrl: string): DraftItemRef {
  return {
    itemId: item.id,
    name: item.name,
    reason: `U.GG default build path (${sourceUrl})`,
    score,
    tags: item.tags,
    phase: phaseFor(item, bucket),
    cost: item.gold.total
  }
}

function refsFor(
  ids: readonly number[] | undefined,
  byId: ReadonlyMap<number, ItemLite>,
  bucket: 'starting' | 'boots' | 'core' | 'final',
  sourceUrl: string
): DraftItemRef[] {
  return (ids ?? [])
    .map((id, idx) => {
      const item = byId.get(id)
      return item ? refFor(item, bucket, 100 - idx, sourceUrl) : null
    })
    .filter((row): row is DraftItemRef => row != null)
}

function dedupeIds(rows: readonly DraftItemRef[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const row of rows) {
    if (!seen.has(row.itemId)) {
      seen.add(row.itemId)
      out.push(row.itemId)
    }
  }
  return out
}

const seedRows = (seed.builds as UggSeedRow[]).filter((row) => Number.isFinite(row.championId))

export function getUggDefaultItemBuild(
  championId: number,
  role: DraftRole,
  itemCatalog: readonly ItemLite[] | null | undefined
): UggDefaultItemBuild | null {
  const key = roleKey(role)
  if (!key || !itemCatalog?.length) {
    return null
  }
  const row = seedRows.find((entry) => entry.championId === championId && entry.role === key)
  if (!row) {
    return null
  }
  const byId = new Map(itemCatalog.map((item) => [item.id, item] as const))
  const starting = refsFor(row.starting, byId, 'starting', row.sourceUrl)
  const boots = refsFor(row.boots, byId, 'boots', row.sourceUrl)
  const core = refsFor(row.core, byId, 'core', row.sourceUrl)
  const final = refsFor(row.final, byId, 'final', row.sourceUrl)
  const defaultItemIds = dedupeIds([...starting, ...boots, ...core, ...final])
  if (defaultItemIds.length === 0) {
    return null
  }
  return {
    source: 'ugg',
    patch: typeof seed.patch === 'string' ? seed.patch : 'unknown',
    sourceUrl: row.sourceUrl,
    starting,
    boots,
    core,
    final,
    defaultItemIds
  }
}

export function uggDefaultBuildSeedPatch(): string {
  return typeof seed.patch === 'string' ? seed.patch : 'unknown'
}
