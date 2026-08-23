import {
  publicMetaMatchupsAgainstRole,
  publicMetaPrimaryRoleForChampion,
  type DraftRole,
  type PublicMetaMatchupRow,
  type RoleKey
} from '@shared/draft'

/**
 * Row selection for the overlay matchup list, kept free of JSX so it can be tested.
 * The overlay is the surface with no live data in dev, so this logic gets a unit test
 * rather than relying on a champ select to catch regressions.
 */

export type MatchupSortMode = 'worst' | 'best'

export const OVERLAY_MATCHUP_LIMIT = 40

/** Overlay roles include `unknown`; the meta seed is only keyed by the five lanes. */
export function toRoleKey(role: DraftRole | null | undefined): RoleKey | null {
  return role && role !== 'unknown' ? (role as RoleKey) : null
}

/** The lane to score in: the player's role, else the champion's usual lane, else mid. */
export function resolveLaneRole(myRole: DraftRole | null | undefined, championId: number): RoleKey {
  return toRoleKey(myRole) ?? publicMetaPrimaryRoleForChampion(championId) ?? 'middle'
}

/**
 * `worst` keeps the seed's ascending win-rate order (hardest lanes first); `best` reverses it.
 * Enemies already locked into the draft are floated to the top of whichever order is active,
 * because those are the only matchups the player can still act on.
 */
export function orderMatchupRows(
  rows: readonly PublicMetaMatchupRow[],
  sortMode: MatchupSortMode,
  lockedEnemyIds?: Iterable<number>,
  limit: number = OVERLAY_MATCHUP_LIMIT
): PublicMetaMatchupRow[] {
  const ordered = sortMode === 'worst' ? [...rows] : [...rows].reverse()
  const locked = new Set(lockedEnemyIds ?? [])
  if (locked.size === 0) {
    return ordered.slice(0, limit)
  }
  const inGame = ordered.filter((row) => locked.has(row.enemyId))
  const rest = ordered.filter((row) => !locked.has(row.enemyId))
  return [...inGame, ...rest].slice(0, limit)
}

/** Full pipeline: fetch the seed rows for a lane pair, then order them. */
export function overlayMatchupRows(args: {
  championId: number
  laneRole: RoleKey
  enemyRole: RoleKey
  sortMode: MatchupSortMode
  lockedEnemyIds?: Iterable<number>
  limit?: number
}): PublicMetaMatchupRow[] {
  const rows = publicMetaMatchupsAgainstRole(args.championId, args.laneRole, args.enemyRole)
  return orderMatchupRows(rows, args.sortMode, args.lockedEnemyIds, args.limit)
}
