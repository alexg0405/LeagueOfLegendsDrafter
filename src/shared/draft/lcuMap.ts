import { ROLE_CHAMPION_POOL } from './matchupData'
import { publicMetaCandidateIdsForRole } from './metaStats'
import type { DraftRole, DraftSnapshot, SlotPick, TeamId } from './types'

const ROLE_KEYS = ['top', 'jungle', 'middle', 'bottom', 'support'] as const
type RoleKey = (typeof ROLE_KEYS)[number]

const rolePoolSets: Record<RoleKey, Set<number>> = {
  top: new Set([...(ROLE_CHAMPION_POOL.top ?? []), ...publicMetaCandidateIdsForRole('top')]),
  jungle: new Set([...(ROLE_CHAMPION_POOL.jungle ?? []), ...publicMetaCandidateIdsForRole('jungle')]),
  middle: new Set([...(ROLE_CHAMPION_POOL.middle ?? []), ...publicMetaCandidateIdsForRole('middle')]),
  bottom: new Set([...(ROLE_CHAMPION_POOL.bottom ?? []), ...publicMetaCandidateIdsForRole('bottom')]),
  support: new Set([...(ROLE_CHAMPION_POOL.support ?? []), ...publicMetaCandidateIdsForRole('support')])
}

function isRoleKey(role: DraftRole | null | undefined): role is RoleKey {
  return role === 'top' || role === 'jungle' || role === 'middle' || role === 'bottom' || role === 'support'
}

function mapPosition(p: string | undefined | null): DraftRole {
  if (!p || p === '') {
    return 'unknown'
  }
  const x = p.toLowerCase()
  if (x === 'utility') {
    return 'support'
  }
  if (x === 'middle' || x === 'mid') {
    return 'middle'
  }
  if (x === 'jungle' || x === 'jg') {
    return 'jungle'
  }
  if (x === 'top') {
    return 'top'
  }
  if (x === 'bottom' || x === 'adc') {
    return 'bottom'
  }
  if (x === 'support' || x === 'sup') {
    return 'support'
  }
  return 'unknown'
}

function roleCandidatesForChampion(championId: number | null): RoleKey[] {
  if (championId == null || championId <= 0) {
    return []
  }
  return ROLE_KEYS.filter((role) => rolePoolSets[role].has(championId))
}

function inferLocalRoleFromTeam(ally: SlotPick[], localCell: number | null): DraftRole | null {
  if (localCell == null) {
    return null
  }
  const selfIdx = ally.findIndex((s) => s.cellId === localCell)
  if (selfIdx < 0) {
    return null
  }
  const self = ally[selfIdx]!
  const teammateRoles = new Set<RoleKey>()
  for (let i = 0; i < ally.length; i += 1) {
    if (i === selfIdx) {
      continue
    }
    const role = ally[i]?.role
    if (isRoleKey(role)) {
      teammateRoles.add(role)
    }
  }

  const missingRoles = ROLE_KEYS.filter((role) => !teammateRoles.has(role))
  const localRole = isRoleKey(self.role) ? self.role : null
  const championRoles = roleCandidatesForChampion(self.championId)
  const championMissingRoles = missingRoles.filter((role) => championRoles.includes(role))

  if (localRole && missingRoles.includes(localRole)) {
    return localRole
  }
  if (championMissingRoles.length === 1) {
    return championMissingRoles[0]
  }
  if (missingRoles.length === 1 && (self.role === 'unknown' || (localRole != null && teammateRoles.has(localRole)))) {
    return missingRoles[0]
  }
  if (localRole) {
    return localRole
  }
  if (championRoles.length === 1) {
    return championRoles[0]
  }
  return null
}

type LcuTeamMember = {
  championId?: number
  /** Hover / planning intent when `championId` is still 0 */
  championPickIntent?: number
  cellId?: number
  assignedPosition?: string
}

/**
 * Best-effort parse of `/lol-champ-select/v1/session` JSON.
 */
export function parseLcuChampSelectSession(raw: unknown): DraftSnapshot | null {
  if (raw == null || typeof raw !== 'object') {
    return null
  }
  const o = raw as Record<string, unknown>
  const myTeam = o['myTeam']
  const theirTeam = o['theirTeam']
  if (!Array.isArray(myTeam) || !Array.isArray(theirTeam)) {
    return null
  }

  const mapMember = (m: unknown): SlotPick => {
    if (m == null || typeof m !== 'object') {
      return {
        role: 'unknown',
        championId: null,
        championName: null,
        cellId: null
      }
    }
    const t = m as LcuTeamMember
    const cid = typeof t.championId === 'number' ? t.championId : null
    const intent =
      typeof t.championPickIntent === 'number' && t.championPickIntent > 0 ? t.championPickIntent : null
    const effective = cid != null && cid > 0 ? cid : intent
    const cellId = typeof t.cellId === 'number' ? t.cellId : null
    return {
      role: mapPosition(t.assignedPosition),
      championId: effective == null || effective === 0 ? null : effective,
      championName: null,
      cellId
    }
  }

  const ally: SlotPick[] = (myTeam as unknown[]).slice(0, 5).map(mapMember)
  const enemy: SlotPick[] = (theirTeam as unknown[]).slice(0, 5).map(mapMember)
  mergePickChampionsFromActions(ally, enemy, o['actions'])

  const localCell =
    typeof o['localPlayerCellId'] === 'number' ? (o['localPlayerCellId'] as number) : null
  const myRole = inferLocalRoleFromTeam(ally, localCell)

  let team: TeamId | null = null
  if (typeof o['myTeam'] === 'object' && myTeam[0] != null && typeof myTeam[0] === 'object') {
    const t0 = myTeam[0] as { team?: number }
    if (t0.team === 1) {
      team = '100'
    }
    if (t0.team === 2) {
      team = '200'
    }
  }

  const bans = parseBans(o)
  const myPickOrder = parseMyPickOrder(o, localCell)

  return {
    ally,
    enemy,
    myTeam: team,
    myRole,
    localPlayerCellId: localCell,
    bans,
    myPickOrder
  }
}

type LcuAction = {
  actorCellId?: number
  championId?: number
  /** Ban / pick hover before lock (LCU mirrors team member fields on actions). */
  championPickIntent?: number
  completed?: boolean
  type?: string
  pickTurn?: number
}

function effectiveActionChampionId(a: LcuAction): number | null {
  const cid = typeof a.championId === 'number' && a.championId > 0 ? a.championId : null
  const intent =
    typeof a.championPickIntent === 'number' && a.championPickIntent > 0 ? a.championPickIntent : null
  return cid ?? intent
}

/**
 * `myTeam` / `theirTeam` sometimes lag behind the live `actions` pick rows. Merge any pick
 * action with a non-zero `championId` onto the matching `cellId` so the draft model sees locks
 * (and hover selections) as soon as the client exposes them.
 */
function mergePickChampionsFromActions(ally: SlotPick[], enemy: SlotPick[], actions: unknown): void {
  if (!Array.isArray(actions)) {
    return
  }
  const byCell = new Map<number, number>()
  for (const group of actions) {
    if (!Array.isArray(group)) {
      continue
    }
    for (const act of group) {
      if (act == null || typeof act !== 'object') {
        continue
      }
      const a = act as LcuAction
      if (a.type !== 'pick') {
        continue
      }
      const cid = effectiveActionChampionId(a)
      const cell = a.actorCellId
      if (cid == null || typeof cell !== 'number') {
        continue
      }
      byCell.set(cell, cid)
    }
  }
  if (byCell.size === 0) {
    return
  }
  const apply = (row: SlotPick) => {
    if (row.cellId == null) {
      return
    }
    const cid = byCell.get(row.cellId)
    if (cid == null || cid <= 0) {
      return
    }
    // Actions are the live source during champ select; they can update sooner than myTeam/theirTeam rows.
    if (row.championId !== cid) {
      row.championId = cid
      row.championName = null
    }
  }
  for (const p of ally) {
    apply(p)
  }
  for (const p of enemy) {
    apply(p)
  }
}

function pushChampionId(out: number[], x: unknown) {
  if (typeof x === 'number' && x > 0) {
    out.push(Math.trunc(x))
    return
  }
  if (typeof x === 'string' && x.trim() !== '') {
    const n = Number(x)
    if (Number.isFinite(n) && n > 0) {
      out.push(Math.trunc(n))
    }
    return
  }
  if (x != null && typeof x === 'object' && 'championId' in (x as object)) {
    const id = (x as { championId?: unknown }).championId
    if (typeof id === 'number' && id > 0) {
      out.push(Math.trunc(id))
    }
  }
}

/** From `bans: { myTeamBans, theirTeamBans }` (ids or LCU objects), or a plain id array. */
function parseBansFromBansObject(b: unknown): number[] {
  if (b == null) {
    return []
  }
  if (Array.isArray(b)) {
    const out: number[] = []
    for (const x of b) {
      pushChampionId(out, x)
    }
    return out
  }
  if (typeof b !== 'object') {
    return []
  }
  const bo = b as Record<string, unknown>
  const out: number[] = []
  for (const key of ['myTeamBans', 'theirTeamBans'] as const) {
    const arr = bo[key]
    if (!Array.isArray(arr)) {
      continue
    }
    for (const x of arr) {
      pushChampionId(out, x)
    }
  }
  return out
}

/**
 * Bans that only appear in the pick/ban `actions` array until the session’s `bans` block is filled.
 * Each `actions` entry is a group; each item has `type: 'ban' | 'pick'` and `championId` when set.
 */
function parseBansFromActions(actions: unknown): number[] {
  const out: number[] = []
  if (!Array.isArray(actions)) {
    return out
  }
  for (const group of actions) {
    if (!Array.isArray(group)) {
      continue
    }
    for (const act of group) {
      if (act == null || typeof act !== 'object') {
        continue
      }
      const a = act as LcuAction
      if (a.type !== 'ban') {
        continue
      }
      const cid = effectiveActionChampionId(a)
      if (cid != null) {
        out.push(cid)
      }
    }
  }
  return out
}

function parseBans(o: Record<string, unknown>): number[] | null {
  const fromBans = parseBansFromBansObject(o['bans'])
  const fromActions = parseBansFromActions(o['actions'])
  const merged = Array.from(new Set([...fromBans, ...fromActions]))
  return merged.length > 0 ? merged : null
}

/**
 * Best-effort: smallest pickTurn among incomplete pick actions for the local player.
 */
function parseMyPickOrder(o: Record<string, unknown>, localCell: number | null): number | null {
  if (localCell == null) {
    return null
  }
  const actions = o['actions']
  if (!Array.isArray(actions)) {
    return null
  }
  let best: number | null = null
  for (const group of actions) {
    if (!Array.isArray(group)) {
      continue
    }
    for (const act of group) {
      if (act == null || typeof act !== 'object') {
        continue
      }
      const a = act as LcuAction
      if (a.type !== 'pick') {
        continue
      }
      if (a.completed) {
        continue
      }
      if (a.actorCellId !== localCell) {
        continue
      }
      const pt = typeof a.pickTurn === 'number' ? a.pickTurn : null
      if (pt != null && pt > 0) {
        if (best == null || pt < best) {
          best = pt
        }
      }
    }
  }
  return best
}
