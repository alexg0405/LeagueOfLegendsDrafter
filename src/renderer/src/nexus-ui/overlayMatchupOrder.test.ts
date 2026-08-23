import { describe, expect, it } from 'vitest'
import type { PublicMetaMatchupRow } from '@shared/draft'
import {
  orderMatchupRows,
  overlayMatchupRows,
  resolveLaneRole,
  toRoleKey
} from './overlayMatchupOrder'

const AHRI = 103

function row(enemyId: number, winRate: number): PublicMetaMatchupRow {
  return { enemyId, winRate, rawWinRate: winRate, games: 100, candidate: true } as PublicMetaMatchupRow
}

describe('toRoleKey', () => {
  it('drops the overlay-only unknown role', () => {
    expect(toRoleKey('middle')).toBe('middle')
    expect(toRoleKey('unknown')).toBeNull()
    expect(toRoleKey(null)).toBeNull()
  })
})

describe('resolveLaneRole', () => {
  it('prefers the player role over the champion default', () => {
    expect(resolveLaneRole('support', AHRI)).toBe('support')
  })

  it('falls back to the champion primary lane when the role is unknown', () => {
    expect(resolveLaneRole('unknown', AHRI)).toBe('middle')
  })
})

describe('orderMatchupRows', () => {
  const rows = [row(1, 0.45), row(2, 0.48), row(3, 0.52), row(4, 0.56)]

  it('keeps hardest-first order for worst, reverses for best', () => {
    expect(orderMatchupRows(rows, 'worst').map((r) => r.enemyId)).toEqual([1, 2, 3, 4])
    expect(orderMatchupRows(rows, 'best').map((r) => r.enemyId)).toEqual([4, 3, 2, 1])
  })

  it('floats enemies already in the draft to the top without dropping the rest', () => {
    const out = orderMatchupRows(rows, 'worst', [3])
    expect(out.map((r) => r.enemyId)).toEqual([3, 1, 2, 4])
  })

  it('keeps locked enemies in their relative order', () => {
    const out = orderMatchupRows(rows, 'worst', [4, 2])
    expect(out.map((r) => r.enemyId)).toEqual([2, 4, 1, 3])
  })

  it('applies the limit after promoting locked enemies', () => {
    const out = orderMatchupRows(rows, 'worst', [4], 2)
    expect(out.map((r) => r.enemyId)).toEqual([4, 1])
  })

  it('does not mutate the input', () => {
    const input = [...rows]
    orderMatchupRows(input, 'best', [2])
    expect(input.map((r) => r.enemyId)).toEqual([1, 2, 3, 4])
  })
})

describe('overlayMatchupRows against the real meta seed', () => {
  it('returns lane matchups for a mid champion', () => {
    const out = overlayMatchupRows({
      championId: AHRI,
      laneRole: 'middle',
      enemyRole: 'middle',
      sortMode: 'worst'
    })
    // Guards the overlay panel silently rendering "no counter data".
    expect(out.length).toBeGreaterThan(0)
    expect(out.every((r) => r.enemyId !== AHRI)).toBe(true)
    expect(out.every((r) => r.winRate > 0 && r.winRate < 1)).toBe(true)
  })

  it('orders worst before best', () => {
    const base = { championId: AHRI, laneRole: 'middle', enemyRole: 'middle' } as const
    const worst = overlayMatchupRows({ ...base, sortMode: 'worst' })
    const best = overlayMatchupRows({ ...base, sortMode: 'best' })
    expect(worst[0]!.winRate).toBeLessThanOrEqual(best[0]!.winRate)
  })
})
