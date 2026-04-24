import { describe, expect, it } from 'vitest'
import { effectiveHpVsPhysical } from './limitTest'

describe('effectiveHpVsPhysical', () => {
  it('increases with armor', () => {
    const base = 1000
    const a0 = effectiveHpVsPhysical(base, 0)
    const a100 = effectiveHpVsPhysical(base, 100)
    expect(a100).toBeGreaterThan(a0)
  })
  it('0 armor equals HP', () => {
    expect(effectiveHpVsPhysical(1000, 0)).toBe(1000)
  })
})
