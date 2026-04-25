import { describe, expect, it } from 'vitest'
import { parseDraftVisionResponse } from './visionJson'

describe('parseDraftVisionResponse', () => {
  it('maps generic champion id labels to bundled champion names', () => {
    const raw = JSON.stringify({
      allyPicks: [],
      enemyPicks: [{ role: 'top', championName: 'Champion 54' }],
      myRole: 'jungle',
      confidence: 'medium'
    })
    const parsed = parseDraftVisionResponse(raw, new Map())
    expect(parsed?.snapshot.enemy[0]?.championId).toBe(54)
    expect(parsed?.snapshot.enemy[0]?.championName).toBe('Malphite')
  })
})
