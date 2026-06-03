export type EffectQualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'reduced'

export type NexusEffectEvent =
  | 'hero:settle'
  | 'button:hover'
  | 'button:press'
  | 'matrix:open'
  | 'matrix:scroll-start'
  | 'matrix:scroll-end'

export type NexusEffectsConfig = {
  surface: 'hero' | 'matrix' | 'overlay'
  quality?: EffectQualityTier
  interactive?: boolean
}

export type NexusEffectPayload = {
  x?: number
  y?: number
  rect?: { left: number; top: number; width: number; height: number }
  target?: string
  championId?: number | null
}

export type NexusQualitySettings = {
  capacity: number
  ambientPerSecond: number
  maxDpr: number
  updateEvery: number
}

const QUALITY_ORDER: EffectQualityTier[] = ['reduced', 'low', 'medium', 'high', 'ultra']
const KNOWN_EVENTS: ReadonlySet<string> = new Set<NexusEffectEvent>([
  'hero:settle',
  'button:hover',
  'button:press',
  'matrix:open',
  'matrix:scroll-start',
  'matrix:scroll-end'
])

export const NEXUS_QUALITY_SETTINGS: Record<EffectQualityTier, NexusQualitySettings> = {
  ultra: { capacity: 1800, ambientPerSecond: 34, maxDpr: 1.75, updateEvery: 1 },
  high: { capacity: 1200, ambientPerSecond: 22, maxDpr: 1.5, updateEvery: 1 },
  medium: { capacity: 720, ambientPerSecond: 13, maxDpr: 1.25, updateEvery: 1 },
  low: { capacity: 360, ambientPerSecond: 7, maxDpr: 1.1, updateEvery: 2 },
  reduced: { capacity: 0, ambientPerSecond: 0, maxDpr: 1, updateEvery: 4 }
}

export function qualitySettingsForTier(tier: EffectQualityTier): NexusQualitySettings {
  return NEXUS_QUALITY_SETTINGS[tier]
}

export function resolveInitialEffectQuality(
  config: NexusEffectsConfig,
  prefersReducedMotion: boolean
): EffectQualityTier {
  if (prefersReducedMotion) {
    return 'reduced'
  }
  if (config.quality) {
    return config.quality
  }
  return config.surface === 'overlay' ? 'low' : 'high'
}

function tierIndex(tier: EffectQualityTier): number {
  return QUALITY_ORDER.indexOf(tier)
}

function clampTierIndex(index: number): number {
  return Math.max(0, Math.min(QUALITY_ORDER.length - 1, index))
}

export class NexusQualityController {
  private tierValue: EffectQualityTier
  private readonly baselineTier: EffectQualityTier
  private readonly lockedReduced: boolean
  private readonly samples = new Float32Array(30)
  private sampleIndex = 0
  private sampleCount = 0
  private restoreStreak = 0
  private cooldown = 0

  constructor(initialTier: EffectQualityTier) {
    this.tierValue = initialTier
    this.baselineTier = initialTier
    this.lockedReduced = initialTier === 'reduced'
  }

  get tier(): EffectQualityTier {
    return this.tierValue
  }

  get averageFrameMs(): number {
    if (this.sampleCount === 0) {
      return 0
    }
    let total = 0
    for (let index = 0; index < this.sampleCount; index += 1) {
      total += this.samples[index] ?? 0
    }
    return total / this.sampleCount
  }

  sampleFrame(frameMs: number): EffectQualityTier {
    if (this.lockedReduced) {
      return this.tierValue
    }
    this.samples[this.sampleIndex] = Math.max(0, frameMs)
    this.sampleIndex = (this.sampleIndex + 1) % this.samples.length
    this.sampleCount = Math.min(this.sampleCount + 1, this.samples.length)
    if (this.cooldown > 0) {
      this.cooldown -= 1
      return this.tierValue
    }

    const average = this.averageFrameMs
    if (this.sampleCount >= 8 && average > 18) {
      this.lowerTier()
      this.restoreStreak = 0
      this.cooldown = 18
      return this.tierValue
    }

    if (this.sampleCount >= 12 && average < 12 && tierIndex(this.tierValue) < tierIndex(this.baselineTier)) {
      this.restoreStreak += 1
      if (this.restoreStreak >= 36) {
        this.raiseTier()
        this.restoreStreak = 0
        this.cooldown = 16
      }
    } else {
      this.restoreStreak = 0
    }

    return this.tierValue
  }

  private lowerTier(): void {
    this.tierValue = QUALITY_ORDER[clampTierIndex(tierIndex(this.tierValue) - 1)] ?? this.tierValue
  }

  private raiseTier(): void {
    const nextIndex = Math.min(tierIndex(this.baselineTier), tierIndex(this.tierValue) + 1)
    this.tierValue = QUALITY_ORDER[clampTierIndex(nextIndex)] ?? this.tierValue
  }
}

export type ParticleEmitOptions = {
  x: number
  y: number
  count: number
  spread: number
  speed: number
  life: number
  size: number
  alpha?: number
  kind?: number
}

export class NexusParticlePool {
  readonly capacity: number
  readonly x: Float32Array
  readonly y: Float32Array
  readonly vx: Float32Array
  readonly vy: Float32Array
  readonly life: Float32Array
  readonly maxLife: Float32Array
  readonly size: Float32Array
  readonly alpha: Float32Array
  readonly kind: Uint8Array
  private readonly active: Uint8Array
  private cursor = 0

  constructor(capacity: number) {
    this.capacity = Math.max(0, Math.floor(capacity))
    this.x = new Float32Array(this.capacity)
    this.y = new Float32Array(this.capacity)
    this.vx = new Float32Array(this.capacity)
    this.vy = new Float32Array(this.capacity)
    this.life = new Float32Array(this.capacity)
    this.maxLife = new Float32Array(this.capacity)
    this.size = new Float32Array(this.capacity)
    this.alpha = new Float32Array(this.capacity)
    this.kind = new Uint8Array(this.capacity)
    this.active = new Uint8Array(this.capacity)
  }

  get activeCount(): number {
    let count = 0
    for (let index = 0; index < this.capacity; index += 1) {
      count += this.active[index] ?? 0
    }
    return count
  }

  activeIndices(): number[] {
    const indices: number[] = []
    for (let index = 0; index < this.capacity; index += 1) {
      if (this.active[index]) {
        indices.push(index)
      }
    }
    return indices
  }

  emit(options: ParticleEmitOptions): number {
    if (this.capacity <= 0 || options.count <= 0) {
      return 0
    }
    let emitted = 0
    const count = Math.floor(options.count)
    for (let n = 0; n < count; n += 1) {
      const slot = this.nextSlot()
      if (slot < 0) {
        break
      }
      const angle = Math.random() * Math.PI * 2
      const radius = Math.random() * options.spread
      const speed = options.speed * (0.35 + Math.random() * 0.65)
      this.active[slot] = 1
      this.x[slot] = options.x + Math.cos(angle) * radius
      this.y[slot] = options.y + Math.sin(angle) * radius
      this.vx[slot] = Math.cos(angle) * speed
      this.vy[slot] = Math.sin(angle) * speed
      this.life[slot] = Math.max(0.05, options.life * (0.72 + Math.random() * 0.42))
      this.maxLife[slot] = this.life[slot]
      this.size[slot] = Math.max(0.5, options.size * (0.65 + Math.random() * 0.8))
      this.alpha[slot] = options.alpha ?? 1
      this.kind[slot] = options.kind ?? 0
      emitted += 1
    }
    return emitted
  }

  update(dtSeconds: number, width: number, height: number): void {
    if (this.capacity <= 0) {
      return
    }
    const dt = Math.max(0, Math.min(dtSeconds, 0.08))
    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) {
        continue
      }
      this.life[index] -= dt
      if (this.life[index] <= 0) {
        this.active[index] = 0
        continue
      }
      this.vx[index] *= 0.988
      this.vy[index] = this.vy[index] * 0.988 - 2.8 * dt
      this.x[index] += this.vx[index] * dt
      this.y[index] += this.vy[index] * dt
      if (this.x[index] < -48 || this.x[index] > width + 48 || this.y[index] < -48 || this.y[index] > height + 48) {
        this.active[index] = 0
      }
    }
  }

  isActive(index: number): boolean {
    return Boolean(this.active[index])
  }

  clear(): void {
    this.active.fill(0)
  }

  private nextSlot(): number {
    for (let attempt = 0; attempt < this.capacity; attempt += 1) {
      const index = (this.cursor + attempt) % this.capacity
      if (!this.active[index]) {
        this.cursor = (index + 1) % this.capacity
        return index
      }
    }
    return -1
  }
}

export function allowsContinuousParticles(tier: EffectQualityTier): boolean {
  return tier !== 'reduced' && qualitySettingsForTier(tier).capacity > 0
}

type NexusEffectListener = (event: NexusEffectEvent, payload?: NexusEffectPayload) => void
const listeners = new Set<NexusEffectListener>()

export function emitNexusEffect(event: NexusEffectEvent | string, payload?: NexusEffectPayload): void {
  if (!KNOWN_EVENTS.has(event)) {
    return
  }
  listeners.forEach((listener) => {
    listener(event as NexusEffectEvent, payload)
  })
}

export function subscribeNexusEffects(listener: NexusEffectListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useNexusEffects(): { emit: typeof emitNexusEffect } {
  return { emit: emitNexusEffect }
}
