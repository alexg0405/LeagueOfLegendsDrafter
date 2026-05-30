import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import type { AppUpdateStatus } from '@shared/appUpdate'
import { getLatestDDragonVersion, loadChampionMaps, type ChampionLite } from '@shared/dataDragon'
import {
  applyChampionNames,
  buildDraftIntel,
  championIdsForMyPool,
  championPoolPreferenceToComfort,
  compileTrainedEffects,
  draftBoardSignature,
  ENGINE_V1_LABEL,
  importedProfileToPreferences,
  inferEnemyRoleAssignments,
  isOverlayEnginePrefsPatch,
  mergeChampionPoolPreferences,
  resolveChampionName,
  sanitizeDraftUpdateForIpc,
  suggestPicks,
  validatePlayerChampionPoolProfile,
  type CompiledTrainedEffects,
  type DraftDeltaListMode,
  type DraftRole,
  type DraftSnapshot,
  type DraftSource,
  type DraftUpdate,
  type ChampionPoolPreference,
  type LcuChampSelectResult,
  type OverlayEngineEcho,
  type OverlayEnginePrefs,
  type OverlayEnginePrefsPatch,
  type PlayerChampionPoolProfile,
  type RecommendationPoolMode,
  type RiotPlatform
} from '@shared/draft'
import {
  NexusClientLayout,
  NexusHomeDashboard,
  NexusOperationsView,
  NexusRoutePanel,
  NexusStubView,
  NAV_ORDER,
  type NexusNavId
} from './nexus-ui'
import {
  livePublicDataStatusLine,
  refreshLivePublicData,
  type LivePublicDataRefreshStatus
} from './livePublicDataClient'
import { copyBottomStatusStrip, copyDraftSource } from './nexus-ui/nexusCopy'

const ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const LS_MY_ROLE = 'nexusdraft.v1.myRole'
const LS_SUGGEST_MC = 'nexusdraft.v1.suggestMcRollouts'
const LS_SUGGEST_DELTA_LIST = 'nexusdraft.v1.suggestDeltaListMode'
const LS_CHAMPION_POOL_PREFS = 'nexusdraft.v1.championPoolPrefs'
const LS_PLAYER_POOL_PROFILE = 'nexusdraft.v1.playerChampionPoolProfile'
const LS_RECOMMENDATION_POOL_MODE = 'nexusdraft.v1.recommendationPoolMode'
const DEFAULT_SUGGEST_MC = 40
const MAX_SUGGEST_MC = 200
const SUGGESTION_RESULT_LIMIT = 40
const LIVE_META_REFRESH_MS = 30 * 60 * 1000

type ChampionPoolPrefs = Record<string, ChampionPoolPreference>
const LEGACY_AATROX_PLACEHOLDER_PREFS: ChampionPoolPrefs = { '266': 'main' }

function stripLegacyChampionPoolPlaceholder(prefs: ChampionPoolPrefs): ChampionPoolPrefs {
  const keys = Object.keys(prefs)
  if (keys.length === 1 && prefs['266'] === LEGACY_AATROX_PLACEHOLDER_PREFS['266']) {
    return {}
  }
  return prefs
}

/** Deterministic per board so MC rankings don’t flicker between identical LCU polls. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function readStoredMcRollouts(): number {
  try {
    const v = localStorage.getItem(LS_SUGGEST_MC)
    if (v == null || v === '') {
      return DEFAULT_SUGGEST_MC
    }
    const n = Number(v)
    if (!Number.isFinite(n)) {
      return DEFAULT_SUGGEST_MC
    }
    return Math.max(0, Math.min(MAX_SUGGEST_MC, Math.trunc(n)))
  } catch {
    /* ignore */
  }
  return DEFAULT_SUGGEST_MC
}

function readStoredMyRole(): DraftRole {
  try {
    const v = localStorage.getItem(LS_MY_ROLE)
    if (v && (ROLES as readonly string[]).includes(v)) {
      return v as DraftRole
    }
  } catch {
    /* ignore */
  }
  return 'middle'
}

function readStoredSuggestDeltaListMode(): DraftDeltaListMode {
  try {
    const v = localStorage.getItem(LS_SUGGEST_DELTA_LIST)
    if (v === 'worst') {
      return 'worst'
    }
    if (v === 'best') {
      return 'best'
    }
  } catch {
    /* ignore */
  }
  return 'best'
}

function readStoredChampionPoolPrefs(): ChampionPoolPrefs {
  try {
    const raw = localStorage.getItem(LS_CHAMPION_POOL_PREFS)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: ChampionPoolPrefs = {}
    for (const [id, pref] of Object.entries(parsed)) {
      if (!/^\d+$/.test(id)) {
        continue
      }
      if (pref === 'main' || pref === 'comfortable' || pref === 'learning' || pref === 'never') {
        out[id] = pref
      }
    }
    return stripLegacyChampionPoolPlaceholder(out)
  } catch {
    return {}
  }
}

function readStoredPlayerChampionPoolProfile(): PlayerChampionPoolProfile | null {
  try {
    const raw = localStorage.getItem(LS_PLAYER_POOL_PROFILE)
    if (!raw) {
      return null
    }
    return validatePlayerChampionPoolProfile(JSON.parse(raw))
  } catch {
    return null
  }
}

function readStoredRecommendationPoolMode(): RecommendationPoolMode {
  try {
    const raw = localStorage.getItem(LS_RECOMMENDATION_POOL_MODE)
    if (raw === 'my-champs' || raw === 'all-champs') {
      return raw
    }
  } catch {
    /* ignore */
  }
  return 'all-champs'
}

type ManualPicks = {
  ally: Record<DraftRole, number | null>
  enemy: Record<DraftRole, number | null>
}

function emptyManual(): ManualPicks {
  const row = () =>
    ROLES.reduce(
      (acc, role) => {
        acc[role] = null
        return acc
      },
      {} as Record<DraftRole, number | null>
    )
  return { ally: row(), enemy: row() }
}

function buildManualSnapshot(
  m: ManualPicks,
  idToName: ReadonlyMap<number, string>,
  selectedRole: DraftRole
): DraftSnapshot {
  const localRole = ROLES.includes(selectedRole) ? selectedRole : 'middle'
  const localCellId = ROLES.indexOf(localRole)
  const slot = (side: 'ally' | 'enemy', role: DraftRole) => {
    const rawId = side === 'ally' ? m.ally[role] : m.enemy[role]
    const id = rawId != null && Number.isFinite(rawId) && rawId > 0 ? rawId : null
    const roleIndex = ROLES.indexOf(role)
    return {
      role,
      championId: id,
      championName: id != null ? idToName.get(id) ?? resolveChampionName(id, idToName) : null,
      cellId: side === 'ally' ? roleIndex : roleIndex + 5
    }
  }
  return {
    ally: ROLES.map((r) => slot('ally', r)),
    enemy: ROLES.map((r) => slot('enemy', r)),
    myTeam: '100',
    myRole: localRole,
    localPlayerCellId: localCellId,
    bans: null,
    myPickOrder: null
  }
}

const defaultOverlayEnginePrefs: OverlayEnginePrefs = {
  roleOverride: null,
  sortByOverride: null,
  monteCarloOverride: null,
  deltaListModeOverride: null
}

function lcuUiStatus(lcu: LcuChampSelectResult | null): NonNullable<DraftUpdate['lcuStatus']> {
  if (lcu == null) {
    return 'unknown'
  }
  if (lcu.lcuReachable) {
    return 'ready'
  }
  return 'waiting'
}

function isBenignLcuWaitingError(error: string | null): boolean {
  if (!error) {
    return true
  }
  return /lockfile not found|econnrefused|econnreset|socket|timeout|connect/i.test(error)
}

function copyLcuStatusLine(lcu: LcuChampSelectResult | null): string {
  if (lcu == null) {
    return 'Waiting for League client status...'
  }
  if (lcu.lcuReachable) {
    return lcu.snapshot ? 'League client ready; draft data is live.' : 'League client ready; waiting for champ select.'
  }
  if (lcu.lockfileFound && isBenignLcuWaitingError(lcu.error)) {
    return 'League client detected; waiting for it to finish loading.'
  }
  if (!lcu.lockfileFound && isBenignLcuWaitingError(lcu.error)) {
    return 'Waiting for League client to start.'
  }
  return 'League client detected; waiting for a clean LCU response.'
}

function displayLcuError(lcu: LcuChampSelectResult | null): string | null {
  if (!lcu?.error) {
    return null
  }
  if (!lcu.lcuReachable && isBenignLcuWaitingError(lcu.error)) {
    return null
  }
  return lcu.error
}

function appUpdateStatusLine(status: AppUpdateStatus | null): string {
  if (!status) {
    return 'Update checker ready.'
  }
  if (status.state === 'downloading') {
    return `${status.message} ${status.percent.toFixed(0)}%`
  }
  return status.message
}

export function MainShell() {
  const [ddVersion, setDdVersion] = useState<string | null>(null)
  const [champions, setChampions] = useState<ChampionLite[]>([])
  const [nameById, setNameById] = useState(() => new Map<number, string>())

  const [lcu, setLcu] = useState<LcuChampSelectResult | null>(null)
  const [useManual, setUseManual] = useState(false)
  const [manual, setManual] = useState<ManualPicks>(emptyManual)

  const [myRole] = useState<DraftRole>(readStoredMyRole)
  const [suggestMcRollouts, setSuggestMcRollouts] = useState(readStoredMcRollouts)
  const [suggestDeltaListMode, setSuggestDeltaListMode] = useState<DraftDeltaListMode>(readStoredSuggestDeltaListMode)
  const [championPoolPrefs, setChampionPoolPrefs] = useState<ChampionPoolPrefs>(readStoredChampionPoolPrefs)
  const [playerPoolProfile, setPlayerPoolProfile] = useState<PlayerChampionPoolProfile | null>(
    readStoredPlayerChampionPoolProfile
  )
  const [recommendationPoolMode, setRecommendationPoolMode] = useState<RecommendationPoolMode>(
    readStoredRecommendationPoolMode
  )
  const [playerPoolStatus, setPlayerPoolStatus] = useState<string | null>(null)
  const [playerPoolBusy, setPlayerPoolBusy] = useState(false)
  const [overlayEnginePrefs, setOverlayEnginePrefs] = useState<OverlayEnginePrefs>(() => ({
    ...defaultOverlayEnginePrefs
  }))

  const [trainedEffects, setTrainedEffects] = useState<CompiledTrainedEffects | null>(null)
  const [liveDataRevision, setLiveDataRevision] = useState(0)
  const [liveDataStatus, setLiveDataStatus] = useState<LivePublicDataRefreshStatus | null>(null)
  const [appUpdateStatus, setAppUpdateStatus] = useState<AppUpdateStatus | null>(null)
  const [appUpdateBusy, setAppUpdateBusy] = useState(false)

  const effectiveMyRole: DraftRole = useMemo(() => {
    if (lcu?.snapshot?.myRole && lcu.snapshot.myRole !== 'unknown') {
      return lcu.snapshot.myRole
    }
    return myRole
  }, [myRole, lcu])

  const suggestionRoleLine = useMemo(() => {
    if (lcu?.snapshot?.myRole && lcu.snapshot.myRole !== 'unknown') {
      return 'Using League client role automatically.'
    }
    return 'League did not report a role yet — using the saved fallback until champ select reports it.'
  }, [lcu])

  useEffect(() => {
    return window.drafter.onOverlayEnginePrefs((patch: OverlayEnginePrefsPatch) => {
      if (!isOverlayEnginePrefsPatch(patch)) {
        return
      }
      setOverlayEnginePrefs((prev) => ({
        roleOverride: null,
        sortByOverride: patch.sortByOverride !== undefined ? patch.sortByOverride : prev.sortByOverride,
        monteCarloOverride:
          patch.monteCarloOverride !== undefined ? patch.monteCarloOverride : prev.monteCarloOverride,
        deltaListModeOverride:
          patch.deltaListModeOverride !== undefined ? patch.deltaListModeOverride : prev.deltaListModeOverride
      }))
    })
  }, [])

  useEffect(() => {
    return window.drafter.onOverlayPlayerChampionPoolImported((result) => {
      if (!result.ok) {
        return
      }
      setPlayerPoolProfile(result.profile)
      setRecommendationPoolMode('my-champs')
      setPlayerPoolStatus(`Imported ${result.profile.entries.length} mastery champs from overlay.`)
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_MY_ROLE, myRole)
    } catch {
      /* ignore */
    }
  }, [myRole])

  useEffect(() => {
    try {
      localStorage.setItem(LS_SUGGEST_MC, String(suggestMcRollouts))
    } catch {
      /* ignore */
    }
  }, [suggestMcRollouts])

  useEffect(() => {
    try {
      localStorage.setItem(LS_SUGGEST_DELTA_LIST, suggestDeltaListMode)
    } catch {
      /* ignore */
    }
  }, [suggestDeltaListMode])

  useEffect(() => {
    try {
      localStorage.setItem(LS_CHAMPION_POOL_PREFS, JSON.stringify(championPoolPrefs))
    } catch {
      /* ignore */
    }
  }, [championPoolPrefs])

  useEffect(() => {
    try {
      if (playerPoolProfile) {
        localStorage.setItem(LS_PLAYER_POOL_PROFILE, JSON.stringify(playerPoolProfile))
      } else {
        localStorage.removeItem(LS_PLAYER_POOL_PROFILE)
      }
    } catch {
      /* ignore */
    }
  }, [playerPoolProfile])

  useEffect(() => {
    try {
      localStorage.setItem(LS_RECOMMENDATION_POOL_MODE, recommendationPoolMode)
    } catch {
      /* ignore */
    }
  }, [recommendationPoolMode])

  const lcuSnapshotNamed = useMemo(() => {
    if (!lcu?.snapshot) {
      return null
    }
    return applyChampionNames(lcu.snapshot, nameById)
  }, [lcu, nameById])

  const manualSnapshot = useMemo(
    () => buildManualSnapshot(manual, nameById, myRole),
    [manual, nameById, myRole]
  )

  const { activeSnapshot, draftSource } = useMemo((): {
    activeSnapshot: DraftSnapshot | null
    draftSource: DraftSource
  } => {
    if (useManual && manualSnapshot) {
      return { activeSnapshot: manualSnapshot, draftSource: 'manual' }
    }
    if (lcu?.lcuReachable && lcuSnapshotNamed) {
      return { activeSnapshot: lcuSnapshotNamed, draftSource: 'lcu' }
    }
    return { activeSnapshot: null, draftSource: 'none' }
  }, [useManual, manualSnapshot, lcu, lcuSnapshotNamed])

  const roleForSuggestions = useMemo((): DraftRole => {
    if (effectiveMyRole !== 'unknown') {
      return effectiveMyRole
    }
    return myRole
  }, [effectiveMyRole, myRole])

  const sortForSuggestions = 'delta' as const

  const deltaListForSuggestions = useMemo((): DraftDeltaListMode => {
    return overlayEnginePrefs.deltaListModeOverride ?? suggestDeltaListMode
  }, [overlayEnginePrefs.deltaListModeOverride, suggestDeltaListMode])

  const mcForSuggestions = useMemo(
    () =>
      overlayEnginePrefs.monteCarloOverride != null
        ? overlayEnginePrefs.monteCarloOverride
        : suggestMcRollouts,
    [overlayEnginePrefs.monteCarloOverride, suggestMcRollouts]
  )

  const overlayEngineEcho = useMemo((): OverlayEngineEcho => {
    return {
      roleOverride: overlayEnginePrefs.roleOverride,
      sortByOverride: overlayEnginePrefs.sortByOverride,
      monteCarloOverride: overlayEnginePrefs.monteCarloOverride,
      deltaListModeOverride: overlayEnginePrefs.deltaListModeOverride,
      resolvedRole: roleForSuggestions,
      resolvedSortBy: sortForSuggestions,
      resolvedMonteCarlo: mcForSuggestions,
      resolvedDeltaListMode: deltaListForSuggestions
    }
  }, [overlayEnginePrefs, roleForSuggestions, sortForSuggestions, mcForSuggestions, deltaListForSuggestions])

  const boardSignature = useMemo((): string => {
    if (!activeSnapshot) {
      return ''
    }
    return draftBoardSignature(activeSnapshot, roleForSuggestions, {
      mcRollouts: mcForSuggestions,
      sortBy: sortForSuggestions,
      deltaListMode: deltaListForSuggestions
    })
  }, [activeSnapshot, roleForSuggestions, mcForSuggestions, sortForSuggestions, deltaListForSuggestions])

  const championMetaById = useMemo((): ReadonlyMap<number, { tags: string[]; partype: string }> | null => {
    if (champions.length === 0) {
      return null
    }
    return new Map(champions.map((c) => [c.id, { tags: c.tags, partype: c.partype }]))
  }, [champions])

  const championsSearch = useMemo((): { id: number; name: string; key: string; tags: string[]; partype: string }[] | null => {
    if (champions.length === 0) {
      return null
    }
    return champions
      .map((c) => ({ id: c.id, name: c.name, key: c.key, tags: c.tags, partype: c.partype }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [champions])

  const importedChampionPoolPrefs = useMemo(() => importedProfileToPreferences(playerPoolProfile), [playerPoolProfile])
  const effectiveChampionPoolPrefs = useMemo(
    () => mergeChampionPoolPreferences(importedChampionPoolPrefs, championPoolPrefs),
    [importedChampionPoolPrefs, championPoolPrefs]
  )

  const championPoolPreferenceMap = useMemo((): ReadonlyMap<number, ChampionPoolPreference> => {
    return new Map(
      Object.entries(effectiveChampionPoolPrefs).map(([id, pref]) => [Number(id), pref] as const)
    )
  }, [effectiveChampionPoolPrefs])

  const comfortByChampionId = useMemo((): ReadonlyMap<number, number> => {
    return new Map(
      Object.entries(effectiveChampionPoolPrefs).map(([id, pref]) => [Number(id), championPoolPreferenceToComfort(pref)] as const)
    )
  }, [effectiveChampionPoolPrefs])

  const candidateChampionIds = useMemo(
    () => (recommendationPoolMode === 'my-champs' ? championIdsForMyPool(effectiveChampionPoolPrefs) : null),
    [recommendationPoolMode, effectiveChampionPoolPrefs]
  )

  const { suggestions, patchLabel } = useMemo(() => {
    if (!activeSnapshot) {
      return { suggestions: [], patchLabel: ENGINE_V1_LABEL }
    }
    const rngSeed = fnv1a32(boardSignature)
    return suggestPicks({
      myRole: roleForSuggestions,
      snapshot: activeSnapshot,
      idToName: nameById,
      maxResults: SUGGESTION_RESULT_LIMIT,
      dataDragonVersion: ddVersion,
      monteCarloSamples: mcForSuggestions,
      rngSeed,
      championMetaById,
      trainedEffects,
      comfortByChampionId,
      candidateChampionIds,
      sortBy: sortForSuggestions,
      deltaListMode: deltaListForSuggestions
    })
  }, [
    activeSnapshot,
    roleForSuggestions,
    nameById,
    ddVersion,
    mcForSuggestions,
    sortForSuggestions,
    deltaListForSuggestions,
    boardSignature,
    championMetaById,
    trainedEffects,
    comfortByChampionId,
    candidateChampionIds,
    liveDataRevision
  ])

  const enemyRoleInference = useMemo(() => {
    return activeSnapshot ? inferEnemyRoleAssignments(activeSnapshot) : null
  }, [activeSnapshot, liveDataRevision])

  const draftIntel = useMemo(() => {
    return buildDraftIntel({
      snapshot: activeSnapshot,
      myRole: roleForSuggestions,
      suggestions,
      idToName: nameById,
      championMetaById,
      enemyRoleInference,
      patchLabel,
      dataDragonVersion: ddVersion,
      championPoolPreferences: championPoolPreferenceMap
    })
  }, [
    activeSnapshot,
    roleForSuggestions,
    suggestions,
    nameById,
    championMetaById,
    enemyRoleInference,
    patchLabel,
    ddVersion,
    championPoolPreferenceMap,
    liveDataRevision
  ])

  const importPlayerChampionPool = useCallback(async (riotId: string, platform: RiotPlatform) => {
    const trimmed = riotId.trim()
    if (!trimmed) {
      setPlayerPoolStatus('Enter a Riot ID like GameName#TagLine.')
      return
    }
    setPlayerPoolBusy(true)
    setPlayerPoolStatus('Importing Riot mastery...')
    try {
      const result = await window.drafter.getPlayerChampionPool({ riotId: trimmed, platform, count: 20 })
      if (!result.ok) {
        setPlayerPoolStatus(result.error)
        return
      }
      setPlayerPoolProfile(result.profile)
      setRecommendationPoolMode('my-champs')
      setPlayerPoolStatus(`Imported ${result.profile.entries.length} mastery champs.`)
    } catch (error) {
      setPlayerPoolStatus(error instanceof Error ? error.message : 'Riot import failed. Try again shortly.')
    } finally {
      setPlayerPoolBusy(false)
    }
  }, [])

  const banChampionNames = useMemo((): (string | null)[] | null => {
    const ids = activeSnapshot?.bans
    if (!ids || ids.length === 0) {
      return null
    }
    return ids.map((id) => nameById.get(id) ?? resolveChampionName(id, nameById))
  }, [activeSnapshot?.bans, nameById])

  const lcuStatus = lcuUiStatus(lcu)
  const lcuStatusLine = copyLcuStatusLine(lcu)
  const lcuError = displayLcuError(lcu)

  useEffect(() => {
    const payload: DraftUpdate = {
      source: draftSource,
      lcuConnected: lcu?.lcuReachable ?? false,
      lcuStatus,
      snapshot: activeSnapshot,
      suggestions,
      geminiNarration: null,
      dataDragonVersion: ddVersion,
      patchLabel: patchLabel ?? ENGINE_V1_LABEL,
      error: lcuError,
      updatedAt: new Date().toISOString(),
      suggestionMyRole: roleForSuggestions,
      banChampionNames,
      enemyRoleInference,
      draftIntel,
      boardSignature: boardSignature || null,
      championsSearch,
      trainedEffectsStatus: trainedEffects ? trainedEffects.status : null,
      overlayEngineEcho
    }
    void window.drafter.publishDraft(sanitizeDraftUpdateForIpc(payload))
  }, [
    draftSource,
    lcu,
    lcuStatus,
    lcuError,
    activeSnapshot,
    suggestions,
    ddVersion,
    patchLabel,
    roleForSuggestions,
    banChampionNames,
    enemyRoleInference,
    draftIntel,
    boardSignature,
    championsSearch,
    trainedEffects,
    overlayEngineEcho
  ])

  useEffect(() => {
    return window.drafter.onLcuChampSelect((r) => {
      setLcu(r)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const applyLoad = (
      load:
        | { ok: true; path: string; raw: unknown }
        | { ok: false; path: string; error: string }
    ) => {
      if (cancelled) {
        return
      }
      if (!load.ok) {
        setTrainedEffects(null)
        return
      }
      const compiled = compileTrainedEffects(load.raw)
      if (!compiled) {
        setTrainedEffects(null)
        return
      }
      setTrainedEffects(compiled)
    }
    void window.drafter
      .getTrainedEffects()
      .then(applyLoad)
      .catch(() => {
        if (cancelled) {
          return
        }
        setTrainedEffects(null)
      })
    const un = window.drafter.onTrainedEffectsUpdate(applyLoad)
    return () => {
      cancelled = true
      un()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const status = await refreshLivePublicData()
      if (cancelled) {
        return
      }
      setLiveDataStatus(status)
      if (status.ok && status.applied) {
        setLiveDataRevision((revision) => revision + 1)
      }
    }
    void refresh()
    const timer = window.setInterval(() => {
      void refresh()
    }, LIVE_META_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    return window.drafter.onAppUpdateStatus((status) => {
      setAppUpdateStatus(status)
      setAppUpdateBusy(status.state === 'checking' || status.state === 'downloading')
    })
  }, [])

  const checkForAppUpdate = useCallback(async () => {
    setAppUpdateBusy(true)
    try {
      const result = await window.drafter.checkForAppUpdate()
      setAppUpdateStatus(result.status)
    } finally {
      setAppUpdateBusy(false)
    }
  }, [])

  const downloadAppUpdate = useCallback(async () => {
    setAppUpdateBusy(true)
    try {
      const result = await window.drafter.downloadAppUpdate()
      setAppUpdateStatus(result.status)
    } finally {
      setAppUpdateBusy(false)
    }
  }, [])

  const installAppUpdate = useCallback(async () => {
    await window.drafter.quitAndInstallAppUpdate()
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const v = await getLatestDDragonVersion()
        setDdVersion(v)
        const { champions: ch } = await loadChampionMaps(v)
        setChampions(ch)
        const idMap = new Map(ch.map((c) => [c.id, c.name] as const))
        setNameById(idMap)
      } catch {
        setDdVersion('(unavailable)')
      }
    })()
  }, [])

  const [nexusNav, setNexusNav] = useState<NexusNavId>('home')
  const [routeDir, setRouteDir] = useState(1)

  const goNav = useCallback(
    (id: NexusNavId) => {
      if (id === nexusNav) {
        return
      }
      setRouteDir(NAV_ORDER[id] > NAV_ORDER[nexusNav] ? 1 : -1)
      setNexusNav(id)
    },
    [nexusNav]
  )

  const topBar = {
    runnerId: 'NEXUS//LOCAL',
    region: 'AMERICAS',
    dataVersion: ddVersion && ddVersion[0] !== '(' ? ddVersion : '—',
    build: '3.11.0',
    networkStatus: lcuStatus === 'ready' ? 'On' : 'Wait',
    link: lcuStatus === 'ready' ? 'League: ready' : 'League: waiting',
    resourceLine: `Picks from: ${copyDraftSource(draftSource)} · Suggestions: ${patchLabel ?? ENGINE_V1_LABEL} · ${livePublicDataStatusLine(liveDataStatus)}`,
    onMinimizeApp: () => {
      void window.drafter.minimizeApp()
    },
    onCloseApp: () => {
      void window.drafter.closeApp()
    }
  } as const

  const draftModelDescription = useMemo(() => {
    const model = patchLabel ?? ENGINE_V1_LABEL
    const trainedOn = model.includes('+trained') || Boolean(trainedEffects?.status.hasAnyData)
    const dataLine = trainedOn ? 'trained + bundled fallback' : 'bundled heuristics'
    const liveLine = livePublicDataStatusLine(liveDataStatus)
    const sortLine = `delta: ${suggestDeltaListMode === 'worst' ? 'worst first' : 'best first'}`
    if (suggestMcRollouts <= 0) {
      return `${model} - V1 only. Sort: ${sortLine}. Data: ${dataLine}. ${liveLine}.`
    }
    return `${model} - V1 + ${suggestMcRollouts} rollout(s). Sort: ${sortLine}. Data: ${dataLine}. ${liveLine}.`
  }, [patchLabel, suggestMcRollouts, suggestDeltaListMode, trainedEffects, liveDataStatus])

  const rightCol = {
    lcuState: lcuStatusLine,
    draftSource,
    hasDraftBoard: activeSnapshot != null,
    modelLabel: patchLabel ?? ENGINE_V1_LABEL,
    queueLine: activeSnapshot
      ? `You’re on ${String(roleForSuggestions)} — pick ideas are on.`
      : 'Get into champ select or type a board to see pick ideas here.'
  }

  const bottomBar = {
    primaryLabel:
      nexusNav === 'home' ? 'OPEN DRAFT' : nexusNav === 'settings' ? 'BACK TO HOME' : 'HOME',
    onPrimary: () => {
      if (nexusNav === 'home') {
        goNav('operations')
      } else {
        goNav('home')
      }
    },
    secondaryLabel: nexusNav === 'operations' ? 'Toggle overlay' : undefined,
    onSecondary:
      nexusNav === 'operations'
        ? () => {
            void window.drafter.toggleOverlay()
          }
        : undefined,
    statusLine: copyBottomStatusStrip({
      lcu,
      dataVersion: topBar.dataVersion,
      source: draftSource
    }),
    platform: 'NEXUS//DRAFT'
  }

  return (
    <NexusClientLayout
      nav={nexusNav}
      onNavigate={goNav}
      top={topBar}
      right={rightCol}
      bottom={bottomBar}
    >
      <AnimatePresence mode="wait" initial={false}>
        {nexusNav === 'home' && (
          <NexusRoutePanel key="home" direction={routeDir} className="w-full min-h-0 min-w-0">
            <NexusHomeDashboard
              ddragonVersion={ddVersion && ddVersion[0] !== '(' ? ddVersion : '—'}
              patchLabel={patchLabel ?? ENGINE_V1_LABEL}
              onEnterOperations={() => goNav('operations')}
            />
          </NexusRoutePanel>
        )}

        {nexusNav === 'operations' && (
          <NexusRoutePanel key="operations" direction={routeDir} className="w-full min-h-0 min-w-0">
            <NexusOperationsView
              lcuStatusLine={lcuStatusLine}
              lcuError={lcuError}
              draftSource={draftSource}
              useManual={useManual}
              onUseManual={setUseManual}
              effectiveMyRole={effectiveMyRole}
              suggestionRoleLine={suggestionRoleLine}
              manual={manual}
              onManualAlly={(role, id) => {
                setManual((m) => ({ ...m, ally: { ...m.ally, [role]: id } }))
              }}
              onManualEnemy={(role, id) => {
                setManual((m) => ({ ...m, enemy: { ...m.enemy, [role]: id } }))
              }}
              champions={champions}
              modelDescription={draftModelDescription}
              suggestMcRollouts={suggestMcRollouts}
              maxSuggestMcRollouts={MAX_SUGGEST_MC}
              onSuggestMcRollouts={(n) => {
                setSuggestMcRollouts(Math.max(0, Math.min(MAX_SUGGEST_MC, Math.trunc(n))))
              }}
              suggestDeltaListMode={suggestDeltaListMode}
              onSuggestDeltaListMode={setSuggestDeltaListMode}
              suggestions={suggestions}
              ddragonVersion={ddVersion && ddVersion[0] !== '(' ? ddVersion : null}
              enemyRoleInference={enemyRoleInference}
              draftIntel={draftIntel}
              appUpdateStatusLine={appUpdateStatusLine(appUpdateStatus)}
              appUpdateBusy={appUpdateBusy}
              appUpdateAvailable={appUpdateStatus?.state === 'available'}
              appUpdateReady={appUpdateStatus?.state === 'downloaded'}
              onCheckAppUpdate={checkForAppUpdate}
              onDownloadAppUpdate={downloadAppUpdate}
              onInstallAppUpdate={installAppUpdate}
              playerPoolProfile={playerPoolProfile}
              playerPoolStatus={playerPoolStatus}
              playerPoolBusy={playerPoolBusy}
              recommendationPoolMode={recommendationPoolMode}
              onRecommendationPoolMode={setRecommendationPoolMode}
              onImportPlayerChampionPool={importPlayerChampionPool}
              championPoolPreferences={championPoolPrefs}
              onChampionPoolPreference={(championId, pref) => {
                setChampionPoolPrefs((prev) => {
                  const next = { ...prev }
                  if (pref == null) {
                    delete next[String(championId)]
                  } else {
                    next[String(championId)] = pref
                  }
                  return next
                })
              }}
              onToggleOverlay={async () => {
                await window.drafter.toggleOverlay()
              }}
            />
          </NexusRoutePanel>
        )}

        {nexusNav === 'settings' && (
          <NexusRoutePanel key="settings" direction={routeDir} className="w-full min-h-0 min-w-0">
            <NexusStubView />
          </NexusRoutePanel>
        )}
      </AnimatePresence>
    </NexusClientLayout>
  )
}
