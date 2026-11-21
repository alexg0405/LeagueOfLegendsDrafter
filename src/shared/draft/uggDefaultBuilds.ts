import { isRecommendableSummonersRiftItem, type ItemLite } from '../dataDragon'
import { buildSeedRow, currentBuildSeed, type BuildSeedRow } from './buildSeedStore'
import type { DraftItemRef, DraftRole } from './types'

type UggSeedRow = BuildSeedRow

export type UggDefaultItemBuild = {
  source: 'coachless' | 'ugg'
  sourceType?: UggSeedRow['sourceType']
  patch: string
  sourceUrl: string
  winRate?: number
  matches?: number
  wpaOverall?: number
  starting: DraftItemRef[]
  boots: DraftItemRef[]
  core: DraftItemRef[]
  final: DraftItemRef[]
  defaultItemIds: number[]
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

function refFor(item: ItemLite, bucket: 'starting' | 'boots' | 'core' | 'final', score: number): DraftItemRef {
  return {
    itemId: item.id,
    name: item.name,
    reason: 'Default build path',
    score,
    tags: item.tags,
    phase: phaseFor(item, bucket),
    cost: item.gold.total
  }
}

function refsFor(
  ids: readonly number[] | undefined,
  byId: ReadonlyMap<number, ItemLite>,
  bucket: 'starting' | 'boots' | 'core' | 'final'
): DraftItemRef[] {
  return (ids ?? [])
    .map((id, idx) => {
      const item = byId.get(id)
      return item ? refFor(item, bucket, 100 - idx) : null
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

function finiteStat(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function getUggDefaultItemBuild(
  championId: number,
  role: DraftRole,
  itemCatalog: readonly ItemLite[] | null | undefined
): UggDefaultItemBuild | null {
  if (role === 'unknown' || !itemCatalog?.length) {
    return null
  }
  const row = buildSeedRow(championId, role)
  if (!row) {
    return null
  }
  const byId = new Map(itemCatalog.filter(isRecommendableSummonersRiftItem).map((item) => [item.id, item] as const))
  const starting = refsFor(row.starting, byId, 'starting')
  const boots = refsFor(row.boots, byId, 'boots')
  const core = refsFor(row.core, byId, 'core')
  const final = refsFor(row.final, byId, 'final')
  const defaultItemIds = dedupeIds([...starting, ...boots, ...core, ...final])
  if (defaultItemIds.length === 0) {
    return null
  }
  const winRate = finiteStat(row.winRate)
  const matches = finiteStat(row.matches)
  const wpaOverall = finiteStat(row.wpaOverall)
  return {
    source: row.sourceType === 'coachless' ? 'coachless' : 'ugg',
    ...(row.sourceType != null ? { sourceType: row.sourceType } : {}),
    patch: currentBuildSeed().patch,
    sourceUrl: row.sourceUrl,
    ...(winRate != null ? { winRate } : {}),
    ...(matches != null ? { matches } : {}),
    ...(wpaOverall != null ? { wpaOverall } : {}),
    starting,
    boots,
    core,
    final,
    defaultItemIds
  }
}

export function uggDefaultBuildSeedPatch(): string {
  return currentBuildSeed().patch
}
