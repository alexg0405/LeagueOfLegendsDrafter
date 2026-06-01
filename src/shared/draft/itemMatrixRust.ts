import uggSeed from '../data/uggDefaultItemBuildsSeed.json'
import { championThreatOverrideRows } from './championThreatOverrides'
import type { BuildDraftIntelArgs } from './draftIntel'
import type { DraftItemMatrixRow, DraftMatchupPlan } from './types'

export type ItemMatrixSerializeOptions = {
  focusChampionId?: number | null
  limit?: number
}

export type RustItemMatrixInput = {
  snapshot: BuildDraftIntelArgs['snapshot']
  myRole: BuildDraftIntelArgs['myRole']
  suggestions: BuildDraftIntelArgs['suggestions']
  idToName: { id: number; name: string }[]
  championMetaById: { id: number; meta: NonNullable<BuildDraftIntelArgs['championMetaById']> extends ReadonlyMap<number, infer T> ? T : never }[]
  enemyRoleInference: NonNullable<BuildDraftIntelArgs['enemyRoleInference']>
  itemCatalog: NonNullable<BuildDraftIntelArgs['itemCatalog']>
  uggSeed: typeof uggSeed
  championThreatOverrides: ReturnType<typeof championThreatOverrideRows>
  focusChampionId?: number | null
  limit?: number
}

export type ComparableMatrixPlan = {
  championId: number
  championName: string
  defaultBuildSource: string | null
  defaultItemIds: number[]
  buildIds: number[]
  matrixRows: {
    itemId: number
    role: 'default' | 'situational'
    targetIds: number[]
    tags: string[]
  }[]
}

function focusedChampionMeta(
  args: BuildDraftIntelArgs,
  options?: ItemMatrixSerializeOptions
): RustItemMatrixInput['championMetaById'] {
  const meta = args.championMetaById
  if (!meta) {
    return []
  }
  const relevantIds = new Set<number>()
  for (const slot of [...(args.snapshot?.ally ?? []), ...(args.snapshot?.enemy ?? [])]) {
    if (slot.championId != null && slot.championId > 0) {
      relevantIds.add(slot.championId)
    }
  }
  const suggestionLimit = Math.max(1, Math.min(40, Math.trunc(options?.limit ?? 40)))
  const suggestionRows = options?.focusChampionId
    ? args.suggestions.filter((row) => row.championId === options.focusChampionId)
    : args.suggestions.slice(0, suggestionLimit)
  for (const row of suggestionRows) {
    relevantIds.add(row.championId)
  }
  return Array.from(meta.entries())
    .filter(([id]) => relevantIds.has(id))
    .map(([id, meta]) => ({ id, meta }))
}

export function serializeItemMatrixInput(
  args: BuildDraftIntelArgs,
  options?: ItemMatrixSerializeOptions
): RustItemMatrixInput {
  return {
    snapshot: args.snapshot,
    myRole: args.myRole,
    suggestions: args.suggestions,
    idToName: Array.from(args.idToName?.entries() ?? []).map(([id, name]) => ({ id, name })),
    championMetaById: focusedChampionMeta(args, options),
    enemyRoleInference: args.enemyRoleInference ?? [],
    itemCatalog: args.itemCatalog ?? [],
    uggSeed,
    championThreatOverrides: championThreatOverrideRows(),
    focusChampionId: options?.focusChampionId ?? null,
    limit: options?.limit
  }
}

function rowTargetIds(row: DraftItemMatrixRow): number[] {
  return (row.enemyTargets ?? []).map((target) => target.championId).sort((a, b) => a - b)
}

export function normalizeMatrixPlanForParity(plan: DraftMatchupPlan): ComparableMatrixPlan {
  const defaultIds = new Set(plan.itemPlan?.defaultItemIds ?? [])
  const buildIds = [
    ...(plan.itemPlan?.starting ?? []),
    ...(plan.itemPlan?.bootChoice ? [plan.itemPlan.bootChoice] : []),
    ...(plan.itemPlan?.coreBuild ?? []),
    ...(plan.itemPlan?.finalBuild ?? [])
  ].map((item) => item.itemId)
  return {
    championId: plan.championId,
    championName: plan.championName,
    defaultBuildSource: plan.itemPlan?.defaultBuildSource ?? null,
    defaultItemIds: Array.from(defaultIds).sort((a, b) => a - b),
    buildIds,
    matrixRows: (plan.itemPlan?.matrixRows ?? []).map((row) => ({
      itemId: row.itemId,
      role: defaultIds.has(row.itemId) ? 'default' : 'situational',
      targetIds: rowTargetIds(row),
      tags: [...row.tags].sort()
    }))
  }
}
