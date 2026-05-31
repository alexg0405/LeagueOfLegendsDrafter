import { describe, expect, it } from 'vitest'
import { buildDraftItemMatrixPlansAsync } from './itemMatrixClient'

describe('buildDraftItemMatrixPlansAsync', () => {
  it('falls back to TypeScript when browser Worker is unavailable', async () => {
    const plans = await buildDraftItemMatrixPlansAsync({
      snapshot: null,
      myRole: 'bottom',
      suggestions: [],
      idToName: null
    })

    expect(plans).toEqual([])
  })
})

