import { describe, expect, it } from 'vitest'
import { inferredLaneWeightForEnemy, inferEnemyRolePosteriors } from './roleInference'
import type { DraftSnapshot } from './types'

const emptyBoard: DraftSnapshot = {
  ally: [
    { role: 'top', championId: null, championName: null, cellId: 0 },
    { role: 'jungle', championId: null, championName: null, cellId: 1 },
    { role: 'middle', championId: null, championName: null, cellId: 2 },
    { role: 'bottom', championId: null, championName: null, cellId: 3 },
    { role: 'support', championId: null, championName: null, cellId: 4 }
  ],
  enemy: [
    { role: 'top', championId: null, championName: null, cellId: 5 },
    { role: 'jungle', championId: null, championName: null, cellId: 6 },
    { role: 'middle', championId: null, championName: null, cellId: 7 },
    { role: 'bottom', championId: null, championName: null, cellId: 8 },
    { role: 'support', championId: null, championName: null, cellId: 9 }
  ],
  myTeam: '100',
  myRole: 'middle',
  localPlayerCellId: 2,
  bans: [],
  myPickOrder: null
}

describe('inferEnemyRolePosteriors', () => {
  it('returns empty map when no enemy picks are locked', () => {
    expect(inferEnemyRolePosteriors(emptyBoard).size).toBe(0)
  })

  it('reassigns flex pick when a hard support is already present', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'middle', championId: 25, championName: 'Morgana', cellId: 5 },
        { role: 'support', championId: 53, championName: 'Blitzcrank', cellId: 6 },
        { role: 'top', championId: null, championName: null, cellId: 7 },
        { role: 'jungle', championId: null, championName: null, cellId: 8 },
        { role: 'bottom', championId: null, championName: null, cellId: 9 }
      ]
    }
    const post = inferEnemyRolePosteriors(snap)
    const morg = post.get(0)
    expect(morg).toBeTruthy()
    expect((morg?.middle ?? 0) > (morg?.support ?? 0)).toBe(true)
    const blitz = post.get(1)
    expect((blitz?.support ?? 0) > 0.75).toBe(true)
  })

  it('converts posterior to lane weight in [offRoleFloor, 1]', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'middle', championId: 25, championName: 'Morgana', cellId: 5 },
        { role: 'support', championId: 53, championName: 'Blitzcrank', cellId: 6 },
        { role: 'top', championId: null, championName: null, cellId: 7 },
        { role: 'jungle', championId: null, championName: null, cellId: 8 },
        { role: 'bottom', championId: null, championName: null, cellId: 9 }
      ]
    }
    const post = inferEnemyRolePosteriors(snap)
    const wMid = inferredLaneWeightForEnemy(post, 0, 'middle')
    const wSup = inferredLaneWeightForEnemy(post, 0, 'support')
    expect(wMid).toBeGreaterThan(0.12)
    expect(wMid).toBeLessThanOrEqual(1)
    expect(wSup).toBeGreaterThanOrEqual(0.18)
    expect(wSup).toBeLessThanOrEqual(1)
  })

  it('trusts assigned enemy role when the static pool misses a valid flex pick', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'jungle', championId: 2, championName: 'Olaf', cellId: 5 },
        { role: 'top', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ]
    }
    const post = inferEnemyRolePosteriors(snap)
    const olaf = post.get(0)
    expect(olaf?.jungle ?? 0).toBeGreaterThan(0.75)
    expect(inferredLaneWeightForEnemy(post, 0, 'jungle')).toBeGreaterThan(0.8)
  })
})
