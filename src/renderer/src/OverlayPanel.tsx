import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { ddragonChampionImageUrl } from '@shared/dataDragon'
import {
  buildEngineState,
  buildOverlayChampionSearchPool,
  compileTrainedEffects,
  getChampionBuildProfile,
  isDraftUpdate,
  nameMatchesChampionQuery,
  publicMetaCandidateIdsForRole,
  ROLE_CHAMPION_POOL,
  resolveChampionName,
  v1ComponentScores,
  type CompiledTrainedEffects,
  type DraftUpdate,
  type DraftRole,
  type OverlayEnginePrefsPatch
} from '@shared/draft'

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
  imageUrl
}: {
  slot: { championName: string | null; championId: number | null }
  imageUrl: string | null
}) {
  const name = slotName(slot)
  return (
    <span className="inline-flex items-center gap-1.5 border border-nexus-line/70 bg-nexus-bg/30 px-1.5 py-1">
      {imageUrl ? (
        <img
          className="h-5 w-5 shrink-0 border border-nexus-line/70 object-cover"
          src={imageUrl}
          alt=""
          width={20}
          height={20}
        />
      ) : (
        <span className="h-5 w-5 shrink-0 border border-nexus-line/70 bg-nexus-surface-2" aria-hidden />
      )}
      <span className="truncate">{name}</span>
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

type OverlaySlot = { role: string; championName: string | null; championId: number | null }

function filledNames(slots: OverlaySlot[], limit = 2): string[] {
  return slots
    .filter((p) => p.championId != null && p.championId > 0)
    .map(slotName)
    .filter((name) => name !== '—')
    .slice(0, limit)
}

function shortIntel(text: string | null | undefined, fallback: string): string {
  if (!text) {
    return fallback
  }
  const first = text.split(/[.!?]/)[0]?.trim()
  return first ? first.slice(0, 96) : fallback
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
    if (!pickMatrixOpen) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPickMatrixOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickMatrixOpen])

  useEffect(() => {
    void window.drafter.setOverlayProjectionMode(pickMatrixOpen).catch(() => {
      /* overlay may be closing */
    })
  }, [pickMatrixOpen])

  useEffect(() => {
    return () => {
      void window.drafter.setOverlayProjectionMode(false).catch(() => {
        /* overlay may be closing */
      })
    }
  }, [])

  const s = d.snapshot
  const topPicks = d.suggestions.slice(0, 6)
  const echo = d.overlayEngineEcho
  const resolvedSort = echo?.resolvedSortBy ?? 'score'
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
    const selectedName = searchPool.find((x) => x.id === lookupId)?.name ?? null
    return getChampionBuildProfile(lookupId, poolRole, lookupDdragon, selectedName)
  }, [lookupId, poolRole, lookupDdragon, searchPool])

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
      </div>

      <div className="nexus-overlay-nodrag border-b border-nexus-line/80 bg-nexus-surface-2/95 px-3 py-2 flex flex-col gap-2 text-[11px] sm:text-xs font-mono">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-nexus-lime/90 uppercase tracking-wide">Role</span>
          <span className="px-2 py-0.5 border border-nexus-line text-nexus-text uppercase">
            {poolRole ?? 'auto'}
          </span>
          <span className="text-nexus-line hidden sm:inline">|</span>
          <span className="text-nexus-lime/90 uppercase tracking-wide">Sort</span>
          <button
            type="button"
            className={
              resolvedSort === 'score'
                ? 'px-2 py-0.5 border border-nexus-lime bg-nexus-lime/15 text-nexus-lime'
                : 'px-2 py-0.5 border border-nexus-line text-nexus-muted hover:text-nexus-text'
            }
            title="Order by blended model score"
            onClick={() => pushOverlayPrefs({ sortByOverride: 'score' })}
          >
            Model
          </button>
          <button
            type="button"
            className={
              resolvedSort === 'delta'
                ? 'px-2 py-0.5 border border-nexus-lime bg-nexus-lime/15 text-nexus-lime'
                : 'px-2 py-0.5 border border-nexus-line text-nexus-muted hover:text-nexus-text'
            }
            title="Order by contextual winrate vs role baseline"
            onClick={() => pushOverlayPrefs({ sortByOverride: 'delta' })}
          >
            Win Δ
          </button>
          {resolvedSort === 'delta' && (
            <>
              <span className="text-nexus-line">|</span>
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
            </>
          )}
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
                <span>{resolvedSort === 'delta' ? 'win delta sort' : 'model score sort'}</span>
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
              <table className="w-full min-w-[58rem] border-collapse font-mono text-xs sm:text-sm">
                <thead className="sticky top-0 z-10 bg-nexus-surface-2 text-nexus-lime/85">
                  <tr className="text-left uppercase tracking-[0.14em]">
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">#</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Pick</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Score</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Base</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Lobby</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Delta</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Runes</th>
                    <th className="px-3 py-2.5 border-b border-nexus-line/80">Build</th>
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
                  {d.suggestions.map((p, i) => (
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
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 text-nexus-muted">
                        {p.runes ? (
                          <span>
                            <span className="text-nexus-text/85">{p.runes.keystone}</span>
                            <span> / {p.runes.primaryTree}</span>
                            <span className="block text-[10px] leading-snug text-nexus-muted/80 mt-0.5">
                              {p.runes.secondary}
                            </span>
                          </span>
                        ) : (
                          '--'
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 text-nexus-muted">
                        {p.buildProfile && (
                          <span>
                            <span className="text-nexus-lime/80 uppercase">{p.buildProfile.damage}</span> {p.buildProfile.archetype}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-b border-nexus-line/45 text-nexus-muted">
                        {p.reasons.join(', ')}
                        {p.lookaheadEV != null && (
                          <span> / EV {(p.lookaheadEV * 100).toFixed(1)}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
                  <SlotPortrait key={`a-${slot.role}-${slot.cellId ?? slot.championId ?? 'empty'}`} slot={slot} imageUrl={championIconUrl(slot.championId)} />
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className="w-full text-nexus-muted uppercase tracking-[0.12em]">Enemies</span>
                {s.enemy.map((slot) => (
                  <SlotPortrait key={`e-${slot.role}-${slot.cellId ?? slot.championId ?? 'empty'}`} slot={slot} imageUrl={championIconUrl(slot.championId)} />
                ))}
              </div>
            </div>
            {poolRole && (
              <p className="font-mono font-bold text-sm text-nexus-lime/90 mt-2.5 m-0">Picks for {poolRole} (team-comp–weighted model)</p>
            )}
          </section>
        )}

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
          {lookupId != null && poolRole && lookupBuild && (
            <div className="border border-nexus-line/80 bg-nexus-surface-2/90 px-2.5 py-2 text-xs sm:text-sm mb-2">
              <p className="font-mono text-nexus-lime/95 m-0 mb-1">
                {searchPool.find((x) => x.id === lookupId)?.name ?? `Champion ${lookupId}`}
                <span className="text-nexus-muted"> · {poolRole}</span>
              </p>
              <p className="font-mono text-nexus-lime/80 m-0 mb-1 uppercase text-[11px]">
                {lookupBuild.damage} damage · {lookupBuild.archetype}
                {lookupBuild.partype && lookupBuild.partype !== 'None' && (
                  <span className="text-nexus-muted normal-case"> · {lookupBuild.partype}</span>
                )}
              </p>
              {lookupBuild.tagsLine !== '—' && (
                <p className="font-mono text-nexus-muted text-[11px] m-0 mb-1">Riot: {lookupBuild.tagsLine}</p>
              )}
              <p className="font-mono text-nexus-text/85 m-0 leading-snug">{lookupBuild.buildHint}</p>
            </div>
          )}
          {lookupId != null && lookupScores && poolRole && (
            <div className="border border-nexus-line/80 bg-nexus-surface-2/90 px-2.5 py-2 text-xs sm:text-sm">
              <p className="font-mono text-nexus-lime/95 m-0 mb-1.5">
                Draft model blend <span className="text-nexus-muted">· {(lookupScores.combined * 100).toFixed(1)}%</span>
              </p>
              <p className="font-mono text-nexus-muted m-0 leading-snug">
                Base (role pool) {(lookupScores.base * 100).toFixed(0)}% · with allies {(lookupScores.ally * 100).toFixed(0)}% ·
                vs enemies {(lookupScores.enemy * 100).toFixed(0)}% · comp {(lookupScores.comp * 100).toFixed(0)}%
                {lookupScores.blindP > 0 && (
                  <span>
                    {' '}
                    · early blind penalty −{(lookupScores.blindP * 100).toFixed(0)}%
                  </span>
                )}
              </p>
              {!inRolePool(lookupId, poolRole) && (
                <p className="font-mono text-nexus-red/80 text-[11px] m-0 mt-1.5">Not in the curated {poolRole} pool — base is approximate.</p>
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
              Expand
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
              const allies = filledNames(s?.ally ?? [])
              const enemies = filledNames(s?.enemy ?? [])
              const intel = shortIntel(p.runes?.note, p.buildProfile?.buildHint ?? 'Matchup notes locked until board has more context.')
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

                  <div className="mt-2 grid grid-cols-2 gap-1.5 font-mono text-[10px] leading-snug">
                    <div className="border-l-2 border-nexus-lime/65 bg-nexus-bg/20 pl-1.5 pr-1 py-0.5 min-w-0">
                      <span className="uppercase tracking-[0.12em] text-nexus-lime/80">Synergy</span>
                      <span className="text-nexus-line"> · </span>
                      <span className="text-nexus-text/80 truncate inline-block max-w-[75%] align-bottom">
                        {allies.length ? allies.join(' / ') : 'pending'}
                      </span>
                    </div>
                    <div className="border-l-2 border-nexus-red/70 bg-nexus-bg/20 pl-1.5 pr-1 py-0.5 min-w-0">
                      <span className="uppercase tracking-[0.12em] text-nexus-red/80">Good vs</span>
                      <span className="text-nexus-line"> · </span>
                      <span className="text-nexus-text/80 truncate inline-block max-w-[75%] align-bottom">
                        {enemies.length ? enemies.join(' / ') : 'pending'}
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
                  <details className="group border border-nexus-line/65 bg-nexus-bg/25 font-mono text-[11px] leading-snug text-nexus-text/75">
                    <summary className="nexus-focus flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 uppercase tracking-[0.12em] text-nexus-muted marker:hidden">
                      <span>Tips</span>
                      <span className="text-nexus-lime/80 group-open:rotate-45 transition-transform">+</span>
                    </summary>
                    <div className="border-t border-nexus-line/55 px-2 py-1.5">
                      <span>{intel}</span>
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
