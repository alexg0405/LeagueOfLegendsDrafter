import { describe, expect, it } from 'vitest'
import publicMetaStatsSeed from '../data/publicMetaStatsSeed.json'
import championSearchIndex from '../data/championSearchIndex.json'
import {
  publicMetaBaseRate,
  publicMetaBaseStatsForChampion,
  publicMetaCandidateIdsForRole,
  publicMetaLaneRate,
  publicMetaRoleDistributionForChampion
} from './metaStats'

describe('public meta stats seed', () => {
  it('uses current public base win rates normalized by source average and sample size', () => {
    const expectedSource = `mobalytics-emerald-plus-${publicMetaStatsSeed.patch}`
    expect(publicMetaStatsSeed.patch).toMatch(/^\d+\.\d+$/)
    expect(publicMetaStatsSeed.rankFilter).toBe('emerald_plus')
    expect(publicMetaStatsSeed.roleBase.every((row) => row.source === expectedSource)).toBe(true)
    expect(publicMetaStatsSeed.roleBase.every((row) => row.games > 0)).toBe(true)
    expect(publicMetaStatsSeed.roleBase.every((row) => row.sourceAvgWinRate > 0.45 && row.sourceAvgWinRate < 0.55)).toBe(true)
    expect(publicMetaBaseRate('middle', 38)).toBeGreaterThan(0.38)
    expect(publicMetaBaseRate('middle', 38)).toBeLessThan(0.62)
  })

  it('covers every bundled champion with at least one public role row', () => {
    const ids = new Set(publicMetaStatsSeed.roleBase.map((row) => row.championId))
    expect(ids.size).toBe(championSearchIndex.champions.length)
    expect(championSearchIndex.champions.every((champion) => ids.has(champion.id))).toBe(true)
    expect(publicMetaCandidateIdsForRole('middle')).toContain(38)
    expect(publicMetaCandidateIdsForRole('support')).toContain(267)
    expect(publicMetaCandidateIdsForRole('top')).not.toContain(157)
    expect(publicMetaCandidateIdsForRole('bottom')).not.toContain(157)
  })

  it('derives role distributions from all role rows, including non-candidate off-meta rows', () => {
    const vayneRows = publicMetaBaseStatsForChampion(67)
    expect(vayneRows.some((row) => row.role === 'top' && row.candidate === false)).toBe(true)
    expect(vayneRows.some((row) => row.role === 'bottom' && row.candidate === true)).toBe(true)

    const dist = publicMetaRoleDistributionForChampion(67)
    const total = dist.top + dist.jungle + dist.middle + dist.bottom + dist.support
    expect(total).toBeCloseTo(1, 5)
    expect(dist.top).toBeGreaterThan(0)
    expect(dist.bottom).toBeGreaterThan(dist.top)
  })

  it('exposes matchup overview rows from the current public source', () => {
    expect(publicMetaStatsSeed.counters.length).toBeGreaterThan(1000)
    expect(publicMetaStatsSeed.counters.every((row) => row.source === `mobalytics-emerald-plus-${publicMetaStatsSeed.patch}`)).toBe(true)
    const sample = publicMetaStatsSeed.counters[0]!
    expect(publicMetaLaneRate(sample.role as Parameters<typeof publicMetaLaneRate>[0], sample.candidateId, sample.enemyId)).not.toBeNull()
  })
})
