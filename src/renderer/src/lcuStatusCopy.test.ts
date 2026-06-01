import { describe, expect, it } from 'vitest'
import { copyLcuStatusLine } from './lcuStatusCopy'

describe('copyLcuStatusLine', () => {
  it('distinguishes Riot-only startup from missing League entirely', () => {
    expect(
      copyLcuStatusLine(
        {
          lockfileFound: false,
          lcuReachable: false,
          snapshot: null,
          error: 'League client lockfile not found.'
        },
        {
          checkedPaths: [],
          detectedProcesses: [{ name: 'RiotClientServices.exe' }],
          selectedPath: null,
          lockfileFound: false,
          lcuReachable: false,
          error: null
        }
      )
    ).toContain('Riot Client detected')

    expect(
      copyLcuStatusLine({
        lockfileFound: false,
        lcuReachable: false,
        snapshot: null,
        error: 'League client lockfile not found.'
      })
    ).toContain('Waiting for League client')
  })

  it('distinguishes lockfile, champ-select, and live draft states', () => {
    expect(
      copyLcuStatusLine({
        lockfileFound: true,
        lcuReachable: false,
        snapshot: null,
        error: 'ECONNREFUSED'
      })
    ).toContain('lockfile found')

    expect(
      copyLcuStatusLine({
        lockfileFound: true,
        lcuReachable: true,
        snapshot: null,
        error: null
      })
    ).toContain('waiting for champ select')

    expect(
      copyLcuStatusLine({
        lockfileFound: true,
        lcuReachable: true,
        snapshot: {
          ally: [],
          enemy: [],
          myTeam: null,
          myRole: null,
          localPlayerCellId: null,
          bans: null,
          myPickOrder: null
        },
        error: null
      })
    ).toContain('draft data is live')
  })
})
