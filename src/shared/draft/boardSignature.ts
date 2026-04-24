import type { DraftRole, DraftSnapshot } from './types'

/**
 * Stable string for a draft board + model inputs. Use for cache keys, overlay refresh, MC seeds.
 */
export function draftBoardSignature(
  s: DraftSnapshot,
  role: DraftRole,
  extra?: { mcRollouts?: number; sortBy?: string; deltaListMode?: string }
): string {
  const slots = [...s.ally, ...s.enemy].map((p) => `${p.role}:${p.championId ?? 0}:${p.cellId ?? ''}`)
  const bans = (s.bans ?? []).join(',')
  const mc = extra?.mcRollouts ?? ''
  const sort = extra?.sortBy ?? ''
  const dlm = extra?.deltaListMode ?? ''
  return [role, bans, s.myPickOrder ?? '', s.localPlayerCellId ?? '', mc, sort, dlm, slots.join(';')].join('|')
}
