import type {
  DraftRole,
  DraftItemPlan,
  DraftIntel,
  DraftSnapshot,
  DraftSource,
  DraftUpdate,
  EnemyRoleInference,
  OverlayEngineEcho,
  OverlayEnginePrefsPatch,
  PickSuggestion,
  SlotPick,
  SuggestionReason
} from './types'

const SOURCES: DraftSource[] = ['lcu', 'manual', 'vision', 'none']
const ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support', 'unknown']
const SUGGEST_ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']

const REASONS: SuggestionReason[] = [
  'lane_counter',
  'team_synergy',
  'meta_safe',
  'fill_role',
  'base_wr',
  'blind_safe',
  'late_counter'
]

function isSlotPick(x: unknown): x is SlotPick {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  return (
    typeof o.role === 'string' &&
    ROLES.includes(o.role as DraftRole) &&
    (o.championId === null || typeof o.championId === 'number') &&
    (o.championName === null || typeof o.championName === 'string') &&
    (o.cellId === null || typeof o.cellId === 'number')
  )
}

function isSnapshot(x: unknown): x is DraftSnapshot {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.ally) || !Array.isArray(o.enemy)) {
    return false
  }
  if (o.ally.length > 5 || o.enemy.length > 5) {
    return false
  }
  if (!o.ally.every((s) => isSlotPick(s)) || !o.enemy.every((s) => isSlotPick(s))) {
    return false
  }
  if (o.myTeam != null && o.myTeam !== '100' && o.myTeam !== '200') {
    return false
  }
  if (o.myRole != null && !ROLES.includes(o.myRole as DraftRole)) {
    return false
  }
  if (o.localPlayerCellId != null && typeof o.localPlayerCellId !== 'number') {
    return false
  }
  if (o.bans != null) {
    if (!Array.isArray(o.bans) || o.bans.some((x) => typeof x !== 'number')) {
      return false
    }
  }
  if (o.myPickOrder != null && typeof o.myPickOrder !== 'number') {
    return false
  }
  return (o.localPlayerCellId === null || typeof o.localPlayerCellId === 'number') &&
    (o.myTeam === null || o.myTeam === '100' || o.myTeam === '200') &&
    (o.myRole === null || typeof o.myRole === 'string') &&
    true
}

function isRuneLoadoutHint(x: unknown): boolean {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  return (
    typeof o.primaryTree === 'string' &&
    typeof o.keystone === 'string' &&
    typeof o.secondary === 'string' &&
    (o.note === undefined || typeof o.note === 'string')
  )
}

function isEnemyRoleInference(x: unknown): x is EnemyRoleInference {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  if (typeof o.enemyIndex !== 'number' || !Number.isFinite(o.enemyIndex) || o.enemyIndex < 0 || o.enemyIndex > 4) {
    return false
  }
  if (o.cellId != null && typeof o.cellId !== 'number') {
    return false
  }
  if (typeof o.championId !== 'number' || !Number.isFinite(o.championId) || o.championId <= 0) {
    return false
  }
  if (typeof o.assignedRole !== 'string' || !ROLES.includes(o.assignedRole as DraftRole)) {
    return false
  }
  if (typeof o.inferredRole !== 'string' || !SUGGEST_ROLES.includes(o.inferredRole as DraftRole)) {
    return false
  }
  if (typeof o.confidence !== 'number' || !Number.isFinite(o.confidence) || o.confidence < 0 || o.confidence > 1) {
    return false
  }
  if (o.confidenceLabel !== 'likely' && o.confidenceLabel !== 'flex' && o.confidenceLabel !== 'uncertain') {
    return false
  }
  const probs = o.roleProbabilities
  if (probs == null || typeof probs !== 'object') {
    return false
  }
  const p = probs as Record<string, unknown>
  return SUGGEST_ROLES.every((role) => typeof p[role] === 'number' && Number.isFinite(p[role]) && (p[role] as number) >= 0 && (p[role] as number) <= 1)
}

function isPickSuggestion(x: unknown): x is PickSuggestion {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  if (typeof o.championId !== 'number' || typeof o.championName !== 'string' || typeof o.score !== 'number') {
    return false
  }
  if (o.isLockedPick != null && typeof o.isLockedPick !== 'boolean') {
    return false
  }
  if (o.estWin != null && typeof o.estWin !== 'number') {
    return false
  }
  if (o.baseWinRate != null && typeof o.baseWinRate !== 'number') {
    return false
  }
  if (o.contextWinRate != null && typeof o.contextWinRate !== 'number') {
    return false
  }
  if (o.winRateDelta != null && typeof o.winRateDelta !== 'number') {
    return false
  }
  if (o.lookaheadEV != null && typeof o.lookaheadEV !== 'number') {
    return false
  }
  if (o.lookaheadRisk != null && typeof o.lookaheadRisk !== 'number') {
    return false
  }
  if (o.detail != null && typeof o.detail !== 'string') {
    return false
  }
  if (o.runes != null && !isRuneLoadoutHint(o.runes)) {
    return false
  }
  if (o.buildProfile != null) {
    const b = o.buildProfile as Record<string, unknown>
    if (typeof b !== 'object' || b == null) {
      return false
    }
    const dmg = b.damage
    if (dmg !== 'ad' && dmg !== 'ap' && dmg !== 'mixed' && dmg !== 'flex') {
      return false
    }
    if (typeof b.archetype !== 'string' || typeof b.buildHint !== 'string' || typeof b.tagsLine !== 'string' || typeof b.partype !== 'string') {
      return false
    }
    if (b.itemHint != null && typeof b.itemHint !== 'string') {
      return false
    }
  }
  if (!Array.isArray(o.reasons) || o.reasons.some((r) => typeof r !== 'string' || !REASONS.includes(r as SuggestionReason))) {
    return false
  }
  return true
}

function isStringArray(x: unknown, max = 8): x is string[] {
  return Array.isArray(x) && x.length <= max && x.every((row) => typeof row === 'string')
}

function isDraftItemPlan(x: unknown): x is DraftItemPlan {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  const isItemRef = (row: unknown): boolean => {
    if (row == null || typeof row !== 'object') {
      return false
    }
    const r = row as Record<string, unknown>
    return (
      typeof r.itemId === 'number' &&
      typeof r.name === 'string' &&
      typeof r.reason === 'string' &&
      typeof r.score === 'number' &&
      typeof r.cost === 'number' &&
      (r.phase === 'starter' || r.phase === 'component' || r.phase === 'boots' || r.phase === 'completed' || r.phase === 'consumable') &&
      isStringArray(r.tags, 16)
    )
  }
  const isItemRefs = (rows: unknown, max: number): boolean => Array.isArray(rows) && rows.length <= max && rows.every(isItemRef)
  const isMatrixRows = (rows: unknown, max: number): boolean =>
    Array.isArray(rows) &&
    rows.length <= max &&
    rows.every((row) => {
      if (!isItemRef(row)) {
        return false
      }
      const r = row as Record<string, unknown>
      return isStringArray(r.goodInto, 8) && (r.goodAgainst == null || isStringArray(r.goodAgainst, 8)) && isStringArray(r.avoidWhen, 8)
    })
  const isThreats = (rows: unknown, max: number): boolean =>
    Array.isArray(rows) &&
    rows.length <= max &&
    rows.every((row) => {
      if (row == null || typeof row !== 'object') {
        return false
      }
      const r = row as Record<string, unknown>
      return typeof r.label === 'string' && typeof r.reason === 'string' && (r.tone === 'info' || r.tone === 'warning' || r.tone === 'danger')
    })
  return (
    typeof o.core === 'string' &&
    typeof o.boots === 'string' &&
    typeof o.defensive === 'string' &&
    isStringArray(o.situational, 6) &&
    isStringArray(o.notes, 6) &&
    (o.starting == null || isItemRefs(o.starting, 4)) &&
    (o.firstRecall == null || isItemRefs(o.firstRecall, 6)) &&
    (o.bootChoice == null || isItemRef(o.bootChoice)) &&
    (o.bootAlternatives == null || isItemRefs(o.bootAlternatives, 4)) &&
    (o.coreBuild == null || isItemRefs(o.coreBuild, 6)) &&
    (o.finalBuild == null || isItemRefs(o.finalBuild, 8)) &&
    (o.situationalItems == null || isItemRefs(o.situationalItems, 12)) &&
    (o.matrixRows == null || isMatrixRows(o.matrixRows, 80)) &&
    (o.threatSummary == null || isThreats(o.threatSummary, 12))
  )
}

function isDraftIntel(x: unknown): x is DraftIntel {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  if (!Array.isArray(o.banRecommendations) || o.banRecommendations.length > 8) {
    return false
  }
  for (const row of o.banRecommendations) {
    if (row == null || typeof row !== 'object') {
      return false
    }
    const r = row as Record<string, unknown>
    if (typeof r.championId !== 'number' || typeof r.championName !== 'string') {
      return false
    }
    if (typeof r.role !== 'string' || !SUGGEST_ROLES.includes(r.role as DraftRole)) {
      return false
    }
    if (typeof r.score !== 'number' || !Number.isFinite(r.score) || typeof r.reason !== 'string') {
      return false
    }
  }
  const comp = o.compIdentity
  if (comp == null || typeof comp !== 'object') {
    return false
  }
  const c = comp as Record<string, unknown>
  if (!isStringArray(c.ally) || !isStringArray(c.enemy) || !isStringArray(c.missing) || !isStringArray(c.warnings)) {
    return false
  }
  if (typeof c.winCondition !== 'string') {
    return false
  }
  if (!Array.isArray(o.matchupPlans) || o.matchupPlans.length > 16) {
    return false
  }
  for (const row of o.matchupPlans) {
    if (row == null || typeof row !== 'object') {
      return false
    }
    const r = row as Record<string, unknown>
    if (typeof r.championId !== 'number' || typeof r.championName !== 'string') {
      return false
    }
    if (r.laneOpponentId != null && typeof r.laneOpponentId !== 'number') {
      return false
    }
    if (r.laneOpponentName != null && typeof r.laneOpponentName !== 'string') {
      return false
    }
    if (
      typeof r.summonerSpells !== 'string' ||
      typeof r.startingItem !== 'string' ||
      typeof r.firstRecall !== 'string' ||
      typeof r.runeExport !== 'string' ||
      typeof r.gamePlan !== 'string'
    ) {
      return false
    }
    if (r.itemPlan != null && !isDraftItemPlan(r.itemPlan)) {
      return false
    }
  }
  if (!Array.isArray(o.pickComparison) || o.pickComparison.length > 8) {
    return false
  }
  for (const row of o.pickComparison) {
    if (row == null || typeof row !== 'object') {
      return false
    }
    const r = row as Record<string, unknown>
    if (typeof r.championId !== 'number' || typeof r.championName !== 'string' || typeof r.score !== 'number') {
      return false
    }
    if (r.estWin != null && typeof r.estWin !== 'number') {
      return false
    }
    if (r.delta != null && typeof r.delta !== 'number') {
      return false
    }
    if (typeof r.summary !== 'string') {
      return false
    }
  }
  return isStringArray(o.loadingBrief) && isStringArray(o.confidenceNotes)
}

export function isOverlayEnginePrefsPatch(x: unknown): x is OverlayEnginePrefsPatch {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  if (o.roleOverride !== undefined && o.roleOverride !== null) {
    if (typeof o.roleOverride !== 'string' || !SUGGEST_ROLES.includes(o.roleOverride as DraftRole)) {
      return false
    }
  }
  if (o.sortByOverride !== undefined && o.sortByOverride !== null) {
    if (o.sortByOverride !== 'score' && o.sortByOverride !== 'delta') {
      return false
    }
  }
  if (o.monteCarloOverride !== undefined && o.monteCarloOverride !== null) {
    const n = o.monteCarloOverride
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 200 || Math.trunc(n) !== n) {
      return false
    }
  }
  if (o.deltaListModeOverride !== undefined && o.deltaListModeOverride !== null) {
    if (o.deltaListModeOverride !== 'best' && o.deltaListModeOverride !== 'worst') {
      return false
    }
  }
  return Object.keys(o).every((k) =>
    ['roleOverride', 'sortByOverride', 'monteCarloOverride', 'deltaListModeOverride'].includes(k)
  )
}

export function isOverlayEngineEcho(x: unknown): x is OverlayEngineEcho {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  const ro = o.roleOverride
  if (ro !== null && (typeof ro !== 'string' || !SUGGEST_ROLES.includes(ro as DraftRole))) {
    return false
  }
  const so = o.sortByOverride
  if (so !== null && so !== 'score' && so !== 'delta') {
    return false
  }
  const mc = o.monteCarloOverride
  if (mc !== null && (typeof mc !== 'number' || !Number.isFinite(mc) || mc < 0 || mc > 200 || Math.trunc(mc) !== mc)) {
    return false
  }
  const dl = o.deltaListModeOverride
  if (dl !== null && dl !== 'best' && dl !== 'worst') {
    return false
  }
  if (o.resolvedDeltaListMode !== 'best' && o.resolvedDeltaListMode !== 'worst') {
    return false
  }
  if (typeof o.resolvedRole !== 'string' || !SUGGEST_ROLES.includes(o.resolvedRole as DraftRole)) {
    return false
  }
  if (o.resolvedSortBy !== 'score' && o.resolvedSortBy !== 'delta') {
    return false
  }
  if (
    typeof o.resolvedMonteCarlo !== 'number' ||
    !Number.isFinite(o.resolvedMonteCarlo) ||
    o.resolvedMonteCarlo < 0 ||
    o.resolvedMonteCarlo > 200 ||
    Math.trunc(o.resolvedMonteCarlo) !== o.resolvedMonteCarlo
  ) {
    return false
  }
  return true
}

export function isDraftUpdate(x: unknown): x is DraftUpdate {
  if (x == null || typeof x !== 'object') {
    return false
  }
  const o = x as Record<string, unknown>
  if (!SOURCES.includes(o.source as DraftSource)) {
    return false
  }
  if (typeof o.lcuConnected !== 'boolean') {
    return false
  }
  if (
    o.lcuStatus !== undefined &&
    o.lcuStatus !== 'unknown' &&
    o.lcuStatus !== 'waiting' &&
    o.lcuStatus !== 'ready'
  ) {
    return false
  }
  if (o.snapshot != null && !isSnapshot(o.snapshot)) {
    return false
  }
  if (o.error != null && typeof o.error !== 'string') {
    return false
  }
  if (!Array.isArray(o.suggestions) || o.suggestions.some((s) => !isPickSuggestion(s))) {
    return false
  }
  if (o.geminiNarration != null && typeof o.geminiNarration !== 'string') {
    return false
  }
  if (o.dataDragonVersion != null && typeof o.dataDragonVersion !== 'string') {
    return false
  }
  if (o.patchLabel != null && typeof o.patchLabel !== 'string') {
    return false
  }
  if (o.suggestionMyRole != null && (typeof o.suggestionMyRole !== 'string' || !ROLES.includes(o.suggestionMyRole as DraftRole))) {
    return false
  }
  if (typeof o.updatedAt !== 'string') {
    return false
  }
  if (o.banChampionNames != null) {
    if (
      !Array.isArray(o.banChampionNames) ||
      o.banChampionNames.some((x) => x !== null && typeof x !== 'string')
    ) {
      return false
    }
  }
  if (o.boardSignature != null && typeof o.boardSignature !== 'string') {
    return false
  }
  if (o.enemyRoleInference != null) {
    if (
      !Array.isArray(o.enemyRoleInference) ||
      o.enemyRoleInference.length > 5 ||
      o.enemyRoleInference.some((row) => !isEnemyRoleInference(row))
    ) {
      return false
    }
  }
  if (o.draftIntel != null && !isDraftIntel(o.draftIntel)) {
    return false
  }
  if (o.championsSearch != null) {
    if (!Array.isArray(o.championsSearch) || o.championsSearch.length > 400) {
      return false
    }
    for (const row of o.championsSearch) {
      if (row == null || typeof row !== 'object') {
        return false
      }
      const r = row as Record<string, unknown>
      if (typeof r.id !== 'number' || typeof r.name !== 'string') {
        return false
      }
      if (r.key != null && typeof r.key !== 'string') {
        return false
      }
      if (r.tags != null) {
        if (!Array.isArray(r.tags) || r.tags.some((t) => typeof t !== 'string')) {
          return false
        }
      }
      if (r.partype != null && typeof r.partype !== 'string') {
        return false
      }
    }
  }
  if (o.overlayEngineEcho != null && !isOverlayEngineEcho(o.overlayEngineEcho)) {
    return false
  }
  if (o.trainedEffectsStatus != null) {
    const t = o.trainedEffectsStatus as Record<string, unknown>
    if (typeof t !== 'object') {
      return false
    }
    if (typeof t.hasAnyData !== 'boolean') {
      return false
    }
    if (
      typeof t.basePairs !== 'number' ||
      typeof t.matchupPairs !== 'number' ||
      typeof t.synergyPairs !== 'number'
    ) {
      return false
    }
    if (t.exportedAt != null && typeof t.exportedAt !== 'string') {
      return false
    }
    if (
      !Array.isArray(t.patchesSeen) ||
      t.patchesSeen.some((x) => typeof x !== 'string')
    ) {
      return false
    }
  }
  return true
}
