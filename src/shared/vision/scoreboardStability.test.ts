import { describe, expect, it } from 'vitest'
import { createStabilityTracker, DEFAULT_SCOREBOARD_STABLE_MS } from './scoreboardStability'

describe('createStabilityTracker', () => {
  it('reaches stable after enough visible ms', () => {
    const t = createStabilityTracker(DEFAULT_SCOREBOARD_STABLE_MS)
    let r = t.tick(true, 1000)
    expect(r.stable).toBe(false)
    r = t.tick(true, 1000)
    expect(r.stable).toBe(true)
  })
  it('resets on invisible', () => {
    const t = createStabilityTracker(500)
    t.tick(true, 400)
    const r0 = t.tick(true, 200)
    expect(r0.stable).toBe(true)
    t.reset()
    const r1 = t.tick(true, 100)
    expect(r1.stable).toBe(false)
  })
})
