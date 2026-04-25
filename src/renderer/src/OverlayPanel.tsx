import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
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

function roleAbbrev(role: string): string {
  if (role === 'unknown') {
    return '?'
  }
  return role[0]!.toUpperCase()
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

function slotLine(ally: { role: string; championName: string | null; championId: number | null }[]): string {
  return ally
    .map((p) => `${roleAbbrev(p.role)}:${slotName(p)}`)
    .join(' · ')
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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-mono font-bold text-sm uppercase tracking-[0.12em] text-nexus-lime/95 mb-2.5 border-b border-nexus-line pb-1.5">
      {children}
    </h3>
  )
}

const OVERLAY_ROLE_OPTIONS: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']

function pushOverlayPrefs(patch: OverlayEnginePrefsPatch) {
  void window.drafter.setOverlayEnginePrefs(patch)
}

function inRolePool(id: number, role: DraftRole, trainedEffects: CompiledTrainedEffects | null): boolean {
  if (role === 'unknown') {
    return false
  }
  const k = role as keyof typeof ROLE_CHAMPION_POOL
  return (
    (ROLE_CHAMPION_POOL[k] ?? []).includes(id) ||
    publicMetaCandidateIdsForRole(role).includes(id) ||
    Boolean(trainedEffects?.base[role]?.has(id))
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
          <label className="flex items-center gap-1.5 text-nexus-muted">
            <span className="text-nexus-lime/90 uppercase tracking-wide">Role</span>
            <select
              className="nexus-focus bg-nexus-bg border border-nexus-line text-nexus-text py-0.5 px-1.5 max-w-[7.5rem]"
              value={echo?.roleOverride == null ? 'auto' : echo.roleOverride}
              onChange={(e) => {
                const v = e.target.value
                pushOverlayPrefs({ roleOverride: v === 'auto' ? null : (v as DraftRole) })
              }}
              aria-label="Suggestion role"
            >
              <option value="auto">Auto</option>
              {OVERLAY_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
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
                        <span className="text-nexus-lime/95 font-bold">{p.championName}</span>
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
        <section className="mb-5">
          <SectionLabel>League link</SectionLabel>
          <p className="font-mono font-bold text-sm sm:text-base text-nexus-text/90 m-0">
            <span className={lcuClass}>{lcuLabel}</span>
            <span className="text-nexus-line"> · </span>
            <span className="text-nexus-muted">{d.source}</span>
          </p>
          {d.patchLabel && (
            <p className="font-mono text-xs text-nexus-muted m-0 mt-1 leading-snug">
              Model: <span className="text-nexus-lime/85">{d.patchLabel}</span>
              {d.trainedEffectsStatus && d.trainedEffectsStatus.hasAnyData && (
                <span className="text-nexus-muted">
                  {' '}
                  · trained {d.trainedEffectsStatus.basePairs} base · {d.trainedEffectsStatus.matchupPairs} lane ·{' '}
                  {d.trainedEffectsStatus.synergyPairs} synergy
                </span>
              )}
            </p>
          )}
          {d.error && <p className="font-mono font-bold text-sm text-nexus-red mt-2 m-0 leading-snug">{d.error}</p>}
        </section>

        {s && (
          <section className="mb-5">
            <SectionLabel>Draft board</SectionLabel>
            <p className="font-mono font-bold text-sm text-nexus-text/90 m-0 mb-1.5 leading-snug break-words">
              Allies: {slotLine(s.ally)}
            </p>
            <p className="font-mono font-bold text-sm text-nexus-text/90 m-0 leading-snug break-words">
              Enemies: {slotLine(s.enemy)}
            </p>
            {poolRole && (
              <p className="font-mono font-bold text-sm text-nexus-lime/90 mt-2.5 m-0">Picks for {poolRole} (team-comp–weighted model)</p>
            )}
          </section>
        )}

        <section className="mb-5">
          <SectionLabel>Champion lookup</SectionLabel>
          <p className="font-mono text-xs text-nexus-muted m-0 mb-2">
            Type a name (1+ char), champion id, or no-space shorthands (e.g. masteryi) — one unique match
            auto-selects; Enter picks the top result. Tags come from the main app when DDragon is loaded.
          </p>
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
                    className="w-full text-left font-mono text-sm py-1.5 px-2 hover:bg-nexus-lime/10 text-nexus-text"
                    onClick={() => {
                      setLookupId(c.id)
                      setLookupDdragon({ tags: c.tags, partype: c.partype })
                      setLookupQuery(c.name)
                    }}
                  >
                    {c.name}
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
              {!inRolePool(lookupId, poolRole, trainedEffects) && (
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
            {topPicks.map((p, i) => (
              <li
                key={`${d.boardSignature ?? d.updatedAt}-${i}-${p.championId}`}
                className="border border-nexus-line/80 bg-nexus-surface-2/90 px-2.5 py-2"
              >
                <div className="font-mono font-bold text-sm sm:text-base">
                  <span className="text-nexus-lime/95">{p.championName}</span>
                  <span className="text-nexus-muted"> · </span>
                  <span className="text-nexus-text/85 tabular-nums">{p.score}</span>
                </div>
                {p.baseWinRate != null && p.contextWinRate != null && p.winRateDelta != null && (
                  <div className="font-mono font-bold text-xs text-nexus-muted mt-1">
                    {(p.baseWinRate * 100).toFixed(1)}% → {(p.contextWinRate * 100).toFixed(1)}%
                    <span className={p.winRateDelta >= 0 ? 'text-nexus-lime/85' : 'text-nexus-red/80'}>
                      {' '}
                      ({p.winRateDelta >= 0 ? '+' : ''}
                      {(p.winRateDelta * 100).toFixed(1)}%)
                    </span>
                  </div>
                )}
                {p.runes && (
                  <div className="font-mono text-xs text-nexus-muted mt-1.5 leading-snug">
                    <div className="font-bold">{p.runes.keystone} / {p.runes.primaryTree}</div>
                    <div className="text-[11px] text-nexus-muted/85">{p.runes.secondary}</div>
                    {p.runes.note && <div className="text-[11px] text-nexus-text/70 font-normal mt-0.5">{p.runes.note}</div>}
                  </div>
                )}
                {p.buildProfile && (
                  <div className="font-mono text-[11px] sm:text-xs text-nexus-muted mt-1.5 leading-snug">
                    <span className="text-nexus-lime/85 uppercase">{p.buildProfile.damage}</span>
                    <span className="text-nexus-line"> · </span>
                    {p.buildProfile.archetype}
                    {p.buildProfile.tagsLine !== '—' && (
                      <span>
                        <span className="text-nexus-line"> — </span>
                        {p.buildProfile.tagsLine}
                      </span>
                    )}
                    <div className="text-nexus-text/75 mt-0.5 font-normal">{p.buildProfile.buildHint}</div>
                  </div>
                )}
                {p.lookaheadEV != null && (
                  <div className="font-mono font-bold text-xs text-nexus-muted mt-1">
                    EV {(p.lookaheadEV * 100).toFixed(1)}% · σ{((p.lookaheadRisk ?? 0) * 100).toFixed(0)}%
                  </div>
                )}
              </li>
            ))}
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
          <p className="font-mono font-bold text-sm text-nexus-muted m-0">Insert / F9 / F10</p>
          {d.patchLabel && <p className="font-mono font-bold text-sm text-nexus-line/90 m-0 leading-snug">{d.patchLabel}</p>}
        </div>
      </div>
    </div>
  )
}
