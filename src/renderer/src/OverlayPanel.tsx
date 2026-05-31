import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ddragonChampionImageUrl } from '@shared/dataDragon'
import {
  ALLY_SYNERGY_BONUS,
  buildEngineState,
  buildOverlayChampionSearchPool,
  compileTrainedEffects,
  formatRuneTipNote,
  getChampionBuildProfile,
  isDraftUpdate,
  MATCHUP_BONUS,
  MEANINGFUL_TEAM_SYNERGY_DELTA,
  nameMatchesChampionQuery,
  publicMetaLaneRate,
  publicMetaCandidateIdsForRole,
  RIOT_PLATFORMS,
  ROLE_CHAMPION_POOL,
  resolveChampionName,
  shrunkLaneRate,
  trainedSynergyDelta,
  v1ComponentScores,
  type CompiledTrainedEffects,
  type DraftUpdate,
  type DraftRole,
  type RoleProbabilityMap,
  type OverlayEnginePrefsPatch,
  type RiotPlatform
} from '@shared/draft'
import { DraftItemPlanBlock as OverlayItemPlan } from './nexus-ui/DraftItemPlanBlock'
import { DraftItemMatrixView } from './nexus-ui/DraftItemMatrixView'
import {
  livePublicDataStatusLine,
  refreshLivePublicData,
  type LivePublicDataRefreshStatus
} from './livePublicDataClient'

const LIVE_META_REFRESH_MS = 30 * 60 * 1000
const OVERLAY_PLAYER_POOL_IMPORT_ENABLED = false
const OVERLAY_PLAYER_POOL_IMPORT_WIP_MESSAGE =
  'Riot mastery import is temporarily WIP. Use manual pool weights in the main window.'

const empty: DraftUpdate = {
  source: 'none',
  lcuConnected: false,
  lcuStatus: 'unknown',
  snapshot: null,
  suggestions: [],
  geminiNarration: null,
  dataDragonVersion: null,
  patchLabel: null,
  error: null,
  updatedAt: new Date(0).toISOString(),
  suggestionMyRole: null,
  boardSignature: null,
  championsSearch: null
}

function isGenericChampionName(name: string): boolean {
  return /^champion\s+\d+$/i.test(name.trim())
}

function slotName(p: { championName: string | null; championId: number | null }): string {
  if (p.championId != null && p.championId > 0) {
    if (p.championName && !isGenericChampionName(p.championName)) {
      return p.championName
    }
    return resolveChampionName(p.championId, null)
  }
  return p.championName ?? '—'
}

function SlotPortrait({
  slot,
  imageUrl,
  isMySlot = false
}: {
  slot: { championName: string | null; championId: number | null; inferenceLabel?: string | null }
  imageUrl: string | null
  isMySlot?: boolean
}) {
  const name = slotName(slot)
  const title = `${isMySlot ? `Your role: ${name}` : name}${slot.inferenceLabel ? ` · ${slot.inferenceLabel}` : ''}`
  return (
    <span
      className={[
        'inline-flex items-center justify-center border p-1',
        isMySlot
          ? 'border-sky-300 bg-sky-400/18 text-sky-100 shadow-[0_0_14px_rgba(56,189,248,0.28)]'
          : 'border-nexus-line/70 bg-nexus-bg/30'
      ].join(' ')}
      title={title}
    >
      {imageUrl ? (
        <img
          className={[
            'h-5 w-5 shrink-0 border object-cover',
            isMySlot ? 'border-sky-200 shadow-[0_0_10px_rgba(125,211,252,0.42)]' : 'border-nexus-line/70'
          ].join(' ')}
          src={imageUrl}
          alt=""
          width={20}
          height={20}
        />
      ) : (
        <span
          className={[
            'h-5 w-5 shrink-0 border',
            isMySlot ? 'border-sky-200 bg-sky-300/20 shadow-[0_0_10px_rgba(125,211,252,0.42)]' : 'border-nexus-line/70 bg-nexus-surface-2'
          ].join(' ')}
          aria-hidden
        />
      )}
    </span>
  )
}

function ContextPortrait({
  slot,
  imageUrl,
  tone
}: {
  slot: OverlaySlot
  imageUrl: string | null
  tone: 'ally' | 'enemy'
}) {
  const name = slotName(slot)
  const toneClass =
    tone === 'ally'
      ? 'border-nexus-lime/80 bg-nexus-lime/10 shadow-[0_0_8px_rgba(35,213,176,0.18)]'
      : 'border-nexus-red/80 bg-nexus-red/10 shadow-[0_0_8px_rgba(248,113,113,0.18)]'
  return (
    <span className={['inline-flex h-6 w-6 items-center justify-center border p-0.5', toneClass].join(' ')} title={name}>
      {imageUrl ? (
        <img className="h-full w-full object-cover" src={imageUrl} alt="" width={20} height={20} />
      ) : (
        <span className="h-full w-full bg-nexus-surface-2" aria-hidden />
      )}
    </span>
  )
}

function pct(v: number | undefined): string {
  return v == null ? '--' : `${(v * 100).toFixed(1)}%`
}

function signedPct(v: number | undefined): string {
  if (v == null) {
    return '--'
  }
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`
}

function fitLabel(v: number): string {
  if (v >= 0.56) {
    return 'strong'
  }
  if (v >= 0.52) {
    return 'good'
  }
  if (v >= 0.48) {
    return 'neutral'
  }
  if (v >= 0.44) {
    return 'rough'
  }
  return 'risky'
}

function fitClass(v: number): string {
  if (v >= 0.52) {
    return 'text-nexus-lime/90'
  }
  if (v >= 0.48) {
    return 'text-nexus-muted'
  }
  return 'text-nexus-red/80'
}

type OverlaySlot = { role: DraftRole; championName: string | null; championId: number | null }
type InferredOverlaySlot = OverlaySlot & {
  cellId?: number | null
  assignedRole?: DraftRole
  inferredRole?: DraftRole | null
  roleProbabilities?: RoleProbabilityMap | null
}

const ROLE_FOCUS: Record<Exclude<DraftRole, 'unknown'>, { ally: DraftRole[]; enemy: DraftRole[] }> = {
  top: {
    ally: ['jungle', 'middle', 'support', 'bottom', 'top'],
    enemy: ['top', 'jungle', 'middle', 'support', 'bottom']
  },
  jungle: {
    ally: ['middle', 'support', 'top', 'bottom', 'jungle'],
    enemy: ['jungle', 'middle', 'support', 'top', 'bottom']
  },
  middle: {
    ally: ['jungle', 'support', 'top', 'bottom', 'middle'],
    enemy: ['middle', 'jungle', 'support', 'top', 'bottom']
  },
  bottom: {
    ally: ['support', 'jungle', 'middle', 'top', 'bottom'],
    enemy: ['bottom', 'support', 'jungle', 'middle', 'top']
  },
  support: {
    ally: ['bottom', 'jungle', 'middle', 'top', 'support'],
    enemy: ['support', 'bottom', 'jungle', 'middle', 'top']
  }
}

function filledSlots<T extends OverlaySlot>(slots: T[], limit = 2): T[] {
  return slots
    .filter((p) => p.championId != null && p.championId > 0)
    .slice(0, limit)
}

function focusedSlots(
  slots: InferredOverlaySlot[],
  role: DraftRole | null,
  side: 'ally' | 'enemy',
  limit = 2
): InferredOverlaySlot[] {
  if (!role || role === 'unknown') {
    return filledSlots(slots, limit)
  }
  const preferredRoles = ROLE_FOCUS[role]?.[side] ?? []
  const filled = slots.filter((p) => p.championId != null && p.championId > 0)
  const ordered =
    side === 'enemy'
      ? [...filled].sort((a, b) => {
          const aP = a.roleProbabilities?.[role as Exclude<DraftRole, 'unknown'>] ?? (a.role === role ? 1 : 0)
          const bP = b.roleProbabilities?.[role as Exclude<DraftRole, 'unknown'>] ?? (b.role === role ? 1 : 0)
          return bP - aP
        })
      : [
          ...preferredRoles.flatMap((r) => filled.filter((slot) => slot.role === r)),
          ...filled.filter((slot) => !preferredRoles.includes(slot.role as DraftRole))
        ]
  return ordered.slice(0, limit)
}

function legacyEnemyPFromBonus(bonus: number | null): number {
  if (bonus == null) {
    return 0.5
  }
  return Math.max(0.35, Math.min(0.68, 0.5 + 0.03 * Math.max(-6, Math.min(6, bonus))))
}

function bestEnemySlotsForCandidate(candidateId: number, role: DraftRole | null, enemySlots: InferredOverlaySlot[], limit = 2): InferredOverlaySlot[] {
  const lockedEnemies = enemySlots.filter((slot) => slot.championId != null && slot.championId > 0)
  if (lockedEnemies.length === 0) {
    return []
  }
  return lockedEnemies
    .map((slot) => {
      const enemyId = slot.championId!
      const metaRate = role ? publicMetaLaneRate(role, candidateId, enemyId) : null
      const laneRate = shrunkLaneRate(candidateId, enemyId)
      const bonus = MATCHUP_BONUS[String(candidateId)]?.[String(enemyId)] ?? null
      const fallbackRate = laneRate ?? legacyEnemyPFromBonus(bonus)
      const laneP =
        role && role !== 'unknown'
          ? slot.roleProbabilities?.[role as Exclude<DraftRole, 'unknown'>] ?? (slot.role === role ? 1 : 0.2)
          : 0.2
      const score = ((metaRate ?? fallbackRate) - 0.5) * (0.35 + laneP * 0.65) + laneP * 0.03
      return { slot, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.slot)
}

function bestAllySlotsForCandidate(
  candidateId: number,
  role: DraftRole | null,
  allySlots: OverlaySlot[],
  trained: CompiledTrainedEffects | null,
  limit = 2
): OverlaySlot[] {
  const lockedAllies = allySlots.filter((slot) => slot.championId != null && slot.championId > 0)
  if (lockedAllies.length === 0) {
    return []
  }
  return lockedAllies
    .map((slot) => {
      const allyId = slot.championId!
      const heuristicBonus = ALLY_SYNERGY_BONUS[String(candidateId)]?.[String(allyId)] ?? ALLY_SYNERGY_BONUS[String(allyId)]?.[String(candidateId)] ?? 0
      const trainedDelta =
        role && slot.role !== 'unknown' ? trainedSynergyDelta(trained, role, slot.role, candidateId, allyId) : null
      const score = trainedDelta ?? heuristicBonus * 0.04
      const tie = (candidateId * 0x1f8d2f49 + allyId) >>> 0
      return { slot, score, tie }
    })
    .sort((a, b) => b.score - a.score || a.tie - b.tie)
    .slice(0, limit)
    .map((x) => x.slot)
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-mono font-bold text-sm uppercase tracking-[0.12em] text-nexus-lime/95 mb-2.5 border-b border-nexus-line pb-1.5">
      {children}
    </h3>
  )
}

function pushOverlayPrefs(patch: OverlayEnginePrefsPatch) {
  void window.drafter.setOverlayEnginePrefs(patch)
}

function inRolePool(id: number, role: DraftRole): boolean {
  if (role === 'unknown') {
    return false
  }
  const k = role as keyof typeof ROLE_CHAMPION_POOL
  return (
    (ROLE_CHAMPION_POOL[k] ?? []).includes(id) ||
    publicMetaCandidateIdsForRole(role).includes(id)
  )
}

export function OverlayPanel() {
  const [d, setD] = useState<DraftUpdate>(empty)
  const [lookupQuery, setLookupQuery] = useState('')
  const [trainedEffects, setTrainedEffects] = useState<CompiledTrainedEffects | null>(null)
  const [pickMatrixOpen, setPickMatrixOpen] = useState(false)
  const [itemMatrixOpen, setItemMatrixOpen] = useState(false)
  const [itemMatrixPlan, setItemMatrixPlan] = useState<NonNullable<DraftUpdate['draftIntel']>['matchupPlans'][number] | null>(null)
  const [riotIdInput, setRiotIdInput] = useState('')
  const [riotPlatform, setRiotPlatform] = useState<RiotPlatform>('na1')
  const [playerPoolBusy, setPlayerPoolBusy] = useState(false)
  const [playerPoolStatus, setPlayerPoolStatus] = useState<string | null>(
    OVERLAY_PLAYER_POOL_IMPORT_ENABLED ? null : OVERLAY_PLAYER_POOL_IMPORT_WIP_MESSAGE
  )
  const [, setLiveDataRevision] = useState(0)
  const [liveDataStatus, setLiveDataStatus] = useState<LivePublicDataRefreshStatus | null>(null)

  useEffect(() => {
    const un = window.drafter.onDraftUpdate((p) => {
      if (isDraftUpdate(p)) {
        setD(p)
      }
    })
    return un
  }, [])

  useEffect(() => {
    pushOverlayPrefs({ roleOverride: null })
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
      setTrainedEffects(compileTrainedEffects(load.raw))
    }
    void window.drafter
      .getTrainedEffects()
      .then(applyLoad)
      .catch(() => {
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
    if (!pickMatrixOpen && !itemMatrixOpen) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPickMatrixOpen(false)
        setItemMatrixOpen(false)
        setItemMatrixPlan(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickMatrixOpen, itemMatrixOpen])

  useEffect(() => {
    void window.drafter.setOverlayProjectionMode(pickMatrixOpen || itemMatrixOpen).catch(() => {
      /* overlay may be closing */
    })
  }, [pickMatrixOpen, itemMatrixOpen])

  useEffect(() => {
    return () => {
      void window.drafter.setOverlayProjectionMode(false).catch(() => {
        /* overlay may be closing */
      })
    }
  }, [])

  const importPlayerChampionPool = async () => {
    if (!OVERLAY_PLAYER_POOL_IMPORT_ENABLED) {
      setPlayerPoolStatus(OVERLAY_PLAYER_POOL_IMPORT_WIP_MESSAGE)
      return
    }
    const riotId = riotIdInput.trim()
    if (!riotId) {
      setPlayerPoolStatus('Enter Riot ID: GameName#TagLine.')
      return
    }
    setPlayerPoolBusy(true)
    setPlayerPoolStatus('Importing mastery...')
    try {
      const result = await window.drafter.importPlayerChampionPoolFromOverlay({
        riotId,
        platform: riotPlatform,
        count: 20
      })
      if (!result.ok) {
        setPlayerPoolStatus(result.error)
        return
      }
      setRiotIdInput(result.profile.riotId)
      setRiotPlatform(result.profile.platform)
      setPlayerPoolStatus(`Imported ${result.profile.entries.length} champs. My Champs is active.`)
    } catch (error) {
      setPlayerPoolStatus(error instanceof Error ? error.message : 'Riot import failed.')
    } finally {
      setPlayerPoolBusy(false)
    }
  }

  const s = d.snapshot
  const topPicks = d.suggestions.slice(0, 6)
  const echo = d.overlayEngineEcho
  const resolvedMc = echo?.resolvedMonteCarlo ?? 0
  const resolvedDeltaList = echo?.resolvedDeltaListMode ?? 'best'
  const mcFollowsMain = echo?.monteCarloOverride == null
  const rolloutsOffActive = echo?.monteCarloOverride === 0 || (mcFollowsMain && resolvedMc === 0)
  const rolloutsMainActive = mcFollowsMain && resolvedMc > 0
  const lcuUi = d.lcuStatus ?? (d.lcuConnected ? 'ready' : 'waiting')
  const lcuLabel = lcuUi === 'ready' ? 'LCU on' : 'LCU waiting'
  const lcuClass = lcuUi === 'ready' ? 'text-nexus-lime' : 'text-nexus-yellow/90'
  const poolRole: DraftRole | null =
    d.suggestionMyRole != null && d.suggestionMyRole !== 'unknown'
      ? d.suggestionMyRole
      : s?.myRole && s.myRole !== 'unknown'
        ? s.myRole
        : null
  const topItemPlan = d.draftIntel?.matchupPlans[0] ?? null
  const activeItemMatrixPlan = itemMatrixPlan ?? topItemPlan
  const itemMatrixPlans = d.draftIntel?.matchupPlans.filter((plan) => plan.itemPlan?.matrixRows?.length) ?? []

  const enemySlotsWithInference = useMemo((): InferredOverlaySlot[] => {
    const rows = d.enemyRoleInference ?? []
    return (s?.enemy ?? []).map((slot, index) => {
      const inferred = rows.find((row) => row.enemyIndex === index && row.championId === slot.championId)
      return {
        ...slot,
        assignedRole: slot.role,
        inferredRole: inferred?.inferredRole ?? null,
        role: inferred?.inferredRole ?? slot.role,
        roleProbabilities: inferred?.roleProbabilities ?? null
      }
    })
  }, [s?.enemy, d.enemyRoleInference])

  const searchPool = useMemo(
    () => buildOverlayChampionSearchPool(d.championsSearch),
    [d.championsSearch]
  )

  const championMetaById = useMemo((): ReadonlyMap<number, { tags: string[]; partype: string }> | null => {
    const rows = d.championsSearch
    if (!rows?.length) {
      return null
    }
    return new Map(
      rows.map((c) => [c.id, { tags: c.tags ?? [], partype: c.partype && c.partype.length ? c.partype : 'None' }])
    )
  }, [d.championsSearch])

  const nameByIdLookup = useMemo((): ReadonlyMap<number, string> | null => {
    const rows = d.championsSearch
    if (!rows?.length) {
      return null
    }
    return new Map(rows.map((c) => [c.id, c.name]))
  }, [d.championsSearch])

  const championKeyById = useMemo((): ReadonlyMap<number, string> => {
    const rows = d.championsSearch
    if (!rows?.length) {
      return new Map()
    }
    return new Map(rows.flatMap((c) => (c.key ? [[c.id, c.key] as const] : [])))
  }, [d.championsSearch])

  const championIconUrl = (id: number | null | undefined): string | null => {
    if (id == null || id <= 0 || !d.dataDragonVersion || d.dataDragonVersion[0] === '(') {
      return null
    }
    const key = championKeyById.get(id)
    return key ? ddragonChampionImageUrl(d.dataDragonVersion, key) : null
  }

  const nameMatches = useMemo(() => {
    const q = lookupQuery.trim()
    if (q.length < 1) {
      return []
    }
    if (/^\d+$/.test(q)) {
      const id = parseInt(q, 10)
      const byId = searchPool.find((c) => c.id === id)
      if (byId) {
        return [byId]
      }
    }
    return searchPool
      .filter((c) => nameMatchesChampionQuery(c.name, q) || String(c.id) === q)
      .slice(0, 8)
  }, [searchPool, lookupQuery])

  const [lookupId, setLookupId] = useState<number | null>(null)
  /** DDragon `tags` + partype; empty tags until main app has loaded champion.json */
  const [lookupDdragon, setLookupDdragon] = useState<{ tags: string[]; partype: string } | null>(null)
  const lookupChampion = useMemo(() => searchPool.find((x) => x.id === lookupId) ?? null, [searchPool, lookupId])
  useEffect(() => {
    const q = lookupQuery.trim()
    if (q.length === 0) {
      setLookupId(null)
      setLookupDdragon(null)
      return
    }
    if (lookupChampion && !nameMatchesChampionQuery(lookupChampion.name, q) && String(lookupChampion.id) !== q) {
      setLookupId(null)
      setLookupDdragon(null)
    }
  }, [lookupQuery, lookupChampion])
  /** When only one row matches, lock it in (same as picking from the list) */
  useEffect(() => {
    if (nameMatches.length !== 1) {
      return
    }
    const c = nameMatches[0]!
    if (lookupId === c.id) {
      return
    }
    setLookupId(c.id)
    setLookupDdragon({ tags: c.tags, partype: c.partype })
    setLookupQuery(c.name)
  }, [nameMatches, lookupId])

  const engineState = useMemo(() => {
    if (!s || !poolRole) {
      return null
    }
    return buildEngineState(s, poolRole, {
      bans: s.bans ?? null,
      myPickOrder: s.myPickOrder ?? null,
      dataDragonVersion: d.dataDragonVersion,
      patch: d.dataDragonVersion && d.dataDragonVersion[0] !== '(' ? d.dataDragonVersion : 'bundled'
    })
  }, [s, d.dataDragonVersion, poolRole])

  const lookupScores = useMemo(() => {
    if (lookupId == null || !engineState || !poolRole) {
      return null
    }
    const poolKey = poolRole as keyof typeof ROLE_CHAMPION_POOL
    return v1ComponentScores(lookupId, poolKey, engineState, nameByIdLookup, null, trainedEffects, championMetaById)
  }, [lookupId, engineState, poolRole, trainedEffects, nameByIdLookup, championMetaById])

  const lookupBuild = useMemo(() => {
    if (lookupId == null || !poolRole) {
      return null
    }
    const selectedName = lookupChampion?.name ?? null
    return getChampionBuildProfile(lookupId, poolRole, lookupDdragon, selectedName)
  }, [lookupId, poolRole, lookupDdragon, lookupChampion])

  return (
    <div className="nexus-overlay-root h-full min-h-0 flex flex-col font-body font-bold text-nexus-text text-sm relative">
      <div className="nexus-noise absolute inset-0 opacity-[0.35] pointer-events-none z-0" aria-hidden />
      <div
        className="nexus-overlay-drag relative z-10 flex items-center flex-wrap gap-x-2 gap-y-1 border-b border-nexus-line bg-nexus-surface-2 px-3 py-2.5"
        title="Nexus//Draft overlay — drag to move"
      >
        <span className="font-display font-bold text-base sm:text-lg tracking-[0.15em] text-nexus-lime">NEXUS//DRAFT</span>
        <span className="font-mono font-bold text-xs text-nexus-muted uppercase">overlay</span>
        {d.dataDragonVersion && d.dataDragonVersion[0] !== '(' && (
          <span className="font-mono font-bold text-sm text-nexus-muted tabular-nums">DGV {d.dataDragonVersion}</span>
        )}
        <span className="font-mono font-bold text-[10px] uppercase tracking-[0.12em] text-nexus-muted">
          {livePublicDataStatusLine(liveDataStatus)}
        </span>
      </div>

      <div className="nexus-overlay-nodrag border-b border-nexus-line/80 bg-nexus-surface-2/95 px-3 py-2 flex flex-col gap-2 text-[11px] sm:text-xs font-mono">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-nexus-lime/90 uppercase tracking-wide">Role</span>
          <span className="px-2 py-0.5 border border-nexus-line text-nexus-text uppercase">
            {poolRole ?? 'auto'}
          </span>
          <span className="text-nexus-line hidden sm:inline">|</span>
          <span className="text-nexus-muted uppercase tracking-wide">Δ order</span>
          <button
            type="button"
            className={
              resolvedDeltaList === 'best'
                ? 'px-2 py-0.5 border border-nexus-lime bg-nexus-lime/15 text-nexus-lime'
                : 'px-2 py-0.5 border border-nexus-line text-nexus-muted hover:text-nexus-text'
            }
            title="Strongest lobby lift first"
            onClick={() => pushOverlayPrefs({ deltaListModeOverride: 'best' })}
          >
            Best
          </button>
          <button
            type="button"
            className={
              resolvedDeltaList === 'worst'
                ? 'px-2 py-0.5 border border-nexus-lime bg-nexus-lime/15 text-nexus-lime'
                : 'px-2 py-0.5 border border-nexus-line text-nexus-muted hover:text-nexus-text'
            }
            title="Weakest in this lobby first"
            onClick={() => pushOverlayPrefs({ deltaListModeOverride: 'worst' })}
          >
            Worst
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-nexus-line/50 pt-1.5 sm:border-0 sm:pt-0">
          <span className="text-nexus-lime/90 uppercase tracking-wide">Rollouts</span>
          <button
            type="button"
            className={
              rolloutsOffActive
                ? 'px-2 py-0.5 border border-nexus-lime bg-nexus-lime/15 text-nexus-lime'
                : 'px-2 py-0.5 border border-nexus-line text-nexus-muted hover:text-nexus-text'
            }
            title="Fast V1 blend only (no random completed boards)"
            onClick={() => pushOverlayPrefs({ monteCarloOverride: 0 })}
          >
            Off
          </button>
          <button
            type="button"
            className={
              rolloutsMainActive
                ? 'px-2 py-0.5 border border-nexus-lime bg-nexus-lime/15 text-nexus-lime'
                : 'px-2 py-0.5 border border-nexus-line text-nexus-muted hover:text-nexus-text'
            }
            title={
              resolvedMc > 0
                ? `Follow Operations tab (${resolvedMc} rollout(s) per candidate).`
                : 'Follow Operations tab — set rollouts above 0 there to enable lookahead.'
            }
            onClick={() => pushOverlayPrefs({ monteCarloOverride: null })}
          >
            Main ({resolvedMc})
          </button>
          <button
            type="button"
            className="ml-auto px-2 py-0.5 border border-nexus-line text-nexus-muted hover:border-nexus-lime/40 hover:text-nexus-text"
            title="Clear overlay overrides; match Operations tab"
            onClick={() =>
              pushOverlayPrefs({
                roleOverride: null,
                sortByOverride: null,
                monteCarloOverride: null,
                deltaListModeOverride: null
              })
            }
          >
            Reset
          </button>
        </div>
      </div>

      {pickMatrixOpen && (
        <div className="nexus-overlay-nodrag nexus-matrix-stage absolute inset-0 z-40 flex items-center justify-center p-5 pointer-events-auto">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-transparent"
            aria-label="Close expanded picks"
            onClick={() => setPickMatrixOpen(false)}
          />
          <div className="nexus-matrix-beams" aria-hidden>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <section className="nexus-matrix-panel relative w-full h-full overflow-hidden border border-nexus-lime/55 bg-nexus-surface/95 shadow-[0_0_48px_rgba(29,212,168,0.26)]">
            <header className="flex items-center justify-between gap-4 border-b border-nexus-lime/35 bg-nexus-surface-2/95 px-4 py-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-nexus-lime/80 m-0">expanded view</p>
                <h2 className="font-display text-lg sm:text-2xl tracking-[0.12em] uppercase text-nexus-text m-0 truncate">
                  {poolRole ?? 'role'} recommendations
                </h2>
              </div>
              <div className="hidden md:flex min-w-0 flex-1 items-center justify-end gap-3 font-mono text-xs text-nexus-muted">
                <span>win delta sort</span>
                <span className="text-nexus-line">|</span>
                <span>{d.suggestions.length} rows</span>
                <span className="text-nexus-line">|</span>
                <span>{resolvedMc > 0 ? `${resolvedMc} rollout MC` : 'V1 blend'}</span>
              </div>
              <button
                type="button"
                className="nexus-focus shrink-0 border border-nexus-lime/45 px-4 py-2 font-mono text-xs uppercase tracking-[0.16em] text-nexus-lime/90 hover:bg-nexus-lime/10"
                onClick={() => setPickMatrixOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="h-[calc(100%_-_4.8rem)] overflow-auto nexus-overlay-no-scrollbar">
              <table className="w-full min-w-[48rem] border-collapse font-mono text-xs sm:text-sm">
                <thead className="sticky top-0 z-10 bg-nexus-surface-2 text-nexus-lime/85">
                  <tr className="text-left uppercase tracking-[0.14em]">
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">#</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Pick</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Score</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Base</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Lobby</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Delta</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Good vs</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Runes</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {d.suggestions.length === 0 && (
                    <tr>
                      <td className="px-3 py-5 text-nexus-muted" colSpan={9}>
                        No picks available.
                      </td>
                    </tr>
                  )}
                  {d.suggestions.map((p, i) => {
                    const enemies = bestEnemySlotsForCandidate(p.championId, poolRole, enemySlotsWithInference)
                    const fallback = focusedSlots(enemySlotsWithInference, poolRole, 'enemy')
                    const goodVs = enemies.length ? enemies : fallback
                    return (
                    <tr
                      key={`matrix-${d.boardSignature ?? d.updatedAt}-${p.championId}`}
                      className="text-nexus-text/90 odd:bg-nexus-lime/[0.035] hover:bg-nexus-lime/[0.08]"
                    >
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-muted">{i + 1}</td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45">
                        <span className="inline-flex items-center gap-2">
                          {championIconUrl(p.championId) && (
                            <img
                              className="h-7 w-7 border border-nexus-line/70 object-cover"
                              src={championIconUrl(p.championId)!}
                              alt=""
                              width={28}
                              height={28}
                            />
                          )}
                          <span className="text-nexus-lime/95 font-bold">{p.championName}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-text">{p.score.toFixed(2)}</td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-muted">{pct(p.baseWinRate)}</td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-muted">{pct(p.contextWinRate)}</td>
                      <td
                        className={
                          p.winRateDelta == null
                            ? 'px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-muted'
                            : p.winRateDelta >= 0
                              ? 'px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-lime/90 font-bold'
                              : 'px-3 py-2.5 border-b border-nexus-line/45 tabular-nums text-nexus-red/85 font-bold'
                        }
                      >
                        {signedPct(p.winRateDelta)}
                      </td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45">
                        <span className="inline-flex items-center gap-1">
                          {goodVs.slice(0, 3).map((slot) => (
                            <ContextPortrait
                              key={`matrix-vs-${p.championId}-${slot.role}-${slot.championId}`}
                              slot={slot}
                              imageUrl={championIconUrl(slot.championId)}
                              tone="enemy"
                            />
                          ))}
                          {goodVs.length === 0 && <span className="text-nexus-muted">pending</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 text-nexus-muted">
                        {p.runes ? (
                          <span>
                            <span className="text-nexus-text/85">{p.runes.keystone}</span>
                            <span className="block text-[10px] text-nexus-muted/80">{p.runes.primaryTree} / {p.runes.secondary}</span>
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 text-nexus-muted">
                        <span>{p.reasons.slice(0, 3).join(', ')}</span>
                        {p.buildProfile && <span className="block text-[10px] uppercase text-nexus-lime/75">{p.buildProfile.damage} {p.buildProfile.archetype}</span>}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {itemMatrixOpen && activeItemMatrixPlan?.itemPlan && (
        <div className="nexus-overlay-nodrag nexus-matrix-stage absolute inset-0 z-40 flex items-center justify-center p-5 pointer-events-auto">
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-transparent"
            aria-label="Close item matrix"
            onClick={() => {
              setItemMatrixOpen(false)
              setItemMatrixPlan(null)
            }}
          />
          <DraftItemMatrixView
            className="relative h-full w-full overflow-hidden"
            plans={itemMatrixPlans}
            selectedChampionId={activeItemMatrixPlan.championId}
            itemPlan={activeItemMatrixPlan.itemPlan}
            championName={activeItemMatrixPlan.championName}
            championId={activeItemMatrixPlan.championId}
            championImageUrl={championIconUrl}
            ddragonVersion={d.dataDragonVersion}
            onClose={() => {
              setItemMatrixOpen(false)
              setItemMatrixPlan(null)
            }}
          />
        </div>
      )}

      <div className="nexus-overlay-nodrag nexus-overlay-no-scrollbar relative z-10 flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5 text-sm leading-relaxed">
        {s && (
          <section className="mb-5">
            <SectionLabel>Draft board</SectionLabel>
            <div className="space-y-1.5 font-mono text-xs text-nexus-text/90">
              <div className="flex flex-wrap gap-1.5">
                <span className="w-full text-nexus-muted uppercase tracking-[0.12em]">Allies</span>
                {s.ally.map((slot) => (
                  <SlotPortrait
                    key={`a-${slot.role}-${slot.cellId ?? slot.championId ?? 'empty'}`}
                    slot={slot}
                    imageUrl={championIconUrl(slot.championId)}
                    isMySlot={poolRole != null && slot.role === poolRole}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="w-full text-nexus-muted uppercase tracking-[0.12em]">Enemies</span>
                {enemySlotsWithInference.map((slot) => (
                  <SlotPortrait key={`e-${slot.role}-${slot.cellId ?? slot.championId ?? 'empty'}`} slot={slot} imageUrl={championIconUrl(slot.championId)} />
                ))}
              </div>
            </div>
            {poolRole && (
              <p className="font-mono font-bold text-sm text-nexus-lime/90 mt-2.5 m-0">Picks for {poolRole} (team-comp–weighted model)</p>
            )}
          </section>
        )}

        {d.draftIntel && (
          <section className="mb-5">
            <details className="group font-mono">
              <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-3 border-b border-nexus-line pb-1.5 font-bold text-sm uppercase tracking-[0.12em] text-nexus-lime/95 marker:hidden">
                <span>Draft intel</span>
                <span className="text-nexus-lime/80 transition-transform group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <div className="mt-2 space-y-2 text-xs text-nexus-text/85">
                <div className="border border-nexus-lime/30 bg-nexus-lime/[0.06] px-2 py-1.5">
                  <p className="m-0 text-nexus-lime/90 uppercase tracking-[0.12em]">Brief</p>
                  <ul className="m-0 mt-1 list-disc pl-3.5 space-y-1 text-nexus-muted">
                    {d.draftIntel.loadingBrief.slice(0, 4).map((line, idx) => (
                      <li key={`overlay-brief-${idx}`}>{line}</li>
                    ))}
                  </ul>
                </div>
              {d.draftIntel.matchupPlans[0] && (
                <div className="border border-nexus-line/70 bg-nexus-bg/25 px-2 py-1.5">
                    <p className="m-0 text-nexus-lime/80 uppercase tracking-[0.12em]">Plan</p>
                    <p className="m-0 mt-1 text-nexus-muted">
                      {d.draftIntel.matchupPlans[0].championName} - {d.draftIntel.matchupPlans[0].summonerSpells}
                    </p>
                    <p className="m-0 text-nexus-muted">Start: {d.draftIntel.matchupPlans[0].startingItem}</p>
                    <OverlayItemPlan itemPlan={d.draftIntel.matchupPlans[0].itemPlan} ddragonVersion={d.dataDragonVersion} compact limit={2} />
                  </div>
                )}
              </div>
            </details>
          </section>
        )}

        <section className="mb-5">
          <SectionLabel>Personal pool {OVERLAY_PLAYER_POOL_IMPORT_ENABLED ? '' : 'import WIP'}</SectionLabel>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
            <input
              type="text"
              className="nexus-focus min-w-0 font-mono text-xs py-1.5 px-2.5 border border-nexus-line bg-nexus-bg text-nexus-text placeholder:text-nexus-muted/70"
              placeholder={OVERLAY_PLAYER_POOL_IMPORT_ENABLED ? 'GameName#TagLine' : 'Import paused'}
              value={riotIdInput}
              onChange={(event) => setRiotIdInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void importPlayerChampionPool()
                }
              }}
              aria-label="Riot ID"
              disabled={!OVERLAY_PLAYER_POOL_IMPORT_ENABLED}
            />
            <select
              className="nexus-focus min-w-0 font-mono text-xs py-1.5 px-2 border border-nexus-line bg-nexus-bg text-nexus-text"
              value={riotPlatform}
              onChange={(event) => setRiotPlatform(event.target.value as RiotPlatform)}
              aria-label="Riot platform"
              disabled={!OVERLAY_PLAYER_POOL_IMPORT_ENABLED}
            >
              {RIOT_PLATFORMS.map((platform) => (
                <option key={`overlay-riot-platform-${platform}`} value={platform}>
                  {platform.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              className="nexus-focus border border-nexus-lime/70 bg-nexus-lime/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-nexus-lime hover:bg-nexus-lime/18 disabled:opacity-45"
              disabled={playerPoolBusy || !OVERLAY_PLAYER_POOL_IMPORT_ENABLED}
              onClick={() => void importPlayerChampionPool()}
            >
              {!OVERLAY_PLAYER_POOL_IMPORT_ENABLED ? 'WIP' : playerPoolBusy ? 'Importing' : 'Import'}
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-nexus-muted">
              My Champs
            </span>
          </div>
          {playerPoolStatus ? (
            <p className="m-0 mt-2 font-mono text-xs text-nexus-muted" role="status">
              {playerPoolStatus}
            </p>
          ) : null}
        </section>

        <section className="mb-5">
          <SectionLabel>Champion lookup</SectionLabel>
          <input
            type="text"
            className="nexus-focus w-full font-mono text-sm py-1.5 px-2.5 border border-nexus-line bg-nexus-bg text-nexus-text placeholder:text-nexus-muted/70 mb-2"
            placeholder="Search champion…"
            value={lookupQuery}
            onChange={(e) => {
              setLookupQuery(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || nameMatches.length === 0) {
                return
              }
              e.preventDefault()
              const c = nameMatches[0]!
              setLookupId(c.id)
              setLookupDdragon({ tags: c.tags, partype: c.partype })
              setLookupQuery(c.name)
            }}
            aria-label="Champion name search"
          />
          {nameMatches.length > 0 && (
            <ul className="list-none m-0 p-0 space-y-1 mb-2 max-h-40 overflow-y-auto nexus-overlay-no-scrollbar border border-nexus-line/60 bg-nexus-surface-2/80">
              {nameMatches.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left font-mono text-sm py-1.5 px-2 hover:bg-nexus-lime/10 text-nexus-text flex items-center gap-2"
                    onClick={() => {
                      setLookupId(c.id)
                      setLookupDdragon({ tags: c.tags, partype: c.partype })
                      setLookupQuery(c.name)
                    }}
                  >
                    {championIconUrl(c.id) && (
                      <img
                        className="h-6 w-6 border border-nexus-line/70 object-cover"
                        src={championIconUrl(c.id)!}
                        alt=""
                        width={24}
                        height={24}
                      />
                    )}
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lookupId != null && poolRole && (lookupBuild || lookupScores) && (
            <div className="relative border border-nexus-line/85 bg-nexus-surface-2/90 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex gap-2">
                  {championIconUrl(lookupId) && (
                    <img
                      className="h-10 w-10 shrink-0 border border-nexus-line/80 object-cover"
                      src={championIconUrl(lookupId)!}
                      alt=""
                      width={40}
                      height={40}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-mono font-bold text-sm sm:text-base leading-tight">
                      <span className="text-nexus-lime/95">{lookupChampion?.name ?? `Champion ${lookupId}`}</span>
                      <span className="text-nexus-muted"> · </span>
                      <span className="text-nexus-text/90">{poolRole}</span>
                    </div>
                    {lookupScores && (
                      <div className="font-mono font-bold text-xs text-nexus-muted mt-1 tabular-nums">
                        Draft model blend
                        <span className="text-nexus-text/90"> · {(lookupScores.combined * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                </div>
                {lookupBuild && (
                  <span
                    className="inline-flex h-5 min-w-6 shrink-0 items-center justify-center border border-nexus-line px-1.5 font-mono text-[10px] uppercase text-nexus-text/85"
                    title={lookupBuild.buildHint}
                  >
                    {lookupBuild.damage}
                  </span>
                )}
              </div>

              {lookupBuild && (
                <div className="mt-2 border-l-2 border-nexus-lime/65 bg-nexus-bg/20 pl-1.5 pr-1 py-0.5 font-mono text-[10px] leading-snug">
                  <span className="uppercase tracking-[0.12em] text-nexus-lime/80">Build</span>
                  <span className="text-nexus-line"> · </span>
                  <span className="text-nexus-text/80">{lookupBuild.archetype}</span>
                  {lookupBuild.partype && lookupBuild.partype !== 'None' && (
                    <span className="text-nexus-muted"> · {lookupBuild.partype}</span>
                  )}
                </div>
              )}

              {lookupScores && (
                <details className="group mt-2 border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
                  <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
                    <span>Fit summary</span>
                    <span className="text-nexus-lime/80 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="border-t border-nexus-line/55 px-2 py-1.5 space-y-1">
                    <p className="m-0">
                      <span className="uppercase tracking-[0.12em] text-nexus-lime/80">Overall</span>
                      <span className="text-nexus-line"> · </span>
                      <span className={fitClass(lookupScores.combined)}>{fitLabel(lookupScores.combined)}</span>
                      <span className="text-nexus-muted"> pick for {poolRole} ({pct(lookupScores.combined)})</span>
                    </p>
                    <p className="m-0 text-nexus-muted">
                      Lane baseline is <span className={fitClass(lookupScores.base)}>{fitLabel(lookupScores.base)}</span>; current allies are{' '}
                      <span className={fitClass(lookupScores.ally)}>{fitLabel(lookupScores.ally)}</span>.
                    </p>
                    <p className="m-0 text-nexus-muted">
                      Enemy matchup is <span className={fitClass(lookupScores.enemy)}>{fitLabel(lookupScores.enemy)}</span>; team comp fit is{' '}
                      <span className={fitClass(lookupScores.comp)}>{fitLabel(lookupScores.comp)}</span>.
                    </p>
                    {lookupScores.blindP > 0 && (
                      <p className="m-0 text-nexus-red/80">
                        Early blind risk: -{(lookupScores.blindP * 100).toFixed(0)}%.
                      </p>
                    )}
                  </div>
                </details>
              )}

              {lookupBuild && (
                <details className="group mt-2 border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
                  <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
                    <span>Tips</span>
                    <span className="text-nexus-lime/80 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="border-t border-nexus-line/55 px-2 py-1.5">
                    {lookupBuild.buildHint}
                    {lookupBuild.itemHint && (
                      <div className="mt-1 text-nexus-muted">
                        <span className="text-nexus-lime/80">Items:</span> {lookupBuild.itemHint}
                      </div>
                    )}
                    {lookupBuild.tagsLine !== '—' && <div className="mt-1 text-nexus-muted">Riot: {lookupBuild.tagsLine}</div>}
                  </div>
                </details>
              )}

              {!inRolePool(lookupId, poolRole) && (
                <p className="font-mono text-nexus-red/80 text-[11px] m-0 mt-2">
                  Not in the curated {poolRole} pool — base is approximate.
                </p>
              )}
            </div>
          )}
          {s && !poolRole && <p className="font-mono text-xs text-nexus-muted m-0">Set role in the main app (or LCU) to score a lookup for your role.</p>}
        </section>

        <section className="mb-5">
          <div className="flex items-center justify-between gap-2 mb-2.5 border-b border-nexus-line pb-1.5">
            <h3 className="font-mono font-bold text-sm uppercase tracking-[0.12em] text-nexus-lime/95 m-0">
              Top picks
            </h3>
            <button
              type="button"
              className="nexus-focus border border-nexus-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-nexus-muted hover:border-nexus-lime/50 hover:text-nexus-text disabled:opacity-45"
              onClick={() => setPickMatrixOpen(true)}
              disabled={d.suggestions.length === 0}
              aria-expanded={pickMatrixOpen}
            >
              Champs
            </button>
            <button
              type="button"
              className="nexus-focus border border-nexus-line px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-nexus-muted hover:border-nexus-lime/50 hover:text-nexus-text disabled:opacity-45"
              onClick={() => {
                if (topItemPlan) {
                  setItemMatrixPlan(topItemPlan)
                  setItemMatrixOpen(true)
                }
              }}
              disabled={!topItemPlan?.itemPlan?.matrixRows?.length}
              aria-expanded={itemMatrixOpen}
            >
              Items
            </button>
          </div>
          {topPicks.length === 0 && (
            <p className="font-mono font-bold text-sm text-nexus-muted m-0">Open the main app for draft data.</p>
          )}
          <ul
            className="list-none m-0 p-0 space-y-2.5"
            key={d.boardSignature ? d.boardSignature : d.updatedAt}
          >
            {topPicks.map((p, i) => {
              const showTeamSynergy =
                p.reasons.includes('team_synergy') &&
                p.winRateDelta != null &&
                Math.abs(p.winRateDelta) >= MEANINGFUL_TEAM_SYNERGY_DELTA
              const allies = bestAllySlotsForCandidate(p.championId, poolRole, s?.ally ?? [], trainedEffects)
              const enemies = bestEnemySlotsForCandidate(p.championId, poolRole, enemySlotsWithInference)
              const allyFallback = focusedSlots(s?.ally ?? [], poolRole, 'ally')
              const enemyFallback = focusedSlots(enemySlotsWithInference, poolRole, 'enemy')
              const synergySlots = showTeamSynergy ? (allies.length ? allies : allyFallback) : []
              const goodVsSlots = enemies.length ? enemies : enemyFallback
              const intel = formatRuneTipNote(
                p.runes?.note,
                p.buildProfile?.buildHint ?? 'Matchup notes locked until board has more context.'
              )
              const matchupPlan = d.draftIntel?.matchupPlans.find((plan) => plan.championId === p.championId) ?? null
              return (
                <li
                  key={`${d.boardSignature ?? d.updatedAt}-${i}-${p.championId}`}
                  className="relative border border-nexus-line/85 bg-nexus-surface-2/90 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex gap-2">
                      {championIconUrl(p.championId) && (
                        <img
                          className="h-10 w-10 shrink-0 border border-nexus-line/80 object-cover"
                          src={championIconUrl(p.championId)!}
                          alt=""
                          width={40}
                          height={40}
                        />
                      )}
                      <div className="min-w-0">
                      <div className="font-mono font-bold text-sm sm:text-base leading-tight">
                        <span className="text-nexus-lime/95">{p.championName}</span>
                        <span className="text-nexus-muted"> · </span>
                        <span className="text-nexus-text/90 tabular-nums">{p.score}</span>
                        {p.isLockedPick && (
                          <span className="ml-2 border border-nexus-lime/70 px-1 py-0.5 text-[10px] uppercase tracking-[0.12em] text-nexus-lime/90">
                            Picked
                          </span>
                        )}
                      </div>
                      {p.baseWinRate != null && p.contextWinRate != null && p.winRateDelta != null && (
                        <div className="font-mono font-bold text-xs text-nexus-muted mt-1 tabular-nums">
                          {(p.baseWinRate * 100).toFixed(1)}% -&gt; {(p.contextWinRate * 100).toFixed(1)}%
                          <span className={p.winRateDelta >= 0 ? 'text-nexus-lime/85' : 'text-nexus-red/80'}>
                            {' '}
                            ({p.winRateDelta >= 0 ? '+' : ''}
                            {(p.winRateDelta * 100).toFixed(1)}%)
                          </span>
                        </div>
                      )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1 opacity-90">
                      {p.buildProfile && (
                        <span
                          className="inline-flex h-5 min-w-6 items-center justify-center border border-nexus-line px-1.5 font-mono text-[10px] uppercase text-nexus-text/85"
                          title={p.buildProfile.buildHint}
                        >
                          {p.buildProfile.damage}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={['mt-2 grid gap-1.5 font-mono text-[10px] leading-snug', showTeamSynergy ? 'grid-cols-2' : 'grid-cols-1'].join(' ')}>
                    {showTeamSynergy && (
                    <div className="border-l-2 border-[#23d5b0] bg-nexus-bg/20 pl-1.5 pr-1 py-0.5 min-w-0">
                      <span className="uppercase tracking-[0.12em] text-nexus-lime/80">Team synergy</span>
                      <span className="text-nexus-line"> · </span>
                      <span className="inline-flex max-w-[75%] align-middle items-center gap-1">
                        {synergySlots.length
                          ? synergySlots.map((slot) => (
                              <ContextPortrait
                                key={`syn-${p.championId}-${slot.role}-${slot.championId}`}
                                slot={slot}
                                imageUrl={championIconUrl(slot.championId)}
                                tone="ally"
                              />
                            ))
                          : <span className="text-nexus-text/80">pending</span>}
                      </span>
                    </div>
                    )}
                    <div className="border-l-2 border-[#f87171] bg-nexus-bg/20 pl-1.5 pr-1 py-0.5 min-w-0">
                      <span className="uppercase tracking-[0.12em] text-nexus-red/80">Good vs</span>
                      <span className="text-nexus-line"> · </span>
                      <span className="inline-flex max-w-[75%] align-middle items-center gap-1">
                        {goodVsSlots.length
                          ? goodVsSlots.map((slot) => (
                              <ContextPortrait
                                key={`vs-${p.championId}-${slot.role}-${slot.championId}`}
                                slot={slot}
                                imageUrl={championIconUrl(slot.championId)}
                                tone="enemy"
                              />
                            ))
                          : <span className="text-nexus-text/80">pending</span>}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-1.5">
                    {p.runes && (
                      <details className="group border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
                        <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
                          <span>Runes</span>
                          <span className="text-nexus-lime/80 group-open:rotate-45 transition-transform">+</span>
                        </summary>
                        <div className="border-t border-nexus-line/55 px-2 py-1.5">
                          <span className="text-nexus-lime/85">{p.runes.keystone}</span>
                          <span className="text-nexus-muted"> / {p.runes.primaryTree}</span>
                          <div className="mt-0.5 text-nexus-muted/85">{p.runes.secondary}</div>
                        </div>
                      </details>
                    )}
                    {matchupPlan?.itemPlan && (
                      <OverlayItemPlan
                        itemPlan={matchupPlan.itemPlan}
                        ddragonVersion={d.dataDragonVersion}
                        compact
                        limit={2}
                        onOpenMatrix={() => {
                          setItemMatrixPlan(matchupPlan)
                          setItemMatrixOpen(true)
                        }}
                      />
                    )}
                  <details className="group border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
                    <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
                      <span>Tips</span>
                      <span className="text-nexus-lime/80 group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <div className="border-t border-nexus-line/55 px-2 py-1.5">
                      <span>{intel}</span>
                      {p.buildProfile?.itemHint && (
                        <div className="mt-1 text-nexus-muted">
                          <span className="text-nexus-lime/80">Items:</span> {p.buildProfile.itemHint}
                        </div>
                      )}
                      {p.buildProfile && (
                        <div className="mt-1 text-nexus-muted">
                          {p.buildProfile.archetype}
                          {p.buildProfile.tagsLine !== '—' && <span> · {p.buildProfile.tagsLine}</span>}
                        </div>
                      )}
                    </div>
                  </details>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {d.geminiNarration && (
          <section className="mb-5">
            <SectionLabel>Coaching</SectionLabel>
            <p className="nexus-allow-select font-mono font-bold text-sm text-nexus-text/80 whitespace-pre-wrap max-h-40 overflow-y-auto nexus-overlay-no-scrollbar m-0 leading-relaxed">
              {d.geminiNarration}
            </p>
          </section>
        )}

        <div className="border-t border-nexus-line pt-3 flex flex-col gap-1.5">
          <p className="font-mono font-bold text-xs text-nexus-text/85 m-0">
            <span className={lcuClass}>{lcuLabel}</span>
            <span className="text-nexus-line"> · </span>
            <span className="text-nexus-muted">{d.source}</span>
          </p>
          {d.patchLabel && (
            <p className="font-mono text-[11px] text-nexus-muted m-0 leading-snug">
              {d.patchLabel}
              {d.trainedEffectsStatus && d.trainedEffectsStatus.hasAnyData && (
                <span> · trained {d.trainedEffectsStatus.basePairs}/{d.trainedEffectsStatus.matchupPairs}/{d.trainedEffectsStatus.synergyPairs}</span>
              )}
            </p>
          )}
          {d.error && <p className="font-mono font-bold text-xs text-nexus-red m-0 leading-snug">{d.error}</p>}
          <p className="font-mono font-bold text-sm text-nexus-muted m-0">Insert / F9 / F10</p>
        </div>
      </div>
    </div>
  )
}
