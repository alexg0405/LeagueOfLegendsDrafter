import { describe, expect, it } from 'vitest'
import { isDraftUpdate } from './draft/validate'
import { isCoachingUpdate } from './coaching'

describe('isDraftUpdate', () => {
  it('accepts a valid payload', () => {
    const p = {
      source: 'none' as const,
      lcuConnected: false,
      snapshot: null,
      suggestions: [
        { championId: 103, championName: 'Ahri', score: 1.2, reasons: ['fill_role' as const, 'meta_safe' as const] }
      ],
      geminiNarration: null,
      dataDragonVersion: '15.1.1',
      patchLabel: 'heuristic-v1',
      error: null,
      updatedAt: new Date().toISOString(),
      suggestionMyRole: 'middle'
    }
    expect(isDraftUpdate(p)).toBe(true)
  })
  it('rejects bad shapes', () => {
    expect(isDraftUpdate(null)).toBe(false)
    expect(isDraftUpdate({})).toBe(false)
  })
})

/** Legacy re-export in coaching.ts */
describe('isCoachingUpdate (alias)', () => {
  it('matches isDraftUpdate', () => {
    const p = {
      source: 'lcu' as const,
      lcuConnected: true,
      snapshot: null,
      suggestions: [] as const,
      geminiNarration: null,
      dataDragonVersion: null,
      patchLabel: null,
      error: null,
      updatedAt: new Date().toISOString()
    }
    expect(isCoachingUpdate(p)).toBe(true)
  })
})
