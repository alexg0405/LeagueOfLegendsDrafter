import type {
  ChampionBuildProfile,
  DraftIntel,
  DraftItemEnemyTarget,
  DraftItemMatrixRow,
  DraftItemPhase,
  DraftItemPlan,
  DraftItemRef,
  DraftItemThreat,
  DraftUpdate,
  EnemyRoleInference,
  PickSuggestion
} from './types'
import { isOverlayEngineEcho } from './validate'

/**
 * Some IPC/JSON round-trips can drop or mangle `NaN` / partial nested objects, which then fail
 * `isDraftUpdate` in the main process. The overlay never receives LCU/connection updates. Normalize
 * so publish always matches the validator.
 */
function finiteOr<T extends number | null | undefined>(n: T, fallback: number): number {
  if (n == null) {
    return fallback
  }
  return Number.isFinite(n) ? n : fallback
}

function sanitizeBuildProfile(
  b: PickSuggestion['buildProfile'] | null | undefined
): ChampionBuildProfile | null {
  if (b == null || typeof b !== 'object') {
    return null
  }
  const o = b as Record<string, unknown>
  const dmg = o.damage
  if (dmg !== 'ad' && dmg !== 'ap' && dmg !== 'mixed' && dmg !== 'flex') {
    return null
  }
  if (typeof o.archetype !== 'string' || typeof o.buildHint !== 'string' || typeof o.tagsLine !== 'string' || typeof o.partype !== 'string') {
    return null
  }
  if (o.itemHint != null && typeof o.itemHint !== 'string') {
    return null
  }
  return {
    damage: dmg,
    archetype: o.archetype,
    buildHint: o.buildHint,
    itemHint: typeof o.itemHint === 'string' ? o.itemHint : undefined,
    tagsLine: o.tagsLine,
    partype: o.partype
  }
}

function sanitizePickSuggestion(s: PickSuggestion): PickSuggestion {
  const baseWinRate = s.baseWinRate
  const contextWinRate = s.contextWinRate
  const winRateDelta = s.winRateDelta
  const estWin = s.estWin
  const ev = s.lookaheadEV
  const risk = s.lookaheadRisk
  return {
    ...s,
    score: finiteOr(s.score, 1),
    baseWinRate: baseWinRate != null && Number.isFinite(baseWinRate) ? baseWinRate : undefined,
    contextWinRate: contextWinRate != null && Number.isFinite(contextWinRate) ? contextWinRate : undefined,
    winRateDelta: winRateDelta != null && Number.isFinite(winRateDelta) ? winRateDelta : undefined,
    estWin: estWin != null && Number.isFinite(estWin) ? estWin : undefined,
    lookaheadEV: ev != null && Number.isFinite(ev) ? ev : undefined,
    lookaheadRisk: risk != null && Number.isFinite(risk) ? risk : undefined,
    buildProfile: sanitizeBuildProfile(s.buildProfile)
  }
}

function sanitizeChampionsSearch(
  rows: DraftUpdate['championsSearch']
): DraftUpdate['championsSearch'] {
  if (rows == null) {
    return null
  }
  return rows
    .filter((r) => r != null && typeof r.id === 'number' && typeof r.name === 'string')
    .map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key != null && typeof r.key === 'string' ? r.key : undefined,
      tags:
        r.tags == null
          ? undefined
          : Array.isArray(r.tags)
            ? r.tags.filter((t): t is string => typeof t === 'string')
            : undefined,
      partype: r.partype != null && typeof r.partype === 'string' ? r.partype : undefined
    }))
    .slice(0, 400)
}

function sanitizeTrainedEffectsStatus(
  t: DraftUpdate['trainedEffectsStatus']
): DraftUpdate['trainedEffectsStatus'] {
  if (t == null) {
    return null
  }
  return {
    hasAnyData: Boolean(t.hasAnyData),
    basePairs: finiteOr(t.basePairs, 0),
    matchupPairs: finiteOr(t.matchupPairs, 0),
    synergyPairs: finiteOr(t.synergyPairs, 0),
    exportedAt: typeof t.exportedAt === 'string' ? t.exportedAt : null,
    patchesSeen: Array.isArray(t.patchesSeen)
      ? t.patchesSeen.filter((p): p is string => typeof p === 'string')
      : []
  }
}

const roleKeys = ['top', 'jungle', 'middle', 'bottom', 'support'] as const

function sanitizeEnemyRoleInference(
  rows: DraftUpdate['enemyRoleInference']
): EnemyRoleInference[] | null {
  if (rows == null) {
    return null
  }
  return rows
    .filter((row) => row != null && typeof row === 'object')
    .map((row) => {
      const r = row as EnemyRoleInference
      const roleProbabilities = Object.fromEntries(
        roleKeys.map((role) => [role, finiteOr(r.roleProbabilities?.[role], 0)])
      ) as EnemyRoleInference['roleProbabilities']
      return {
        enemyIndex: finiteOr(r.enemyIndex, -1),
        cellId: r.cellId == null ? null : Number.isFinite(r.cellId) ? r.cellId : null,
        championId: finiteOr(r.championId, 0),
        assignedRole: r.assignedRole,
        inferredRole: r.inferredRole,
        confidence: finiteOr(r.confidence, 0),
        confidenceLabel: r.confidenceLabel,
        roleProbabilities
      }
    })
    .filter((row) => row.enemyIndex >= 0 && row.championId > 0)
    .slice(0, 5)
}

function text(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function nullableText(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function sanitizeStringArray(rows: unknown, max: number): string[] {
  return Array.isArray(rows) ? rows.filter((x): x is string => typeof x === 'string').slice(0, max) : []
}

function sanitizeDraftItemPlan(plan: unknown): DraftItemPlan | undefined {
  if (plan == null || typeof plan !== 'object') {
    return undefined
  }
  const p = plan as Record<string, unknown>
  if (typeof p.core !== 'string' || typeof p.boots !== 'string' || typeof p.defensive !== 'string') {
    return undefined
  }
  const itemRef = (raw: unknown): DraftItemRef | null => {
    if (raw == null || typeof raw !== 'object') {
      return null
    }
    const r = raw as Record<string, unknown>
    const phase = r.phase as DraftItemPhase
    if (phase !== 'starter' && phase !== 'component' && phase !== 'boots' && phase !== 'completed' && phase !== 'consumable') {
      return null
    }
    return {
      itemId: finiteOr(r.itemId as number | null | undefined, 0),
      name: text(r.name, 'Item'),
      reason: text(r.reason),
      score: finiteOr(r.score as number | null | undefined, 0),
      tags: sanitizeStringArray(r.tags, 16),
      phase,
      cost: finiteOr(r.cost as number | null | undefined, 0)
    }
  }
  const itemRefs = (rows: unknown, max: number): DraftItemRef[] | undefined =>
    Array.isArray(rows) ? rows.map(itemRef).filter((row): row is NonNullable<ReturnType<typeof itemRef>> => row != null && row.itemId > 0).slice(0, max) : undefined
  const matrixRows: DraftItemMatrixRow[] | undefined = Array.isArray(p.matrixRows)
    ? p.matrixRows
        .map((row): DraftItemMatrixRow | null => {
          const base = itemRef(row)
          if (!base || row == null || typeof row !== 'object') {
            return null
          }
          const r = row as Record<string, unknown>
          return {
            ...base,
            goodInto: sanitizeStringArray(r.goodInto, 8),
            goodAgainst: sanitizeStringArray(r.goodAgainst, 8),
            avoidWhen: sanitizeStringArray(r.avoidWhen, 8),
            enemyTargets: Array.isArray(r.enemyTargets)
              ? r.enemyTargets
                  .filter((target) => target != null && typeof target === 'object')
                  .map((target) => {
                    const t = target as Record<string, unknown>
                    const source: DraftItemEnemyTarget['source'] =
                      t.source === 'kit' || t.source === 'teamThreat' || t.source === 'defaultBuild' ? t.source : 'teamThreat'
                    return {
                      championId: finiteOr(t.championId as number | null | undefined, 0),
                      championName: text(t.championName),
                      reason: text(t.reason),
                      source
                    }
                  })
                  .filter((target) => target.championId > 0 && target.championName.length > 0)
                  .slice(0, 8)
              : undefined
          }
        })
        .filter((row): row is DraftItemMatrixRow => row != null && row.itemId > 0)
        .slice(0, 80)
    : undefined
  const threats: DraftItemThreat[] | undefined = Array.isArray(p.threatSummary)
    ? p.threatSummary
        .filter((row) => row != null && typeof row === 'object')
        .map((row) => {
          const r = row as Record<string, unknown>
          const tone: DraftItemThreat['tone'] = r.tone === 'danger' || r.tone === 'warning' || r.tone === 'info' ? r.tone : 'info'
          return { label: text(r.label), tone, reason: text(r.reason) }
        })
        .filter((row) => row.label.length > 0)
        .slice(0, 12)
    : undefined
  return {
    core: p.core,
    boots: p.boots,
    defensive: p.defensive,
    situational: sanitizeStringArray(p.situational, 6),
    notes: sanitizeStringArray(p.notes, 6),
    defaultBuildSource: p.defaultBuildSource === 'ugg' || p.defaultBuildSource === 'adaptive' ? p.defaultBuildSource : undefined,
    defaultItemIds: Array.isArray(p.defaultItemIds)
      ? p.defaultItemIds.map((id) => finiteOr(id as number | null | undefined, 0)).filter((id) => id > 0).slice(0, 16)
      : undefined,
    starting: itemRefs(p.starting, 4),
    firstRecall: itemRefs(p.firstRecall, 6),
    bootChoice: itemRef(p.bootChoice),
    bootAlternatives: itemRefs(p.bootAlternatives, 4),
    coreBuild: itemRefs(p.coreBuild, 6),
    finalBuild: itemRefs(p.finalBuild, 8),
    situationalItems: itemRefs(p.situationalItems, 12),
    matrixRows,
    threatSummary: threats
  }
}

function sanitizeDraftIntel(intel: DraftUpdate['draftIntel']): DraftIntel | null {
  if (intel == null || typeof intel !== 'object') {
    return null
  }
  const i = intel as DraftIntel
  const sanitizeMatchupPlans = (rows: unknown, max: number): DraftIntel['matchupPlans'] =>
    Array.isArray(rows)
      ? rows
          .filter((row) => row != null && typeof row === 'object')
          .map((row) => {
            const r = row as DraftIntel['matchupPlans'][number]
            return {
              championId: finiteOr(r.championId, 0),
              championName: text(r.championName, 'Champion'),
              laneOpponentId: r.laneOpponentId == null || finiteOr(r.laneOpponentId, 0) <= 0 ? null : finiteOr(r.laneOpponentId, 0),
              laneOpponentName: nullableText(r.laneOpponentName),
              summonerSpells: text(r.summonerSpells),
              startingItem: text(r.startingItem),
              firstRecall: text(r.firstRecall),
              runeExport: text(r.runeExport),
              gamePlan: text(r.gamePlan),
              itemPlan: sanitizeDraftItemPlan(r.itemPlan)
            }
          })
          .filter((row) => row.championId > 0)
          .slice(0, max)
      : []
  const itemMatrixPlans = sanitizeMatchupPlans(i.itemMatrixPlans, 40)
  return {
    banRecommendations: Array.isArray(i.banRecommendations)
      ? i.banRecommendations
          .filter((row) => row != null && typeof row === 'object')
          .map((row) => ({
            championId: finiteOr(row.championId, 0),
            championName: text(row.championName, 'Champion'),
            role: roleKeys.includes(row.role) ? row.role : 'middle',
            score: finiteOr(row.score, 0),
            reason: text(row.reason)
          }))
          .filter((row) => row.championId > 0)
          .slice(0, 16)
      : [],
    compIdentity: {
      ally: Array.isArray(i.compIdentity?.ally) ? i.compIdentity.ally.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
      enemy: Array.isArray(i.compIdentity?.enemy) ? i.compIdentity.enemy.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
      missing: Array.isArray(i.compIdentity?.missing) ? i.compIdentity.missing.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
      warnings: Array.isArray(i.compIdentity?.warnings) ? i.compIdentity.warnings.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
      winCondition: text(i.compIdentity?.winCondition)
    },
    matchupPlans: sanitizeMatchupPlans(i.matchupPlans, 16),
    itemMatrixPlans: itemMatrixPlans.length ? itemMatrixPlans : undefined,
    pickComparison: Array.isArray(i.pickComparison)
      ? i.pickComparison
          .filter((row) => row != null && typeof row === 'object')
          .map((row) => ({
            championId: finiteOr(row.championId, 0),
            championName: text(row.championName, 'Champion'),
            score: finiteOr(row.score, 0),
            estWin: row.estWin == null || !Number.isFinite(row.estWin) ? undefined : row.estWin,
            delta: row.delta == null || !Number.isFinite(row.delta) ? undefined : row.delta,
            summary: text(row.summary)
          }))
          .filter((row) => row.championId > 0)
          .slice(0, 8)
      : [],
    loadingBrief: Array.isArray(i.loadingBrief) ? i.loadingBrief.filter((x): x is string => typeof x === 'string').slice(0, 8) : [],
    confidenceNotes: Array.isArray(i.confidenceNotes) ? i.confidenceNotes.filter((x): x is string => typeof x === 'string').slice(0, 8) : []
  }
}

export function sanitizeDraftUpdateForIpc(d: DraftUpdate): DraftUpdate {
  return {
    ...d,
    suggestions: d.suggestions.map(sanitizePickSuggestion),
    enemyRoleInference: sanitizeEnemyRoleInference(d.enemyRoleInference),
    draftIntel: sanitizeDraftIntel(d.draftIntel),
    championsSearch: sanitizeChampionsSearch(d.championsSearch),
    trainedEffectsStatus: sanitizeTrainedEffectsStatus(d.trainedEffectsStatus),
    overlayEngineEcho:
      d.overlayEngineEcho != null && isOverlayEngineEcho(d.overlayEngineEcho) ? d.overlayEngineEcho : null
  }
}
