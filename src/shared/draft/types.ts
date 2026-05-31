/** Where the current draft snapshot came from. */
export type DraftSource = 'lcu' | 'manual' | 'vision' | 'none'

/** Ordering when sorting by contextual winrate delta (best = biggest gains first). */
export type DraftDeltaListMode = 'best' | 'worst'

/** LCU uses "utility" for support. */
export type DraftRole =
  | 'top'
  | 'jungle'
  | 'middle'
  | 'bottom'
  | 'support'
  | 'unknown'

export type RoleProbabilityMap = Record<Exclude<DraftRole, 'unknown'>, number>

export type EnemyRoleInferenceConfidenceLabel = 'likely' | 'flex' | 'uncertain'

export type EnemyRoleInference = {
  enemyIndex: number
  cellId: number | null
  championId: number
  assignedRole: DraftRole
  inferredRole: Exclude<DraftRole, 'unknown'>
  confidence: number
  confidenceLabel: EnemyRoleInferenceConfidenceLabel
  roleProbabilities: RoleProbabilityMap
}

export type TeamId = '100' | '200'

export type SlotPick = {
  role: DraftRole
  /** Riot champion id; 0 or null = not picked */
  championId: number | null
  championName: string | null
  cellId: number | null
}

export type DraftSnapshot = {
  ally: SlotPick[]
  enemy: SlotPick[]
  /** Blue (100) or red (200), or null if unknown */
  myTeam: TeamId | null
  /** Local summoner's role when known */
  myRole: DraftRole | null
  /** Local player's cell id from LCU when present */
  localPlayerCellId: number | null
  /** Both teams' bans (LCU), when available */
  bans?: number[] | null
  /**
   * Best-effort: your next pick’s order in the pick phase (1 = first pick, …).
   * Not the same as internal action id. Null if unknown.
   */
  myPickOrder?: number | null
}

export type SuggestionReason =
  | 'lane_counter'
  | 'team_synergy'
  | 'meta_safe'
  | 'fill_role'
  | 'base_wr'
  | 'blind_safe'
  | 'late_counter'

/** Display-only rune page hint (not live balance data). */
export type RuneLoadoutHint = {
  primaryTree: string
  keystone: string
  secondary: string
  note?: string
}

export type ChampionPoolPreference = 'main' | 'comfortable' | 'learning' | 'never'

export type DraftItemPhase = 'starter' | 'component' | 'boots' | 'completed' | 'consumable'

export type DraftItemRef = {
  itemId: number
  name: string
  reason: string
  score: number
  tags: string[]
  phase: DraftItemPhase
  cost: number
}

export type DraftItemMatrixRow = DraftItemRef & {
  goodInto: string[]
  goodAgainst?: string[]
  avoidWhen: string[]
}

export type DraftItemThreat = {
  label: string
  tone: 'info' | 'warning' | 'danger'
  reason: string
}

export type DraftItemPlan = {
  core: string
  boots: string
  defensive: string
  situational: string[]
  notes: string[]
  starting?: DraftItemRef[]
  firstRecall?: DraftItemRef[]
  bootChoice?: DraftItemRef | null
  bootAlternatives?: DraftItemRef[]
  coreBuild?: DraftItemRef[]
  finalBuild?: DraftItemRef[]
  situationalItems?: DraftItemRef[]
  matrixRows?: DraftItemMatrixRow[]
  threatSummary?: DraftItemThreat[]
}

export type DraftIntel = {
  banRecommendations: {
    championId: number
    championName: string
    role: Exclude<DraftRole, 'unknown'>
    score: number
    reason: string
  }[]
  compIdentity: {
    ally: string[]
    enemy: string[]
    missing: string[]
    warnings: string[]
    winCondition: string
  }
  matchupPlans: {
    championId: number
    championName: string
    laneOpponentId: number | null
    laneOpponentName: string | null
    summonerSpells: string
    startingItem: string
    firstRecall: string
    runeExport: string
    gamePlan: string
    itemPlan?: DraftItemPlan
  }[]
  pickComparison: {
    championId: number
    championName: string
    score: number
    estWin?: number
    delta?: number
    summary: string
  }[]
  loadingBrief: string[]
  confidenceNotes: string[]
}

/**
 * Riot DDragon `tags` + partype, turned into build direction (not perfect meta — see hint).
 * AD = physical itemization, AP = magic, mixed = resists+mixed scaling, flex = can go either.
 */
export type ChampionBuildProfile = {
  damage: 'ad' | 'ap' | 'mixed' | 'flex'
  archetype: string
  buildHint: string
  /** Patch-aware item direction; display only, not a full item optimizer. */
  itemHint?: string
  /** e.g. Fighter · Assassin (from DDragon) */
  tagsLine: string
  /** Mana, Energy, None, BloodWell, etc. */
  partype: string
}

export type PickSuggestion = {
  championId: number
  championName: string
  score: number
  reasons: SuggestionReason[]
  /** True when this row is the local player's already locked champion, pinned for post-lock info. */
  isLockedPick?: boolean
  /** Baseline role winrate proxy for this champion (0-1). */
  baseWinRate?: number
  /** Contextual winrate proxy for this board (0-1). */
  contextWinRate?: number
  /** Context minus baseline (0-1 delta, can be negative). */
  winRateDelta?: number
  /** Shrunk + phase-blended win expectation used for ordering (0–1, illustrative). */
  estWin?: number
  /** Monte Carlo mean over completed drafts (0–1), when engine uses lookahead. */
  lookaheadEV?: number
  /** Std dev of MC samples; lower = less variance in plausible futures. */
  lookaheadRisk?: number
  /** One line for UI: phase, lane, model. */
  detail?: string
  runes?: RuneLoadoutHint | null
  /** DDragon tags → damage type + build archetype */
  buildProfile?: ChampionBuildProfile | null
}

/**
 * Payload forwarded from the main window renderer to the overlay.
 */
/** Overlay-only overrides merged in main window before computing suggestions. */
export type OverlayEnginePrefs = {
  /** null = follow League / main app role for suggestions */
  roleOverride: DraftRole | null
  /** null = follow main app sort mode */
  sortByOverride: 'score' | 'delta' | null
  /** null = follow main app Monte Carlo rollout count */
  monteCarloOverride: number | null
  /** null = follow main app; only applies when sort is winrate delta */
  deltaListModeOverride: DraftDeltaListMode | null
}

/** Partial update from overlay (each field optional). */
export type OverlayEnginePrefsPatch = Partial<OverlayEnginePrefs>

/** Echo of overlay + resolved engine inputs (for overlay UI sync). */
export type OverlayEngineEcho = OverlayEnginePrefs & {
  resolvedRole: DraftRole
  resolvedSortBy: 'score' | 'delta'
  resolvedMonteCarlo: number
  resolvedDeltaListMode: DraftDeltaListMode
}

export type DraftUpdate = {
  source: DraftSource
  lcuConnected: boolean
  /** UI-level client state for calm startup/loading copy. */
  lcuStatus?: 'unknown' | 'waiting' | 'ready'
  snapshot: DraftSnapshot | null
  suggestions: PickSuggestion[]
  /** Optional coaching text explanation */
  geminiNarration: string | null
  dataDragonVersion: string | null
  /** Dataset / approx meta label for bundled matchup heuristics */
  patchLabel: string | null
  error: string | null
  updatedAt: string
  /**
   * Role used for `suggestions` (curated per-role pool). Can differ from `snapshot.myRole` when
   * the user locks a role in the main window.
   */
  suggestionMyRole: DraftRole | null
  /** Display names for `snapshot.bans` ids (same length when set), for overlay / HUD */
  banChampionNames?: (string | null)[] | null
  /** Enemy role posterior summary used for advisory role labels and off-meta-aware scoring. */
  enemyRoleInference?: EnemyRoleInference[] | null
  /** High-level draft coach output: bans, comp identity, plans, compare rows, and brief. */
  draftIntel?: DraftIntel | null
  /**
   * Fingerprint of board + model inputs (bans, slots, pick order, role, MC). Overlay can use as a
   * React `key` so UI refreshes when the published snapshot changes.
   */
  boardSignature?: string | null
  /**
   * Champion id/name list for the overlay name search (Data Dragon; sorted by name when provided).
   */
  /** Overlay search: names + DDragon `tags` / partype for AD·AP / tank hints */
  championsSearch?: { id: number; name: string; key?: string; tags?: string[]; partype?: string }[] | null
  /**
   * Summary of the trained-effects bundle loaded in main (from `npm run train:export`).
   * When missing or `hasAnyData === false`, the overlay should advertise bundled heuristics only.
   */
  trainedEffectsStatus?: {
    hasAnyData: boolean
    basePairs: number
    matchupPairs: number
    synergyPairs: number
    exportedAt: string | null
    patchesSeen: string[]
  } | null
  /** Merged overlay engine controls + what the scorer actually used */
  overlayEngineEcho?: OverlayEngineEcho | null
}
