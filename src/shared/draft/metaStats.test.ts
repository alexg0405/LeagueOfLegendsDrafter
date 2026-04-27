import { describe, expect, it } from 'vitest'
import publicMetaStatsSeed from '../data/publicMetaStatsSeed.json'
import championSearchIndex from '../data/championSearchIndex.json'
import { publicMetaBaseRate, publicMetaCandidateIdsForRole, publicMetaLaneRate } from './metaStats'

describe('public meta stats seed', () => {
  it('uses Diamond+ base win rates normalized by source average and sample size', () => {
    expect(publicMetaBaseRate('bottom', 222)).toBeGreaterThan(0.515)
    expect(publicMetaBaseRate('middle', 38)).toBeGreaterThan(0.495)
    expect(publicMetaBaseRate('middle', 38)).toBeLessThan(0.505)
    expect(publicMetaStatsSeed.roleBase.every((row) => row.source === 'lolalytics-diamond-plus-16.8')).toBe(true)
  })

  it('covers every bundled champion with at least one Diamond+ role row', () => {
    const ids = new Set(publicMetaStatsSeed.roleBase.map((row) => row.championId))
    expect(ids.size).toBe(championSearchIndex.champions.length)
    expect(championSearchIndex.champions.every((champion) => ids.has(champion.id))).toBe(true)
    expect(publicMetaCandidateIdsForRole('middle')).toContain(38)
    expect(publicMetaCandidateIdsForRole('support')).toContain(267)
    expect(publicMetaCandidateIdsForRole('top')).not.toContain(157)
    expect(publicMetaCandidateIdsForRole('bottom')).not.toContain(157)
  })

  it('does not expose matchup counter rows from non-Diamond+ sources', () => {
    expect(publicMetaStatsSeed.counters).toHaveLength(0)
    expect(publicMetaLaneRate('top', 77, 10)).toBeNull()
  })
})
