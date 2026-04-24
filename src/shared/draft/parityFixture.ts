/**
 * Map training/examples `parity_state.json` (Python `live_state` shape) to DraftEngineState
 * so the same fixture drives training/score_v1, draft_v1, and recommend() parity checks.
 *
 * - Champion IDs are canonical; names are only for display in SlotPick.
 * - Python `my_role: "adc"` maps to TS `bottom` (ROLE_CHAMPION_POOL + engine convention).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEngineState, type DraftEngineState, type DraftTier } from './draftState'
import type { DraftRole, DraftSnapshot, SlotPick } from './types'
import { v1ComponentScores } from './recommendEngine'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
/** Repo root: …/LeagueOfLegendsDrafter/ */
const repoRoot = join(__dirname, '..', '..', '..')

export type ParityStateJson = {
  patch: string
  queue: string
  tier_bucket: string
  region?: string
  side: 'blue' | 'red'
  my_role: string
  ally_role_picks: Record<string, number>
  enemy_role_picks: Record<string, number>
  bans: number[]
  candidates: number[]
  comfort?: Record<string, number>
  n_monte_carlo?: number
}

const ROLE_ALIASES: Record<string, DraftRole> = {
  top: 'top',
  jungle: 'jungle',
  mid: 'middle',
  middle: 'middle',
  adc: 'bottom',
  bottom: 'bottom',
  support: 'support',
  utility: 'support',
}

const ORDER: { role: DraftRole; key: string }[] = [
  { role: 'top', key: 'top' },
  { role: 'jungle', key: 'jungle' },
  { role: 'middle', key: 'mid' },
  { role: 'bottom', key: 'adc' },
  { role: 'support', key: 'support' }
]

/**
 * @param j parity_state or live_state JSON (ids for picks/bans; my_role "adc" allowed)
 */
export function buildSnapshotFromParityState(
  j: ParityStateJson,
  nameMap: ((id: number) => string) | null
): DraftSnapshot {
  const n = (id: number) => (nameMap ? nameMap(id) : String(id))
  const myTeam = (j.side === 'blue' ? '100' : '200') as '100' | '200'
  const a = j.ally_role_picks || {}
  const e = j.enemy_role_picks || {}
  const ally: SlotPick[] = ORDER.map(({ role, key }) => {
    const id =
      a[key] ??
      (key === 'mid' ? a['mid'] ?? a['middle'] : undefined) ??
      (key === 'adc' || key === 'bottom' ? a['adc'] : undefined)
    const cid = id != null && id > 0 ? id : null
    return {
      role,
      championId: cid,
      championName: cid != null ? n(cid) : null,
      cellId: null
    }
  })
  const enemy: SlotPick[] = ORDER.map(({ role, key }) => {
    const id =
      e[key] ?? (key === 'mid' ? e['mid'] ?? e['middle'] : undefined) ?? (key === 'adc' ? e['adc'] : undefined)
    const cid = id != null && id > 0 ? id : null
    return {
      role,
      championId: cid,
      championName: cid != null ? n(cid) : null,
      cellId: null
    }
  })
  return {
    ally,
    enemy,
    myTeam,
    myRole: null,
    localPlayerCellId: 3,
    bans: j.bans ?? null
  }
}

export function myRoleToDraft(j: ParityStateJson): DraftRole {
  const r = (j.my_role || 'unknown').toLowerCase()
  return ROLE_ALIASES[r] ?? 'unknown'
}

export function buildEngineStateFromParity(
  j: ParityStateJson,
  nameMap: ((id: number) => string) | null
): { state: DraftEngineState; myRole: DraftRole } {
  const myRole = myRoleToDraft(j)
  const snap = buildSnapshotFromParityState(j, nameMap)
  const tier = (j.tier_bucket as DraftTier) || 'all'
  const st = buildEngineState(snap, myRole, {
    bans: j.bans,
    myPickOrder: 4,
    dataDragonVersion: j.patch,
    patch: j.patch,
    tier
  })
  return { state: st, myRole }
}

export function comfortMapFromParity(j: ParityStateJson): ReadonlyMap<number, number> | null {
  const c = j.comfort
  if (!c || typeof c !== 'object') {
    return null
  }
  const m = new Map<number, number>()
  for (const [k, v] of Object.entries(c)) {
    m.set(parseInt(String(k), 10), v)
  }
  return m
}

/**
 * Ranks the fixture's `candidates` only (same set as `training/score_v1.py` CLI) for parity.
 */
export function rankParityCandidates(
  j: ParityStateJson,
  nameMap: ((id: number) => string) | null
): {
  rows: { championId: number; combined: number; base: number; ally: number; enemy: number; comfort: number }[]
} {
  const { state, myRole } = buildEngineStateFromParity(j, nameMap)
  const comfortM = comfortMapFromParity(j)
  if (
    myRole !== 'top' &&
    myRole !== 'jungle' &&
    myRole !== 'middle' &&
    myRole !== 'bottom' &&
    myRole !== 'support'
  ) {
    return { rows: [] }
  }
  const poolKey = myRole
  const idToNameMap: Map<number, string> | null =
    nameMap == null
      ? null
      : (() => {
          const m = new Map<number, string>()
          for (const p of [...state.snapshot.ally, ...state.snapshot.enemy]) {
            if (p.championId != null && p.championId > 0) {
              m.set(p.championId, nameMap(p.championId))
            }
          }
          for (const cid of j.candidates || []) {
            m.set(cid, nameMap(cid))
          }
          return m
        })()
  const rows: {
    championId: number
    combined: number
    base: number
    ally: number
    enemy: number
    comfort: number
  }[] = []
  for (const c of j.candidates || []) {
    const comp = v1ComponentScores(c, poolKey, state, idToNameMap, comfortM)
    rows.push({
      championId: c,
      combined: comp.combined,
      base: comp.base,
      ally: comp.ally,
      enemy: comp.enemy,
      comfort: comp.comfort
    })
  }
  rows.sort((a, b) => b.combined - a.combined)
  return { rows }
}

export function readParityFixture(): ParityStateJson {
  const p = join(repoRoot, 'training', 'examples', 'parity_state.json')
  return JSON.parse(readFileSync(p, 'utf-8')) as ParityStateJson
}
