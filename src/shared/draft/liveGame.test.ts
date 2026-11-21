import { describe, expect, it } from 'vitest'
import {
  championKeyFromRawName,
  formatGameClock,
  isLiveGameStatus,
  liveGamePositionToRole,
  liveGameStatusSignature,
  parseLiveClientAllGameData
} from './liveGame'

/** Trimmed `/liveclientdata/allgamedata` in the shape Riot documents. */
function sampleAllGameData() {
  return {
    activePlayer: {
      currentGold: 1312.6,
      level: 9,
      riotId: 'Tester#NA1',
      riotIdGameName: 'Tester',
      riotIdTagLine: 'NA1',
      summonerName: 'Tester#NA1',
      championStats: { armor: 61.2, magicResist: 44.5, attackDamage: 70, abilityPower: 180.4, maxHealth: 1450 }
    },
    allPlayers: [
      {
        championName: 'Ahri',
        rawChampionName: 'game_character_displayname_Ahri',
        riotId: 'Tester#NA1',
        summonerName: 'Tester#NA1',
        team: 'ORDER',
        position: 'MIDDLE',
        level: 9,
        isBot: false,
        isDead: false,
        respawnTimer: 0,
        scores: { kills: 3, deaths: 1, assists: 2, creepScore: 98, wardScore: 6.3 },
        items: [
          { itemID: 3118, displayName: 'Malignance', count: 1, slot: 1 },
          { itemID: 1056, displayName: "Doran's Ring", count: 1, slot: 0 },
          { itemID: 2003, displayName: 'Health Potion', count: 2, slot: 2 }
        ],
        runes: { keystone: { displayName: 'Electrocute', id: 8112 } },
        summonerSpells: { summonerSpellOne: { displayName: 'Flash' }, summonerSpellTwo: { displayName: 'Ignite' } }
      },
      {
        championName: 'Wukong',
        rawChampionName: 'game_character_displayname_MonkeyKing',
        riotId: 'Enemy#EUW',
        summonerName: 'Enemy#EUW',
        team: 'CHAOS',
        position: 'JUNGLE',
        level: 10,
        scores: { kills: 5, deaths: 0, assists: 1, creepScore: 80, wardScore: 2 },
        items: [{ itemID: 3071, displayName: 'Black Cleaver', count: 1, slot: 0 }]
      },
      {
        championName: 'Lulu',
        rawChampionName: 'game_character_displayname_Lulu',
        riotId: 'Ally#NA1',
        team: 'ORDER',
        position: 'UTILITY',
        level: 7,
        scores: {},
        items: []
      },
      { championName: 'Broken', team: 'NEITHER', items: [] }
    ],
    events: { Events: [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }] },
    gameData: { gameMode: 'CLASSIC', gameTime: 754.9, mapName: 'Map11', mapNumber: 11, mapTerrain: 'Default' }
  }
}

describe('Live Client Data parsing', () => {
  it('maps the scoreboard into a bounded snapshot and finds the local player', () => {
    const snap = parseLiveClientAllGameData(sampleAllGameData())
    expect(snap).not.toBeNull()
    expect(snap!.gameTime).toBe(755)
    expect(snap!.gameMode).toBe('CLASSIC')
    expect(snap!.mapNumber).toBe(11)
    expect(snap!.hasActivePlayer).toBe(true)
    expect(snap!.activeTeam).toBe('ORDER')
    expect(snap!.activeGold).toBe(1312)
    expect(snap!.activeStats?.abilityPower).toBeCloseTo(180.4)
    expect(snap!.players).toHaveLength(3)

    const me = snap!.players.find((p) => p.isActive)!
    expect(me.championKey).toBe('Ahri')
    expect(me.role).toBe('middle')
    expect(me.items.map((i) => i.itemId)).toEqual([1056, 3118, 2003])
    expect(me.items[2]!.count).toBe(2)
    expect(me.keystone).toBe('Electrocute')
    expect(me.summonerSpells).toEqual(['Flash', 'Ignite'])

    const wukong = snap!.players.find((p) => p.championName === 'Wukong')!
    expect(wukong.championKey).toBe('MonkeyKing')
    expect(wukong.isActive).toBe(false)
    expect(wukong.kills).toBe(5)
    expect(snap!.players.find((p) => p.championName === 'Lulu')!.role).toBe('support')
  })

  it('never carries summoner names or Riot IDs', () => {
    const text = JSON.stringify(parseLiveClientAllGameData(sampleAllGameData()))
    expect(text).not.toContain('Tester')
    expect(text).not.toContain('Enemy#EUW')
  })

  it('handles spectator mode and empty payloads', () => {
    const spectator = { ...sampleAllGameData(), activePlayer: { error: 'Spectator mode doesn\'t currently support this feature' } }
    const snap = parseLiveClientAllGameData(spectator)
    expect(snap?.hasActivePlayer).toBe(false)
    expect(snap?.activeGold).toBeNull()
    expect(snap?.players.every((p) => !p.isActive)).toBe(true)
    expect(parseLiveClientAllGameData({ allPlayers: [] })).toBeNull()
    expect(parseLiveClientAllGameData('nope')).toBeNull()
  })

  it('maps positions and raw champion names', () => {
    expect(liveGamePositionToRole('UTILITY')).toBe('support')
    expect(liveGamePositionToRole('BOTTOM')).toBe('bottom')
    expect(liveGamePositionToRole('')).toBe('unknown')
    expect(championKeyFromRawName('game_character_displayname_Kaisa')).toBe('Kaisa')
    expect(championKeyFromRawName('Kaisa')).toBeNull()
    expect(formatGameClock(754.9)).toBe('12:34')
  })

  it('validates IPC payloads and fingerprints only meaningful changes', () => {
    const snapshot = parseLiveClientAllGameData(sampleAllGameData())!
    const status = { state: 'in-game' as const, snapshot, error: null, checkedAt: new Date().toISOString() }
    expect(isLiveGameStatus(status)).toBe(true)
    expect(isLiveGameStatus({ state: 'party', snapshot: null, checkedAt: 'x' })).toBe(false)
    expect(isLiveGameStatus({ state: 'in-game', snapshot: { players: 'x' }, checkedAt: 'x' })).toBe(false)

    const a = liveGameStatusSignature(status)
    const tick = liveGameStatusSignature({ ...status, snapshot: { ...snapshot, activeGold: (snapshot.activeGold ?? 0) + 3 } })
    const bought = liveGameStatusSignature({
      ...status,
      snapshot: { ...snapshot, players: snapshot.players.map((p) => (p.isActive ? { ...p, items: p.items.slice(1) } : p)) }
    })
    expect(tick).toBe(a)
    expect(bought).not.toBe(a)
  })
})
