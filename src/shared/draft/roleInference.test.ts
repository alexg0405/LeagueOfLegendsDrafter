import { describe, expect, it } from 'vitest'
import { inferEnemyRoleAssignments, inferredLaneWeightForEnemy, inferEnemyRolePosteriors } from './roleInference'
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

  it('marks a clear primary-role champion as likely in its assigned role', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'bottom', championId: 222, championName: 'Jinx', cellId: 5 },
        { role: 'top', championId: null, championName: null, cellId: 6 },
        { role: 'jungle', championId: null, championName: null, cellId: 7 },
        { role: 'middle', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ]
    }
    const [jinx] = inferEnemyRoleAssignments(snap)
    expect(jinx?.inferredRole).toBe('bottom')
    expect(jinx?.confidenceLabel).toBe('likely')
    expect(jinx?.confidence ?? 0).toBeGreaterThanOrEqual(0.75)
  })

  it('uses candidate:false off-meta role rows when the assigned slot supports them', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'top', championId: 67, championName: 'Vayne', cellId: 5 },
        { role: 'jungle', championId: null, championName: null, cellId: 6 },
        { role: 'middle', championId: null, championName: null, cellId: 7 },
        { role: 'bottom', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ]
    }
    const [vayne] = inferEnemyRoleAssignments(snap)
    expect(vayne?.inferredRole).toBe('top')
    expect(vayne?.roleProbabilities.top ?? 0).toBeGreaterThan(0.45)
  })

  it('can move a flex pick when a primary-role champion occupies the same slot role', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'bottom', championId: 67, championName: 'Vayne', cellId: 5 },
        { role: 'bottom', championId: 222, championName: 'Jinx', cellId: 6 },
        { role: 'jungle', championId: null, championName: null, cellId: 7 },
        { role: 'middle', championId: null, championName: null, cellId: 8 },
        { role: 'support', championId: null, championName: null, cellId: 9 }
      ]
    }
    const roles = new Map(inferEnemyRoleAssignments(snap).map((row) => [row.championId, row.inferredRole]))
    expect(roles.get(222)).toBe('bottom')
    expect(roles.get(67)).toBe('top')
  })

  it('uses champion role distribution when enemy slot roles are unknown', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'unknown', championId: 238, championName: 'Zed', cellId: 5 },
        { role: 'unknown', championId: null, championName: null, cellId: 6 },
        { role: 'unknown', championId: null, championName: null, cellId: 7 },
        { role: 'unknown', championId: null, championName: null, cellId: 8 },
        { role: 'unknown', championId: null, championName: null, cellId: 9 }
      ]
    }
    const [zed] = inferEnemyRoleAssignments(snap)
    expect(zed?.inferredRole).toBe('middle')
    expect(zed?.roleProbabilities.middle ?? 0).toBeGreaterThan(zed?.roleProbabilities.jungle ?? 0)
  })

  it('keeps one-to-one role assignments across a full enemy team', () => {
    const snap: DraftSnapshot = {
      ...emptyBoard,
      enemy: [
        { role: 'top', championId: 2, championName: 'Olaf', cellId: 5 },
        { role: 'jungle', championId: 64, championName: 'Lee Sin', cellId: 6 },
        { role: 'middle', championId: 103, championName: 'Ahri', cellId: 7 },
        { role: 'bottom', championId: 222, championName: 'Jinx', cellId: 8 },
        { role: 'support', championId: 111, championName: 'Nautilus', cellId: 9 }
      ]
    }
    const roles = inferEnemyRoleAssignments(snap).map((row) => row.inferredRole)
    expect(new Set(roles).size).toBe(5)
    expect(roles).toEqual(expect.arrayContaining(['top', 'jungle', 'middle', 'bottom', 'support']))
  })
})
