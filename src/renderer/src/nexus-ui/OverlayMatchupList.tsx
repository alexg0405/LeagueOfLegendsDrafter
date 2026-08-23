import { useMemo, useState } from 'react'
import { publicMetaMatchupsAgainstRole, type DraftRole, type RoleKey } from '@shared/draft'
import { NexusInfoTip } from './NexusInfoTip'
import { overlayMatchupRows, resolveLaneRole, type MatchupSortMode } from './overlayMatchupOrder'

/**
 * Compact "who beats who" list sized for the ~380px overlay, backed by the same
 * Emerald+ counter seed as the desktop Champion Matchups panel.
 *
 * Used twice: as an always-open section for the champion the player is locked onto,
 * and as a collapsed chip inside the champion lookup card.
 */

const ROLE_LABEL: Record<RoleKey, string> = {
  top: 'Top',
  jungle: 'Jungle',
  middle: 'Mid',
  bottom: 'Bot',
  support: 'Support'
}

const ROLE_ORDER: RoleKey[] = ['top', 'jungle', 'middle', 'bottom', 'support']

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

export function OverlayMatchupList({
  championId,
  championName,
  myRole,
  nameById,
  iconUrl,
  /** Enemy champion ids already locked in, highlighted and floated to the top. */
  lockedEnemyIds,
  heading = 'Your matchups',
  /** Render as a closed disclosure chip instead of an always-open section. */
  collapsible = false
}: {
  championId: number
  championName: string
  myRole: DraftRole | null
  nameById: ReadonlyMap<number, string> | null
  iconUrl: (id: number | null | undefined) => string | null
  lockedEnemyIds?: readonly number[]
  heading?: string
  collapsible?: boolean
}) {
  const [sortMode, setSortMode] = useState<MatchupSortMode>('worst')
  const [overrideEnemyRole, setOverrideEnemyRole] = useState<RoleKey | null>(null)

  const laneRole = useMemo(() => resolveLaneRole(myRole, championId), [myRole, championId])
  const enemyRole = overrideEnemyRole ?? laneRole

  const locked = useMemo(() => new Set(lockedEnemyIds ?? []), [lockedEnemyIds])

  const rows = useMemo(
    () => overlayMatchupRows({ championId, laneRole, enemyRole, sortMode, lockedEnemyIds: locked }),
    [championId, laneRole, enemyRole, sortMode, locked]
  )

  /** Three hardest lanes as portraits — the glanceable summary before you expand. */
  const hardest = useMemo(
    () => publicMetaMatchupsAgainstRole(championId, laneRole, laneRole).slice(0, 3),
    [championId, laneRole]
  )

  const sortButton = (mode: MatchupSortMode, label: string, activeClass: string) => (
    <button
      type="button"
      className={
        sortMode === mode
          ? `nexus-focus border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${activeClass}`
          : 'nexus-focus border border-nexus-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-nexus-muted hover:text-nexus-text'
      }
      onClick={() => setSortMode(mode)}
      title={mode === 'worst' ? 'Hardest matchups first' : 'Easiest matchups first'}
    >
      {label}
    </button>
  )

  const controls = (
    <div className="mb-2 flex flex-wrap items-center gap-1 font-mono text-[10px]">
      {sortButton('worst', 'Hard', 'border-nexus-red/60 bg-nexus-red/10 text-nexus-red/90')}
      {sortButton('best', 'Easy', 'border-nexus-lime/60 bg-nexus-lime/10 text-nexus-lime/90')}
      <span className="ml-1 uppercase tracking-[0.1em] text-nexus-muted">vs</span>
      {ROLE_ORDER.map((role) => (
        <button
          key={role}
          type="button"
          className={
            role === enemyRole
              ? 'nexus-focus border border-nexus-lime/60 bg-nexus-lime/10 px-1.5 py-0.5 uppercase text-nexus-lime/90'
              : 'nexus-focus border border-nexus-line px-1.5 py-0.5 uppercase text-nexus-muted hover:text-nexus-text'
          }
          onClick={() => setOverrideEnemyRole(role)}
        >
          {ROLE_LABEL[role]}
        </button>
      ))}
    </div>
  )

  const list =
    rows.length === 0 ? (
      <p className="m-0 font-mono text-xs text-nexus-muted">
        No counter data for {championName} in {ROLE_LABEL[laneRole]} vs {ROLE_LABEL[enemyRole]}.
      </p>
    ) : (
      <ul className="nexus-overlay-no-scrollbar m-0 max-h-56 list-none overflow-y-auto border border-nexus-line/70 bg-nexus-bg/30 p-0">
        {rows.map((row) => {
          const url = iconUrl(row.enemyId)
          const favorable = row.winRate >= 0.5
          const isLocked = locked.has(row.enemyId)
          return (
            <li
              key={row.enemyId}
              className={[
                'flex items-center gap-2 border-b border-nexus-line/40 px-2 py-1.5 last:border-b-0',
                isLocked ? 'bg-nexus-red/[0.10]' : ''
              ].join(' ')}
            >
              {url ? (
                <img
                  src={url}
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 border border-nexus-line/70 object-cover"
                />
              ) : (
                <span className="h-6 w-6 shrink-0 border border-nexus-line/70 bg-nexus-surface-2" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs text-nexus-text/90">
                  {nameById?.get(row.enemyId) ?? `Champion ${row.enemyId}`}
                  {isLocked && (
                    <span className="ml-1.5 border border-nexus-red/60 px-1 text-[9px] uppercase text-nexus-red/90">
                      in game
                    </span>
                  )}
                </span>
                <span className="block font-mono text-[10px] tabular-nums text-nexus-text/60">
                  {row.games} games
                </span>
              </span>
              <span
                className={[
                  'shrink-0 font-mono text-xs font-bold tabular-nums',
                  favorable ? 'text-nexus-lime' : 'text-nexus-red/85'
                ].join(' ')}
                title={`Raw ${formatPct(row.rawWinRate)}`}
              >
                {formatPct(row.winRate)}
              </span>
            </li>
          )
        })}
      </ul>
    )

  const tip = (
    <NexusInfoTip label="About these matchups" tone="lime">
      Lane win rates for <b>{championName}</b> in {ROLE_LABEL[laneRole]} against each enemy
      champion, from the Emerald+ public counter seed. Enemies already locked into this draft are
      listed first.
    </NexusInfoTip>
  )

  if (collapsible) {
    return (
      <details className="group mt-2 border border-nexus-line/65 bg-nexus-bg/25">
        <summary className="nexus-focus flex cursor-pointer list-none items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-nexus-muted marker:hidden">
          <span>Matchups</span>
          {/* Hardest three at a glance, so the row is useful before expanding. */}
          <span className="flex items-center gap-0.5">
            {hardest.map((row) => {
              const url = iconUrl(row.enemyId)
              return url ? (
                <img
                  key={row.enemyId}
                  src={url}
                  alt=""
                  width={16}
                  height={16}
                  className="h-4 w-4 border border-nexus-red/50 object-cover"
                  title={`${nameById?.get(row.enemyId) ?? row.enemyId} · ${formatPct(row.winRate)}`}
                />
              ) : null
            })}
          </span>
          <span className="ml-auto text-nexus-lime/80 transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-nexus-line/55 px-2 py-1.5">
          <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-nexus-muted">
            <span>
              {championName} · {ROLE_LABEL[laneRole]}
            </span>
            {tip}
          </div>
          {controls}
          {list}
        </div>
      </details>
    )
  }

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2 border-b border-nexus-line pb-1.5">
        <h3 className="m-0 mr-auto flex items-center gap-1.5 font-mono text-sm font-bold uppercase tracking-[0.12em] text-nexus-lime/95">
          {heading}
          {tip}
        </h3>
      </div>
      {controls}
      {list}
    </section>
  )
}
