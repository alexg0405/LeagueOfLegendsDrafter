import { describe, expect, it } from 'vitest'
import { getMatchupMatchCounts, shrunkBaseRate, shrunkLaneRate } from './statsModel'

describe('statsModel lane matchup scaling', () => {
  it('keeps missing live base data neutral', () => {
    expect(shrunkBaseRate('middle', 38)).toBeCloseTo(0.5, 5)
  })

  it('treats explicit hard counters as large lane shifts', () => {
    const malphiteVsTrynd = shrunkLaneRate(54, 23)
    const tryndVsMalphite = shrunkLaneRate(23, 54)
    expect(malphiteVsTrynd).not.toBeNull()
    expect(tryndVsMalphite).not.toBeNull()
    expect(malphiteVsTrynd!).toBeGreaterThan(0.62)
    expect(tryndVsMalphite!).toBeLessThan(0.42)
  })

  it('produces directional matchup signal for non-explicit pairs', () => {
    const akaliVsJinx = getMatchupMatchCounts(84, 222)
    const jinxVsAkali = getMatchupMatchCounts(222, 84)
    expect(akaliVsJinx).not.toBeNull()
    expect(jinxVsAkali).not.toBeNull()
    const pAkali = shrunkLaneRate(84, 222)!
    const pJinx = shrunkLaneRate(222, 84)!
    expect(pAkali).toBeGreaterThan(0.5)
    expect(pJinx).toBeLessThan(0.5)
  })

  it('uses imported hard-counter list for curated champs', () => {
    // Ahri is countered by Yasuo in the imported list.
    const yasuoVsAhri = shrunkLaneRate(157, 103)
    const ahriVsYasuo = shrunkLaneRate(103, 157)
    expect(yasuoVsAhri).not.toBeNull()
    expect(ahriVsYasuo).not.toBeNull()
    expect(yasuoVsAhri!).toBeGreaterThan(0.6)
    expect(ahriVsYasuo!).toBeLessThan(0.45)
  })
})

