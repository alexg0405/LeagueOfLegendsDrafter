import type { ChampionLite } from '@shared/dataDragon'
import type { DraftDeltaListMode, DraftRole, DraftSource, PickSuggestion } from '@shared/draft'
import { copyDraftSource } from './nexusCopy'
import { NexusPanel } from './NexusPanel'

const ROLES: DraftRole[] = ['top', 'jungle', 'middle', 'bottom', 'support']

const inField =
  'nexus-focus w-full min-w-0 max-w-md bg-nexus-bg border border-nexus-line text-nexus-text font-mono text-sm py-2 px-3 focus:border-nexus-lime/50 focus:outline-none disabled:opacity-45'
const btnPrimary =
  'nexus-focus inline-flex items-center justify-center font-display text-xs sm:text-sm tracking-[0.16em] uppercase px-5 py-2.5 border border-nexus-lime bg-nexus-lime text-nexus-bg border-nexus-lime/90 hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed'
const textMuted = 'text-nexus-muted'
const textBody = 'font-mono text-sm text-nexus-text/90'
const errText = 'font-mono text-sm text-nexus-red'

export type NexusOperationsViewProps = {
  lcuStatusLine: string
  lcuError: string | null
  draftSource: DraftSource
  useManual: boolean
  onUseManual: (v: boolean) => void
  suggestOverride: boolean
  onSuggestOverride: (v: boolean) => void
  myRole: DraftRole
  onMyRole: (r: DraftRole) => void
  effectiveMyRole: DraftRole
  suggestionRoleLine: string
  manual: { ally: Record<DraftRole, number | null>; enemy: Record<DraftRole, number | null> }
  onManualAlly: (role: DraftRole, id: number | null) => void
  onManualEnemy: (role: DraftRole, id: number | null) => void
  champions: ChampionLite[]
  /** Full explainer for the v1 / Monte Carlo model */
  modelDescription: string
  /** 0 = V1 only; non-zero = per-candidate MC rollouts (capped in MainShell). */
  suggestMcRollouts: number
  maxSuggestMcRollouts: number
  onSuggestMcRollouts: (n: number) => void
  suggestSortBy: 'score' | 'delta'
  onSuggestSortBy: (v: 'score' | 'delta') => void
  suggestDeltaListMode: DraftDeltaListMode
  onSuggestDeltaListMode: (v: DraftDeltaListMode) => void
  suggestions: PickSuggestion[]
  onToggleOverlay: () => void
}

export function NexusOperationsView({
  lcuStatusLine,
  lcuError,
  draftSource,
  useManual,
  onUseManual,
  suggestOverride,
  onSuggestOverride,
  myRole,
  onMyRole,
  effectiveMyRole,
  suggestionRoleLine,
  manual,
  onManualAlly,
  onManualEnemy,
  champions,
  modelDescription,
  suggestMcRollouts,
  maxSuggestMcRollouts,
  onSuggestMcRollouts,
  suggestSortBy,
  onSuggestSortBy,
  suggestDeltaListMode,
  onSuggestDeltaListMode,
  suggestions,
  onToggleOverlay
}: NexusOperationsViewProps) {
  const sorted = champions.slice().sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-2 sm:py-3 pb-10 text-nexus-text nexus-ops-scroll">
      <NexusPanel kicker="league // link" title="Client link" accent>
        <p className={`${textBody} mb-2`}>{lcuStatusLine}</p>
        {lcuError && <p className={`${errText} mb-2`}>{lcuError}</p>}
        <p className={`${textMuted} font-mono text-sm mb-4`}>
          Picks from: <span className="text-nexus-text/85">{copyDraftSource(draftSource)}</span>
        </p>
        <div className="space-y-4 border-t border-nexus-line/60 pt-4">
          <p className="font-display text-sm tracking-widest uppercase text-nexus-lime/90">My role (draft model)</p>
          <p className={`${textBody} text-sm`}>
            <span className="text-nexus-lime/95 font-medium">{String(effectiveMyRole)}</span>
            <span className="text-nexus-line"> · </span>
            {suggestionRoleLine}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className={`${textBody} flex items-center gap-2 cursor-pointer`}>
              <input
                type="checkbox"
                className="accent-nexus-lime h-3.5 w-3.5"
                checked={suggestOverride}
                onChange={(e) => onSuggestOverride(e.target.checked)}
              />
              I pick my role (uses list below, ignores League / screen)
            </label>
            <select
              className={inField + ' w-auto min-w-[8rem]'}
              value={suggestOverride ? myRole : effectiveMyRole}
              disabled={!suggestOverride}
              onChange={(e) => onMyRole(e.target.value as DraftRole)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <label className={`${textBody} flex items-center gap-2 cursor-pointer`}>
            <input
              type="checkbox"
              className="accent-nexus-lime h-3.5 w-3.5"
              checked={useManual}
              onChange={(e) => onUseManual(e.target.checked)}
            />
            Use manual board (ignores the League client for the 10 slots)
          </label>
        </div>
      </NexusPanel>

      {useManual && (
        <NexusPanel kicker="board" title="Manual draft (10 slots)">
          <div className="mt-1 grid grid-cols-[5.5rem_1fr_1fr] gap-x-2 gap-y-1.5 text-xs sm:text-sm max-h-[22rem] overflow-y-auto nexus-ops-scroll pr-1 items-center">
            <div />
            <div className="text-center font-mono text-nexus-lime/85 uppercase text-[10px] tracking-widest">Ally</div>
            <div className="text-center font-mono text-nexus-lime/85 uppercase text-[10px] tracking-widest">Enemy</div>
            {ROLES.map((role) => (
              <div className="contents" key={role}>
                <span className="font-mono text-nexus-muted text-[10px] sm:text-xs uppercase tracking-wide">{role}</span>
                <select
                  className={inField + ' max-w-none w-full text-xs'}
                  value={manual.ally[role] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    onManualAlly(role, v ? Number(v) : null)
                  }}
                >
                  <option value="">—</option>
                  {sorted.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className={inField + ' max-w-none w-full text-xs'}
                  value={manual.enemy[role] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    onManualEnemy(role, v ? Number(v) : null)
                  }}
                >
                  <option value="">—</option>
                  {sorted.map((c) => (
                    <option key={`e-${c.id}`} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </NexusPanel>
      )}

      <NexusPanel kicker="model" title="Draft model">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-4 border-b border-nexus-line/50 pb-4">
          <label className="flex flex-col gap-1.5 min-w-0">
            <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
              Monte Carlo rollouts
            </span>
            <input
              type="number"
              min={0}
              max={maxSuggestMcRollouts}
              step={1}
              className={inField + ' w-[6.5rem] tabular-nums'}
              value={suggestMcRollouts}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v)) {
                  onSuggestMcRollouts(v)
                }
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5 min-w-0">
            <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
              Sort picks by
            </span>
            <select
              className={inField + ' w-[10.5rem]'}
              value={suggestSortBy}
              onChange={(e) => onSuggestSortBy(e.target.value === 'delta' ? 'delta' : 'score')}
            >
              <option value="score">Model score</option>
              <option value="delta">Winrate delta</option>
            </select>
          </label>
          {suggestSortBy === 'delta' && (
            <label className="flex flex-col gap-1.5 min-w-0">
              <span className="font-mono text-[10px] sm:text-xs text-nexus-lime/85 uppercase tracking-[0.12em]">
                Delta list
              </span>
              <select
                className={inField + ' w-[11rem]'}
                value={suggestDeltaListMode}
                onChange={(e) => onSuggestDeltaListMode(e.target.value === 'worst' ? 'worst' : 'best')}
              >
                <option value="best">Best in context first</option>
                <option value="worst">Worst in context first</option>
              </select>
            </label>
          )}
          <p className={`${textMuted} text-xs sm:text-sm max-w-xl m-0 flex-1 min-w-0 leading-relaxed`}>
            0 = V1-only (fast; top order barely moves). Increase so rankings react as picks lock (more rollouts = stronger
            reaction, more CPU; max {maxSuggestMcRollouts}).
          </p>
        </div>
        <p className={`${textMuted} text-sm sm:text-base leading-relaxed mb-4`}>
          {modelDescription}
        </p>
        <p className="font-mono text-xs text-nexus-lime/80 mb-3">
          {suggestSortBy === 'delta'
            ? suggestDeltaListMode === 'worst'
              ? 'Ordered by smallest winrate delta (risky / downgraded in this lobby) first'
              : 'Ordered by largest winrate delta (best lift in this lobby) first'
            : 'Top picks (sorted by model score)'}
        </p>
        <ol className="list-decimal pl-4 sm:pl-5 space-y-3 font-mono text-sm text-nexus-text/90 max-w-3xl">
          {suggestions.length === 0 && (
            <li className="list-none -ml-4 sm:-ml-5 text-nexus-muted pl-0">
              No ideas yet — set role, load League champ select, or use manual picks.
            </li>
          )}
          {suggestions.map((s) => (
            <li key={s.championId} className="border-b border-nexus-line/40 pb-3 last:border-0 last:pb-0">
              <span className="text-nexus-lime/95 font-medium">{s.championName}</span>
              <span className="text-nexus-line"> </span>
              <span className="text-nexus-lime/70">({s.score})</span>
              {s.estWin != null && (
                <span className="text-nexus-muted text-xs"> ~{(s.estWin * 100).toFixed(1)}% est</span>
              )}{' '}
              <span className="text-nexus-text/80">{s.reasons.join(', ')}</span>
              {s.baseWinRate != null && s.contextWinRate != null && s.winRateDelta != null && (
                <div className="text-nexus-muted text-xs mt-1">
                  WR {(s.baseWinRate * 100).toFixed(1)}% → {(s.contextWinRate * 100).toFixed(1)}%
                  <span className={s.winRateDelta >= 0 ? 'text-nexus-lime/80' : 'text-nexus-red/80'}>
                    {' '}
                    ({s.winRateDelta >= 0 ? '+' : ''}
                    {(s.winRateDelta * 100).toFixed(1)}%)
                  </span>
                </div>
              )}
              {s.detail && <div className="text-nexus-muted text-xs mt-1">{s.detail}</div>}
              {s.runes && (
                <div className="text-nexus-muted text-xs mt-1.5">
                  {s.runes.primaryTree} · {s.runes.keystone} · {s.runes.secondary}
                  {s.runes.note && <span> — {s.runes.note}</span>}
                </div>
              )}
              {s.buildProfile && (
                <div className="text-nexus-muted text-xs mt-1.5 leading-relaxed">
                  <span className="text-nexus-lime/80 uppercase font-medium">{s.buildProfile.damage}</span>
                  <span className="text-nexus-line"> · </span>
                  <span>{s.buildProfile.archetype}</span>
                  {s.buildProfile.tagsLine !== '—' && (
                    <span className="text-nexus-line/80"> — {s.buildProfile.tagsLine}</span>
                  )}
                  <div className="text-nexus-text/80 mt-0.5">{s.buildProfile.buildHint}</div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </NexusPanel>

      <NexusPanel kicker="hud" title="Overlay">
        <p className={`${textMuted} text-sm mb-3`}>
          <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">Insert</kbd>,{' '}
          <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">F9</kbd>, or{' '}
          <kbd className="px-1 border border-nexus-line/70 bg-nexus-bg text-nexus-text/90">F10</kbd> — show or hide
          the small window. Full-screen or borderless League works best.
        </p>
        <button type="button" className={btnPrimary} onClick={onToggleOverlay}>
          Toggle overlay
        </button>
      </NexusPanel>
    </div>
  )
}
