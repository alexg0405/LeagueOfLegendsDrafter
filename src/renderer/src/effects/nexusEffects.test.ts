import { describe, expect, it, vi } from 'vitest'
import {
  NexusParticlePool,
  NexusQualityController,
  allowsContinuousParticles,
  emitNexusEffect,
  resolveInitialEffectQuality,
  subscribeNexusEffects
} from './nexusEffects'

describe('Nexus visual effects engine', () => {
  it('lowers and restores quality from frame-time samples', () => {
    const controller = new NexusQualityController('high')

    for (let index = 0; index < 12; index += 1) {
      controller.sampleFrame(24)
    }
    expect(controller.tier).toBe('medium')

    for (let index = 0; index < 80; index += 1) {
      controller.sampleFrame(8)
    }
    expect(controller.tier).toBe('high')
  })

  it('reuses typed-array particle slots without growing past capacity', () => {
    const pool = new NexusParticlePool(3)

    expect(pool.emit({ x: 10, y: 10, count: 6, spread: 0, speed: 0, life: 0.1, size: 2 })).toBe(3)
    expect(pool.activeCount).toBe(3)
    expect(pool.activeIndices()).toEqual([0, 1, 2])

    for (let index = 0; index < 3; index += 1) {
      pool.update(0.08, 100, 100)
    }
    expect(pool.activeCount).toBe(0)

    expect(pool.emit({ x: 20, y: 20, count: 2, spread: 0, speed: 0, life: 1, size: 2 })).toBe(2)
    expect(pool.capacity).toBe(3)
    expect(pool.activeIndices().every((index) => index >= 0 && index < 3)).toBe(true)
  })

  it('uses reduced-motion quality to disable continuous particles', () => {
    expect(resolveInitialEffectQuality({ surface: 'hero' }, true)).toBe('reduced')
    expect(allowsContinuousParticles('reduced')).toBe(false)
    expect(allowsContinuousParticles('low')).toBe(true)
  })

  it('ignores unknown events safely', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeNexusEffects(listener)

    expect(() => emitNexusEffect('unknown:event')).not.toThrow()
    expect(listener).not.toHaveBeenCalled()

    emitNexusEffect('matrix:open')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
  })
})
