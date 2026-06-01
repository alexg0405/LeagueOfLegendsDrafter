import { describe, expect, it } from 'vitest'
import { buildDraftItemMatrixPlansAsync } from './itemMatrixClient'

describe('buildDraftItemMatrixPlansAsync', () => {
  it('returns a safe error result when browser Worker is unavailable', async () => {
    const result = await buildDraftItemMatrixPlansAsync({
      snapshot: null,
      myRole: 'bottom',
      suggestions: [],
      idToName: null
    })

    expect(result).toEqual({
      plans: [],
      status: 'error',
      error: 'Browser workers are unavailable.'
    })
  })
})
