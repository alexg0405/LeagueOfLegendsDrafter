import { describe, expect, it } from 'vitest'
import { suggestPicksAsync } from './recommendClient'

describe('suggestPicksAsync', () => {
  it('falls back to TypeScript when browser Worker is unavailable', async () => {
    const result = await suggestPicksAsync({
      myRole: 'bottom',
      snapshot: null,
      idToName: null
    })

    expect(result.suggestions).toEqual([])
    expect(result.patchLabel).toBe('engine-v1')
  })
})
