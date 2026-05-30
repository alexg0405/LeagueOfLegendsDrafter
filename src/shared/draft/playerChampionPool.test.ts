import { describe, expect, it } from 'vitest'
import {
  buildPlayerChampionPoolProfile,
  championIdsForMyPool,
  importedProfileToPreferences,
  isFreshPlayerChampionPoolProfile,
  masteryRankToPreference,
  mergeChampionPoolPreferences,
  normalizeChampionMasteryRows,
  normalizeRiotPlatform,
  parseRiotId,
  riotPlatformToRegion,
  validatePlayerChampionPoolProfile
} from './playerChampionPool'

describe('playerChampionPool', () => {
  it('parses Riot IDs and platform routing', () => {
    expect(parseRiotId('Nexus Player#NA1')).toEqual({ gameName: 'Nexus Player', tagLine: 'NA1' })
    expect(parseRiotId('missing-tag')).toBeNull()
    expect(normalizeRiotPlatform('NA1')).toBe('na1')
    expect(normalizeRiotPlatform('OCE1')).toBe('oc1')
    expect(riotPlatformToRegion('na1')).toBe('americas')
    expect(riotPlatformToRegion('euw1')).toBe('europe')
    expect(riotPlatformToRegion('kr')).toBe('asia')
    expect(riotPlatformToRegion('sg2')).toBe('sea')
  })

  it('maps mastery rank to pool preference', () => {
    expect(masteryRankToPreference(1)).toBe('main')
    expect(masteryRankToPreference(5)).toBe('main')
    expect(masteryRankToPreference(6)).toBe('comfortable')
    expect(masteryRankToPreference(15)).toBe('comfortable')
    expect(masteryRankToPreference(16)).toBe('learning')
  })

  it('normalizes mastery rows and validates persisted profiles', () => {
    const entries = normalizeChampionMasteryRows(
      [
        { championId: 103, championLevel: 7, championPoints: 123456, puuid: 'secret' },
        { championId: '86', championLevel: '6', championPoints: '90000' },
        { championId: 0, championLevel: 5, championPoints: 1 }
      ],
      20
    )
    expect(entries).toEqual([
      { championId: 103, championLevel: 7, championPoints: 123456, rank: 1, preference: 'main' },
      { championId: 86, championLevel: 6, championPoints: 90000, rank: 2, preference: 'main' }
    ])

    const profile = buildPlayerChampionPoolProfile({
      riotId: { gameName: 'Nexus Player', tagLine: 'NA1' },
      platform: 'na1',
      entries,
      fetchedAt: '2026-05-08T00:00:00.000Z'
    })
    expect(validatePlayerChampionPoolProfile(profile)).toEqual(profile)
    expect(isFreshPlayerChampionPoolProfile(profile, Date.parse('2026-05-08T05:00:00.000Z'))).toBe(true)
    expect(isFreshPlayerChampionPoolProfile(profile, Date.parse('2026-05-08T07:00:00.000Z'))).toBe(false)
  })

  it('lets manual preferences override imported preferences and excludes Avoid from My Champs', () => {
    const profile = buildPlayerChampionPoolProfile({
      riotId: { gameName: 'Nexus Player', tagLine: 'NA1' },
      platform: 'na1',
      entries: [
        { championId: 103, championLevel: 7, championPoints: 100, rank: 1, preference: 'main' },
        { championId: 86, championLevel: 5, championPoints: 50, rank: 2, preference: 'main' }
      ],
      fetchedAt: '2026-05-08T00:00:00.000Z'
    })
    const merged = mergeChampionPoolPreferences(importedProfileToPreferences(profile), {
      '86': 'never',
      '222': 'comfortable'
    })
    expect(merged['86']).toBe('never')
    expect(championIdsForMyPool(merged).sort((a, b) => a - b)).toEqual([103, 222])
  })
})
