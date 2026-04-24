import { describe, expect, it } from 'vitest'
import { shrunkWinRate, winRateToBonus } from './shrinkage'

describe('shrunkWinRate', () => {
  it('returns prior when no games', () => {
    expect(shrunkWinRate(0, 0, { k: 10, prior: 0.52 })).toBe(0.52)
  })
  it('shrinks extreme small samples toward prior', () => {
    const p = shrunkWinRate(3, 0, { k: 20, prior: 0.5 })
    expect(p).toBeGreaterThan(0.5)
    expect(p).toBeLessThan(1)
  })
})

describe('winRateToBonus', () => {
  it('centers at 0 at 50%', () => {
    expect(winRateToBonus(0.5)).toBe(0)
  })
})
