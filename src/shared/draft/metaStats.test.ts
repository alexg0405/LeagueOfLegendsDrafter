import { describe, expect, it } from 'vitest'
import { publicMetaBaseRate, publicMetaCandidateIdsForRole, publicMetaLaneRate } from './metaStats'

describe('public meta stats seed', () => {
  it('normalizes public base win rates by source average and sample size', () => {
    expect(publicMetaBaseRate('bottom', 222)).toBeGreaterThan(0.515)
    expect(publicMetaBaseRate('middle', 85)).toBeLessThan(0.51)
  })

  it('adds role-specific counter picks to candidate pools', () => {
    expect(publicMetaCandidateIdsForRole('top')).toContain(77)
    expect(publicMetaCandidateIdsForRole('bottom')).toContain(50)
    expect(publicMetaCandidateIdsForRole('support')).toContain(25)
  })

  it('keeps counter matchup rates large enough to move deltas', () => {
    expect(publicMetaLaneRate('top', 77, 10)).toBeGreaterThan(0.54)
    expect(publicMetaLaneRate('bottom', 50, 222)).toBeGreaterThan(0.54)
    expect(publicMetaLaneRate('support', 25, 412)).toBeGreaterThan(0.54)
  })
})
