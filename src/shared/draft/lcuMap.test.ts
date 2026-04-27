import { describe, expect, it } from 'vitest'
import { buildEngineState } from './draftState'
import { parseLcuChampSelectSession } from './lcuMap'

describe('parseLcuChampSelectSession', () => {
  it('keeps other players pick intents but does not lock the local hover', () => {
    const raw = {
      localPlayerCellId: 0,
      myTeam: [
        {
          team: 1,
          cellId: 0,
          championId: 0,
          championPickIntent: 131,
          assignedPosition: 'jungle'
        },
        {
          team: 1,
          cellId: 1,
          championId: 0,
          championPickIntent: 266,
          assignedPosition: 'top'
        },
        { team: 1, cellId: 2, championId: 0, assignedPosition: 'middle' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: 'bottom' },
        { team: 1, cellId: 4, championId: 0, assignedPosition: 'utility' }
      ],
      theirTeam: [
        { team: 2, cellId: 5, championId: 0, assignedPosition: 'top' },
        { team: 2, cellId: 6, championId: 0, assignedPosition: 'jungle' },
        { team: 2, cellId: 7, championId: 0, assignedPosition: 'middle' },
        { team: 2, cellId: 8, championId: 0, assignedPosition: 'bottom' },
        { team: 2, cellId: 9, championId: 0, assignedPosition: 'utility' }
      ],
      actions: [
        [
          {
            type: 'pick',
            actorCellId: 0,
            championId: 0,
            championPickIntent: 131,
            completed: false,
            pickTurn: 1
          },
          {
            type: 'pick',
            actorCellId: 6,
            championId: 0,
            championPickIntent: 121,
            completed: false,
            pickTurn: 1
          }
        ]
      ]
    }

    const snap = parseLcuChampSelectSession(raw)
    expect(snap).not.toBeNull()
    expect(snap!.myRole).toBe('jungle')
    expect(snap!.ally.find((p) => p.cellId === 0)?.championId).toBeNull()
    expect(snap!.ally.find((p) => p.cellId === 1)?.championId).toBe(266)
    expect(snap!.enemy.find((p) => p.cellId === 6)?.championId).toBe(121)

    const state = buildEngineState(snap!, 'jungle', {
      bans: snap!.bans,
      myPickOrder: snap!.myPickOrder,
      dataDragonVersion: 'test',
      patch: 'test'
    })
    expect(state.unavailable.has(131)).toBe(false)
    expect(state.unavailable.has(266)).toBe(true)
    expect(state.unavailable.has(121)).toBe(true)
  })

  it('fills championId from pick actions when team row is still empty', () => {
    const raw = {
      localPlayerCellId: 0,
      myTeam: [
        {
          team: 1,
          cellId: 0,
          championId: 0,
          championPickIntent: 0,
          assignedPosition: 'jungle'
        },
        {
          team: 1,
          cellId: 1,
          championId: 0,
          assignedPosition: 'top'
        },
        { team: 1, cellId: 2, championId: 0, assignedPosition: 'middle' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: 'bottom' },
        { team: 1, cellId: 4, championId: 0, assignedPosition: 'utility' }
      ],
      theirTeam: [
        { team: 2, cellId: 5, championId: 0, assignedPosition: 'top' },
        { team: 2, cellId: 6, championId: 0, assignedPosition: 'jungle' },
        { team: 2, cellId: 7, championId: 0, assignedPosition: 'middle' },
        { team: 2, cellId: 8, championId: 0, assignedPosition: 'bottom' },
        { team: 2, cellId: 9, championId: 0, assignedPosition: 'utility' }
      ],
      actions: [
        [
          {
            type: 'pick',
            actorCellId: 6,
            championId: 121,
            completed: false,
            pickTurn: 1
          }
        ]
      ]
    }
    const snap = parseLcuChampSelectSession(raw)
    expect(snap).not.toBeNull()
    const jg = snap!.enemy.find((p) => p.cellId === 6)
    expect(jg?.championId).toBe(121)
  })

  it('parses bans from actions using championPickIntent when championId is still 0', () => {
    const raw = {
      localPlayerCellId: 0,
      myTeam: [
        { team: 1, cellId: 0, championId: 0, assignedPosition: 'jungle' },
        { team: 1, cellId: 1, championId: 0, assignedPosition: 'top' },
        { team: 1, cellId: 2, championId: 0, assignedPosition: 'middle' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: 'bottom' },
        { team: 1, cellId: 4, championId: 0, assignedPosition: 'utility' }
      ],
      theirTeam: [
        { team: 2, cellId: 5, championId: 0, assignedPosition: 'top' },
        { team: 2, cellId: 6, championId: 0, assignedPosition: 'jungle' },
        { team: 2, cellId: 7, championId: 0, assignedPosition: 'middle' },
        { team: 2, cellId: 8, championId: 0, assignedPosition: 'bottom' },
        { team: 2, cellId: 9, championId: 0, assignedPosition: 'utility' }
      ],
      bans: { myTeamBans: [], theirTeamBans: [], numBans: 10 },
      actions: [
        [
          {
            type: 'ban',
            actorCellId: 0,
            championId: 0,
            championPickIntent: 157,
            completed: false,
            pickTurn: 1
          }
        ]
      ]
    }
    const snap = parseLcuChampSelectSession(raw)
    expect(snap?.bans).toContain(157)
  })

  it('parses bans when session uses a flat champion id array', () => {
    const raw = {
      localPlayerCellId: 0,
      myTeam: [
        { team: 1, cellId: 0, championId: 0, assignedPosition: 'jungle' },
        { team: 1, cellId: 1, championId: 0, assignedPosition: 'top' },
        { team: 1, cellId: 2, championId: 0, assignedPosition: 'middle' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: 'bottom' },
        { team: 1, cellId: 4, championId: 0, assignedPosition: 'utility' }
      ],
      theirTeam: [
        { team: 2, cellId: 5, championId: 0, assignedPosition: 'top' },
        { team: 2, cellId: 6, championId: 0, assignedPosition: 'jungle' },
        { team: 2, cellId: 7, championId: 0, assignedPosition: 'middle' },
        { team: 2, cellId: 8, championId: 0, assignedPosition: 'bottom' },
        { team: 2, cellId: 9, championId: 0, assignedPosition: 'utility' }
      ],
      bans: [103, 12, 34],
      actions: []
    }
    const snap = parseLcuChampSelectSession(raw)
    expect(snap?.bans).toEqual(expect.arrayContaining([103, 12, 34]))
    expect(snap!.bans!.length).toBe(3)
  })

  it('infers local support when LCU leaves the local assigned position blank', () => {
    const raw = {
      localPlayerCellId: 4,
      myTeam: [
        { team: 1, cellId: 0, championId: 0, assignedPosition: 'top' },
        { team: 1, cellId: 1, championId: 0, assignedPosition: 'jungle' },
        { team: 1, cellId: 2, championId: 0, assignedPosition: 'middle' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: 'bottom' },
        { team: 1, cellId: 4, championId: 89, assignedPosition: '' }
      ],
      theirTeam: [],
      actions: []
    }
    const snap = parseLcuChampSelectSession(raw)
    expect(snap?.myRole).toBe('support')
  })

  it('recovers local support when LCU reports a stale duplicate jungle position', () => {
    const raw = {
      localPlayerCellId: 4,
      myTeam: [
        { team: 1, cellId: 0, championId: 0, assignedPosition: 'top' },
        { team: 1, cellId: 1, championId: 0, assignedPosition: 'jungle' },
        { team: 1, cellId: 2, championId: 0, assignedPosition: 'middle' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: 'bottom' },
        { team: 1, cellId: 4, championId: 89, assignedPosition: 'jungle' }
      ],
      theirTeam: [],
      actions: []
    }
    const snap = parseLcuChampSelectSession(raw)
    expect(snap?.myRole).toBe('support')
  })

  it('can infer the local role from a locked support champion when positions are unavailable', () => {
    const raw = {
      localPlayerCellId: 0,
      myTeam: [
        { team: 1, cellId: 0, championId: 89, assignedPosition: '' },
        { team: 1, cellId: 1, championId: 0, assignedPosition: '' },
        { team: 1, cellId: 2, championId: 0, assignedPosition: '' },
        { team: 1, cellId: 3, championId: 0, assignedPosition: '' },
        { team: 1, cellId: 4, championId: 0, assignedPosition: '' }
      ],
      theirTeam: [],
      actions: []
    }
    const snap = parseLcuChampSelectSession(raw)
    expect(snap?.myRole).toBe('support')
  })
})
