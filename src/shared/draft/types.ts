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

/**
 * Riot DDragon `tags` + partype, turned into build direction (not perfect meta — see hint).
 * AD = physical itemization, AP = magic, mixed = resists+mixed scaling, flex = can go either.
 */
export type ChampionBuildProfile = {
  damage: 'ad' | 'ap' | 'mixed' | 'flex'
  archetype: string
  buildHint: string
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
  /**
   * Fingerprint of board + model inputs (bans, slots, pick order, role, MC). Overlay can use as a
   * React `key` so UI refreshes when the published snapshot changes.
   */
  boardSignature?: string | null
  /**
   * Champion id/name list for the overlay name search (Data Dragon; sorted by name when provided).
   */
  /** Overlay search: names + DDragon `tags` / partype for AD·AP / tank hints */
  championsSearch?: { id: number; name: string; tags?: string[]; partype?: string }[] | null
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
