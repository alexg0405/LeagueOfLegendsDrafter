import { useEffect, useRef } from 'react'
import {
  NexusParticlePool,
  NexusQualityController,
  allowsContinuousParticles,
  qualitySettingsForTier,
  resolveInitialEffectQuality,
  subscribeNexusEffects,
  type EffectQualityTier,
  type NexusEffectEvent,
  type NexusEffectPayload,
  type NexusEffectsConfig
} from './nexusEffects'

type NexusEffectsLayerProps = NexusEffectsConfig & {
  className?: string
  foreground?: boolean
}

type PointerState = {
  x: number
  y: number
  active: boolean
}

const SPRITE_SIZE = 32
const SPRITE_COUNT = 3

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function createSpriteAtlas(): HTMLCanvasElement {
  const atlas = document.createElement('canvas')
  atlas.width = SPRITE_SIZE * SPRITE_COUNT
  atlas.height = SPRITE_SIZE
  const ctx = atlas.getContext('2d')
  if (!ctx) {
    return atlas
  }

  const colors = [
    ['rgba(232,243,238,0.95)', 'rgba(29,212,168,0)'],
    ['rgba(29,212,168,0.9)', 'rgba(29,212,168,0)'],
    ['rgba(232,154,44,0.88)', 'rgba(232,154,44,0)']
  ] as const

  colors.forEach(([inner, outer], index) => {
    const x = index * SPRITE_SIZE + SPRITE_SIZE / 2
    const y = SPRITE_SIZE / 2
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, SPRITE_SIZE / 2)
    gradient.addColorStop(0, inner)
    gradient.addColorStop(0.28, inner)
    gradient.addColorStop(1, outer)
    ctx.fillStyle = gradient
    ctx.fillRect(index * SPRITE_SIZE, 0, SPRITE_SIZE, SPRITE_SIZE)
  })

  return atlas
}

class NexusEffectScheduler {
  private readonly runtimes = new Set<NexusCanvasRuntime>()
  private raf = 0
  private lastTime = 0

  add(runtime: NexusCanvasRuntime): void {
    this.runtimes.add(runtime)
    this.request()
  }

  remove(runtime: NexusCanvasRuntime): void {
    this.runtimes.delete(runtime)
    if (this.runtimes.size === 0 && this.raf) {
      window.cancelAnimationFrame(this.raf)
      this.raf = 0
      this.lastTime = 0
    }
  }

  request(): void {
    if (!this.raf && this.runtimes.size > 0) {
      this.raf = window.requestAnimationFrame((time) => this.tick(time))
    }
  }

  private tick(time: number): void {
    this.raf = 0
    const dt = this.lastTime ? Math.min(80, time - this.lastTime) : 16.7
    this.lastTime = time
    let wantsNext = false
    this.runtimes.forEach((runtime) => {
      wantsNext = runtime.frame(time, dt) || wantsNext
    })
    if (wantsNext) {
      this.request()
    } else {
      this.lastTime = 0
    }
  }
}

const scheduler = new NexusEffectScheduler()
let sharedAtlas: HTMLCanvasElement | null = null

class NexusCanvasRuntime {
  private readonly container: HTMLElement
  private readonly background: HTMLCanvasElement
  private readonly foreground: HTMLCanvasElement | null
  private readonly backgroundCtx: CanvasRenderingContext2D
  private readonly foregroundCtx: CanvasRenderingContext2D | null
  private readonly config: Required<NexusEffectsConfig>
  private readonly quality: NexusQualityController
  private readonly pool: NexusParticlePool
  private readonly atlas: HTMLCanvasElement
  private readonly pointer: PointerState = { x: -9999, y: -9999, active: false }
  private width = 1
  private height = 1
  private visible = true
  private documentVisible = true
  private scrollFrozen = false
  private ambientCarry = 0
  private frameIndex = 0
  private started = false

  constructor(container: HTMLElement, background: HTMLCanvasElement, foreground: HTMLCanvasElement | null, config: NexusEffectsConfig) {
    const reduced = prefersReducedMotion()
    const initialTier = resolveInitialEffectQuality(config, reduced)
    const settings = qualitySettingsForTier(initialTier)
    this.container = container
    this.background = background
    this.foreground = foreground
    this.backgroundCtx = background.getContext('2d', { alpha: true }) as CanvasRenderingContext2D
    this.foregroundCtx = foreground?.getContext('2d', { alpha: true }) ?? null
    this.config = {
      surface: config.surface,
      quality: initialTier,
      interactive: Boolean(config.interactive)
    }
    this.quality = new NexusQualityController(initialTier)
    this.pool = new NexusParticlePool(settings.capacity)
    this.atlas = sharedAtlas ?? createSpriteAtlas()
    sharedAtlas = this.atlas
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    const settings = qualitySettingsForTier(this.quality.tier)
    const dpr = Math.min(window.devicePixelRatio || 1, settings.maxDpr)
    for (const canvas of [this.background, this.foreground]) {
      if (!canvas) {
        continue
      }
      canvas.width = Math.floor(this.width * dpr)
      canvas.height = Math.floor(this.height * dpr)
      const context = canvas.getContext('2d')
      context?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    this.drawStaticField()
    scheduler.request()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (visible) {
      scheduler.request()
    }
  }

  setDocumentVisible(visible: boolean): void {
    this.documentVisible = visible
    if (visible) {
      scheduler.request()
    }
  }

  handlePointerMove(event: PointerEvent): void {
    if (!this.config.interactive || this.config.surface !== 'hero') {
      return
    }
    const rect = this.container.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height
    this.pointer.active = inside
    if (!inside) {
      return
    }
    this.pointer.x = x
    this.pointer.y = y
    this.pool.emit({
      x,
      y,
      count: this.quality.tier === 'low' ? 1 : 2,
      spread: 10,
      speed: 44,
      life: 0.42,
      size: 6,
      alpha: 0.72,
      kind: 1
    })
    scheduler.request()
  }

  handlePointerLeave(): void {
    this.pointer.active = false
  }

  handleEvent(event: NexusEffectEvent, payload?: NexusEffectPayload): void {
    if (this.quality.tier === 'reduced') {
      if (event === 'hero:settle' || event === 'matrix:open') {
        this.drawStaticField()
      }
      return
    }
    if (event === 'matrix:scroll-start' && this.config.surface === 'matrix') {
      this.scrollFrozen = true
      return
    }
    if (event === 'matrix:scroll-end' && this.config.surface === 'matrix') {
      this.scrollFrozen = false
      this.emitMatrixWake()
      scheduler.request()
      return
    }
    if (!this.visible || !this.documentVisible) {
      return
    }

    if (this.config.surface === 'hero') {
      if (event === 'hero:settle') {
        this.emitHeroShimmer()
      } else if (event === 'button:hover') {
        this.emitButtonEdge(payload, 12)
      } else if (event === 'button:press') {
        this.emitButtonEdge(payload, 28)
      }
    } else if (this.config.surface === 'matrix' && event === 'matrix:open') {
      this.emitMatrixOpen()
    }
    scheduler.request()
  }

  frame(time: number, dtMs: number): boolean {
    if (!this.visible || !this.documentVisible) {
      return false
    }
    const tier = this.quality.sampleFrame(dtMs)
    const settings = qualitySettingsForTier(tier)
    this.frameIndex += 1
    if (settings.updateEvery > 1 && this.frameIndex % settings.updateEvery !== 0) {
      return this.pool.activeCount > 0 || this.shouldEmitAmbient()
    }

    const dt = dtMs / 1000
    if (!this.scrollFrozen && allowsContinuousParticles(tier)) {
      this.emitAmbient(dt, settings)
    }
    if (!this.scrollFrozen) {
      this.pool.update(dt, this.width, this.height)
    }
    this.draw(time)
    return this.pool.activeCount > 0 || this.shouldEmitAmbient()
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    scheduler.add(this)
  }

  stop(): void {
    scheduler.remove(this)
    this.pool.clear()
  }

  private shouldEmitAmbient(): boolean {
    return this.visible && this.documentVisible && !this.scrollFrozen && allowsContinuousParticles(this.quality.tier)
  }

  private emitAmbient(dt: number, settings: ReturnType<typeof qualitySettingsForTier>): void {
    if (settings.ambientPerSecond <= 0) {
      return
    }
    const surfaceScale = this.config.surface === 'matrix' ? 0.5 : this.config.surface === 'overlay' ? 0.35 : 0.7
    this.ambientCarry += dt * settings.ambientPerSecond * surfaceScale
    const count = Math.floor(this.ambientCarry)
    if (count <= 0) {
      return
    }
    this.ambientCarry -= count
    if (this.config.surface === 'matrix') {
      this.pool.emit({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        count,
        spread: 4,
        speed: 10,
        life: 1.2,
        size: 4.5,
        alpha: 0.32,
        kind: 1
      })
    } else {
      this.pool.emit({
        x: Math.random() * this.width,
        y: this.height * (0.18 + Math.random() * 0.64),
        count,
        spread: 18,
        speed: 16,
        life: 1.4,
        size: 4.8,
        alpha: 0.28,
        kind: Math.random() > 0.82 ? 0 : 1
      })
    }
  }

  private emitHeroShimmer(): void {
    const count = this.quality.tier === 'ultra' ? 90 : this.quality.tier === 'high' ? 58 : 34
    for (let band = 0; band < 4; band += 1) {
      this.pool.emit({
        x: this.width * (0.16 + band * 0.22),
        y: this.height * (0.38 + Math.random() * 0.22),
        count: Math.floor(count / 4),
        spread: this.width * 0.055,
        speed: 24,
        life: 0.9,
        size: 5,
        alpha: 0.42,
        kind: band % 2
      })
    }
  }

  private emitButtonEdge(payload: NexusEffectPayload | undefined, count: number): void {
    const local = this.localPointFromPayload(payload)
    this.pool.emit({
      x: local.x,
      y: local.y,
      count,
      spread: 16,
      speed: 84,
      life: 0.58,
      size: 5.2,
      alpha: 0.72,
      kind: 2
    })
  }

  private emitMatrixOpen(): void {
    const bursts = this.quality.tier === 'low' ? 3 : 5
    for (let index = 0; index < bursts; index += 1) {
      this.pool.emit({
        x: this.width * (0.18 + index * 0.16),
        y: this.height * 0.12,
        count: 18,
        spread: 26,
        speed: 58,
        life: 0.78,
        size: 4.8,
        alpha: 0.5,
        kind: index % 2
      })
    }
  }

  private emitMatrixWake(): void {
    this.pool.emit({
      x: this.width * 0.82,
      y: this.height * 0.16,
      count: 18,
      spread: 18,
      speed: 32,
      life: 0.52,
      size: 4,
      alpha: 0.32,
      kind: 1
    })
  }

  private localPointFromPayload(payload: NexusEffectPayload | undefined): { x: number; y: number } {
    if (payload?.x != null && payload?.y != null) {
      const rect = this.container.getBoundingClientRect()
      return {
        x: clamp(payload.x - rect.left, 0, this.width),
        y: clamp(payload.y - rect.top, 0, this.height)
      }
    }
    if (this.pointer.active) {
      return { x: this.pointer.x, y: this.pointer.y }
    }
    return { x: this.width * 0.68, y: this.height * 0.72 }
  }

  private drawStaticField(): void {
    const ctx = this.backgroundCtx
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.save()
    ctx.globalAlpha = this.config.surface === 'matrix' ? 0.18 : 0.1
    ctx.strokeStyle = 'rgba(29,212,168,0.22)'
    ctx.lineWidth = 1
    const gap = this.config.surface === 'matrix' ? 34 : 48
    for (let x = 0; x < this.width; x += gap) {
      ctx.beginPath()
      ctx.moveTo(x + 0.5, 0)
      ctx.lineTo(x + 0.5, this.height)
      ctx.stroke()
    }
    for (let y = 0; y < this.height; y += gap) {
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(this.width, y + 0.5)
      ctx.stroke()
    }
    ctx.restore()
  }

  private draw(time: number): void {
    const ctx = this.backgroundCtx
    const fg = this.foregroundCtx
    ctx.clearRect(0, 0, this.width, this.height)
    this.drawStaticField()
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    if (this.config.surface === 'matrix') {
      const sweep = (time * 0.018) % (this.width + 220)
      const gradient = ctx.createLinearGradient(sweep - 180, 0, sweep, this.height)
      gradient.addColorStop(0, 'rgba(29,212,168,0)')
      gradient.addColorStop(0.78, 'rgba(29,212,168,0.06)')
      gradient.addColorStop(1, 'rgba(232,243,238,0.16)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, this.width, this.height)
    }
    for (let index = 0; index < this.pool.capacity; index += 1) {
      if (!this.pool.isActive(index)) {
        continue
      }
      const life = this.pool.life[index] ?? 0
      const maxLife = this.pool.maxLife[index] || 1
      const alpha = (this.pool.alpha[index] ?? 1) * clamp(life / maxLife, 0, 1)
      const size = this.pool.size[index] ?? 4
      const kind = this.pool.kind[index] ?? 0
      const sx = (kind % SPRITE_COUNT) * SPRITE_SIZE
      ctx.globalAlpha = alpha
      ctx.drawImage(
        this.atlas,
        sx,
        0,
        SPRITE_SIZE,
        SPRITE_SIZE,
        (this.pool.x[index] ?? 0) - size,
        (this.pool.y[index] ?? 0) - size,
        size * 2,
        size * 2
      )
    }
    ctx.restore()
    if (fg) {
      fg.clearRect(0, 0, this.width, this.height)
    }
  }
}

export function NexusEffectsLayer({
  surface,
  quality,
  interactive = false,
  foreground = false,
  className = ''
}: NexusEffectsLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const backgroundRef = useRef<HTMLCanvasElement | null>(null)
  const foregroundRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const background = backgroundRef.current
    if (!container || !background) {
      return
    }
    const runtime = new NexusCanvasRuntime(container, background, foregroundRef.current, {
      surface,
      quality,
      interactive
    })
    runtime.resize()
    runtime.start()

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => runtime.resize())
    resizeObserver?.observe(container)

    const intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            runtime.setVisible(entries[0]?.isIntersecting ?? true)
          })
    intersectionObserver?.observe(container)

    const handleVisibility = () => runtime.setDocumentVisible(document.visibilityState === 'visible')
    const handlePointerMove = (event: PointerEvent) => runtime.handlePointerMove(event)
    const handlePointerLeave = () => runtime.handlePointerLeave()
    const unsubscribe = subscribeNexusEffects((event, payload) => runtime.handleEvent(event, payload))

    document.addEventListener('visibilitychange', handleVisibility)
    if (interactive) {
      window.addEventListener('pointermove', handlePointerMove, { passive: true })
      window.addEventListener('pointerleave', handlePointerLeave)
    }

    return () => {
      runtime.stop()
      resizeObserver?.disconnect()
      intersectionObserver?.disconnect()
      unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      if (interactive) {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerleave', handlePointerLeave)
      }
    }
  }, [foreground, interactive, quality, surface])

  return (
    <div ref={containerRef} className={`nexus-effects-layer pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <canvas ref={backgroundRef} className="nexus-effects-canvas absolute inset-0 h-full w-full" />
      {foreground ? <canvas ref={foregroundRef} className="nexus-effects-canvas absolute inset-0 h-full w-full" /> : null}
    </div>
  )
}
