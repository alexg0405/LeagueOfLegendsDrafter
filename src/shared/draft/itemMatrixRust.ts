import uggSeed from '../data/uggDefaultItemBuildsSeed.json'
import { championThreatOverrideRows } from './championThreatOverrides'
import type { BuildDraftIntelArgs } from './draftIntel'
import type { DraftItemMatrixRow, DraftMatchupPlan } from './types'

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

export function serializeItemMatrixInput(args: BuildDraftIntelArgs): RustItemMatrixInput {
  return {
    snapshot: args.snapshot,
    myRole: args.myRole,
    suggestions: args.suggestions,
    idToName: Array.from(args.idToName?.entries() ?? []).map(([id, name]) => ({ id, name })),
    championMetaById: Array.from(args.championMetaById?.entries() ?? []).map(([id, meta]) => ({ id, meta })),
    enemyRoleInference: args.enemyRoleInference ?? [],
    itemCatalog: args.itemCatalog ?? [],
    uggSeed,
    championThreatOverrides: championThreatOverrideRows()
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
