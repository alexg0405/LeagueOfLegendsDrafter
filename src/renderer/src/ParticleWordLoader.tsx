import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { NexusEffectsLayer, emitNexusEffect } from './effects'

type Particle = {
  x: number
  y: number
  tx: number
  ty: number
  vx: number
  vy: number
  r: number
  glow: number
  tint: 0 | 1 | 2
}

type PointerState = {
  x: number
  y: number
  active: boolean
}

type ParticleWordLoaderProps = {
  label?: string
}

type ParticleWordMarkProps = {
  word?: string
  ariaLabel?: string
  className?: string
  target?: string
  maxParticles?: number
  fontScale?: number
  minFontSize?: number
  maxFontSize?: number
  interactive?: boolean
  settledOnMount?: boolean
  maxDevicePixelRatio?: number
  softGlow?: boolean
  particleRadiusScale?: number
  settleSpring?: number
  settleDamping?: number
}

type ParticleWordOptions = Required<Pick<ParticleWordMarkProps, 'word' | 'maxParticles' | 'fontScale' | 'minFontSize' | 'maxFontSize'>>
type ParticleTarget = { x: number; y: number }
type ParticleWordBounds = { left: number; top: number; width: number; height: number }

const DEFAULT_WORD = 'NexusDraft'
const DEFAULT_MAX_PARTICLES = 1100
const INTRO_TARGET = 'nexusdraft'
const INTRO_EXIT_MS = 1050
const INTRO_SETTLE_SPRING = 0.034
const INTRO_EXIT_SPRING = 0.078
const INTRO_SETTLE_DAMPING = 0.78
const INTRO_EXIT_DAMPING = 0.81
const INTRO_SWIRL_FORCE = 1.12
const WORD_TARGET_CACHE_LIMIT = 48
const TWO_PI = Math.PI * 2

const FILL_BY_TINT = ['rgba(29, 212, 168, 0.78)', 'rgba(61, 184, 160, 0.84)', 'rgba(232, 243, 238, 0.94)'] as const
const GLOW_FILL_BY_TINT = ['rgba(29, 212, 168, 0.22)', 'rgba(61, 184, 160, 0.2)', 'rgba(232, 243, 238, 0.18)'] as const

const wordTargetCache = new Map<string, ParticleTarget[]>()

export const ParticleIntroActiveContext = createContext(false)

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function particleTint(glow: number): 0 | 1 | 2 {
  if (glow > 0.8) return 2
  if (glow > 0.67) return 1
  return 0
}

function deviceParticleScale(): number {
  if (typeof navigator === 'undefined') {
    return 1
  }
  const cores = navigator.hardwareConcurrency || 4
  const memory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory!
    : 8
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  let scale = 1
  if (dpr >= 2.5) scale *= 0.55
  else if (dpr >= 2) scale *= 0.7
  else if (dpr >= 1.5) scale *= 0.85
  if (memory <= 4) scale *= 0.6
  else if (memory <= 6) scale *= 0.78
  if (cores <= 4) scale *= 0.72
  else if (cores <= 6) scale *= 0.88
  return clamp(scale, 0.35, 1)
}

function resolveParticleBudget(requested: number, width: number, height: number): number {
  const areaScale = clamp((1280 * 720) / Math.max(1, width * height), 0.45, 1.15)
  return Math.max(220, Math.floor(requested * deviceParticleScale() * areaScale))
}

function resolveMaxDpr(cap: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  // Chrome pays heavily for high-DPR canvas 2D; keep the soft glow look without 3x pixel work.
  const chromeLike = typeof navigator !== 'undefined' && /Chrome|Chromium|Edg\//.test(navigator.userAgent) && !/Brave/.test(navigator.userAgent)
  const softCap = chromeLike ? Math.min(cap, 1.25) : cap
  return Math.min(dpr, softCap)
}

function getCanvas2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', {
    alpha: true,
    desynchronized: true,
    willReadFrequently: false
  } as CanvasRenderingContext2DSettings)
}

function targetCacheNumber(value: number): number {
  return Math.max(1, Math.round(value / 4) * 4)
}

function wordTargetCacheKey(width: number, height: number, options: ParticleWordOptions, bounds?: ParticleWordBounds): string {
  const b = bounds
    ? `${targetCacheNumber(bounds.left)}:${targetCacheNumber(bounds.top)}:${targetCacheNumber(bounds.width)}:${targetCacheNumber(bounds.height)}`
    : 'full'
  return [
    options.word,
    targetCacheNumber(width),
    targetCacheNumber(height),
    options.maxParticles,
    options.fontScale,
    options.minFontSize,
    options.maxFontSize,
    b
  ].join('|')
}

function rememberWordTargets(key: string, targets: ParticleTarget[]): ParticleTarget[] {
  if (wordTargetCache.size >= WORD_TARGET_CACHE_LIMIT) {
    const firstKey = wordTargetCache.keys().next().value as string | undefined
    if (firstKey) {
      wordTargetCache.delete(firstKey)
    }
  }
  wordTargetCache.set(key, targets)
  return targets
}

function makeWordTargets(width: number, height: number, options: ParticleWordOptions, bounds?: ParticleWordBounds): ParticleTarget[] {
  const cacheKey = wordTargetCacheKey(width, height, options, bounds)
  const cached = wordTargetCache.get(cacheKey)
  if (cached) {
    return cached
  }
  const scratch = document.createElement('canvas')
  scratch.width = Math.max(1, Math.floor(width))
  scratch.height = Math.max(1, Math.floor(height))
  const context = scratch.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return []
  }

  const wordWidth = Math.max(1, bounds?.width ?? width)
  const centerX = (bounds?.left ?? 0) + wordWidth / 2
  const centerY = (bounds?.top ?? 0) + Math.max(1, bounds?.height ?? height) / 2
  let fontSize = clamp(wordWidth * options.fontScale, options.minFontSize, options.maxFontSize)
  context.clearRect(0, 0, scratch.width, scratch.height)
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `900 ${fontSize}px Inter, "Segoe UI", system-ui, sans-serif`
  const maxTextWidth = wordWidth * 0.96
  const measuredWidth = context.measureText(options.word).width
  if (measuredWidth > maxTextWidth) {
    fontSize = clamp(fontSize * (maxTextWidth / measuredWidth), options.minFontSize, options.maxFontSize)
    context.font = `900 ${fontSize}px Inter, "Segoe UI", system-ui, sans-serif`
  }
  context.fillText(options.word, centerX, centerY)

  const step = clamp(Math.floor(wordWidth / 160), 4, 7)
  const image = context.getImageData(0, 0, scratch.width, scratch.height)
  const targets: ParticleTarget[] = []
  const scanLeft = bounds ? clamp(Math.floor(bounds.left), 0, scratch.width - 1) : 0
  const scanTop = bounds ? clamp(Math.floor(bounds.top), 0, scratch.height - 1) : 0
  const scanRight = bounds ? clamp(Math.ceil(bounds.left + bounds.width), scanLeft + 1, scratch.width) : scratch.width
  const scanBottom = bounds ? clamp(Math.ceil(bounds.top + bounds.height), scanTop + 1, scratch.height) : scratch.height
  for (let y = scanTop; y < scanBottom; y += step) {
    for (let x = scanLeft; x < scanRight; x += step) {
      const alpha = image.data[(y * scratch.width + x) * 4 + 3] ?? 0
      if (alpha > 80) {
        targets.push({ x, y })
      }
    }
  }

  const stride = Math.max(1, Math.ceil(targets.length / options.maxParticles))
  const sampled = targets.filter((_, index) => index % stride === 0)
  return rememberWordTargets(cacheKey, sampled.length > 0 ? sampled : [{ x: centerX, y: centerY }])
}

function makeParticles(
  width: number,
  height: number,
  previous: Particle[],
  options: ParticleWordOptions,
  settledOnMount = false,
  particleRadiusScale = 1
): Particle[] {
  const budgeted = {
    ...options,
    maxParticles: resolveParticleBudget(options.maxParticles, width, height)
  }
  const targets = makeWordTargets(width, height, budgeted)
  const centerX = width / 2
  const centerY = height / 2
  return targets.map((target, index) => {
    const old = previous[index]
    const angle = index * 2.3999632297
    const spread = 110 + (index % 17) * 5
    const glow = 0.55 + (index % 9) * 0.045
    return {
      x: settledOnMount ? target.x : old?.x ?? centerX + Math.cos(angle) * spread,
      y: settledOnMount ? target.y : old?.y ?? centerY + Math.sin(angle) * spread * 0.35,
      tx: target.x,
      ty: target.y,
      vx: settledOnMount ? 0 : old?.vx ?? 0,
      vy: settledOnMount ? 0 : old?.vy ?? 0,
      r: (1.05 + (index % 4) * 0.16) * particleRadiusScale,
      glow,
      tint: particleTint(glow)
    }
  })
}

function paintParticles(
  context: CanvasRenderingContext2D,
  particles: Particle[],
  softGlow: boolean,
  alphaScale = 1
): void {
  context.globalCompositeOperation = softGlow ? 'lighter' : 'source-over'
  // Fake soft glow with one cheap underpass instead of canvas shadowBlur (very expensive in Chrome).
  if (softGlow && alphaScale > 0.01) {
    for (let tint = 0; tint < 3; tint += 1) {
      context.beginPath()
      context.fillStyle = GLOW_FILL_BY_TINT[tint as 0 | 1 | 2]
      for (const particle of particles) {
        if (particle.tint !== tint) continue
        context.moveTo(particle.x + particle.r * 2.4, particle.y)
        context.arc(particle.x, particle.y, particle.r * 2.4, 0, TWO_PI)
      }
      context.fill()
    }
  }

  for (let tint = 0; tint < 3; tint += 1) {
    context.beginPath()
    const base = FILL_BY_TINT[tint as 0 | 1 | 2]
    context.fillStyle =
      alphaScale >= 0.999
        ? base
        : tint === 2
          ? `rgba(232, 243, 238, ${0.94 * alphaScale})`
          : tint === 1
            ? `rgba(61, 184, 160, ${0.84 * alphaScale})`
            : `rgba(29, 212, 168, ${0.78 * alphaScale})`
    for (const particle of particles) {
      if (particle.tint !== tint) continue
      context.moveTo(particle.x + particle.r, particle.y)
      context.arc(particle.x, particle.y, particle.r, 0, TWO_PI)
    }
    context.fill()
  }
  context.globalCompositeOperation = 'source-over'
}

function ParticleWordCanvas({
  word = DEFAULT_WORD,
  ariaLabel = word,
  className = '',
  target,
  maxParticles = DEFAULT_MAX_PARTICLES,
  fontScale = 0.14,
  minFontSize = 48,
  maxFontSize = 150,
  interactive = true,
  settledOnMount = false,
  maxDevicePixelRatio = 1.5,
  softGlow = true,
  particleRadiusScale = 1,
  settleSpring = 0.04,
  settleDamping = 0.78
}: ParticleWordMarkProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const introActive = useContext(ParticleIntroActiveContext)
  const suspendedForIntro = introActive && target === INTRO_TARGET
  const showEffectsLayer = interactive && Boolean(target) && !suspendedForIntro

  useEffect(() => {
    if (suspendedForIntro) {
      return
    }
    const canvas = canvasRef.current
    const context = canvas ? getCanvas2d(canvas) : null
    if (!canvas || !context) {
      return
    }

    let raf = 0
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let running = false
    let visible = true
    let documentVisible = document.visibilityState !== 'hidden'
    const pointer: PointerState = { x: -9999, y: -9999, active: false }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const options: ParticleWordOptions = { word, maxParticles, fontScale, minFontSize, maxFontSize }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const dpr = resolveMaxDpr(maxDevicePixelRatio)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      particles = makeParticles(width, height, particles, options, settledOnMount, particleRadiusScale)
    }

    const start = () => {
      if (visible && documentVisible && !running) {
        running = true
        raf = window.requestAnimationFrame(draw)
      }
    }

    const draw = () => {
      running = false
      if (!visible || !documentVisible) {
        return
      }
      context.clearRect(0, 0, width, height)
      let settled = !pointer.active
      for (const particle of particles) {
        if (!reduceMotion) {
          const toTargetX = particle.tx - particle.x
          const toTargetY = particle.ty - particle.y
          particle.vx += toTargetX * settleSpring
          particle.vy += toTargetY * settleSpring

          if (pointer.active) {
            const dx = particle.x - pointer.x
            const dy = particle.y - pointer.y
            const distanceSquared = dx * dx + dy * dy
            const radius = 118
            if (distanceSquared > 0.01 && distanceSquared < radius * radius) {
              const distance = Math.sqrt(distanceSquared)
              const push = (1 - distance / radius) * 7.8
              particle.vx += (dx / distance) * push
              particle.vy += (dy / distance) * push
            }
          }

          particle.vx *= settleDamping
          particle.vy *= settleDamping
          particle.x += particle.vx
          particle.y += particle.vy
          if (
            settled &&
            (Math.abs(toTargetX) > 0.7 ||
              Math.abs(toTargetY) > 0.7 ||
              Math.abs(particle.vx) > 0.035 ||
              Math.abs(particle.vy) > 0.035)
          ) {
            settled = false
          }
        } else {
          particle.x = particle.tx
          particle.y = particle.ty
        }
      }

      paintParticles(context, particles, softGlow)
      if (!reduceMotion && !settled) {
        start()
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
      pointer.active = true
      start()
    }
    const handlePointerLeave = () => {
      pointer.active = false
      start()
    }
    const handleVisibility = () => {
      documentVisible = document.visibilityState !== 'hidden'
      if (documentVisible) {
        start()
      } else {
        window.cancelAnimationFrame(raf)
        running = false
      }
    }

    resize()
    start()
    const observer = new ResizeObserver(() => {
      resize()
      if (reduceMotion) {
        draw()
      } else {
        start()
      }
    })
    observer.observe(canvas)
    const visibilityObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver((entries) => {
            visible = entries[0]?.isIntersecting ?? true
            if (visible) {
              start()
            } else {
              window.cancelAnimationFrame(raf)
              running = false
            }
          })
    visibilityObserver?.observe(canvas)
    document.addEventListener('visibilitychange', handleVisibility)
    if (interactive) {
      canvas.addEventListener('pointermove', handlePointerMove)
      canvas.addEventListener('pointerleave', handlePointerLeave)
    }

    return () => {
      window.cancelAnimationFrame(raf)
      running = false
      observer.disconnect()
      visibilityObserver?.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
      if (interactive) {
        canvas.removeEventListener('pointermove', handlePointerMove)
        canvas.removeEventListener('pointerleave', handlePointerLeave)
      }
    }
  }, [
    fontScale,
    interactive,
    maxDevicePixelRatio,
    maxFontSize,
    maxParticles,
    minFontSize,
    particleRadiusScale,
    settleDamping,
    settleSpring,
    settledOnMount,
    softGlow,
    word,
    suspendedForIntro
  ])

  useEffect(() => {
    if (!showEffectsLayer) {
      return
    }
    const handle = window.setTimeout(() => {
      emitNexusEffect('hero:settle', { target })
    }, settledOnMount ? 90 : 420)
    return () => window.clearTimeout(handle)
  }, [settledOnMount, showEffectsLayer, target])

  return suspendedForIntro ? (
    <span className={`relative block overflow-hidden ${className}`} aria-label={ariaLabel} data-particle-word-target={target}>
      <span className="sr-only">{ariaLabel}</span>
    </span>
  ) : (
    <span className={`relative block overflow-hidden ${className}`} aria-label={ariaLabel} data-particle-word-target={target}>
      {showEffectsLayer ? <NexusEffectsLayer surface="hero" quality="medium" interactive className="opacity-80" /> : null}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-hidden />
      <span className="sr-only">{ariaLabel}</span>
    </span>
  )
}

export function ParticleWordMark(props: ParticleWordMarkProps) {
  return <ParticleWordCanvas {...props} />
}

function findIntroTargetBounds(): ParticleWordBounds | undefined {
  const target = document.querySelector<HTMLElement>(`[data-particle-word-target="${INTRO_TARGET}"]`)
  const rect = target?.getBoundingClientRect()
  if (!rect || rect.width < 16 || rect.height < 16) {
    return undefined
  }
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

export function ParticleWordIntroOverlay({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onDoneRef = useRef(onDone)
  const exitingRef = useRef(false)
  const exitStartedRef = useRef(0)
  const completedRef = useRef(false)
  const startAnimationRef = useRef<(() => void) | null>(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas ? getCanvas2d(canvas) : null
    if (!canvas || !context) {
      return
    }

    let raf = 0
    let width = 0
    let height = 0
    let particles: Particle[] = []
    let targetCenter = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    let retargeted = false
    let running = false
    let documentVisible = document.visibilityState !== 'hidden'
    const pointer: PointerState = { x: -9999, y: -9999, active: false }
    const options: ParticleWordOptions = {
      word: DEFAULT_WORD,
      maxParticles: 1400,
      fontScale: 0.16,
      minFontSize: 54,
      maxFontSize: 170
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      const dpr = resolveMaxDpr(1.25)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!exitingRef.current) {
        particles = makeParticles(width, height, particles, options)
      }
    }

    const retargetToHero = () => {
      const fallback = {
        left: width * 0.18,
        top: height * 0.14,
        width: width * 0.42,
        height: height * 0.18
      }
      const bounds = findIntroTargetBounds() ?? fallback
      targetCenter = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      const targets = makeWordTargets(
        width,
        height,
        {
          ...options,
          maxParticles: resolveParticleBudget(options.maxParticles, width, height),
          fontScale: 0.2,
          maxFontSize: 160
        },
        bounds
      )
      particles = particles.map((particle, index) => {
        const target = targets[index % targets.length]!
        const angle = index * 0.21
        return {
          ...particle,
          tx: target.x,
          ty: target.y,
          vx: particle.vx + Math.cos(angle) * 2.1,
          vy: particle.vy + Math.sin(angle) * 2.1
        }
      })
    }

    const finish = () => {
      if (completedRef.current) {
        return
      }
      completedRef.current = true
      onDoneRef.current()
    }

    const start = () => {
      if (documentVisible && !running) {
        running = true
        raf = window.requestAnimationFrame(draw)
      }
    }
    startAnimationRef.current = start

    const draw = (time: number) => {
      running = false
      if (!documentVisible) {
        return
      }
      const isExiting = exitingRef.current
      if (isExiting && !retargeted) {
        retargeted = true
        retargetToHero()
      }

      const progress = isExiting ? clamp((time - exitStartedRef.current) / INTRO_EXIT_MS, 0, 1) : 0
      const particleAlpha = isExiting ? clamp(1 - Math.max(0, progress - 0.8) / 0.2, 0, 1) : 1

      context.clearRect(0, 0, width, height)
      let settled = !isExiting && !pointer.active
      for (const particle of particles) {
        if (!reduceMotion) {
          const toTargetX = particle.tx - particle.x
          const toTargetY = particle.ty - particle.y
          const spring = isExiting ? INTRO_EXIT_SPRING : INTRO_SETTLE_SPRING
          particle.vx += toTargetX * spring
          particle.vy += toTargetY * spring

          if (isExiting) {
            const dx = particle.x - targetCenter.x
            const dy = particle.y - targetCenter.y
            const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy))
            const swirl = (1 - progress) * INTRO_SWIRL_FORCE
            particle.vx += (-dy / distance) * swirl
            particle.vy += (dx / distance) * swirl
          } else if (pointer.active) {
            const dx = particle.x - pointer.x
            const dy = particle.y - pointer.y
            const distanceSquared = dx * dx + dy * dy
            const radius = 132
            if (distanceSquared > 0.01 && distanceSquared < radius * radius) {
              const distance = Math.sqrt(distanceSquared)
              const push = (1 - distance / radius) * 7.6
              particle.vx += (dx / distance) * push
              particle.vy += (dy / distance) * push
            }
          }

          particle.vx *= isExiting ? INTRO_EXIT_DAMPING : INTRO_SETTLE_DAMPING
          particle.vy *= isExiting ? INTRO_EXIT_DAMPING : INTRO_SETTLE_DAMPING
          particle.x += particle.vx
          particle.y += particle.vy

          if (
            settled &&
            (Math.abs(toTargetX) > 0.7 ||
              Math.abs(toTargetY) > 0.7 ||
              Math.abs(particle.vx) > 0.035 ||
              Math.abs(particle.vy) > 0.035)
          ) {
            settled = false
          }
        } else {
          particle.x = particle.tx
          particle.y = particle.ty
        }
      }

      paintParticles(context, particles, true, particleAlpha)

      if (isExiting && (progress >= 1 || reduceMotion)) {
        finish()
        return
      }
      if (!reduceMotion && !settled) {
        start()
      }
    }

    const handleVisibility = () => {
      documentVisible = document.visibilityState !== 'hidden'
      if (documentVisible) {
        start()
      } else {
        window.cancelAnimationFrame(raf)
        running = false
      }
    }

    resize()
    start()
    const observer = new ResizeObserver(() => {
      resize()
      if (reduceMotion) {
        draw(performance.now())
      } else {
        start()
      }
    })
    observer.observe(canvas)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.cancelAnimationFrame(raf)
      running = false
      startAnimationRef.current = null
      observer.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const enter = () => {
    if (exitingRef.current) {
      return
    }
    exitingRef.current = true
    exitStartedRef.current = performance.now()
    setExiting(true)
    startAnimationRef.current?.()
  }

  return (
    <div
      ref={rootRef}
      className={[
        'fixed inset-0 z-[300] h-dvh w-full overflow-hidden bg-transparent text-nexus-text outline-none',
        exiting ? 'pointer-events-none' : 'cursor-pointer'
      ].join(' ')}
      role="button"
      tabIndex={0}
      aria-label="Enter NexusDraft"
      onPointerDown={enter}
      onClick={enter}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          enter()
        }
      }}
    >
      <div className={['absolute inset-0 bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] transition-opacity duration-700', exiting ? 'opacity-0' : 'opacity-100'].join(' ')} aria-hidden />
      <div className={['nexus-noise absolute inset-0 transition-opacity duration-700', exiting ? 'opacity-0' : 'opacity-70'].join(' ')} aria-hidden />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6">
        <p className={['m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)] transition-opacity duration-300', exiting ? 'opacity-0' : 'opacity-100'].join(' ')}>
          Click to enter
        </p>
      </div>
      <span className="sr-only">Click to enter NexusDraft</span>
    </div>
  )
}

export function ParticleWordLoader({ label = 'Loading' }: ParticleWordLoaderProps) {
  return (
    <div className="fixed inset-0 h-dvh w-full overflow-hidden bg-[linear-gradient(180deg,#06100d_0%,#020706_100%)] text-nexus-text">
      <div className="nexus-noise absolute inset-0 opacity-70" aria-hidden />
      <ParticleWordCanvas
        className="absolute inset-0 h-full w-full"
        ariaLabel="NexusDraft"
        interactive={false}
        maxParticles={900}
        maxDevicePixelRatio={1.25}
        settleSpring={0.2}
        settleDamping={0.62}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-[18vh] flex justify-center px-6">
        <p className="m-0 border border-nexus-line/70 bg-nexus-bg/55 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.24em] text-nexus-muted shadow-[0_0_28px_rgba(29,212,168,0.12)]">
          {label}
        </p>
      </div>
      <span className="sr-only">{label} NexusDraft</span>
    </div>
  )
}
