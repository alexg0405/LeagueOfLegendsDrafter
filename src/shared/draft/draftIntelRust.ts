import uggSeed from '../data/uggDefaultItemBuildsSeed.json'
import { isRecommendableSummonersRiftItem } from '../dataDragon'
import { BUNDLED_CHAMPION_NAMES } from './championNameFallback'
import { championThreatOverrideRows } from './championThreatOverrides'
import type { BuildDraftIntelArgs } from './draftIntel'
import { publicMetaBaseStatsForRole, type PublicMetaBaseStat, type RoleKey } from './metaStats'
import type { DraftIntel } from './types'

const ROLE_KEYS: RoleKey[] = ['top', 'jungle', 'middle', 'bottom', 'support']

export type RustDraftIntelInput = {
  snapshot: BuildDraftIntelArgs['snapshot']
  myRole: BuildDraftIntelArgs['myRole']
  suggestions: BuildDraftIntelArgs['suggestions']
  idToName: { id: number; name: string }[]
  championMetaById: { id: number; meta: NonNullable<BuildDraftIntelArgs['championMetaById']> extends ReadonlyMap<number, infer T> ? T : never }[]
  enemyRoleInference: NonNullable<BuildDraftIntelArgs['enemyRoleInference']>
  itemCatalog: NonNullable<BuildDraftIntelArgs['itemCatalog']>
  uggSeed: typeof uggSeed
  championThreatOverrides: ReturnType<typeof championThreatOverrideRows>
  publicBaseStats: PublicMetaBaseStat[]
  patchLabel?: string | null
  dataDragonVersion?: string | null
  includeItemPlans?: boolean
}

function mergedNameRows(idToName: ReadonlyMap<number, string> | null): { id: number; name: string }[] {
  const rows = new Map<number, string>()
  for (const [rawId, name] of Object.entries(BUNDLED_CHAMPION_NAMES)) {
    const id = Number(rawId)
    if (Number.isFinite(id) && name) {
      rows.set(id, name)
    }
  }
  for (const [id, name] of Array.from(idToName?.entries() ?? [])) {
    if (Number.isFinite(id) && name) {
      rows.set(Math.trunc(id), name)
    }
  }
  return Array.from(rows.entries()).map(([id, name]) => ({ id, name }))
}

function publicBaseStatRows(): PublicMetaBaseStat[] {
  return ROLE_KEYS.flatMap((role) => publicMetaBaseStatsForRole(role))
}

export function serializeDraftIntelInput(args: BuildDraftIntelArgs): RustDraftIntelInput {
  return {
    snapshot: args.snapshot,
    myRole: args.myRole,
    suggestions: args.suggestions,
    idToName: mergedNameRows(args.idToName),
    championMetaById: Array.from(args.championMetaById?.entries() ?? []).map(([id, meta]) => ({ id, meta })),
    enemyRoleInference: args.enemyRoleInference ?? [],
    itemCatalog: (args.itemCatalog ?? []).filter(isRecommendableSummonersRiftItem),
    uggSeed,
    championThreatOverrides: championThreatOverrideRows(),
    publicBaseStats: publicBaseStatRows(),
    patchLabel: args.patchLabel,
    dataDragonVersion: args.dataDragonVersion,
    includeItemPlans: args.includeItemPlans ?? true
  }
}

export function hydrateRustDraftIntel(parsed: unknown): DraftIntel | null {
  if (parsed == null) {
    return null
  }
  if (typeof parsed === 'object' && 'error' in parsed) {
    return null
  }
  return parsed as DraftIntel
}
