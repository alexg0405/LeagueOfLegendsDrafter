import { useMemo, useState } from 'react'
import {
  publicMetaMatchupsAgainstRole,
  publicMetaPrimaryRoleForChampion,
  type DraftRole,
  type RoleKey
} from '@shared/draft'
import { NexusInfoTip } from './NexusInfoTip'

/**
 * Compact "who beats who" list for the champion the player is actually on, sized for the
 * ~380px overlay. Same Emerald+ counter seed as the desktop Champion Matchups panel.
 */

type SortMode = 'worst' | 'best'

const ROLE_LABEL: Record<RoleKey, string> = {
  top: 'Top',
  jungle: 'Jungle',
  middle: 'Mid',
  bottom: 'Bot',
  support: 'Support'
}

const ROLE_ORDER: RoleKey[] = ['top', 'jungle', 'middle', 'bottom', 'support']

/** Overlay roles include `unknown`; the meta seed is only keyed by the five lanes. */
function toRoleKey(role: DraftRole | null | undefined): RoleKey | null {
  return role && role !== 'unknown' ? (role as RoleKey) : null
}

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
  lockedEnemyIds
}: {
  championId: number
  championName: string
  myRole: DraftRole | null
  nameById: ReadonlyMap<number, string> | null
  iconUrl: (id: number | null | undefined) => string | null
  lockedEnemyIds?: readonly number[]
}) {
  const [sortMode, setSortMode] = useState<SortMode>('worst')
  const [overrideEnemyRole, setOverrideEnemyRole] = useState<RoleKey | null>(null)

  const laneRole = useMemo(
    (): RoleKey => toRoleKey(myRole) ?? publicMetaPrimaryRoleForChampion(championId) ?? 'middle',
    [myRole, championId]
  )
  const enemyRole = overrideEnemyRole ?? laneRole

  const locked = useMemo(() => new Set(lockedEnemyIds ?? []), [lockedEnemyIds])

  const rows = useMemo(() => {
    const list = publicMetaMatchupsAgainstRole(championId, laneRole, enemyRole)
    const ordered = sortMode === 'worst' ? list : [...list].reverse()
    if (locked.size === 0) {
      return ordered.slice(0, 40)
    }
    // Enemies already on the board are what the player needs first.
    const hit = ordered.filter((r) => locked.has(r.enemyId))
    const rest = ordered.filter((r) => !locked.has(r.enemyId))
    return [...hit, ...rest].slice(0, 40)
  }, [championId, laneRole, enemyRole, sortMode, locked])

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-2 border-b border-nexus-line pb-1.5">
        <h3 className="m-0 mr-auto flex items-center gap-1.5 font-mono text-sm font-bold uppercase tracking-[0.12em] text-nexus-lime/95">
          Your matchups
          <NexusInfoTip label="About these matchups" tone="lime">
            Lane win rates for <b>{championName}</b> against each enemy champion, from the Emerald+
            public counter seed. Enemies already locked into this draft are listed first.
          </NexusInfoTip>
        </h3>
        <button
          type="button"
          className={
            sortMode === 'worst'
              ? 'nexus-focus border border-nexus-red/60 bg-nexus-red/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-nexus-red/90'
              : 'nexus-focus border border-nexus-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-nexus-muted hover:text-nexus-text'
          }
          onClick={() => setSortMode('worst')}
          title="Hardest matchups first"
        >
          Hard
        </button>
        <button
          type="button"
          className={
            sortMode === 'best'
              ? 'nexus-focus border border-nexus-lime/60 bg-nexus-lime/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-nexus-lime/90'
              : 'nexus-focus border border-nexus-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-nexus-muted hover:text-nexus-text'
          }
          onClick={() => setSortMode('best')}
          title="Easiest matchups first"
        >
          Easy
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1 font-mono text-[10px]">
        <span className="uppercase tracking-[0.1em] text-nexus-muted">vs</span>
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

      {rows.length === 0 ? (
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
      )}
    </section>
  )
}
