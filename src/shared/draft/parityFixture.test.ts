import { describe, expect, it } from 'vitest'
import { rankParityCandidates, readParityFixture } from './parityFixture'

/**
 * Parity: same candidate ordering signal as `training/parity_draft_scorers.py` (TS v1 only).
 * Uses bundled heuristics (matchupData, synergyData, statsModel), not training logit_*.json.
 * Perfect identity with Python logit is not expected — see report from `python -m training.parity_draft_scorers`.
 */
describe('parityState fixture (TS v1, candidate subset)', () => {
  it('ranks ParityStateJson candidates and is stable for snapshot review', () => {
    const j = readParityFixture()
    const { rows } = rankParityCandidates(j, (id) => `id${id}`)
    expect(rows.length).toBe((j.candidates || []).length)
    expect(rows[0]!.championId).toBeDefined()
    expect(rows[0]!.combined).toBeGreaterThanOrEqual(0)
    expect(rows[0]!.combined).toBeLessThanOrEqual(1)
    expect(
      rows.map((r) => ({ i: r.championId, c: Math.round(r.combined * 1000) / 1000 }))
    ).toMatchSnapshot()
  })
})
