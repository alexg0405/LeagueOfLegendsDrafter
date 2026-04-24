import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { getLatestDDragonVersion, loadChampionMaps, type ChampionLite } from '@shared/dataDragon'
import {
  applyChampionNames,
  compileTrainedEffects,
  draftBoardSignature,
  ENGINE_V1_LABEL,
  isOverlayEnginePrefsPatch,
  resolveChampionName,
  sanitizeDraftUpdateForIpc,
  suggestPicks,
  type CompiledTrainedEffects,
  type DraftDeltaListMode,
  type DraftRole,
  type DraftSnapshot,
  type DraftSource,
  type DraftUpdate,
  type LcuChampSelectResult,
  type OverlayEngineEcho,
  type OverlayEnginePrefs,
  type OverlayEnginePrefsPatch
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
import { copyBottomStatusStrip, copyDraftSource } from './nexus-ui/nexusCopy'

const ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']
const CAPTURE_LIST_REFRESH_MS = 4000
const LS_SUGGEST_OVERRIDE = 'nexusdraft.v1.suggestOverride'
const LS_MY_ROLE = 'nexusdraft.v1.myRole'
const LS_SUGGEST_MC = 'nexusdraft.v1.suggestMcRollouts'
const LS_SUGGEST_SORT = 'nexusdraft.v1.suggestSortBy'
const LS_SUGGEST_DELTA_LIST = 'nexusdraft.v1.suggestDeltaListMode'
const DEFAULT_SUGGEST_MC = 10
const MAX_SUGGEST_MC = 200

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

function readStoredSuggestOverride(): boolean {
  try {
    const v = localStorage.getItem(LS_SUGGEST_OVERRIDE)
    if (v === '1') {
      return true
    }
    if (v === '0') {
      return false
    }
  } catch {
    /* ignore */
  }
  return false
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

function readStoredSuggestSortBy(): 'score' | 'delta' {
  try {
    const v = localStorage.getItem(LS_SUGGEST_SORT)
    if (v === 'delta') {
      return 'delta'
    }
    if (v === 'score') {
      return 'score'
    }
  } catch {
    /* ignore */
  }
  return 'score'
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

function buildManualSnapshot(m: ManualPicks, idToName: ReadonlyMap<number, string>): DraftSnapshot {
  const slot = (side: 'ally' | 'enemy', role: DraftRole) => {
    const id = side === 'ally' ? m.ally[role] : m.enemy[role]
    return {
      role,
      championId: id,
      championName: id != null ? idToName.get(id) ?? resolveChampionName(id, idToName) : null,
      cellId: null
    }
  }
  return {
    ally: ROLES.map((r) => slot('ally', r)),
    enemy: ROLES.map((r) => slot('enemy', r)),
    myTeam: null,
    myRole: null,
    localPlayerCellId: null,
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

export function MainShell() {
  const [ddVersion, setDdVersion] = useState<string | null>(null)
  const [champions, setChampions] = useState<ChampionLite[]>([])
  const [nameById, setNameById] = useState(() => new Map<number, string>())

  const [lcu, setLcu] = useState<LcuChampSelectResult | null>(null)
  const [useManual, setUseManual] = useState(false)
  const [manual, setManual] = useState<ManualPicks>(emptyManual)
  const [visionSnapshot, setVisionSnapshot] = useState<DraftSnapshot | null>(null)
  const [visionText, setVisionText] = useState<string | null>(null)
  const [visionConf, setVisionConf] = useState<string | null>(null)

  const [myRole, setMyRole] = useState<DraftRole>(readStoredMyRole)
  const [suggestOverride, setSuggestOverride] = useState(readStoredSuggestOverride)
  const [suggestMcRollouts, setSuggestMcRollouts] = useState(readStoredMcRollouts)
  const [suggestSortBy, setSuggestSortBy] = useState<'score' | 'delta'>(readStoredSuggestSortBy)
  const [suggestDeltaListMode, setSuggestDeltaListMode] = useState<DraftDeltaListMode>(readStoredSuggestDeltaListMode)
  const [overlayEnginePrefs, setOverlayEnginePrefs] = useState<OverlayEnginePrefs>(() => ({
    ...defaultOverlayEnginePrefs
  }))

  const [sources, setSources] = useState<
    Array<{ id: string; name: string; display_id?: string; thumbnailDataUrl: string | null }>
  >([])
  const [err, setErr] = useState<string | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trainedEffects, setTrainedEffects] = useState<CompiledTrainedEffects | null>(null)
  const previewRef = useRef<HTMLCanvasElement | null>(null)

  const effectiveMyRole: DraftRole = useMemo(() => {
    if (suggestOverride) {
      return myRole
    }
    if (lcu?.snapshot?.myRole && lcu.snapshot.myRole !== 'unknown') {
      return lcu.snapshot.myRole
    }
    if (visionSnapshot?.myRole && visionSnapshot.myRole !== 'unknown') {
      return visionSnapshot.myRole
    }
    return myRole
  }, [suggestOverride, myRole, lcu, visionSnapshot])

  const suggestionRoleLine = useMemo(() => {
    if (suggestOverride) {
      return 'Using your pick below — the model only suggests champs in that role pool.'
    }
    if (lcu?.snapshot?.myRole && lcu.snapshot.myRole !== 'unknown') {
      return 'Using League client role. Turn on “I pick my role” to force a role and its champion list.'
    }
    if (visionSnapshot?.myRole && visionSnapshot.myRole !== 'unknown') {
      return 'Using screen-vision role. Turn on “I pick my role” if it is wrong.'
    }
    return 'League/vision did not report a role — using your pick below as fallback.'
  }, [suggestOverride, lcu, visionSnapshot])

  useEffect(() => {
    return window.drafter.onOverlayEnginePrefs((patch: OverlayEnginePrefsPatch) => {
      if (!isOverlayEnginePrefsPatch(patch)) {
        return
      }
      setOverlayEnginePrefs((prev) => ({
        roleOverride: patch.roleOverride !== undefined ? patch.roleOverride : prev.roleOverride,
        sortByOverride: patch.sortByOverride !== undefined ? patch.sortByOverride : prev.sortByOverride,
        monteCarloOverride:
          patch.monteCarloOverride !== undefined ? patch.monteCarloOverride : prev.monteCarloOverride,
        deltaListModeOverride:
          patch.deltaListModeOverride !== undefined ? patch.deltaListModeOverride : prev.deltaListModeOverride
      }))
    })
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LS_SUGGEST_OVERRIDE, suggestOverride ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [suggestOverride])

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
      localStorage.setItem(LS_SUGGEST_SORT, suggestSortBy)
    } catch {
      /* ignore */
    }
  }, [suggestSortBy])

  useEffect(() => {
    try {
      localStorage.setItem(LS_SUGGEST_DELTA_LIST, suggestDeltaListMode)
    } catch {
      /* ignore */
    }
  }, [suggestDeltaListMode])

  const lcuSnapshotNamed = useMemo(() => {
    if (!lcu?.snapshot) {
      return null
    }
    return applyChampionNames(lcu.snapshot, nameById)
  }, [lcu, nameById])

  const manualSnapshot = useMemo(
    () => buildManualSnapshot(manual, nameById),
    [manual, nameById]
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
    if (visionSnapshot) {
      return { activeSnapshot: visionSnapshot, draftSource: 'vision' }
    }
    return { activeSnapshot: null, draftSource: 'none' }
  }, [useManual, manualSnapshot, lcu, lcuSnapshotNamed, visionSnapshot])

  const roleForSuggestions = useMemo((): DraftRole => {
    if (overlayEnginePrefs.roleOverride != null) {
      return overlayEnginePrefs.roleOverride
    }
    if (effectiveMyRole !== 'unknown') {
      return effectiveMyRole
    }
    return myRole
  }, [overlayEnginePrefs.roleOverride, effectiveMyRole, myRole])

  const sortForSuggestions = useMemo(
    () => overlayEnginePrefs.sortByOverride ?? suggestSortBy,
    [overlayEnginePrefs.sortByOverride, suggestSortBy]
  )

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

  const championsSearch = useMemo((): { id: number; name: string; tags: string[]; partype: string }[] | null => {
    if (champions.length === 0) {
      return null
    }
    return champions
      .map((c) => ({ id: c.id, name: c.name, tags: c.tags, partype: c.partype }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [champions])

  const { suggestions, patchLabel } = useMemo(() => {
    if (!activeSnapshot) {
      return { suggestions: [], patchLabel: ENGINE_V1_LABEL }
    }
    const rngSeed = fnv1a32(boardSignature)
    return suggestPicks({
      myRole: roleForSuggestions,
      snapshot: activeSnapshot,
      idToName: nameById,
      dataDragonVersion: ddVersion,
      monteCarloSamples: mcForSuggestions,
      rngSeed,
      championMetaById,
      trainedEffects,
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
    trainedEffects
  ])

  const banChampionNames = useMemo((): (string | null)[] | null => {
    const ids = activeSnapshot?.bans
    if (!ids || ids.length === 0) {
      return null
    }
    return ids.map((id) => nameById.get(id) ?? resolveChampionName(id, nameById))
  }, [activeSnapshot?.bans, nameById])

  useEffect(() => {
    const payload: DraftUpdate = {
      source: draftSource,
      lcuConnected: lcu?.lcuReachable ?? false,
      snapshot: activeSnapshot,
      suggestions,
      geminiNarration: null,
      dataDragonVersion: ddVersion,
      patchLabel: patchLabel ?? ENGINE_V1_LABEL,
      error: lcu?.error ?? null,
      updatedAt: new Date().toISOString(),
      suggestionMyRole: roleForSuggestions,
      banChampionNames,
      boardSignature: boardSignature || null,
      championsSearch,
      trainedEffectsStatus: trainedEffects ? trainedEffects.status : null,
      overlayEngineEcho
    }
    void window.drafter.publishDraft(sanitizeDraftUpdateForIpc(payload))
  }, [
    draftSource,
    lcu,
    activeSnapshot,
    suggestions,
    ddVersion,
    patchLabel,
    roleForSuggestions,
    banChampionNames,
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
      .catch((e) => {
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

  useEffect(() => {
    void (async () => {
      try {
        const id = await window.drafter.getCaptureSourceId()
        setSelectedId(id)
      } catch {
        /* ignore */
      } finally {
        setSettingsLoaded(true)
      }
    })()
  }, [])

  const refreshCaptureSources = useCallback(async () => {
    try {
      setErr(null)
      setSources(await window.drafter.listCaptureSources())
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void refreshCaptureSources()
  }, [refreshCaptureSources])

  useEffect(() => {
    const id = window.setInterval(() => {
      void refreshCaptureSources()
    }, CAPTURE_LIST_REFRESH_MS)
    return () => {
      clearInterval(id)
    }
  }, [refreshCaptureSources])

  const lcuStatusLine = lcu
    ? lcu.lockfileFound
      ? lcu.lcuReachable
        ? 'League client API reachable (LCU).'
        : 'Lockfile found but LCU not responding — is the client fully loaded?'
      : 'League client lockfile not found — start the Riot / League client.'
    : 'Connecting…'

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
    build: '0.2.0',
    networkStatus: lcu
      ? lcu.lcuReachable
        ? 'On'
        : lcu.lockfileFound
          ? 'Wait'
          : 'Off'
      : '—',
    link: lcu?.lcuReachable
      ? 'League: ready'
      : lcu?.lockfileFound
        ? 'League: starting'
        : 'League: closed',
    resourceLine: `Picks from: ${copyDraftSource(draftSource)} · Suggestions: ${patchLabel ?? ENGINE_V1_LABEL}`,
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
    const dataLine = trainedOn
      ? 'Uses exported Riot-trained effects when available; bundled heuristics fill sparse gaps.'
      : 'Using bundled heuristics only (no trained export loaded).'
    const sortLine =
      suggestSortBy === 'delta'
        ? `winrate delta (${suggestDeltaListMode === 'worst' ? 'weakest in context first' : 'strongest in context first'})`
        : 'model score'
    if (suggestMcRollouts <= 0) {
      return `${model} — V1 blend only (base / ally / enemy / comp / comfort). Sort: ${sortLine}. Set “Monte Carlo rollouts” above 0 to re-rank on completed random boards. ${dataLine}`
    }
    return `${model} — V1 blend, then ${suggestMcRollouts} Monte Carlo rollout(s) per candidate on random completed rosters (adjust below; higher = more reactive, more CPU). Sort: ${sortLine}. ${dataLine}`
  }, [patchLabel, suggestMcRollouts, suggestSortBy, suggestDeltaListMode, trainedEffects])

  const rightCol = {
    lcuState: lcuStatusLine,
    draftSource,
    hasDraftBoard: activeSnapshot != null,
    modelLabel: patchLabel ?? ENGINE_V1_LABEL,
    queueLine: activeSnapshot
      ? `You’re on ${String(roleForSuggestions)} — pick ideas are on.`
      : 'Get into champ select, type a board, or use screen capture to see pick ideas here.'
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
              lcuStatus={lcuStatusLine}
              patchLabel={patchLabel ?? ENGINE_V1_LABEL}
              onEnterOperations={() => goNav('operations')}
            />
          </NexusRoutePanel>
        )}

        {nexusNav === 'operations' && (
          <NexusRoutePanel key="operations" direction={routeDir} className="w-full min-h-0 min-w-0">
            <NexusOperationsView
              lcuStatusLine={lcuStatusLine}
              lcuError={lcu?.error ?? null}
              draftSource={draftSource}
              useManual={useManual}
              onUseManual={setUseManual}
              suggestOverride={suggestOverride}
              onSuggestOverride={(next) => {
                if (next) {
                  const fromClient: DraftRole =
                    lcu?.snapshot?.myRole && lcu.snapshot.myRole !== 'unknown'
                      ? lcu.snapshot.myRole
                      : visionSnapshot?.myRole && visionSnapshot.myRole !== 'unknown'
                        ? visionSnapshot.myRole
                        : myRole
                  setMyRole(fromClient)
                }
                setSuggestOverride(next)
              }}
              myRole={myRole}
              onMyRole={setMyRole}
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
              suggestSortBy={suggestSortBy}
              onSuggestSortBy={setSuggestSortBy}
              suggestDeltaListMode={suggestDeltaListMode}
              onSuggestDeltaListMode={setSuggestDeltaListMode}
              suggestions={suggestions}
              err={err}
              settingsLoaded={settingsLoaded}
              onRefreshCaptureSources={() => void refreshCaptureSources()}
              sources={sources}
              selectedId={selectedId}
              onSelectSource={(id) => {
                void (async () => {
                  await window.drafter.setCaptureSourceId(id)
                  setSelectedId(id)
                })()
              }}
              previewRef={previewRef}
              visionText={visionText}
              visionConf={visionConf}
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
