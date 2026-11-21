import { describe, expect, it } from 'vitest'
import { rankParityCandidates, readParityFixture } from './parityFixture'

/**
 * Parity: same candidate ordering signal as `training/parity_draft_scorers.py` (TS v1 only).
 * Uses bundled heuristics (matchupData, synergyData, statsModel), not training logit_*.json.
 * Perfect identity with Python logit is not expected — see report from `python -m training.parity_draft_scorers`.
 *
 * The bundled meta seed is refreshed daily by CI, so exact scores move every day. This pins the
 * properties that must hold for any data: every candidate ranked once, sorted, bounded, stable.
 */
describe('parityState fixture (TS v1, candidate subset)', () => {
  it('ranks every ParityStateJson candidate once, sorted, within [0, 1]', () => {
    const j = readParityFixture()
    const { rows } = rankParityCandidates(j, (id) => `id${id}`)
    const candidates = j.candidates || []
    expect(rows.length).toBe(candidates.length)
    expect(rows.map((r) => r.championId).sort((a, b) => a - b)).toEqual([...candidates].sort((a, b) => a - b))
    for (const row of rows) {
      expect(row.combined).toBeGreaterThanOrEqual(0)
      expect(row.combined).toBeLessThanOrEqual(1)
    }
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.combined).toBeGreaterThanOrEqual(rows[i]!.combined)
    }
  })

  it('is deterministic for the same fixture and data', () => {
    const j = readParityFixture()
    const first = rankParityCandidates(j, (id) => `id${id}`).rows.map((r) => [r.championId, r.combined])
    const second = rankParityCandidates(j, (id) => `id${id}`).rows.map((r) => [r.championId, r.combined])
    expect(second).toEqual(first)
  })
})
